<<<<<<< HEAD
// Controller for wallet routes
const prisma = require('../utils/prismaClient');
const { 
    getCachedWalletBalance, 
    getCachedAvgAcquisitionPrice,
    invalidateWalletBalanceCache,
    invalidateAvgAcquisitionPriceCache
} = require('../services/cacheService');

exports.getWalletBalance = async (req, res) => {
  const { address } = req.params;
  
  try {
    // Use cached wallet balance if available
    const walletData = await getCachedWalletBalance(address);
    
    if (!walletData) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    res.json(walletData);
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
=======
// backend/src/controllers/walletController.js
const prisma = require('../utils/prismaClient');

// Get the current balance for a wallet from the TokenHolder table
exports.getWalletBalance = async (req, res) => {
  const { address } = req.params;

  try {
    const wallet = await prisma.wallet.findUnique({
      where: { address },
      include: {
        token_holders: {
          select: { balance: true },
        },
      },
    });

    if (!wallet || wallet.token_holders.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json({ balance: wallet.token_holders[0].balance });
  } catch (err) {
    console.error('Error fetching wallet balance:', err.message);
>>>>>>> 0124d98ad28de894f30389e000a9e15ad944f3d4
    res.status(500).json({ error: 'Failed to fetch wallet balance' });
  }
};

<<<<<<< HEAD
exports.getAvgAcquisitionPrice = async (req, res) => {
  const { address } = req.params;
  const { tokenId } = req.query; // Optional: filter by specific token
  
  try {
    // Use cached average acquisition price if available
    const avgPriceData = await getCachedAvgAcquisitionPrice(address);
    
    if (!avgPriceData) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // If tokenId is provided, filter the results
    if (tokenId) {
      const filteredHoldings = avgPriceData.individual_holdings.filter(holder => 
        holder.id === parseInt(tokenId) || holder.wallet_id === parseInt(tokenId)
      );
      
      if (filteredHoldings.length === 0) {
        return res.json({ 
          address,
          weighted_avg_price: 0,
          total_balance: 0,
          total_cost: 0,
          message: 'No matching token holdings found'
        });
      }
      
      // Recalculate for filtered holdings
      let totalWeightedCost = 0;
      let totalBalance = 0;
      let totalCost = 0;
      
      filteredHoldings.forEach(holder => {
        if (holder.balance > 0 && holder.average_acquisition_price_usd) {
          const weightedCost = holder.balance * holder.average_acquisition_price_usd;
          totalWeightedCost += weightedCost;
          totalBalance += holder.balance;
          totalCost += holder.total_cost_usd || 0;
        }
      });
      
      const weightedAvgPrice = totalBalance > 0 ? totalWeightedCost / totalBalance : 0;
      
      return res.json({
        address,
        weighted_avg_price: weightedAvgPrice,
        total_balance: totalBalance,
        total_cost: totalCost,
        token_holdings_count: filteredHoldings.length,
        individual_holdings: filteredHoldings
      });
    }
    
    res.json(avgPriceData);
  } catch (error) {
    console.error('Error calculating average acquisition price:', error);
    res.status(500).json({ error: 'Failed to calculate average acquisition price' });
=======
// Get the average acquisition price in USD for a wallet
exports.getAvgAcquisitionPrice = async (req, res) => {
  const { address } = req.params;

  try {
    const wallet = await prisma.wallet.findUnique({
      where: { address },
      include: {
        token_holders: {
          select: { average_acquisition_price_usd: true },
        },
      },
    });

    if (!wallet || wallet.token_holders.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json({ avgPrice: wallet.token_holders[0].average_acquisition_price_usd });
  } catch (err) {
    console.error('Error fetching average acquisition price:', err.message);
    res.status(500).json({ error: 'Failed to fetch average acquisition price' });
>>>>>>> 0124d98ad28de894f30389e000a9e15ad944f3d4
  }
};
