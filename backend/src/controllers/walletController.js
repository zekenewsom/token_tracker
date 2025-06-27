// backend/src/controllers/walletController.js
const prisma = require('../utils/prismaClient');

// Get the current balance for a wallet from the TokenHolder table
exports.getWalletBalance = async (req, res) => {
  const { address } = req.params;

  try {
    const wallet = await prisma.wallet.findUnique({
      where: { address },
      include: {
        token_holders: {
          select: { balance: true },
        },
      },
    });

    if (!wallet || wallet.token_holders.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json({ balance: wallet.token_holders[0].balance });
  } catch (err) {
    console.error('Error fetching wallet balance:', err.message);
    res.status(500).json({ error: 'Failed to fetch wallet balance' });
  }
};

// Get the average acquisition price in USD for a wallet
exports.getAvgAcquisitionPrice = async (req, res) => {
  const { address } = req.params;

  try {
    const wallet = await prisma.wallet.findUnique({
      where: { address },
      include: {
        token_holders: {
          select: { average_acquisition_price_usd: true },
        },
      },
    });

    if (!wallet || wallet.token_holders.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json({ avgPrice: wallet.token_holders[0].average_acquisition_price_usd });
  } catch (err) {
    console.error('Error fetching average acquisition price:', err.message);
    res.status(500).json({ error: 'Failed to fetch average acquisition price' });
  }
};
