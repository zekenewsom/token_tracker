// backend/src/controllers/tokenController.js

// Declare all imports at the top of the file
const { refreshDataViaRPC, refreshHolderData } = require('../services/solanaService');
const { 
    getCachedTokenHolders, 
    getCachedTransactions,
    invalidateTokenHoldersCache,
    invalidateTransactionsCache,
    getCacheStats
} = require('../services/cacheService');
const databaseCache = require('../services/databaseCacheService');
const changeDetection = require('../services/changeDetectionService');
const redisCache = require('../services/redisCacheService');
const prisma = require('../utils/prismaClient'); // Single, correct declaration

let isRefreshing = false;

// Controller to trigger a full data refresh with intelligent caching
exports.refresh = async (req, res) => {
  if (isRefreshing) {
    return res.status(429).json({ message: 'A refresh is already in progress.' });
  }
  isRefreshing = true;
  console.log('[LOG] Starting intelligent data refresh...');
  const startTime = Date.now();

  try {
    await refreshDataViaRPC();
    await refreshHolderData();
    
    // Invalidate all caches after refresh
    invalidateTokenHoldersCache();
    invalidateTransactionsCache();
    await databaseCache.invalidateRefreshCaches();
    if (redisCache.isConnected) {
      await redisCache.clear('*'); // Clear all Redis tiers
    }
    
    // Log successful refresh
    await changeDetection.logApiCall(
      'manual_refresh', 
      'complete', 
      true, 
      Date.now() - startTime
    );
    await changeDetection.markFullRefreshCompleted();
    
    res.status(200).json({ 
      message: 'Data and token holders refreshed successfully.',
      duration_ms: Date.now() - startTime
    });
  } catch (error) {
    console.error('Failed to refresh data:', error);
    
    // Log failed refresh
    await changeDetection.logApiCall(
      'manual_refresh', 
      'error', 
      false, 
      Date.now() - startTime, 
      error.message
    );
    
    res.status(500).json({ message: 'Failed to refresh data.' });
  } finally {
    isRefreshing = false;
    console.log(`[LOG] Data refresh process finished in ${Date.now() - startTime}ms`);
  }
};

// Controller to get all transactions from the local database (with database caching)
exports.getTransactions = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 100;

  try {
    // Try database cache first, fallback to in-memory cache
    let transactions = await databaseCache.getCachedTransactions(page, limit);
    
    if (!transactions) {
      // Fallback to existing in-memory cache
      transactions = await getCachedTransactions(page, limit);
    }
    
    res.json(transactions);
  } catch (err) {
    console.error('Error fetching transactions:', err.message);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

// Controller to get the top token holders from the database (with multi-tier caching)
exports.getTokenHolders = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 1000;
    const cacheKey = `token_holders_${limit}`;

    // Try Redis cache first (HOT tier for frequently accessed data)
    let holders = await redisCache.get(cacheKey);
    
    if (!holders) {
      // Fallback to database cache
      holders = await databaseCache.getCachedTokenHolders(limit);
      
      if (!holders) {
        // Ultimate fallback to in-memory cache
        holders = await getCachedTokenHolders(limit);
      }
      
      // Store in Redis HOT tier for fast access
      if (holders && redisCache.isConnected) {
        await redisCache.set(cacheKey, holders, 'HOT');
      }
    }

    const result = holders.map(h => ({
      address: h.wallet.address,
      balance: h.balance,
      ownership_percentage: h.ownership_percentage,
      average_acquisition_price_usd: h.average_acquisition_price_usd,
    }));

    res.json({ holders: result, count: result.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch token holders', details: err.message });
  }
};

// Enhanced controller to get comprehensive cache statistics
exports.getCacheStats = async (req, res) => {
  try {
    const [memoryStats, dbCacheStats, redisStats, apiStats] = await Promise.all([
      getCacheStats(),
      databaseCache.getStats(),
      redisCache.getStats().catch(() => ({ redis: { connected: false } })),
      changeDetection.getApiCallStats(24)
    ]);
    
    res.json({ 
      memory_cache: memoryStats,
      database_cache: dbCacheStats,
      redis_cache: redisStats,
      api_calls_24h: apiStats,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cache stats', details: err.message });
  }
};