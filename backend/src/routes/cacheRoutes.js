const express = require('express');
const router = express.Router();
const databaseCache = require('../services/databaseCacheService');
const changeDetection = require('../services/changeDetectionService');
const CacheAnalyticsController = require('../controllers/cacheAnalyticsController');

// Import Phase 2 & 3 services
const redisCache = require('../services/redisCacheService');
const mlPrediction = require('../services/mlCachePredictionService');
const blockchainMonitor = require('../services/blockchainEventMonitor');
const autoScaling = require('../services/autoScalingCacheManager');
const intelligentWarming = require('../services/intelligentCacheWarming');

// Route to get comprehensive cache statistics
router.get('/stats', async (req, res) => {
  try {
    const [dbCacheStats, apiStats, redisStats] = await Promise.all([
      databaseCache.getStats(),
      changeDetection.getApiCallStats(24),
      redisCache.getStats().catch(() => ({ redis: { connected: false } }))
    ]);
    
    res.json({
      database_cache: dbCacheStats,
      redis_cache: redisStats,
      api_calls_24h: apiStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cache stats', details: error.message });
  }
});

// Route to clear specific cache patterns
router.delete('/clear', async (req, res) => {
  try {
    const { pattern, tier } = req.query;
    
    if (pattern) {
      // Clear from both database and Redis
      await Promise.all([
        databaseCache.clear(pattern),
        redisCache.clear(pattern).catch(() => {}) // Don't fail if Redis is down
      ]);
      res.json({ message: `Cache cleared for pattern: ${pattern}` });
    } else if (tier) {
      // Clear specific Redis tier
      await redisCache.clearTier(tier);
      res.json({ message: `Redis ${tier} tier cleared` });
    } else {
      // Clear all caches
      await Promise.all([
        databaseCache.clear(),
        redisCache.clear().catch(() => {})
      ]);
      res.json({ message: 'All cache entries cleared' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cache', details: error.message });
  }
});

// Route to clear expired cache entries
router.post('/cleanup', async (req, res) => {
  try {
    const [dbCleanedUp, logsCleanedUp] = await Promise.all([
      databaseCache.cleanupExpired(),
      changeDetection.cleanupOldLogs()
    ]);
    
    res.json({ 
      message: 'Cache cleanup completed',
      cache_entries_removed: dbCleanedUp,
      log_entries_removed: logsCleanedUp
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cleanup cache', details: error.message });
  }
});

// Route to get API call analytics
router.get('/api-analytics', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const stats = await changeDetection.getApiCallStats(hours);
    
    res.json({
      period_hours: hours,
      ...stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch API analytics', details: error.message });
  }
});

// Route to check if full refresh is needed
router.get('/refresh-status', async (req, res) => {
  try {
    const shouldRefresh = await changeDetection.shouldPerformFullRefresh();
    const holderListChanged = await changeDetection.hasHolderListChanged(50);
    
    res.json({
      should_full_refresh: shouldRefresh,
      holder_list_changed: holderListChanged,
      recommendation: shouldRefresh ? 'full_refresh' : holderListChanged ? 'holder_refresh' : 'no_refresh_needed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check refresh status', details: error.message });
  }
});

// Advanced Analytics Routes
router.get('/dashboard', CacheAnalyticsController.getDashboard);
router.get('/tier-analysis', CacheAnalyticsController.getTierAnalysis);
router.get('/api-efficiency', CacheAnalyticsController.getApiEfficiencyReport);
router.get('/export', CacheAnalyticsController.exportAnalytics);

// Phase 2 & 3 Advanced Routes

// Redis tier management
router.get('/tiers', async (req, res) => {
  try {
    const redisStats = await redisCache.getStats();
    res.json({
      tiers: redisStats.tiers || {},
      tier_configuration: redisStats.tier_configuration || {},
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tier information', details: error.message });
  }
});

// ML prediction for specific cache key
router.post('/predict', async (req, res) => {
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
    res.status(500).json({ error: 'Failed to predict cache hit', details: error.message });
  }
});

// Intelligent warming recommendations
router.get('/warming-recommendations', async (req, res) => {
  try {
    const recommendations = await intelligentWarming.getWarmingStats();
    res.json({
      warming_recommendations: recommendations,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get warming recommendations', details: error.message });
  }
});

// Trigger manual warming
router.post('/warm', async (req, res) => {
  try {
    await intelligentWarming.manualWarmingTrigger();
    res.json({ 
      message: 'Manual warming triggered successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to trigger warming', details: error.message });
  }
});

// Blockchain monitoring status
router.get('/blockchain-status', async (req, res) => {
  try {
    const monitoringStats = await blockchainMonitor.getMonitoringStats();
    res.json({
      blockchain_monitoring: monitoringStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get blockchain monitoring status', details: error.message });
  }
});

// Auto-scaling status and controls
router.get('/scaling-status', async (req, res) => {
  try {
    const scalingStats = await autoScaling.getScalingStats();
    res.json({
      auto_scaling: scalingStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get scaling status', details: error.message });
  }
});

router.post('/scaling/evaluate', async (req, res) => {
  try {
    await autoScaling.manualScalingEvaluation();
    res.json({ 
      message: 'Manual scaling evaluation triggered',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to trigger scaling evaluation', details: error.message });
  }
});

// ML model training
router.post('/ml/train', async (req, res) => {
  try {
    await mlPrediction.collectTrainingData();
    setTimeout(async () => {
      await mlPrediction.trainModel();
    }, 1000);
    
    res.json({ 
      message: 'ML model training initiated',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to initiate ML training', details: error.message });
  }
});

// Get ML model statistics
router.get('/ml/stats', async (req, res) => {
  try {
    const mlStats = await mlPrediction.getMLStats();
    res.json({
      ml_statistics: mlStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get ML statistics', details: error.message });
  }
});

module.exports = router;