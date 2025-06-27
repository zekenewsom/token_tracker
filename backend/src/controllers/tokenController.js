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
const prisma = require('../utils/prismaClient'); // Single, correct declaration

let isRefreshing = false;

// Controller to trigger a full data refresh
exports.refresh = async (req, res) => {
  if (isRefreshing) {
    return res.status(429).json({ message: 'A refresh is already in progress.' });
  }
  isRefreshing = true;
  console.log('[LOG] Starting data refresh...');

  try {
    await refreshDataViaRPC();
    await refreshHolderData();
    
    // Invalidate caches after refresh
    invalidateTokenHoldersCache();
    invalidateTransactionsCache();
    
    res.status(200).json({ message: 'Data and token holders refreshed successfully.' });
  } catch (error) {
    console.error('Failed to refresh data:', error);
    res.status(500).json({ message: 'Failed to refresh data.' });
  } finally {
    isRefreshing = false;
    console.log('[LOG] Data refresh process finished.');
  }
};

// Controller to get all transactions from the local database (with caching)
exports.getTransactions = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 100;

  try {
    // Use cached transactions if available
    const transactions = await getCachedTransactions(page, limit);
    
    res.json(transactions);
  } catch (err) {
    console.error('Error fetching transactions:', err.message);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

// Controller to get the top token holders from the database (with caching)
exports.getTokenHolders = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;

    // Use cached token holders if available
    const holders = await getCachedTokenHolders(limit);

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

// New controller to get cache statistics
exports.getCacheStats = async (req, res) => {
  try {
    const stats = getCacheStats();
    res.json({ cache_stats: stats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cache stats', details: err.message });
  }
};