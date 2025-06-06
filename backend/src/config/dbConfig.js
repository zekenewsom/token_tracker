// DB config
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(process.env.DATABASE_URL || './token_tracker.db');
module.exports = db;
