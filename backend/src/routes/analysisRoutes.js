
const express = require('express');
const AnalysisController = require('../controllers/analysisController.js');

const router = express.Router();

// Route to get holder analysis
router.get('/holders', AnalysisController.getHolderAnalysis);

module.exports = router;
