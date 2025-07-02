const prisma = require('../utils/prismaClient');
const redisCache = require('./redisCacheService');
const databaseCache = require('./databaseCacheService');
const advancedHolderAnalysis = require('./advancedHolderAnalysisService');
const whaleTracking = require('./whaleTrackingService');

class TradingInsightsService {
    constructor() {
        this.TOTAL_SUPPLY = 1_000_000_000;
        this.INSIGHTS_CACHE_TTL = 900; // 15 minutes
        
        // Trading signal weights
        this.SIGNAL_WEIGHTS = {
            WHALE_ACCUMULATION: 0.25,
            WHALE_DISTRIBUTION: -0.25,
            VOLUME_SURGE: 0.15,
            NEW_MONEY_FLOW: 0.1,
            HOLDER_GROWTH: 0.1,
            CONCENTRATION_RISK: -0.15,
            PAPER_HANDS_EXIT: -0.1,
            WHALE_COORDINATION: -0.2
        };
        
        // Market regime classifications
        this.MARKET_REGIMES = {
            ACCUMULATION: 'Smart money accumulating, low volatility',
            DISTRIBUTION: 'Smart money distributing, potential top',
            MARKUP: 'Strong uptrend with healthy participation',
            MARKDOWN: 'Downtrend with selling pressure',
            CONSOLIDATION: 'Sideways movement, awaiting direction',
            MANIPULATION: 'Potential wash trading or manipulation'
        };
        
        // Risk levels for position sizing
        this.RISK_LEVELS = {
            VERY_LOW: { score: 0.2, sizing: '5-10%', description: 'Conservative entry' },
            LOW: { score: 0.4, sizing: '3-7%', description: 'Standard position' },
            MEDIUM: { score: 0.6, sizing: '2-5%', description: 'Reduced position' },
            HIGH: { score: 0.8, sizing: '1-3%', description: 'Small position only' },
            VERY_HIGH: { score: 1.0, sizing: '0-1%', description: 'Avoid or hedge' }
        };
    }
    
    /**
     * Generate comprehensive trading insights
     */
    async generateTradingInsights(timeframe = '24h') {
        const cacheKey = `trading_insights_${timeframe}`;
        
        // Try cache first
        let insights = await databaseCache.get(cacheKey);
        if (insights) {
            return insights;
        }
        
        console.log('[TRADING-INSIGHTS] Generating comprehensive trading insights...');
        const startTime = Date.now();
        
        try {
            const [
                holderAnalysis,
                whaleAnalysis,
                priceAnalysis,
                volumeAnalysis,
                sentimentAnalysis,
                riskAssessment,
                technicalSignals
            ] = await Promise.all([
                advancedHolderAnalysis.getComprehensiveHolderAnalysis({ timeframe }),
                whaleTracking.getWhaleAnalysis({ includeHistory: false }),
                this.analyzePriceAction(timeframe),
                this.analyzeVolumeProfile(timeframe),
                this.analyzeSentiment(),
                this.assessRisk(),
                this.generateTechnicalSignals(timeframe)
            ]);
            
            insights = {
                timestamp: new Date().toISOString(),
                timeframe,
                
                // Core Analysis
                market_regime: this.identifyMarketRegime(holderAnalysis, whaleAnalysis, priceAnalysis),
                overall_sentiment: this.calculateOverallSentiment(sentimentAnalysis, whaleAnalysis),
                risk_assessment: riskAssessment,
                
                // Trading Signals
                trading_signals: this.generateTradingSignals({
                    holderAnalysis,
                    whaleAnalysis,
                    priceAnalysis,
                    volumeAnalysis,
                    sentimentAnalysis
                }),
                
                // Key Metrics
                key_metrics: {
                    holder_strength: this.calculateHolderStrength(holderAnalysis),
                    whale_sentiment: whaleAnalysis.market_impact?.net_whale_sentiment || 'NEUTRAL',
                    concentration_risk: this.calculateConcentrationRisk(holderAnalysis),
                    liquidity_health: this.assessLiquidityHealth(volumeAnalysis),
                    momentum_score: this.calculateMomentumScore(priceAnalysis, volumeAnalysis)
                },
                
                // Actionable Insights
                position_sizing: this.recommendPositionSizing(riskAssessment),
                entry_levels: this.identifyEntryLevels(priceAnalysis, whaleAnalysis),
                exit_levels: this.identifyExitLevels(priceAnalysis, whaleAnalysis),
                stop_loss_levels: this.calculateStopLossLevels(priceAnalysis, riskAssessment),
                
                // Alerts and Warnings
                alerts: this.generateTradingAlerts({
                    holderAnalysis,
                    whaleAnalysis,
                    priceAnalysis,
                    riskAssessment
                }),
                
                // Market Structure
                market_structure: {
                    support_levels: this.identifySupportLevels(priceAnalysis),
                    resistance_levels: this.identifyResistanceLevels(priceAnalysis),
                    key_whale_levels: this.identifyWhaleAccumulationLevels(whaleAnalysis),
                    volume_profile: volumeAnalysis.profile
                },
                
                // Performance Metrics
                performance: {
                    analysis_time_ms: Date.now() - startTime,
                    data_quality_score: this.calculateDataQuality(holderAnalysis, whaleAnalysis),
                    confidence_level: this.calculateConfidenceLevel(insights)
                }
            };
            
            // Cache for 15 minutes
            await databaseCache.set(cacheKey, insights, this.INSIGHTS_CACHE_TTL);
            
            console.log(`[TRADING-INSIGHTS] Generated insights in ${Date.now() - startTime}ms`);
            return insights;
            
        } catch (error) {
            console.error(`[TRADING-INSIGHTS] Error: ${error.message}`);
            throw new Error(`Failed to generate trading insights: ${error.message}`);
        }
    }
    
    /**
     * Analyze price action and trends
     */
    async analyzePriceAction(timeframe = '24h') {
        const hours = this.parseTimeframe(timeframe);
        const timeThreshold = Math.floor(Date.now() / 1000) - (hours * 60 * 60);
        
        // Get recent price data
        const priceData = await prisma.hourlyPrice.findMany({
            where: { timestamp: { gte: timeThreshold } },
            orderBy: { timestamp: 'asc' }
        });
        
        if (priceData.length < 2) {
            return { trend: 'INSUFFICIENT_DATA', strength: 0 };
        }
        
        const prices = priceData.map(p => p.price_usd);
        const volumes = await this.getVolumeData(timeThreshold);
        
        return {
            current_price: prices[prices.length - 1],
            price_change: prices[prices.length - 1] - prices[0],
            price_change_percentage: ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100,
            high: Math.max(...prices),
            low: Math.min(...prices),
            
            // Trend analysis
            trend: this.calculateTrend(prices),
            trend_strength: this.calculateTrendStrength(prices),
            momentum: this.calculateMomentum(prices),
            
            // Technical indicators
            sma_20: this.calculateSMA(prices, Math.min(20, prices.length)),
            rsi: this.calculateRSI(prices),
            volatility: this.calculateVolatility(prices),
            
            // Volume-price analysis
            volume_trend: this.analyzeVolumePrice(prices, volumes),
            breakout_potential: this.assessBreakoutPotential(prices, volumes)
        };
    }
    
    /**
     * Analyze volume profile and distribution
     */
    async analyzeVolumeProfile(timeframe = '24h') {
        const hours = this.parseTimeframe(timeframe);
        const timeThreshold = Math.floor(Date.now() / 1000) - (hours * 60 * 60);
        
        const transactions = await prisma.transaction.findMany({
            where: { blockTime: { gte: timeThreshold } },
            orderBy: { blockTime: 'asc' }
        });
        
        const volumeByHour = this.groupVolumeByHour(transactions);
        const volumeBySize = this.analyzeTransactionSizes(transactions);
        
        return {
            total_volume: transactions.reduce((sum, tx) => sum + (tx.tokenAmount || 0), 0),
            transaction_count: transactions.length,
            average_transaction_size: transactions.length > 0 ? 
                transactions.reduce((sum, tx) => sum + (tx.tokenAmount || 0), 0) / transactions.length : 0,
            
            // Volume distribution
            volume_by_hour: volumeByHour,
            volume_by_size: volumeBySize,
            
            // Volume analysis
            volume_trend: this.calculateVolumeTrend(volumeByHour),
            whale_volume_ratio: this.calculateWhaleVolumeRatio(transactions),
            retail_participation: this.calculateRetailParticipation(transactions),
            
            // Profile data for charts
            profile: this.createVolumeProfile(transactions)
        };
    }
    
    /**
     * Analyze market sentiment from various sources
     */
    async analyzeSentiment() {
        const [
            holderSentiment,
            whaleSentiment,
            transactionSentiment,
            concentrationSentiment
        ] = await Promise.all([
            this.analyzeHolderSentiment(),
            this.analyzeWhaleSentiment(),
            this.analyzeTransactionSentiment(),
            this.analyzeConcentrationSentiment()
        ]);
        
        const overallScore = (
            holderSentiment.score * 0.3 +
            whaleSentiment.score * 0.4 +
            transactionSentiment.score * 0.2 +
            concentrationSentiment.score * 0.1
        );
        
        return {
            overall_sentiment: this.scoreToSentiment(overallScore),
            overall_score: overallScore,
            confidence: this.calculateSentimentConfidence([
                holderSentiment, whaleSentiment, transactionSentiment, concentrationSentiment
            ]),
            
            components: {
                holder_sentiment: holderSentiment,
                whale_sentiment: whaleSentiment,
                transaction_sentiment: transactionSentiment,
                concentration_sentiment: concentrationSentiment
            },
            
            sentiment_shifts: this.detectSentimentShifts(overallScore),
            market_fear_greed: this.calculateFearGreedIndex(overallScore)
        };
    }
    
    /**
     * Assess overall market risk
     */
    async assessRisk() {
        const [
            concentrationRisk,
            liquidityRisk,
            whaleRisk,
            volatilityRisk,
            marketRisk
        ] = await Promise.all([
            this.calculateConcentrationRisk(),
            this.calculateLiquidityRisk(),
            this.calculateWhaleRisk(),
            this.calculateVolatilityRisk(),
            this.calculateMarketRisk()
        ]);
        
        const overallRiskScore = (
            concentrationRisk * 0.25 +
            liquidityRisk * 0.2 +
            whaleRisk * 0.3 +
            volatilityRisk * 0.15 +
            marketRisk * 0.1
        );
        
        return {
            overall_risk: this.scoreToRiskLevel(overallRiskScore),
            overall_score: overallRiskScore,
            
            risk_components: {
                concentration_risk: concentrationRisk,
                liquidity_risk: liquidityRisk,
                whale_risk: whaleRisk,
                volatility_risk: volatilityRisk,
                market_risk: marketRisk
            },
            
            risk_factors: this.identifyRiskFactors(overallRiskScore),
            mitigation_strategies: this.suggestRiskMitigation(overallRiskScore)
        };
    }
    
    /**
     * Generate technical trading signals
     */
    async generateTechnicalSignals(timeframe = '24h') {
        const priceAnalysis = await this.analyzePriceAction(timeframe);
        const volumeAnalysis = await this.analyzeVolumeProfile(timeframe);
        
        const signals = [];
        
        // Price momentum signals
        if (priceAnalysis.momentum > 0.7 && priceAnalysis.volume_trend === 'INCREASING') {
            signals.push({
                type: 'BULLISH_MOMENTUM',
                strength: 'STRONG',
                confidence: 0.8,
                description: 'Strong upward momentum with increasing volume'
            });
        }
        
        // Volume divergence signals
        if (priceAnalysis.trend === 'BULLISH' && volumeAnalysis.volume_trend === 'DECREASING') {
            signals.push({
                type: 'BEARISH_DIVERGENCE',
                strength: 'MEDIUM',
                confidence: 0.6,
                description: 'Price rising but volume declining - potential weakness'
            });
        }
        
        // RSI signals
        if (priceAnalysis.rsi > 70) {
            signals.push({
                type: 'OVERBOUGHT',
                strength: 'MEDIUM',
                confidence: 0.7,
                description: 'RSI indicates overbought conditions'
            });
        } else if (priceAnalysis.rsi < 30) {
            signals.push({
                type: 'OVERSOLD',
                strength: 'MEDIUM',
                confidence: 0.7,
                description: 'RSI indicates oversold conditions'
            });
        }
        
        return {
            signals,
            signal_summary: this.summarizeSignals(signals),
            market_bias: this.calculateMarketBias(signals)
        };
    }
    
    /**
     * Identify market regime
     */
    identifyMarketRegime(holderAnalysis, whaleAnalysis, priceAnalysis) {
        const whaleAccumulating = whaleAnalysis.market_impact?.accumulating_whales || 0;
        const whaleDistributing = whaleAnalysis.market_impact?.distributing_whales || 0;
        const priceVolatility = priceAnalysis.volatility || 0;
        const priceChange = priceAnalysis.price_change_percentage || 0;
        
        if (whaleAccumulating > whaleDistributing && priceVolatility < 0.05) {
            return {
                regime: 'ACCUMULATION',
                description: this.MARKET_REGIMES.ACCUMULATION,
                confidence: 0.8
            };
        } else if (whaleDistributing > whaleAccumulating && priceChange > 10) {
            return {
                regime: 'DISTRIBUTION',
                description: this.MARKET_REGIMES.DISTRIBUTION,
                confidence: 0.7
            };
        } else if (priceChange > 20 && priceVolatility > 0.1) {
            return {
                regime: 'MARKUP',
                description: this.MARKET_REGIMES.MARKUP,
                confidence: 0.6
            };
        } else if (priceChange < -20) {
            return {
                regime: 'MARKDOWN',
                description: this.MARKET_REGIMES.MARKDOWN,
                confidence: 0.7
            };
        } else {
            return {
                regime: 'CONSOLIDATION',
                description: this.MARKET_REGIMES.CONSOLIDATION,
                confidence: 0.5
            };
        }
    }
    
    /**
     * Generate actionable trading signals
     */
    generateTradingSignals(analysisData) {
        const signals = [];
        let overallScore = 0;
        
        const { holderAnalysis, whaleAnalysis, priceAnalysis, volumeAnalysis, sentimentAnalysis } = analysisData;
        
        // Whale accumulation/distribution signals
        const whaleNet = (whaleAnalysis.market_impact?.accumulating_whales || 0) - 
                         (whaleAnalysis.market_impact?.distributing_whales || 0);
        
        if (whaleNet > 2) {
            signals.push({
                type: 'WHALE_ACCUMULATION',
                direction: 'BULLISH',
                strength: 'HIGH',
                weight: this.SIGNAL_WEIGHTS.WHALE_ACCUMULATION,
                message: `${whaleAnalysis.market_impact?.accumulating_whales} whales accumulating`
            });
            overallScore += this.SIGNAL_WEIGHTS.WHALE_ACCUMULATION;
        } else if (whaleNet < -2) {
            signals.push({
                type: 'WHALE_DISTRIBUTION',
                direction: 'BEARISH',
                strength: 'HIGH',
                weight: this.SIGNAL_WEIGHTS.WHALE_DISTRIBUTION,
                message: `${whaleAnalysis.market_impact?.distributing_whales} whales distributing`
            });
            overallScore += this.SIGNAL_WEIGHTS.WHALE_DISTRIBUTION;
        }
        
        // Volume signals
        if (volumeAnalysis.volume_trend === 'INCREASING' && priceAnalysis.trend === 'BULLISH') {
            signals.push({
                type: 'VOLUME_CONFIRMATION',
                direction: 'BULLISH',
                strength: 'MEDIUM',
                weight: this.SIGNAL_WEIGHTS.VOLUME_SURGE,
                message: 'Volume confirming price uptrend'
            });
            overallScore += this.SIGNAL_WEIGHTS.VOLUME_SURGE;
        }
        
        // Risk signals
        const concentrationRisk = holderAnalysis.concentration_metrics?.concentration_ratio?.top_10 || 0;
        if (concentrationRisk > 50) {
            signals.push({
                type: 'HIGH_CONCENTRATION_RISK',
                direction: 'BEARISH',
                strength: 'MEDIUM',
                weight: this.SIGNAL_WEIGHTS.CONCENTRATION_RISK,
                message: `High concentration risk: top 10 hold ${concentrationRisk.toFixed(1)}%`
            });
            overallScore += this.SIGNAL_WEIGHTS.CONCENTRATION_RISK;
        }
        
        return {
            signals,
            overall_score: overallScore,
            overall_direction: overallScore > 0.1 ? 'BULLISH' : overallScore < -0.1 ? 'BEARISH' : 'NEUTRAL',
            signal_strength: Math.abs(overallScore) > 0.3 ? 'STRONG' : 
                           Math.abs(overallScore) > 0.1 ? 'MEDIUM' : 'WEAK',
            confidence: this.calculateSignalConfidence(signals)
        };
    }
    
    // Helper methods (implementations would be more detailed in production)
    parseTimeframe(timeframe) {
        const map = { '1h': 1, '4h': 4, '24h': 24, '7d': 168, '30d': 720 };
        return map[timeframe] || 24;
    }
    
    calculateTrend(prices) {
        if (prices.length < 2) return 'NEUTRAL';
        const start = prices[0];
        const end = prices[prices.length - 1];
        const change = (end - start) / start;
        
        if (change > 0.05) return 'BULLISH';
        if (change < -0.05) return 'BEARISH';
        return 'NEUTRAL';
    }
    
    calculateTrendStrength(prices) {
        // Simplified trend strength calculation
        if (prices.length < 2) return 0;
        const change = Math.abs((prices[prices.length - 1] - prices[0]) / prices[0]);
        return Math.min(change * 10, 1); // Normalize to 0-1
    }
    
    calculateMomentum(prices) {
        // Simplified momentum calculation
        if (prices.length < 3) return 0;
        const recent = prices.slice(-Math.min(5, prices.length));
        const recentChange = (recent[recent.length - 1] - recent[0]) / recent[0];
        return Math.max(-1, Math.min(1, recentChange * 20));
    }
    
    calculateSMA(prices, period) {
        if (prices.length < period) return prices[prices.length - 1];
        const recent = prices.slice(-period);
        return recent.reduce((sum, price) => sum + price, 0) / recent.length;
    }
    
    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return 50; // Neutral RSI
        
        const changes = [];
        for (let i = 1; i < prices.length; i++) {
            changes.push(prices[i] - prices[i - 1]);
        }
        
        const recentChanges = changes.slice(-period);
        const gains = recentChanges.filter(change => change > 0);
        const losses = recentChanges.filter(change => change < 0).map(loss => Math.abs(loss));
        
        const avgGain = gains.length > 0 ? gains.reduce((sum, gain) => sum + gain, 0) / gains.length : 0;
        const avgLoss = losses.length > 0 ? losses.reduce((sum, loss) => sum + loss, 0) / losses.length : 0;
        
        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }
    
    calculateVolatility(prices) {
        if (prices.length < 2) return 0;
        
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
        
        const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
        
        return Math.sqrt(variance);
    }
    
    scoreToSentiment(score) {
        if (score > 0.7) return 'VERY_BULLISH';
        if (score > 0.3) return 'BULLISH';
        if (score > -0.3) return 'NEUTRAL';
        if (score > -0.7) return 'BEARISH';
        return 'VERY_BEARISH';
    }
    
    scoreToRiskLevel(score) {
        if (score > 0.8) return 'VERY_HIGH';
        if (score > 0.6) return 'HIGH';
        if (score > 0.4) return 'MEDIUM';
        if (score > 0.2) return 'LOW';
        return 'VERY_LOW';
    }
    
    // Placeholder implementations for complex methods
    async getVolumeData(timeThreshold) { return []; }
    groupVolumeByHour(transactions) { return {}; }
    analyzeTransactionSizes(transactions) { return {}; }
    calculateVolumeTrend(volumeByHour) { return 'NEUTRAL'; }
    calculateWhaleVolumeRatio(transactions) { return 0.5; }
    calculateRetailParticipation(transactions) { return 0.5; }
    createVolumeProfile(transactions) { return {}; }
    analyzeVolumePrice(prices, volumes) { return 'NEUTRAL'; }
    assessBreakoutPotential(prices, volumes) { return 0.5; }
    
    async analyzeHolderSentiment() { return { score: 0.5, confidence: 0.7 }; }
    async analyzeWhaleSentiment() { return { score: 0.5, confidence: 0.8 }; }
    async analyzeTransactionSentiment() { return { score: 0.5, confidence: 0.6 }; }
    async analyzeConcentrationSentiment() { return { score: 0.5, confidence: 0.7 }; }
    
    calculateSentimentConfidence(components) { return 0.7; }
    detectSentimentShifts(score) { return []; }
    calculateFearGreedIndex(score) { return 50; }
    
    async calculateConcentrationRisk() { return 0.5; }
    async calculateLiquidityRisk() { return 0.3; }
    async calculateWhaleRisk() { return 0.4; }
    async calculateVolatilityRisk() { return 0.3; }
    async calculateMarketRisk() { return 0.2; }
    
    identifyRiskFactors(score) { return []; }
    suggestRiskMitigation(score) { return []; }
    
    calculateOverallSentiment(sentiment, whales) { return 'NEUTRAL'; }
    calculateHolderStrength(analysis) { return 0.7; }
    calculateConcentrationRisk(analysis) { return 0.5; }
    assessLiquidityHealth(volume) { return 'GOOD'; }
    calculateMomentumScore(price, volume) { return 0.6; }
    
    recommendPositionSizing(risk) { 
        return {
            recommended_size: '3-5%',
            risk_level: risk.overall_risk,
            justification: 'Based on current risk assessment'
        };
    }
    
    identifyEntryLevels(price, whales) { return []; }
    identifyExitLevels(price, whales) { return []; }
    calculateStopLossLevels(price, risk) { return []; }
    
    generateTradingAlerts(data) { return []; }
    
    identifySupportLevels(price) { return []; }
    identifyResistanceLevels(price) { return []; }
    identifyWhaleAccumulationLevels(whales) { return []; }
    
    calculateDataQuality(holder, whale) { return 0.8; }
    calculateConfidenceLevel(insights) { return 0.7; }
    
    summarizeSignals(signals) { return 'Mixed signals'; }
    calculateMarketBias(signals) { return 'NEUTRAL'; }
    calculateSignalConfidence(signals) { return 0.7; }
}

module.exports = new TradingInsightsService();