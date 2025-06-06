// backend/src/controllers/tokenController.js

const { refreshDataViaRPC, fetchAllTokenHoldersViaHeliusDAS } = require('../services/solanaService');

// A simple in-memory flag to prevent multiple refreshes at the same time
let isRefreshing = false;

/**
 * Controller to trigger a full data refresh from the Solana blockchain using Helius RPC fallback.
 */
exports.refresh = async (req, res) => {
  if (isRefreshing) {
    return res.status(429).json({ message: 'A refresh is already in progress.' });
  }
  isRefreshing = true;
  console.log('[LOG] Starting RPC data refresh...');

  try {
    await refreshDataViaRPC();
    res.status(200).json({ message: 'Data refreshed successfully via RPC.' });
  } catch (error) {
    console.error('Failed to refresh data via RPC:', error);
    res.status(500).json({ message: 'Failed to refresh data via RPC.' });
  } finally {
    isRefreshing = false;
    console.log('[LOG] Data refresh process finished.');
  }
};

/**
 * Controller to get all transactions from the local database.
 */
const prisma = require('../utils/prismaClient');

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

    // Map Prisma results to match previous shape
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

/**
 * Controller to get the top token holders from the database.
 * NOTE: This is a placeholder and will be fully implemented in a later step.
 */
exports.getTokenHolders = async (req, res) => {
  try {
    const holders = await fetchAllTokenHoldersViaHeliusDAS();
    res.json({ holders, count: holders.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch token holders', details: err.message });
  }
};
