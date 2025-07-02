const prisma = require('../utils/prismaClient');
const databaseCache = require('./databaseCacheService');
const changeDetection = require('./changeDetectionService');

class OptimizedCalculationService {
    constructor() {
        this.calculationQueue = new Map();
        this.isProcessing = false;
        this.batchSize = 10; // Process wallets in batches
    }

    /**
     * Calculate cost basis for specific wallets only (selective recalculation)
     * @param {string[]} walletAddresses - Array of wallet addresses to recalculate
     */
    async calculateCostBasisForWallets(walletAddresses) {
        if (!walletAddresses || walletAddresses.length === 0) {
            console.log('[CALC-OPT] No wallets to recalculate');
            return;
        }

        console.log(`[CALC-OPT] Starting selective cost basis calculation for ${walletAddresses.length} wallets`);
        const startTime = Date.now();

        try {
            // Get wallet IDs from addresses
            const wallets = await prisma.wallet.findMany({
                where: {
                    address: { in: walletAddresses }
                },
                include: {
                    token_holders: true,
                }
            });

            const walletsToProcess = wallets.filter(wallet => 
                wallet.token_holders && wallet.token_holders.length > 0
            );

            console.log(`[CALC-OPT] Found ${walletsToProcess.length} wallets to process`);

            // Process wallets in batches for better performance
            for (let i = 0; i < walletsToProcess.length; i += this.batchSize) {
                const batch = walletsToProcess.slice(i, i + this.batchSize);
                console.log(`[CALC-OPT] Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(walletsToProcess.length / this.batchSize)}`);
                
                await Promise.all(batch.map(wallet => this.calculateWalletCostBasis(wallet)));
                
                // Small delay between batches to prevent database overload
                if (i + this.batchSize < walletsToProcess.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            const duration = Date.now() - startTime;
            console.log(`[CALC-OPT] Selective calculation completed in ${duration}ms for ${walletsToProcess.length} wallets`);

            // Log the operation
            await changeDetection.logApiCall(
                'selective_cost_calculation',
                'calculate_batch',
                true,
                duration,
                null,
                `processed_${walletsToProcess.length}_wallets`
            );

            // Invalidate relevant caches
            await this.invalidateWalletCaches(walletAddresses);

        } catch (error) {
            console.error('[CALC-OPT] Selective calculation error:', error.message);
            
            await changeDetection.logApiCall(
                'selective_cost_calculation',
                'calculate_batch',
                false,
                Date.now() - startTime,
                error.message
            );
            
            throw error;
        }
    }

    /**
     * Calculate cost basis for a single wallet (optimized version)
     * @param {Object} wallet - Wallet object with token_holders
     */
    async calculateWalletCostBasis(wallet) {
        try {
            // Get cached calculation if available and recent
            const cacheKey = `cost_basis_${wallet.address}`;
            const cached = await databaseCache.get(cacheKey);
            
            // Check if we need to recalculate (if no new transactions)
            if (cached && await this.isCostBasisCurrent(wallet.id, cached.last_calculated)) {
                console.log(`[CALC-OPT] Cost basis current for wallet ${wallet.address}`);
                return cached;
            }

            console.log(`[CALC-OPT] Calculating cost basis for wallet ${wallet.address}`);

            // Get all transactions for this wallet, ordered by time
            const transactions = await prisma.transaction.findMany({
                where: {
                    OR: [
                        { source_wallet_id: wallet.id },
                        { destination_wallet_id: wallet.id },
                    ],
                },
                orderBy: {
                    blockTime: 'asc',
                },
                select: {
                    signature: true,
                    blockTime: true,
                    tokenAmount: true,
                    token_price_usd: true,
                    source_wallet_id: true,
                    destination_wallet_id: true
                }
            });

            if (transactions.length === 0) {
                console.log(`[CALC-OPT] No transactions for wallet ${wallet.address}`);
                return null;
            }

            // Perform FIFO calculation
            const result = await this.performFIFOCalculation(wallet, transactions);

            // Update database
            await this.updateWalletCostBasis(wallet.id, result);

            // Cache the result
            await databaseCache.set(cacheKey, {
                ...result,
                last_calculated: Date.now(),
                wallet_address: wallet.address
            }, 3600); // Cache for 1 hour

            return result;

        } catch (error) {
            console.error(`[CALC-OPT] Error calculating cost basis for wallet ${wallet.address}:`, error.message);
            return null;
        }
    }

    /**
     * Check if cost basis calculation is current (no new transactions since last calc)
     * @param {number} walletId - Wallet ID
     * @param {number} lastCalculated - Timestamp of last calculation
     */
    async isCostBasisCurrent(walletId, lastCalculated) {
        if (!lastCalculated) return false;

        try {
            const recentTransaction = await prisma.transaction.findFirst({
                where: {
                    OR: [
                        { source_wallet_id: walletId },
                        { destination_wallet_id: walletId },
                    ],
                    blockTime: { gt: Math.floor(lastCalculated / 1000) } // Convert to seconds
                },
                select: { id: true }
            });

            return !recentTransaction; // Current if no recent transactions
        } catch (error) {
            console.warn(`[CALC-OPT] Error checking calculation currency: ${error.message}`);
            return false; // Assume not current on error
        }
    }

    /**
     * Perform optimized FIFO cost basis calculation
     * @param {Object} wallet - Wallet object
     * @param {Array} transactions - Array of transactions
     */
    async performFIFOCalculation(wallet, transactions) {
        let currentTokens = 0;
        let costBasis = 0;
        let totalAcquired = 0;
        let totalCost = 0;

        // Create a price cache for this calculation
        const priceCache = new Map();

        for (const tx of transactions) {
            const isBuy = tx.destination_wallet_id === wallet.id;
            const tokenAmount = tx.tokenAmount || 0;
            let tokenPrice = tx.token_price_usd;

            if (isBuy) {
                // Handle missing prices more efficiently
                if (tokenPrice === null || tokenPrice === 0) {
                    tokenPrice = await this.getTokenPrice(tx.blockTime, priceCache);
                }

                currentTokens += tokenAmount;
                const transactionCost = tokenAmount * tokenPrice;
                costBasis += transactionCost;
                totalAcquired += tokenAmount;
                totalCost += transactionCost;

            } else { // Sell or transfer out
                if (currentTokens > 0) {
                    const averageCost = costBasis / currentTokens;
                    const costOfSale = Math.min(tokenAmount, currentTokens) * averageCost;
                    
                    costBasis -= costOfSale;
                    currentTokens -= tokenAmount;

                    // Handle oversell situations
                    if (currentTokens < 0) {
                        const oversellAmount = Math.abs(currentTokens);
                        const virtualPrice = await this.getVirtualBuyPrice(wallet.id, priceCache);
                        
                        // Adjust for oversell
                        const oversellCost = oversellAmount * virtualPrice;
                        costBasis += oversellCost;
                        currentTokens = 0;

                        console.log(`[CALC-OPT] Handled oversell for wallet ${wallet.address}: ${oversellAmount} tokens at virtual price ${virtualPrice}`);
                    }
                }
            }

            // Ensure cost basis doesn't go negative
            if (costBasis < 0) {
                costBasis = 0;
            }
        }

        const finalAveragePrice = currentTokens > 0 ? costBasis / currentTokens : 0;

        return {
            average_acquisition_price_usd: finalAveragePrice,
            total_cost_usd: costBasis,
            total_tokens_acquired: currentTokens,
            calculation_metadata: {
                total_transactions: transactions.length,
                total_acquired_ever: totalAcquired,
                total_cost_ever: totalCost,
                calculation_timestamp: Date.now()
            }
        };
    }

    /**
     * Get token price with caching for efficiency
     * @param {number} blockTime - Transaction block time
     * @param {Map} priceCache - Price cache for this calculation
     */
    async getTokenPrice(blockTime, priceCache) {
        const hourTimestamp = Math.floor(blockTime / 3600) * 3600; // Round to hour

        if (priceCache.has(hourTimestamp)) {
            return priceCache.get(hourTimestamp);
        }

        try {
            // Try to find exact hour price
            let priceEntry = await prisma.hourlyPrice.findUnique({
                where: { timestamp: hourTimestamp },
                select: { price_usd: true }
            });

            if (!priceEntry) {
                // Find closest price (within 24 hours)
                priceEntry = await prisma.hourlyPrice.findFirst({
                    where: { 
                        timestamp: { 
                            gte: hourTimestamp - 86400, // 24 hours before
                            lte: hourTimestamp + 86400  // 24 hours after
                        }
                    },
                    orderBy: [
                        { timestamp: 'desc' }
                    ],
                    select: { price_usd: true }
                });
            }

            const price = priceEntry?.price_usd || 0.000000001; // Fallback price
            priceCache.set(hourTimestamp, price);
            
            return price;

        } catch (error) {
            console.warn(`[CALC-OPT] Error getting price for timestamp ${blockTime}: ${error.message}`);
            const fallbackPrice = 0.000000001;
            priceCache.set(hourTimestamp, fallbackPrice);
            return fallbackPrice;
        }
    }

    /**
     * Get virtual buy price for oversell situations
     * @param {number} walletId - Wallet ID
     * @param {Map} priceCache - Price cache
     */
    async getVirtualBuyPrice(walletId, priceCache) {
        try {
            // Get earliest transaction price for this wallet
            const earliestTx = await prisma.transaction.findFirst({
                where: {
                    destination_wallet_id: walletId,
                    token_price_usd: { gt: 0 }
                },
                orderBy: { blockTime: 'asc' },
                select: { token_price_usd: true, blockTime: true }
            });

            if (earliestTx) {
                return earliestTx.token_price_usd;
            }

            // Fallback to earliest available price
            const earliestPrice = await prisma.hourlyPrice.findFirst({
                orderBy: { timestamp: 'asc' },
                select: { price_usd: true }
            });

            return earliestPrice?.price_usd || 0.000000001;

        } catch (error) {
            console.warn(`[CALC-OPT] Error getting virtual buy price: ${error.message}`);
            return 0.000000001;
        }
    }

    /**
     * Update wallet cost basis in database
     * @param {number} walletId - Wallet ID
     * @param {Object} result - Calculation result
     */
    async updateWalletCostBasis(walletId, result) {
        try {
            await prisma.tokenHolder.update({
                where: { wallet_id: walletId },
                data: {
                    average_acquisition_price_usd: result.average_acquisition_price_usd,
                    total_cost_usd: result.total_cost_usd,
                    total_tokens_acquired: result.total_tokens_acquired,
                    last_updated: new Date()
                }
            });
        } catch (error) {
            console.error(`[CALC-OPT] Error updating cost basis for wallet ${walletId}: ${error.message}`);
        }
    }

    /**
     * Invalidate wallet-related caches
     * @param {string[]} walletAddresses - Array of wallet addresses
     */
    async invalidateWalletCaches(walletAddresses) {
        try {
            for (const address of walletAddresses) {
                await databaseCache.delete(`wallet_balance_${address}`);
                await databaseCache.delete(`cost_basis_${address}`);
            }

            // Invalidate general caches that might include these wallets
            await databaseCache.clear('token_holders_*');
            
            console.log(`[CALC-OPT] Invalidated caches for ${walletAddresses.length} wallets`);
        } catch (error) {
            console.warn(`[CALC-OPT] Error invalidating caches: ${error.message}`);
        }
    }

    /**
     * Queue wallets for cost basis recalculation
     * @param {string[]} walletAddresses - Wallet addresses to queue
     */
    async queueWalletsForRecalculation(walletAddresses) {
        const timestamp = Date.now();
        
        walletAddresses.forEach(address => {
            this.calculationQueue.set(address, {
                address,
                queued_at: timestamp,
                priority: 'normal'
            });
        });

        console.log(`[CALC-OPT] Queued ${walletAddresses.length} wallets for recalculation`);

        // Process queue if not already processing
        if (!this.isProcessing) {
            this.processCalculationQueue();
        }
    }

    /**
     * Process the calculation queue
     */
    async processCalculationQueue() {
        if (this.isProcessing || this.calculationQueue.size === 0) {
            return;
        }

        this.isProcessing = true;
        console.log(`[CALC-OPT] Processing calculation queue with ${this.calculationQueue.size} items`);

        try {
            const queuedWallets = Array.from(this.calculationQueue.values());
            const walletAddresses = queuedWallets.map(item => item.address);

            // Clear queue before processing
            this.calculationQueue.clear();

            // Process the calculations
            await this.calculateCostBasisForWallets(walletAddresses);

        } catch (error) {
            console.error('[CALC-OPT] Error processing calculation queue:', error.message);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Get calculation queue statistics
     */
    getQueueStats() {
        return {
            queued_items: this.calculationQueue.size,
            is_processing: this.isProcessing,
            batch_size: this.batchSize,
            queue_items: Array.from(this.calculationQueue.values())
        };
    }

    /**
     * Fallback to original calculation method for all wallets
     */
    async calculateAllWallets() {
        console.log('[CALC-OPT] Falling back to full calculation for all wallets');
        
        // Import original calculation service
        const { calculateAverageCostBasis } = require('./calculationService');
        return await calculateAverageCostBasis();
    }
}

// Export singleton instance
module.exports = new OptimizedCalculationService();