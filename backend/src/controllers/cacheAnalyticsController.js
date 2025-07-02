const redisCache = require('../services/redisCacheService');
const databaseCache = require('../services/databaseCacheService');
const predictiveCache = require('../services/predictiveCacheService');
const changeDetection = require('../services/changeDetectionService');
const prisma = require('../utils/prismaClient');

class CacheAnalyticsController {
    
    /**
     * Get comprehensive cache dashboard data
     */
    static async getDashboard(req, res) {
        try {
            const hours = parseInt(req.query.hours) || 24;
            
            const [
                redisStats,
                dbCacheStats,
                predictiveStats,
                apiStats,
                performanceMetrics,
                costSavings
            ] = await Promise.all([
                redisCache.getStats(),
                databaseCache.getStats(),
                predictiveCache.getStats(),
                changeDetection.getApiCallStats(hours),
                CacheAnalyticsController.getPerformanceMetrics(hours),
                CacheAnalyticsController.calculateCostSavings(hours)
            ]);
            
            res.json({
                timestamp: new Date().toISOString(),
                period_hours: hours,
                overview: {
                    total_cache_hits: performanceMetrics.cache_hits,
                    total_cache_misses: performanceMetrics.cache_misses,
                    hit_rate_percentage: performanceMetrics.hit_rate,
                    api_calls_saved: costSavings.api_calls_saved,
                    estimated_cost_savings: costSavings.cost_savings_usd
                },
                redis: redisStats,
                database_cache: dbCacheStats,
                predictive_cache: predictiveStats,
                api_analytics: apiStats,
                performance: performanceMetrics,
                cost_analysis: costSavings
            });
            
        } catch (error) {
            console.error('[ANALYTICS] Dashboard error:', error.message);
            res.status(500).json({ error: 'Failed to generate cache analytics dashboard' });
        }
    }
    
    /**
     * Get real-time cache performance metrics
     */
    static async getPerformanceMetrics(hours = 24) {
        try {
            const since = new Date(Date.now() - (hours * 60 * 60 * 1000));
            
            // Get cache hit/miss data from access logs
            const cacheEvents = await prisma.apiCallLog.findMany({
                where: {
                    created_at: { gte: since },
                    method: { in: ['cache_hit', 'cache_miss', 'cache_set'] }
                },
                select: {
                    method: true,
                    response_time: true,
                    created_at: true
                }
            });
            
            // Calculate metrics
            const cacheHits = cacheEvents.filter(e => e.method === 'cache_hit').length;
            const cacheMisses = cacheEvents.filter(e => e.method === 'cache_miss').length;
            const total = cacheHits + cacheMisses;
            const hitRate = total > 0 ? (cacheHits / total * 100).toFixed(2) : 0;
            
            // Response time analysis
            const responseTimes = cacheEvents
                .filter(e => e.response_time !== null)
                .map(e => e.response_time);
            
            const avgResponseTime = responseTimes.length > 0 
                ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
                : 0;
            
            // Hourly breakdown
            const hourlyBreakdown = {};
            cacheEvents.forEach(event => {
                const hour = event.created_at.getHours();
                if (!hourlyBreakdown[hour]) {
                    hourlyBreakdown[hour] = { hits: 0, misses: 0 };
                }
                if (event.method === 'cache_hit') {
                    hourlyBreakdown[hour].hits++;
                } else if (event.method === 'cache_miss') {
                    hourlyBreakdown[hour].misses++;
                }
            });
            
            return {
                cache_hits: cacheHits,
                cache_misses: cacheMisses,
                hit_rate: parseFloat(hitRate),
                average_response_time_ms: avgResponseTime.toFixed(2),
                total_cache_operations: total,
                hourly_breakdown: hourlyBreakdown
            };
            
        } catch (error) {
            console.error('[ANALYTICS] Performance metrics error:', error.message);
            return {
                cache_hits: 0,
                cache_misses: 0,
                hit_rate: 0,
                average_response_time_ms: 0,
                total_cache_operations: 0,
                hourly_breakdown: {}
            };
        }
    }
    
    /**
     * Calculate cost savings from caching
     */
    static async calculateCostSavings(hours = 24) {
        try {
            const since = new Date(Date.now() - (hours * 60 * 60 * 1000));
            
            // Get API call statistics
            const apiStats = await changeDetection.getApiCallStats(hours);
            
            // Cache performance
            const performance = await CacheAnalyticsController.getPerformanceMetrics(hours);
            
            // Estimate costs (these are rough estimates)
            const costs = {
                helius_per_call: 0.0001, // $0.0001 per API call (example)
                quicknode_per_call: 0.0002, // $0.0002 per API call (example)
                coingecko_per_call: 0.00005, // $0.00005 per API call (example)
                database_query_cost: 0.000001, // Negligible database cost
                redis_operation_cost: 0.0000001 // Negligible Redis cost
            };
            
            // Calculate API calls that would have been made without caching
            const potentialApiCalls = performance.cache_hits + apiStats.total_calls;
            const actualApiCalls = apiStats.total_calls;
            const apiCallsSaved = performance.cache_hits;
            
            // Estimate cost savings
            const avgApiCost = (costs.helius_per_call + costs.quicknode_per_call + costs.coingecko_per_call) / 3;
            const costSavingsUsd = apiCallsSaved * avgApiCost;
            
            // Cache infrastructure costs
            const cacheOperationCost = (performance.cache_hits + performance.cache_misses) * costs.redis_operation_cost;
            const netSavings = costSavingsUsd - cacheOperationCost;
            
            // Efficiency metrics
            const efficiencyRatio = potentialApiCalls > 0 ? (apiCallsSaved / potentialApiCalls * 100).toFixed(2) : 0;
            
            return {
                period_hours: hours,
                potential_api_calls: potentialApiCalls,
                actual_api_calls: actualApiCalls,
                api_calls_saved: apiCallsSaved,
                cost_savings_usd: costSavingsUsd.toFixed(4),
                cache_operation_cost_usd: cacheOperationCost.toFixed(6),
                net_savings_usd: netSavings.toFixed(4),
                efficiency_percentage: parseFloat(efficiencyRatio),
                estimated_monthly_savings: (netSavings * 24 * 30).toFixed(2),
                roi_percentage: cacheOperationCost > 0 ? ((netSavings / cacheOperationCost) * 100).toFixed(2) : 'N/A'
            };
            
        } catch (error) {
            console.error('[ANALYTICS] Cost calculation error:', error.message);
            return {
                api_calls_saved: 0,
                cost_savings_usd: '0.0000',
                efficiency_percentage: 0
            };
        }
    }
    
    /**
     * Get cache tier analysis
     */
    static async getTierAnalysis(req, res) {
        try {
            const redisStats = await redisCache.getStats();
            
            // Analyze tier utilization
            const tierAnalysis = {
                hot: {
                    purpose: 'Frequently accessed data (5 min TTL)',
                    keys: redisStats.tiers?.hot?.keys || 0,
                    recommendation: 'Items accessed multiple times per hour'
                },
                warm: {
                    purpose: 'Moderately accessed data (30 min TTL)',
                    keys: redisStats.tiers?.warm?.keys || 0,
                    recommendation: 'Items accessed multiple times per day'
                },
                cold: {
                    purpose: 'Infrequently accessed data (2 hour TTL)',
                    keys: redisStats.tiers?.cold?.keys || 0,
                    recommendation: 'Items accessed occasionally'
                },
                freeze: {
                    purpose: 'Static/reference data (24 hour TTL)',
                    keys: redisStats.tiers?.freeze?.keys || 0,
                    recommendation: 'Configuration and static data'
                }
            };
            
            // Get access patterns for tier optimization suggestions
            const suggestions = await CacheAnalyticsController.generateTierSuggestions();
            
            res.json({
                timestamp: new Date().toISOString(),
                tier_analysis: tierAnalysis,
                optimization_suggestions: suggestions,
                redis_status: {
                    connected: redisStats.redis?.connected || false,
                    total_keys: redisStats.redis?.total_keys || 0,
                    memory_usage: redisStats.redis?.memory_usage || {}
                }
            });
            
        } catch (error) {
            console.error('[ANALYTICS] Tier analysis error:', error.message);
            res.status(500).json({ error: 'Failed to analyze cache tiers' });
        }
    }
    
    /**
     * Generate tier optimization suggestions
     */
    static async generateTierSuggestions() {
        const suggestions = [];
        
        try {
            if (!redisCache.isConnected) {
                suggestions.push({
                    type: 'warning',
                    message: 'Redis not connected - using database cache only',
                    action: 'Check Redis connection and configuration'
                });
                return suggestions;
            }
            
            // Analyze access patterns
            const accessKeys = await redisCache.redis.keys('access:*');
            
            let hotCandidates = 0;
            let coldDemotions = 0;
            
            for (const accessKey of accessKeys.slice(0, 50)) { // Sample first 50
                const accessData = await redisCache.redis.hgetall(accessKey);
                const hits = parseInt(accessData.hits || 0);
                const lastAccess = parseInt(accessData.last_access || 0);
                const tier = accessData.tier || 'WARM';
                
                const age = Date.now() - lastAccess;
                const ageHours = age / (1000 * 60 * 60);
                
                // Suggest promotions to HOT
                if (hits > 15 && ageHours < 2 && tier !== 'HOT') {
                    hotCandidates++;
                }
                
                // Suggest demotions to COLD
                if (hits < 3 && ageHours > 8 && tier === 'HOT') {
                    coldDemotions++;
                }
            }
            
            if (hotCandidates > 0) {
                suggestions.push({
                    type: 'optimization',
                    message: `${hotCandidates} items could be promoted to HOT tier for better performance`,
                    action: 'Run predictive cache warming'
                });
            }
            
            if (coldDemotions > 0) {
                suggestions.push({
                    type: 'efficiency',
                    message: `${coldDemotions} items in HOT tier have low access - consider demotion`,
                    action: 'Run cache tier optimization'
                });
            }
            
            // Memory usage suggestions
            const redisStats = await redisCache.getStats();
            const totalKeys = redisStats.redis?.total_keys || 0;
            
            if (totalKeys > 10000) {
                suggestions.push({
                    type: 'memory',
                    message: 'High Redis key count detected',
                    action: 'Consider implementing more aggressive cleanup policies'
                });
            }
            
            if (totalKeys < 100) {
                suggestions.push({
                    type: 'underutilization',
                    message: 'Low Redis utilization - consider more aggressive preloading',
                    action: 'Enable predictive cache warming'
                });
            }
            
        } catch (error) {
            console.warn('[ANALYTICS] Error generating suggestions:', error.message);
            suggestions.push({
                type: 'error',
                message: 'Could not analyze cache patterns',
                action: 'Check cache service health'
            });
        }
        
        return suggestions;
    }
    
    /**
     * Get API efficiency report
     */
    static async getApiEfficiencyReport(req, res) {
        try {
            const hours = parseInt(req.query.hours) || 24;
            const apiStats = await changeDetection.getApiCallStats(hours);
            
            // Analyze API efficiency
            const efficiency = {
                period_hours: hours,
                total_api_calls: apiStats.total_calls,
                successful_calls: apiStats.successful_calls,
                failed_calls: apiStats.failed_calls,
                success_rate: apiStats.success_rate,
                average_response_time: apiStats.average_response_time,
                
                // Endpoint efficiency
                endpoint_analysis: apiStats.endpoint_breakdown?.map(endpoint => ({
                    endpoint: endpoint.endpoint,
                    calls: endpoint._count.endpoint,
                    efficiency_score: CacheAnalyticsController.calculateEndpointEfficiency(endpoint)
                })) || [],
                
                // Recommendations
                recommendations: CacheAnalyticsController.generateApiRecommendations(apiStats)
            };
            
            res.json(efficiency);
            
        } catch (error) {
            console.error('[ANALYTICS] API efficiency error:', error.message);
            res.status(500).json({ error: 'Failed to generate API efficiency report' });
        }
    }
    
    /**
     * Calculate efficiency score for an endpoint
     */
    static calculateEndpointEfficiency(endpoint) {
        const calls = endpoint._count.endpoint;
        
        // Basic efficiency scoring
        let score = 100;
        
        // Penalize high call volume (might indicate inefficient usage)
        if (calls > 1000) score -= 30;
        else if (calls > 500) score -= 15;
        else if (calls > 100) score -= 5;
        
        // Bonus for moderate usage (indicates good caching)
        if (calls >= 10 && calls <= 50) score += 10;
        
        return Math.max(0, Math.min(100, score));
    }
    
    /**
     * Generate API optimization recommendations
     */
    static generateApiRecommendations(apiStats) {
        const recommendations = [];
        
        if (apiStats.success_rate < 95) {
            recommendations.push({
                type: 'reliability',
                message: `API success rate is ${apiStats.success_rate}% - investigate failed calls`,
                priority: 'high'
            });
        }
        
        if (apiStats.total_calls > 10000) {
            recommendations.push({
                type: 'efficiency',
                message: 'High API call volume detected - optimize caching strategy',
                priority: 'medium'
            });
        }
        
        if (apiStats.average_response_time > 1000) {
            recommendations.push({
                type: 'performance',
                message: 'Slow average response time - consider request optimization',
                priority: 'medium'
            });
        }
        
        return recommendations;
    }
    
    /**
     * Export cache analytics data
     */
    static async exportAnalytics(req, res) {
        try {
            const format = req.query.format || 'json';
            const hours = parseInt(req.query.hours) || 24;
            
            const data = await CacheAnalyticsController.getDashboardData(hours);
            
            if (format === 'csv') {
                const csv = CacheAnalyticsController.convertToCSV(data);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="cache-analytics-${Date.now()}.csv"`);
                res.send(csv);
            } else {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="cache-analytics-${Date.now()}.json"`);
                res.json(data);
            }
            
        } catch (error) {
            console.error('[ANALYTICS] Export error:', error.message);
            res.status(500).json({ error: 'Failed to export analytics data' });
        }
    }
    
    /**
     * Helper to get dashboard data
     */
    static async getDashboardData(hours) {
        const [
            redisStats,
            dbCacheStats,
            predictiveStats,
            apiStats,
            performanceMetrics,
            costSavings
        ] = await Promise.all([
            redisCache.getStats(),
            databaseCache.getStats(),
            predictiveCache.getStats(),
            changeDetection.getApiCallStats(hours),
            CacheAnalyticsController.getPerformanceMetrics(hours),
            CacheAnalyticsController.calculateCostSavings(hours)
        ]);
        
        return {
            timestamp: new Date().toISOString(),
            period_hours: hours,
            redis: redisStats,
            database_cache: dbCacheStats,
            predictive_cache: predictiveStats,
            api_analytics: apiStats,
            performance: performanceMetrics,
            cost_analysis: costSavings
        };
    }
    
    /**
     * Convert analytics data to CSV format
     */
    static convertToCSV(data) {
        const rows = [
            ['Metric', 'Value'],
            ['Timestamp', data.timestamp],
            ['Period Hours', data.period_hours],
            ['Cache Hit Rate', `${data.performance.hit_rate}%`],
            ['Total API Calls', data.api_analytics.total_calls],
            ['API Calls Saved', data.cost_analysis.api_calls_saved],
            ['Cost Savings USD', `$${data.cost_analysis.cost_savings_usd}`],
            ['Redis Connected', data.redis.redis?.connected || false],
            ['Database Cache Entries', data.database_cache.total_entries],
            ['Predictive Service Running', data.predictive_cache.service_status?.running || false]
        ];
        
        return rows.map(row => row.join(',')).join('\n');
    }
}

module.exports = CacheAnalyticsController;