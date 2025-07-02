const express = require('express');
const router = express.Router();
const AdvancedAnalyticsController = require('../controllers/advancedAnalyticsController');
const redisCache = require('../services/redisCacheService');
const mlPrediction = require('../services/mlCachePredictionService');
const blockchainMonitor = require('../services/blockchainEventMonitor');
const autoScaling = require('../services/autoScalingCacheManager');
const intelligentWarming = require('../services/intelligentCacheWarming');

// System Overview and Health
router.get('/overview', AdvancedAnalyticsController.getSystemOverview);
router.get('/health', async (req, res) => {
    try {
        const health = await AdvancedAnalyticsController.getSystemHealth();
        res.json(health);
    } catch (error) {
        console.error('[ANALYTICS] Health check error:', error.message);
        res.status(500).json({ error: 'Health check failed', details: error.message });
    }
});

// Performance Analytics
router.get('/performance', async (req, res) => {
    try {
        const hours = parseInt(req.query.hours) || 24;
        const performance = await AdvancedAnalyticsController.getPerformanceMetrics(hours);
        res.json(performance);
    } catch (error) {
        console.error('[ANALYTICS] Performance metrics error:', error.message);
        res.status(500).json({ error: 'Failed to get performance metrics', details: error.message });
    }
});

// Redis Cache Statistics
router.get('/redis', async (req, res) => {
    try {
        const stats = await redisCache.getStats();
        res.json({
            timestamp: new Date().toISOString(),
            redis_stats: stats
        });
    } catch (error) {
        console.error('[ANALYTICS] Redis stats error:', error.message);
        res.status(500).json({ error: 'Failed to get Redis stats', details: error.message });
    }
});

// Machine Learning Analytics
router.get('/ml', async (req, res) => {
    try {
        const mlStats = await mlPrediction.getMLStats();
        res.json({
            timestamp: new Date().toISOString(),
            ml_analytics: mlStats
        });
    } catch (error) {
        console.error('[ANALYTICS] ML stats error:', error.message);
        res.status(500).json({ error: 'Failed to get ML stats', details: error.message });
    }
});

// Blockchain Monitoring Analytics
router.get('/blockchain', async (req, res) => {
    try {
        const blockchainStats = await blockchainMonitor.getMonitoringStats();
        res.json({
            timestamp: new Date().toISOString(),
            blockchain_monitoring: blockchainStats
        });
    } catch (error) {
        console.error('[ANALYTICS] Blockchain stats error:', error.message);
        res.status(500).json({ error: 'Failed to get blockchain stats', details: error.message });
    }
});

// Auto-scaling Analytics
router.get('/scaling', async (req, res) => {
    try {
        const scalingStats = await autoScaling.getScalingStats();
        res.json({
            timestamp: new Date().toISOString(),
            auto_scaling: scalingStats
        });
    } catch (error) {
        console.error('[ANALYTICS] Scaling stats error:', error.message);
        res.status(500).json({ error: 'Failed to get scaling stats', details: error.message });
    }
});

// Intelligent Warming Analytics
router.get('/warming', async (req, res) => {
    try {
        const warmingStats = await intelligentWarming.getWarmingStats();
        res.json({
            timestamp: new Date().toISOString(),
            intelligent_warming: warmingStats
        });
    } catch (error) {
        console.error('[ANALYTICS] Warming stats error:', error.message);
        res.status(500).json({ error: 'Failed to get warming stats', details: error.message });
    }
});

// Combined Dashboard Data
router.get('/dashboard', async (req, res) => {
    try {
        const timeRange = parseInt(req.query.hours) || 24;
        
        const [
            systemHealth,
            performanceMetrics,
            redisStats,
            mlStats,
            blockchainStats,
            scalingStats,
            warmingStats
        ] = await Promise.all([
            AdvancedAnalyticsController.getSystemHealth(),
            AdvancedAnalyticsController.getPerformanceMetrics(timeRange),
            redisCache.getStats(),
            mlPrediction.getMLStats(),
            blockchainMonitor.getMonitoringStats(),
            autoScaling.getScalingStats(),
            intelligentWarming.getWarmingStats()
        ]);
        
        res.json({
            timestamp: new Date().toISOString(),
            time_range_hours: timeRange,
            system_health: systemHealth,
            performance: performanceMetrics,
            redis: redisStats,
            machine_learning: mlStats,
            blockchain_monitoring: blockchainStats,
            auto_scaling: scalingStats,
            intelligent_warming: warmingStats
        });
        
    } catch (error) {
        console.error('[ANALYTICS] Dashboard error:', error.message);
        res.status(500).json({ error: 'Failed to get dashboard data', details: error.message });
    }
});

// Control Endpoints
router.post('/ml/train', async (req, res) => {
    try {
        await mlPrediction.collectTrainingData();
        await mlPrediction.trainModel();
        res.json({ message: 'ML model training initiated', timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('[ANALYTICS] ML training error:', error.message);
        res.status(500).json({ error: 'Failed to train ML model', details: error.message });
    }
});

router.post('/scaling/evaluate', async (req, res) => {
    try {
        await autoScaling.manualScalingEvaluation();
        res.json({ message: 'Manual scaling evaluation triggered', timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('[ANALYTICS] Scaling evaluation error:', error.message);
        res.status(500).json({ error: 'Failed to trigger scaling evaluation', details: error.message });
    }
});

router.post('/warming/trigger', async (req, res) => {
    try {
        await intelligentWarming.manualWarmingTrigger();
        res.json({ message: 'Manual warming trigger activated', timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('[ANALYTICS] Warming trigger error:', error.message);
        res.status(500).json({ error: 'Failed to trigger warming', details: error.message });
    }
});

// Cache Prediction Endpoint
router.post('/predict-cache', async (req, res) => {
    try {
        const { cache_key, access_data } = req.body;
        
        if (!cache_key) {
            return res.status(400).json({ error: 'cache_key is required' });
        }
        
        const prediction = await mlPrediction.predictCacheHit(cache_key, access_data || {});
        res.json({
            cache_key,
            prediction,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('[ANALYTICS] Cache prediction error:', error.message);
        res.status(500).json({ error: 'Failed to predict cache hit', details: error.message });
    }
});

// Export Analytics Data
router.get('/export', AdvancedAnalyticsController.exportAnalytics);

module.exports = router;