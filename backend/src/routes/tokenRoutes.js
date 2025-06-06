const express = require('express');
const router = express.Router();
const tokenController = require('../controllers/tokenController');
router.get('/holders', tokenController.getHolders);
router.get('/transactions', tokenController.getTransactions);
module.exports = router;
