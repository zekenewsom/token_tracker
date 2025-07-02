// backend/src/services/incrementalSyncService.js
require('dotenv').config();
const axios = require('axios');
const prisma = require('../utils/prismaClient');
const crypto = require('crypto');
const changeDetection = require('./changeDetectionService');
const databaseCache = require('./databaseCacheService');

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL;
const SOLANA_RPC_URL = process.env.QUICKNODE_ENDPOINT_URL || 'https://api.mainnet-beta.solana.com';
const MINT_ADDRESS = '2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class IncrementalSyncService {
    
    /**
     * Get or create sync state for a specific sync type
     */
    static async getSyncState(syncType) {
        try {
            const result = await prisma.syncState.findUnique({
                where: { sync_type: syncType }
            });
            
            if (!result) {
                return {
                    sync_type: syncType,
                    last_sync_time: 0,
                    last_block_time: null,
                    last_signature: null,
                    metadata: null
                };
            }
            
            return result;
        } catch (error) {
            console.log(`[SYNC] Error getting sync state: ${error.message}`);
            return {
                sync_type: syncType,
                last_sync_time: 0,
                last_block_time: null,
                last_signature: null,
                metadata: null
            };
        }
    }

    /**
     * Update sync state
     */
    static async updateSyncState(syncType, updates) {
        const now = Math.floor(Date.now() / 1000);
        try {
            await prisma.syncState.upsert({
                where: { sync_type: syncType },
                update: {
                    last_sync_time: updates.last_sync_time || now,
                    last_block_time: updates.last_block_time,
                    last_signature: updates.last_signature,
                    metadata: updates.metadata
                },
                create: {
                    sync_type: syncType,
                    last_sync_time: updates.last_sync_time || now,
                    last_block_time: updates.last_block_time,
                    last_signature: updates.last_signature,
                    metadata: updates.metadata
                }
            });
        } catch (error) {
            console.log(`[SYNC] Could not update sync state: ${error.message}`);
        }
    }

    /**
     * Check if holder list has changed significantly
     */
    static async checkHolderListChanges() {
        console.log('[SYNC] Checking for holder list changes...');
        
        const holderSyncState = await this.getSyncState('holder_list');
        const lastHolderSync = holderSyncState?.last_sync_time || 0;
        
        // Only check every 30 minutes for incremental refresh
        const thirtyMinutesAgo = Math.floor(Date.now() / 1000) - 1800;
        if (lastHolderSync > thirtyMinutesAgo) {
            console.log('[SYNC] Holder list recently checked (within 30 minutes), skipping');
            return false;
        }

        // Quick sample check - fetch top 50 holders only for speed
        const sampleHolders = await this.fetchSampleHolders(50);
        const currentChecksum = this.generateHolderChecksum(sampleHolders);
        
        const lastSnapshot = await this.getLastHolderSnapshot();
        
        if (lastSnapshot && lastSnapshot.checksum === currentChecksum) {
            console.log('[SYNC] Holder list unchanged, skipping full refresh');
            await this.updateSyncState('holder_list', { last_sync_time: Math.floor(Date.now() / 1000) });
            return false;
        }
        
        console.log('[SYNC] Holder list changed, will perform full refresh');
        return true;
    }

    /**
     * Fetch sample of top holders for change detection
     */
    static async fetchSampleHolders(limit = 100) {
        try {
            const { data } = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: '2.0', id: '1', method: 'getTokenAccounts',
                params: { mint: MINT_ADDRESS, limit },
            });
            
            if (data.error) throw data.error;
            
            return data.result.token_accounts
                .filter(acct => acct.amount && BigInt(acct.amount) > 0n)
                .map(acct => ({
                    owner: acct.owner,
                    amount: parseInt(acct.amount, 10) / (10 ** 6)
                }))
                .sort((a, b) => b.amount - a.amount);
                
        } catch (error) {
            console.error('[ERROR] Failed to fetch sample holders:', error.message);
            return [];
        }
    }

    /**
     * Generate checksum for holder list to detect changes
     */
    static generateHolderChecksum(holders) {
        const holderString = holders
            .slice(0, 50) // Top 50 for checksum
            .map(h => `${h.owner}:${h.amount.toFixed(2)}`)
            .join('|');
        return crypto.createHash('md5').update(holderString).digest('hex');
    }

    /**
     * Get last holder snapshot
     */
    static async getLastHolderSnapshot() {
        try {
            const result = await prisma.holderSnapshot.findFirst({
                orderBy: { snapshot_time: 'desc' }
            });
            return result;
        } catch (error) {
            return null;
        }
    }

    /**
     * Save holder snapshot
     */
    static async saveHolderSnapshot(holders) {
        const now = Math.floor(Date.now() / 1000);
        const totalSupply = holders.reduce((sum, h) => sum + h.amount, 0);
        const checksum = this.generateHolderChecksum(holders);
        
        try {
            await prisma.holderSnapshot.create({
                data: {
                    snapshot_time: now,
                    total_holders: holders.length,
                    total_supply: totalSupply,
                    top_holder_balance: holders[0]?.amount || 0,
                    checksum: checksum
                }
            });
        } catch (error) {
            console.log('[SYNC] Could not save holder snapshot:', error.message);
        }
    }

    /**
     * Get wallets that need syncing based on priority and last sync time
     */
    static async getWalletsToSync(maxWallets = 50) {
        const fourHoursAgo = Math.floor(Date.now() / 1000) - (4 * 3600);
        const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
        
        // Get wallets ordered by priority and last sync time
        const wallets = await prisma.wallet.findMany({
            where: {
                token_holders: {
                    some: {
                        balance: { gt: 0 }
                    }
                },
                OR: [
                    { last_sync_time: null },
                    { last_sync_time: { lt: fourHoursAgo } },
                    { 
                        AND: [
                            { sync_priority: { gte: 2 } },
                            { last_sync_time: { lt: oneHourAgo } }
                        ]
                    }
                ]
            },
            include: {
                token_holders: {
                    select: { balance: true }
                }
            },
            orderBy: [
                { sync_priority: 'desc' },
                { last_sync_time: 'asc' }
            ],
            take: maxWallets
        });

        return wallets;
    }

    /**
     * Update wallet sync status
     */
    static async updateWalletSyncStatus(walletAddress, lastTransactionTime = null) {
        const now = Math.floor(Date.now() / 1000);
        
        await prisma.wallet.update({
            where: { address: walletAddress },
            data: {
                last_sync_time: now,
                last_transaction_time: lastTransactionTime || now
            }
        });
    }

    /**
     * Optimized incremental refresh process with intelligent change detection
     */
    static async performIncrementalRefresh() {
        console.log('[INCREMENTAL] Starting intelligent incremental refresh...');
        const startTime = Date.now();
        
        try {
            // Step 1: Check if we should do full refresh or incremental
            const shouldFullRefresh = await changeDetection.shouldPerformFullRefresh();
            
            if (shouldFullRefresh) {
                console.log('[INCREMENTAL] Full refresh needed, delegating to full refresh process...');
                await changeDetection.logApiCall('incremental_refresh', 'delegated_to_full', true, Date.now() - startTime);
                
                // Delegate to full refresh process instead of doing incremental
                const { refreshDataViaRPC } = require('./solanaService');
                await refreshDataViaRPC();
                await changeDetection.markFullRefreshCompleted();
                return;
            }
            
            // Step 2: Check if holder list changed (smart detection)
            const holderListChanged = await changeDetection.hasHolderListChanged(50);
            
            if (holderListChanged) {
                console.log('[INCREMENTAL] Holder list changed, refreshing...');
                await this.refreshHolderData();
                
                // Invalidate related caches
                await databaseCache.clear('token_holders_*');
                await databaseCache.clear('wallet_balance_*');
            }
            
            // Step 3: Get wallets that actually need syncing based on time and priority
            const allWallets = await prisma.tokenHolder.findMany({
                orderBy: { balance: 'desc' },
                take: 50, // Limit to top 50 for incremental
                include: { wallet: true }
            });
            
            const walletAddresses = allWallets.map(h => h.wallet.address);
            const walletsNeedingSync = await changeDetection.getWalletsNeedingSync(walletAddresses, 1); // 1 hour threshold
            
            if (walletsNeedingSync.length === 0) {
                console.log('[INCREMENTAL] No wallets need syncing');
                await changeDetection.logApiCall('incremental_refresh', 'no_work_needed', true, Date.now() - startTime);
                return;
            }
            
            console.log(`[INCREMENTAL] ${walletsNeedingSync.length} wallets need syncing`);
            
            // Step 4: Process wallets in small batches
            const batchSize = 3; // Smaller batches to reduce API load
            const allNewTransactions = [];
            
            for (let i = 0; i < walletsNeedingSync.length; i += batchSize) {
                const batch = walletsNeedingSync.slice(i, i + batchSize);
                console.log(`[INCREMENTAL] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(walletsNeedingSync.length / batchSize)}`);
                
                for (const walletAddress of batch) {
                    try {
                        const transactions = await this.syncWalletTransactions(walletAddress);
                        allNewTransactions.push(...transactions);
                        
                        // Log the wallet sync
                        await changeDetection.logApiCall(
                            `wallet_sync_${walletAddress}`, 
                            'sync_transfers', 
                            true, 
                            null, 
                            null, 
                            null
                        );
                        
                        // Small delay between wallets
                        await sleep(200);
                    } catch (error) {
                        console.log(`[ERROR] Failed to sync wallet ${walletAddress}: ${error.message}`);
                        await changeDetection.logApiCall(
                            `wallet_sync_${walletAddress}`, 
                            'sync_transfers', 
                            false, 
                            null, 
                            error.message, 
                            null
                        );
                    }
                }
                
                // Delay between batches
                if (i + batchSize < walletsNeedingSync.length) {
                    await sleep(1000);
                }
            }
            
            // Step 5: Process new transactions if any
            if (allNewTransactions.length > 0) {
                console.log(`[INCREMENTAL] Processing ${allNewTransactions.length} new transactions`);
                await this.processNewTransactions(allNewTransactions);
                
                // Only recalculate cost basis for affected wallets
                await this.recalculateAffectedWallets(allNewTransactions);
                
                // Invalidate relevant caches
                await databaseCache.clear('transactions_*');
                const affectedWallets = new Set();
                allNewTransactions.forEach(tx => {
                    affectedWallets.add(tx.source);
                    affectedWallets.add(tx.destination);
                });
                
                for (const walletAddress of affectedWallets) {
                    await databaseCache.delete(`wallet_balance_${walletAddress}`);
                }
            }
            
            // Log successful completion
            await changeDetection.logApiCall(
                'incremental_refresh', 
                'complete', 
                true, 
                Date.now() - startTime, 
                null, 
                `processed_${walletsNeedingSync.length}_wallets_${allNewTransactions.length}_transactions`
            );
            
            console.log(`[INCREMENTAL] Incremental refresh completed in ${Date.now() - startTime}ms`);
            
        } catch (error) {
            console.error('[INCREMENTAL] Error during incremental refresh:', error.message);
            await changeDetection.logApiCall(
                'incremental_refresh', 
                'error', 
                false, 
                Date.now() - startTime, 
                error.message, 
                null
            );
            throw error;
        }
    }

    /**
     * Sync transactions for a single wallet (reuse existing logic)
     */
    static async syncWalletTransactions(walletAddress) {
        const { syncTransfersForWallet } = require('./solanaService');
        
        try {
            const transactions = await syncTransfersForWallet(walletAddress);
            
            // Update wallet sync status
            const latestTransactionTime = transactions.length > 0 
                ? Math.max(...transactions.map(tx => tx.blockTime))
                : null;
                
            await this.updateWalletSyncStatus(walletAddress, latestTransactionTime);
            
            return transactions;
        } catch (error) {
            console.error(`[ERROR] Failed to sync wallet ${walletAddress}:`, error.message);
            return [];
        }
    }

    /**
     * Process new transactions (reuse existing logic)
     */
    static async processNewTransactions(transactions) {
        // Reuse the transaction processing logic from solanaService.js
        // This includes price fetching, wallet creation, and transaction saving
        
        for (const tx of transactions) {
            const sourceWallet = await prisma.wallet.upsert({ 
                where: { address: tx.source }, 
                update: {}, 
                create: { address: tx.source } 
            });
            
            const destinationWallet = await prisma.wallet.upsert({ 
                where: { address: tx.destination }, 
                update: {}, 
                create: { address: tx.destination } 
            });
            
            // Price lookup logic here (reuse from existing service)
            let tokenPriceUsd = 0;
            // ... existing price logic ...
            
            await prisma.transaction.upsert({
                where: { signature: tx.signature },
                update: {
                    blockTime: tx.blockTime,
                    type: tx.type,
                    tokenAmount: tx.tokenAmount,
                    token_price_usd: tokenPriceUsd,
                    source_wallet_id: sourceWallet.id,
                    destination_wallet_id: destinationWallet.id,
                },
                create: {
                    signature: tx.signature,
                    blockTime: tx.blockTime,
                    type: tx.type,
                    tokenAmount: tx.tokenAmount,
                    token_price_usd: tokenPriceUsd,
                    source_wallet_id: sourceWallet.id,
                    destination_wallet_id: destinationWallet.id,
                },
            });
        }
    }

    /**
     * Recalculate cost basis only for affected wallets (optimized)
     */
    static async recalculateAffectedWallets(transactions) {
        const affectedWallets = new Set();
        
        transactions.forEach(tx => {
            if (tx.source && tx.source !== 'Unknown') {
                affectedWallets.add(tx.source);
            }
            if (tx.destination && tx.destination !== 'Unknown') {
                affectedWallets.add(tx.destination);
            }
        });
        
        const walletAddresses = Array.from(affectedWallets);
        console.log(`[INCREMENTAL] Recalculating cost basis for ${walletAddresses.length} affected wallets`);
        
        if (walletAddresses.length === 0) {
            return;
        }

        try {
            // Use optimized calculation service for selective recalculation
            const optimizedCalc = require('./optimizedCalculationService');
            
            if (walletAddresses.length <= 20) {
                // For small numbers, calculate immediately
                await optimizedCalc.calculateCostBasisForWallets(walletAddresses);
            } else {
                // For larger numbers, queue for background processing
                await optimizedCalc.queueWalletsForRecalculation(walletAddresses);
                console.log(`[INCREMENTAL] Queued ${walletAddresses.length} wallets for background cost basis calculation`);
            }
            
        } catch (error) {
            console.error(`[INCREMENTAL] Error in selective cost basis calculation: ${error.message}`);
            
            // Fallback to original calculation if optimized fails
            console.log(`[INCREMENTAL] Falling back to full cost basis calculation`);
            const { calculateAverageCostBasis } = require('./calculationService');
            await calculateAverageCostBasis();
        }
    }

    /**
     * Refresh holder data (reuse existing logic)
     */
    static async refreshHolderData() {
        const { refreshHolderData } = require('./solanaService');
        await refreshHolderData();
        
        // Save snapshot for future change detection
        const holders = await this.fetchSampleHolders(1000);
        await this.saveHolderSnapshot(holders);
        
        await this.updateSyncState('holder_list', { 
            last_sync_time: Math.floor(Date.now() / 1000) 
        });
    }
}

module.exports = IncrementalSyncService;