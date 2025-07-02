const cron = require('node-cron');
const redisCache = require('./redisCacheService');
const databaseCache = require('./databaseCacheService');
const mlPrediction = require('./mlCachePredictionService');
const blockchainMonitor = require('./blockchainEventMonitor');
const changeDetection = require('./changeDetectionService');

class AutoScalingCacheManager {
    constructor() {
        this.isRunning = false;
        this.scalingMetrics = {
            cpu_usage: 0,
            memory_usage: 0,
            cache_hit_rate: 0,
            request_rate: 0,
            error_rate: 0
        };
        
        this.scalingRules = {
            // Scale up triggers
            scale_up: {
                cache_hit_rate_threshold: 0.95, // Scale up if hit rate > 95%
                memory_usage_threshold: 0.8,   // Scale up if memory > 80%
                request_rate_threshold: 1000,  // Scale up if > 1000 req/min
                error_rate_threshold: 0.05     // Scale up if error rate > 5%
            },
            
            // Scale down triggers
            scale_down: {
                cache_hit_rate_threshold: 0.85, // Scale down if hit rate < 85%
                memory_usage_threshold: 0.3,    // Scale down if memory < 30%
                request_rate_threshold: 100,    // Scale down if < 100 req/min
                error_rate_threshold: 0.01      // Scale down if error rate < 1%
            }
        };
        
        this.tierConfiguration = {
            HOT: {
                max_keys: 1000,
                ttl: 300,       // 5 minutes
                memory_limit: '100MB',
                auto_scale: true
            },
            WARM: {
                max_keys: 5000,
                ttl: 1800,      // 30 minutes
                memory_limit: '200MB',
                auto_scale: true
            },
            COLD: {
                max_keys: 10000,
                ttl: 7200,      // 2 hours
                memory_limit: '300MB',
                auto_scale: true
            },
            FREEZE: {
                max_keys: 20000,
                ttl: 86400,     // 24 hours
                memory_limit: '500MB',
                auto_scale: false
            }
        };
        
        this.scalingHistory = [];
        this.lastScalingAction = null;
        this.cooldownPeriod = 5 * 60 * 1000; // 5 minutes cooldown
        
        this.setupAutoScaling();
    }
    
    /**
     * Initialize auto-scaling system
     */
    async setupAutoScaling() {
        console.log('[AUTO-SCALE] Initializing auto-scaling cache manager...');
        
        try {
            // Schedule metric collection every minute
            cron.schedule('* * * * *', async () => {
                await this.collectMetrics();
            });
            
            // Schedule scaling decisions every 5 minutes
            cron.schedule('*/5 * * * *', async () => {
                await this.evaluateScaling();
            });
            
            // Schedule tier optimization every 15 minutes
            cron.schedule('*/15 * * * *', async () => {
                await this.optimizeTiers();
            });
            
            // Schedule deep analysis every hour
            cron.schedule('0 * * * *', async () => {
                await this.performDeepAnalysis();
            });
            
            this.isRunning = true;
            console.log('[AUTO-SCALE] Auto-scaling system initialized');
            
        } catch (error) {
            console.error(`[AUTO-SCALE] Initialization error: ${error.message}`);
        }
    }
    
    /**
     * Collect performance metrics for scaling decisions
     */
    async collectMetrics() {
        try {
            // Get cache statistics
            const redisStats = await redisCache.getStats();
            const dbStats = await databaseCache.getStats();
            
            // Get API call statistics
            const apiStats = await changeDetection.getApiCallStats(1); // Last hour
            
            // Calculate derived metrics
            const totalRequests = apiStats.total_calls || 0;
            const successfulRequests = apiStats.successful_calls || 0;
            const errorRate = totalRequests > 0 ? (totalRequests - successfulRequests) / totalRequests : 0;
            
            // Estimate cache hit rate from Redis tiers
            const totalRedisKeys = redisStats.redis?.total_keys || 0;
            const dbCacheEntries = dbStats.total_entries || 0;
            
            // Update metrics
            this.scalingMetrics = {
                redis_keys: totalRedisKeys,
                db_cache_entries: dbCacheEntries,
                request_rate: totalRequests,
                error_rate: errorRate,
                memory_usage: this.estimateMemoryUsage(redisStats),
                cache_performance: this.calculateCachePerformance(redisStats, dbStats),
                timestamp: Date.now()
            };
            
            // Store metrics history (keep last 100 measurements)
            this.metricsHistory = this.metricsHistory || [];
            this.metricsHistory.push({ ...this.scalingMetrics });
            if (this.metricsHistory.length > 100) {
                this.metricsHistory.shift();
            }
            
        } catch (error) {
            console.error(`[AUTO-SCALE] Metrics collection error: ${error.message}`);
        }
    }
    
    /**
     * Estimate memory usage from Redis statistics
     */
    estimateMemoryUsage(redisStats) {
        try {
            const memoryInfo = redisStats.redis?.memory_usage || {};
            const usedMemory = parseInt(memoryInfo.used_memory || 0);
            const maxMemory = parseInt(memoryInfo.maxmemory || 1024 * 1024 * 1024); // Default 1GB
            
            return usedMemory / maxMemory;
        } catch (error) {
            return 0.5; // Default to 50% if can't determine
        }
    }
    
    /**
     * Calculate overall cache performance score
     */
    calculateCachePerformance(redisStats, dbStats) {
        try {
            // Combine Redis tier utilization and database cache efficiency
            const redisTiers = redisStats.tiers || {};
            const totalRedisKeys = Object.values(redisTiers).reduce((sum, tier) => sum + (tier.keys || 0), 0);
            
            // Performance factors
            const redisUtilization = Math.min(totalRedisKeys / 10000, 1.0); // Max 10k keys
            const dbCacheHits = dbStats.total_hits || 0;
            const dbCacheTotal = (dbStats.total_hits || 0) + (dbStats.total_entries || 0);
            const dbHitRate = dbCacheTotal > 0 ? dbCacheHits / dbCacheTotal : 0.5;
            
            // Weighted performance score
            return (redisUtilization * 0.6) + (dbHitRate * 0.4);
            
        } catch (error) {
            return 0.5; // Default performance score
        }
    }
    
    /**
     * Evaluate and execute scaling decisions
     */
    async evaluateScaling() {
        if (!this.isRunning) return;
        
        try {
            console.log('[AUTO-SCALE] Evaluating scaling decisions...');
            
            // Check cooldown period
            if (this.lastScalingAction && 
                (Date.now() - this.lastScalingAction) < this.cooldownPeriod) {
                console.log('[AUTO-SCALE] Still in cooldown period, skipping scaling');
                return;
            }
            
            const metrics = this.scalingMetrics;
            const scalingDecision = this.makeScalingDecision(metrics);
            
            if (scalingDecision.action !== 'no_action') {
                await this.executeScalingAction(scalingDecision);
                this.lastScalingAction = Date.now();
                
                // Record scaling event
                this.scalingHistory.push({
                    timestamp: Date.now(),
                    action: scalingDecision.action,
                    reason: scalingDecision.reason,
                    metrics: { ...metrics }
                });
                
                // Keep only last 50 scaling events
                if (this.scalingHistory.length > 50) {
                    this.scalingHistory.shift();
                }
            }
            
        } catch (error) {
            console.error(`[AUTO-SCALE] Scaling evaluation error: ${error.message}`);
        }
    }
    
    /**
     * Make scaling decisions based on current metrics
     */
    makeScalingDecision(metrics) {
        const rules = this.scalingRules;
        const decision = {
            action: 'no_action',
            reason: 'No scaling needed',
            confidence: 0.5
        };
        
        // Check scale-up conditions
        let scaleUpScore = 0;
        let scaleUpReasons = [];
        
        if (metrics.memory_usage > rules.scale_up.memory_usage_threshold) {
            scaleUpScore += 0.3;
            scaleUpReasons.push('high_memory_usage');
        }
        
        if (metrics.request_rate > rules.scale_up.request_rate_threshold) {
            scaleUpScore += 0.2;
            scaleUpReasons.push('high_request_rate');
        }
        
        if (metrics.error_rate > rules.scale_up.error_rate_threshold) {
            scaleUpScore += 0.3;
            scaleUpReasons.push('high_error_rate');
        }
        
        if (metrics.cache_performance > rules.scale_up.cache_hit_rate_threshold) {
            scaleUpScore += 0.2;
            scaleUpReasons.push('excellent_cache_performance');
        }
        
        // Check scale-down conditions
        let scaleDownScore = 0;
        let scaleDownReasons = [];
        
        if (metrics.memory_usage < rules.scale_down.memory_usage_threshold) {
            scaleDownScore += 0.3;
            scaleDownReasons.push('low_memory_usage');
        }
        
        if (metrics.request_rate < rules.scale_down.request_rate_threshold) {
            scaleDownScore += 0.3;
            scaleDownReasons.push('low_request_rate');
        }
        
        if (metrics.cache_performance < rules.scale_down.cache_hit_rate_threshold) {
            scaleDownScore += 0.2;
            scaleDownReasons.push('poor_cache_performance');
        }
        
        // Make decision
        if (scaleUpScore > 0.5) {
            decision.action = 'scale_up';
            decision.reason = scaleUpReasons.join(', ');
            decision.confidence = scaleUpScore;
        } else if (scaleDownScore > 0.6) {
            decision.action = 'scale_down';
            decision.reason = scaleDownReasons.join(', ');
            decision.confidence = scaleDownScore;
        }
        
        console.log(`[AUTO-SCALE] Scaling decision: ${decision.action} (confidence: ${decision.confidence.toFixed(2)}, reason: ${decision.reason})`);
        
        return decision;
    }
    
    /**
     * Execute scaling actions
     */
    async executeScalingAction(decision) {
        try {
            console.log(`[AUTO-SCALE] Executing scaling action: ${decision.action}`);
            
            switch (decision.action) {
                case 'scale_up':
                    await this.scaleUp(decision);
                    break;
                    
                case 'scale_down':
                    await this.scaleDown(decision);
                    break;
                    
                default:
                    console.log(`[AUTO-SCALE] Unknown scaling action: ${decision.action}`);
            }
            
            // Log scaling action
            await changeDetection.logApiCall(
                'auto_scaling',
                decision.action,
                true,
                null,
                null,
                `reason_${decision.reason}_confidence_${decision.confidence.toFixed(2)}`
            );
            
        } catch (error) {
            console.error(`[AUTO-SCALE] Scaling action error: ${error.message}`);
            
            await changeDetection.logApiCall(
                'auto_scaling',
                decision.action,
                false,
                null,
                error.message
            );
        }
    }
    
    /**
     * Scale up cache resources
     */
    async scaleUp(decision) {
        console.log('[AUTO-SCALE] Scaling up cache resources...');
        
        // Increase tier limits
        for (const [tierName, config] of Object.entries(this.tierConfiguration)) {
            if (config.auto_scale) {
                const oldMaxKeys = config.max_keys;
                config.max_keys = Math.floor(config.max_keys * 1.5); // Increase by 50%
                
                console.log(`[AUTO-SCALE] Increased ${tierName} tier max keys: ${oldMaxKeys} -> ${config.max_keys}`);
            }
        }
        
        // Trigger aggressive cache warming
        await this.triggerAggressiveCacheWarming();
        
        // Increase predictive preloading
        await this.increasePredictivePreloading();
        
        console.log('[AUTO-SCALE] Scale up completed');
    }
    
    /**
     * Scale down cache resources
     */
    async scaleDown(decision) {
        console.log('[AUTO-SCALE] Scaling down cache resources...');
        
        // Decrease tier limits
        for (const [tierName, config] of Object.entries(this.tierConfiguration)) {
            if (config.auto_scale) {
                const oldMaxKeys = config.max_keys;
                config.max_keys = Math.floor(config.max_keys * 0.8); // Decrease by 20%
                
                console.log(`[AUTO-SCALE] Decreased ${tierName} tier max keys: ${oldMaxKeys} -> ${config.max_keys}`);
            }
        }
        
        // Clean up cold cache entries
        await this.cleanupColdEntries();
        
        // Reduce predictive preloading
        await this.reducePredictivePreloading();
        
        console.log('[AUTO-SCALE] Scale down completed');
    }
    
    /**
     * Trigger aggressive cache warming for scale-up
     */
    async triggerAggressiveCacheWarming() {
        try {
            console.log('[AUTO-SCALE] Triggering aggressive cache warming...');
            
            // Get ML recommendations for high-value cache keys
            const mlRecommendations = await mlPrediction.generateWarmingRecommendations();
            
            // Preload top recommendations
            for (const recommendation of mlRecommendations.slice(0, 50)) { // Top 50
                try {
                    const data = await databaseCache.get(recommendation.cache_key);
                    if (data) {
                        await redisCache.set(recommendation.cache_key, data, 'HOT');
                    }
                } catch (error) {
                    console.warn(`[AUTO-SCALE] Failed to warm ${recommendation.cache_key}: ${error.message}`);
                }
            }
            
            console.log(`[AUTO-SCALE] Warmed ${mlRecommendations.length} cache entries`);
            
        } catch (error) {
            console.error(`[AUTO-SCALE] Aggressive warming error: ${error.message}`);
        }
    }
    
    /**
     * Increase predictive preloading aggressiveness
     */
    async increasePredictivePreloading() {
        // This would integrate with the predictive cache service
        // to increase the frequency and scope of preloading
        console.log('[AUTO-SCALE] Increased predictive preloading aggressiveness');
    }
    
    /**
     * Clean up cold cache entries for scale-down
     */
    async cleanupColdEntries() {
        try {
            console.log('[AUTO-SCALE] Cleaning up cold cache entries...');
            
            // Get access patterns to identify cold entries
            const accessKeys = await redisCache.redis.keys('access:*');
            let cleanedCount = 0;
            
            for (const accessKey of accessKeys) {
                const accessData = await redisCache.redis.hgetall(accessKey);
                const hits = parseInt(accessData.hits || 0);
                const lastAccess = parseInt(accessData.last_access || 0);
                const ageHours = (Date.now() - lastAccess) / (1000 * 60 * 60);
                
                // Clean entries with low hits and old age
                if (hits < 3 && ageHours > 6) {
                    const originalKey = accessKey.replace('access:', '');
                    await redisCache.delete(originalKey);
                    await redisCache.redis.del(accessKey);
                    cleanedCount++;
                }
            }
            
            console.log(`[AUTO-SCALE] Cleaned up ${cleanedCount} cold cache entries`);
            
        } catch (error) {
            console.error(`[AUTO-SCALE] Cleanup error: ${error.message}`);
        }
    }
    
    /**
     * Reduce predictive preloading for scale-down
     */
    async reducePredictivePreloading() {
        // This would integrate with the predictive cache service
        // to reduce the frequency and scope of preloading
        console.log('[AUTO-SCALE] Reduced predictive preloading aggressiveness');
    }
    
    /**
     * Optimize cache tiers based on usage patterns
     */
    async optimizeTiers() {
        try {
            console.log('[AUTO-SCALE] Optimizing cache tiers...');
            
            const redisStats = await redisCache.getStats();
            const tiers = redisStats.tiers || {};
            
            // Analyze tier utilization
            for (const [tierName, tierStats] of Object.entries(tiers)) {
                const config = this.tierConfiguration[tierName];
                if (!config) continue;
                
                const utilization = tierStats.keys / config.max_keys;
                
                console.log(`[AUTO-SCALE] ${tierName} tier utilization: ${(utilization * 100).toFixed(1)}%`);
                
                // Adjust TTL based on utilization
                if (utilization > 0.9) {
                    // High utilization - reduce TTL to free up space
                    const newTTL = Math.floor(config.ttl * 0.8);
                    console.log(`[AUTO-SCALE] Reducing ${tierName} TTL: ${config.ttl} -> ${newTTL}`);
                    config.ttl = newTTL;
                } else if (utilization < 0.3) {
                    // Low utilization - increase TTL to keep data longer
                    const newTTL = Math.floor(config.ttl * 1.2);
                    console.log(`[AUTO-SCALE] Increasing ${tierName} TTL: ${config.ttl} -> ${newTTL}`);
                    config.ttl = newTTL;
                }
            }
            
        } catch (error) {
            console.error(`[AUTO-SCALE] Tier optimization error: ${error.message}`);
        }
    }
    
    /**
     * Perform deep analysis and optimization
     */
    async performDeepAnalysis() {
        try {
            console.log('[AUTO-SCALE] Performing deep analysis...');
            
            // Analyze scaling history
            const recentScalingEvents = this.scalingHistory.slice(-10);
            const scaleUpEvents = recentScalingEvents.filter(e => e.action === 'scale_up').length;
            const scaleDownEvents = recentScalingEvents.filter(e => e.action === 'scale_down').length;
            
            console.log(`[AUTO-SCALE] Recent scaling: ${scaleUpEvents} up, ${scaleDownEvents} down`);
            
            // Adjust scaling sensitivity based on history
            if (scaleUpEvents > 3) {
                // Too many scale-ups, make scaling more conservative
                this.scalingRules.scale_up.memory_usage_threshold *= 1.1;
                console.log('[AUTO-SCALE] Made scale-up rules more conservative');
            } else if (scaleDownEvents > 3) {
                // Too many scale-downs, make scaling more aggressive
                this.scalingRules.scale_up.memory_usage_threshold *= 0.9;
                console.log('[AUTO-SCALE] Made scale-up rules more aggressive');
            }
            
            // Trigger ML model training if enough data
            if (this.metricsHistory && this.metricsHistory.length > 50) {
                await mlPrediction.collectTrainingData();
                await mlPrediction.trainModel();
            }
            
        } catch (error) {
            console.error(`[AUTO-SCALE] Deep analysis error: ${error.message}`);
        }
    }
    
    /**
     * Get auto-scaling statistics
     */
    getScalingStats() {
        return {
            status: {
                is_running: this.isRunning,
                last_scaling_action: this.lastScalingAction,
                cooldown_remaining: this.lastScalingAction ? 
                    Math.max(0, this.cooldownPeriod - (Date.now() - this.lastScalingAction)) : 0
            },
            current_metrics: this.scalingMetrics,
            tier_configuration: this.tierConfiguration,
            scaling_rules: this.scalingRules,
            recent_history: this.scalingHistory.slice(-10),
            metrics_history_size: this.metricsHistory?.length || 0
        };
    }
    
    /**
     * Manually trigger scaling evaluation
     */
    async manualScalingEvaluation() {
        console.log('[AUTO-SCALE] Manual scaling evaluation triggered');
        await this.collectMetrics();
        await this.evaluateScaling();
    }
    
    /**
     * Update scaling rules
     */
    updateScalingRules(newRules) {
        console.log('[AUTO-SCALE] Updating scaling rules...');
        this.scalingRules = { ...this.scalingRules, ...newRules };
        console.log('[AUTO-SCALE] Scaling rules updated');
    }
    
    /**
     * Stop auto-scaling system
     */
    stop() {
        console.log('[AUTO-SCALE] Stopping auto-scaling system...');
        this.isRunning = false;
        console.log('[AUTO-SCALE] Auto-scaling system stopped');
    }
}

// Export singleton instance
module.exports = new AutoScalingCacheManager();