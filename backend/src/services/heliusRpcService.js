require('dotenv').config();
const axios = require('axios');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const NodeCache = require('node-cache');
const { 
    HELIUS_CONFIG, 
    validateConfig, 
    getAvailableEndpoints, 
    getMethodRateLimit 
} = require('../config/heliusConfig');

class HeliusRpcService {
    constructor() {
        // Validate configuration on initialization
        validateConfig();
        
        // Initialize endpoints
        this.endpoints = getAvailableEndpoints();
        this.currentEndpointIndex = 0;
        
        // Initialize rate limiters for each endpoint
        this.rateLimiters = new Map();
        this.endpoints.forEach(endpoint => {
            this.rateLimiters.set(endpoint.url, new RateLimiterMemory({
                points: endpoint.rateLimit.requestsPerSecond,
                duration: 1, // 1 second
                blockDuration: 60 // Block for 1 minute if limit exceeded
            }));
        });
        
        // Method-specific rate limiters
        this.methodRateLimiters = new Map();
        Object.keys(HELIUS_CONFIG.RATE_LIMITS.METHODS).forEach(method => {
            const limit = getMethodRateLimit(method);
            this.methodRateLimiters.set(method, new RateLimiterMemory({
                points: limit.requestsPerSecond,
                duration: 1,
                blockDuration: 60
            }));
        });
        
        // Response cache for frequently requested data
        this.responseCache = new NodeCache({
            stdTTL: 300, // 5 minutes default TTL
            checkperiod: 60, // Check for expired keys every minute
            useClones: false
        });
        
        // Health check cache
        this.healthCache = new NodeCache({
            stdTTL: 30, // 30 seconds TTL for health checks
            checkperiod: 10
        });
        
        // Start health monitoring
        this.startHealthMonitoring();
        
        console.log(`[HELIUS] Service initialized with ${this.endpoints.length} endpoints`);
    }
    
    /**
     * Get next available endpoint based on load balancing strategy
     */
    async getNextEndpoint(method = null) {
        const now = Date.now();
        const availableEndpoints = this.endpoints.filter(endpoint => {
            // Check circuit breaker
            if (endpoint.failures >= HELIUS_CONFIG.CIRCUIT_BREAKER.maxFailures) {
                if (endpoint.lastFailure && (now - endpoint.lastFailure) > HELIUS_CONFIG.CIRCUIT_BREAKER.resetTimeout) {
                    // Reset circuit breaker
                    endpoint.failures = 0;
                    endpoint.lastFailure = null;
                    endpoint.isHealthy = true;
                    console.log(`[HELIUS] Circuit breaker reset for ${endpoint.name}`);
                } else {
                    return false; // Still in circuit breaker state
                }
            }
            
            // Check health status
            return endpoint.isHealthy;
        });
        
        if (availableEndpoints.length === 0) {
            throw new Error('No healthy endpoints available');
        }
        
        // Apply load balancing strategy
        switch (HELIUS_CONFIG.LOAD_BALANCING.strategy) {
            case 'round-robin':
                const endpoint = availableEndpoints[this.currentEndpointIndex % availableEndpoints.length];
                this.currentEndpointIndex = (this.currentEndpointIndex + 1) % availableEndpoints.length;
                return endpoint;
                
            case 'least-loaded':
                return availableEndpoints.reduce((least, current) => 
                    current.requestCount < least.requestCount ? current : least
                );
                
            case 'health-based':
                // Prefer primary endpoints, fallback to backups
                const primary = availableEndpoints.find(e => e.type === 'primary');
                return primary || availableEndpoints[0];
                
            default:
                return availableEndpoints[0];
        }
    }
    
    /**
     * Check rate limits before making request
     */
    async checkRateLimits(endpoint, method = null) {
        try {
            // Check endpoint rate limit
            await this.rateLimiters.get(endpoint.url).consume('global');
            
            // Check method-specific rate limit if applicable
            if (method && this.methodRateLimiters.has(method)) {
                await this.methodRateLimiters.get(method).consume(endpoint.url);
            }
            
            return true;
        } catch (error) {
            console.warn(`[HELIUS] Rate limit exceeded for ${endpoint.name}${method ? ` (${method})` : ''}`);
            return false;
        }
    }
    
    /**
     * Make RPC call with full error handling and retry logic
     */
    async makeRpcCall(payload, options = {}) {
        const {
            method = null,
            maxRetries = HELIUS_CONFIG.RETRY.maxRetries,
            useCache = true,
            cacheKey = null,
            cacheTTL = 300
        } = options;
        
        // Check cache first if enabled
        if (useCache && cacheKey) {
            const cached = this.responseCache.get(cacheKey);
            if (cached) {
                console.log(`[HELIUS] Cache hit for ${cacheKey}`);
                return cached;
            }
        }
        
        let lastError = null;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const endpoint = await this.getNextEndpoint(method);
                
                // Check rate limits
                const rateLimitOk = await this.checkRateLimits(endpoint, method);
                if (!rateLimitOk) {
                    // Try next endpoint
                    continue;
                }
                
                console.log(`[HELIUS] Making RPC call to ${endpoint.name} (attempt ${attempt + 1}/${maxRetries})`);
                
                // Update endpoint metrics
                endpoint.requestCount++;
                endpoint.lastSuccess = Date.now();
                
                // Make the request
                const response = await axios.post(endpoint.url, payload, {
                    timeout: HELIUS_CONFIG.HEALTH_CHECK.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        ...(HELIUS_CONFIG.API_KEY && { 'Authorization': `Bearer ${HELIUS_CONFIG.API_KEY}` })
                    }
                });
                
                // Log rate limit headers
                this.logRateLimitHeaders(endpoint, response.headers);
                
                // Check for RPC errors
                if (response.data.error) {
                    throw new Error(`RPC Error: ${JSON.stringify(response.data.error)}`);
                }
                
                // Reset failure count on success
                if (endpoint.failures > 0) {
                    endpoint.failures = 0;
                    endpoint.lastFailure = null;
                    console.log(`[HELIUS] Endpoint ${endpoint.name} recovered`);
                }
                
                const result = response.data.result;
                
                // Cache successful response
                if (useCache && cacheKey) {
                    this.responseCache.set(cacheKey, result, cacheTTL);
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                attempt++;
                
                // Record endpoint failure
                if (error.config?.url) {
                    const failedEndpoint = this.endpoints.find(e => e.url === error.config.url);
                    if (failedEndpoint) {
                        failedEndpoint.failures++;
                        failedEndpoint.lastFailure = Date.now();
                        failedEndpoint.errorCount++;
                        
                        console.warn(`[HELIUS] Endpoint ${failedEndpoint.name} failed (${failedEndpoint.failures}/${HELIUS_CONFIG.CIRCUIT_BREAKER.maxFailures}): ${error.message}`);
                        
                        if (failedEndpoint.failures >= HELIUS_CONFIG.CIRCUIT_BREAKER.maxFailures) {
                            failedEndpoint.isHealthy = false;
                            console.error(`[HELIUS] Circuit breaker triggered for ${failedEndpoint.name}`);
                        }
                    }
                }
                
                // Handle rate limiting (429 errors)
                if (error.response?.status === 429) {
                    console.warn(`[HELIUS] Rate limit hit (429), trying next endpoint...`);
                    continue;
                }
                
                // Handle other errors
                if (attempt === maxRetries) {
                    throw new Error(`All endpoints failed after ${maxRetries} attempts. Last error: ${lastError.message}`);
                }
                
                // Exponential backoff
                const delay = Math.min(
                    HELIUS_CONFIG.RETRY.baseDelay * Math.pow(HELIUS_CONFIG.RETRY.backoffMultiplier, attempt),
                    HELIUS_CONFIG.RETRY.maxDelay
                );
                
                console.log(`[HELIUS] Request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: ${error.message}`);
                await this.sleep(delay);
            }
        }
        
        throw lastError || new Error('Max retries exceeded');
    }
    
    /**
     * Enhanced token accounts fetching with Helius DAS
     */
    async getTokenAccounts(mintAddress, options = {}) {
        const {
            limit = 1000,
            cursor = null,
            useCache = true
        } = options;
        
        const cacheKey = `token_accounts_${mintAddress}_${limit}_${cursor || 'null'}`;
        
        const payload = {
            jsonrpc: '2.0',
            id: '1',
            method: 'getTokenAccounts',
            params: {
                mint: mintAddress,
                limit,
                ...(cursor ? { cursor } : {})
            }
        };
        
        return this.makeRpcCall(payload, {
            method: 'getTokenAccounts',
            useCache,
            cacheKey,
            cacheTTL: 60 // 1 minute cache for token accounts
        });
    }
    
    /**
     * Enhanced signatures fetching with rate limiting
     */
    async getSignaturesForAddress(address, options = {}) {
        const {
            before = null,
            limit = 1000,
            useCache = true
        } = options;
        
        const cacheKey = `signatures_${address}_${before || 'null'}_${limit}`;
        
        const payload = {
            jsonrpc: '2.0',
            id: '1',
            method: 'getSignaturesForAddress',
            params: [
                address,
                {
                    limit,
                    ...(before ? { before } : {})
                }
            ]
        };
        
        return this.makeRpcCall(payload, {
            method: 'getSignaturesForAddress',
            useCache,
            cacheKey,
            cacheTTL: 30 // 30 seconds cache for signatures
        });
    }
    
    /**
     * Enhanced transaction fetching with batching
     */
    async getTransaction(signature, options = {}) {
        const { useCache = true } = options;
        const cacheKey = `transaction_${signature}`;
        
        const payload = {
            jsonrpc: '2.0',
            id: '1',
            method: 'getTransaction',
            params: [
                signature,
                {
                    encoding: 'json',
                    maxSupportedTransactionVersion: 0
                }
            ]
        };
        
        return this.makeRpcCall(payload, {
            method: 'getTransaction',
            useCache,
            cacheKey,
            cacheTTL: 300 // 5 minutes cache for transactions
        });
    }
    
    /**
     * Batch transaction fetching for efficiency
     */
    async getTransactionsBatch(signatures, options = {}) {
        const { batchSize = 10, useCache = true } = options;
        const results = [];
        
        // Process in batches to respect rate limits
        for (let i = 0; i < signatures.length; i += batchSize) {
            const batch = signatures.slice(i, i + batchSize);
            const batchPromises = batch.map(sig => this.getTransaction(sig, { useCache }));
            
            try {
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
                
                // Add delay between batches
                if (i + batchSize < signatures.length) {
                    await this.sleep(1000); // 1 second delay between batches
                }
            } catch (error) {
                console.error(`[HELIUS] Batch ${Math.floor(i / batchSize) + 1} failed:`, error.message);
                // Continue with next batch
            }
        }
        
        return results;
    }
    
    /**
     * Health check for endpoints
     */
    async checkEndpointHealth(endpoint) {
        const cacheKey = `health_${endpoint.url}`;
        const cached = this.healthCache.get(cacheKey);
        
        if (cached) {
            return cached;
        }
        
        try {
            const payload = {
                jsonrpc: '2.0',
                id: '1',
                method: 'getHealth'
            };
            
            const response = await axios.post(endpoint.url, payload, {
                timeout: HELIUS_CONFIG.HEALTH_CHECK.timeout
            });
            
            const isHealthy = response.data.result === 'ok';
            this.healthCache.set(cacheKey, isHealthy, 30); // 30 seconds cache
            
            return isHealthy;
        } catch (error) {
            this.healthCache.set(cacheKey, false, 30);
            return false;
        }
    }
    
    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        setInterval(async () => {
            for (const endpoint of this.endpoints) {
                const isHealthy = await this.checkEndpointHealth(endpoint);
                endpoint.isHealthy = isHealthy;
                
                if (!isHealthy && endpoint.failures < HELIUS_CONFIG.CIRCUIT_BREAKER.maxFailures) {
                    endpoint.failures++;
                    console.warn(`[HELIUS] Health check failed for ${endpoint.name}`);
                }
            }
        }, HELIUS_CONFIG.HEALTH_CHECK.interval);
    }
    
    /**
     * Log rate limit headers
     */
    logRateLimitHeaders(endpoint, headers) {
        if (HELIUS_CONFIG.MONITORING.enableRequestLogging) {
            const rateLimitInfo = [];
            
            if (headers['x-ratelimit-rps-remaining']) {
                rateLimitInfo.push(`RPS: ${headers['x-ratelimit-rps-remaining']}/${headers['x-ratelimit-rps-limit'] || 'unknown'}`);
            }
            if (headers['x-ratelimit-method-remaining']) {
                rateLimitInfo.push(`Method: ${headers['x-ratelimit-method-remaining']}/${headers['x-ratelimit-method-limit'] || 'unknown'}`);
            }
            
            if (rateLimitInfo.length > 0) {
                console.log(`[HELIUS] ${endpoint.name} - ${rateLimitInfo.join(', ')}`);
            }
        }
    }
    
    /**
     * Get service statistics
     */
    getStats() {
        return {
            endpoints: this.endpoints.map(endpoint => ({
                name: endpoint.name,
                type: endpoint.type,
                isHealthy: endpoint.isHealthy,
                requestCount: endpoint.requestCount,
                errorCount: endpoint.errorCount,
                failures: endpoint.failures,
                lastFailure: endpoint.lastFailure,
                lastSuccess: endpoint.lastSuccess
            })),
            cache: {
                responseCacheSize: this.responseCache.keys().length,
                healthCacheSize: this.healthCache.keys().length
            },
            rateLimiters: {
                endpointCount: this.rateLimiters.size,
                methodCount: this.methodRateLimiters.size
            }
        };
    }
    
    /**
     * Clear caches
     */
    clearCaches() {
        this.responseCache.flushAll();
        this.healthCache.flushAll();
        console.log('[HELIUS] All caches cleared');
    }
    
    /**
     * Utility function for delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance
module.exports = new HeliusRpcService(); 