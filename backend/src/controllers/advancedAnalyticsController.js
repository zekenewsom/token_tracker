const redisCache = require('../services/redisCacheService');
const databaseCache = require('../services/databaseCacheService');
const mlPrediction = require('../services/mlCachePredictionService');
const blockchainMonitor = require('../services/blockchainEventMonitor');
const autoScaling = require('../services/autoScalingCacheManager');
const changeDetection = require('../services/changeDetectionService');
const prisma = require('../utils/prismaClient');

class AdvancedAnalyticsController {
    
    /**
     * Get comprehensive system overview with visualizations
     */
    static async getSystemOverview(req, res) {
        try {
            const timeRange = parseInt(req.query.hours) || 24;
            
            const [
                systemHealth,
                performanceMetrics,
                mlStats,
                blockchainStats,
                scalingStats,
                trendAnalysis
            ] = await Promise.all([
                AdvancedAnalyticsController.getSystemHealth(),
                AdvancedAnalyticsController.getPerformanceMetrics(timeRange),
                mlPrediction.getMLStats(),
                blockchainMonitor.getMonitoringStats(),
                autoScaling.getScalingStats(),
                AdvancedAnalyticsController.getTrendAnalysis(timeRange)
            ]);
            
            res.json({
                timestamp: new Date().toISOString(),
                time_range_hours: timeRange,
                system_health: systemHealth,
                performance: performanceMetrics,
                machine_learning: mlStats,
                blockchain_monitoring: blockchainStats,
                auto_scaling: scalingStats,
                trends: trendAnalysis,
                visualization_data: {
                    performance_chart: AdvancedAnalyticsController.generatePerformanceChart(performanceMetrics),
                    ml_accuracy_chart: AdvancedAnalyticsController.generateMLChart(mlStats),
                    scaling_timeline: AdvancedAnalyticsController.generateScalingChart(scalingStats),
                    system_health_gauge: AdvancedAnalyticsController.generateHealthGauge(systemHealth)
                }
            });
            
        } catch (error) {
            console.error('[ADVANCED-ANALYTICS] System overview error:', error.message);
            res.status(500).json({ error: 'Failed to generate system overview' });
        }
    }
    
    /**
     * Get comprehensive system health metrics
     */
    static async getSystemHealth() {
        try {
            const [
                redisStats,
                dbStats,
                mlHealth,
                blockchainHealth,
                scalingHealth
            ] = await Promise.all([
                redisCache.getStats(),
                databaseCache.getStats(),
                mlPrediction.getMLStats(),
                blockchainMonitor.healthCheck(),
                autoScaling.getScalingStats()
            ]);
            
            // Calculate overall health score
            let healthScore = 100;
            const healthFactors = [];
            
            // Redis health (25% weight)
            if (!redisStats.redis?.connected) {
                healthScore -= 25;
                healthFactors.push({ component: 'redis', status: 'disconnected', impact: -25 });
            } else if (redisStats.redis.total_keys > 50000) {
                healthScore -= 10;
                healthFactors.push({ component: 'redis', status: 'high_memory', impact: -10 });
            }
            
            // Database cache health (20% weight)
            if (dbStats.total_entries === 0) {
                healthScore -= 15;
                healthFactors.push({ component: 'database_cache', status: 'empty', impact: -15 });
            } else if (dbStats.expired_entries > dbStats.total_entries * 0.3) {
                healthScore -= 10;
                healthFactors.push({ component: 'database_cache', status: 'high_expiry', impact: -10 });
            }
            
            // ML health (20% weight)
            if (!mlHealth.model_status?.initialized) {
                healthScore -= 15;
                healthFactors.push({ component: 'machine_learning', status: 'not_initialized', impact: -15 });
            } else if (mlHealth.performance?.accuracy < 0.7) {
                healthScore -= 10;
                healthFactors.push({ component: 'machine_learning', status: 'low_accuracy', impact: -10 });
            }
            
            // Blockchain monitoring health (15% weight)
            if (blockchainHealth.status === 'unhealthy') {
                healthScore -= 15;
                healthFactors.push({ component: 'blockchain_monitor', status: 'unhealthy', impact: -15 });
            } else if (blockchainHealth.status === 'degraded') {
                healthScore -= 8;
                healthFactors.push({ component: 'blockchain_monitor', status: 'degraded', impact: -8 });
            }
            
            // Auto-scaling health (20% weight)
            if (!scalingHealth.status?.is_running) {
                healthScore -= 10;
                healthFactors.push({ component: 'auto_scaling', status: 'stopped', impact: -10 });
            }
            
            const overallStatus = healthScore >= 90 ? 'excellent' :
                                healthScore >= 75 ? 'good' :
                                healthScore >= 60 ? 'fair' :
                                healthScore >= 40 ? 'poor' : 'critical';
            
            return {
                overall_score: Math.max(0, healthScore),
                status: overallStatus,
                components: {
                    redis: {
                        status: redisStats.redis?.connected ? 'healthy' : 'unhealthy',
                        connected: redisStats.redis?.connected || false,
                        total_keys: redisStats.redis?.total_keys || 0
                    },
                    database_cache: {
                        status: dbStats.total_entries > 0 ? 'healthy' : 'empty',
                        total_entries: dbStats.total_entries,
                        active_entries: dbStats.active_entries
                    },
                    machine_learning: {
                        status: mlHealth.model_status?.initialized ? 'healthy' : 'not_ready',
                        accuracy: mlHealth.performance?.accuracy || 0,
                        predictions_made: mlHealth.performance?.predictions_made || 0
                    },
                    blockchain_monitor: {
                        status: blockchainHealth.status,
                        connections: blockchainHealth.connections,
                        recent_events: blockchainHealth.recent_events
                    },
                    auto_scaling: {
                        status: scalingHealth.status?.is_running ? 'active' : 'inactive',
                        last_action: scalingHealth.status?.last_scaling_action
                    }
                },
                health_factors: healthFactors,
                recommendations: AdvancedAnalyticsController.generateHealthRecommendations(healthFactors)
            };
            
        } catch (error) {
            console.error('[ADVANCED-ANALYTICS] System health error:', error.message);
            return { overall_score: 0, status: 'error', error: error.message };
        }
    }
    
    /**
     * Get detailed performance metrics with trends
     */
    static async getPerformanceMetrics(hours = 24) {
        try {
            const since = new Date(Date.now() - (hours * 60 * 60 * 1000));
            
            // Get API call metrics
            const apiStats = await changeDetection.getApiCallStats(hours);
            
            // Get cache performance from recent access patterns
            const [
                cacheHits,
                cacheMisses,
                avgResponseTime
            ] = await Promise.all([
                AdvancedAnalyticsController.getCacheHits(since),
                AdvancedAnalyticsController.getCacheMisses(since),
                AdvancedAnalyticsController.getAverageResponseTime(since)
            ]);
            
            const totalCacheOperations = cacheHits + cacheMisses;
            const cacheHitRate = totalCacheOperations > 0 ? (cacheHits / totalCacheOperations) * 100 : 0;
            
            // Calculate performance trends
            const trends = await AdvancedAnalyticsController.calculatePerformanceTrends(hours);
            
            return {
                cache_performance: {
                    hit_rate: cacheHitRate.toFixed(2),
                    total_hits: cacheHits,
                    total_misses: cacheMisses,
                    total_operations: totalCacheOperations,
                    trend: trends.cache_hit_trend
                },
                api_performance: {
                    total_calls: apiStats.total_calls,
                    successful_calls: apiStats.successful_calls,
                    success_rate: apiStats.success_rate,
                    average_response_time: avgResponseTime,
                    trend: trends.api_performance_trend
                },
                system_performance: {
                    requests_per_minute: Math.round(apiStats.total_calls / (hours * 60)),
                    errors_per_minute: Math.round((apiStats.total_calls - apiStats.successful_calls) / (hours * 60)),
                    cache_efficiency: AdvancedAnalyticsController.calculateCacheEfficiency(cacheHitRate, apiStats.total_calls),
                    trend: trends.system_performance_trend
                },
                hourly_breakdown: await AdvancedAnalyticsController.getHourlyBreakdown(hours)
            };
            
        } catch (error) {
            console.error('[ADVANCED-ANALYTICS] Performance metrics error:', error.message);
            return {};
        }
    }
    
    /**
     * Get cache hits from access logs
     */
    static async getCacheHits(since) {
        try {
            if (redisCache.isConnected) {
                const accessKeys = await redisCache.redis.keys('access:*');
                let totalHits = 0;
                
                for (const key of accessKeys.slice(0, 100)) { // Sample for performance
                    const data = await redisCache.redis.hgetall(key);
                    const lastAccess = parseInt(data.last_access || 0);
                    
                    if (lastAccess >= since.getTime()) {
                        totalHits += parseInt(data.hits || 0);
                    }
                }
                
                return totalHits;
            }
            return 0;
        } catch (error) {
            return 0;
        }
    }
    
    /**
     * Get cache misses from database logs
     */
    static async getCacheMisses(since) {
        try {
            const missCount = await prisma.apiCallLog.count({
                where: {
                    created_at: { gte: since },
                    method: 'cache_miss'
                }
            });
            return missCount;
        } catch (error) {
            return 0;
        }
    }
    
    /**
     * Get average response time
     */
    static async getAverageResponseTime(since) {
        try {
            const avgResponse = await prisma.apiCallLog.aggregate({
                where: {
                    created_at: { gte: since },
                    response_time: { not: null }
                },
                _avg: { response_time: true }
            });
            
            return avgResponse._avg.response_time || 0;
        } catch (error) {
            return 0;
        }
    }
    
    /**
     * Calculate cache efficiency score
     */
    static calculateCacheEfficiency(hitRate, totalCalls) {
        // Efficiency combines hit rate with call volume
        const hitRateScore = hitRate / 100; // Normalize to 0-1
        const volumeScore = Math.min(totalCalls / 10000, 1); // Normalize volume (max 10k calls)
        
        return ((hitRateScore * 0.7) + (volumeScore * 0.3)) * 100;
    }
    
    /**
     * Calculate performance trends
     */
    static async calculatePerformanceTrends(hours) {
        try {
            const currentPeriod = hours;
            const previousPeriod = hours * 2; // Compare with previous period
            
            const [currentStats, previousStats] = await Promise.all([
                changeDetection.getApiCallStats(currentPeriod),
                changeDetection.getApiCallStats(previousPeriod)
            ]);
            
            // Calculate trends
            const apiTrend = AdvancedAnalyticsController.calculateTrend(
                currentStats.total_calls,
                previousStats.total_calls - currentStats.total_calls
            );
            
            return {
                cache_hit_trend: 'stable', // Placeholder - would calculate from cache data
                api_performance_trend: apiTrend,
                system_performance_trend: apiTrend
            };
            
        } catch (error) {
            return {
                cache_hit_trend: 'unknown',
                api_performance_trend: 'unknown',
                system_performance_trend: 'unknown'
            };
        }
    }
    
    /**
     * Calculate trend direction
     */
    static calculateTrend(current, previous) {
        if (previous === 0) return 'stable';
        
        const change = ((current - previous) / previous) * 100;
        
        if (change > 10) return 'increasing';
        if (change < -10) return 'decreasing';
        return 'stable';
    }
    
    /**
     * Get hourly performance breakdown
     */
    static async getHourlyBreakdown(hours) {
        try {
            const breakdown = [];
            const now = new Date();
            
            for (let i = hours - 1; i >= 0; i--) {
                const hourStart = new Date(now.getTime() - (i * 60 * 60 * 1000));
                const hourEnd = new Date(hourStart.getTime() + (60 * 60 * 1000));
                
                const hourStats = await prisma.apiCallLog.count({
                    where: {
                        created_at: {
                            gte: hourStart,
                            lt: hourEnd
                        }
                    }
                });
                
                breakdown.push({
                    hour: hourStart.getHours(),
                    timestamp: hourStart.toISOString(),
                    api_calls: hourStats,
                    cache_operations: Math.floor(hourStats * 1.5) // Estimate
                });
            }
            
            return breakdown;
        } catch (error) {
            return [];
        }
    }
    
    /**
     * Get trend analysis across multiple metrics
     */
    static async getTrendAnalysis(hours) {
        try {
            // Analyze trends across different time periods
            const periods = [1, 6, 24, 168]; // 1h, 6h, 24h, 1 week
            const trendData = {};
            
            for (const period of periods) {
                if (period <= hours) {
                    const stats = await changeDetection.getApiCallStats(period);
                    trendData[`${period}h`] = {
                        api_calls: stats.total_calls,
                        success_rate: stats.success_rate,
                        average_response_time: stats.average_response_time
                    };
                }
            }
            
            return {
                periods: trendData,
                analysis: AdvancedAnalyticsController.analyzeTrends(trendData),
                predictions: AdvancedAnalyticsController.generatePredictions(trendData)
            };
            
        } catch (error) {
            return { periods: {}, analysis: 'error', predictions: [] };
        }
    }
    
    /**
     * Analyze trends from period data
     */
    static analyzeTrends(trendData) {
        const periods = Object.keys(trendData).sort();
        if (periods.length < 2) return 'insufficient_data';
        
        const recent = trendData[periods[periods.length - 1]];
        const previous = trendData[periods[periods.length - 2]];
        
        if (recent.api_calls > previous.api_calls * 1.2) {
            return 'growing_rapidly';
        } else if (recent.api_calls > previous.api_calls * 1.1) {
            return 'growing_steadily';
        } else if (recent.api_calls < previous.api_calls * 0.8) {
            return 'declining';
        } else {
            return 'stable';
        }
    }
    
    /**
     * Generate predictions based on trends
     */
    static generatePredictions(trendData) {
        const predictions = [];
        
        // Simple linear trend predictions
        const periods = Object.keys(trendData).sort();
        if (periods.length >= 2) {
            const recent = trendData[periods[periods.length - 1]];
            const previous = trendData[periods[periods.length - 2]];
            
            const apiCallTrend = (recent.api_calls - previous.api_calls) / previous.api_calls;
            
            if (apiCallTrend > 0.2) {
                predictions.push({
                    type: 'scaling_recommendation',
                    message: 'API call volume increasing rapidly - consider scaling up',
                    confidence: 0.7
                });
            }
            
            if (recent.success_rate < 0.9) {
                predictions.push({
                    type: 'reliability_warning',
                    message: 'Success rate declining - investigate error patterns',
                    confidence: 0.8
                });
            }
        }
        
        return predictions;
    }
    
    /**
     * Generate health recommendations
     */
    static generateHealthRecommendations(healthFactors) {
        const recommendations = [];
        
        healthFactors.forEach(factor => {
            switch (factor.component) {
                case 'redis':
                    if (factor.status === 'disconnected') {
                        recommendations.push({
                            priority: 'high',
                            component: 'redis',
                            action: 'Check Redis connection and restart service if needed',
                            impact: 'High - Cache performance severely affected'
                        });
                    }
                    break;
                    
                case 'machine_learning':
                    if (factor.status === 'not_initialized') {
                        recommendations.push({
                            priority: 'medium',
                            component: 'machine_learning',
                            action: 'Initialize ML model and collect training data',
                            impact: 'Medium - Predictive caching unavailable'
                        });
                    }
                    break;
                    
                case 'blockchain_monitor':
                    if (factor.status === 'unhealthy') {
                        recommendations.push({
                            priority: 'high',
                            component: 'blockchain_monitor',
                            action: 'Check WebSocket connections and restart monitoring',
                            impact: 'High - Real-time updates unavailable'
                        });
                    }
                    break;
            }
        });
        
        return recommendations;
    }
    
    /**
     * Generate performance chart data
     */
    static generatePerformanceChart(performanceMetrics) {
        return {
            type: 'line',
            data: {
                labels: ['Cache Hit Rate', 'API Success Rate', 'System Efficiency'],
                datasets: [{
                    label: 'Performance Metrics',
                    data: [
                        parseFloat(performanceMetrics.cache_performance?.hit_rate || 0),
                        parseFloat(performanceMetrics.api_performance?.success_rate || 0),
                        parseFloat(performanceMetrics.system_performance?.cache_efficiency || 0)
                    ],
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)'
                }]
            },
            options: {
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        };
    }
    
    /**
     * Generate ML accuracy chart data
     */
    static generateMLChart(mlStats) {
        return {
            type: 'doughnut',
            data: {
                labels: ['Correct Predictions', 'Incorrect Predictions'],
                datasets: [{
                    data: [
                        mlStats.performance?.correct_predictions || 0,
                        (mlStats.performance?.predictions_made || 0) - (mlStats.performance?.correct_predictions || 0)
                    ],
                    backgroundColor: ['#36A2EB', '#FF6384']
                }]
            }
        };
    }
    
    /**
     * Generate scaling timeline chart
     */
    static generateScalingChart(scalingStats) {
        const recentHistory = scalingStats.recent_history || [];
        
        return {
            type: 'bar',
            data: {
                labels: recentHistory.map(h => new Date(h.timestamp).toLocaleTimeString()),
                datasets: [{
                    label: 'Scaling Actions',
                    data: recentHistory.map(h => h.action === 'scale_up' ? 1 : h.action === 'scale_down' ? -1 : 0),
                    backgroundColor: recentHistory.map(h => 
                        h.action === 'scale_up' ? '#4BC0C0' : 
                        h.action === 'scale_down' ? '#FF6384' : '#FFCE56'
                    )
                }]
            }
        };
    }
    
    /**
     * Generate system health gauge
     */
    static generateHealthGauge(systemHealth) {
        return {
            type: 'gauge',
            data: {
                datasets: [{
                    data: [systemHealth.overall_score || 0],
                    backgroundColor: [
                        systemHealth.overall_score >= 90 ? '#4BC0C0' :
                        systemHealth.overall_score >= 75 ? '#FFCE56' :
                        systemHealth.overall_score >= 60 ? '#FF9F40' : '#FF6384'
                    ]
                }]
            },
            options: {
                circumference: Math.PI,
                rotation: Math.PI,
                cutout: '80%',
                plugins: {
                    legend: { display: false }
                }
            }
        };
    }
    
    /**
     * Export analytics data in various formats
     */
    static async exportAnalytics(req, res) {
        try {
            const format = req.query.format || 'json';
            const timeRange = parseInt(req.query.hours) || 24;
            
            const analyticsData = {
                timestamp: new Date().toISOString(),
                time_range_hours: timeRange,
                system_health: await AdvancedAnalyticsController.getSystemHealth(),
                performance: await AdvancedAnalyticsController.getPerformanceMetrics(timeRange),
                trends: await AdvancedAnalyticsController.getTrendAnalysis(timeRange)
            };
            
            if (format === 'csv') {
                const csv = AdvancedAnalyticsController.convertToCSV(analyticsData);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="advanced-analytics-${Date.now()}.csv"`);
                res.send(csv);
            } else {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="advanced-analytics-${Date.now()}.json"`);
                res.json(analyticsData);
            }
            
        } catch (error) {
            console.error('[ADVANCED-ANALYTICS] Export error:', error.message);
            res.status(500).json({ error: 'Failed to export analytics data' });
        }
    }
    
    /**
     * Convert analytics data to CSV
     */
    static convertToCSV(data) {
        const rows = [
            ['Metric', 'Value', 'Status'],
            ['System Health Score', data.system_health?.overall_score || 0, data.system_health?.status || 'unknown'],
            ['Cache Hit Rate', data.performance?.cache_performance?.hit_rate || 0, data.performance?.cache_performance?.trend || 'unknown'],
            ['API Success Rate', data.performance?.api_performance?.success_rate || 0, data.performance?.api_performance?.trend || 'unknown'],
            ['Total API Calls', data.performance?.api_performance?.total_calls || 0, ''],
            ['Cache Efficiency', data.performance?.system_performance?.cache_efficiency || 0, ''],
            ['Trend Analysis', data.trends?.analysis || 'unknown', ''],
            ['Redis Status', data.system_health?.components?.redis?.status || 'unknown', ''],
            ['ML Status', data.system_health?.components?.machine_learning?.status || 'unknown', ''],
            ['Blockchain Monitor', data.system_health?.components?.blockchain_monitor?.status || 'unknown', '']
        ];
        
        return rows.map(row => row.join(',')).join('\n');
    }
}

module.exports = AdvancedAnalyticsController;