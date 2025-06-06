-- backend/db/migrations/create_schema.sql

-- Wallets table to store unique wallet addresses
CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table to store all interactions with the token
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signature TEXT UNIQUE NOT NULL,
  block_time INTEGER NOT NULL,
  -- The type of transaction (e.g., 'buy', 'sell', 'transfer')
  type TEXT NOT NULL,
  -- The wallet that initiated the transaction
  source_wallet_id INTEGER,
  -- The wallet that received the tokens/SOL
  destination_wallet_id INTEGER,
  -- Amount of the SPL token transferred
  token_amount REAL,
  -- Amount of SOL transferred (e.g., in a buy/sell)
  sol_amount REAL,
  -- Foreign key to link to the source wallet
  FOREIGN KEY (source_wallet_id) REFERENCES wallets (id),
  -- Foreign key to link to the destination wallet
  FOREIGN KEY (destination_wallet_id) REFERENCES wallets (id)
);

-- Token holders table to track current balances
CREATE TABLE IF NOT EXISTS token_holders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id INTEGER NOT NULL,
  -- Current token balance for the wallet
  balance REAL NOT NULL,
  -- Average price at which the wallet acquired its tokens
  average_acquisition_price REAL,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- A wallet can only be in this table once
  UNIQUE(wallet_id),
  FOREIGN KEY (wallet_id) REFERENCES wallets (id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_transactions_block_time ON transactions (block_time);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (type);
CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets (address);
