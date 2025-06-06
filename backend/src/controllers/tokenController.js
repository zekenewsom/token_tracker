// backend/src/controllers/tokenController.js

const { fetchTokenTransactions } = require('../services/solanaService');
const { clearDatabase, insertTransactions } = require('../services/dbService');
const { log } = require('../utils/logger');
const db = require('../config/dbConfig');

// A simple in-memory flag to prevent multiple refreshes at the same time
let isRefreshing = false;

/**
 * Controller to trigger a full data refresh from the Solana blockchain.
 */
exports.refreshData = async (req, res) => {
  if (isRefreshing) {
    return res.status(429).json({ message: 'A refresh is already in progress.' });
  }
  isRefreshing = true;
  log('Starting data refresh...');

  try {
    // 1. Clear existing data
    await clearDatabase();
    log('Database cleared.');

    // 2. Fetch all transactions from the blockchain
    const transactions = await fetchTokenTransactions();
    log(`Fetched ${transactions.length} transactions.`);

    // 3. Insert new data into the database
    if (transactions.length > 0) {
      await insertTransactions(transactions);
      log('Transactions inserted successfully.');
    }

    res.status(200).json({ message: 'Data refreshed successfully.', transactionCount: transactions.length });
  } catch (error) {
    console.error('Failed to refresh data:', error);
    res.status(500).json({ message: 'Failed to refresh data.' });
  } finally {
    isRefreshing = false;
    log('Data refresh process finished.');
  }
};

/**
 * Controller to get all transactions from the local database.
 */
exports.getTransactions = (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 100;
  const offset = (page - 1) * limit;

  const query = `
    SELECT 
      t.signature, 
      t.block_time, 
      t.type, 
      t.token_amount,
      t.sol_amount,
      sw.address as source_address,
      dw.address as destination_address
    FROM transactions t
    LEFT JOIN wallets sw ON t.source_wallet_id = sw.id
    LEFT JOIN wallets dw ON t.destination_wallet_id = dw.id
    ORDER BY t.block_time DESC
    LIMIT ? OFFSET ?
  `;

  db.all(query, [limit, offset], (err, rows) => {
    if (err) {
      console.error('Error fetching transactions:', err.message);
      return res.status(500).json({ error: 'Failed to fetch transactions' });
    }
    res.json(rows);
  });
};

/**
 * Controller to get the top token holders from the database.
 * NOTE: This is a placeholder and will be fully implemented in a later step.
 */
exports.getHolders = (req, res) => {
  // TODO: Implement the logic to calculate and query holder data
  // from the token_holders table after it's populated.
  res.json({ holders: [] });
};
