const advancedHolderAnalysis = require('../services/advancedHolderAnalysisService');
const whaleTracking = require('../services/whaleTrackingService');
const tradingInsights = require('../services/tradingInsightsService');
const marketData = require('../services/marketDataService');
const redisCache = require('../services/redisCacheService');
const databaseCache = require('../services/databaseCacheService');

class AdvancedAnalysisController {
    
    /**
     * Get comprehensive holder analysis with trading insights
     */
    static async getComprehensiveHolderAnalysis(req, res) {
        try {
            const {
                timeframe = '30d',
                include_historical = 'true',
                include_behavior = 'true',
                include_risk = 'true',
                include_whale_tracking = 'true'
            } = req.query;
            
            console.log(`[ANALYSIS] Generating comprehensive holder analysis for ${timeframe}`);
            const startTime = Date.now();
            
            const options = {
                includeHistorical: include_historical === 'true',
                includeBehaviorAnalysis: include_behavior === 'true',
                includeRiskAnalysis: include_risk === 'true',
                includeWhaleTracking: include_whale_tracking === 'true',
                timeframe
            };
            
            const analysis = await advancedHolderAnalysis.getComprehensiveHolderAnalysis(options);
            
            res.json({
                success: true,
                data: analysis,
                metadata: {
                    request_id: `analysis_${Date.now()}`,
                    processing_time_ms: Date.now() - startTime,
                    timeframe,
                    options_applied: options
                }
            });
            
        } catch (error) {
            console.error(`[ANALYSIS] Comprehensive analysis error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Failed to generate comprehensive analysis',
                details: error.message
            });
        }
    }
    
    /**
     * Get whale tracking and analysis
     */
    static async getWhaleAnalysis(req, res) {
        try {
            const {
                include_history = 'false',
                sort_by = 'balance',
                limit = '50',
                min_percentage = '0.1'
            } = req.query;
            
            console.log(`[ANALYSIS] Generating whale analysis with ${limit} whales`);
            
            const options = {
                includeHistory: include_history === 'true',
                sortBy: sort_by,
                limit: parseInt(limit),
                minPercentage: parseFloat(min_percentage)
            };
            
            const whaleAnalysis = await whaleTracking.getWhaleAnalysis(options);
            
            res.json({
                success: true,
                data: whaleAnalysis,
                metadata: {
                    request_id: `whale_${Date.now()}`,
                    options_applied: options
                }
            });
            
        } catch (error) {
            console.error(`[ANALYSIS] Whale analysis error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Failed to generate whale analysis',
                details: error.message
            });
        }
    }
    
    /**
     * Get trading insights and signals
     */
    static async getTradingInsights(req, res) {
        try {
            const { timeframe = '24h' } = req.query;
            
            console.log(`[ANALYSIS] Generating trading insights for ${timeframe}`);
            const startTime = Date.now();
            
            const insights = await tradingInsights.generateTradingInsights(timeframe);
            
            res.json({
                success: true,
                data: insights,
                metadata: {
                    request_id: `trading_${Date.now()}`,
                    processing_time_ms: Date.now() - startTime,
                    timeframe
                }
            });
            
        } catch (error) {
            console.error(`[ANALYSIS] Trading insights error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Failed to generate trading insights',
                details: error.message
            });
        }
    }
    
    /**
     * Get real-time whale alerts
     */
    static async getWhaleAlerts(req, res) {
        try {
            const alerts = await whaleTracking.getWhaleAlerts();
            
            res.json({
                success: true,
                data: alerts,
                metadata: {
                    request_id: `alerts_${Date.now()}`,
                    timestamp: new Date().toISOString()
                }
            });
            
        } catch (error) {
            console.error(`[ANALYSIS] Whale alerts error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Failed to get whale alerts',
                details: error.message
            });
        }
    }
    
    /**
     * Track specific whale by address
     */
    static async trackWhale(req, res) {
        try {
            const { address } = req.params;
            
            if (!address) {
                return res.status(400).json({
                    success: false,
                    error: 'Wallet address is required'
                });
            }
            
            console.log(`[ANALYSIS] Tracking whale: ${address}`);
            
            const whaleData = await whaleTracking.trackWhale(address);
            
            res.json({
                success: true,
                data: whaleData,
                metadata: {
                    request_id: `track_${Date.now()}`,
                    tracked_address: address
                }
            });
            
        } catch (error) {
            console.error(`[ANALYSIS] Track whale error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Failed to track whale',
                details: error.message
            });
        }
    }
    
    /**
     * Get market sentiment analysis
     */
    static async getMarketSentiment(req, res) {
        try {
            const { timeframe = '24h' } = req.query;
            
            console.log(`[ANALYSIS] Analyzing market sentiment for ${timeframe}`);
            
            // Get sentiment from trading insights
            const insights = await tradingInsights.generateTradingInsights(timeframe);
            const sentimentData = insights.overall_sentiment;
            
            // Get whale sentiment
            const whaleAnalysis = await whaleTracking.getWhaleAnalysis({ limit: 20 });
            
            const sentiment = {
                overall_sentiment: sentimentData,
                sentiment_score: insights.key_metrics?.momentum_score || 0.5,
                confidence_level: insights.performance?.confidence_level || 0.7,
                
                // Component sentiments
                whale_sentiment: whaleAnalysis.market_impact?.net_whale_sentiment || 'NEUTRAL',
                holder_sentiment: insights.key_metrics?.holder_strength > 0.7 ? 'BULLISH' : 
                                insights.key_metrics?.holder_strength < 0.3 ? 'BEARISH' : 'NEUTRAL',
                
                // Market indicators
                fear_greed_index: AdvancedAnalysisController.calculateFearGreedIndex(insights),
                market_momentum: insights.key_metrics?.momentum_score || 0.5,
                
                // Risk factors
                risk_factors: insights.alerts || [],
                market_regime: insights.market_regime?.regime || 'UNKNOWN',
                
                timeframe,
                timestamp: new Date().toISOString()
            };
            
            res.json({
                success: true,
                data: sentiment,
                metadata: {
                    request_id: `sentiment_${Date.now()}`,
                    timeframe
                }
            });
            
        } catch (error) {
            console.error(`[ANALYSIS] Market sentiment error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Failed to analyze market sentiment',
                details: error.message
            });
        }
    }
    
    /**
     * Get trading dashboard data
     */
    static async getTradingDashboard(req, res) {
        try {
            const { timeframe = '24h' } = req.query;
            
            console.log(`[ANALYSIS] Building trading dashboard for ${timeframe}`);
            const startTime = Date.now();
            
            // Get all data in parallel for faster response
            const [
                holderAnalysis,
                whaleAnalysis,
                tradingInsightsData,
                whaleAlerts
            ] = await Promise.all([
                advancedHolderAnalysis.getComprehensiveHolderAnalysis({ 
                    timeframe,
                    includeHistorical: false,
                    includeBehaviorAnalysis: true,
                    includeRiskAnalysis: true 
                }),
                whaleTracking.getWhaleAnalysis({ 
                    includeHistory: false, 
                    limit: 20 
                }),
                tradingInsights.generateTradingInsights(timeframe),
                whaleTracking.getWhaleAlerts()
            ]);
            
            const dashboard = {
                // Summary metrics
                summary: {
                    total_holders: holderAnalysis.holder_distribution?.summary?.total_holders || 0,
                    total_whales: whaleAnalysis.whale_count || 0,
                    market_sentiment: tradingInsightsData.overall_sentiment || 'NEUTRAL',
                    risk_level: tradingInsightsData.risk_assessment?.overall_risk || 'MEDIUM',
                    active_alerts: whaleAlerts.recent_alerts?.length || 0
                },
                
                // Key metrics for traders
                key_metrics: {
                    whale_sentiment: whaleAnalysis.market_impact?.net_whale_sentiment || 'NEUTRAL',
                    concentration_risk: tradingInsightsData.key_metrics?.concentration_risk || 0.5,
                    holder_strength: tradingInsightsData.key_metrics?.holder_strength || 0.5,
                    momentum_score: tradingInsightsData.key_metrics?.momentum_score || 0.5,
                    liquidity_health: tradingInsightsData.key_metrics?.liquidity_health || 'UNKNOWN'
                },
                
                // Trading signals
                trading_signals: tradingInsightsData.trading_signals || {},
                
                // Market structure
                market_structure: tradingInsightsData.market_structure || {},
                
                // Position sizing recommendation
                position_sizing: tradingInsightsData.position_sizing || {},
                
                // Recent whale activity (top 10)
                whale_activity: whaleAnalysis.whale_movements?.slice(0, 10) || [],
                
                // Top holders by tier
                holder_tiers: holderAnalysis.holder_distribution?.tiers || {},
                
                // Recent alerts
                recent_alerts: whaleAlerts.recent_alerts?.slice(0, 10) || [],
                
                // Performance and metadata
                performance: {
                    total_processing_time_ms: Date.now() - startTime,
                    data_freshness: 'real-time',
                    cache_status: 'optimized'
                },
                
                timestamp: new Date().toISOString(),
                timeframe
            };
            
            res.json({
                success: true,
                data: dashboard,
                metadata: {
                    request_id: `dashboard_${Date.now()}`,
                    processing_time_ms: Date.now() - startTime,
                    components_loaded: 4
                }
            });
            
        } catch (error) {
            console.error(`[ANALYSIS] Trading dashboard error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Failed to build trading dashboard',
                details: error.message
            });
        }
    }
    
    /**
     * Get holder distribution analysis
     */
    static async getHolderDistribution(req, res) {
        try {
            const holderAnalysis = await advancedHolderAnalysis.getComprehensiveHolderAnalysis({
                includeHistorical: false,
                includeBehaviorAnalysis: true,
                includeRiskAnalysis: false,
                includeWhaleTracking: false
            });
            
            const distribution = holderAnalysis.holder_distribution;
            
            // Enhance with trading-relevant metrics
            const enhancedDistribution = {
                ...distribution,
                trading_metrics: {
                    whale_dominance: AdvancedAnalysisController.calculateWhaleDominance(distribution),
                    retail_participation: AdvancedAnalysisController.calculateRetailParticipation(distribution),
                    concentration_score: AdvancedAnalysisController.calculateConcentrationScore(distribution),
                    distribution_health: AdvancedAnalysisController.assessDistributionHealth(distribution)
                }
            };
            
            res.json({
                success: true,
                data: enhancedDistribution,
                metadata: {
                    request_id: `distribution_${Date.now()}`
                }
            });
            
        } catch (error) {
            console.error(`[ANALYSIS] Holder distribution error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Failed to get holder distribution',
                details: error.message
            });
        }
    }
    
    /**
     * Get risk assessment for trading
     */
    static async getRiskAssessment(req, res) {
        try {
            const { timeframe = '24h' } = req.query;
            
            const insights = await tradingInsights.generateTradingInsights(timeframe);
            const riskAssessment = insights.risk_assessment;
            
            // Enhanced risk data for traders
            const enhancedRisk = {
                ...riskAssessment,
                trading_recommendations: {
                    position_sizing: insights.position_sizing,
                    stop_loss_levels: insights.stop_loss_levels,
                    risk_management: AdvancedAnalysisController.generateRiskManagementTips(riskAssessment)
                },
                risk_alerts: insights.alerts || []
            };
            
            res.json({
                success: true,
                data: enhancedRisk,
                metadata: {
                    request_id: `risk_${Date.now()}`,
                    timeframe
                }
            });
            
        } catch (error) {
            console.error(`[ANALYSIS] Risk assessment error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Failed to get risk assessment',
                details: error.message
            });
        }
    }
    
    /**
     * Get comprehensive market data for trading
     */
    static async getMarketData(req, res) {
        try {
            const { timeframe = '24h' } = req.query;
            
            console.log(`[ANALYSIS] Fetching market data for ${timeframe}`);
            const startTime = Date.now();
            
            const marketDataResponse = await marketData.getMarketData(timeframe);
            
            res.json({
                success: true,
                data: marketDataResponse,
                metadata: {
                    request_id: `market_${Date.now()}`,
                    processing_time_ms: Date.now() - startTime,
                    timeframe
                }
            });
            
        } catch (error) {
            console.error(`[ANALYSIS] Market data error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch market data',
                details: error.message
            });
        }
    }
    
    /**
     * Get technical analysis indicators
     */
    static async getTechnicalAnalysis(req, res) {
        try {
            const { timeframe = '24h' } = req.query;
            
            console.log(`[ANALYSIS] Generating technical analysis for ${timeframe}`);
            
            const marketDataResponse = await marketData.getMarketData(timeframe);
            const technicalData = {
                price_data: marketDataResponse.price_data,
                technical_indicators: marketDataResponse.technical_indicators,
                market_signals: marketDataResponse.market_signals,
                key_levels: marketDataResponse.key_levels,
                market_health: marketDataResponse.market_health
            };
            
            res.json({
                success: true,
                data: technicalData,
                metadata: {
                    request_id: `technical_${Date.now()}`,
                    timeframe,
                    indicators_count: Object.keys(technicalData.technical_indicators || {}).length
                }
            });
            
        } catch (error) {
            console.error(`[ANALYSIS] Technical analysis error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Failed to generate technical analysis',
                details: error.message
            });
        }
    }
    
    /**
     * Get real-time price and volume alerts
     */
    static async getPriceVolumeAlerts(req, res) {
        try {
            console.log('[ANALYSIS] Fetching price and volume alerts');
            
            const marketDataResponse = await marketData.getMarketData('24h');
            
            const alerts = {
                price_alerts: marketDataResponse.price_data?.price_alerts || [],
                volume_alerts: marketDataResponse.volume_data?.volume_alerts || [],
                market_signals: marketDataResponse.market_signals?.signals || [],
                
                // Combine whale alerts with market alerts
                whale_alerts: await whaleTracking.getWhaleAlerts(),
                
                alert_summary: {
                    total_alerts: 0,
                    high_priority: 0,
                    medium_priority: 0,
                    low_priority: 0
                }
            };
            
            // Count alerts by priority
            const allAlerts = [
                ...alerts.price_alerts,
                ...alerts.volume_alerts,
                ...alerts.market_signals
            ];
            
            alerts.alert_summary.total_alerts = allAlerts.length;
            alerts.alert_summary.high_priority = allAlerts.filter(a => a.severity === 'HIGH' || a.strength === 'HIGH').length;
            alerts.alert_summary.medium_priority = allAlerts.filter(a => a.severity === 'MEDIUM' || a.strength === 'MEDIUM').length;
            alerts.alert_summary.low_priority = allAlerts.filter(a => a.severity === 'LOW' || a.strength === 'LOW').length;
            
            res.json({
                success: true,
                data: alerts,
                metadata: {
                    request_id: `alerts_${Date.now()}`,
                    timestamp: new Date().toISOString()
                }
            });
            
        } catch (error) {
            console.error(`[ANALYSIS] Price/volume alerts error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch price/volume alerts',
                details: error.message
            });
        }
    }
    
    /**
     * Get comprehensive trading dashboard with market data
     */
    static async getCompleteTradingDashboard(req, res) {
        try {
            const { timeframe = '24h' } = req.query;
            
            console.log(`[ANALYSIS] Building complete trading dashboard for ${timeframe}`);
            const startTime = Date.now();
            
            // Get all data in parallel for maximum performance
            const [
                holderAnalysis,
                whaleAnalysis,
                tradingInsightsData,
                marketDataResponse,
                whaleAlerts
            ] = await Promise.all([
                advancedHolderAnalysis.getComprehensiveHolderAnalysis({ 
                    timeframe,
                    includeHistorical: false,
                    includeBehaviorAnalysis: true,
                    includeRiskAnalysis: true 
                }),
                whaleTracking.getWhaleAnalysis({ 
                    includeHistory: false, 
                    limit: 20 
                }),
                tradingInsights.generateTradingInsights(timeframe),
                marketData.getMarketData(timeframe),
                whaleTracking.getWhaleAlerts()
            ]);
            
            const completeDashboard = {
                // Executive Summary
                executive_summary: {
                    market_sentiment: tradingInsightsData.overall_sentiment || 'NEUTRAL',
                    price_change_24h: marketDataResponse.price_data?.price_change_percent || 0,
                    volume_trend: marketDataResponse.volume_data?.volume_trend || 'NEUTRAL',
                    whale_sentiment: whaleAnalysis.market_impact?.net_whale_sentiment || 'NEUTRAL',
                    risk_level: tradingInsightsData.risk_assessment?.overall_risk || 'MEDIUM',
                    market_health: marketDataResponse.market_health?.health_rating || 'FAIR'
                },
                
                // Market Data
                market_data: {
                    current_price: marketDataResponse.price_data?.current_price || 0,
                    price_change: marketDataResponse.price_data?.price_change_percent || 0,
                    volume_24h: marketDataResponse.volume_data?.total_volume || 0,
                    volatility: marketDataResponse.price_data?.volatility || 0,
                    technical_signals: marketDataResponse.market_signals || {}
                },
                
                // Holder Analysis
                holder_metrics: {
                    total_holders: holderAnalysis.holder_distribution?.summary?.total_holders || 0,
                    concentration_risk: tradingInsightsData.key_metrics?.concentration_risk || 0.5,
                    holder_strength: tradingInsightsData.key_metrics?.holder_strength || 0.5,
                    distribution_health: AdvancedAnalysisController.assessDistributionHealth(holderAnalysis.holder_distribution)
                },
                
                // Whale Activity
                whale_activity: {
                    total_whales: whaleAnalysis.whale_count || 0,
                    active_whales: whaleAnalysis.market_impact?.active_whale_count || 0,
                    accumulating_whales: whaleAnalysis.market_impact?.accumulating_whales || 0,
                    distributing_whales: whaleAnalysis.market_impact?.distributing_whales || 0,
                    recent_movements: whaleAnalysis.whale_movements?.slice(0, 5) || []
                },
                
                // Trading Signals
                trading_signals: {
                    overall_direction: tradingInsightsData.trading_signals?.overall_direction || 'NEUTRAL',
                    signal_strength: tradingInsightsData.trading_signals?.signal_strength || 'WEAK',
                    confidence: tradingInsightsData.trading_signals?.confidence || 0.5,
                    active_signals: tradingInsightsData.trading_signals?.signals || []
                },
                
                // Key Levels for Trading
                key_levels: {
                    support_levels: marketDataResponse.key_levels?.major_support_levels || [],
                    resistance_levels: marketDataResponse.key_levels?.major_resistance_levels || [],
                    immediate_support: marketDataResponse.key_levels?.immediate_support || 0,
                    immediate_resistance: marketDataResponse.key_levels?.immediate_resistance || 0,
                    vwap: marketDataResponse.volume_data?.vwap || 0
                },
                
                // Risk Assessment
                risk_assessment: {
                    overall_risk: tradingInsightsData.risk_assessment?.overall_risk || 'MEDIUM',
                    risk_score: tradingInsightsData.risk_assessment?.overall_score || 0.5,
                    position_sizing: tradingInsightsData.position_sizing || {},
                    key_risk_factors: tradingInsightsData.risk_assessment?.risk_factors || []
                },
                
                // Alerts and Notifications
                alerts: {
                    whale_alerts: whaleAlerts.recent_alerts?.slice(0, 5) || [],
                    price_alerts: marketDataResponse.price_data?.price_alerts || [],
                    volume_alerts: marketDataResponse.volume_data?.volume_alerts || [],
                    total_active_alerts: (whaleAlerts.recent_alerts?.length || 0) + 
                                       (marketDataResponse.price_data?.price_alerts?.length || 0) + 
                                       (marketDataResponse.volume_data?.volume_alerts?.length || 0)
                },
                
                // Technical Analysis
                technical_analysis: {
                    trend: marketDataResponse.price_data?.price_action?.trend || 'NEUTRAL',
                    momentum: marketDataResponse.price_data?.price_action?.momentum || 0,
                    rsi: marketDataResponse.technical_indicators?.rsi || 50,
                    moving_averages: {
                        sma_20: marketDataResponse.technical_indicators?.sma_20 || 0,
                        sma_50: marketDataResponse.technical_indicators?.sma_50 || 0
                    }
                },
                
                // Performance Metrics
                performance: {
                    total_processing_time_ms: Date.now() - startTime,
                    data_sources: 5,
                    cache_efficiency: 'optimized',
                    last_updated: new Date().toISOString()
                },
                
                // Metadata
                metadata: {
                    timeframe,
                    dashboard_version: '2.0',
                    api_version: 'advanced',
                    request_id: `complete_dashboard_${Date.now()}`
                }
            };
            
            res.json({
                success: true,
                data: completeDashboard,
                metadata: {
                    request_id: `complete_dashboard_${Date.now()}`,
                    processing_time_ms: Date.now() - startTime,
                    components_loaded: 5,
                    total_metrics: Object.keys(completeDashboard).length
                }
            });
            
        } catch (error) {
            console.error(`[ANALYSIS] Complete trading dashboard error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Failed to build complete trading dashboard',
                details: error.message
            });
        }
    }
    
    /**
     * Export analysis data for external tools
     */
    static async exportAnalysisData(req, res) {
        try {
            const { 
                format = 'json',
                timeframe = '24h',
                include_whale_data = 'true',
                include_insights = 'true'
            } = req.query;
            
            console.log(`[ANALYSIS] Exporting analysis data in ${format} format`);
            
            const exportData = {
                metadata: {
                    export_timestamp: new Date().toISOString(),
                    timeframe,
                    format,
                    version: '2.0'
                }
            };
            
            // Get comprehensive data
            if (include_whale_data === 'true') {
                exportData.whale_analysis = await whaleTracking.getWhaleAnalysis({ 
                    includeHistory: true,
                    limit: 100 
                });
            }
            
            if (include_insights === 'true') {
                exportData.trading_insights = await tradingInsights.generateTradingInsights(timeframe);
            }
            
            exportData.holder_analysis = await advancedHolderAnalysis.getComprehensiveHolderAnalysis({
                timeframe,
                includeHistorical: true,
                includeBehaviorAnalysis: true,
                includeRiskAnalysis: true
            });
            
            if (format === 'csv') {
                const csv = this.convertToCSV(exportData);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="holder-analysis-${timeframe}-${Date.now()}.csv"`);
                res.send(csv);
            } else {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="holder-analysis-${timeframe}-${Date.now()}.json"`);
                res.json({
                    success: true,
                    data: exportData
                });
            }
            
        } catch (error) {
            console.error(`[ANALYSIS] Export error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'Failed to export analysis data',
                details: error.message
            });
        }
    }
    
    // Helper methods
    static calculateFearGreedIndex(insights) {
        // Simplified fear/greed calculation
        const sentiment = insights.overall_sentiment;
        const momentum = insights.key_metrics?.momentum_score || 0.5;
        const risk = insights.risk_assessment?.overall_score || 0.5;
        
        let index = 50; // Neutral
        
        if (sentiment === 'VERY_BULLISH') index += 30;
        else if (sentiment === 'BULLISH') index += 15;
        else if (sentiment === 'BEARISH') index -= 15;
        else if (sentiment === 'VERY_BEARISH') index -= 30;
        
        index += (momentum - 0.5) * 40; // -20 to +20
        index -= (risk - 0.5) * 20; // Fear increases with risk
        
        return Math.max(0, Math.min(100, Math.round(index)));
    }
    
    static calculateWhaleDominance(distribution) {
        const whales = distribution.tiers?.['Whale'] || {};
        const totalSupply = distribution.summary?.tokens_in_tracked_wallets || 1;
        return (whales.total_tokens || 0) / totalSupply;
    }
    
    static calculateRetailParticipation(distribution) {
        const retail = ['Fish', 'Minnow', 'Crab'].reduce((sum, tier) => {
            return sum + (distribution.tiers?.[tier]?.count || 0);
        }, 0);
        const total = distribution.summary?.total_holders || 1;
        return retail / total;
    }
    
    static calculateConcentrationScore(distribution) {
        const top10 = ['Mega Whale', 'Whale', 'Large Shark'].reduce((sum, tier) => {
            return sum + (distribution.tiers?.[tier]?.percentage_of_supply || 0);
        }, 0);
        
        if (top10 > 70) return 'VERY_HIGH';
        if (top10 > 50) return 'HIGH';
        if (top10 > 30) return 'MEDIUM';
        if (top10 > 15) return 'LOW';
        return 'VERY_LOW';
    }
    
    static assessDistributionHealth(distribution) {
        const concentrationScore = AdvancedAnalysisController.calculateConcentrationScore(distribution);
        const retailParticipation = AdvancedAnalysisController.calculateRetailParticipation(distribution);
        
        if (concentrationScore === 'VERY_HIGH' || retailParticipation < 0.3) {
            return 'POOR';
        } else if (concentrationScore === 'HIGH' || retailParticipation < 0.5) {
            return 'FAIR';
        } else if (concentrationScore === 'MEDIUM' && retailParticipation > 0.6) {
            return 'GOOD';
        } else {
            return 'EXCELLENT';
        }
    }
    
    static generateRiskManagementTips(riskAssessment) {
        const tips = [];
        
        if (riskAssessment.overall_risk === 'VERY_HIGH') {
            tips.push('Consider avoiding new positions');
            tips.push('Use tight stop losses if already positioned');
            tips.push('Reduce position sizes significantly');
        } else if (riskAssessment.overall_risk === 'HIGH') {
            tips.push('Use smaller position sizes');
            tips.push('Implement trailing stops');
            tips.push('Monitor whale activity closely');
        } else if (riskAssessment.overall_risk === 'MEDIUM') {
            tips.push('Standard risk management applies');
            tips.push('Watch for whale movement alerts');
        } else {
            tips.push('Normal position sizing acceptable');
            tips.push('Consider swing trading opportunities');
        }
        
        return tips;
    }
    
    static convertToCSV(data) {
        // Simplified CSV conversion
        const rows = [
            ['Metric', 'Value', 'Category'],
            ['Total Holders', data.holder_analysis?.holder_distribution?.summary?.total_holders || 0, 'Distribution'],
            ['Total Whales', data.whale_analysis?.whale_count || 0, 'Whales'],
            ['Market Sentiment', data.trading_insights?.overall_sentiment || 'NEUTRAL', 'Sentiment'],
            ['Risk Level', data.trading_insights?.risk_assessment?.overall_risk || 'MEDIUM', 'Risk'],
            ['Concentration Risk', data.trading_insights?.key_metrics?.concentration_risk || 0, 'Risk']
        ];
        
        return rows.map(row => row.join(',')).join('\n');
    }
}

module.exports = AdvancedAnalysisController;