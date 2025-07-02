const WebSocket = require('ws');
const EventEmitter = require('eventemitter3');
const axios = require('axios');
const redisCache = require('./redisCacheService');
const databaseCache = require('./databaseCacheService');
const optimizedCalc = require('./optimizedCalculationService');
const changeDetection = require('./changeDetectionService');
const prisma = require('../utils/prismaClient');

class BlockchainEventMonitor extends EventEmitter {
    constructor() {
        super();
        
        this.connections = new Map();
        this.isMonitoring = false;
        this.eventHandlers = new Map();
        this.lastEventTime = new Map();
        this.eventStats = {
            total_events: 0,
            events_by_type: new Map(),
            cache_invalidations: 0,
            processing_errors: 0
        };
        
        // Solana WebSocket endpoints
        this.endpoints = {
            primary: process.env.SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com',
            helius: process.env.HELIUS_WS_URL || null,
            quicknode: process.env.QUICKNODE_WS_URL || null
        };
        
        // Token mint we're monitoring
        this.targetMint = '2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump';
        
        // Rate limiting for event processing
        this.rateLimiter = {
            maxEventsPerSecond: 50,
            eventQueue: [],
            processing: false
        };
        
        this.setupEventHandlers();
    }
    
    /**
     * Start monitoring blockchain events
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            console.log('[BLOCKCHAIN] Already monitoring events');
            return;
        }
        
        console.log('[BLOCKCHAIN] Starting blockchain event monitoring...');
        this.isMonitoring = true;
        
        try {
            // Connect to primary WebSocket
            await this.connectToPrimary();
            
            // Connect to backup endpoints if available
            await this.connectToBackups();
            
            // Start event processing queue
            this.startEventProcessing();
            
            console.log('[BLOCKCHAIN] Event monitoring started successfully');
            
            // Log monitoring start
            await changeDetection.logApiCall(
                'blockchain_monitoring',
                'start_monitoring',
                true,
                null,
                null,
                `endpoints_${this.connections.size}`
            );
            
        } catch (error) {
            console.error(`[BLOCKCHAIN] Failed to start monitoring: ${error.message}`);
            this.isMonitoring = false;
            throw error;
        }
    }
    
    /**
     * Connect to primary Solana WebSocket
     */
    async connectToPrimary() {
        const endpoint = this.endpoints.primary;
        console.log(`[BLOCKCHAIN] Connecting to primary endpoint: ${endpoint}`);
        
        const ws = new WebSocket(endpoint);
        
        ws.on('open', () => {
            console.log('[BLOCKCHAIN] Primary WebSocket connected');
            this.subscribeToTokenEvents(ws, 'primary');
        });
        
        ws.on('message', (data) => {
            this.handleWebSocketMessage(data, 'primary');
        });
        
        ws.on('error', (error) => {
            console.error(`[BLOCKCHAIN] Primary WebSocket error: ${error.message}`);
            this.handleConnectionError('primary', error);
        });
        
        ws.on('close', () => {
            console.log('[BLOCKCHAIN] Primary WebSocket disconnected');
            this.handleConnectionClose('primary');
        });
        
        this.connections.set('primary', ws);
    }
    
    /**
     * Connect to backup WebSocket endpoints
     */
    async connectToBackups() {
        for (const [name, endpoint] of Object.entries(this.endpoints)) {
            if (name === 'primary' || !endpoint) continue;
            
            try {
                console.log(`[BLOCKCHAIN] Connecting to backup endpoint: ${name}`);
                
                const ws = new WebSocket(endpoint);
                
                ws.on('open', () => {
                    console.log(`[BLOCKCHAIN] Backup WebSocket ${name} connected`);
                    this.subscribeToTokenEvents(ws, name);
                });
                
                ws.on('message', (data) => {
                    this.handleWebSocketMessage(data, name);
                });
                
                ws.on('error', (error) => {
                    console.warn(`[BLOCKCHAIN] Backup WebSocket ${name} error: ${error.message}`);
                });
                
                this.connections.set(name, ws);
                
            } catch (error) {
                console.warn(`[BLOCKCHAIN] Failed to connect to backup ${name}: ${error.message}`);
            }
        }
    }
    
    /**
     * Subscribe to token-specific events
     */
    subscribeToTokenEvents(ws, connectionName) {
        try {
            // Subscribe to account changes for the token mint
            const accountSubscription = {
                jsonrpc: '2.0',
                id: 1,
                method: 'accountSubscribe',
                params: [
                    this.targetMint,
                    {
                        encoding: 'jsonParsed',
                        commitment: 'confirmed'
                    }
                ]
            };
            
            ws.send(JSON.stringify(accountSubscription));
            
            // Subscribe to program changes for SPL Token program
            const programSubscription = {
                jsonrpc: '2.0',
                id: 2,
                method: 'programSubscribe',
                params: [
                    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token Program
                    {
                        encoding: 'jsonParsed',
                        commitment: 'confirmed',
                        filters: [
                            {
                                memcmp: {
                                    offset: 0,
                                    bytes: this.targetMint
                                }
                            }
                        ]
                    }
                ]
            };
            
            ws.send(JSON.stringify(programSubscription));
            
            console.log(`[BLOCKCHAIN] Subscribed to token events on ${connectionName}`);
            
        } catch (error) {
            console.error(`[BLOCKCHAIN] Subscription error on ${connectionName}: ${error.message}`);
        }
    }
    
    /**
     * Handle incoming WebSocket messages
     */
    handleWebSocketMessage(data, connectionName) {
        try {
            const message = JSON.parse(data.toString());
            
            if (message.method === 'accountNotification') {
                this.queueEvent({
                    type: 'account_change',
                    data: message.params,
                    source: connectionName,
                    timestamp: Date.now()
                });
            } else if (message.method === 'programNotification') {
                this.queueEvent({
                    type: 'program_change',
                    data: message.params,
                    source: connectionName,
                    timestamp: Date.now()
                });
            } else if (message.result) {
                console.log(`[BLOCKCHAIN] Subscription confirmed on ${connectionName}: ${message.result}`);
            }
            
        } catch (error) {
            console.error(`[BLOCKCHAIN] Message parsing error: ${error.message}`);
        }
    }
    
    /**
     * Queue events for rate-limited processing
     */
    queueEvent(event) {
        this.rateLimiter.eventQueue.push(event);
        
        // Limit queue size to prevent memory issues
        if (this.rateLimiter.eventQueue.length > 1000) {
            this.rateLimiter.eventQueue.shift(); // Remove oldest event
        }
        
        this.eventStats.total_events++;
        
        const eventType = event.type;
        this.eventStats.events_by_type.set(
            eventType,
            (this.eventStats.events_by_type.get(eventType) || 0) + 1
        );
    }
    
    /**
     * Start processing queued events
     */
    startEventProcessing() {
        if (this.rateLimiter.processing) return;
        
        this.rateLimiter.processing = true;
        
        const processEvents = async () => {
            while (this.isMonitoring) {
                const batchSize = Math.min(
                    this.rateLimiter.maxEventsPerSecond,
                    this.rateLimiter.eventQueue.length
                );
                
                if (batchSize > 0) {
                    const batch = this.rateLimiter.eventQueue.splice(0, batchSize);
                    
                    // Process batch in parallel
                    await Promise.all(
                        batch.map(event => this.processEvent(event).catch(err => {
                            console.error(`[BLOCKCHAIN] Event processing error: ${err.message}`);
                            this.eventStats.processing_errors++;
                        }))
                    );
                }
                
                // Wait 1 second between batches
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            this.rateLimiter.processing = false;
        };
        
        processEvents();
    }
    
    /**
     * Process individual blockchain events
     */
    async processEvent(event) {
        try {
            console.log(`[BLOCKCHAIN] Processing ${event.type} event from ${event.source}`);
            
            switch (event.type) {
                case 'account_change':
                    await this.handleAccountChange(event);
                    break;
                    
                case 'program_change':
                    await this.handleProgramChange(event);
                    break;
                    
                default:
                    console.log(`[BLOCKCHAIN] Unknown event type: ${event.type}`);
            }
            
            // Update last event time
            this.lastEventTime.set(event.type, event.timestamp);
            
            // Emit event for other services to consume
            this.emit('blockchain_event', event);
            
        } catch (error) {
            console.error(`[BLOCKCHAIN] Error processing event: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Handle token account changes
     */
    async handleAccountChange(event) {
        try {
            const accountData = event.data?.result?.value;
            if (!accountData) return;
            
            console.log('[BLOCKCHAIN] Token mint account changed, invalidating holder caches');
            
            // Invalidate holder-related caches
            await Promise.all([
                redisCache.clear('token_holders_*'),
                databaseCache.clear('token_holders_*'),
                redisCache.clear('wallet_balance_*'),
                databaseCache.clear('wallet_balance_*')
            ]);
            
            this.eventStats.cache_invalidations++;
            
            // Trigger holder list refresh after short delay
            setTimeout(async () => {
                try {
                    const { refreshHolderData } = require('./solanaService');
                    await refreshHolderData();
                    console.log('[BLOCKCHAIN] Triggered holder data refresh due to account change');
                } catch (error) {
                    console.error(`[BLOCKCHAIN] Error refreshing holder data: ${error.message}`);
                }
            }, 5000); // 5 second delay
            
        } catch (error) {
            console.error(`[BLOCKCHAIN] Error handling account change: ${error.message}`);
        }
    }
    
    /**
     * Handle SPL token program changes
     */
    async handleProgramChange(event) {
        try {
            const programData = event.data?.result;
            if (!programData) return;
            
            // Extract account information from program change
            const accountInfo = programData.value?.account;
            if (!accountInfo) return;
            
            // Check if this is a token account for our mint
            const parsedData = accountInfo.data?.parsed;
            if (parsedData?.info?.mint === this.targetMint) {
                const owner = parsedData.info.owner;
                const balance = parsedData.info.tokenAmount?.uiAmount || 0;
                
                console.log(`[BLOCKCHAIN] Token transfer detected for wallet: ${owner}`);
                
                // Invalidate specific wallet caches
                await Promise.all([
                    redisCache.delete(`wallet_balance_${owner}`),
                    databaseCache.delete(`wallet_balance_${owner}`),
                    databaseCache.delete(`cost_basis_${owner}`)
                ]);
                
                // Queue wallet for cost basis recalculation
                if (balance > 0) {
                    await optimizedCalc.queueWalletsForRecalculation([owner]);
                    console.log(`[BLOCKCHAIN] Queued wallet ${owner} for cost basis recalculation`);
                }
                
                this.eventStats.cache_invalidations++;
            }
            
        } catch (error) {
            console.error(`[BLOCKCHAIN] Error handling program change: ${error.message}`);
        }
    }
    
    /**
     * Handle connection errors with reconnection logic
     */
    handleConnectionError(connectionName, error) {
        console.warn(`[BLOCKCHAIN] Connection ${connectionName} error: ${error.message}`);
        
        // Implement exponential backoff reconnection
        setTimeout(() => {
            this.reconnectConnection(connectionName);
        }, 5000); // Start with 5 second delay
    }
    
    /**
     * Handle connection close events
     */
    handleConnectionClose(connectionName) {
        console.log(`[BLOCKCHAIN] Connection ${connectionName} closed`);
        
        this.connections.delete(connectionName);
        
        // Attempt to reconnect after delay
        setTimeout(() => {
            this.reconnectConnection(connectionName);
        }, 10000); // 10 second delay for close events
    }
    
    /**
     * Reconnect to a specific endpoint
     */
    async reconnectConnection(connectionName) {
        if (!this.isMonitoring) return;
        
        console.log(`[BLOCKCHAIN] Attempting to reconnect ${connectionName}...`);
        
        try {
            if (connectionName === 'primary') {
                await this.connectToPrimary();
            } else {
                // Reconnect backup connection
                const endpoint = this.endpoints[connectionName];
                if (endpoint) {
                    // Implementation similar to connectToBackups but for single endpoint
                    console.log(`[BLOCKCHAIN] Reconnecting to ${connectionName}...`);
                    // Add reconnection logic here
                }
            }
        } catch (error) {
            console.error(`[BLOCKCHAIN] Reconnection failed for ${connectionName}: ${error.message}`);
        }
    }
    
    /**
     * Stop monitoring blockchain events
     */
    async stopMonitoring() {
        if (!this.isMonitoring) {
            console.log('[BLOCKCHAIN] Not currently monitoring');
            return;
        }
        
        console.log('[BLOCKCHAIN] Stopping blockchain event monitoring...');
        this.isMonitoring = false;
        
        // Close all WebSocket connections
        for (const [name, ws] of this.connections) {
            try {
                ws.close();
                console.log(`[BLOCKCHAIN] Closed connection: ${name}`);
            } catch (error) {
                console.warn(`[BLOCKCHAIN] Error closing connection ${name}: ${error.message}`);
            }
        }
        
        this.connections.clear();
        
        // Log monitoring stop
        await changeDetection.logApiCall(
            'blockchain_monitoring',
            'stop_monitoring',
            true,
            null,
            null,
            `processed_${this.eventStats.total_events}_events`
        );
        
        console.log('[BLOCKCHAIN] Event monitoring stopped');
    }
    
    /**
     * Get monitoring statistics
     */
    getMonitoringStats() {
        return {
            status: {
                is_monitoring: this.isMonitoring,
                active_connections: this.connections.size,
                queue_size: this.rateLimiter.eventQueue.length
            },
            events: {
                total_processed: this.eventStats.total_events,
                by_type: Object.fromEntries(this.eventStats.events_by_type),
                cache_invalidations: this.eventStats.cache_invalidations,
                processing_errors: this.eventStats.processing_errors
            },
            connections: Array.from(this.connections.keys()),
            last_events: Object.fromEntries(this.lastEventTime),
            rate_limiting: {
                max_events_per_second: this.rateLimiter.maxEventsPerSecond,
                current_queue_size: this.rateLimiter.eventQueue.length,
                is_processing: this.rateLimiter.processing
            }
        };
    }
    
    /**
     * Setup event handlers for integration with other services
     */
    setupEventHandlers() {
        // Handle events from ML prediction service
        this.on('cache_prediction', async (prediction) => {
            if (prediction.hit_probability > 0.8) {
                console.log(`[BLOCKCHAIN] High-confidence cache prediction, preloading ${prediction.cache_key}`);
                // Trigger preloading based on ML prediction
            }
        });
        
        // Handle events from predictive cache service
        this.on('predictive_warming', async (recommendation) => {
            console.log(`[BLOCKCHAIN] Executing predictive warming recommendation: ${recommendation.action}`);
            // Execute warming recommendation
        });
    }
    
    /**
     * Health check for monitoring service
     */
    async healthCheck() {
        const stats = this.getMonitoringStats();
        
        const health = {
            status: this.isMonitoring ? 'healthy' : 'stopped',
            connections: stats.status.active_connections,
            recent_events: stats.events.total_processed > 0,
            errors: stats.events.processing_errors,
            last_activity: Math.max(...Object.values(this.lastEventTime)) || 0
        };
        
        // Determine overall health
        if (!this.isMonitoring) {
            health.status = 'stopped';
        } else if (stats.status.active_connections === 0) {
            health.status = 'unhealthy';
        } else if (stats.events.processing_errors > 10) {
            health.status = 'degraded';
        }
        
        return health;
    }
}

// Export singleton instance
module.exports = new BlockchainEventMonitor();