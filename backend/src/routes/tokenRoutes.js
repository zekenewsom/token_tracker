// backend/src/routes/tokenRoutes.js

const express = require('express');
const router = express.Router();
const tokenController = require('../controllers/tokenController');

// Route to trigger a manual data refresh
router.post('/refresh', tokenController.refresh);

// Route to get paginated transactions
router.get('/transactions', tokenController.getTransactions);

// Route to get token holders
router.get('/holders', tokenController.getTokenHolders);

// Route to get cache statistics
router.get('/cache-stats', tokenController.getCacheStats);

module.exports = router;

