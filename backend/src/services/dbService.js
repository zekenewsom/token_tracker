// backend/src/services/dbService.js

const db = require('../config/dbConfig');
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

/**
 * Initializes the database by executing the schema SQL file.
 * This now correctly returns a Promise that resolves only when the schema is applied.
 */
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const schemaPath = path.join(__dirname, '..', '..', 'db', 'migrations', 'create_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    db.exec(schema, (err) => {
      if (err) {
        console.error('Error initializing database:', err.message);
        return reject(err);
      }
      log('Database initialized successfully.');
      resolve();
    });
  });
}

/**
 * Clears all data from the tables for a clean refresh.
 */
function clearDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DELETE FROM transactions', (err) => {
        if (err) return reject(err);
      });
      db.run('DELETE FROM token_holders', (err) => {
        if (err) return reject(err);
      });
      db.run('DELETE FROM wallets', (err) => {
        if (err) return reject(err);
        log('Database cleared.');
        resolve();
      });
    });
  });
}

/**
 * Inserts parsed transactions into the database using a transaction for performance.
 * @param {Array<object>} transactions - An array of parsed transaction objects.
 */
function insertTransactions(transactions) {
  return new Promise((resolve, reject) => {
    const walletCache = new Map();

    const getWalletId = (address) => {
      return new Promise((resolveGet, rejectGet) => {
        if (!address) return resolveGet(null);
        if (walletCache.has(address)) {
          return resolveGet(walletCache.get(address));
        }
        db.get('SELECT id FROM wallets WHERE address = ?', [address], (err, row) => {
          if (err) return rejectGet(err);
          if (row) {
            walletCache.set(address, row.id);
            resolveGet(row.id);
          } else {
            db.run('INSERT INTO wallets (address) VALUES (?)', [address], function(err) {
              if (err) return rejectGet(err);
              const newId = this.lastID;
              walletCache.set(address, newId);
              resolveGet(newId);
            });
          }
        });
      });
    };

    const insertTxStmt = db.prepare(
      'INSERT OR IGNORE INTO transactions (signature, block_time, type, source_wallet_id, destination_wallet_id, token_amount, sol_amount) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    db.run("BEGIN TRANSACTION", async (err) => {
      if (err) return reject(err);

      try {
        for (const tx of transactions) {
          const sourceId = await getWalletId(tx.source);
          const destId = await getWalletId(tx.destination);
          insertTxStmt.run(tx.signature, tx.blockTime, tx.type, sourceId, destId, tx.tokenAmount, tx.solAmount);
        }

        insertTxStmt.finalize((finalizeErr) => {
          if (finalizeErr) {
            db.run("ROLLBACK", () => reject(finalizeErr));
          } else {
            db.run("COMMIT", (commitErr) => {
              if (commitErr) {
                db.run("ROLLBACK", () => reject(commitErr));
              } else {
                log('Finished inserting transactions.');
                resolve();
              }
            });
          }
        });
      } catch (runErr) {
        console.error("Error during transaction insertion: ", runErr);
        db.run("ROLLBACK", () => reject(runErr));
      }
    });
  });
}

module.exports = {
  initializeDatabase,
  clearDatabase,
  insertTransactions
};
