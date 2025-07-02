const express = require('express');
const router = express.Router();
const heliusRpcService = require('../services/heliusRpcService');
const { validateConfig } = require('../config/heliusConfig');

// Get Helius RPC service status and statistics
router.get('/status', async (req, res) => {
    try {
        const stats = heliusRpcService.getStats();
        const configValid = validateConfig();
        
        res.json({
            success: true,
            config: {
                valid: configValid,
                primaryUrl: process.env.HELIUS_RPC_URL ? 'Configured' : 'Not configured',
                apiKey: process.env.HELIUS_API_KEY ? 'Configured' : 'Not configured',
                backupUrls: process.env.HELIUS_BACKUP_RPC_URL_1 ? 'Configured' : 'Not configured'
            },
            stats: stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[HELIUS API] Error getting status:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get endpoint health information
router.get('/health', async (req, res) => {
    try {
        const stats = heliusRpcService.getStats();
        const healthInfo = stats.endpoints.map(endpoint => ({
            name: endpoint.name,
            type: endpoint.type,
            isHealthy: endpoint.isHealthy,
            failures: endpoint.failures,
            requestCount: endpoint.requestCount,
            errorCount: endpoint.errorCount,
            lastFailure: endpoint.lastFailure ? new Date(endpoint.lastFailure).toISOString() : null,
            lastSuccess: endpoint.lastSuccess ? new Date(endpoint.lastSuccess).toISOString() : null
        }));
        
        const overallHealth = healthInfo.some(endpoint => endpoint.isHealthy);
        
        res.json({
            success: true,
            overallHealth: overallHealth,
            endpoints: healthInfo,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[HELIUS API] Error getting health:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Clear Helius service caches
router.post('/clear-cache', async (req, res) => {
    try {
        heliusRpcService.clearCaches();
        
        res.json({
            success: true,
            message: 'Helius service caches cleared successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[HELIUS API] Error clearing cache:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test Helius RPC connection
router.post('/test-connection', async (req, res) => {
    try {
        const { method = 'getHealth' } = req.body;
        
        let testPayload;
        switch (method) {
            case 'getHealth':
                testPayload = {
                    jsonrpc: '2.0',
                    id: '1',
                    method: 'getHealth'
                };
                break;
            case 'getTokenAccounts':
                testPayload = {
                    jsonrpc: '2.0',
                    id: '1',
                    method: 'getTokenAccounts',
                    params: {
                        mint: '2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump',
                        limit: 1
                    }
                };
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid test method. Use "getHealth" or "getTokenAccounts"'
                });
        }
        
        const result = await heliusRpcService.makeRpcCall(testPayload, {
            method: method,
            useCache: false,
            maxRetries: 1
        });
        
        res.json({
            success: true,
            method: method,
            result: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[HELIUS API] Error testing connection:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Get rate limiting information
router.get('/rate-limits', async (req, res) => {
    try {
        const stats = heliusRpcService.getStats();
        
        res.json({
            success: true,
            rateLimiters: {
                endpointCount: stats.rateLimiters.endpointCount,
                methodCount: stats.rateLimiters.methodCount,
                cacheSize: stats.cache.responseCacheSize
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[HELIUS API] Error getting rate limits:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router; 