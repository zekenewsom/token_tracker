// backend/src/services/solanaService.js
require('dotenv').config();
const axios = require('axios');
const prisma = require('../utils/prismaClient');
const { TEST_MODE_ENABLED, TEST_MODE_TOP_N_HOLDERS } = require('../config/solanaConfig');
const { PublicKey } = require('@solana/web3.js');

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// --- Configuration ---
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL;
const SOLANA_RPC_URL = process.env.QUICKNODE_ENDPOINT_URL || 'https://api.mainnet-beta.solana.com';
const MINT_ADDRESS = '2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump';
const COINGECKO_TOKEN_ID = 'cainam';

// --- Helper Functions ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function findClosestHourlyPrice(transactionTimestamp) {
    const transactionHour = new Date(transactionTimestamp * 1000);
    transactionHour.setMinutes(0, 0, 0);
    const hourTimestamp = Math.floor(transactionHour.getTime() / 1000); // Convert to seconds

    // Try to find an exact match in the database
    let priceEntry = await prisma.hourlyPrice.findUnique({
        where: { timestamp: hourTimestamp },
    });

    if (priceEntry) {
        return priceEntry.price_usd;
    }

    // If not found, try to find the closest available price (previous hour)
    priceEntry = await prisma.hourlyPrice.findFirst({
        where: { timestamp: { lte: hourTimestamp } },
        orderBy: { timestamp: 'desc' },
    });

    if (priceEntry) {
        console.log(`[WARN] Using closest historical price (past) for timestamp ${transactionTimestamp}. Found price at ${priceEntry.timestamp}.`);
        return priceEntry.price_usd;
    }

    // If still not found, try to find the closest available price (future hour)
    priceEntry = await prisma.hourlyPrice.findFirst({
        where: { timestamp: { gte: hourTimestamp } },
        orderBy: { timestamp: 'asc' },
    });

    if (priceEntry) {
        console.log(`[WARN] Using closest historical price (future) for timestamp ${transactionTimestamp}. Found price at ${priceEntry.timestamp}.`);
        return priceEntry.price_usd;
    }

    console.warn(`[WARN] No price found for timestamp ${transactionTimestamp} or any nearby. Returning null.`);
    return null;
}

async function fetchPriceDataForRange(fromTimestamp, toTimestamp) {
    try {
        const url = `https://api.coingecko.com/api/v3/coins/${COINGECKO_TOKEN_ID}/market_chart/range?vs_currency=usd&from=${fromTimestamp}&to=${toTimestamp}`;
        const response = await axios.get(url);
        const prices = response.data?.prices || null;

        if (prices) {
            for (const [timestamp, price] of prices) {
                // CoinGecko timestamps are in milliseconds, convert to seconds for consistency
                const hourlyTimestamp = Math.floor(timestamp / 1000);
                await prisma.hourlyPrice.upsert({
                    where: { timestamp: hourlyTimestamp },
                    update: { price_usd: price },
                    create: { timestamp: hourlyTimestamp, price_usd: price },
                });
            }
        }
        return prices;
    } catch (error) {
        if (error.response?.status === 429) {
            console.log(`[WARN] CoinGecko rate limit hit. Waiting 60 seconds...`);
            await sleep(60000);
            return fetchPriceDataForRange(fromTimestamp, toTimestamp);
        }
        console.error(`[ERROR] Could not fetch hourly price chart for ${COINGECKO_TOKEN_ID}:`, error.message);
        return null;
    }
}

async function findAssociatedTokenAddress(walletAddress, tokenMintAddress) {
    const [ata] = await PublicKey.findProgramAddress(
        [
            new PublicKey(walletAddress).toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            new PublicKey(tokenMintAddress).toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return ata.toBase58();
}

// Add this function after the existing imports and constants
async function getWalletSyncStatus(walletAddress) {
    // Check if we have recent transactions for this wallet
    const latestTransaction = await prisma.transaction.findFirst({
        where: {
            OR: [
                { sourceWallet: { address: walletAddress } },
                { destinationWallet: { address: walletAddress } },
            ],
        },
        orderBy: { blockTime: 'desc' },
    });

    if (!latestTransaction) {
        return { needsSync: true, lastSyncTime: null, lastTransactionTime: null };
    }

    // Check if the latest transaction is recent (within last hour)
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    const isRecent = latestTransaction.blockTime > oneHourAgo;

    return {
        needsSync: !isRecent,
        lastSyncTime: latestTransaction.blockTime,
        lastTransactionTime: latestTransaction.blockTime,
        lastSignature: latestTransaction.signature
    };
}

// --- Data Fetching & Service Logic ---

async function syncTransfersForWallet(walletAddress) {
    console.log(`[Solana RPC] Checking sync status for wallet: ${walletAddress}`);
    
    // Check if wallet needs syncing
    const syncStatus = await getWalletSyncStatus(walletAddress);
    
    if (!syncStatus.needsSync) {
        console.log(`[Solana RPC] Wallet ${walletAddress} recently synced (last: ${new Date(syncStatus.lastSyncTime * 1000).toISOString()}), skipping`);
        return [];
    }

    console.log(`[Solana RPC] Fetching transfers for wallet: ${walletAddress}`);
    const allParsedTransactions = [];
    try {
        const ata = await findAssociatedTokenAddress(walletAddress, MINT_ADDRESS);

        // Get signatures starting from the latest processed transaction
        const signatures = await getSignaturesForAddress(ata, syncStatus.lastSignature);

        // Only process signatures that are newer than our latest transaction
        let processedCount = 0;
        for (const sig of signatures) {
            // Skip if we've already processed this transaction
            if (syncStatus.lastSignature && sig.signature === syncStatus.lastSignature) {
                console.log(`[Solana RPC] Reached already processed transaction ${sig.signature}, stopping for wallet ${walletAddress}`);
                break;
            }

            const tx = await getTransaction(sig.signature);
            if (tx) {
                const parsed = parseTransaction(tx, walletAddress, ata);
                if (parsed) {
                    allParsedTransactions.push(parsed);
                    processedCount++;
                }
            }
            await sleep(400); // Rate limit
        }
        
        console.log(`[Solana RPC] Processed ${processedCount} new transactions for wallet ${walletAddress}`);
    } catch (error) {
        console.error(`[ERROR] Solana RPC Error for wallet ${walletAddress}:`, error.message || JSON.stringify(error));
    }
    return allParsedTransactions;
}

async function getSignaturesForAddress(ata, beforeSignature = null) {
    let allSignatures = [];
    let currentBeforeSignature = beforeSignature;
    let hasMore = true;
    let batchCount = 0;

    console.log(`[Solana RPC] Fetching signatures for ${ata}${beforeSignature ? ` starting from ${beforeSignature.substring(0, 8)}...` : ''}`);

    while (hasMore) {
        batchCount++;
        const params = [ata, { limit: 1000, ...(currentBeforeSignature ? { before: currentBeforeSignature } : {}) }];
        const { data } = await axios.post(SOLANA_RPC_URL, {
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignaturesForAddress',
            params: params,
        });

        if (data.error) throw data.error;

        const currentBatch = data.result;
        if (currentBatch.length === 0) {
            hasMore = false;
        } else {
            allSignatures = allSignatures.concat(currentBatch);
            currentBeforeSignature = currentBatch[currentBatch.length - 1].signature; // Last signature of current batch for next iteration
            if (currentBatch.length < 1000) { // If less than limit, no more pages
                hasMore = false;
            }
        }
        await sleep(200); // Rate limit for RPC calls
    }
    
    console.log(`[Solana RPC] Fetched ${allSignatures.length} signatures in ${batchCount} batches for ${ata}`);
    return allSignatures;
}

async function getTransaction(signature) {
    const { data } = await axios.post(SOLANA_RPC_URL, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [signature, { "encoding": "jsonParsed", "maxSupportedTransactionVersion": 0 }],
    });
    if (data.error) throw data.error;
    return data.result;
}

function parseTransaction(tx, walletAddress, ata) {
    if (!tx || !tx.meta || !tx.transaction || !tx.transaction.message || !tx.transaction.message.instructions) {
        return null;
    }

    let tokenAmount = 0;
    let sourceTokenAccount = null;
    let destinationTokenAccount = null;

    const transferInstruction = tx.transaction.message.instructions.find(
        inst => inst.parsed?.type === 'transfer' && inst.programId === TOKEN_PROGRAM_ID.toBase58()
    );

    if (transferInstruction && transferInstruction.parsed && transferInstruction.parsed.info) {
        const info = transferInstruction.parsed.info;
        sourceTokenAccount = info.source;
        destinationTokenAccount = info.destination;
        tokenAmount = info.amount / (10 ** 6); // Assuming 6 decimals
    } else {
        const preBalance = tx.meta.preTokenBalances?.find(b => b.owner === walletAddress && b.mint === MINT_ADDRESS)?.uiTokenAmount.uiAmount || 0;
        const postBalance = tx.meta.postTokenBalances?.find(b => b.owner === walletAddress && b.mint === MINT_ADDRESS)?.uiTokenAmount.uiAmount || 0;
        tokenAmount = postBalance - preBalance;
    }

    if (tokenAmount === 0) {
        return null;
    }

    const type = (destinationTokenAccount === ata || tokenAmount > 0) ? 'transfer_in' : 'transfer_out';
    let source = 'Unknown';
    let destination = 'Unknown';

    if (type === 'transfer_in') {
        destination = walletAddress;
        if (sourceTokenAccount) {
            source = sourceTokenAccount;
        }
        if (source === 'Unknown') {
            const involvedParties = tx.transaction.message.accountKeys.map(acc => acc.pubkey);
            source = involvedParties.find(p => p !== walletAddress && p !== ata) || 'Unknown';
        }
    } else { // transfer_out
        source = walletAddress;
        if (destinationTokenAccount) {
            destination = destinationTokenAccount;
        }
        if (destination === 'Unknown') {
            const involvedParties = tx.transaction.message.accountKeys.map(acc => acc.pubkey);
            destination = involvedParties.find(p => p !== walletAddress && p !== ata) || 'Unknown';
        }
    }

    return {
        signature: tx.transaction.signatures[0],
        blockTime: tx.blockTime,
        type,
        source,
        destination,
        tokenAmount: Math.abs(tokenAmount),
    };
}

async function fetchAllTokenHoldersViaHeliusDAS() {
    const LIMIT = 1000; let cursor = null; const accounts = [];
    console.log(`[Helius DAS] Fetching all token accounts for mint: ${MINT_ADDRESS}`);
    do {
        try {
            const { data } = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: '2.0', id: '1', method: 'getTokenAccounts',
                params: { mint: MINT_ADDRESS, limit: LIMIT, ...(cursor ? { cursor } : {}) },
            });
            if (data.error) throw data.error;
            for (const acct of data.result.token_accounts) {
                if (acct.amount && BigInt(acct.amount) > 0n) {
                    accounts.push({ owner: acct.owner, amount: parseInt(acct.amount, 10) / (10 ** 6) });
                }
            }
            cursor = data.result.cursor ?? null;
        } catch (e) { console.error("[ERROR] Failed to fetch token holders from Helius:", e.message); cursor = null; }
    } while (cursor);
    console.log(`[Helius DAS] Completed fetching all holders. Total accounts with balance: ${accounts.length}`);
    return accounts.sort((a, b) => b.amount - a.amount);
}

async function refreshHolderData() {
    console.log('[LOG] Starting holder balance refresh...');
    const holders = await fetchAllTokenHoldersViaHeliusDAS();
    for (const holder of holders) {
        const wallet = await prisma.wallet.upsert({ where: { address: holder.owner }, update: {}, create: { address: holder.owner } });
        await prisma.tokenHolder.upsert({
            where: { wallet_id: wallet.id },
            update: { balance: holder.amount },
            create: { wallet_id: wallet.id, balance: holder.amount, total_cost_usd: 0, total_tokens_acquired: 0 },
        });
    }
    console.log(`[LOG] Successfully refreshed ${holders.length} token holder balances.`);
}

async function refreshDataViaRPC() {
    console.log('[LOG] Starting data refresh process with QuickNode and CoinGecko...');
    if (!process.env.QUICKNODE_ENDPOINT_URL) throw new Error("QUICKNODE_ENDPOINT_URL is not set.");
    
    // Refresh holder list and balances first
    await refreshHolderData();

    const walletsToScan = await prisma.tokenHolder.findMany({
        orderBy: { balance: 'desc' },
        select: { wallet: { select: { address: true } } },
    });
    
    let targetWallets = walletsToScan.map(h => h.wallet.address);

    if (TEST_MODE_ENABLED) {
        console.log(`[TEST MODE] Active. Scanning for Top ${TEST_MODE_TOP_N_HOLDERS} holders only, ignoring the largest holder.`);
        targetWallets = targetWallets.slice(1, TEST_MODE_TOP_N_HOLDERS + 1);
    }
    
    console.log(`[LOG] Will scan ${targetWallets.length} wallets for transfer history.`);
    
    const allNewTransactions = new Map();
    const batchSize = 5; // Process 5 wallets at a time to avoid overwhelming the RPC
    
    for (let i = 0; i < targetWallets.length; i += batchSize) {
        const batch = targetWallets.slice(i, i + batchSize);
        console.log(`[LOG] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(targetWallets.length / batchSize)} (wallets ${i + 1}-${Math.min(i + batchSize, targetWallets.length)})`);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (address) => {
            try {
                const transactions = await syncTransfersForWallet(address);
                return transactions;
            } catch (error) {
                console.error(`[ERROR] Failed to sync wallet ${address}:`, error.message);
                return [];
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Collect all transactions from this batch
        for (const transactions of batchResults) {
            for (const tx of transactions) {
                if (!allNewTransactions.has(tx.signature)) {
                    allNewTransactions.set(tx.signature, tx);
                }
            }
        }
        
        // Add delay between batches to be respectful to the RPC
        if (i + batchSize < targetWallets.length) {
            console.log(`[LOG] Waiting 2 seconds before next batch...`);
            await sleep(2000);
        }
    }

    const transactionsToProcess = Array.from(allNewTransactions.values());
    console.log(`[LOG] Found ${transactionsToProcess.length} unique new transactions to process`);

    if (transactionsToProcess.length > 0) {
        const uniqueBlockTimes = [...new Set(transactionsToProcess.map(tx => {
            const transactionHour = new Date(tx.blockTime * 1000);
            transactionHour.setMinutes(0, 0, 0);
            return Math.floor(transactionHour.getTime() / 1000);
        }))];

        const missingPriceTimestamps = [];
        for (const timestamp of uniqueBlockTimes) {
            const priceExists = await prisma.hourlyPrice.findUnique({
                where: { timestamp: timestamp },
            });
            if (!priceExists) {
                missingPriceTimestamps.push(timestamp);
            }
        }

        if (missingPriceTimestamps.length > 0) {
            const minMissingTimestamp = Math.min(...missingPriceTimestamps);
            const maxMissingTimestamp = Math.max(...missingPriceTimestamps);
            console.log(`[Price] Fetching missing hourly prices from CoinGecko for range: ${new Date(minMissingTimestamp * 1000).toISOString()} to ${new Date(maxMissingTimestamp * 1000).toISOString()}`);
            await fetchPriceDataForRange(minMissingTimestamp, maxMissingTimestamp);
        }

        console.log(`[LOG] Saving ${transactionsToProcess.length} transactions and calculating costs...`);
        for (const tx of transactionsToProcess) {
            const sourceWallet = await prisma.wallet.upsert({ where: { address: tx.source }, update: {}, create: { address: tx.source } });
            const destinationWallet = await prisma.wallet.upsert({ where: { address: tx.destination }, update: {}, create: { address: tx.destination } });
            
            let tokenPriceUsd = 0; // Default for transfer_out, or if no price found
            if (tx.type === 'transfer_in') {
                const foundPrice = await findClosestHourlyPrice(tx.blockTime);
                console.log(`[DEBUG] findClosestHourlyPrice returned: ${foundPrice} for tx ${tx.signature}`);
                if (foundPrice === null) {
                    const earliestHourlyPrice = await prisma.hourlyPrice.findFirst({
                        orderBy: {
                            timestamp: 'asc',
                        },
                        select: {
                            price_usd: true,
                        }
                    });
                    console.log(`[DEBUG] earliestHourlyPrice found: ${earliestHourlyPrice?.price_usd}`);
                    tokenPriceUsd = earliestHourlyPrice?.price_usd ?? 0.000000001; // Default to a very small value
                    console.warn(`[WARN] Using fallback price ${tokenPriceUsd} for transaction ${tx.signature} due to missing price data.`);
                } else {
                    tokenPriceUsd = foundPrice;
                }
            }

            await prisma.transaction.upsert({
                where: { signature: tx.signature },
                update: {
                    blockTime: tx.blockTime, type: tx.type,
                    tokenAmount: tx.tokenAmount, token_price_usd: tokenPriceUsd,
                    source_wallet_id: sourceWallet.id, destination_wallet_id: destinationWallet.id,
                },
                create: {
                    signature: tx.signature, blockTime: tx.blockTime, type: tx.type,
                    tokenAmount: tx.tokenAmount, token_price_usd: tokenPriceUsd,
                    source_wallet_id: sourceWallet.id, destination_wallet_id: destinationWallet.id,
                },
            });
        }
    } else {
        console.log(`[LOG] No new transactions found, skipping database updates`);
    }

    console.log('[LOG] Data refresh process finished. Starting cost basis calculation...');
    
    // Offload calculation to the new service
    const { calculateAverageCostBasis } = require('./calculationService');
    await calculateAverageCostBasis();

    console.log('[LOG] All backend processes finished.');
}

module.exports = {
  refreshDataViaRPC,
  refreshHolderData,
};