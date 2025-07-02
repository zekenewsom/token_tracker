
const express = require('express');
const AnalysisController = require('../controllers/analysisController.js');
const AdvancedAnalysisController = require('../controllers/advancedAnalysisController.js');

const router = express.Router();

// Legacy route (keep for backward compatibility)
router.get('/holders', AnalysisController.getHolderAnalysis);

// Comprehensive trading analysis routes
router.get('/comprehensive', AdvancedAnalysisController.getComprehensiveHolderAnalysis);
router.get('/whale-analysis', AdvancedAnalysisController.getWhaleAnalysis);
router.get('/trading-insights', AdvancedAnalysisController.getTradingInsights);
router.get('/whale-alerts', AdvancedAnalysisController.getWhaleAlerts);
router.get('/market-sentiment', AdvancedAnalysisController.getMarketSentiment);
router.get('/trading-dashboard', AdvancedAnalysisController.getTradingDashboard);
router.get('/holder-distribution', AdvancedAnalysisController.getHolderDistribution);
router.get('/risk-assessment', AdvancedAnalysisController.getRiskAssessment);

// Market data and technical analysis routes
router.get('/market-data', AdvancedAnalysisController.getMarketData);
router.get('/technical-analysis', AdvancedAnalysisController.getTechnicalAnalysis);
router.get('/price-volume-alerts', AdvancedAnalysisController.getPriceVolumeAlerts);
router.get('/complete-dashboard', AdvancedAnalysisController.getCompleteTradingDashboard);

// Whale tracking
router.post('/track-whale/:address', AdvancedAnalysisController.trackWhale);

// Data export
router.get('/export', AdvancedAnalysisController.exportAnalysisData);

module.exports = router;
