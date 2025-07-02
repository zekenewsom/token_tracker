// backend/src/index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Import routes
const tokenRoutes = require('./routes/tokenRoutes');
const walletRoutes = require('./routes/walletRoutes');
const analysisRoutes = require('./routes/analysisRoutes');
const cacheRoutes = require('./routes/cacheRoutes');

// Import advanced caching services
const redisCache = require('./services/redisCacheService');
const mlPrediction = require('./services/mlCachePredictionService');
const blockchainMonitor = require('./services/blockchainEventMonitor');
const autoScaling = require('./services/autoScalingCacheManager');
const intelligentWarming = require('./services/intelligentCacheWarming');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/token', tokenRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/cache', cacheRoutes);

// Advanced analytics routes
const advancedAnalyticsRoutes = require('./routes/advancedAnalyticsRoutes');
app.use('/api/analytics', advancedAnalyticsRoutes);

const PORT = process.env.PORT || 4000;

// Initialize advanced caching services
async function initializeAdvancedServices() {
    try {
        console.log('[SERVER] Initializing advanced caching services...');
        
        // Initialize Redis connection (it connects automatically)
        if (redisCache.isConnected) {
            console.log('[SERVER] Redis cache service already connected');
        } else {
            console.log('[SERVER] Redis cache service will connect on first use');
        }
        
        // Start blockchain monitoring
        await blockchainMonitor.startMonitoring();
        console.log('[SERVER] Blockchain event monitoring started');
        
        // Initialize ML prediction service (non-blocking)
        setTimeout(async () => {
            await mlPrediction.collectTrainingData();
            console.log('[SERVER] ML prediction service training data collected');
        }, 5000);
        
        console.log('[SERVER] Advanced caching services initialized successfully');
        
    } catch (error) {
        console.error(`[SERVER] Error initializing advanced services: ${error.message}`);
        console.log('[SERVER] Continuing with basic functionality...');
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('[SERVER] Shutting down gracefully...');
    
    try {
        await blockchainMonitor.stopMonitoring();
        autoScaling.stop();
        intelligentWarming.stop();
        await mlPrediction.dispose();
        if (redisCache.isConnected) {
            await redisCache.redis.quit();
        }
        console.log('[SERVER] Services shut down successfully');
    } catch (error) {
        console.error(`[SERVER] Error during shutdown: ${error.message}`);
    }
    
    process.exit(0);
});

app.listen(PORT, async () => {
    console.log(`[SERVER] Server running on port ${PORT}`);
    
    // Initialize advanced services after server starts
    await initializeAdvancedServices();
});
