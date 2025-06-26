// backend/src/controllers/tokenController.js

// Declare all imports at the top of the file
const { refreshDataViaRPC, refreshHolderData } = require('../services/solanaService');
const prisma = require('../utils/prismaClient'); // Single, correct declaration

let isRefreshing = false;

// Controller to trigger a full data refresh
exports.refresh = async (req, res) => {
  if (isRefreshing) {
    return res.status(429).json({ message: 'A refresh is already in progress.' });
  }
  isRefreshing = true;
  console.log('[LOG] Starting data refresh...');

  try {
    await refreshDataViaRPC();
    await refreshHolderData();
    res.status(200).json({ message: 'Data and token holders refreshed successfully.' });
  } catch (error) {
    console.error('Failed to refresh data:', error);
    res.status(500).json({ message: 'Failed to refresh data.' });
  } finally {
    isRefreshing = false;
    console.log('[LOG] Data refresh process finished.');
  }
};

// Controller to get all transactions from the local database
exports.getTransactions = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 100;
  const offset = (page - 1) * limit;

  try {
    const transactions = await prisma.transaction.findMany({
      skip: offset,
      take: limit,
      orderBy: { blockTime: 'desc' },
      include: {
        sourceWallet: { select: { address: true } },
        destinationWallet: { select: { address: true } }
      }
    });
    
    const result = transactions.map(t => ({
      signature: t.signature,
      block_time: t.blockTime,
      type: t.type,
      token_amount: t.tokenAmount,
      sol_amount: t.solAmount,
      source_address: t.sourceWallet ? t.sourceWallet.address : null,
      destination_address: t.destinationWallet ? t.destinationWallet.address : null
    }));
    
    res.json(result);
  } catch (err) {
    console.error('Error fetching transactions:', err.message);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

// Controller to get the top token holders from the database
exports.getTokenHolders = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;

    const holders = await prisma.tokenHolder.findMany({
      take: limit,
      orderBy: {
        balance: 'desc',
      },
      include: {
        wallet: {
          select: {
            address: true,
          },
        },
      },
    });

    const result = holders.map(h => ({
      address: h.wallet.address,
      balance: h.balance,
      average_acquisition_price_usd: h.average_acquisition_price_usd,
    }));

    res.json({ holders: result, count: result.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch token holders', details: err.message });
  }
};