const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
router.get('/:address/balance', walletController.getWalletBalance);
router.get('/:address/avg-price', walletController.getAvgAcquisitionPrice);
module.exports = router;
