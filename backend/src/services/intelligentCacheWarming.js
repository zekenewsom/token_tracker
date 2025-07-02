const cron = require('node-cron');
const redisCache = require('./redisCacheService');
const databaseCache = require('./databaseCacheService');
const mlPrediction = require('./mlCachePredictionService');
const blockchainMonitor = require('./blockchainEventMonitor');
const changeDetection = require('./changeDetectionService');
const prisma = require('../utils/prismaClient');

class IntelligentCacheWarming {
    constructor() {
        this.isRunning = false;
        this.warmingStrategies = new Map();
        this.transactionPatterns = new Map();
        this.warmingQueue = [];
        this.warmingStats = {
            items_warmed: 0,
            prediction_accuracy: 0,
            cache_hits_improved: 0,
            warming_failures: 0
        };
        
        // Pattern recognition parameters
        this.patternThresholds = {
            MIN_TRANSACTION_VOLUME: 10,   // Minimum transactions to establish pattern
            PATTERN_CONFIDENCE: 0.7,      // Minimum confidence for pattern-based warming
            RECENCY_WEIGHT: 0.6,         // Weight for recent vs historical patterns
            FREQUENCY_WEIGHT: 0.4        // Weight for frequency vs recency
        };
        
        // Warming strategies
        this.strategies = {
            TRANSACTION_PATTERN: 'transaction_pattern',
            HOLDER_ACTIVITY: 'holder_activity', 
            TIME_BASED: 'time_based',
            ML_PREDICTION: 'ml_prediction',
            BLOCKCHAIN_EVENT: 'blockchain_event'
        };
        
        this.initializeWarming();
    }
    
    /**
     * Initialize intelligent cache warming system
     */
    async initializeWarming() {
        console.log('[INTELLIGENT-WARMING] Initializing intelligent cache warming...');
        
        try {
            // Setup warming schedules
            this.setupWarmingSchedules();
            
            // Setup blockchain event handlers
            this.setupBlockchainEventHandlers();
            
            // Initialize pattern recognition
            await this.initializePatternRecognition();
            
            this.isRunning = true;
            console.log('[INTELLIGENT-WARMING] Intelligent cache warming initialized');
            
        } catch (error) {
            console.error(`[INTELLIGENT-WARMING] Initialization error: ${error.message}`);
        }
    }
    
    /**
     * Setup automated warming schedules
     */
    setupWarmingSchedules() {
        // Every 2 minutes - Process warming queue
        cron.schedule('*/2 * * * *', async () => {
            await this.processWarmingQueue();
        });
        
        // Every 10 minutes - Transaction pattern analysis
        cron.schedule('*/10 * * * *', async () => {
            await this.analyzeTransactionPatterns();
        });
        
        // Every 30 minutes - Holder activity analysis  
        cron.schedule('*/30 * * * *', async () => {
            await this.analyzeHolderActivity();
        });
        
        // Every hour - Pattern-based predictive warming
        cron.schedule('0 * * * *', async () => {
            await this.performPatternBasedWarming();
        });
        
        console.log('[INTELLIGENT-WARMING] Warming schedules setup completed');
    }
    
    /**
     * Setup blockchain event handlers for real-time warming
     */
    setupBlockchainEventHandlers() {
        blockchainMonitor.on('blockchain_event', async (event) => {
            await this.handleBlockchainEvent(event);
        });
        
        console.log('[INTELLIGENT-WARMING] Blockchain event handlers setup');
    }
    
    /**
     * Initialize pattern recognition from historical data
     */
    async initializePatternRecognition() {
        try {
            console.log('[INTELLIGENT-WARMING] Initializing pattern recognition...');
            
            // Analyze last 7 days of transaction patterns
            const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
            
            const recentTransactions = await prisma.transaction.findMany({
                where: {
                    blockTime: { gte: Math.floor(sevenDaysAgo.getTime() / 1000) }
                },
                include: {
                    sourceWallet: { select: { address: true } },
                    destinationWallet: { select: { address: true } }
                },
                orderBy: { blockTime: 'desc' },
                take: 10000 // Limit for performance
            });
            
            // Extract patterns
            await this.extractTransactionPatterns(recentTransactions);
            
            console.log(`[INTELLIGENT-WARMING] Pattern recognition initialized with ${recentTransactions.length} transactions`);
            
        } catch (error) {
            console.error(`[INTELLIGENT-WARMING] Pattern recognition error: ${error.message}`);
        }
    }
    
    /**
     * Extract transaction patterns for predictive warming
     */
    async extractTransactionPatterns(transactions) {
        const patterns = new Map();
        const timePatterns = new Map();
        const walletPatterns = new Map();
        
        transactions.forEach(tx => {
            const hour = new Date(tx.blockTime * 1000).getHours();
            const sourceAddr = tx.sourceWallet?.address;
            const destAddr = tx.destinationWallet?.address;
            
            // Time-based patterns
            if (!timePatterns.has(hour)) {
                timePatterns.set(hour, { count: 0, wallets: new Set() });
            }
            timePatterns.get(hour).count++;
            if (sourceAddr) timePatterns.get(hour).wallets.add(sourceAddr);
            if (destAddr) timePatterns.get(hour).wallets.add(destAddr);
            
            // Wallet activity patterns
            [sourceAddr, destAddr].filter(Boolean).forEach(addr => {
                if (!walletPatterns.has(addr)) {
                    walletPatterns.set(addr, { 
                        transactions: [], 
                        activity_hours: new Set(),
                        total_volume: 0
                    });
                }
                const pattern = walletPatterns.get(addr);
                pattern.transactions.push(tx);
                pattern.activity_hours.add(hour);
                pattern.total_volume += tx.tokenAmount || 0;
            });
        });
        
        // Store patterns for future use
        this.transactionPatterns.set('time_based', timePatterns);
        this.transactionPatterns.set('wallet_based', walletPatterns);
        
        console.log(`[INTELLIGENT-WARMING] Extracted patterns: ${timePatterns.size} hourly patterns, ${walletPatterns.size} wallet patterns`);
    }
    
    /**
     * Analyze current transaction patterns
     */
    async analyzeTransactionPatterns() {
        try {
            console.log('[INTELLIGENT-WARMING] Analyzing transaction patterns...');
            
            // Get recent transactions (last 2 hours)
            const twoHoursAgo = Math.floor(Date.now() / 1000) - (2 * 60 * 60);
            
            const recentTx = await prisma.transaction.findMany({
                where: { blockTime: { gte: twoHoursAgo } },
                include: {
                    sourceWallet: { select: { address: true } },
                    destinationWallet: { select: { address: true } }
                }
            });
            
            if (recentTx.length < this.patternThresholds.MIN_TRANSACTION_VOLUME) {
                console.log('[INTELLIGENT-WARMING] Insufficient recent transaction volume for pattern analysis');
                return;
            }
            
            // Identify hot wallets from recent activity
            const walletActivity = new Map();
            recentTx.forEach(tx => {
                [tx.sourceWallet?.address, tx.destinationWallet?.address]
                    .filter(Boolean)
                    .forEach(addr => {
                        walletActivity.set(addr, (walletActivity.get(addr) || 0) + 1);
                    });
            });
            
            // Queue warming for active wallets
            const activeWallets = Array.from(walletActivity.entries())
                .filter(([addr, count]) => count >= 2) // At least 2 transactions
                .sort(([,a], [,b]) => b - a) // Sort by activity
                .slice(0, 20) // Top 20 active wallets
                .map(([addr]) => addr);
            
            for (const walletAddr of activeWallets) {
                await this.queueWalletWarming(walletAddr, this.strategies.TRANSACTION_PATTERN, 0.8);
            }
            
            console.log(`[INTELLIGENT-WARMING] Queued warming for ${activeWallets.length} active wallets`);
            
        } catch (error) {
            console.error(`[INTELLIGENT-WARMING] Transaction pattern analysis error: ${error.message}`);
        }
    }
    
    /**
     * Analyze holder activity patterns
     */
    async analyzeHolderActivity() {
        try {
            console.log('[INTELLIGENT-WARMING] Analyzing holder activity patterns...');
            
            // Get top holders who might be accessed soon
            const topHolders = await prisma.tokenHolder.findMany({
                orderBy: { balance: 'desc' },
                take: 100,
                include: { wallet: { select: { address: true } } }
            });
            
            // Check which holders have recent transaction activity
            const oneHourAgo = Math.floor(Date.now() / 1000) - (60 * 60);
            
            for (const holder of topHolders) {
                const recentActivity = await prisma.transaction.count({
                    where: {
                        OR: [
                            { sourceWallet: { address: holder.wallet.address } },
                            { destinationWallet: { address: holder.wallet.address } }
                        ],
                        blockTime: { gte: oneHourAgo }
                    }
                });
                
                if (recentActivity > 0) {
                    // High priority warming for active top holders
                    await this.queueHolderWarming(holder.wallet.address, this.strategies.HOLDER_ACTIVITY, 0.9);
                }
            }
            
            console.log('[INTELLIGENT-WARMING] Holder activity analysis completed');
            
        } catch (error) {
            console.error(`[INTELLIGENT-WARMING] Holder activity analysis error: ${error.message}`);
        }
    }
    
    /**
     * Perform pattern-based predictive warming
     */
    async performPatternBasedWarming() {
        try {
            console.log('[INTELLIGENT-WARMING] Performing pattern-based warming...');
            
            const currentHour = new Date().getHours();
            const timePatterns = this.transactionPatterns.get('time_based');
            
            if (timePatterns && timePatterns.has(currentHour)) {
                const hourPattern = timePatterns.get(currentHour);
                
                // Predict next hour's activity based on patterns
                const nextHour = (currentHour + 1) % 24;
                const nextHourPattern = timePatterns.get(nextHour);
                
                if (nextHourPattern && nextHourPattern.count > 5) {
                    console.log(`[INTELLIGENT-WARMING] Predicted activity for hour ${nextHour}, preloading relevant data`);
                    
                    // Warm general data that's likely to be accessed
                    await this.queueGeneralWarming('token_holders_100', this.strategies.TIME_BASED, 0.7);
                    await this.queueGeneralWarming('transactions_1_50', this.strategies.TIME_BASED, 0.6);
                    
                    // Warm specific wallets that were active during this hour historically
                    for (const walletAddr of Array.from(nextHourPattern.wallets).slice(0, 10)) {
                        await this.queueWalletWarming(walletAddr, this.strategies.TIME_BASED, 0.6);
                    }
                }
            }
            
            // Get ML-based recommendations
            const mlRecommendations = await mlPrediction.generateWarmingRecommendations();
            for (const rec of mlRecommendations.slice(0, 10)) {
                await this.queueGeneralWarming(rec.cache_key, this.strategies.ML_PREDICTION, rec.confidence);
            }
            
            console.log('[INTELLIGENT-WARMING] Pattern-based warming completed');
            
        } catch (error) {
            console.error(`[INTELLIGENT-WARMING] Pattern-based warming error: ${error.message}`);
        }
    }
    
    /**
     * Handle real-time blockchain events for immediate warming
     */
    async handleBlockchainEvent(event) {
        try {
            if (event.type === 'program_change') {
                // Extract wallet from program change
                const programData = event.data?.result;
                const accountInfo = programData?.value?.account;
                const parsedData = accountInfo?.data?.parsed;
                
                if (parsedData?.info?.owner) {
                    const walletAddr = parsedData.info.owner;
                    
                    // Immediate high-priority warming for active wallet
                    await this.queueWalletWarming(walletAddr, this.strategies.BLOCKCHAIN_EVENT, 1.0);
                    
                    console.log(`[INTELLIGENT-WARMING] Blockchain event triggered warming for wallet: ${walletAddr}`);
                }
            }
            
        } catch (error) {
            console.error(`[INTELLIGENT-WARMING] Blockchain event handling error: ${error.message}`);
        }
    }
    
    /**
     * Queue wallet-specific warming
     */
    async queueWalletWarming(walletAddress, strategy, confidence) {
        const warmingItem = {
            type: 'wallet',
            key: `wallet_balance_${walletAddress}`,
            wallet_address: walletAddress,
            strategy,
            confidence,
            priority: this.calculatePriority(confidence, strategy),
            queued_at: Date.now()
        };
        
        this.warmingQueue.push(warmingItem);
        
        // Sort queue by priority
        this.warmingQueue.sort((a, b) => b.priority - a.priority);
        
        // Limit queue size
        if (this.warmingQueue.length > 200) {
            this.warmingQueue = this.warmingQueue.slice(0, 200);
        }
    }
    
    /**
     * Queue holder-specific warming
     */
    async queueHolderWarming(walletAddress, strategy, confidence) {
        await this.queueWalletWarming(walletAddress, strategy, confidence);
        
        // Also queue related token holder data
        await this.queueGeneralWarming('token_holders_100', strategy, confidence * 0.8);
    }
    
    /**
     * Queue general data warming
     */
    async queueGeneralWarming(cacheKey, strategy, confidence) {
        const warmingItem = {
            type: 'general',
            key: cacheKey,
            strategy,
            confidence,
            priority: this.calculatePriority(confidence, strategy),
            queued_at: Date.now()
        };
        
        this.warmingQueue.push(warmingItem);
        
        // Sort and limit queue
        this.warmingQueue.sort((a, b) => b.priority - a.priority);
        if (this.warmingQueue.length > 200) {
            this.warmingQueue = this.warmingQueue.slice(0, 200);
        }
    }
    
    /**
     * Calculate priority score for warming items
     */
    calculatePriority(confidence, strategy) {
        let priority = confidence * 100; // Base score from confidence
        
        // Strategy-based adjustments
        switch (strategy) {
            case this.strategies.BLOCKCHAIN_EVENT:
                priority += 50; // Highest priority for real-time events
                break;
            case this.strategies.TRANSACTION_PATTERN:
                priority += 30; // High priority for transaction patterns
                break;
            case this.strategies.HOLDER_ACTIVITY:
                priority += 25; // High priority for holder activity
                break;
            case this.strategies.ML_PREDICTION:
                priority += 20; // Medium-high priority for ML predictions
                break;
            case this.strategies.TIME_BASED:
                priority += 10; // Medium priority for time patterns
                break;
        }
        
        return priority;
    }
    
    /**
     * Process the warming queue
     */
    async processWarmingQueue() {
        if (!this.isRunning || this.warmingQueue.length === 0) {
            return;
        }
        
        try {
            console.log(`[INTELLIGENT-WARMING] Processing warming queue: ${this.warmingQueue.length} items`);
            
            // Process top 10 items from queue
            const batchSize = Math.min(10, this.warmingQueue.length);
            const batch = this.warmingQueue.splice(0, batchSize);
            
            const warmingPromises = batch.map(item => this.warmCacheItem(item));
            const results = await Promise.allSettled(warmingPromises);
            
            // Count successes and failures
            let successful = 0;
            let failed = 0;
            
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    successful++;
                    this.warmingStats.items_warmed++;
                } else {
                    failed++;
                    this.warmingStats.warming_failures++;
                    console.warn(`[INTELLIGENT-WARMING] Failed to warm ${batch[index].key}: ${result.reason}`);
                }
            });
            
            console.log(`[INTELLIGENT-WARMING] Warming batch completed: ${successful} successful, ${failed} failed`);
            
        } catch (error) {
            console.error(`[INTELLIGENT-WARMING] Queue processing error: ${error.message}`);
        }
    }
    
    /**
     * Warm a specific cache item
     */
    async warmCacheItem(item) {
        try {
            let data = null;
            
            switch (item.type) {
                case 'wallet':
                    data = await this.warmWalletData(item);
                    break;
                case 'general':
                    data = await this.warmGeneralData(item);
                    break;
                default:
                    throw new Error(`Unknown warming type: ${item.type}`);
            }
            
            if (data) {
                // Determine appropriate tier based on confidence and strategy
                const tier = this.determineCacheTier(item.confidence, item.strategy);
                
                // Store in Redis
                await redisCache.set(item.key, data, tier);
                
                console.log(`[INTELLIGENT-WARMING] Warmed ${item.key} to ${tier} tier (${item.strategy}, confidence: ${item.confidence.toFixed(2)})`);
                
                // Log successful warming
                await changeDetection.logApiCall(
                    'intelligent_warming',
                    'warm_item',
                    true,
                    null,
                    null,
                    `${item.strategy}_${tier}_${item.confidence.toFixed(2)}`
                );
                
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error(`[INTELLIGENT-WARMING] Error warming ${item.key}: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Warm wallet-specific data
     */
    async warmWalletData(item) {
        if (item.wallet_address) {
            return await databaseCache.getCachedWalletBalance(item.wallet_address, 3600);
        }
        return null;
    }
    
    /**
     * Warm general cache data
     */
    async warmGeneralData(item) {
        const { key } = item;
        
        if (key.startsWith('token_holders_')) {
            const limit = parseInt(key.split('_')[2]) || 100;
            return await databaseCache.getCachedTokenHolders(limit, 3600);
        } else if (key.startsWith('transactions_')) {
            const parts = key.split('_');
            const page = parseInt(parts[1]) || 1;
            const limit = parseInt(parts[2]) || 100;
            return await databaseCache.getCachedTransactions(page, limit, 600);
        }
        
        // Try to get from database cache
        return await databaseCache.get(key);
    }
    
    /**
     * Determine appropriate cache tier based on confidence and strategy
     */
    determineCacheTier(confidence, strategy) {
        // High confidence or critical strategies go to HOT tier
        if (confidence > 0.8 || strategy === this.strategies.BLOCKCHAIN_EVENT) {
            return 'HOT';
        }
        
        // Medium confidence goes to WARM tier
        if (confidence > 0.6) {
            return 'WARM';
        }
        
        // Lower confidence goes to COLD tier
        return 'COLD';
    }
    
    /**
     * Get warming statistics
     */
    getWarmingStats() {
        return {
            service_status: {
                is_running: this.isRunning,
                queue_size: this.warmingQueue.length,
                patterns_learned: this.transactionPatterns.size
            },
            warming_stats: this.warmingStats,
            queue_breakdown: this.analyzeQueue(),
            pattern_summary: this.summarizePatterns(),
            strategies_used: Object.values(this.strategies)
        };
    }
    
    /**
     * Analyze current warming queue
     */
    analyzeQueue() {
        const breakdown = {
            by_strategy: {},
            by_type: {},
            by_priority: { high: 0, medium: 0, low: 0 }
        };
        
        this.warmingQueue.forEach(item => {
            // By strategy
            breakdown.by_strategy[item.strategy] = (breakdown.by_strategy[item.strategy] || 0) + 1;
            
            // By type
            breakdown.by_type[item.type] = (breakdown.by_type[item.type] || 0) + 1;
            
            // By priority
            if (item.priority > 120) breakdown.by_priority.high++;
            else if (item.priority > 80) breakdown.by_priority.medium++;
            else breakdown.by_priority.low++;
        });
        
        return breakdown;
    }
    
    /**
     * Summarize learned patterns
     */
    summarizePatterns() {
        const summary = {};
        
        for (const [patternType, patterns] of this.transactionPatterns) {
            summary[patternType] = {
                total_patterns: patterns.size,
                sample_data: Array.from(patterns.entries()).slice(0, 3)
            };
        }
        
        return summary;
    }
    
    /**
     * Manually trigger intelligent warming
     */
    async manualWarmingTrigger() {
        console.log('[INTELLIGENT-WARMING] Manual warming trigger activated');
        
        await Promise.all([
            this.analyzeTransactionPatterns(),
            this.analyzeHolderActivity(),
            this.performPatternBasedWarming()
        ]);
        
        await this.processWarmingQueue();
    }
    
    /**
     * Stop intelligent warming service
     */
    stop() {
        console.log('[INTELLIGENT-WARMING] Stopping intelligent cache warming...');
        this.isRunning = false;
        this.warmingQueue = [];
        console.log('[INTELLIGENT-WARMING] Intelligent cache warming stopped');
    }
}

// Export singleton instance
module.exports = new IntelligentCacheWarming();