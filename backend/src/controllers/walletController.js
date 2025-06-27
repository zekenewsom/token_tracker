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
    res.status(500).json({ error: 'Failed to fetch wallet balance' });
  }
};

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
  }
};
