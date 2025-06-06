// backend/src/services/solanaService.js

const axios = require('axios');
const { tokenMintAddress, rpcUrl } = require('../config/solanaConfig');
const { log } = require('../utils/logger');

// The address of the Raydium liquidity pool authority, used to identify buys/sells.
const RAYDIUM_AUTHORITY = '5Q544fKrFoe6tsEbD7S8sugEThBLsoJvGCo3LpfdMsk7';

const api = axios.create({
  baseURL: rpcUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Parses the raw transaction data from Helius to a structured format.
 * @param {object} tx - The raw transaction object from Helius.
 * @returns {object|null} A structured transaction object or null if not relevant.
 */
const parseTransaction = (tx) => {
  if (!tx.meta || tx.meta.err) {
    return null; // Skip failed or irrelevant transactions
  }

  const { blockTime, meta, signature } = tx.transaction;
  const tokenTransfers = tx.transaction.message.instructions
    .filter(ix => ix.programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' && ix.parsed?.type === 'transferChecked')
    .map(ix => ix.parsed.info);
    
  if (tokenTransfers.length === 0) {
      return null;
  }

  const accountKeys = tx.transaction.message.accountKeys.map(acc => acc.pubkey);
  const preBalances = meta.preBalances;
  const postBalances = meta.postBalances;
  
  // Find SOL balance change
  const solChange = postBalances[0] - preBalances[0]; // Fee payer is always the first account

  let type = 'transfer';
  let source = null;
  let destination = null;
  let tokenAmount = 0;
  
  for (const transfer of tokenTransfers) {
      if (transfer.mint === tokenMintAddress) {
          tokenAmount = transfer.tokenAmount.uiAmount;
          // Heuristic to determine buy/sell
          // If Raydium authority is involved, it's a swap (buy/sell)
          if (accountKeys.includes(RAYDIUM_AUTHORITY)) {
              if (solChange > 0) {
                  type = 'sell';
                  source = transfer.authority;
                  destination = 'Raydium Pool';
              } else {
                  type = 'buy';
                  source = 'Raydium Pool';
                  destination = transfer.destination;
              }
          } else {
              // Simple transfer
              source = transfer.source;
              destination = transfer.destination;
          }
          break; // Process the first relevant transfer
      }
  }

  return {
    signature: signature[0],
    blockTime: blockTime,
    type,
    source,
    destination,
    tokenAmount,
    solAmount: Math.abs(solChange) / 1_000_000_000, // Convert lamports to SOL
  };
};


/**
 * Fetches all transaction signatures for the given token mint address.
 */
async function getSignatures() {
  let allSignatures = [];
  let page = 1;
  let hasMore = true;

  log(`Fetching signatures for token: ${tokenMintAddress}`);

  while (hasMore) {
    try {
      const response = await api.post('/', {
        jsonrpc: '2.0',
        id: `get-signatures-for-asset-${page}`,
        method: 'getSignaturesForAsset',
        params: {
          assetId: tokenMintAddress,
          page: page,
          limit: 1000,
        },
      });

      const { result } = response.data;
      if (result.items && result.items.length > 0) {
        const signatures = result.items.map(item => item.signature);
        allSignatures = allSignatures.concat(signatures);
        log(`Fetched ${signatures.length} signatures on page ${page}. Total: ${allSignatures.length}`);
        page++;
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error('Error fetching signatures:', error.response ? error.response.data : error.message);
      hasMore = false;
    }
  }
  return allSignatures;
}

/**
 * Fetches and parses all transactions for the token.
 */
async function fetchTokenTransactions() {
  const signatures = await getSignatures();
  if (signatures.length === 0) {
    log('No signatures found for this token.');
    return [];
  }

  log(`Found ${signatures.length} total signatures. Fetching transaction details...`);
  const parsedTransactions = [];
  const batchSize = 100; // Helius API limit

  for (let i = 0; i < signatures.length; i += batchSize) {
    const batch = signatures.slice(i, i + batchSize);
    try {
      const response = await api.post('/', {
        jsonrpc: '2.0',
        id: 'get-transactions',
        method: 'getTransactions',
        params: {
          signatures: batch,
        },
      });

      const { result } = response.data;
      if (result) {
        for (const tx of result) {
          if (tx) {
            const parsedTx = parseTransaction(tx);
            if (parsedTx) {
              parsedTransactions.push(parsedTx);
            }
          }
        }
      }
      log(`Processed batch ${i / batchSize + 1} of ${Math.ceil(signatures.length / batchSize)}. Parsed transactions: ${parsedTransactions.length}`);
    } catch (error) {
      console.error('Error fetching transaction batch:', error.response ? error.response.data : error.message);
    }
  }

  log(`Finished fetching all transactions. Total parsed: ${parsedTransactions.length}`);
  return parsedTransactions.sort((a, b) => b.blockTime - a.blockTime); // Sort by most recent
}

module.exports = { fetchTokenTransactions };
