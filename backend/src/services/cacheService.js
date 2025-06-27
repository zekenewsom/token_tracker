const prisma = require('../utils/prismaClient');

// Total supply constant for percentage calculation
const TOTAL_SUPPLY = 1000000000; // 1 billion tokens

// In-memory cache for frequently accessed data
const cache = {
    // Token holder data cache
    tokenHolders: {
        data: null,
        lastUpdated: null,
        ttl: 5 * 60 * 1000, // 5 minutes
    },
    
    // Top holders cache
    topHolders: {
        data: null,
        lastUpdated: null,
        ttl: 10 * 60 * 1000, // 10 minutes
    },
    
    // Wallet balance cache
    walletBalances: new Map(),
    walletBalanceTtl: 2 * 60 * 1000, // 2 minutes
    
    // Transaction cache
    transactions: {
        data: null,
        lastUpdated: null,
        ttl: 1 * 60 * 1000, // 1 minute
    },
    
    // Price data cache
    priceData: new Map(),
    priceDataTtl: 30 * 60 * 1000, // 30 minutes
    
    // Average acquisition price cache
    avgAcquisitionPrices: new Map(),
    avgAcquisitionPriceTtl: 5 * 60 * 1000, // 5 minutes
};

// Cache utility functions
function isCacheValid(cacheEntry) {
    return cacheEntry.data !== null && 
           cacheEntry.lastUpdated !== null && 
           (Date.now() - cacheEntry.lastUpdated) < cacheEntry.ttl;
}

function clearExpiredCache() {
    const now = Date.now();
    
    // Clear expired wallet balances
    for (const [key, entry] of cache.walletBalances.entries()) {
        if (now - entry.lastUpdated > cache.walletBalanceTtl) {
            cache.walletBalances.delete(key);
        }
    }
    
    // Clear expired price data
    for (const [key, entry] of cache.priceData.entries()) {
        if (now - entry.lastUpdated > cache.priceDataTtl) {
            cache.priceData.delete(key);
        }
    }
    
    // Clear expired average acquisition prices
    for (const [key, entry] of cache.avgAcquisitionPrices.entries()) {
        if (now - entry.lastUpdated > cache.avgAcquisitionPriceTtl) {
            cache.avgAcquisitionPrices.delete(key);
        }
    }
}

// Helper function to calculate percentage of ownership
function calculateOwnershipPercentage(balance) {
    return (balance / TOTAL_SUPPLY) * 100;
}

// Token Holders Cache
async function getCachedTokenHolders(limit = 1000) {
    if (!isCacheValid(cache.tokenHolders)) {
        console.log(`[CACHE] Refreshing token holders cache for limit: ${limit}...`);
        
        const holders = await prisma.tokenHolder.findMany({
            take: limit,
            orderBy: { balance: 'desc' },
            include: {
                wallet: {
                    select: { address: true },
                },
            },
        });
        
        // Add percentage of ownership to each holder
        const holdersWithPercentage = holders.map(holder => ({
            ...holder,
            ownership_percentage: calculateOwnershipPercentage(holder.balance)
        }));
        
        cache.tokenHolders.data = holdersWithPercentage;
        cache.tokenHolders.lastUpdated = Date.now();
    }
    
    // Return the requested number of holders
    return cache.tokenHolders.data.slice(0, limit);
}

// Top Holders Cache
async function getCachedTopHolders(limit = 1000) {
    const cacheKey = `top_${limit}`;
    
    if (!cache.topHolders.data || !isCacheValid(cache.topHolders)) {
        console.log(`[CACHE] Refreshing top holders cache for limit: ${limit}...`);
        
        const holders = await prisma.tokenHolder.findMany({
            take: limit,
            orderBy: { balance: 'desc' },
            include: {
                wallet: {
                    select: { address: true },
                },
            },
        });
        
        // Add percentage of ownership to each holder
        const holdersWithPercentage = holders.map(holder => ({
            ...holder,
            ownership_percentage: calculateOwnershipPercentage(holder.balance)
        }));
        
        cache.topHolders.data = holdersWithPercentage;
        cache.topHolders.lastUpdated = Date.now();
    }
    
    return cache.topHolders.data.slice(0, limit);
}

// Wallet Balance Cache
async function getCachedWalletBalance(address) {
    const cacheKey = `wallet_${address}`;
    
    if (!cache.walletBalances.has(cacheKey) || 
        (Date.now() - cache.walletBalances.get(cacheKey).lastUpdated) > cache.walletBalanceTtl) {
        
        console.log(`[CACHE] Refreshing wallet balance cache for ${address}...`);
        
        const wallet = await prisma.wallet.findUnique({
            where: { address },
            include: {
                token_holders: {
                    select: {
                        balance: true,
                        average_acquisition_price_usd: true,
                        total_cost_usd: true,
                        total_tokens_acquired: true
                    }
                }
            }
        });
        
        if (!wallet) {
            return null;
        }
        
        const totalBalance = wallet.token_holders.reduce((sum, holder) => sum + holder.balance, 0);
        const result = {
            address,
            total_balance: totalBalance,
            ownership_percentage: calculateOwnershipPercentage(totalBalance),
            token_holdings: wallet.token_holders.map(holder => ({
                ...holder,
                ownership_percentage: calculateOwnershipPercentage(holder.balance)
            }))
        };
        
        cache.walletBalances.set(cacheKey, {
            data: result,
            lastUpdated: Date.now()
        });
    }
    
    return cache.walletBalances.get(cacheKey).data;
}

// Transactions Cache
async function getCachedTransactions(page = 1, limit = 100) {
    const cacheKey = `transactions_${page}_${limit}`;
    
    if (!cache.transactions.data || !isCacheValid(cache.transactions)) {
        console.log('[CACHE] Refreshing transactions cache...');
        
        const offset = (page - 1) * limit;
        const transactions = await prisma.transaction.findMany({
            skip: offset,
            take: limit,
            orderBy: { blockTime: 'desc' },
            include: {
                sourceWallet: { select: { address: true } },
                destinationWallet: { select: { address: true } }
            }
        });
        
        const result = transactions.map(t => ({
            signature: t.signature,
            block_time: t.blockTime,
            type: t.type,
            token_amount: t.tokenAmount,
            sol_amount: t.solAmount,
            source_address: t.sourceWallet ? t.sourceWallet.address : null,
            destination_address: t.destinationWallet ? t.destinationWallet.address : null
        }));
        
        cache.transactions.data = result;
        cache.transactions.lastUpdated = Date.now();
    }
    
    return cache.transactions.data;
}

// Price Data Cache
async function getCachedPriceData(timestamp) {
    const cacheKey = `price_${timestamp}`;
    
    if (!cache.priceData.has(cacheKey) || 
        (Date.now() - cache.priceData.get(cacheKey).lastUpdated) > cache.priceDataTtl) {
        
        const priceEntry = await prisma.hourlyPrice.findUnique({
            where: { timestamp: timestamp }
        });
        
        cache.priceData.set(cacheKey, {
            data: priceEntry ? priceEntry.price_usd : null,
            lastUpdated: Date.now()
        });
    }
    
    return cache.priceData.get(cacheKey).data;
}

// Average Acquisition Price Cache
async function getCachedAvgAcquisitionPrice(address) {
    const cacheKey = `avg_price_${address}`;
    
    if (!cache.avgAcquisitionPrices.has(cacheKey) || 
        (Date.now() - cache.avgAcquisitionPrices.get(cacheKey).lastUpdated) > cache.avgAcquisitionPriceTtl) {
        
        console.log(`[CACHE] Refreshing average acquisition price cache for ${address}...`);
        
        const wallet = await prisma.wallet.findUnique({
            where: { address },
            include: {
                token_holders: {
                    select: {
                        balance: true,
                        average_acquisition_price_usd: true,
                        total_cost_usd: true,
                        total_tokens_acquired: true
                    }
                }
            }
        });
        
        if (!wallet || wallet.token_holders.length === 0) {
            cache.avgAcquisitionPrices.set(cacheKey, {
                data: { weighted_avg_price: 0, total_balance: 0, total_cost: 0, ownership_percentage: 0 },
                lastUpdated: Date.now()
            });
            return cache.avgAcquisitionPrices.get(cacheKey).data;
        }
        
        // Calculate weighted average
        let totalWeightedCost = 0;
        let totalBalance = 0;
        let totalCost = 0;
        
        wallet.token_holders.forEach(holder => {
            if (holder.balance > 0 && holder.average_acquisition_price_usd) {
                const weightedCost = holder.balance * holder.average_acquisition_price_usd;
                totalWeightedCost += weightedCost;
                totalBalance += holder.balance;
                totalCost += holder.total_cost_usd || 0;
            }
        });
        
        const weightedAvgPrice = totalBalance > 0 ? totalWeightedCost / totalBalance : 0;
        
        const result = {
            address,
            weighted_avg_price: weightedAvgPrice,
            total_balance: totalBalance,
            total_cost: totalCost,
            ownership_percentage: calculateOwnershipPercentage(totalBalance),
            token_holdings_count: wallet.token_holders.length,
            individual_holdings: wallet.token_holders.map(holder => ({
                ...holder,
                ownership_percentage: calculateOwnershipPercentage(holder.balance)
            }))
        };
        
        cache.avgAcquisitionPrices.set(cacheKey, {
            data: result,
            lastUpdated: Date.now()
        });
    }
    
    return cache.avgAcquisitionPrices.get(cacheKey).data;
}

// Cache invalidation functions
function invalidateTokenHoldersCache() {
    cache.tokenHolders.data = null;
    cache.tokenHolders.lastUpdated = null;
    console.log('[CACHE] Token holders cache invalidated');
}

function invalidateTopHoldersCache() {
    cache.topHolders.data = null;
    cache.topHolders.lastUpdated = null;
    console.log('[CACHE] Top holders cache invalidated');
}

function invalidateWalletBalanceCache(address = null) {
    if (address) {
        cache.walletBalances.delete(`wallet_${address}`);
        console.log(`[CACHE] Wallet balance cache invalidated for ${address}`);
    } else {
        cache.walletBalances.clear();
        console.log('[CACHE] All wallet balance caches invalidated');
    }
}

function invalidateTransactionsCache() {
    cache.transactions.data = null;
    cache.transactions.lastUpdated = null;
    console.log('[CACHE] Transactions cache invalidated');
}

function invalidatePriceDataCache(timestamp = null) {
    if (timestamp) {
        cache.priceData.delete(`price_${timestamp}`);
        console.log(`[CACHE] Price data cache invalidated for timestamp ${timestamp}`);
    } else {
        cache.priceData.clear();
        console.log('[CACHE] All price data caches invalidated');
    }
}

function invalidateAvgAcquisitionPriceCache(address = null) {
    if (address) {
        cache.avgAcquisitionPrices.delete(`avg_price_${address}`);
        console.log(`[CACHE] Average acquisition price cache invalidated for ${address}`);
    } else {
        cache.avgAcquisitionPrices.clear();
        console.log('[CACHE] All average acquisition price caches invalidated');
    }
}

// Clear all caches
function clearAllCaches() {
    cache.tokenHolders.data = null;
    cache.tokenHolders.lastUpdated = null;
    cache.topHolders.data = null;
    cache.topHolders.lastUpdated = null;
    cache.walletBalances.clear();
    cache.transactions.data = null;
    cache.transactions.lastUpdated = null;
    cache.priceData.clear();
    cache.avgAcquisitionPrices.clear();
    console.log('[CACHE] All caches cleared');
}

// Cache statistics
function getCacheStats() {
    return {
        tokenHolders: {
            cached: cache.tokenHolders.data !== null,
            lastUpdated: cache.tokenHolders.lastUpdated,
            ttl: cache.tokenHolders.ttl
        },
        topHolders: {
            cached: cache.topHolders.data !== null,
            lastUpdated: cache.topHolders.lastUpdated,
            ttl: cache.topHolders.ttl
        },
        walletBalances: {
            cachedEntries: cache.walletBalances.size,
            ttl: cache.walletBalanceTtl
        },
        transactions: {
            cached: cache.transactions.data !== null,
            lastUpdated: cache.transactions.lastUpdated,
            ttl: cache.transactions.ttl
        },
        priceData: {
            cachedEntries: cache.priceData.size,
            ttl: cache.priceDataTtl
        },
        avgAcquisitionPrices: {
            cachedEntries: cache.avgAcquisitionPrices.size,
            ttl: cache.avgAcquisitionPriceTtl
        }
    };
}

// Set up periodic cache cleanup
setInterval(clearExpiredCache, 60 * 1000); // Clean up every minute

module.exports = {
    // Cache getters
    getCachedTokenHolders,
    getCachedTopHolders,
    getCachedWalletBalance,
    getCachedTransactions,
    getCachedPriceData,
    getCachedAvgAcquisitionPrice,
    
    // Cache invalidation
    invalidateTokenHoldersCache,
    invalidateTopHoldersCache,
    invalidateWalletBalanceCache,
    invalidateTransactionsCache,
    invalidatePriceDataCache,
    invalidateAvgAcquisitionPriceCache,
    clearAllCaches,
    
    // Cache management
    getCacheStats,
    clearExpiredCache,
    
    // Utility functions
    calculateOwnershipPercentage,
    TOTAL_SUPPLY
}; 