// backend/src/services/dbService.js

const db = require('../config/dbConfig');
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

/**
 * Initializes the database by executing the schema SQL file.
 */
function initializeDatabase() {
  // Correct the path to go up two directories from /src/services to the backend root
  const schemaPath = path.join(__dirname, '..', '..', 'db', 'migrations', 'create_schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  
  db.exec(schema, (err) => {
    if (err) {
      console.error('Error initializing database:', err.message);
    } else {
      log('Database initialized successfully.');
    }
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
 * Inserts parsed transactions into the database.
 * @param {Array<object>} transactions - An array of parsed transaction objects.
 */
async function insertTransactions(transactions) {
  const walletCache = new Map();

  const getWalletId = (address) => {
    return new Promise((resolve, reject) => {
      if (!address) return resolve(null);
      if (walletCache.has(address)) {
        return resolve(walletCache.get(address));
      }
      db.get('SELECT id FROM wallets WHERE address = ?', [address], (err, row) => {
        if (err) return reject(err);
        if (row) {
          walletCache.set(address, row.id);
          resolve(row.id);
        } else {
          db.run('INSERT INTO wallets (address) VALUES (?)', [address], function (err) {
            if (err) return reject(err);
            const newId = this.lastID;
            walletCache.set(address, newId);
            resolve(newId);
          });
        }
      });
    });
  };

  const insertTxStmt = db.prepare(
    'INSERT OR IGNORE INTO transactions (signature, block_time, type, source_wallet_id, destination_wallet_id, token_amount, sol_amount) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  
  log(`Inserting ${transactions.length} transactions into the database...`);

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    const promises = transactions.map(async (tx) => {
      const sourceId = await getWalletId(tx.source);
      const destId = await getWalletId(tx.destination);
      
      insertTxStmt.run(tx.signature, tx.blockTime, tx.type, sourceId, destId, tx.tokenAmount, tx.solAmount);
    });

    Promise.all(promises).then(() => {
        insertTxStmt.finalize((err) => {
            if (err) {
                console.error('Error finalizing transaction insert:', err);
                db.run("ROLLBACK");
            } else {
                db.run("COMMIT");
                log('Finished inserting transactions.');
            }
        });
    }).catch(err => {
        console.error("Error during transaction insertion: ", err);
        db.run("ROLLBACK");
    });
  });
}

module.exports = {
  initializeDatabase,
  clearDatabase,
  insertTransactions
};
