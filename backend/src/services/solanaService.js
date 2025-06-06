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
  try {
    await prisma.transaction.deleteMany({});
    
    const transfers = await fetchAllTokenTransfers();
    
    for (const t of transfers) {
      const sourceWallet = await prisma.wallet.upsert({
          where: { address: t.sender },
          update: {},
          create: { address: t.sender },
      });
      const destinationWallet = await prisma.wallet.upsert({
          where: { address: t.receiver },
          update: {},
          create: { address: t.receiver },
      });

      await prisma.transaction.create({
        data: {
          signature: t.signature,
          blockTime: t.blockTime,
          type: t.type,
          tokenAmount: t.tokenAmount,
          source_wallet_id: sourceWallet.id,
          destination_wallet_id: destinationWallet.id
        }
      });
    }

    console.log("[LOG] Transaction database refreshed via RPC method.");
  } catch (err) {
    console.error("Failed to refresh transactions via RPC:", err);
    throw err;
  }
}

module.exports = {
  refreshDataViaRPC,
  refreshHolderData,
};