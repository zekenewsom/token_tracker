const prisma = require('../utils/prismaClient');
const axios = require('axios');
const redisCache = require('./redisCacheService');
const databaseCache = require('./databaseCacheService');

class MarketDataService {
    constructor() {
        this.TOKEN_MINT = '2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump';
        this.COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
        this.MARKET_DATA_CACHE_TTL = 300; // 5 minutes
        
        // Price change thresholds for alerts
        this.PRICE_CHANGE_THRESHOLDS = {
            MINOR: 5,   // 5%
            MODERATE: 15, // 15%
            MAJOR: 30,  // 30%
            EXTREME: 50 // 50%
        };
        
        // Volume spike thresholds
        this.VOLUME_SPIKE_THRESHOLDS = {
            NORMAL: 1.5,   // 1.5x normal volume
            HIGH: 3.0,     // 3x normal volume
            EXTREME: 10.0  // 10x normal volume
        };
    }
    
    /**
     * Get comprehensive market data for trading analysis
     */
    async getMarketData(timeframe = '24h') {
        const cacheKey = `market_data_${timeframe}`;
        
        // Try cache first
        let marketData = await databaseCache.get(cacheKey);
        if (marketData) {
            return marketData;
        }
        
        console.log(`[MARKET-DATA] Fetching market data for ${timeframe}`);
        
        try {
            const [
                priceData,
                volumeData,
                technicalIndicators,
                liquidityMetrics,
                marketMetrics
            ] = await Promise.all([
                this.getPriceData(timeframe),
                this.getVolumeData(timeframe),
                this.calculateTechnicalIndicators(timeframe),
                this.getLiquidityMetrics(),
                this.getMarketMetrics()
            ]);
            
            marketData = {
                timestamp: new Date().toISOString(),
                timeframe,
                
                // Core price data
                price_data: priceData,
                
                // Volume analysis
                volume_data: volumeData,
                
                // Technical analysis
                technical_indicators: technicalIndicators,
                
                // Liquidity analysis
                liquidity_metrics: liquidityMetrics,
                
                // Market-wide metrics
                market_metrics: marketMetrics,
                
                // Trading signals from market data
                market_signals: this.generateMarketSignals({
                    priceData,
                    volumeData,
                    technicalIndicators
                }),
                
                // Key levels for trading
                key_levels: this.identifyKeyLevels(priceData, volumeData),
                
                // Market health assessment
                market_health: this.assessMarketHealth({
                    priceData,
                    volumeData,
                    liquidityMetrics
                })
            };
            
            // Cache for 5 minutes
            await databaseCache.set(cacheKey, marketData, this.MARKET_DATA_CACHE_TTL);
            
            return marketData;
            
        } catch (error) {
            console.error(`[MARKET-DATA] Error fetching market data: ${error.message}`);
            throw new Error(`Failed to fetch market data: ${error.message}`);
        }
    }
    
    /**
     * Get detailed price data and analysis
     */
    async getPriceData(timeframe = '24h') {
        const hours = this.parseTimeframe(timeframe);
        const timeThreshold = Math.floor(Date.now() / 1000) - (hours * 60 * 60);
        
        // Get price data from database
        let priceEntries = await prisma.hourlyPrice.findMany({
            where: { timestamp: { gte: timeThreshold } },
            orderBy: { timestamp: 'asc' }
        });
        
        // If no data in timeframe, get the most recent data available
        if (priceEntries.length === 0) {
            console.log(`[MARKET-DATA] No price data in last ${hours}h, using most recent available data`);
            priceEntries = await prisma.hourlyPrice.findMany({
                orderBy: { timestamp: 'desc' },
                take: Math.min(hours, 168) // Use last week's data as maximum
            });
            
            if (priceEntries.length === 0) {
                throw new Error('No price data available in database');
            }
            
            // Reverse to get chronological order
            priceEntries.reverse();
        }
        
        const prices = priceEntries.map(p => p.price_usd);
        const currentPrice = prices[prices.length - 1];
        const openPrice = prices[0];
        
        // Calculate price metrics
        const priceChange = currentPrice - openPrice;
        const priceChangePercent = (priceChange / openPrice) * 100;
        const high = Math.max(...prices);
        const low = Math.min(...prices);
        const range = high - low;
        const volatility = this.calculateVolatility(prices);
        
        // Price action analysis
        const priceAction = this.analyzePriceAction(priceEntries);
        
        return {
            current_price: currentPrice,
            open_price: openPrice,
            high_price: high,
            low_price: low,
            price_change: priceChange,
            price_change_percent: priceChangePercent,
            price_range: range,
            volatility: volatility,
            
            // Price action insights
            price_action: priceAction,
            
            // Historical data for charts
            historical_prices: priceEntries.map(entry => ({
                timestamp: new Date(entry.timestamp * 1000).toISOString(),
                price: entry.price_usd,
                unix_timestamp: entry.timestamp
            })),
            
            // Price levels
            resistance_levels: this.findResistanceLevels(prices),
            support_levels: this.findSupportLevels(prices),
            
            // Price alerts
            price_alerts: this.generatePriceAlerts(priceChangePercent, volatility)
        };
    }
    
    /**
     * Get comprehensive volume data
     */
    async getVolumeData(timeframe = '24h') {
        const hours = this.parseTimeframe(timeframe);
        const timeThreshold = Math.floor(Date.now() / 1000) - (hours * 60 * 60);
        
        // Get transaction data for volume analysis
        const transactions = await prisma.transaction.findMany({
            where: { 
                blockTime: { gte: timeThreshold },
                tokenAmount: { gt: 0 }
            },
            orderBy: { blockTime: 'asc' }
        });
        
        // Calculate volume metrics
        const totalVolume = transactions.reduce((sum, tx) => sum + (tx.tokenAmount || 0), 0);
        const averageTransactionSize = totalVolume / transactions.length;
        const volumeByHour = this.groupVolumeByHour(transactions, hours);
        
        // Volume analysis
        const volumeAnalysis = this.analyzeVolumePatterns(volumeByHour);
        const volumeSpikes = this.detectVolumeSpikes(volumeByHour);
        
        return {
            total_volume: totalVolume,
            transaction_count: transactions.length,
            average_transaction_size: averageTransactionSize,
            
            // Volume distribution
            volume_by_hour: volumeByHour,
            large_transactions: transactions.filter(tx => tx.tokenAmount > averageTransactionSize * 5).length,
            
            // Volume analysis
            volume_trend: volumeAnalysis.trend,
            volume_momentum: volumeAnalysis.momentum,
            volume_spikes: volumeSpikes,
            
            // Volume profile for trading
            volume_profile: this.createVolumeProfile(transactions),
            
            // VWAP (Volume Weighted Average Price)
            vwap: this.calculateVWAP(transactions),
            
            // Volume alerts
            volume_alerts: this.generateVolumeAlerts(volumeSpikes, volumeAnalysis)
        };
    }
    
    /**
     * Calculate technical indicators
     */
    async calculateTechnicalIndicators(timeframe = '24h') {
        const hours = this.parseTimeframe(timeframe);
        const timeThreshold = Math.floor(Date.now() / 1000) - (hours * 60 * 60);
        
        const priceData = await prisma.hourlyPrice.findMany({
            where: { timestamp: { gte: timeThreshold } },
            orderBy: { timestamp: 'asc' }
        });
        
        const prices = priceData.map(p => p.price_usd);
        
        if (prices.length < 20) {
            return { error: 'Insufficient data for technical indicators' };
        }
        
        return {
            // Moving averages
            sma_20: this.calculateSMA(prices, 20),
            sma_50: this.calculateSMA(prices, Math.min(50, prices.length)),
            ema_12: this.calculateEMA(prices, 12),
            ema_26: this.calculateEMA(prices, 26),
            
            // Momentum indicators
            rsi: this.calculateRSI(prices),
            macd: this.calculateMACD(prices),
            stochastic: this.calculateStochastic(priceData),
            
            // Volatility indicators
            bollinger_bands: this.calculateBollingerBands(prices),
            atr: this.calculateATR(priceData),
            
            // Trend indicators
            adx: this.calculateADX(priceData),
            parabolic_sar: this.calculateParabolicSAR(priceData),
            
            // Volume indicators
            obv: this.calculateOBV(priceData),
            
            // Interpretation
            signal_summary: this.interpretTechnicalSignals({
                rsi: this.calculateRSI(prices),
                macd: this.calculateMACD(prices),
                sma_20: this.calculateSMA(prices, 20),
                current_price: prices[prices.length - 1]
            })
        };
    }
    
    /**
     * Get liquidity metrics
     */
    async getLiquidityMetrics() {
        // This would integrate with DEX APIs to get real liquidity data
        // For now, we'll estimate based on transaction patterns
        
        const recentTx = await prisma.transaction.findMany({
            where: { 
                blockTime: { gte: Math.floor(Date.now() / 1000) - 3600 } // Last hour
            },
            orderBy: { blockTime: 'desc' },
            take: 100
        });
        
        const avgTransactionSize = recentTx.reduce((sum, tx) => sum + (tx.tokenAmount || 0), 0) / recentTx.length;
        const largeTransactionThreshold = avgTransactionSize * 10;
        const largeTransactions = recentTx.filter(tx => tx.tokenAmount > largeTransactionThreshold);
        
        return {
            recent_transaction_count: recentTx.length,
            average_transaction_size: avgTransactionSize,
            large_transaction_count: largeTransactions.length,
            
            // Liquidity estimates
            estimated_liquidity_depth: this.estimateLiquidityDepth(recentTx),
            market_impact_estimate: this.estimateMarketImpact(avgTransactionSize),
            
            // Liquidity health
            liquidity_score: this.calculateLiquidityScore(recentTx),
            liquidity_trend: this.analyzeLiquidityTrend(recentTx)
        };
    }
    
    /**
     * Get broader market metrics
     */
    async getMarketMetrics() {
        try {
            // This would fetch broader crypto market data
            // For now, return placeholder data
            
            return {
                bitcoin_correlation: 0.65, // Estimated correlation with BTC
                market_dominance: 0.001,   // Estimated market dominance
                relative_strength: 1.2,   // Relative to broader market
                
                // Market sentiment indicators
                fear_greed_index: 50,     // Neutral
                funding_rates: 0.01,     // Estimated funding rate
                
                // Broader market context
                crypto_market_cap: 2500000000000, // $2.5T (example)
                bitcoin_price: 45000,    // Example BTC price
                market_trend: 'SIDEWAYS' // Overall market trend
            };
            
        } catch (error) {
            console.error(`[MARKET-DATA] Error fetching market metrics: ${error.message}`);
            return {
                error: 'Failed to fetch market metrics',
                bitcoin_correlation: 0,
                market_dominance: 0,
                relative_strength: 1
            };
        }
    }
    
    /**
     * Generate market-based trading signals
     */
    generateMarketSignals(data) {
        const signals = [];
        const { priceData, volumeData, technicalIndicators } = data;
        
        // Price momentum signals
        if (priceData.price_change_percent > 10 && volumeData.volume_trend === 'INCREASING') {
            signals.push({
                type: 'BULLISH_BREAKOUT',
                strength: 'HIGH',
                confidence: 0.8,
                message: `Price up ${priceData.price_change_percent.toFixed(1)}% with increasing volume`
            });
        }
        
        // Technical indicator signals
        if (technicalIndicators.rsi > 70) {
            signals.push({
                type: 'OVERBOUGHT_WARNING',
                strength: 'MEDIUM',
                confidence: 0.7,
                message: `RSI at ${technicalIndicators.rsi.toFixed(1)} indicates overbought conditions`
            });
        } else if (technicalIndicators.rsi < 30) {
            signals.push({
                type: 'OVERSOLD_OPPORTUNITY',
                strength: 'MEDIUM',
                confidence: 0.7,
                message: `RSI at ${technicalIndicators.rsi.toFixed(1)} indicates oversold conditions`
            });
        }
        
        // Volume divergence signals
        if (priceData.price_change_percent > 5 && volumeData.volume_trend === 'DECREASING') {
            signals.push({
                type: 'BEARISH_DIVERGENCE',
                strength: 'MEDIUM',
                confidence: 0.6,
                message: 'Price rising but volume declining - potential weakness'
            });
        }
        
        return {
            signals,
            signal_count: signals.length,
            bullish_signals: signals.filter(s => s.type.includes('BULLISH') || s.type.includes('OPPORTUNITY')).length,
            bearish_signals: signals.filter(s => s.type.includes('BEARISH') || s.type.includes('WARNING')).length
        };
    }
    
    /**
     * Identify key price levels for trading
     */
    identifyKeyLevels(priceData, volumeData) {
        const prices = priceData.historical_prices.map(p => p.price);
        const currentPrice = priceData.current_price;
        
        return {
            immediate_support: this.findNearestSupport(currentPrice, prices),
            immediate_resistance: this.findNearestResistance(currentPrice, prices),
            
            major_support_levels: priceData.support_levels,
            major_resistance_levels: priceData.resistance_levels,
            
            // Volume-based levels
            high_volume_nodes: this.findHighVolumeNodes(volumeData.volume_profile),
            
            // Dynamic levels
            daily_pivot: this.calculatePivotPoint(priceData),
            vwap_level: volumeData.vwap
        };
    }
    
    /**
     * Assess overall market health
     */
    assessMarketHealth(data) {
        const { priceData, volumeData, liquidityMetrics } = data;
        
        let healthScore = 50; // Start neutral
        const healthFactors = [];
        
        // Price stability assessment
        if (priceData.volatility < 0.05) {
            healthScore += 10;
            healthFactors.push({ factor: 'Low volatility', impact: +10 });
        } else if (priceData.volatility > 0.2) {
            healthScore -= 15;
            healthFactors.push({ factor: 'High volatility', impact: -15 });
        }
        
        // Volume health
        if (volumeData.volume_trend === 'INCREASING') {
            healthScore += 15;
            healthFactors.push({ factor: 'Increasing volume', impact: +15 });
        } else if (volumeData.volume_trend === 'DECREASING') {
            healthScore -= 10;
            healthFactors.push({ factor: 'Decreasing volume', impact: -10 });
        }
        
        // Liquidity assessment
        if (liquidityMetrics.liquidity_score > 0.7) {
            healthScore += 10;
            healthFactors.push({ factor: 'Good liquidity', impact: +10 });
        } else if (liquidityMetrics.liquidity_score < 0.3) {
            healthScore -= 15;
            healthFactors.push({ factor: 'Poor liquidity', impact: -15 });
        }
        
        healthScore = Math.max(0, Math.min(100, healthScore));
        
        return {
            health_score: healthScore,
            health_rating: this.scoreToHealthRating(healthScore),
            health_factors: healthFactors,
            
            key_concerns: this.identifyHealthConcerns(data),
            positive_indicators: this.identifyPositiveIndicators(data),
            
            trading_recommendation: this.generateHealthBasedRecommendation(healthScore)
        };
    }
    
    // Helper methods (simplified implementations)
    parseTimeframe(timeframe) {
        const map = { '1h': 1, '4h': 4, '24h': 24, '7d': 168, '30d': 720 };
        return map[timeframe] || 24;
    }
    
    calculateVolatility(prices) {
        if (prices.length < 2) return 0;
        
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i-1]) / prices[i-1]);
        }
        
        const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
        
        return Math.sqrt(variance);
    }
    
    analyzePriceAction(priceEntries) {
        // Simplified price action analysis
        const prices = priceEntries.map(p => p.price_usd);
        const trend = this.calculateTrend(prices);
        
        return {
            trend,
            trend_strength: this.calculateTrendStrength(prices),
            momentum: this.calculateMomentum(prices),
            pattern: this.identifyPattern(prices)
        };
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
        if (prices.length < 2) return 0;
        const change = Math.abs((prices[prices.length - 1] - prices[0]) / prices[0]);
        return Math.min(change * 10, 1);
    }
    
    calculateMomentum(prices) {
        if (prices.length < 3) return 0;
        const recent = prices.slice(-Math.min(5, prices.length));
        const recentChange = (recent[recent.length - 1] - recent[0]) / recent[0];
        return Math.max(-1, Math.min(1, recentChange * 20));
    }
    
    identifyPattern(prices) {
        // Simplified pattern recognition
        if (prices.length < 10) return 'INSUFFICIENT_DATA';
        
        const recent = prices.slice(-10);
        const highs = recent.filter((price, i) => i > 0 && i < recent.length - 1 && 
                                   price > recent[i-1] && price > recent[i+1]);
        const lows = recent.filter((price, i) => i > 0 && i < recent.length - 1 && 
                                  price < recent[i-1] && price < recent[i+1]);
        
        if (highs.length >= 2 && lows.length >= 2) return 'CONSOLIDATION';
        if (recent[recent.length - 1] > recent[0] * 1.1) return 'UPTREND';
        if (recent[recent.length - 1] < recent[0] * 0.9) return 'DOWNTREND';
        
        return 'SIDEWAYS';
    }
    
    findResistanceLevels(prices) {
        // Simplified resistance level detection
        const sortedPrices = [...prices].sort((a, b) => b - a);
        return sortedPrices.slice(0, 3); // Top 3 prices as resistance
    }
    
    findSupportLevels(prices) {
        // Simplified support level detection
        const sortedPrices = [...prices].sort((a, b) => a - b);
        return sortedPrices.slice(0, 3); // Bottom 3 prices as support
    }
    
    generatePriceAlerts(priceChangePercent, volatility) {
        const alerts = [];
        
        if (Math.abs(priceChangePercent) > this.PRICE_CHANGE_THRESHOLDS.EXTREME) {
            alerts.push({
                type: 'EXTREME_PRICE_MOVEMENT',
                severity: 'HIGH',
                message: `Extreme price movement: ${priceChangePercent.toFixed(1)}%`
            });
        } else if (Math.abs(priceChangePercent) > this.PRICE_CHANGE_THRESHOLDS.MAJOR) {
            alerts.push({
                type: 'MAJOR_PRICE_MOVEMENT',
                severity: 'MEDIUM',
                message: `Major price movement: ${priceChangePercent.toFixed(1)}%`
            });
        }
        
        if (volatility > 0.3) {
            alerts.push({
                type: 'HIGH_VOLATILITY',
                severity: 'MEDIUM',
                message: `High volatility detected: ${(volatility * 100).toFixed(1)}%`
            });
        }
        
        return alerts;
    }
    
    // Placeholder implementations for complex calculations
    groupVolumeByHour(transactions, hours) { return {}; }
    analyzeVolumePatterns(volumeByHour) { return { trend: 'NEUTRAL', momentum: 0.5 }; }
    detectVolumeSpikes(volumeByHour) { return []; }
    createVolumeProfile(transactions) { return {}; }
    calculateVWAP(transactions) { return 0; }
    generateVolumeAlerts(spikes, analysis) { return []; }
    
    calculateSMA(prices, period) {
        if (prices.length < period) return prices[prices.length - 1];
        const recent = prices.slice(-period);
        return recent.reduce((sum, price) => sum + price, 0) / recent.length;
    }
    
    calculateEMA(prices, period) { return this.calculateSMA(prices, period); }
    calculateRSI(prices, period = 14) { return 50; }
    calculateMACD(prices) { return { macd: 0, signal: 0, histogram: 0 }; }
    calculateStochastic(priceData) { return { k: 50, d: 50 }; }
    calculateBollingerBands(prices) { return { upper: 0, middle: 0, lower: 0 }; }
    calculateATR(priceData) { return 0; }
    calculateADX(priceData) { return 50; }
    calculateParabolicSAR(priceData) { return 0; }
    calculateOBV(priceData) { return 0; }
    
    interpretTechnicalSignals(indicators) {
        return {
            overall_signal: 'NEUTRAL',
            strength: 'MEDIUM',
            confidence: 0.5
        };
    }
    
    estimateLiquidityDepth(transactions) { return 1000000; }
    estimateMarketImpact(avgSize) { return avgSize * 0.01; }
    calculateLiquidityScore(transactions) { return 0.7; }
    analyzeLiquidityTrend(transactions) { return 'STABLE'; }
    
    findNearestSupport(currentPrice, prices) { return currentPrice * 0.95; }
    findNearestResistance(currentPrice, prices) { return currentPrice * 1.05; }
    findHighVolumeNodes(profile) { return []; }
    calculatePivotPoint(priceData) { return priceData.current_price; }
    
    scoreToHealthRating(score) {
        if (score >= 80) return 'EXCELLENT';
        if (score >= 60) return 'GOOD';
        if (score >= 40) return 'FAIR';
        if (score >= 20) return 'POOR';
        return 'CRITICAL';
    }
    
    identifyHealthConcerns(data) { return []; }
    identifyPositiveIndicators(data) { return []; }
    generateHealthBasedRecommendation(score) {
        if (score >= 70) return 'Market conditions favorable for trading';
        if (score >= 50) return 'Proceed with caution, monitor key levels';
        return 'High risk environment, consider reducing exposure';
    }
}

module.exports = new MarketDataService();