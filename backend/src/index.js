// backend/src/index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./services/dbService');

const tokenRoutes = require('./routes/tokenRoutes');
const walletRoutes = require('./routes/walletRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/token', tokenRoutes);
app.use('/api/wallet', walletRoutes);

const PORT = process.env.PORT || 4000;

/**
 * Main function to start the server only after the database is confirmed to be ready.
 */
async function startServer() {
  try {
    // Wait for the database to be initialized before starting the server
    await initializeDatabase();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1); // Exit if the database can't be initialized
  }
}

// Run the server
startServer();
