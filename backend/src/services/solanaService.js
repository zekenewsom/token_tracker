// backend/src/services/solanaService.js

require('dotenv').config();
const axios = require('axios');
const prisma = require('../utils/prismaClient');
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL;
const MINT_ADDRESS = "2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump";

/**
 * Fetch all wallet addresses holding a specific SPL token using Helius DAS getTokenAccounts.
 * Paginates through every page until all token accounts are retrieved, filters for amount > 0, deduplicates owners.
 * @returns {Promise<string[]>} Array of unique wallet addresses holding the token
 */
async function fetchAllTokenHoldersViaHeliusDAS() {
  const LIMIT = 1000;
  let cursor = null;
  const holdersSet = new Set();
  let totalPages = null;
  let totalAccounts = null;
  let pageCount = 0;

  do {
    const body = {
      jsonrpc: '2.0',
      id: '1',
      method: 'getTokenAccounts',
      params: {
        mint: MINT_ADDRESS,
        limit: LIMIT,
        ...(cursor ? { cursor } : {}),
      },
    };
    let response;
    try {
      response = await axios.post(HELIUS_RPC_URL, body, {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      throw new Error(`Network error fetching token accounts: ${err.message}`);
    }
    if (response.data.error) {
      throw new Error(`Helius RPC error: ${JSON.stringify(response.data.error)}`);
    }
    const result = response.data.result;
    if (pageCount === 0) {
      totalAccounts = result.total;
      totalPages = Math.ceil(totalAccounts / LIMIT);
      console.log(`[Helius DAS] Total token accounts: ${totalAccounts}`);
      console.log(`[Helius DAS] Estimated pages: ${totalPages}`);
    }
    for (const acct of result.token_accounts) {
      if (acct.amount && BigInt(acct.amount) > 0n) {
        holdersSet.add(acct.owner);
      }
    }
    pageCount++;
    console.log(`[Helius DAS] Page ${pageCount} processed. Collected so far: ${holdersSet.size} unique holders.`);
    cursor = result.cursor ?? null;
  } while (cursor);
  console.log(`[Helius DAS] Completed fetching all holders. Total unique holders: ${holdersSet.size}`);
  return Array.from(holdersSet);
}

/**
 * 1) Fetch all signatures for our mint using getSignaturesForAddress
 */
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
      // Network or Axios-level error
      console.error('Network error fetching signatures:', err.message);
      break;
    }

    if (resp.data.error) {
      // Handle Solana RPC error for long-term storage
      if (resp.data.error.code === -32019) {
        console.warn('[WARN] Hit long-term storage limit. Returning all signatures fetched so far.');
        break;
      } else {
        throw new Error(
          `getSignaturesForAddress error: ${JSON.stringify(resp.data.error)}`
        );
      }
    }

    const batch = resp.data.result || [];
    if (batch.length === 0) break;
    signatures.push(...batch.map((item) => item.signature));
    if (batch.length < 1000) break;

    before = batch[batch.length - 1].signature;
  }

  return signatures;
}


/**
 * 2) Fetch a single transaction by signature (parsed JSON)
 */
async function fetchTransactionDetails(signature) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTransaction",
    params: [signature, "jsonParsed"]
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

/**
 * 3) Extract SPL-Token transfer info for our mint from a getTransaction result
 */
function extractTokenTransferInfo(txResult) {
  if (!txResult || !txResult.meta) return null;

  const pre = txResult.meta.preTokenBalances || [];
  const post = txResult.meta.postTokenBalances || [];

  // Find any balance change for our mint
  const preEntry = pre.find((p) => p.mint === MINT_ADDRESS);
  const postEntry = post.find((p) => p.mint === MINT_ADDRESS);
  if (!preEntry && !postEntry) return null;

  const beforeAmt = preEntry ? preEntry.uiTokenAmount.uiAmount : 0;
  const afterAmt = postEntry ? postEntry.uiTokenAmount.uiAmount : 0;
  const delta = afterAmt - beforeAmt; 
  const direction = delta > 0 ? "in" : "out";

  // Determine sender/receiver wallets via parsed instructions
  let senderWallet = null;
  let receiverWallet = null;
  for (const instr of txResult.transaction.message.instructions) {
    if (instr.program === "spl-token" && instr.parsed?.type === "transfer") {
      const info = instr.parsed.info;
      if (info.mint === MINT_ADDRESS) {
        senderWallet = preEntry ? preEntry.owner : null;
        receiverWallet = postEntry ? postEntry.owner : null;
        break;
      }
    }
  }

  return {
    signature: txResult.transaction.signatures[0],
    slot: txResult.slot,
    blockTime: new Date(txResult.blockTime * 1000),
    amount: Math.abs(delta),
    direction,
    sender: senderWallet,
    receiver: receiverWallet
  };
}

/**
 * 4) Main function: Fetch & parse all token transactions for our mint
 */
async function fetchAllTokenTransfers() {
  // Fetch every signature that mentions our mint:
  const allSignatures = await fetchAllSignatures(MINT_ADDRESS);
  console.log(`[LOG] Found ${allSignatures.length} signatures for mint ${MINT_ADDRESS}`);

  const transfers = [];

  // Iterate (you can parallelize if you want, but be mindful of rate limits)
  for (const sig of allSignatures) {
    const tx = await fetchTransactionDetails(sig);
    const info = extractTokenTransferInfo(tx);
    if (info) transfers.push(info);
  }

  console.log(`[LOG] Parsed ${transfers.length} token transfer events.`);

  return transfers;
}

/**
 * 5) Example: Store transfers into your database (if desired)
 */
async function refreshDataViaRPC() {
  try {
    // Clear existing records, if that’s your logic
    await prisma.transaction.deleteMany({});

    const transfers = await fetchAllTokenTransfers();
    for (const t of transfers) {
      await prisma.transaction.create({
        data: {
          signature: t.signature,
          slot: t.slot,
          blockTime: t.blockTime,
          type: t.direction,
          amount: t.amount,
          senderAddress: t.sender,
          receiverAddress: t.receiver
        }
      });
    }

    console.log("[LOG] Database refreshed via RPC method.");
  } catch (err) {
    console.error("Failed to refresh via RPC:", err);
  }
}


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
    let url = `${BASE}/v0/tokens/${MINT}/transactions?api-key=${API_KEY}`;
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


