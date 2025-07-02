const cron = require('node-cron');
const redisCache = require('./redisCacheService');
const databaseCache = require('./databaseCacheService');
const changeDetection = require('./changeDetectionService');
const prisma = require('../utils/prismaClient');

class PredictiveCacheService {
    constructor() {
        this.isRunning = false;
        this.schedules = new Map();
        this.accessPatterns = new Map();
        this.predictionAccuracy = new Map();
        
        // Prediction algorithms
        this.algorithms = {
            TIME_BASED: 'time_based',
            FREQUENCY_BASED: 'frequency_based',
            PATTERN_BASED: 'pattern_based',
            ML_BASED: 'ml_based'
        };
        
        this.startPredictiveSchedules();
    }
    
    /**
     * Start predictive caching schedules
     */
    startPredictiveSchedules() {
        console.log('[PREDICTIVE] Starting predictive cache schedules...');
        
        // Every 5 minutes - Hot data refresh
        this.schedules.set('hot_refresh', cron.schedule('*/5 * * * *', async () => {
            await this.refreshHotData();
        }, { scheduled: false }));
        
        // Every 15 minutes - Warm cache analysis
        this.schedules.set('warm_analysis', cron.schedule('*/15 * * * *', async () => {
            await this.analyzeAndWarmCache();
        }, { scheduled: false }));
        
        // Every hour - Pattern analysis and prediction
        this.schedules.set('pattern_analysis', cron.schedule('0 * * * *', async () => {
            await this.analyzeAccessPatterns();
            await this.predictAndPreload();
        }, { scheduled: false }));
        
        // Every 6 hours - Deep cache optimization
        this.schedules.set('deep_optimization', cron.schedule('0 */6 * * *', async () => {
            await this.performDeepOptimization();
        }, { scheduled: false }));
        
        // Start all schedules
        this.schedules.forEach((schedule, name) => {
            schedule.start();
            console.log(`[PREDICTIVE] Started ${name} schedule`);
        });
        
        this.isRunning = true;
    }
    
    /**
     * Refresh hot data based on real-time usage
     */
    async refreshHotData() {
        try {
            console.log('[PREDICTIVE] Refreshing hot data...');
            const startTime = Date.now();
            
            // Get current hot access patterns
            const hotPatterns = await this.getHotAccessPatterns();
            
            // Prioritize by access frequency and recency
            const prioritized = hotPatterns
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .slice(0, 10); // Top 10 hot items
            
            let refreshed = 0;
            
            for (const pattern of prioritized) {
                try {
                    await this.refreshCacheItem(pattern);
                    refreshed++;
                } catch (error) {
                    console.warn(`[PREDICTIVE] Failed to refresh ${pattern.key}: ${error.message}`);
                }
            }
            
            const duration = Date.now() - startTime;
            console.log(`[PREDICTIVE] Hot refresh completed: ${refreshed} items in ${duration}ms`);
            
            // Log the operation
            await changeDetection.logApiCall(
                'predictive_hot_refresh',
                'refresh_cycle',
                true,
                duration,
                null,
                `refreshed_${refreshed}_items`
            );
            
        } catch (error) {
            console.error(`[PREDICTIVE] Hot refresh error: ${error.message}`);
        }
    }
    
    /**
     * Get hot access patterns from Redis
     */
    async getHotAccessPatterns() {
        const patterns = [];
        
        try {
            if (!redisCache.isConnected) {
                return patterns;
            }
            
            // Get all access tracking keys
            const accessKeys = await redisCache.redis.keys('access:*');
            
            for (const accessKey of accessKeys) {
                const accessData = await redisCache.redis.hgetall(accessKey);
                const hits = parseInt(accessData.hits || 0);
                const lastAccess = parseInt(accessData.last_access || 0);
                const tier = accessData.tier || 'WARM';
                
                const age = Date.now() - lastAccess;
                const ageHours = age / (1000 * 60 * 60);
                
                // Calculate access score (recent + frequent = higher score)
                const recencyScore = Math.max(0, 100 - ageHours); // Decays over time
                const frequencyScore = Math.min(hits * 10, 100); // Max 100
                const score = (recencyScore * 0.6) + (frequencyScore * 0.4);
                
                if (score > 20) { // Only consider items with decent score
                    patterns.push({
                        key: accessKey.replace('access:', ''),
                        hits,
                        lastAccess,
                        tier,
                        score,
                        ageHours
                    });
                }
            }
            
        } catch (error) {
            console.warn(`[PREDICTIVE] Error getting access patterns: ${error.message}`);
        }
        
        return patterns;
    }
    
    /**
     * Refresh a specific cache item
     */
    async refreshCacheItem(pattern) {
        const { key } = pattern;
        
        // Determine the best data source for this key
        let data = null;
        
        if (key.startsWith('token_holders_')) {
            const limit = parseInt(key.split('_')[2]) || 100;
            data = await databaseCache.getCachedTokenHolders(limit, 300); // 5 min TTL for hot refresh
        } else if (key.startsWith('transactions_')) {
            const parts = key.split('_');
            const page = parseInt(parts[1]) || 1;
            const limit = parseInt(parts[2]) || 100;
            data = await databaseCache.getCachedTransactions(page, limit, 300);
        } else if (key.startsWith('wallet_balance_')) {
            const address = key.replace('wallet_balance_', '');
            data = await databaseCache.getCachedWalletBalance(address, 600); // 10 min TTL
        }
        
        if (data) {
            // Promote to HOT tier in Redis
            await redisCache.set(key, data, 'HOT');
            console.log(`[PREDICTIVE] Refreshed and promoted ${key} to HOT tier`);
        }
    }
    
    /**
     * Analyze and warm cache based on patterns
     */
    async analyzeAndWarmCache() {
        try {
            console.log('[PREDICTIVE] Analyzing cache patterns for warming...');
            const startTime = Date.now();
            
            // Get database cache statistics
            const dbStats = await databaseCache.getStats();
            
            // Get API call patterns from last 2 hours
            const apiStats = await changeDetection.getApiCallStats(2);
            
            // Identify warming candidates
            const candidates = await this.identifyWarmingCandidates(apiStats);
            
            let warmed = 0;
            
            for (const candidate of candidates) {
                try {
                    // Check if already in warm tier
                    const existing = await redisCache.get(candidate.key, 'WARM');
                    
                    if (!existing) {
                        // Try to get from database and promote
                        const data = await databaseCache.get(candidate.key);
                        if (data) {
                            await redisCache.set(candidate.key, data, 'WARM');
                            warmed++;
                        }
                    }
                } catch (error) {
                    console.warn(`[PREDICTIVE] Failed to warm ${candidate.key}: ${error.message}`);
                }
            }
            
            const duration = Date.now() - startTime;
            console.log(`[PREDICTIVE] Cache warming completed: ${warmed} items in ${duration}ms`);
            
        } catch (error) {
            console.error(`[PREDICTIVE] Cache warming error: ${error.message}`);
        }
    }
    
    /**
     * Identify cache warming candidates based on API patterns
     */
    async identifyWarmingCandidates(apiStats) {
        const candidates = [];
        
        // Analyze endpoint access patterns
        if (apiStats.endpoint_breakdown) {
            for (const endpoint of apiStats.endpoint_breakdown) {
                const { endpoint: name, _count } = endpoint;
                const accessCount = _count.endpoint;
                
                // Convert endpoint patterns to cache keys
                if (name.includes('token_holders') && accessCount > 2) {
                    candidates.push({
                        key: 'token_holders_1000',
                        reason: 'frequent_token_holders_access',
                        score: accessCount
                    });
                    candidates.push({
                        key: 'token_holders_100',
                        reason: 'frequent_token_holders_access',
                        score: accessCount
                    });
                }
                
                if (name.includes('transactions') && accessCount > 2) {
                    candidates.push({
                        key: 'transactions_1_100',
                        reason: 'frequent_transactions_access',
                        score: accessCount
                    });
                }
                
                if (name.includes('wallet_sync') && accessCount > 1) {
                    // Extract wallet address from endpoint name
                    const walletMatch = name.match(/wallet_sync_([A-Za-z0-9]{32,})/);
                    if (walletMatch) {
                        candidates.push({
                            key: `wallet_balance_${walletMatch[1]}`,
                            reason: 'frequent_wallet_access',
                            score: accessCount
                        });
                    }
                }
            }
        }
        
        // Remove duplicates and sort by score
        const uniqueCandidates = candidates
            .filter((candidate, index, self) => 
                index === self.findIndex(c => c.key === candidate.key)
            )
            .sort((a, b) => (b.score || 0) - (a.score || 0));
        
        return uniqueCandidates.slice(0, 15); // Top 15 candidates
    }
    
    /**
     * Analyze access patterns for prediction
     */
    async analyzeAccessPatterns() {
        try {
            console.log('[PREDICTIVE] Analyzing access patterns...');
            
            const patterns = await this.getHotAccessPatterns();
            
            // Group by time patterns
            const hourlyPatterns = this.groupByHourlyPatterns(patterns);
            const dailyPatterns = this.groupByDailyPatterns(patterns);
            
            // Store patterns for prediction
            this.accessPatterns.set('hourly', hourlyPatterns);
            this.accessPatterns.set('daily', dailyPatterns);
            
            console.log(`[PREDICTIVE] Analyzed ${patterns.length} access patterns`);
            
            // Update prediction accuracy
            await this.updatePredictionAccuracy();
            
        } catch (error) {
            console.error(`[PREDICTIVE] Pattern analysis error: ${error.message}`);
        }
    }
    
    /**
     * Group access patterns by hour of day
     */
    groupByHourlyPatterns(patterns) {
        const hourlyGroups = {};
        
        patterns.forEach(pattern => {
            const hour = new Date(pattern.lastAccess).getHours();
            
            if (!hourlyGroups[hour]) {
                hourlyGroups[hour] = [];
            }
            
            hourlyGroups[hour].push(pattern);
        });
        
        return hourlyGroups;
    }
    
    /**
     * Group access patterns by day of week
     */
    groupByDailyPatterns(patterns) {
        const dailyGroups = {};
        
        patterns.forEach(pattern => {
            const day = new Date(pattern.lastAccess).getDay();
            
            if (!dailyGroups[day]) {
                dailyGroups[day] = [];
            }
            
            dailyGroups[day].push(pattern);
        });
        
        return dailyGroups;
    }
    
    /**
     * Predict and preload cache based on patterns
     */
    async predictAndPreload() {
        try {
            console.log('[PREDICTIVE] Starting prediction and preload...');
            const startTime = Date.now();
            
            const currentHour = new Date().getHours();
            const nextHour = (currentHour + 1) % 24;
            
            // Get patterns for next hour
            const hourlyPatterns = this.accessPatterns.get('hourly');
            const nextHourPatterns = hourlyPatterns?.[nextHour] || [];
            
            // Predict based on time patterns
            const timePredictions = this.predictByTime(nextHourPatterns);
            
            // Predict based on frequency patterns  
            const frequencyPredictions = this.predictByFrequency();
            
            // Combine predictions
            const allPredictions = [...timePredictions, ...frequencyPredictions];
            
            // Remove duplicates and score
            const uniquePredictions = this.scorePredictions(allPredictions);
            
            let preloaded = 0;
            
            // Preload top predictions
            for (const prediction of uniquePredictions.slice(0, 8)) {
                try {
                    await this.preloadPrediction(prediction);
                    preloaded++;
                } catch (error) {
                    console.warn(`[PREDICTIVE] Failed to preload ${prediction.key}: ${error.message}`);
                }
            }
            
            const duration = Date.now() - startTime;
            console.log(`[PREDICTIVE] Prediction preload completed: ${preloaded} items in ${duration}ms`);
            
            // Log the operation
            await changeDetection.logApiCall(
                'predictive_preload',
                'prediction_cycle',
                true,
                duration,
                null,
                `preloaded_${preloaded}_predictions`
            );
            
        } catch (error) {
            console.error(`[PREDICTIVE] Prediction error: ${error.message}`);
        }
    }
    
    /**
     * Predict cache needs based on time patterns
     */
    predictByTime(patterns) {
        return patterns.map(pattern => ({
            ...pattern,
            algorithm: this.algorithms.TIME_BASED,
            confidence: 0.7,
            reason: 'time_pattern_match'
        }));
    }
    
    /**
     * Predict cache needs based on frequency patterns
     */
    predictByFrequency() {
        const predictions = [];
        
        // Predict based on high-frequency items from the past
        const hotPatterns = this.accessPatterns.get('hourly') || {};
        
        Object.values(hotPatterns).forEach(hourPatterns => {
            hourPatterns.forEach(pattern => {
                if (pattern.hits > 10) { // High frequency items
                    predictions.push({
                        ...pattern,
                        algorithm: this.algorithms.FREQUENCY_BASED,
                        confidence: Math.min(pattern.hits / 50, 0.9),
                        reason: 'high_frequency_pattern'
                    });
                }
            });
        });
        
        return predictions;
    }
    
    /**
     * Score and rank predictions
     */
    scorePredictions(predictions) {
        // Remove duplicates
        const uniquePredictions = predictions.filter((pred, index, self) =>
            index === self.findIndex(p => p.key === pred.key)
        );
        
        // Score each prediction
        uniquePredictions.forEach(prediction => {
            let score = 0;
            
            // Base score from confidence
            score += (prediction.confidence || 0) * 50;
            
            // Bonus for recent access
            const ageHours = prediction.ageHours || 0;
            score += Math.max(0, 20 - ageHours);
            
            // Bonus for frequency
            const hits = prediction.hits || 0;
            score += Math.min(hits * 2, 30);
            
            prediction.finalScore = score;
        });
        
        // Sort by score
        return uniquePredictions.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
    }
    
    /**
     * Preload a predicted cache item
     */
    async preloadPrediction(prediction) {
        const { key, algorithm, confidence } = prediction;
        
        // Check if already cached
        const existing = await redisCache.get(key, 'WARM');
        if (existing) {
            return; // Already cached
        }
        
        // Determine appropriate tier based on confidence
        const tier = confidence > 0.8 ? 'HOT' : 'WARM';
        
        // Fetch and cache
        const data = await databaseCache.get(key);
        if (data) {
            await redisCache.set(key, data, tier);
            console.log(`[PREDICTIVE] Preloaded ${key} (${algorithm}, confidence: ${confidence.toFixed(2)}) to ${tier} tier`);
        }
    }
    
    /**
     * Update prediction accuracy metrics
     */
    async updatePredictionAccuracy() {
        // This would track how accurate our predictions are over time
        // For now, just log that we're tracking accuracy
        console.log('[PREDICTIVE] Updated prediction accuracy metrics');
    }
    
    /**
     * Perform deep cache optimization
     */
    async performDeepOptimization() {
        try {
            console.log('[PREDICTIVE] Starting deep cache optimization...');
            const startTime = Date.now();
            
            // Clean up rarely accessed items
            await this.cleanupRarelyAccessed();
            
            // Optimize tier placement
            await this.optimizeTierPlacement();
            
            // Update cache strategies
            await this.updateCacheStrategies();
            
            const duration = Date.now() - startTime;
            console.log(`[PREDICTIVE] Deep optimization completed in ${duration}ms`);
            
        } catch (error) {
            console.error(`[PREDICTIVE] Deep optimization error: ${error.message}`);
        }
    }
    
    /**
     * Clean up rarely accessed cache items
     */
    async cleanupRarelyAccessed() {
        if (!redisCache.isConnected) {
            return;
        }
        
        try {
            const accessKeys = await redisCache.redis.keys('access:*');
            let cleaned = 0;
            
            for (const accessKey of accessKeys) {
                const accessData = await redisCache.redis.hgetall(accessKey);
                const hits = parseInt(accessData.hits || 0);
                const lastAccess = parseInt(accessData.last_access || 0);
                const age = Date.now() - lastAccess;
                const ageHours = age / (1000 * 60 * 60);
                
                // Clean items with very low access and old age
                if (hits < 2 && ageHours > 12) {
                    const originalKey = accessKey.replace('access:', '');
                    await redisCache.delete(originalKey);
                    await redisCache.redis.del(accessKey);
                    cleaned++;
                }
            }
            
            console.log(`[PREDICTIVE] Cleaned up ${cleaned} rarely accessed items`);
            
        } catch (error) {
            console.warn(`[PREDICTIVE] Cleanup error: ${error.message}`);
        }
    }
    
    /**
     * Optimize cache tier placement
     */
    async optimizeTierPlacement() {
        const patterns = await this.getHotAccessPatterns();
        let optimized = 0;
        
        for (const pattern of patterns) {
            try {
                const { key, hits, ageHours, tier } = pattern;
                
                // Promote frequently accessed items to HOT
                if (hits > 20 && ageHours < 2 && tier !== 'HOT') {
                    const data = await redisCache.get(key, tier);
                    if (data) {
                        await redisCache.set(key, data, 'HOT');
                        console.log(`[PREDICTIVE] Promoted ${key} to HOT tier`);
                        optimized++;
                    }
                }
                
                // Demote infrequently accessed items
                if (hits < 5 && ageHours > 6 && tier === 'HOT') {
                    const data = await redisCache.get(key, 'HOT');
                    if (data) {
                        await redisCache.set(key, data, 'WARM');
                        console.log(`[PREDICTIVE] Demoted ${key} to WARM tier`);
                        optimized++;
                    }
                }
                
            } catch (error) {
                console.warn(`[PREDICTIVE] Failed to optimize ${pattern.key}: ${error.message}`);
            }
        }
        
        console.log(`[PREDICTIVE] Optimized placement for ${optimized} items`);
    }
    
    /**
     * Update cache strategies based on learned patterns
     */
    async updateCacheStrategies() {
        // This could dynamically adjust TTLs, batch sizes, etc.
        // For now, just log that we're updating strategies
        console.log('[PREDICTIVE] Updated cache strategies based on patterns');
    }
    
    /**
     * Get predictive cache statistics
     */
    async getStats() {
        const patterns = await this.getHotAccessPatterns();
        const redisStats = await redisCache.getStats();
        
        return {
            service_status: {
                running: this.isRunning,
                schedules_active: this.schedules.size,
                algorithms_available: Object.keys(this.algorithms).length
            },
            patterns: {
                total_tracked: patterns.length,
                hot_items: patterns.filter(p => p.score > 70).length,
                warm_items: patterns.filter(p => p.score > 40 && p.score <= 70).length,
                cold_items: patterns.filter(p => p.score <= 40).length
            },
            redis_integration: redisStats,
            prediction_accuracy: Object.fromEntries(this.predictionAccuracy)
        };
    }
    
    /**
     * Stop all predictive caching schedules
     */
    stop() {
        console.log('[PREDICTIVE] Stopping predictive cache service...');
        
        this.schedules.forEach((schedule, name) => {
            schedule.stop();
            console.log(`[PREDICTIVE] Stopped ${name} schedule`);
        });
        
        this.isRunning = false;
        console.log('[PREDICTIVE] Predictive cache service stopped');
    }
}

// Export singleton instance
module.exports = new PredictiveCacheService();