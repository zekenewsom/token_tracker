// Controller for wallet routes
const prisma = require('../utils/prismaClient');

exports.getWalletBalance = async (req, res) => {
  const { address } = req.params;
  
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { address },
      include: {
        token_holders: {
          select: {
            balance: true,
            average_acquisition_price_usd: true,
            total_cost_usd: true,
            total_tokens_acquired: true
          }
        }
      }
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Calculate total balance across all token holdings
    const totalBalance = wallet.token_holders.reduce((sum, holder) => sum + holder.balance, 0);
    
    res.json({ 
      address,
      total_balance: totalBalance,
      token_holdings: wallet.token_holders.map(holder => ({
        balance: holder.balance,
        average_acquisition_price_usd: holder.average_acquisition_price_usd,
        total_cost_usd: holder.total_cost_usd,
        total_tokens_acquired: holder.total_tokens_acquired
      }))
    });
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    res.status(500).json({ error: 'Failed to fetch wallet balance' });
  }
};

exports.getAvgAcquisitionPrice = async (req, res) => {
  const { address } = req.params;
  const { tokenId } = req.query; // Optional: filter by specific token
  
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { address },
      include: {
        token_holders: {
          select: {
            balance: true,
            average_acquisition_price_usd: true,
            total_cost_usd: true,
            total_tokens_acquired: true
          }
        }
      }
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    if (wallet.token_holders.length === 0) {
      return res.json({ 
        address,
        weighted_avg_price: 0,
        total_balance: 0,
        total_cost: 0,
        message: 'No token holdings found for this wallet'
      });
    }

    // Filter by specific token if tokenId is provided
    let relevantHolders = wallet.token_holders;
    if (tokenId) {
      // Note: This assumes tokenId filtering - you may need to adjust based on your actual token identification
      relevantHolders = wallet.token_holders.filter(holder => 
        holder.id === parseInt(tokenId) || holder.wallet_id === parseInt(tokenId)
      );
    }

    if (relevantHolders.length === 0) {
      return res.json({ 
        address,
        weighted_avg_price: 0,
        total_balance: 0,
        total_cost: 0,
        message: 'No matching token holdings found'
      });
    }

    // Calculate weighted average acquisition price
    let totalWeightedCost = 0;
    let totalBalance = 0;
    let totalCost = 0;

    relevantHolders.forEach(holder => {
      if (holder.balance > 0 && holder.average_acquisition_price_usd) {
        const weightedCost = holder.balance * holder.average_acquisition_price_usd;
        totalWeightedCost += weightedCost;
        totalBalance += holder.balance;
        totalCost += holder.total_cost_usd || 0;
      }
    });

    const weightedAvgPrice = totalBalance > 0 ? totalWeightedCost / totalBalance : 0;

    res.json({
      address,
      weighted_avg_price: weightedAvgPrice,
      total_balance: totalBalance,
      total_cost: totalCost,
      token_holdings_count: relevantHolders.length,
      individual_holdings: relevantHolders.map(holder => ({
        balance: holder.balance,
        average_acquisition_price_usd: holder.average_acquisition_price_usd,
        total_cost_usd: holder.total_cost_usd,
        total_tokens_acquired: holder.total_tokens_acquired
      }))
    });
  } catch (error) {
    console.error('Error calculating average acquisition price:', error);
    res.status(500).json({ error: 'Failed to calculate average acquisition price' });
  }
};
