const Redis = require('ioredis');
const databaseCache = require('./databaseCacheService');
const changeDetection = require('./changeDetectionService');

class RedisCacheService {
    constructor() {
        this.redis = null;
        this.isConnected = false;
        this.retryAttempts = 0;
        this.maxRetries = 5;
        this.fallbackToDatabase = true;
        
        // Cache tiers - different TTLs for different data types
        this.cacheTiers = {
            HOT: { ttl: 300, prefix: 'hot:' },      // 5 minutes - frequently accessed data
            WARM: { ttl: 1800, prefix: 'warm:' },   // 30 minutes - moderately accessed data  
            COLD: { ttl: 7200, prefix: 'cold:' },   // 2 hours - infrequently accessed data
            FREEZE: { ttl: 86400, prefix: 'freeze:' } // 24 hours - static/reference data
        };
        
        this.initRedis();
    }
    
    /**
     * Initialize Redis connection with fallback handling
     */
    async initRedis() {
        try {
            const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
            
            this.redis = new Redis(redisUrl, {
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3,
                lazyConnect: true,
                keepAlive: 30000,
                family: 4,
                keyPrefix: 'token_tracker:',
                db: 0
            });
            
            this.redis.on('connect', () => {
                console.log('[REDIS] Connected successfully');
                this.isConnected = true;
                this.retryAttempts = 0;
            });
            
            this.redis.on('error', (error) => {
                console.warn(`[REDIS] Connection error: ${error.message}`);
                this.isConnected = false;
                this.handleConnectionError();
            });
            
            this.redis.on('close', () => {
                console.log('[REDIS] Connection closed');
                this.isConnected = false;
            });
            
            // Test connection
            await this.redis.ping();
            
        } catch (error) {
            console.warn(`[REDIS] Failed to initialize: ${error.message}`);
            this.handleConnectionError();
        }
    }
    
    /**
     * Handle Redis connection errors with exponential backoff
     */
    async handleConnectionError() {
        if (this.retryAttempts < this.maxRetries) {
            this.retryAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.retryAttempts), 30000);
            
            console.log(`[REDIS] Retrying connection in ${delay}ms (attempt ${this.retryAttempts}/${this.maxRetries})`);
            
            setTimeout(() => {
                this.initRedis();
            }, delay);
        } else {
            console.warn('[REDIS] Max retries reached, falling back to database cache only');
            this.fallbackToDatabase = true;
        }
    }
    
    /**
     * Get cache key with tier prefix
     */
    getCacheKey(key, tier = 'WARM') {
        return `${this.cacheTiers[tier].prefix}${key}`;
    }
    
    /**
     * Get data from Redis with database fallback
     */
    async get(key, tier = 'WARM') {
        const cacheKey = this.getCacheKey(key, tier);
        
        // Try Redis first if connected
        if (this.isConnected && this.redis) {
            try {
                const cached = await this.redis.get(cacheKey);
                if (cached) {
                    console.log(`[REDIS] Hit for key: ${key} (tier: ${tier})`);
                    
                    // Update access tracking (async)
                    this.trackAccess(key, tier).catch(() => {});
                    
                    return JSON.parse(cached);
                }
            } catch (error) {
                console.warn(`[REDIS] Get error for ${key}: ${error.message}`);
            }
        }
        
        // Fallback to database cache
        console.log(`[REDIS] Miss for ${key}, checking database cache...`);
        return await databaseCache.get(key);
    }
    
    /**
     * Set data in Redis with database backup
     */
    async set(key, data, tier = 'WARM') {
        const cacheKey = this.getCacheKey(key, tier);
        const ttl = this.cacheTiers[tier].ttl;
        
        // Store in Redis if connected
        if (this.isConnected && this.redis) {
            try {
                await this.redis.setex(cacheKey, ttl, JSON.stringify(data));
                console.log(`[REDIS] Set key: ${key} (tier: ${tier}, TTL: ${ttl}s)`);
            } catch (error) {
                console.warn(`[REDIS] Set error for ${key}: ${error.message}`);
            }
        }
        
        // Always backup to database cache with longer TTL
        const dbTtl = ttl * 3; // Database cache lasts 3x longer than Redis
        await databaseCache.set(key, data, dbTtl);
    }
    
    /**
     * Delete from both Redis and database cache
     */
    async delete(key) {
        // Delete from all Redis tiers
        const promises = Object.keys(this.cacheTiers).map(async (tier) => {
            const cacheKey = this.getCacheKey(key, tier);
            if (this.isConnected && this.redis) {
                try {
                    await this.redis.del(cacheKey);
                } catch (error) {
                    console.warn(`[REDIS] Delete error for ${key}: ${error.message}`);
                }
            }
        });
        
        await Promise.all(promises);
        await databaseCache.delete(key);
        
        console.log(`[REDIS] Deleted key: ${key} from all tiers`);
    }
    
    /**
     * Clear cache by pattern
     */
    async clear(pattern = '*') {
        if (this.isConnected && this.redis) {
            try {
                // Clear from all tiers
                for (const tier of Object.keys(this.cacheTiers)) {
                    const tierPattern = `${this.cacheTiers[tier].prefix}${pattern}`;
                    const keys = await this.redis.keys(tierPattern);
                    
                    if (keys.length > 0) {
                        await this.redis.del(...keys);
                        console.log(`[REDIS] Cleared ${keys.length} keys from ${tier} tier`);
                    }
                }
            } catch (error) {
                console.warn(`[REDIS] Clear error: ${error.message}`);
            }
        }
        
        // Also clear database cache
        await databaseCache.clear(pattern);
    }
    
    /**
     * Get comprehensive cache statistics
     */
    async getStats() {
        const stats = {
            redis: {
                connected: this.isConnected,
                retry_attempts: this.retryAttempts,
                fallback_mode: this.fallbackToDatabase
            },
            tiers: {}
        };
        
        if (this.isConnected && this.redis) {
            try {
                const info = await this.redis.info('memory');
                const dbSize = await this.redis.dbsize();
                
                stats.redis.memory_usage = this.parseRedisInfo(info);
                stats.redis.total_keys = dbSize;
                
                // Get keys per tier
                for (const [tierName, tierConfig] of Object.entries(this.cacheTiers)) {
                    const keys = await this.redis.keys(`${tierConfig.prefix}*`);
                    stats.tiers[tierName.toLowerCase()] = {
                        keys: keys.length,
                        ttl: tierConfig.ttl,
                        prefix: tierConfig.prefix
                    };
                }
                
            } catch (error) {
                console.warn(`[REDIS] Stats error: ${error.message}`);
                stats.redis.error = error.message;
            }
        }
        
        // Include database cache stats
        stats.database = await databaseCache.getStats();
        
        return stats;
    }
    
    /**
     * Parse Redis INFO output
     */
    parseRedisInfo(info) {
        const lines = info.split('\r\n');
        const memory = {};
        
        lines.forEach(line => {
            if (line.includes(':')) {
                const [key, value] = line.split(':');
                if (key.includes('memory')) {
                    memory[key] = value;
                }
            }
        });
        
        return memory;
    }
    
    /**
     * Track cache access patterns for analytics
     */
    async trackAccess(key, tier) {
        try {
            const accessKey = `access:${key}`;
            const now = Date.now();
            
            if (this.isConnected && this.redis) {
                // Increment access counter
                await this.redis.hincrby(accessKey, 'hits', 1);
                await this.redis.hset(accessKey, 'last_access', now);
                await this.redis.hset(accessKey, 'tier', tier);
                await this.redis.expire(accessKey, 86400); // Keep access data for 24 hours
            }
        } catch (error) {
            // Don't log access tracking errors to avoid spam
        }
    }
    
    /**
     * Get hot data that should be cached in Redis HOT tier
     */
    async getCachedHotData(key, fetchFunction, ttlOverride = null) {
        let data = await this.get(key, 'HOT');
        
        if (!data) {
            console.log(`[REDIS] Hot data miss for ${key}, fetching...`);
            data = await fetchFunction();
            
            if (data) {
                const tier = 'HOT';
                if (ttlOverride) {
                    // Temporarily override TTL
                    const originalTtl = this.cacheTiers[tier].ttl;
                    this.cacheTiers[tier].ttl = ttlOverride;
                    await this.set(key, data, tier);
                    this.cacheTiers[tier].ttl = originalTtl;
                } else {
                    await this.set(key, data, tier);
                }
            }
        }
        
        return data;
    }
    
    /**
     * Preload frequently accessed data into Redis
     */
    async preloadHotData() {
        console.log('[REDIS] Starting hot data preload...');
        
        const hotDataKeys = [
            { key: 'token_holders_100', fetcher: () => databaseCache.getCachedTokenHolders(100), tier: 'HOT' },
            { key: 'token_holders_50', fetcher: () => databaseCache.getCachedTokenHolders(50), tier: 'HOT' },
            { key: 'transactions_1_100', fetcher: () => databaseCache.getCachedTransactions(1, 100), tier: 'HOT' },
            { key: 'transactions_1_50', fetcher: () => databaseCache.getCachedTransactions(1, 50), tier: 'HOT' }
        ];
        
        const preloadPromises = hotDataKeys.map(async ({ key, fetcher, tier }) => {
            try {
                const data = await fetcher();
                if (data) {
                    await this.set(key, data, tier);
                    console.log(`[REDIS] Preloaded ${key} into ${tier} tier`);
                }
            } catch (error) {
                console.warn(`[REDIS] Failed to preload ${key}: ${error.message}`);
            }
        });
        
        await Promise.all(preloadPromises);
        console.log('[REDIS] Hot data preload completed');
    }
    
    /**
     * Intelligent cache warming based on access patterns
     */
    async warmCache() {
        if (!this.isConnected) {
            console.log('[REDIS] Not connected, skipping cache warming');
            return;
        }
        
        try {
            console.log('[REDIS] Starting intelligent cache warming...');
            
            // Get most accessed keys from the last 24 hours
            const accessKeys = await this.redis.keys('access:*');
            const hotKeys = [];
            
            for (const accessKey of accessKeys.slice(0, 20)) { // Limit to top 20
                const accessData = await this.redis.hgetall(accessKey);
                const hits = parseInt(accessData.hits || 0);
                const lastAccess = parseInt(accessData.last_access || 0);
                const age = Date.now() - lastAccess;
                
                // If recently accessed and popular, add to hot keys
                if (hits > 5 && age < 3600000) { // 5+ hits in last hour
                    const originalKey = accessKey.replace('access:', '');
                    hotKeys.push(originalKey);
                }
            }
            
            console.log(`[REDIS] Warming ${hotKeys.length} hot keys...`);
            
            // Warm the hot keys
            for (const key of hotKeys) {
                try {
                    // Check if already in HOT tier
                    const hotKey = this.getCacheKey(key, 'HOT');
                    const exists = await this.redis.exists(hotKey);
                    
                    if (!exists) {
                        // Try to get from database cache and promote to HOT
                        const data = await databaseCache.get(key);
                        if (data) {
                            await this.set(key, data, 'HOT');
                            console.log(`[REDIS] Warmed ${key} into HOT tier`);
                        }
                    }
                } catch (error) {
                    console.warn(`[REDIS] Failed to warm ${key}: ${error.message}`);
                }
            }
            
            console.log('[REDIS] Cache warming completed');
            
        } catch (error) {
            console.error(`[REDIS] Cache warming error: ${error.message}`);
        }
    }
    
    /**
     * Graceful shutdown
     */
    async shutdown() {
        if (this.redis) {
            console.log('[REDIS] Shutting down connection...');
            await this.redis.quit();
        }
    }
}

// Export singleton instance
module.exports = new RedisCacheService();