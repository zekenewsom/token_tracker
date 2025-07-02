const prisma = require('../utils/prismaClient');
const crypto = require('crypto');

class DatabaseCacheService {
    constructor() {
        this.cleanupInterval = 60 * 60 * 1000; // Cleanup every hour
        this.startCleanupProcess();
    }

    /**
     * Get cached data by key
     * @param {string} key - Cache key
     * @returns {any|null} - Cached data or null if miss/expired
     */
    async get(key) {
        try {
            const entry = await prisma.cacheEntry.findUnique({
                where: { cache_key: key }
            });

            if (!entry) {
                console.log(`[DB-CACHE] Miss for key: ${key}`);
                return null; // Cache miss
            }

            if (entry.expires_at < new Date()) {
                console.log(`[DB-CACHE] Expired for key: ${key}`);
                // Clean up expired entry
                await prisma.cacheEntry.delete({
                    where: { id: entry.id }
                }).catch(() => {}); // Ignore deletion errors
                return null;
            }

            // Update access tracking (fire and forget)
            prisma.cacheEntry.update({
                where: { id: entry.id },
                data: { 
                    accessed_at: new Date(),
                    hit_count: { increment: 1 }
                }
            }).catch(() => {}); // Don't block on access tracking

            console.log(`[DB-CACHE] Hit for key: ${key} (hits: ${entry.hit_count + 1})`);
            return entry.data;
        } catch (error) {
            console.error(`[DB-CACHE] Error getting key ${key}:`, error.message);
            return null;
        }
    }

    /**
     * Set cached data with TTL
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     * @param {number} ttlSeconds - Time to live in seconds (default: 1 hour)
     */
    async set(key, data, ttlSeconds = 3600) {
        try {
            const expiresAt = new Date(Date.now() + (ttlSeconds * 1000));

            await prisma.cacheEntry.upsert({
                where: { cache_key: key },
                update: { 
                    data, 
                    expires_at: expiresAt,
                    accessed_at: new Date()
                },
                create: { 
                    cache_key: key, 
                    data, 
                    expires_at: expiresAt 
                }
            });

            console.log(`[DB-CACHE] Set key: ${key} (TTL: ${ttlSeconds}s)`);
        } catch (error) {
            console.error(`[DB-CACHE] Error setting key ${key}:`, error.message);
        }
    }

    /**
     * Delete specific cache entry
     * @param {string} key - Cache key to delete
     */
    async delete(key) {
        try {
            await prisma.cacheEntry.delete({
                where: { cache_key: key }
            });
            console.log(`[DB-CACHE] Deleted key: ${key}`);
        } catch (error) {
            if (error.code !== 'P2025') { // Not found error
                console.error(`[DB-CACHE] Error deleting key ${key}:`, error.message);
            }
        }
    }

    /**
     * Clear all cache entries matching pattern
     * @param {string} pattern - Pattern to match (supports wildcards with %)
     */
    async clear(pattern = null) {
        try {
            if (pattern) {
                // For SQLite, we need to use LIKE with wildcards
                const sqlPattern = pattern.replace(/\*/g, '%');
                await prisma.$executeRaw`DELETE FROM CacheEntry WHERE cache_key LIKE ${sqlPattern}`;
                console.log(`[DB-CACHE] Cleared entries matching: ${pattern}`);
            } else {
                await prisma.cacheEntry.deleteMany({});
                console.log(`[DB-CACHE] Cleared all cache entries`);
            }
        } catch (error) {
            console.error(`[DB-CACHE] Error clearing cache:`, error.message);
        }
    }

    /**
     * Get cache statistics
     */
    async getStats() {
        try {
            const [total, expired, topHit] = await Promise.all([
                prisma.cacheEntry.count(),
                prisma.cacheEntry.count({
                    where: { expires_at: { lt: new Date() } }
                }),
                prisma.cacheEntry.findFirst({
                    orderBy: { hit_count: 'desc' },
                    select: { cache_key: true, hit_count: true }
                })
            ]);

            const hitStats = await prisma.cacheEntry.aggregate({
                _avg: { hit_count: true },
                _sum: { hit_count: true }
            });

            return {
                total_entries: total,
                expired_entries: expired,
                active_entries: total - expired,
                total_hits: hitStats._sum.hit_count || 0,
                average_hits: hitStats._avg.hit_count || 0,
                top_key: topHit?.cache_key || null,
                top_hits: topHit?.hit_count || 0
            };
        } catch (error) {
            console.error(`[DB-CACHE] Error getting stats:`, error.message);
            return {};
        }
    }

    /**
     * Cached wrapper for frequently accessed database queries
     */
    async getCachedTokenHolders(limit = 1000, ttlSeconds = 21600) { // 6 hours default
        const cacheKey = `token_holders_${limit}`;
        let cached = await this.get(cacheKey);
        
        if (cached) {
            return cached;
        }

        console.log(`[DB-CACHE] Fetching token holders from database (limit: ${limit})`);
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
        const TOTAL_SUPPLY = 1000000000; // 1 billion tokens
        const holdersWithPercentage = holders.map(holder => ({
            ...holder,
            ownership_percentage: (holder.balance / TOTAL_SUPPLY) * 100
        }));

        await this.set(cacheKey, holdersWithPercentage, ttlSeconds);
        return holdersWithPercentage;
    }

    /**
     * Cached wrapper for wallet balance queries
     */
    async getCachedWalletBalance(address, ttlSeconds = 7200) { // 2 hours default
        const cacheKey = `wallet_balance_${address}`;
        let cached = await this.get(cacheKey);
        
        if (cached) {
            return cached;
        }

        console.log(`[DB-CACHE] Fetching wallet balance from database: ${address}`);
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

        const TOTAL_SUPPLY = 1000000000;
        const totalBalance = wallet.token_holders.reduce((sum, holder) => sum + holder.balance, 0);
        
        const result = {
            address,
            total_balance: totalBalance,
            ownership_percentage: (totalBalance / TOTAL_SUPPLY) * 100,
            token_holdings: wallet.token_holders.map(holder => ({
                ...holder,
                ownership_percentage: (holder.balance / TOTAL_SUPPLY) * 100
            }))
        };

        await this.set(cacheKey, result, ttlSeconds);
        return result;
    }

    /**
     * Cached wrapper for recent transactions
     */
    async getCachedTransactions(page = 1, limit = 100, ttlSeconds = 300) { // 5 minutes default
        const cacheKey = `transactions_${page}_${limit}`;
        let cached = await this.get(cacheKey);
        
        if (cached) {
            return cached;
        }

        console.log(`[DB-CACHE] Fetching transactions from database (page: ${page}, limit: ${limit})`);
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
            token_price_usd: t.token_price_usd,
            source_address: t.sourceWallet ? t.sourceWallet.address : null,
            destination_address: t.destinationWallet ? t.destinationWallet.address : null
        }));

        await this.set(cacheKey, result, ttlSeconds);
        return result;
    }

    /**
     * Clean up expired cache entries
     */
    async cleanupExpired() {
        try {
            const result = await prisma.cacheEntry.deleteMany({
                where: {
                    expires_at: { lt: new Date() }
                }
            });
            
            if (result.count > 0) {
                console.log(`[DB-CACHE] Cleaned up ${result.count} expired entries`);
            }
            
            return result.count;
        } catch (error) {
            console.error(`[DB-CACHE] Error during cleanup:`, error.message);
            return 0;
        }
    }

    /**
     * Start automatic cleanup process
     */
    startCleanupProcess() {
        setInterval(async () => {
            await this.cleanupExpired();
        }, this.cleanupInterval);
        
        console.log(`[DB-CACHE] Started cleanup process (interval: ${this.cleanupInterval}ms)`);
    }

    /**
     * Generate hash for change detection
     * @param {any} data - Data to hash
     * @returns {string} - SHA256 hash
     */
    generateHash(data) {
        return crypto.createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex');
    }

    /**
     * Invalidate cache entries related to data refresh
     */
    async invalidateRefreshCaches() {
        const patterns = [
            'token_holders_*',
            'wallet_balance_*',
            'transactions_*'
        ];

        for (const pattern of patterns) {
            await this.clear(pattern);
        }
        
        console.log(`[DB-CACHE] Invalidated refresh-related caches`);
    }
}

// Export singleton instance
module.exports = new DatabaseCacheService();