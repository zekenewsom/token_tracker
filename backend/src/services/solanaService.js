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
  console.log('[LOG] Starting full transaction history refresh using Helius REST API...');
  
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

  let allParsedTransactions = [];
  let lastSignature;
  let hasMore = true;
  while (hasMore) {
    let url = `https://api.helius.xyz/v0/tokens/${MINT_ADDRESS}/transactions?api-key=${HELIUS_API_KEY}`;
    if (lastSignature) url += `&before=${lastSignature}`;

    try {
      const response = await axios.get(url);
      const transactions = response.data;
      if (transactions && transactions.length > 0) {
        for (const tx of transactions) {
          const parsed = parseHeliusTransaction(tx);
          if (parsed) allParsedTransactions.push(parsed);
        }
        lastSignature = transactions[transactions.length - 1].signature;
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error('Fatal Error: Could not fetch token transaction history from Helius API. Please check your HELIUS_API_KEY.', error.message);
      hasMore = false;
    }
  }

  console.log(`[LOG] Finished fetching. Total parsed transactions: ${allParsedTransactions.length}. Updating database...`);
  await prisma.transaction.deleteMany({});

  for (const tx of allParsedTransactions) {
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
  console.log('[LOG] Transaction database refreshed.');
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
  const buyTransactions = await prisma.transaction.findMany({
    where: { type: 'buy' },
    include: { destinationWallet: true },
  });

  const walletBuys = {};
  for (const tx of buyTransactions) {
    if (tx.destinationWallet?.address) {
        const address = tx.destinationWallet.address;
        if (!walletBuys[address]) walletBuys[address] = { totalSol: 0, totalTokens: 0 };
        walletBuys[address].totalSol += tx.solAmount;
        walletBuys[address].totalTokens += tx.tokenAmount;
    }
  }

  const updatePromises = [];
  for (const address in walletBuys) {
    const { totalSol, totalTokens } = walletBuys[address];
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
  console.log(`[LOG] Finished calculating acquisition prices for ${Object.keys(walletBuys).length} wallets.`);
}

module.exports = {
  refreshDataViaRPC,
  refreshHolderData,
};