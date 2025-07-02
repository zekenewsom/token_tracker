const prisma = require('../utils/prismaClient');
const redisCache = require('./redisCacheService');
const databaseCache = require('./databaseCacheService');
const blockchainMonitor = require('./blockchainEventMonitor');

class WhaleTrackingService {
    constructor() {
        this.WHALE_THRESHOLD = 0.1; // 0.1% of supply = whale
        this.MEGA_WHALE_THRESHOLD = 1.0; // 1% of supply = mega whale
        this.TOTAL_SUPPLY = 1_000_000_000;
        
        this.whaleAlerts = [];
        this.trackedWhales = new Map();
        this.whaleHistory = new Map();
        
        // Initialize whale tracking
        this.initializeWhaleTracking();
    }
    
    /**
     * Initialize whale tracking system
     */
    async initializeWhaleTracking() {
        console.log('[WHALE-TRACKER] Initializing whale tracking system...');
        
        try {
            // Load existing whales
            await this.loadKnownWhales();
            
            // Set up blockchain event handlers
            this.setupBlockchainEventHandlers();
            
            // Start periodic whale analysis
            this.startPeriodicAnalysis();
            
            console.log(`[WHALE-TRACKER] Tracking ${this.trackedWhales.size} whales`);
            
        } catch (error) {
            console.error(`[WHALE-TRACKER] Initialization error: ${error.message}`);
        }
    }
    
    /**
     * Load all known whales from database
     */
    async loadKnownWhales() {
        const whaleThresholdTokens = this.TOTAL_SUPPLY * (this.WHALE_THRESHOLD / 100);
        
        const whales = await prisma.tokenHolder.findMany({
            where: {
                balance: { gte: whaleThresholdTokens }
            },
            include: {
                wallet: {
                    include: {
                        transactions_source: {
                            orderBy: { blockTime: 'desc' },
                            take: 50
                        },
                        transactions_destination: {
                            orderBy: { blockTime: 'desc' },
                            take: 50
                        }
                    }
                }
            },
            orderBy: { balance: 'desc' }
        });
        
        for (const whale of whales) {
            const whaleData = await this.analyzeWhale(whale);
            this.trackedWhales.set(whale.wallet.address, whaleData);
        }
    }
    
    /**
     * Setup blockchain event handlers for real-time whale tracking
     */
    setupBlockchainEventHandlers() {
        blockchainMonitor.on('blockchain_event', async (event) => {
            if (event.type === 'program_change') {
                await this.handleTokenTransfer(event);
            }
        });
    }
    
    /**
     * Handle real-time token transfers
     */
    async handleTokenTransfer(event) {
        try {
            const programData = event.data?.result;
            const accountInfo = programData?.value?.account;
            const parsedData = accountInfo?.data?.parsed;
            
            if (parsedData?.info?.mint === '2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump') {
                const owner = parsedData.info.owner;
                const newBalance = parsedData.info.tokenAmount?.uiAmount || 0;
                
                await this.updateWhalePosition(owner, newBalance, event.timestamp);
            }
            
        } catch (error) {
            console.error(`[WHALE-TRACKER] Error handling transfer: ${error.message}`);
        }
    }
    
    /**
     * Update whale position and detect significant changes
     */
    async updateWhalePosition(walletAddress, newBalance, timestamp) {
        const percentage = (newBalance / this.TOTAL_SUPPLY) * 100;
        const isWhale = percentage >= this.WHALE_THRESHOLD;
        const wasPreviouslyWhale = this.trackedWhales.has(walletAddress);
        
        if (isWhale) {
            const previousData = this.trackedWhales.get(walletAddress);
            const previousBalance = previousData?.current_balance || 0;
            const balanceChange = newBalance - previousBalance;
            const percentageChange = previousBalance > 0 ? (balanceChange / previousBalance) * 100 : 100;
            
            // Update whale data
            const whaleData = {
                wallet_address: walletAddress,
                current_balance: newBalance,
                percentage_of_supply: percentage,
                tier: this.getWhaleTier(percentage),
                last_updated: new Date(timestamp).toISOString(),
                balance_change_24h: balanceChange,
                percentage_change_24h: percentageChange,
                activity_score: this.calculateActivityScore(walletAddress),
                risk_level: this.calculateRiskLevel(percentage, percentageChange),
                behavior_pattern: await this.analyzeRecentBehavior(walletAddress)
            };
            
            this.trackedWhales.set(walletAddress, whaleData);
            
            // Generate alerts for significant changes
            await this.checkForWhaleAlerts(whaleData, previousData);
            
            // Store in whale history
            this.storeWhaleHistory(walletAddress, whaleData);
            
        } else if (wasPreviouslyWhale) {
            // Whale dropped below threshold
            await this.handleWhaleExit(walletAddress, newBalance);
        }
    }
    
    /**
     * Analyze a whale's complete profile
     */
    async analyzeWhale(whaleData) {
        const wallet = whaleData.wallet;
        const percentage = (whaleData.balance / this.TOTAL_SUPPLY) * 100;
        
        // Analyze transaction history
        const allTransactions = [
            ...wallet.transactions_destination.map(tx => ({ ...tx, type: 'buy' })),
            ...wallet.transactions_source.map(tx => ({ ...tx, type: 'sell' }))
        ].sort((a, b) => b.blockTime - a.blockTime);
        
        // Calculate metrics
        const totalBought = wallet.transactions_destination.reduce((sum, tx) => sum + (tx.tokenAmount || 0), 0);
        const totalSold = wallet.transactions_source.reduce((sum, tx) => sum + (tx.tokenAmount || 0), 0);
        const netPosition = totalBought - totalSold;
        
        const avgBuyPrice = this.calculateAveragePrice(wallet.transactions_destination);
        const avgSellPrice = this.calculateAveragePrice(wallet.transactions_source);
        
        // Analyze recent activity (30 days)
        const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
        const recentTx = allTransactions.filter(tx => tx.blockTime > thirtyDaysAgo);
        
        return {
            wallet_address: wallet.address,
            current_balance: whaleData.balance,
            percentage_of_supply: percentage,
            tier: this.getWhaleTier(percentage),
            
            // Position analysis
            total_bought: totalBought,
            total_sold: totalSold,
            net_position: netPosition,
            average_buy_price: avgBuyPrice,
            average_sell_price: avgSellPrice,
            
            // Trading behavior
            total_transactions: allTransactions.length,
            buy_transactions: wallet.transactions_destination.length,
            sell_transactions: wallet.transactions_source.length,
            first_activity: allTransactions.length > 0 ? 
                new Date(allTransactions[allTransactions.length - 1].blockTime * 1000).toISOString() : null,
            last_activity: allTransactions.length > 0 ? 
                new Date(allTransactions[0].blockTime * 1000).toISOString() : null,
            
            // Recent activity
            recent_activity: {
                transactions_30d: recentTx.length,
                net_flow_30d: this.calculateNetFlow(recentTx),
                behavior_30d: this.categorizeBehavior(recentTx)
            },
            
            // Risk assessment
            activity_score: this.calculateActivityScore(wallet.address, allTransactions),
            risk_level: this.calculateRiskLevel(percentage, 0),
            influence_score: this.calculateInfluenceScore(percentage, allTransactions.length),
            
            // Market impact
            potential_impact: this.calculatePotentialImpact(whaleData.balance),
            dump_risk_score: this.calculateDumpRisk(whaleData.balance, recentTx),
            
            last_analyzed: new Date().toISOString()
        };
    }
    
    /**
     * Get comprehensive whale analysis for traders
     */
    async getWhaleAnalysis(options = {}) {
        const {
            includeHistory = false,
            sortBy = 'balance',
            limit = 50,
            minPercentage = this.WHALE_THRESHOLD
        } = options;
        
        const cacheKey = `whale_analysis_${sortBy}_${limit}_${minPercentage}`;
        
        // Try cache first
        let analysis = await databaseCache.get(cacheKey);
        if (analysis && !includeHistory) {
            return analysis;
        }
        
        console.log('[WHALE-TRACKER] Generating comprehensive whale analysis...');
        
        const whales = Array.from(this.trackedWhales.values())
            .filter(whale => whale.percentage_of_supply >= minPercentage)
            .sort((a, b) => {
                switch (sortBy) {
                    case 'balance': return b.current_balance - a.current_balance;
                    case 'percentage': return b.percentage_of_supply - a.percentage_of_supply;
                    case 'activity': return b.activity_score - a.activity_score;
                    case 'risk': return b.risk_level - a.risk_level;
                    default: return b.current_balance - a.current_balance;
                }
            })
            .slice(0, limit);
        
        // Calculate aggregate metrics
        const aggregateMetrics = this.calculateAggregateMetrics(whales);
        
        // Get market impact analysis
        const marketImpact = this.analyzeMarketImpact(whales);
        
        // Get whale distribution
        const distribution = this.analyzeWhaleDistribution(whales);
        
        // Generate alerts
        const alerts = this.generateWhaleAlerts(whales);
        
        analysis = {
            timestamp: new Date().toISOString(),
            whale_count: whales.length,
            whales: whales.map(whale => ({
                ...whale,
                ...(includeHistory ? { history: this.whaleHistory.get(whale.wallet_address) || [] } : {})
            })),
            aggregate_metrics: aggregateMetrics,
            market_impact: marketImpact,
            distribution: distribution,
            alerts: alerts,
            insights: this.generateWhaleInsights(whales, aggregateMetrics)
        };
        
        // Cache for 10 minutes
        await databaseCache.set(cacheKey, analysis, 600);
        
        return analysis;
    }
    
    /**
     * Get whale alerts and notifications
     */
    getWhaleAlerts() {
        return {
            recent_alerts: this.whaleAlerts.slice(-50), // Last 50 alerts
            alert_summary: this.summarizeAlerts(),
            active_whales: Array.from(this.trackedWhales.values())
                .filter(whale => whale.activity_score > 0.7)
                .length
        };
    }
    
    /**
     * Track specific whale by address
     */
    async trackWhale(walletAddress) {
        try {
            const tokenHolder = await prisma.tokenHolder.findFirst({
                where: { wallet: { address: walletAddress } },
                include: {
                    wallet: {
                        include: {
                            transactions_source: { orderBy: { blockTime: 'desc' }, take: 100 },
                            transactions_destination: { orderBy: { blockTime: 'desc' }, take: 100 }
                        }
                    }
                }
            });
            
            if (!tokenHolder) {
                throw new Error('Wallet not found or has no token holdings');
            }
            
            const whaleData = await this.analyzeWhale(tokenHolder);
            this.trackedWhales.set(walletAddress, whaleData);
            
            return whaleData;
            
        } catch (error) {
            console.error(`[WHALE-TRACKER] Error tracking whale ${walletAddress}: ${error.message}`);
            throw error;
        }
    }
    
    // Helper methods
    getWhaleTier(percentage) {
        if (percentage >= 5) return 'MEGA_WHALE';
        if (percentage >= 1) return 'WHALE';
        if (percentage >= 0.5) return 'LARGE_SHARK';
        if (percentage >= 0.1) return 'SHARK';
        return 'FISH';
    }
    
    calculateAveragePrice(transactions) {
        if (transactions.length === 0) return 0;
        
        const totalValue = transactions.reduce((sum, tx) => 
            sum + ((tx.tokenAmount || 0) * (tx.token_price_usd || 0)), 0
        );
        const totalTokens = transactions.reduce((sum, tx) => sum + (tx.tokenAmount || 0), 0);
        
        return totalTokens > 0 ? totalValue / totalTokens : 0;
    }
    
    calculateNetFlow(transactions) {
        const buys = transactions.filter(tx => tx.type === 'buy')
            .reduce((sum, tx) => sum + (tx.tokenAmount || 0), 0);
        const sells = transactions.filter(tx => tx.type === 'sell')
            .reduce((sum, tx) => sum + (tx.tokenAmount || 0), 0);
        
        return buys - sells;
    }
    
    categorizeBehavior(transactions) {
        if (transactions.length === 0) return 'INACTIVE';
        
        const buys = transactions.filter(tx => tx.type === 'buy').length;
        const sells = transactions.filter(tx => tx.type === 'sell').length;
        
        if (buys > sells * 2) return 'ACCUMULATING';
        if (sells > buys * 2) return 'DISTRIBUTING';
        if (buys > 0 && sells > 0) return 'TRADING';
        if (buys > 0) return 'BUYING';
        if (sells > 0) return 'SELLING';
        
        return 'HOLDING';
    }
    
    calculateActivityScore(walletAddress, transactions = []) {
        // Base score on transaction frequency and recency
        const now = Date.now() / 1000;
        const recentTx = transactions.filter(tx => (now - tx.blockTime) < (7 * 24 * 60 * 60)); // 7 days
        
        return Math.min(recentTx.length / 10, 1); // Normalize to 0-1
    }
    
    calculateRiskLevel(percentage, percentageChange) {
        let risk = 0;
        
        // Size risk
        if (percentage >= 5) risk += 0.4;
        else if (percentage >= 1) risk += 0.3;
        else if (percentage >= 0.5) risk += 0.2;
        else risk += 0.1;
        
        // Change risk
        if (Math.abs(percentageChange) > 50) risk += 0.3;
        else if (Math.abs(percentageChange) > 20) risk += 0.2;
        else if (Math.abs(percentageChange) > 10) risk += 0.1;
        
        return Math.min(risk, 1);
    }
    
    calculateInfluenceScore(percentage, transactionCount) {
        const sizeScore = Math.min(percentage / 5, 1); // Normalize to whale of 5%
        const activityScore = Math.min(transactionCount / 100, 1); // Normalize to 100 transactions
        
        return (sizeScore * 0.7) + (activityScore * 0.3);
    }
    
    calculatePotentialImpact(balance) {
        const percentage = (balance / this.TOTAL_SUPPLY) * 100;
        
        if (percentage >= 5) return 'EXTREME';
        if (percentage >= 1) return 'HIGH';
        if (percentage >= 0.5) return 'MEDIUM';
        return 'LOW';
    }
    
    calculateDumpRisk(balance, recentTransactions) {
        const recentSells = recentTransactions.filter(tx => tx.type === 'sell');
        const recentSellVolume = recentSells.reduce((sum, tx) => sum + (tx.tokenAmount || 0), 0);
        
        const sellRatio = recentSellVolume / balance;
        
        if (sellRatio > 0.2) return 0.9; // High dump risk
        if (sellRatio > 0.1) return 0.6; // Medium dump risk
        if (sellRatio > 0.05) return 0.3; // Low dump risk
        
        return 0.1; // Very low dump risk
    }
    
    async checkForWhaleAlerts(currentData, previousData) {
        const alerts = [];
        
        if (!previousData) {
            // New whale detected
            if (currentData.percentage_of_supply >= this.WHALE_THRESHOLD) {
                alerts.push({
                    type: 'NEW_WHALE',
                    severity: currentData.percentage_of_supply >= 1 ? 'HIGH' : 'MEDIUM',
                    whale_address: currentData.wallet_address,
                    percentage: currentData.percentage_of_supply,
                    message: `New ${currentData.tier} detected with ${currentData.percentage_of_supply.toFixed(2)}% of supply`,
                    timestamp: new Date().toISOString()
                });
            }
        } else {
            // Check for significant changes
            const balanceChange = currentData.current_balance - previousData.current_balance;
            const percentageChange = Math.abs(currentData.percentage_change_24h);
            
            if (percentageChange > 20 && Math.abs(balanceChange) > this.TOTAL_SUPPLY * 0.001) {
                alerts.push({
                    type: balanceChange > 0 ? 'WHALE_ACCUMULATION' : 'WHALE_DISTRIBUTION',
                    severity: 'HIGH',
                    whale_address: currentData.wallet_address,
                    change: balanceChange,
                    percentage_change: currentData.percentage_change_24h,
                    message: `${currentData.tier} ${balanceChange > 0 ? 'accumulated' : 'distributed'} ${Math.abs(balanceChange).toLocaleString()} tokens (${currentData.percentage_change_24h.toFixed(1)}% change)`,
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        // Add alerts to the list
        this.whaleAlerts.push(...alerts);
        
        // Keep only last 1000 alerts
        if (this.whaleAlerts.length > 1000) {
            this.whaleAlerts = this.whaleAlerts.slice(-1000);
        }
    }
    
    async handleWhaleExit(walletAddress, newBalance) {
        const previousData = this.trackedWhales.get(walletAddress);
        
        if (previousData) {
            this.whaleAlerts.push({
                type: 'WHALE_EXIT',
                severity: 'MEDIUM',
                whale_address: walletAddress,
                previous_percentage: previousData.percentage_of_supply,
                new_balance: newBalance,
                message: `${previousData.tier} exited whale status (${previousData.percentage_of_supply.toFixed(2)}% → ${((newBalance / this.TOTAL_SUPPLY) * 100).toFixed(2)}%)`,
                timestamp: new Date().toISOString()
            });
            
            // Remove from tracked whales
            this.trackedWhales.delete(walletAddress);
        }
    }
    
    storeWhaleHistory(walletAddress, whaleData) {
        if (!this.whaleHistory.has(walletAddress)) {
            this.whaleHistory.set(walletAddress, []);
        }
        
        const history = this.whaleHistory.get(walletAddress);
        history.push({
            timestamp: whaleData.last_updated,
            balance: whaleData.current_balance,
            percentage: whaleData.percentage_of_supply,
            tier: whaleData.tier
        });
        
        // Keep only last 100 history entries
        if (history.length > 100) {
            history.splice(0, history.length - 100);
        }
    }
    
    calculateAggregateMetrics(whales) {
        const totalWhaleTokens = whales.reduce((sum, whale) => sum + whale.current_balance, 0);
        const totalWhalePercentage = whales.reduce((sum, whale) => sum + whale.percentage_of_supply, 0);
        
        return {
            total_whale_count: whales.length,
            total_whale_tokens: totalWhaleTokens,
            total_whale_percentage: totalWhalePercentage,
            average_whale_size: totalWhaleTokens / whales.length,
            largest_whale_percentage: whales.length > 0 ? whales[0].percentage_of_supply : 0,
            concentration_ratio: {
                top_5: whales.slice(0, 5).reduce((sum, w) => sum + w.percentage_of_supply, 0),
                top_10: whales.slice(0, 10).reduce((sum, w) => sum + w.percentage_of_supply, 0),
                top_20: whales.slice(0, 20).reduce((sum, w) => sum + w.percentage_of_supply, 0)
            }
        };
    }
    
    analyzeMarketImpact(whales) {
        const activeWhales = whales.filter(w => w.activity_score > 0.5);
        const accumulatingWhales = whales.filter(w => w.recent_activity?.behavior_30d === 'ACCUMULATING');
        const distributingWhales = whales.filter(w => w.recent_activity?.behavior_30d === 'DISTRIBUTING');
        
        return {
            active_whale_count: activeWhales.length,
            accumulating_whales: accumulatingWhales.length,
            distributing_whales: distributingWhales.length,
            net_whale_sentiment: accumulatingWhales.length > distributingWhales.length ? 'BULLISH' : 
                                distributingWhales.length > accumulatingWhales.length ? 'BEARISH' : 'NEUTRAL',
            potential_sell_pressure: whales.filter(w => w.dump_risk_score > 0.6).length,
            whale_coordination_risk: this.calculateCoordinationRisk(whales)
        };
    }
    
    analyzeWhaleDistribution(whales) {
        const tiers = {};
        
        whales.forEach(whale => {
            if (!tiers[whale.tier]) {
                tiers[whale.tier] = { count: 0, total_percentage: 0 };
            }
            tiers[whale.tier].count++;
            tiers[whale.tier].total_percentage += whale.percentage_of_supply;
        });
        
        return tiers;
    }
    
    generateWhaleAlerts(whales) {
        return this.whaleAlerts.slice(-20); // Last 20 alerts
    }
    
    generateWhaleInsights(whales, metrics) {
        const insights = [];
        
        if (metrics.concentration_ratio.top_10 > 50) {
            insights.push({
                type: 'HIGH_CONCENTRATION',
                message: `Top 10 whales control ${metrics.concentration_ratio.top_10.toFixed(1)}% of supply`,
                impact: 'HIGH_VOLATILITY_RISK'
            });
        }
        
        const accumulatingCount = whales.filter(w => w.recent_activity?.behavior_30d === 'ACCUMULATING').length;
        const distributingCount = whales.filter(w => w.recent_activity?.behavior_30d === 'DISTRIBUTING').length;
        
        if (accumulatingCount > distributingCount * 2) {
            insights.push({
                type: 'WHALE_ACCUMULATION',
                message: `${accumulatingCount} whales accumulating vs ${distributingCount} distributing`,
                impact: 'BULLISH_SENTIMENT'
            });
        }
        
        return insights;
    }
    
    calculateCoordinationRisk(whales) {
        // Simple heuristic: if many whales have similar activity patterns, coordination risk is higher
        const behaviors = whales.map(w => w.recent_activity?.behavior_30d);
        const distributingCount = behaviors.filter(b => b === 'DISTRIBUTING').length;
        
        return distributingCount > whales.length * 0.6 ? 'HIGH' : 'LOW';
    }
    
    summarizeAlerts() {
        const recent = this.whaleAlerts.slice(-100);
        const alertTypes = {};
        
        recent.forEach(alert => {
            alertTypes[alert.type] = (alertTypes[alert.type] || 0) + 1;
        });
        
        return {
            total_alerts_24h: recent.length,
            alert_breakdown: alertTypes,
            highest_severity: recent.some(a => a.severity === 'HIGH') ? 'HIGH' :
                            recent.some(a => a.severity === 'MEDIUM') ? 'MEDIUM' : 'LOW'
        };
    }
    
    startPeriodicAnalysis() {
        // Update whale data every 5 minutes
        setInterval(async () => {
            try {
                await this.loadKnownWhales();
                console.log(`[WHALE-TRACKER] Updated tracking for ${this.trackedWhales.size} whales`);
            } catch (error) {
                console.error(`[WHALE-TRACKER] Periodic update error: ${error.message}`);
            }
        }, 5 * 60 * 1000);
    }
}

module.exports = new WhaleTrackingService();