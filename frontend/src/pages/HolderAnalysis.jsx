
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
    fetchCompleteTradingDashboard, 
    fetchWhaleAnalysis, 
    fetchWhaleAlerts,
    fetchMarketSentiment 
} from '../services/api';

const HolderAnalysis = () => {
    const [dashboardData, setDashboardData] = useState(null);
    const [whaleData, setWhaleData] = useState(null);
    const [whaleAlerts, setWhaleAlerts] = useState([]);
    const [marketSentiment, setMarketSentiment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [timeframe, setTimeframe] = useState('24h');
    const [activeTab, setActiveTab] = useState('dashboard');

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [
                    dashboardResponse,
                    whaleResponse,
                    alertsResponse,
                    sentimentResponse
                ] = await Promise.all([
                    fetchCompleteTradingDashboard(timeframe),
                    fetchWhaleAnalysis(20),
                    fetchWhaleAlerts(),
                    fetchMarketSentiment(timeframe)
                ]);
                
                setDashboardData(dashboardResponse.data.data);
                setWhaleData(whaleResponse.data.data);
                setWhaleAlerts(alertsResponse.data.data);
                setMarketSentiment(sentimentResponse.data.data);
            } catch (err) {
                setError('Failed to fetch trading analysis data.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [timeframe]);

    const formatCurrency = (value) => {
        if (value === 0) return '$0.00';
        if (value < 0.01) return `$${value.toFixed(6)}`;
        return `$${value.toFixed(4)}`;
    };

    const formatPercentage = (value) => {
        return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
    };

    const formatNumber = (value) => {
        if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
        if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
        if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
        return value.toFixed(0);
    };

    const getRiskColor = (risk) => {
        switch(risk) {
            case 'VERY_LOW': return 'text-green-400';
            case 'LOW': return 'text-green-300';
            case 'MEDIUM': return 'text-yellow-400';
            case 'HIGH': return 'text-orange-400';
            case 'VERY_HIGH': return 'text-red-400';
            default: return 'text-gray-400';
        }
    };

    const getSentimentColor = (sentiment) => {
        switch(sentiment) {
            case 'VERY_BULLISH': return 'text-green-400';
            case 'BULLISH': return 'text-green-300';
            case 'NEUTRAL': return 'text-gray-400';
            case 'BEARISH': return 'text-red-300';
            case 'VERY_BEARISH': return 'text-red-400';
            default: return 'text-gray-400';
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-slate-900 text-white">
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
                    <p className="text-xl">Loading Trading Analysis...</p>
                </div>
            </div>
        </div>
    );
    
    if (error) return (
        <div className="min-h-screen bg-slate-900 text-white">
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <div className="text-red-500 text-xl mb-4">{error}</div>
                    <button 
                        onClick={() => window.location.reload()} 
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Retry
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-900 text-white">
            {/* Navigation Header */}
            <div className="bg-gray-800 shadow-lg border-b border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div>
                            <h1 className="text-2xl font-bold text-white">Advanced Trading Analysis</h1>
                            <p className="text-sm text-gray-400">
                                Real-time insights for 2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump
                            </p>
                        </div>
                        <nav className="flex items-center space-x-4">
                            <Link 
                                to="/" 
                                className="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white rounded-md transition-colors"
                            >
                                ← Dashboard
                            </Link>
                            <select 
                                value={timeframe} 
                                onChange={(e) => setTimeframe(e.target.value)}
                                className="px-3 py-2 bg-gray-700 text-white rounded-md text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="1h">1 Hour</option>
                                <option value="4h">4 Hours</option>
                                <option value="24h">24 Hours</option>
                                <option value="7d">7 Days</option>
                                <option value="30d">30 Days</option>
                            </select>
                        </nav>
                    </div>
                    
                    {/* Tab Navigation */}
                    <div className="flex space-x-1 pb-4">
                        {[
                            { id: 'dashboard', label: 'Executive Dashboard' },
                            { id: 'whales', label: 'Whale Tracking' },
                            { id: 'alerts', label: 'Live Alerts' },
                            { id: 'sentiment', label: 'Market Sentiment' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    activeTab === tab.id
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
                {/* Executive Dashboard Tab */}
                {activeTab === 'dashboard' && dashboardData && (
                    <div className="space-y-6">
                        {/* Executive Summary */}
                        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                            <h2 className="text-xl font-bold mb-4 text-blue-400">Executive Summary</h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                <div className="text-center">
                                    <div className={`text-2xl font-bold ${getSentimentColor(dashboardData.executive_summary?.market_sentiment)}`}>
                                        {dashboardData.executive_summary?.market_sentiment || 'NEUTRAL'}
                                    </div>
                                    <div className="text-sm text-gray-400">Market Sentiment</div>
                                </div>
                                <div className="text-center">
                                    <div className={`text-2xl font-bold ${
                                        (dashboardData.executive_summary?.price_change_24h || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                                    }`}>
                                        {formatPercentage(dashboardData.executive_summary?.price_change_24h || 0)}
                                    </div>
                                    <div className="text-sm text-gray-400">24h Change</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-blue-400">
                                        {dashboardData.executive_summary?.volume_trend || 'NEUTRAL'}
                                    </div>
                                    <div className="text-sm text-gray-400">Volume Trend</div>
                                </div>
                                <div className="text-center">
                                    <div className={`text-2xl font-bold ${getSentimentColor(dashboardData.executive_summary?.whale_sentiment)}`}>
                                        {dashboardData.executive_summary?.whale_sentiment || 'NEUTRAL'}
                                    </div>
                                    <div className="text-sm text-gray-400">Whale Sentiment</div>
                                </div>
                                <div className="text-center">
                                    <div className={`text-2xl font-bold ${getRiskColor(dashboardData.executive_summary?.risk_level)}`}>
                                        {dashboardData.executive_summary?.risk_level || 'MEDIUM'}
                                    </div>
                                    <div className="text-sm text-gray-400">Risk Level</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-purple-400">
                                        {dashboardData.executive_summary?.market_health || 'FAIR'}
                                    </div>
                                    <div className="text-sm text-gray-400">Market Health</div>
                                </div>
                            </div>
                        </div>

                        {/* Key Metrics Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* Market Data */}
                            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                                <h3 className="text-lg font-semibold mb-4 text-green-400">Market Data</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Current Price</span>
                                        <span className="font-mono">{formatCurrency(dashboardData.market_data?.current_price || 0)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">24h Volume</span>
                                        <span className="font-mono">{formatNumber(dashboardData.market_data?.volume_24h || 0)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Volatility</span>
                                        <span className="font-mono">{((dashboardData.market_data?.volatility || 0) * 100).toFixed(1)}%</span>
                                    </div>
                                </div>
                            </div>

                            {/* Holder Metrics */}
                            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                                <h3 className="text-lg font-semibold mb-4 text-blue-400">Holder Metrics</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Total Holders</span>
                                        <span className="font-mono">{formatNumber(dashboardData.holder_metrics?.total_holders || 0)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Concentration Risk</span>
                                        <span className={`font-mono ${getRiskColor(
                                            (dashboardData.holder_metrics?.concentration_risk || 0) > 0.7 ? 'HIGH' :
                                            (dashboardData.holder_metrics?.concentration_risk || 0) > 0.4 ? 'MEDIUM' : 'LOW'
                                        )}`}>
                                            {((dashboardData.holder_metrics?.concentration_risk || 0) * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Holder Strength</span>
                                        <span className="font-mono text-green-400">
                                            {((dashboardData.holder_metrics?.holder_strength || 0) * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Whale Activity */}
                            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                                <h3 className="text-lg font-semibold mb-4 text-yellow-400">Whale Activity</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Total Whales</span>
                                        <span className="font-mono">{dashboardData.whale_activity?.total_whales || 0}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Accumulating</span>
                                        <span className="font-mono text-green-400">{dashboardData.whale_activity?.accumulating_whales || 0}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Distributing</span>
                                        <span className="font-mono text-red-400">{dashboardData.whale_activity?.distributing_whales || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Trading Signals */}
                            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                                <h3 className="text-lg font-semibold mb-4 text-purple-400">Trading Signals</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Direction</span>
                                        <span className={`font-mono ${getSentimentColor(dashboardData.trading_signals?.overall_direction)}`}>
                                            {dashboardData.trading_signals?.overall_direction || 'NEUTRAL'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Strength</span>
                                        <span className="font-mono">{dashboardData.trading_signals?.signal_strength || 'WEAK'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Confidence</span>
                                        <span className="font-mono text-blue-400">
                                            {((dashboardData.trading_signals?.confidence || 0) * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Key Levels */}
                        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                            <h3 className="text-lg font-semibold mb-4 text-cyan-400">Key Trading Levels</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <div>
                                    <div className="text-sm text-gray-400 mb-2">Immediate Support</div>
                                    <div className="text-lg font-mono text-green-400">
                                        {formatCurrency(dashboardData.key_levels?.immediate_support || 0)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-gray-400 mb-2">Immediate Resistance</div>
                                    <div className="text-lg font-mono text-red-400">
                                        {formatCurrency(dashboardData.key_levels?.immediate_resistance || 0)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-gray-400 mb-2">VWAP</div>
                                    <div className="text-lg font-mono text-blue-400">
                                        {formatCurrency(dashboardData.key_levels?.vwap || 0)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-gray-400 mb-2">Position Size</div>
                                    <div className="text-lg font-mono text-purple-400">
                                        {dashboardData.risk_assessment?.position_sizing?.recommended_size || '2-5%'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Recent Whale Movements */}
                        {dashboardData.whale_activity?.recent_movements?.length > 0 && (
                            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                                <h3 className="text-lg font-semibold mb-4 text-yellow-400">Recent Whale Movements</h3>
                                <div className="space-y-3">
                                    {dashboardData.whale_activity.recent_movements.slice(0, 5).map((movement, index) => (
                                        <div key={index} className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
                                            <div>
                                                <div className="font-mono text-sm">
                                                    {movement.wallet?.slice(0, 8)}...{movement.wallet?.slice(-4)}
                                                </div>
                                                <div className="text-xs text-gray-400">
                                                    {new Date(movement.timestamp).toLocaleString()}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`font-mono ${movement.type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                                                    {movement.type} {formatNumber(movement.amount || 0)}
                                                </div>
                                                <div className="text-xs text-gray-400">
                                                    {((movement.percentage || 0) * 100).toFixed(2)}% of supply
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Whale Tracking Tab */}
                {activeTab === 'whales' && whaleData && (
                    <div className="space-y-6">
                        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                            <h2 className="text-xl font-bold mb-4 text-yellow-400">Active Whale Monitoring</h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-yellow-400">{whaleData.whale_count || 0}</div>
                                    <div className="text-sm text-gray-400">Total Whales Tracked</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-green-400">
                                        {whaleData.market_impact?.accumulating_whales || 0}
                                    </div>
                                    <div className="text-sm text-gray-400">Accumulating</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-red-400">
                                        {whaleData.market_impact?.distributing_whales || 0}
                                    </div>
                                    <div className="text-sm text-gray-400">Distributing</div>
                                </div>
                            </div>
                            
                            {/* Whale List */}
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="text-left border-b border-gray-700">
                                            <th className="pb-3 text-gray-400">Wallet</th>
                                            <th className="pb-3 text-gray-400">Balance</th>
                                            <th className="pb-3 text-gray-400">% Supply</th>
                                            <th className="pb-3 text-gray-400">Tier</th>
                                            <th className="pb-3 text-gray-400">Behavior</th>
                                            <th className="pb-3 text-gray-400">Risk Score</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {whaleData.whales?.slice(0, 10).map((whale, index) => (
                                            <tr key={index} className="border-b border-gray-700">
                                                <td className="py-3 font-mono text-sm">
                                                    {whale.wallet?.slice(0, 8)}...{whale.wallet?.slice(-4)}
                                                </td>
                                                <td className="py-3 font-mono">
                                                    {formatNumber(whale.balance || 0)}
                                                </td>
                                                <td className="py-3 font-mono">
                                                    {((whale.percentage || 0) * 100).toFixed(2)}%
                                                </td>
                                                <td className="py-3">
                                                    <span className="px-2 py-1 text-xs rounded-full bg-yellow-900 text-yellow-300">
                                                        {whale.tier || 'Whale'}
                                                    </span>
                                                </td>
                                                <td className="py-3">
                                                    <span className={`px-2 py-1 text-xs rounded-full ${
                                                        whale.behavior === 'ACCUMULATING' ? 'bg-green-900 text-green-300' :
                                                        whale.behavior === 'DISTRIBUTING' ? 'bg-red-900 text-red-300' :
                                                        'bg-gray-700 text-gray-300'
                                                    }`}>
                                                        {whale.behavior || 'NEUTRAL'}
                                                    </span>
                                                </td>
                                                <td className="py-3">
                                                    <span className={`font-mono ${getRiskColor(whale.risk_level)}`}>
                                                        {whale.risk_score ? (whale.risk_score * 100).toFixed(0) : '50'}%
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Alerts Tab */}
                {activeTab === 'alerts' && (
                    <div className="space-y-6">
                        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                            <h2 className="text-xl font-bold mb-4 text-red-400">Live Trading Alerts</h2>
                            <div className="space-y-4">
                                {whaleAlerts.recent_alerts?.length > 0 ? (
                                    whaleAlerts.recent_alerts.map((alert, index) => (
                                        <div key={index} className={`p-4 rounded-lg border ${
                                            alert.severity === 'HIGH' ? 'bg-red-900/20 border-red-500' :
                                            alert.severity === 'MEDIUM' ? 'bg-yellow-900/20 border-yellow-500' :
                                            'bg-blue-900/20 border-blue-500'
                                        }`}>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="font-semibold">{alert.type || 'Alert'}</div>
                                                    <div className="text-sm text-gray-400 mt-1">{alert.message || 'No details available'}</div>
                                                </div>
                                                <div className="text-right text-sm">
                                                    <div className={`font-semibold ${
                                                        alert.severity === 'HIGH' ? 'text-red-400' :
                                                        alert.severity === 'MEDIUM' ? 'text-yellow-400' :
                                                        'text-blue-400'
                                                    }`}>
                                                        {alert.severity || 'INFO'}
                                                    </div>
                                                    <div className="text-gray-400">
                                                        {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : 'Now'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-gray-400">
                                        <div className="text-lg mb-2">No Active Alerts</div>
                                        <div className="text-sm">System is monitoring for whale movements and market anomalies</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Market Sentiment Tab */}
                {activeTab === 'sentiment' && marketSentiment && (
                    <div className="space-y-6">
                        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                            <h2 className="text-xl font-bold mb-4 text-purple-400">Market Sentiment Analysis</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <div className="text-center">
                                    <div className={`text-3xl font-bold ${getSentimentColor(marketSentiment.overall_sentiment)}`}>
                                        {marketSentiment.overall_sentiment || 'NEUTRAL'}
                                    </div>
                                    <div className="text-sm text-gray-400">Overall Sentiment</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-blue-400">
                                        {((marketSentiment.sentiment_score || 0.5) * 100).toFixed(0)}%
                                    </div>
                                    <div className="text-sm text-gray-400">Sentiment Score</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-green-400">
                                        {((marketSentiment.confidence_level || 0.7) * 100).toFixed(0)}%
                                    </div>
                                    <div className="text-sm text-gray-400">Confidence</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-yellow-400">
                                        {marketSentiment.fear_greed_index || 50}
                                    </div>
                                    <div className="text-sm text-gray-400">Fear/Greed Index</div>
                                </div>
                            </div>
                            
                            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="text-center p-4 bg-gray-700 rounded-lg">
                                    <div className={`text-lg font-semibold ${getSentimentColor(marketSentiment.whale_sentiment)}`}>
                                        {marketSentiment.whale_sentiment || 'NEUTRAL'}
                                    </div>
                                    <div className="text-sm text-gray-400">Whale Sentiment</div>
                                </div>
                                <div className="text-center p-4 bg-gray-700 rounded-lg">
                                    <div className={`text-lg font-semibold ${getSentimentColor(marketSentiment.holder_sentiment)}`}>
                                        {marketSentiment.holder_sentiment || 'NEUTRAL'}
                                    </div>
                                    <div className="text-sm text-gray-400">Holder Sentiment</div>
                                </div>
                                <div className="text-center p-4 bg-gray-700 rounded-lg">
                                    <div className="text-lg font-semibold text-cyan-400">
                                        {marketSentiment.market_regime || 'UNKNOWN'}
                                    </div>
                                    <div className="text-sm text-gray-400">Market Regime</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HolderAnalysis;
