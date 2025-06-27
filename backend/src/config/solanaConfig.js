// backend/src/config/solanaConfig.js

// Solana config
module.exports = {
  // We will get the RPC URL from the environment variables now
  rpcUrl: process.env.SOLANA_RPC_URL,
  // The specific token mint address we are tracking
  tokenMintAddress: '2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump',

  // --- ADD NEW CONFIGURATION FOR TEST MODE ---
  // Set to true to only process transactions and prices for the top N holders.
  // Set to false to process for all holders.
  TEST_MODE_ENABLED: true,

  // The number of top holders to process when TEST_MODE_ENABLED is true.
  TEST_MODE_TOP_N_HOLDERS: 1000,

};
