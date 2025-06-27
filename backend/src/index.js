// backend/src/index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const tokenRoutes = require('./routes/tokenRoutes');
const walletRoutes = require('./routes/walletRoutes');
const analysisRoutes = require('./routes/analysisRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/token', tokenRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/analysis', analysisRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
