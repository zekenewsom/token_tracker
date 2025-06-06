// backend/src/services/solanaService.js

const axios = require('axios');
const { tokenMintAddress, rpcUrl } = require('../config/solanaConfig');
const { log } = require('../utils/logger');

// Extract the API key from the full RPC URL provided in the .env file.
const API_KEY = rpcUrl.substring(rpcUrl.indexOf('?api-key=') + 9);

// The base URL for the Helius Token API.
const HELIUS_TOKEN_API_BASE = 'https://api.helius.xyz';

/**
 * Parses a transaction from the Helius v0 Token API.
 * @param {object} tx - The raw transaction object from Helius.
 * @returns {object|null} A structured transaction object or null if not relevant.
 */
const parseHeliusTransaction = (tx) => {
  if (tx.type === 'TRANSFER' && tx.tokenTransfers) {
    const relevantTransfer = tx.tokenTransfers.find(t => t.mint === tokenMintAddress);
    if (relevantTransfer) {
      return {
        signature: tx.signature,
        blockTime: tx.timestamp,
        type: 'transfer',
        source: relevantTransfer.fromUserAccount,
        destination: relevantTransfer.toUserAccount,
        tokenAmount: relevantTransfer.tokenAmount,
        solAmount: 0,
      };
    }
  } else if (tx.type === 'SWAP' && tx.tokenTransfers) {
    const tokenTransfer = tx.tokenTransfers.find(t => t.mint === tokenMintAddress);
    if (!tokenTransfer) return null;

    // Determine the direction of the swap to classify as 'buy' or 'sell'.
    const isSell = tokenTransfer.fromUserAccount !== 'So11111111111111111111111111111111111111112';
    const userAccount = isSell ? tokenTransfer.fromUserAccount : tokenTransfer.toUserAccount;
    const solTransfer = tx.nativeTransfers.find(nt => nt.fromUserAccount === userAccount || nt.toUserAccount === userAccount);
    
    return {
        signature: tx.signature,
        blockTime: tx.timestamp,
        type: isSell ? 'sell' : 'buy',
        source: isSell ? userAccount : 'DEX',
        destination: isSell ? 'DEX' : userAccount,
        tokenAmount: tokenTransfer.tokenAmount,
        solAmount: (solTransfer?.amount || 0) / 1_000_000_000,
    };
  }

  return null;
};

/**
 * Fetches and parses all transactions for the token using Helius's v0 Token API.
 */
async function fetchTokenTransactions() {
  let allTransactions = [];
  let lastSignature;
  let hasMore = true;

  log(`Fetching token transaction history for: ${tokenMintAddress}`);

  while (hasMore) {
    // Construct the URL manually for a direct GET request.
    let url = `${HELIUS_TOKEN_API_BASE}/v0/tokens/${tokenMintAddress}/transactions?api-key=${API_KEY}`;
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
            allTransactions.push(parsed);
          }
        }
        lastSignature = transactions[transactions.length - 1].signature;
        log(`Fetched ${transactions.length} transactions. Total parsed: ${allTransactions.length}`);
      } else {
        hasMore = false;
      }
    } catch (error) {
      const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
      console.error(`Error fetching token transaction history from URL: ${url}`);
      console.error('Error details:', errorMsg);
      hasMore = false;
    }
  }

  log(`Finished fetching all transactions. Total parsed: ${allTransactions.length}`);
  return allTransactions.sort((a, b) => b.blockTime - a.blockTime);
}

module.exports = { fetchTokenTransactions };
