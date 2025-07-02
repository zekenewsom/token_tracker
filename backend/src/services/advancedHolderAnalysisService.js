const prisma = require('../utils/prismaClient');
const redisCache = require('./redisCacheService');
const databaseCache = require('./databaseCacheService');
const changeDetection = require('./changeDetectionService');

class AdvancedHolderAnalysisService {
    constructor() {
        this.TOTAL_TOKEN_SUPPLY = 1_000_000_000;
        this.ANALYSIS_CACHE_TTL = 1800; // 30 minutes
        
        // Enhanced holder tiers for trading insights
        this.HOLDER_TIERS = {
            MEGA_WHALE: { min: 5, name: 'Mega Whale', color: '#FF0000', impact: 'EXTREME' },
            WHALE: { min: 1, name: 'Whale', color: '#FF4500', impact: 'HIGH' },
            LARGE_SHARK: { min: 0.5, name: 'Large Shark', color: '#FF6347', impact: 'HIGH' },
            SHARK: { min: 0.1, name: 'Shark', color: '#FF8C00', impact: 'MEDIUM' },
            DOLPHIN: { min: 0.01, name: 'Dolphin', color: '#1E90FF', impact: 'MEDIUM' },
            FISH: { min: 0.001, name: 'Fish', color: '#32CD32', impact: 'LOW' },
            MINNOW: { min: 0.0001, name: 'Minnow', color: '#90EE90', impact: 'MINIMAL' },
            CRAB: { min: 0, name: 'Crab', color: '#GRAY', impact: 'MINIMAL' }
        };
        
        // Trading behavior patterns
        this.BEHAVIOR_PATTERNS = {
            ACCUMULATOR: 'Consistent buyer, diamond hands',
            TRADER: 'Active buyer/seller, profit taking',
            WHALE_DUMPER: 'Large seller, potential dump risk',
            WHALE_ACCUMULATOR: 'Large buyer, bullish signal',
            INACTIVE: 'No recent activity',
            NEW_MONEY: 'Recent first-time buyer',
            PAPER_HANDS: 'Quick seller after buying',
            SWING_TRADER: 'Regular buy/sell cycles'
        };
        
        // Risk indicators for traders
        this.RISK_INDICATORS = {
            WHALE_CONCENTRATION: 'High whale concentration risk',
            RECENT_WHALE_ACCUMULATION: 'Whales accumulating - bullish',
            RECENT_WHALE_DISTRIBUTION: 'Whales distributing - bearish',
            NEW_WHALE_ENTRY: 'New whale entered - monitor',
            WHALE_EXIT: 'Whale exited position - caution',
            HIGH_PAPER_HANDS: 'High paper hands ratio',
            DISTRIBUTION_PHASE: 'Possible distribution phase',
            ACCUMULATION_PHASE: 'Possible accumulation phase'
        };
    }
    
    /**
     * Get comprehensive holder analysis for traders
     */
    async getComprehensiveHolderAnalysis(options = {}) {
        const {
            includeHistorical = true,
            includeBehaviorAnalysis = true,
            includeRiskAnalysis = true,
            includeWhaleTracking = true,
            timeframe = '30d' // 1d, 7d, 30d, 90d
        } = options;
        
        const cacheKey = `comprehensive_holder_analysis_${timeframe}_${includeHistorical}_${includeBehaviorAnalysis}`;
        
        // Try cache first
        let analysis = await databaseCache.get(cacheKey);
        if (analysis) {
            return analysis;
        }
        
        console.log('[HOLDER-ANALYSIS] Starting comprehensive holder analysis...');
        const startTime = Date.now();
        
        try {
            const [
                holderDistribution,
                whaleAnalysis,
                behaviorAnalysis,
                riskAnalysis,
                concentrationMetrics,
                flowAnalysis,
                historicalTrends
            ] = await Promise.all([
                this.getHolderDistribution(),
                includeWhaleTracking ? this.getWhaleAnalysis(timeframe) : {},
                includeBehaviorAnalysis ? this.getBehaviorAnalysis(timeframe) : {},
                includeRiskAnalysis ? this.getRiskAnalysis() : {},
                this.getConcentrationMetrics(),
                this.getFlowAnalysis(timeframe),
                includeHistorical ? this.getHistoricalTrends(timeframe) : {}
            ]);
            
            analysis = {
                timestamp: new Date().toISOString(),
                timeframe,
                holder_distribution: holderDistribution,
                whale_analysis: whaleAnalysis,
                behavior_analysis: behaviorAnalysis,
                risk_analysis: riskAnalysis,
                concentration_metrics: concentrationMetrics,
                flow_analysis: flowAnalysis,
                historical_trends: historicalTrends,
                trading_insights: this.generateTradingInsights({
                    whaleAnalysis,
                    behaviorAnalysis,
                    riskAnalysis,
                    flowAnalysis
                }),
                performance_metrics: {
                    analysis_time_ms: Date.now() - startTime,
                    data_freshness: 'real-time'
                }
            };
            
            // Cache the results
            await databaseCache.set(cacheKey, analysis, this.ANALYSIS_CACHE_TTL);
            
            console.log(`[HOLDER-ANALYSIS] Analysis completed in ${Date.now() - startTime}ms`);
            return analysis;
            
        } catch (error) {
            console.error(`[HOLDER-ANALYSIS] Error: ${error.message}`);
            throw new Error(`Failed to generate holder analysis: ${error.message}`);
        }
    }
    
    /**
     * Get detailed holder distribution by tiers
     */
    async getHolderDistribution() {
        const holders = await this.getEnhancedHolders();
        
        const distribution = {};
        let totalTokensDistributed = 0;
        
        // Initialize distribution structure
        Object.values(this.HOLDER_TIERS).forEach(tier => {
            distribution[tier.name] = {
                count: 0,
                total_tokens: 0,
                percentage_of_supply: 0,
                holders: [],
                tier_info: tier
            };
        });
        
        holders.forEach(holder => {
            const tier = this.getHolderTier(holder.percentage_of_supply);
            distribution[tier].count++;
            distribution[tier].total_tokens += holder.total_tokens_held;
            distribution[tier].holders.push({
                address: holder.wallet_address,
                tokens: holder.total_tokens_held,
                percentage: holder.percentage_of_supply,
                value_usd: holder.position_value_usd,
                pnl: holder.unrealized_pnl,
                behavior: holder.behavior_pattern
            });
            totalTokensDistributed += holder.total_tokens_held;
        });
        
        // Calculate percentages
        Object.keys(distribution).forEach(tier => {
            distribution[tier].percentage_of_supply = 
                (distribution[tier].total_tokens / this.TOTAL_TOKEN_SUPPLY) * 100;
            
            // Sort holders within tier by token amount
            distribution[tier].holders.sort((a, b) => b.tokens - a.tokens);
            
            // Keep only top 10 per tier for API response
            distribution[tier].top_holders = distribution[tier].holders.slice(0, 10);
            delete distribution[tier].holders; // Remove full list to reduce response size
        });
        
        return {
            tiers: distribution,
            summary: {
                total_holders: holders.length,
                tokens_in_tracked_wallets: totalTokensDistributed,
                tracking_coverage: (totalTokensDistributed / this.TOTAL_TOKEN_SUPPLY) * 100
            }
        };
    }
    
    /**
     * Advanced whale tracking and analysis
     */
    async getWhaleAnalysis(timeframe = '30d') {
        const daysBack = this.parseTimeframe(timeframe);
        const timeThreshold = Math.floor(Date.now() / 1000) - (daysBack * 24 * 60 * 60);
        
        const whales = await prisma.tokenHolder.findMany({
            where: {
                balance: { gte: this.TOTAL_TOKEN_SUPPLY * 0.001 } // 0.1%+ holders
            },
            include: {
                wallet: {
                    include: {
                        transactions_source: {
                            where: { blockTime: { gte: timeThreshold } },
                            orderBy: { blockTime: 'desc' }
                        },
                        transactions_destination: {
                            where: { blockTime: { gte: timeThreshold } },
                            orderBy: { blockTime: 'desc' }
                        }
                    }
                }
            },
            orderBy: { balance: 'desc' }
        });
        
        const whaleMovements = [];
        const whaleMetrics = {
            total_whales: 0,
            active_whales: 0,
            accumulating_whales: 0,
            distributing_whales: 0,
            new_whales: 0,
            exited_whales: 0,
            total_whale_volume: 0,
            net_whale_flow: 0
        };
        
        for (const whale of whales) {
            const percentage = (whale.balance / this.TOTAL_TOKEN_SUPPLY) * 100;
            if (percentage < 0.1) continue; // Only true whales (0.1%+)
            
            whaleMetrics.total_whales++;
            
            const allTx = [
                ...whale.wallet.transactions_destination.map(tx => ({ ...tx, type: 'buy' })),
                ...whale.wallet.transactions_source.map(tx => ({ ...tx, type: 'sell' }))
            ].sort((a, b) => b.blockTime - a.blockTime);
            
            if (allTx.length > 0) {
                whaleMetrics.active_whales++;
                
                const totalBuys = whale.wallet.transactions_destination.reduce((sum, tx) => sum + (tx.tokenAmount || 0), 0);
                const totalSells = whale.wallet.transactions_source.reduce((sum, tx) => sum + (tx.tokenAmount || 0), 0);
                const netFlow = totalBuys - totalSells;
                
                whaleMetrics.total_whale_volume += totalBuys + totalSells;
                whaleMetrics.net_whale_flow += netFlow;
                
                if (netFlow > 0) whaleMetrics.accumulating_whales++;
                if (netFlow < 0) whaleMetrics.distributing_whales++;
                
                // Detect significant movements
                const significantTx = allTx.filter(tx => 
                    (tx.tokenAmount || 0) > whale.balance * 0.1 // 10%+ of current holding
                );
                
                if (significantTx.length > 0) {
                    whaleMovements.push({
                        wallet_address: whale.wallet.address,
                        current_balance: whale.balance,
                        percentage_of_supply: percentage,
                        tier: this.getHolderTier(percentage),
                        recent_transactions: significantTx.slice(0, 5).map(tx => ({
                            type: tx.type,
                            amount: tx.tokenAmount,
                            price: tx.token_price_usd,
                            value_usd: (tx.tokenAmount || 0) * (tx.token_price_usd || 0),
                            timestamp: new Date(tx.blockTime * 1000).toISOString(),
                            impact_level: this.calculateTransactionImpact(tx.tokenAmount, whale.balance)
                        })),
                        net_flow: netFlow,
                        behavior: netFlow > whale.balance * 0.1 ? 'HEAVY_ACCUMULATION' :
                                 netFlow < -whale.balance * 0.1 ? 'HEAVY_DISTRIBUTION' :
                                 netFlow > 0 ? 'ACCUMULATING' :
                                 netFlow < 0 ? 'DISTRIBUTING' : 'HOLDING'
                    });
                }
            }
        }
        
        return {
            metrics: whaleMetrics,
            whale_movements: whaleMovements.slice(0, 50), // Top 50 most active whales
            alerts: this.generateWhaleAlerts(whaleMovements, whaleMetrics)
        };
    }
    
    /**
     * Behavioral analysis of different holder segments
     */
    async getBehaviorAnalysis(timeframe = '30d') {
        const daysBack = this.parseTimeframe(timeframe);
        const timeThreshold = Math.floor(Date.now() / 1000) - (daysBack * 24 * 60 * 60);
        
        const holders = await this.getEnhancedHolders();
        const behaviorSegments = {};
        
        // Initialize behavior segments
        Object.values(this.BEHAVIOR_PATTERNS).forEach(pattern => {
            behaviorSegments[pattern] = {
                count: 0,
                total_tokens: 0,
                average_hold_time: 0,
                total_volume: 0,
                holders: []
            };
        });
        
        for (const holder of holders) {
            const behavior = await this.analyzeBehaviorPattern(holder.wallet_address, timeThreshold);
            const segment = behaviorSegments[behavior.pattern];
            
            if (segment) {
                segment.count++;
                segment.total_tokens += holder.total_tokens_held;
                segment.total_volume += behavior.total_volume;
                segment.holders.push({
                    address: holder.wallet_address,
                    tokens: holder.total_tokens_held,
                    behavior_score: behavior.score,
                    risk_level: behavior.risk_level
                });
            }
        }
        
        // Calculate averages and sort
        Object.keys(behaviorSegments).forEach(pattern => {
            const segment = behaviorSegments[pattern];
            if (segment.count > 0) {
                segment.percentage_of_holders = (segment.count / holders.length) * 100;
                segment.percentage_of_supply = (segment.total_tokens / this.TOTAL_TOKEN_SUPPLY) * 100;
                segment.holders.sort((a, b) => b.tokens - a.tokens);
                segment.top_holders = segment.holders.slice(0, 10);
                delete segment.holders; // Reduce response size
            }
        });
        
        return {
            behavior_segments: behaviorSegments,
            insights: this.generateBehaviorInsights(behaviorSegments),
            market_sentiment: this.calculateMarketSentiment(behaviorSegments)
        };
    }
    
    /**
     * Risk analysis for trading decisions
     */
    async getRiskAnalysis() {
        const holders = await this.getEnhancedHolders();
        const currentPrice = await this.getCurrentTokenPrice();
        
        const riskMetrics = {
            concentration_risk: 0,
            whale_dump_risk: 0,
            paper_hands_ratio: 0,
            new_money_ratio: 0,
            average_holder_strength: 0,
            liquidity_risk: 0
        };
        
        const riskIndicators = [];
        
        // Calculate concentration risk (top 10 holders percentage)
        const top10Percentage = holders.slice(0, 10)
            .reduce((sum, h) => sum + h.percentage_of_supply, 0);
        
        riskMetrics.concentration_risk = top10Percentage;
        
        if (top10Percentage > 50) {
            riskIndicators.push({
                type: this.RISK_INDICATORS.WHALE_CONCENTRATION,
                severity: 'HIGH',
                message: `Top 10 holders control ${top10Percentage.toFixed(1)}% of supply`,
                impact: 'High dump risk if whales sell'
            });
        }
        
        // Analyze whale positions in profit/loss
        const whalesInProfit = holders.filter(h => 
            h.percentage_of_supply >= 0.1 && h.unrealized_pnl > 0
        ).length;
        
        const totalWhales = holders.filter(h => h.percentage_of_supply >= 0.1).length;
        
        if (whalesInProfit / totalWhales > 0.8) {
            riskIndicators.push({
                type: this.RISK_INDICATORS.RECENT_WHALE_DISTRIBUTION,
                severity: 'MEDIUM',
                message: `${((whalesInProfit/totalWhales)*100).toFixed(1)}% of whales are in profit`,
                impact: 'Potential selling pressure'
            });
        }
        
        // Calculate paper hands ratio (holders with quick sells)
        const paperHandsCount = holders.filter(h => 
            h.behavior_pattern === this.BEHAVIOR_PATTERNS.PAPER_HANDS
        ).length;
        
        riskMetrics.paper_hands_ratio = (paperHandsCount / holders.length) * 100;
        
        return {
            risk_metrics: riskMetrics,
            risk_indicators: riskIndicators,
            overall_risk_score: this.calculateOverallRiskScore(riskMetrics),
            recommendations: this.generateRiskRecommendations(riskMetrics, riskIndicators)
        };
    }
    
    /**
     * Get concentration metrics for risk assessment
     */
    async getConcentrationMetrics() {
        const holders = await this.getEnhancedHolders();
        
        if (!holders || holders.length === 0) {
            return {
                concentration_ratio: {
                    top_1: 0,
                    top_5: 0,
                    top_10: 0,
                    top_20: 0,
                    top_50: 0
                },
                gini_coefficient: 0,
                herfindahl_index: 0,
                distribution_quality: 'UNKNOWN',
                risk_level: 'MEDIUM'
            };
        }
        
        // Calculate concentration ratios
        const concentrationRatio = {
            top_1: holders.slice(0, 1).reduce((sum, h) => sum + h.percentage_of_supply, 0),
            top_5: holders.slice(0, 5).reduce((sum, h) => sum + h.percentage_of_supply, 0),
            top_10: holders.slice(0, 10).reduce((sum, h) => sum + h.percentage_of_supply, 0),
            top_20: holders.slice(0, 20).reduce((sum, h) => sum + h.percentage_of_supply, 0),
            top_50: holders.slice(0, 50).reduce((sum, h) => sum + h.percentage_of_supply, 0)
        };
        
        // Calculate Gini coefficient (simplified)
        const giniCoefficient = this.calculateGiniCoefficient(holders);
        
        // Calculate Herfindahl-Hirschman Index
        const herfindahlIndex = holders.reduce((sum, h) => {
            const marketShare = h.percentage_of_supply / 100;
            return sum + (marketShare * marketShare);
        }, 0);
        
        // Assess distribution quality
        let distributionQuality = 'EXCELLENT';
        let riskLevel = 'VERY_LOW';
        
        if (concentrationRatio.top_10 > 70) {
            distributionQuality = 'POOR';
            riskLevel = 'VERY_HIGH';
        } else if (concentrationRatio.top_10 > 50) {
            distributionQuality = 'FAIR';
            riskLevel = 'HIGH';
        } else if (concentrationRatio.top_10 > 30) {
            distributionQuality = 'GOOD';
            riskLevel = 'MEDIUM';
        } else if (concentrationRatio.top_10 > 15) {
            distributionQuality = 'VERY_GOOD';
            riskLevel = 'LOW';
        }
        
        return {
            concentration_ratio: concentrationRatio,
            gini_coefficient: giniCoefficient,
            herfindahl_index: herfindahlIndex,
            distribution_quality: distributionQuality,
            risk_level: riskLevel,
            total_tracked_holders: holders.length,
            whale_dominance: concentrationRatio.top_10,
            retail_participation: Math.max(0, 100 - concentrationRatio.top_50)
        };
    }
    
    /**
     * Calculate Gini coefficient for wealth distribution
     */
    calculateGiniCoefficient(holders) {
        if (!holders || holders.length < 2) return 0;
        
        // Sort holders by balance
        const sortedHolders = [...holders].sort((a, b) => a.balance - b.balance);
        const n = sortedHolders.length;
        let numerator = 0;
        let denominator = 0;
        
        for (let i = 0; i < n; i++) {
            numerator += (2 * (i + 1) - n - 1) * sortedHolders[i].balance;
            denominator += sortedHolders[i].balance;
        }
        
        return denominator === 0 ? 0 : numerator / (n * denominator);
    }
    
    /**
     * Token flow analysis (buy/sell pressure)
     */
    async getFlowAnalysis(timeframe = '30d') {
        const daysBack = this.parseTimeframe(timeframe);
        const timeThreshold = Math.floor(Date.now() / 1000) - (daysBack * 24 * 60 * 60);
        
        const [buyTx, sellTx] = await Promise.all([
            prisma.transaction.findMany({
                where: { 
                    blockTime: { gte: timeThreshold },
                    tokenAmount: { gt: 0 }
                },
                include: { destinationWallet: true }
            }),
            prisma.transaction.findMany({
                where: { 
                    blockTime: { gte: timeThreshold },
                    tokenAmount: { gt: 0 }
                },
                include: { sourceWallet: true }
            })
        ]);
        
        const flowMetrics = {
            total_buy_volume: 0,
            total_sell_volume: 0,
            net_flow: 0,
            buy_transactions: buyTx.length,
            sell_transactions: sellTx.length,
            unique_buyers: new Set(),
            unique_sellers: new Set(),
            whale_buy_volume: 0,
            whale_sell_volume: 0,
            retail_buy_volume: 0,
            retail_sell_volume: 0
        };
        
        // Analyze buy transactions
        buyTx.forEach(tx => {
            const volume = tx.tokenAmount || 0;
            flowMetrics.total_buy_volume += volume;
            flowMetrics.unique_buyers.add(tx.destinationWallet?.address);
            
            const percentage = (volume / this.TOTAL_TOKEN_SUPPLY) * 100;
            if (percentage >= 0.01) { // 0.01%+ is whale transaction
                flowMetrics.whale_buy_volume += volume;
            } else {
                flowMetrics.retail_buy_volume += volume;
            }
        });
        
        // Analyze sell transactions
        sellTx.forEach(tx => {
            const volume = tx.tokenAmount || 0;
            flowMetrics.total_sell_volume += volume;
            flowMetrics.unique_sellers.add(tx.sourceWallet?.address);
            
            const percentage = (volume / this.TOTAL_TOKEN_SUPPLY) * 100;
            if (percentage >= 0.01) { // 0.01%+ is whale transaction
                flowMetrics.whale_sell_volume += volume;
            } else {
                flowMetrics.retail_sell_volume += volume;
            }
        });
        
        flowMetrics.net_flow = flowMetrics.total_buy_volume - flowMetrics.total_sell_volume;
        flowMetrics.unique_buyers = flowMetrics.unique_buyers.size;
        flowMetrics.unique_sellers = flowMetrics.unique_sellers.size;
        
        return {
            flow_metrics: flowMetrics,
            market_pressure: {
                buy_pressure: flowMetrics.total_buy_volume / (flowMetrics.total_buy_volume + flowMetrics.total_sell_volume),
                sell_pressure: flowMetrics.total_sell_volume / (flowMetrics.total_buy_volume + flowMetrics.total_sell_volume),
                whale_dominance: {
                    buy: flowMetrics.whale_buy_volume / flowMetrics.total_buy_volume,
                    sell: flowMetrics.whale_sell_volume / flowMetrics.total_sell_volume
                }
            },
            flow_trend: this.analyzeFlowTrend(flowMetrics)
        };
    }
    
    /**
     * Get historical trends and patterns
     */
    async getHistoricalTrends(timeframe = '30d') {
        const daysBack = this.parseTimeframe(timeframe);
        const intervals = Math.min(daysBack, 30); // Max 30 data points
        const intervalSize = Math.floor((daysBack * 24 * 60 * 60) / intervals);
        
        const trends = [];
        const now = Math.floor(Date.now() / 1000);
        
        for (let i = intervals - 1; i >= 0; i--) {
            const periodEnd = now - (i * intervalSize);
            const periodStart = periodEnd - intervalSize;
            
            const [holders, totalVolume] = await Promise.all([
                this.getHolderCountAtTime(periodEnd),
                this.getVolumeInPeriod(periodStart, periodEnd)
            ]);
            
            trends.push({
                timestamp: new Date(periodEnd * 1000).toISOString(),
                holder_count: holders,
                total_volume: totalVolume,
                period_start: new Date(periodStart * 1000).toISOString(),
                period_end: new Date(periodEnd * 1000).toISOString()
            });
        }
        
        return {
            historical_data: trends,
            growth_metrics: this.calculateGrowthMetrics(trends),
            trend_analysis: this.analyzeTrends(trends)
        };
    }
    
    /**
     * Generate trading insights from all analysis data
     */
    generateTradingInsights(analysisData) {
        const insights = {
            bullish_signals: [],
            bearish_signals: [],
            neutral_signals: [],
            overall_sentiment: 'NEUTRAL',
            confidence_score: 0,
            key_levels: {
                support_levels: [],
                resistance_levels: []
            },
            trading_recommendations: []
        };
        
        const { whaleAnalysis, behaviorAnalysis, riskAnalysis, flowAnalysis } = analysisData;
        
        // Analyze whale behavior for signals
        if (whaleAnalysis.metrics) {
            const accumulating = whaleAnalysis.metrics.accumulating_whales;
            const distributing = whaleAnalysis.metrics.distributing_whales;
            
            if (accumulating > distributing * 2) {
                insights.bullish_signals.push({
                    signal: 'Whale Accumulation',
                    strength: 'HIGH',
                    description: `${accumulating} whales accumulating vs ${distributing} distributing`
                });
            } else if (distributing > accumulating * 2) {
                insights.bearish_signals.push({
                    signal: 'Whale Distribution',
                    strength: 'HIGH',
                    description: `${distributing} whales distributing vs ${accumulating} accumulating`
                });
            }
        }
        
        // Analyze flow for momentum
        if (flowAnalysis.flow_metrics) {
            const netFlow = flowAnalysis.flow_metrics.net_flow;
            if (netFlow > 0) {
                insights.bullish_signals.push({
                    signal: 'Positive Net Flow',
                    strength: 'MEDIUM',
                    description: `Net buying pressure of ${netFlow.toLocaleString()} tokens`
                });
            } else if (netFlow < 0) {
                insights.bearish_signals.push({
                    signal: 'Negative Net Flow',
                    strength: 'MEDIUM',
                    description: `Net selling pressure of ${Math.abs(netFlow).toLocaleString()} tokens`
                });
            }
        }
        
        // Calculate overall sentiment
        const bullishWeight = insights.bullish_signals.reduce((sum, s) => 
            sum + (s.strength === 'HIGH' ? 3 : s.strength === 'MEDIUM' ? 2 : 1), 0
        );
        const bearishWeight = insights.bearish_signals.reduce((sum, s) => 
            sum + (s.strength === 'HIGH' ? 3 : s.strength === 'MEDIUM' ? 2 : 1), 0
        );
        
        if (bullishWeight > bearishWeight * 1.5) {
            insights.overall_sentiment = 'BULLISH';
        } else if (bearishWeight > bullishWeight * 1.5) {
            insights.overall_sentiment = 'BEARISH';
        }
        
        insights.confidence_score = Math.min(
            (Math.abs(bullishWeight - bearishWeight) / Math.max(bullishWeight + bearishWeight, 1)) * 100,
            100
        );
        
        return insights;
    }
    
    // Helper methods
    getHolderTier(percentage) {
        for (const [key, tier] of Object.entries(this.HOLDER_TIERS)) {
            if (percentage >= tier.min) {
                return tier.name;
            }
        }
        return this.HOLDER_TIERS.CRAB.name;
    }
    
    parseTimeframe(timeframe) {
        const timeframeMap = {
            '1d': 1,
            '7d': 7,
            '30d': 30,
            '90d': 90
        };
        return timeframeMap[timeframe] || 30;
    }
    
    async getCurrentTokenPrice() {
        const latestPrice = await prisma.hourlyPrice.findFirst({
            orderBy: { timestamp: 'desc' }
        });
        return latestPrice?.price_usd || 0;
    }
    
    async getEnhancedHolders() {
        // This would use the cached holder data with enhanced analysis
        return await databaseCache.getCachedTokenHolders(1000) || [];
    }
    
    calculateTransactionImpact(amount, totalBalance) {
        const percentage = (amount / totalBalance) * 100;
        if (percentage > 50) return 'EXTREME';
        if (percentage > 20) return 'HIGH';
        if (percentage > 10) return 'MEDIUM';
        return 'LOW';
    }
    
    async analyzeBehaviorPattern(walletAddress, timeThreshold) {
        // Implement detailed behavior analysis
        return {
            pattern: this.BEHAVIOR_PATTERNS.TRADER,
            score: 0.5,
            risk_level: 'MEDIUM',
            total_volume: 0
        };
    }
    
    generateWhaleAlerts(movements, metrics) {
        const alerts = [];
        
        movements.forEach(whale => {
            if (whale.behavior === 'HEAVY_DISTRIBUTION' && whale.percentage_of_supply > 1) {
                alerts.push({
                    type: 'WHALE_DUMP_RISK',
                    severity: 'HIGH',
                    whale_address: whale.wallet_address,
                    message: `Mega whale (${whale.percentage_of_supply.toFixed(2)}%) showing heavy distribution`
                });
            }
        });
        
        return alerts;
    }
    
    generateBehaviorInsights(segments) {
        return {
            dominant_behavior: 'TRADER',
            market_maturity: 'DEVELOPING',
            holder_strength: 'MEDIUM'
        };
    }
    
    calculateMarketSentiment(segments) {
        return {
            sentiment_score: 0.5,
            sentiment_label: 'NEUTRAL',
            confidence: 0.7
        };
    }
    
    calculateOverallRiskScore(metrics) {
        return Math.min(
            (metrics.concentration_risk * 0.4 + 
             metrics.whale_dump_risk * 0.3 + 
             metrics.paper_hands_ratio * 0.3) / 100,
            1
        );
    }
    
    generateRiskRecommendations(metrics, indicators) {
        const recommendations = [];
        
        if (metrics.concentration_risk > 40) {
            recommendations.push({
                type: 'RISK_MANAGEMENT',
                action: 'Consider position sizing carefully due to high concentration risk',
                priority: 'HIGH'
            });
        }
        
        return recommendations;
    }
    
    analyzeFlowTrend(metrics) {
        if (metrics.net_flow > 0) {
            return {
                trend: 'BULLISH',
                strength: metrics.net_flow > metrics.total_buy_volume * 0.1 ? 'STRONG' : 'WEAK'
            };
        } else if (metrics.net_flow < 0) {
            return {
                trend: 'BEARISH',
                strength: Math.abs(metrics.net_flow) > metrics.total_sell_volume * 0.1 ? 'STRONG' : 'WEAK'
            };
        }
        return { trend: 'NEUTRAL', strength: 'WEAK' };
    }
    
    async getHolderCountAtTime(timestamp) {
        // Implement historical holder count lookup
        return 100;
    }
    
    async getVolumeInPeriod(start, end) {
        const transactions = await prisma.transaction.findMany({
            where: {
                blockTime: { gte: start, lte: end }
            }
        });
        
        return transactions.reduce((sum, tx) => sum + (tx.tokenAmount || 0), 0);
    }
    
    calculateGrowthMetrics(trends) {
        if (trends.length < 2) return {};
        
        const first = trends[0];
        const last = trends[trends.length - 1];
        
        return {
            holder_growth: ((last.holder_count - first.holder_count) / first.holder_count) * 100,
            volume_growth: ((last.total_volume - first.total_volume) / first.total_volume) * 100
        };
    }
    
    analyzeTrends(trends) {
        return {
            holder_trend: 'GROWING',
            volume_trend: 'INCREASING',
            momentum: 'POSITIVE'
        };
    }
}

module.exports = new AdvancedHolderAnalysisService();