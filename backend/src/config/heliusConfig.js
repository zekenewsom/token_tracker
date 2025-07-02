require('dotenv').config();

// Helius Configuration
const HELIUS_CONFIG = {
    // Primary Helius RPC URL (required)
    PRIMARY_RPC_URL: process.env.HELIUS_RPC_URL,
    
    // Backup Helius RPC URLs (optional - for redundancy)
    BACKUP_RPC_URLS: [
        process.env.HELIUS_BACKUP_RPC_URL_1,
        process.env.HELIUS_BACKUP_RPC_URL_2,
        process.env.HELIUS_BACKUP_RPC_URL_3
    ].filter(Boolean),
    
    // Helius API Key for enhanced features
    API_KEY: process.env.HELIUS_API_KEY,
    
    // Rate Limiting Configuration
    RATE_LIMITS: {
        // Per-endpoint rate limits based on Helius documentation
        PRIMARY: {
            requestsPerSecond: 5,     // Reduced from 10 to 5 RPS
            requestsPerMinute: 300,   // Reduced from 600 to 300 RPM
            burstLimit: 10,           // Reduced from 20 to 10
            windowMs: 60000           // 1 minute window
        },
        BACKUP: {
            requestsPerSecond: 3,     // Reduced from 5 to 3 RPS
            requestsPerMinute: 180,   // Reduced from 300 to 180 RPM
            burstLimit: 5,            // Reduced from 10 to 5
            windowMs: 60000           // 1 minute window
        },
        // Enhanced rate limits for specific methods
        METHODS: {
            'getTokenAccounts': {
                requestsPerSecond: 2, // Reduced from 5 to 2
                requestsPerMinute: 100, // Reduced from 200 to 100
                burstLimit: 5         // Reduced from 10 to 5
            },
            'getSignaturesForAddress': {
                requestsPerSecond: 2, // Reduced from 3 to 2
                requestsPerMinute: 100, // Reduced from 150 to 100
                burstLimit: 5         // Reduced from 8 to 5
            },
            'getTransaction': {
                requestsPerSecond: 4, // Reduced from 8 to 4
                requestsPerMinute: 200, // Reduced from 400 to 200
                burstLimit: 8         // Reduced from 15 to 8
            },
            'getMultipleAccounts': {
                requestsPerSecond: 2, // Reduced from 4 to 2
                requestsPerMinute: 100, // Reduced from 200 to 100
                burstLimit: 4         // Reduced from 8 to 4
            }
        }
    },
    
    // Circuit Breaker Configuration
    CIRCUIT_BREAKER: {
        maxFailures: 5,           // Max consecutive failures before circuit opens
        resetTimeout: 300000,     // 5 minutes before attempting reset
        halfOpenRetryDelay: 60000, // 1 minute delay for half-open state
        successThreshold: 3       // Number of successful calls to close circuit
    },
    
    // Retry Configuration
    RETRY: {
        maxRetries: 3,
        baseDelay: 1000,          // 1 second base delay
        maxDelay: 30000,          // 30 seconds max delay
        backoffMultiplier: 2      // Exponential backoff multiplier
    },
    
    // Health Check Configuration
    HEALTH_CHECK: {
        interval: 30000,          // Check endpoint health every 30 seconds
        timeout: 5000,            // 5 second timeout for health checks
        failureThreshold: 3       // Mark unhealthy after 3 failed checks
    },
    
    // Load Balancing Configuration
    LOAD_BALANCING: {
        strategy: 'round-robin',  // 'round-robin', 'least-loaded', 'health-based'
        weightPrimary: 0.7,       // 70% of requests to primary
        weightBackup: 0.3         // 30% of requests to backup endpoints
    },
    
    // Monitoring Configuration
    MONITORING: {
        enableMetrics: true,
        logLevel: 'info',         // 'debug', 'info', 'warn', 'error'
        enableRequestLogging: true,
        enableResponseLogging: false
    }
};

// Validate configuration
function validateConfig() {
    const errors = [];
    
    if (!HELIUS_CONFIG.PRIMARY_RPC_URL) {
        errors.push('HELIUS_RPC_URL environment variable is required');
    }
    
    if (!HELIUS_CONFIG.API_KEY) {
        console.warn('[HELIUS] Warning: HELIUS_API_KEY not set. Enhanced features will be limited.');
    }
    
    if (errors.length > 0) {
        throw new Error(`Helius configuration errors: ${errors.join(', ')}`);
    }
    
    return true;
}

// Get all available RPC endpoints
function getAvailableEndpoints() {
    const endpoints = [];
    
    // Add primary endpoint
    if (HELIUS_CONFIG.PRIMARY_RPC_URL) {
        endpoints.push({
            url: HELIUS_CONFIG.PRIMARY_RPC_URL,
            name: 'Helius Primary',
            type: 'primary',
            weight: HELIUS_CONFIG.LOAD_BALANCING.weightPrimary,
            rateLimit: HELIUS_CONFIG.RATE_LIMITS.PRIMARY,
            failures: 0,
            lastFailure: null,
            lastSuccess: null,
            isHealthy: true,
            requestCount: 0,
            errorCount: 0
        });
    }
    
    // Add backup endpoints
    HELIUS_CONFIG.BACKUP_RPC_URLS.forEach((url, index) => {
        endpoints.push({
            url: url,
            name: `Helius Backup ${index + 1}`,
            type: 'backup',
            weight: HELIUS_CONFIG.LOAD_BALANCING.weightBackup / HELIUS_CONFIG.BACKUP_RPC_URLS.length,
            rateLimit: HELIUS_CONFIG.RATE_LIMITS.BACKUP,
            failures: 0,
            lastFailure: null,
            lastSuccess: null,
            isHealthy: true,
            requestCount: 0,
            errorCount: 0
        });
    });
    
    return endpoints;
}

// Get rate limit for specific method
function getMethodRateLimit(method) {
    return HELIUS_CONFIG.RATE_LIMITS.METHODS[method] || HELIUS_CONFIG.RATE_LIMITS.PRIMARY;
}

// Export configuration
module.exports = {
    HELIUS_CONFIG,
    validateConfig,
    getAvailableEndpoints,
    getMethodRateLimit
}; 