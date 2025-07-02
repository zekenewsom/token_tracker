# 📊 Advanced Trading Analysis API Documentation

## Overview

The Advanced Trading Analysis system provides comprehensive insights for cryptocurrency traders, including whale tracking, holder analysis, market sentiment, technical indicators, and real-time alerts. This system is specifically designed for the Solana token `2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump`.

## 🚀 Key Features

### 1. **Comprehensive Holder Analysis**
- Multi-tier holder classification (Mega Whale, Whale, Shark, Dolphin, Fish, Minnow, Crab)
- Behavioral pattern analysis (Accumulator, Trader, Paper Hands, etc.)
- Risk assessment and concentration metrics
- Historical trends and flow analysis

### 2. **Advanced Whale Tracking**
- Real-time whale movement detection
- Whale sentiment analysis (accumulating vs distributing)
- Alert system for significant whale activities
- Individual whale profiling and risk scoring

### 3. **Technical Market Analysis**
- Real-time price action analysis
- Volume profile and liquidity metrics
- Technical indicators (RSI, MACD, Bollinger Bands, etc.)
- Support/resistance level identification

### 4. **Trading Insights & Signals**
- Market regime identification (Accumulation, Distribution, Markup, etc.)
- Trading signal generation with confidence scores
- Position sizing recommendations
- Risk management guidance

### 5. **Real-time Alerts**
- Whale movement alerts
- Price and volume spike detection
- Market sentiment shifts
- Technical breakout notifications

---

## 📡 API Endpoints

### Base URL: `/api/analysis/`

### 🔍 **Core Analysis Endpoints**

#### 1. Complete Trading Dashboard
```http
GET /api/analysis/complete-dashboard?timeframe=24h
```

**Response Structure:**
```json
{
  "success": true,
  "data": {
    "executive_summary": {
      "market_sentiment": "BULLISH",
      "price_change_24h": 15.5,
      "volume_trend": "INCREASING",
      "whale_sentiment": "ACCUMULATING",
      "risk_level": "MEDIUM",
      "market_health": "GOOD"
    },
    "market_data": {
      "current_price": 0.00123,
      "price_change": 15.5,
      "volume_24h": 2500000,
      "volatility": 0.15,
      "technical_signals": {}
    },
    "holder_metrics": {
      "total_holders": 4500,
      "concentration_risk": 0.65,
      "holder_strength": 0.78,
      "distribution_health": "GOOD"
    },
    "whale_activity": {
      "total_whales": 25,
      "active_whales": 12,
      "accumulating_whales": 8,
      "distributing_whales": 4,
      "recent_movements": []
    },
    "trading_signals": {
      "overall_direction": "BULLISH",
      "signal_strength": "STRONG",
      "confidence": 0.82,
      "active_signals": []
    },
    "key_levels": {
      "support_levels": [0.00115, 0.00108, 0.00095],
      "resistance_levels": [0.00135, 0.00145, 0.00160],
      "immediate_support": 0.00118,
      "immediate_resistance": 0.00128,
      "vwap": 0.00121
    },
    "risk_assessment": {
      "overall_risk": "MEDIUM",
      "risk_score": 0.45,
      "position_sizing": {
        "recommended_size": "3-5%",
        "risk_level": "MEDIUM"
      }
    }
  }
}
```

#### 2. Comprehensive Holder Analysis
```http
GET /api/analysis/comprehensive?timeframe=30d&include_historical=true&include_behavior=true&include_risk=true
```

**Key Features:**
- Holder distribution by tiers
- Behavioral pattern analysis
- Risk metrics and concentration analysis
- Historical trends and flow analysis

#### 3. Whale Analysis & Tracking
```http
GET /api/analysis/whale-analysis?sort_by=balance&limit=50&min_percentage=0.1
```

**Response Features:**
- Detailed whale profiles
- Activity scores and risk levels
- Recent transaction analysis
- Market impact assessment

#### 4. Trading Insights & Signals
```http
GET /api/analysis/trading-insights?timeframe=24h
```

**Provides:**
- Market regime identification
- Trading signals with confidence scores
- Position sizing recommendations
- Entry/exit level suggestions

### 📊 **Market Data Endpoints**

#### 5. Market Data & Technical Analysis
```http
GET /api/analysis/market-data?timeframe=24h
```

**Includes:**
- Price action analysis
- Volume profile
- Technical indicators
- Liquidity metrics
- Market health assessment

#### 6. Technical Analysis
```http
GET /api/analysis/technical-analysis?timeframe=24h
```

**Technical Indicators:**
- RSI, MACD, Bollinger Bands
- Moving averages (SMA, EMA)
- Volume indicators (OBV)
- Trend indicators (ADX, Parabolic SAR)

### 🚨 **Alert Endpoints**

#### 7. Whale Alerts
```http
GET /api/analysis/whale-alerts
```

**Alert Types:**
- New whale detection
- Whale accumulation/distribution
- Whale position exits
- Coordination risk alerts

#### 8. Price & Volume Alerts
```http
GET /api/analysis/price-volume-alerts
```

**Alert Categories:**
- Price movement alerts (5%, 15%, 30%, 50%+ changes)
- Volume spike detection
- Technical breakout alerts
- Market health warnings

### 📈 **Specialized Endpoints**

#### 9. Market Sentiment Analysis
```http
GET /api/analysis/market-sentiment?timeframe=24h
```

**Sentiment Components:**
- Overall sentiment score
- Whale sentiment
- Holder sentiment
- Fear/Greed index
- Market momentum

#### 10. Risk Assessment
```http
GET /api/analysis/risk-assessment?timeframe=24h
```

**Risk Factors:**
- Concentration risk
- Liquidity risk
- Whale dump risk
- Volatility risk
- Market risk

#### 11. Holder Distribution
```http
GET /api/analysis/holder-distribution
```

**Distribution Metrics:**
- Holder tiers breakdown
- Whale dominance ratio
- Retail participation
- Distribution health score

#### 12. Track Specific Whale
```http
POST /api/analysis/track-whale/:address
```

**Individual Whale Analysis:**
- Complete transaction history
- Position analysis
- Risk scoring
- Behavior patterns

### 📤 **Export Endpoints**

#### 13. Export Analysis Data
```http
GET /api/analysis/export?format=json&timeframe=24h&include_whale_data=true&include_insights=true
```

**Export Formats:**
- JSON (complete data)
- CSV (summary data)

**Export Options:**
- Include whale data
- Include trading insights
- Include historical data

---

## 🏷️ **Data Classifications**

### Holder Tiers
| Tier | Supply % | Risk Impact | Description |
|------|----------|-------------|-------------|
| **Mega Whale** | 5%+ | EXTREME | Major market movers |
| **Whale** | 1-5% | HIGH | Significant influence |
| **Large Shark** | 0.5-1% | HIGH | Notable positions |
| **Shark** | 0.1-0.5% | MEDIUM | Moderate influence |
| **Dolphin** | 0.01-0.1% | MEDIUM | Small whales |
| **Fish** | 0.001-0.01% | LOW | Retail investors |
| **Minnow** | 0.0001-0.001% | MINIMAL | Small retail |
| **Crab** | <0.0001% | MINIMAL | Micro positions |

### Behavior Patterns
- **ACCUMULATOR**: Consistent buyer, diamond hands
- **TRADER**: Active buyer/seller, profit taking
- **WHALE_DUMPER**: Large seller, potential dump risk
- **WHALE_ACCUMULATOR**: Large buyer, bullish signal
- **PAPER_HANDS**: Quick seller after buying
- **SWING_TRADER**: Regular buy/sell cycles
- **INACTIVE**: No recent activity
- **NEW_MONEY**: Recent first-time buyer

### Risk Levels
- **VERY_LOW**: 0-20% - Conservative entry (5-10% position)
- **LOW**: 20-40% - Standard position (3-7% position)
- **MEDIUM**: 40-60% - Reduced position (2-5% position)
- **HIGH**: 60-80% - Small position (1-3% position)
- **VERY_HIGH**: 80-100% - Avoid or hedge (0-1% position)

### Market Regimes
- **ACCUMULATION**: Smart money accumulating, low volatility
- **DISTRIBUTION**: Smart money distributing, potential top
- **MARKUP**: Strong uptrend with healthy participation
- **MARKDOWN**: Downtrend with selling pressure
- **CONSOLIDATION**: Sideways movement, awaiting direction
- **MANIPULATION**: Potential wash trading or manipulation

---

## 🎯 **Trading Use Cases**

### 1. **Entry Timing**
```http
GET /api/analysis/complete-dashboard
```
- Check market sentiment and whale activity
- Analyze technical indicators
- Review risk assessment
- Confirm with trading signals

### 2. **Position Sizing**
```http
GET /api/analysis/risk-assessment
```
- Get risk level assessment
- Review concentration metrics
- Check volatility indicators
- Apply recommended position size

### 3. **Exit Strategy**
```http
GET /api/analysis/whale-alerts
GET /api/analysis/price-volume-alerts
```
- Monitor whale distribution signals
- Watch for volume divergence
- Track technical resistance levels
- Set alerts for risk changes

### 4. **Whale Monitoring**
```http
GET /api/analysis/whale-analysis
POST /api/analysis/track-whale/:address
```
- Track large holder movements
- Monitor accumulation/distribution
- Get early warning signals
- Assess coordination risks

### 5. **Market Sentiment**
```http
GET /api/analysis/market-sentiment
GET /api/analysis/trading-insights
```
- Gauge overall market mood
- Identify sentiment shifts
- Confirm trend direction
- Assess market maturity

---

## 🚀 **Performance & Caching**

### Response Times
- **Simple endpoints**: <200ms
- **Complex analysis**: <2s
- **Complete dashboard**: <3s

### Caching Strategy
- **Market data**: 5 minutes
- **Holder analysis**: 30 minutes
- **Whale tracking**: Real-time updates
- **Technical indicators**: 15 minutes

### Rate Limits
- **Standard endpoints**: 100 requests/minute
- **Complex analysis**: 20 requests/minute
- **Real-time alerts**: 200 requests/minute

---

## 📝 **Example Trading Workflow**

### Morning Routine
1. **Check Complete Dashboard**: Get overall market status
2. **Review Whale Alerts**: Check for overnight whale activity
3. **Analyze Technical Signals**: Confirm trend direction
4. **Assess Risk Levels**: Adjust position sizing

### Pre-Trade Analysis
1. **Market Sentiment**: Confirm market direction
2. **Whale Activity**: Check for accumulation/distribution
3. **Technical Levels**: Identify entry/exit points
4. **Risk Assessment**: Determine position size

### Position Monitoring
1. **Whale Alerts**: Monitor for large movements
2. **Price Alerts**: Track key level breaks
3. **Volume Alerts**: Watch for unusual activity
4. **Risk Updates**: Adjust as conditions change

### Exit Planning
1. **Technical Resistance**: Monitor key levels
2. **Whale Distribution**: Watch for selling signals
3. **Sentiment Shifts**: Track mood changes
4. **Risk Escalation**: Exit on high risk

---

## 🔧 **Error Handling**

### Standard Error Response
```json
{
  "success": false,
  "error": "Error description",
  "details": "Detailed error message",
  "request_id": "unique_request_id",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Common HTTP Status Codes
- **200**: Success
- **400**: Bad Request (invalid parameters)
- **429**: Rate Limited
- **500**: Internal Server Error
- **503**: Service Temporarily Unavailable

---

## 🎯 **Best Practices**

### 1. **Data Interpretation**
- Always check confidence scores
- Consider multiple signal types
- Account for market conditions
- Use appropriate timeframes

### 2. **Risk Management**
- Follow position sizing recommendations
- Set stop losses based on analysis
- Monitor whale activity closely
- Diversify based on risk levels

### 3. **Alert Usage**
- Set up multiple alert types
- Monitor whale movements
- Track technical levels
- Watch sentiment shifts

### 4. **Performance Optimization**
- Use appropriate timeframes
- Cache frequently accessed data
- Batch multiple requests
- Monitor rate limits

---

This comprehensive trading analysis API provides professional-grade insights for cryptocurrency traders, combining on-chain data analysis with traditional technical analysis to deliver actionable trading intelligence.