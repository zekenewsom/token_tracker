// backend/src/services/solanaService.js

require('dotenv').config();
const axios = require('axios');
const prisma = require('../utils/prismaClient');

// Use separate variables from .env for clarity and correctness
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const MINT_ADDRESS = "2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump";

async function fetchAllTokenHoldersViaHeliusDAS() {
  const LIMIT = 1000;
  let cursor = null;
  const accounts = [];
  console.log(`[Helius DAS] Fetching all token accounts for mint: ${MINT_ADDRESS}`);
  do {
    const body = {
      jsonrpc: '2.0',
      id: '1',
      method: 'getTokenAccounts',
      params: { mint: MINT_ADDRESS, limit: LIMIT, ...(cursor ? { cursor } : {}) },
    };
    const response = await axios.post(HELIUS_RPC_URL, body, { headers: { 'Content-Type': 'application/json' } });
    if (response.data.error) throw new Error(`Helius RPC error: ${JSON.stringify(response.data.error)}`);
    const result = response.data.result;
    for (const acct of result.token_accounts) {
      if (acct.amount && BigInt(acct.amount) > 0n) {
        // NOTE: Adjust the decimals (10**6) if your token is different
        accounts.push({ owner: acct.owner, amount: parseInt(acct.amount, 10) / (10 ** 6) });
      }
    }
    cursor = result.cursor ?? null;
  } while (cursor);
  console.log(`[Helius DAS] Completed fetching all holders. Total accounts with balance: ${accounts.length}`);
  return accounts;
}

async function refreshDataViaRPC() {
  console.log('[LOG] Starting incremental transaction refresh using Helius REST API (per holder address)...');

  if (!HELIUS_API_KEY) {
    throw new Error("HELIUS_API_KEY is not set in the .env file. Please add it to fetch transaction history.");
  }

  const parseHeliusTransaction = (tx) => {
    const tokenTransfer = tx.tokenTransfers.find(t => t.mint === MINT_ADDRESS);
    if (!tokenTransfer) return null;
    let transactionType = tx.type;
    let solAmount = 0;

    if (tx.type === 'SWAP') {
      const userAccount = tokenTransfer.fromUserAccount || tokenTransfer.toUserAccount;
      const isSell = tx.tokenTransfers.some(t => t.fromUserAccount === userAccount && t.mint === MINT_ADDRESS);
      transactionType = isSell ? 'sell' : 'buy';
      const nativeTransfer = tx.nativeTransfers.find(n => n.fromUserAccount === userAccount || n.toUserAccount === userAccount);
      if (nativeTransfer) {
        solAmount = nativeTransfer.amount / 1_000_000_000;
      }
    } else {
      const userAccount = tokenTransfer.fromUserAccount || tokenTransfer.toUserAccount;
      const isReceiving = tokenTransfer.toUserAccount === userAccount;
      transactionType = isReceiving ? 'transfer_in' : 'transfer_out';
    }

    return {
      signature: tx.signature,
      blockTime: tx.timestamp,
      type: transactionType.toLowerCase(),
      source: tokenTransfer.fromUserAccount,
      destination: tokenTransfer.toUserAccount,
      tokenAmount: tokenTransfer.tokenAmount,
      solAmount: solAmount,
    };
  };

  // Step 1: Find the most recent transaction stored in the database
  const lastTransaction = await prisma.transaction.findFirst({
    orderBy: {
      blockTime: 'desc',
    },
  });
  const lastSignature = lastTransaction?.signature;
  console.log(`[LOG] Last known signature: ${lastSignature}`);

  // Step 2: Fetch all current token holders
  const holders = await fetchAllTokenHoldersViaHeliusDAS();
  const holderAddresses = holders.map(h => h.owner);
  console.log(`[LOG] Found ${holderAddresses.length} token holder addresses to scan for transactions.`);

  // Step 3: Fetch transactions for each holder, deduplicate, filter for mint, and stop at last known signature
  const seenSignatures = new Set();
  let newTransactions = [];
  let foundLastTx = false;

  for (const address of holderAddresses) {
    if (foundLastTx) break;
    let lastFetchedSignature;
    let hasMore = true;

    while (hasMore && !foundLastTx) {
      let url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}`;
      if (lastFetchedSignature) url += `&before=${lastFetchedSignature}`;

      try {
        const response = await axios.get(url);
        const transactions = response.data;

        if (transactions && transactions.length > 0) {
          for (const tx of transactions) {
            if (!tx.tokenTransfers?.some(t => t.mint === MINT_ADDRESS)) continue; // Filter for this mint
            if (seenSignatures.has(tx.signature)) continue; // Deduplicate
            if (tx.signature === lastSignature) {
              foundLastTx = true;
              break;
            }
            seenSignatures.add(tx.signature);
            const parsed = parseHeliusTransaction(tx);
            if (parsed) newTransactions.push(parsed);
          }
          lastFetchedSignature = transactions[transactions.length - 1].signature;
        } else {
          hasMore = false;
        }
      } catch (error) {
        console.error(`[ERROR] Could not fetch transactions for address ${address}:`, error.message);
        hasMore = false;
      }
    }
  }

  // Step 4: Insert new transactions in chronological order
  newTransactions.reverse();
  console.log(`[LOG] Finished fetching. Found ${newTransactions.length} new transactions. Updating database...`);

  for (const tx of newTransactions) {
    const sourceWallet = await prisma.wallet.upsert({ where: { address: tx.source }, update: {}, create: { address: tx.source } });
    const destinationWallet = await prisma.wallet.upsert({ where: { address: tx.destination }, update: {}, create: { address: tx.destination } });
    await prisma.transaction.create({
      data: {
        signature: tx.signature,
        blockTime: tx.blockTime,
        type: tx.type,
        tokenAmount: tx.tokenAmount,
        solAmount: tx.solAmount,
        source_wallet_id: sourceWallet.id,
        destination_wallet_id: destinationWallet.id,
      },
    });
  }
  console.log('[LOG] Incremental transaction refresh complete.');
}


async function refreshHolderData() {
  console.log('[LOG] Starting holder data refresh...');
  const holders = await fetchAllTokenHoldersViaHeliusDAS();
  
  for (const holder of holders) {
      const wallet = await prisma.wallet.upsert({ where: { address: holder.owner }, update: {}, create: { address: holder.owner } });
      await prisma.tokenHolder.upsert({
          where: { wallet_id: wallet.id },
          update: { balance: holder.amount },
          create: { wallet_id: wallet.id, balance: holder.amount },
      });
  }
  console.log(`[LOG] Successfully refreshed ${holders.length} token holder balances.`);

  console.log('[LOG] Calculating average acquisition prices...');
  const acquisitionTransactions = await prisma.transaction.findMany({
    where: {
      type: {
        in: ['buy', 'transfer_in'] // Broaden the scope of acquisition
      }
    },
    include: { destinationWallet: true },
  });

  const walletAcquisitions = {};
  for (const tx of acquisitionTransactions) {
    if (tx.destinationWallet?.address) {
      const address = tx.destinationWallet.address;
      if (!walletAcquisitions[address]) {
        walletAcquisitions[address] = { totalSol: 0, totalTokens: 0 };
      }
      // Add the SOL amount for buys, and 0 for transfer_in
      if (tx.type === 'buy') {
        walletAcquisitions[address].totalSol += tx.solAmount;
      }
      walletAcquisitions[address].totalTokens += tx.tokenAmount;
    }
  }

  const updatePromises = [];
  for (const address in walletAcquisitions) {
    const { totalSol, totalTokens } = walletAcquisitions[address];
    if (totalTokens > 0) {
      const avgPrice = totalSol / totalTokens;
      const wallet = await prisma.wallet.findUnique({ where: { address } });
      if (wallet) {
        updatePromises.push(
          prisma.tokenHolder.update({
            where: { wallet_id: wallet.id },
            data: { average_acquisition_price: avgPrice },
          })
        );
      }
    }
  }
  await Promise.all(updatePromises);
  console.log(`[LOG] Finished calculating acquisition prices for ${Object.keys(walletAcquisitions).length} wallets.`);

}

module.exports = {
  refreshDataViaRPC,
  refreshHolderData,
};