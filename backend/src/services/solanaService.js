// backend/src/services/solanaService.js

require('dotenv').config();
const axios = require('axios');
const prisma = require('../utils/prismaClient');
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL;
const MINT_ADDRESS = "2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump";

async function fetchAllTokenHoldersViaHeliusDAS() {
  const LIMIT = 1000;
  let cursor = null;
  const accounts = [];
  let pageCount = 0;

  console.log(`[Helius DAS] Fetching all token accounts for mint: ${MINT_ADDRESS}`);
  do {
    const body = {
      jsonrpc: '2.0',
      id: '1',
      method: 'getTokenAccounts',
      params: { mint: MINT_ADDRESS, limit: LIMIT, ...(cursor ? { cursor } : {}) },
    };
    
    const response = await axios.post(HELIUS_RPC_URL, body, {
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (response.data.error) throw new Error(`Helius RPC error: ${JSON.stringify(response.data.error)}`);
    
    const result = response.data.result;
    for (const acct of result.token_accounts) {
      if (acct.amount && BigInt(acct.amount) > 0n) {
        accounts.push({
          owner: acct.owner,
          // NOTE: Adjust the decimals (10**6) if your token is different
          amount: parseInt(acct.amount, 10) / (10 ** 6) 
        });
      }
    }
    
    pageCount++;
    cursor = result.cursor ?? null;
    console.log(`[Helius DAS] Page ${pageCount} processed. Collected so far: ${accounts.length} accounts.`);
  } while (cursor);

  console.log(`[Helius DAS] Completed fetching all holders. Total accounts with balance: ${accounts.length}`);
  return accounts;
}

async function refreshHolderData() {
  console.log('[LOG] Starting holder data refresh...');
  const holders = await fetchAllTokenHoldersViaHeliusDAS();

  for (const holder of holders) {
      const wallet = await prisma.wallet.upsert({
          where: { address: holder.owner },
          update: {},
          create: { address: holder.owner },
      });

      await prisma.tokenHolder.upsert({
          where: { wallet_id: wallet.id },
          update: { balance: holder.amount },
          create: {
              wallet_id: wallet.id,
              balance: holder.amount,
          }
      });
  }
  console.log(`[LOG] Successfully refreshed ${holders.length} token holders.`);
}

async function fetchAllSignatures(mintAddress) {
  const signatures = [];
  let before = null;

  while (true) {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [
        mintAddress,
        {
          limit: 1000,
          ...(before && { before })
        }
      ]
    };

    let resp;
    try {
      resp = await axios.post(HELIUS_RPC_URL, body, {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      console.error('Network error fetching signatures:', err.message);
      break;
    }

    if (resp.data.error) {
      console.warn('[WARN] Hit long-term storage limit or RPC error. Returning all signatures fetched so far.');
      break;
    }

    const batch = resp.data.result || [];
    if (batch.length === 0) break;
    signatures.push(...batch.map((item) => item.signature));
    if (batch.length < 1000) break;

    before = batch[batch.length - 1].signature;
  }

  return signatures;
}

// ==================================================================
// THIS FUNCTION CONTAINS THE FIX
// ==================================================================
async function fetchTransactionDetails(signature) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTransaction",
    params: [
      signature,
      // This configuration object tells Helius that our client supports legacy "Version 0" transactions.
      {
        "encoding": "jsonParsed",
        "maxSupportedTransactionVersion": 0
      }
    ]
  };
  
  const resp = await axios.post(HELIUS_RPC_URL, body, {
    headers: { "Content-Type": "application/json" }
  });

  if (resp.data.error) {
    console.error("getTransaction error:", resp.data.error);
    return null;
  }
  return resp.data.result;
}

function extractTokenTransferInfo(txResult) {
    if (!txResult || !txResult.meta || !txResult.transaction) return null;

    for (const instr of txResult.transaction.message.instructions) {
        if (instr.program === "spl-token" && (instr.parsed?.type === "transfer" || instr.parsed?.type === "transferChecked")) {
            const info = instr.parsed.info;
            if (info.mint === MINT_ADDRESS) {
                 return {
                    signature: txResult.transaction.signatures[0],
                    blockTime: txResult.blockTime,
                    // NOTE: Adjust decimals if your token is different
                    tokenAmount: info.tokenAmount?.uiAmount || info.amount / (10**6), 
                    sender: info.source,
                    receiver: info.destination,
                    type: 'transfer'
                };
            }
        }
    }
    return null;
}

async function fetchAllTokenTransfers() {
  const allSignatures = await fetchAllSignatures(MINT_ADDRESS);
  console.log(`[LOG] Found ${allSignatures.length} signatures for mint ${MINT_ADDRESS}`);

  const transfers = [];
  for (const sig of allSignatures) {
    const tx = await fetchTransactionDetails(sig);
    const info = extractTokenTransferInfo(tx);
    if (info) transfers.push(info);
  }

  console.log(`[LOG] Parsed ${transfers.length} token transfer events.`);
  return transfers;
}

async function refreshDataViaRPC() {
  console.log('[LOG] Starting full transaction history refresh...');

  // This helper function parses a single transaction from the Helius v0 API
  const parseHeliusTransaction = (tx) => {
    // Find the token transfer related to our specific mint
    const tokenTransfer = tx.tokenTransfers.find(t => t.mint === MINT_ADDRESS);
    if (!tokenTransfer) return null;

    let transactionType = 'transfer';
    let solAmount = 0;

    // Check if it's a swap to determine buy/sell and SOL amount
    if (tx.type === 'SWAP') {
      const userAccount = tokenTransfer.fromUserAccount || tokenTransfer.toUserAccount;
      // If the user's token balance decreases, it's a sell.
      const isSell = tx.tokenTransfers.some(t => t.fromUserAccount === userAccount && t.mint === MINT_ADDRESS);
      transactionType = isSell ? 'sell' : 'buy';
      
      // Find the corresponding SOL transfer
      const nativeTransfer = tx.nativeTransfers.find(n => n.fromUserAccount === userAccount || n.toUserAccount === userAccount);
      if (nativeTransfer) {
        solAmount = nativeTransfer.amount / 1_000_000_000;
      }
    }

    return {
      signature: tx.signature,
      blockTime: tx.timestamp,
      type: transactionType,
      source: tokenTransfer.fromUserAccount,
      destination: tokenTransfer.toUserAccount,
      tokenAmount: tokenTransfer.tokenAmount,
      solAmount: solAmount,
    };
  };

  // --- Main Fetching Logic ---
  let allParsedTransactions = [];
  let lastSignature;
  let hasMore = true;
  const HELIUS_API_KEY = HELIUS_RPC_URL.split('/').pop(); // Assumes API key is at the end of the RPC URL

  while (hasMore) {
    let url = `https://api.helius.xyz/v0/tokens/${MINT_ADDRESS}/transactions?api-key=${HELIUS_API_KEY}`;
    if (lastSignature) {
      url += `&before=${lastSignature}`;
    }

    try {
      const response = await axios.get(url);
      const transactions = response.data;
      
      if (transactions && transactions.length > 0) {
        for (const tx of transactions) {
          const parsed = parseHeliusTransaction(tx);
          if (parsed) {
            allParsedTransactions.push(parsed);
          }
        }
        lastSignature = transactions[transactions.length - 1].signature;
        console.log(`[LOG] Fetched ${transactions.length} transactions. Total parsed: ${allParsedTransactions.length}`);
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error('Error fetching token transaction history:', error.message);
      hasMore = false;
    }
  }
  
  // --- Database Update Logic ---
  console.log(`[LOG] Finished fetching. Total parsed transactions: ${allParsedTransactions.length}. Updating database...`);
  await prisma.transaction.deleteMany({}); // Clear old transactions

  for (const tx of allParsedTransactions) {
    const sourceWallet = await prisma.wallet.upsert({
      where: { address: tx.source },
      update: {},
      create: { address: tx.source },
    });
    const destinationWallet = await prisma.wallet.upsert({
      where: { address: tx.destination },
      update: {},
      create: { address: tx.destination },
    });

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

  console.log('[LOG] Transaction database refreshed with full history.');
}


module.exports = {
  refreshDataViaRPC,
  refreshHolderData,
};