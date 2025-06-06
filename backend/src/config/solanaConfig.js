// backend/src/config/solanaConfig.js

// Solana config
module.exports = {
  // We will get the RPC URL from the environment variables now
  rpcUrl: process.env.SOLANA_RPC_URL,
  // The specific token mint address we are tracking
  tokenMintAddress: '2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump',
};
