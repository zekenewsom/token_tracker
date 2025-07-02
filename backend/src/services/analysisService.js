
const prisma = require('../utils/prismaClient');

const TOTAL_TOKEN_SUPPLY = 1_000_000_000;

// Holder profiling tiers based on percentage of total supply
const HOLDER_TIERS = {
    WHALE: { min: 1, name: 'Whale' }, // 1%+
    SHARK: { min: 0.1, name: 'Shark' }, // 0.1% - 1%
    DOLPHIN: { min: 0.01, name: 'Dolphin' }, // 0.01% - 0.1%
    FISH: { min: 0.001, name: 'Fish' }, // 0.001% - 0.01%
    CRAB: { min: 0, name: 'Crab' }, // < 0.001%
};

const getHolderTier = (percentage) => {
    if (percentage >= HOLDER_TIERS.WHALE.min) return HOLDER_TIERS.WHALE.name;
    if (percentage >= HOLDER_TIERS.SHARK.min) return HOLDER_TIERS.SHARK.name;
    if (percentage >= HOLDER_TIERS.DOLPHIN.min) return HOLDER_TIERS.DOLPHIN.name;
    if (percentage >= HOLDER_TIERS.FISH.min) return HOLDER_TIERS.FISH.name;
    return HOLDER_TIERS.CRAB.name;
};

class AnalysisService {
    static async getLatestTokenPrice() {
        const latestPriceEntry = await prisma.hourlyPrice.findFirst({
            orderBy: { timestamp: 'desc' },
        });
        return latestPriceEntry ? latestPriceEntry.price_usd : 0;
    }

    static async calculateHolderMetrics() {
        const [wallets, currentPrice] = await Promise.all([
            prisma.wallet.findMany({
                include: {
                    transactions_destination: true,
                    transactions_source: true,
                },
            }),
            this.getLatestTokenPrice(),
        ]);

        const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

        const holderMetrics = wallets.map(wallet => {
            const allTransactions = [
                ...wallet.transactions_destination.map(tx => ({ ...tx, type: 'buy' })),
                ...wallet.transactions_source.map(tx => ({ ...tx, type: 'sell' }))
            ].sort((a, b) => a.blockTime - b.blockTime);

            if (allTransactions.length === 0) return null;

            const totalTokensAcquired = wallet.transactions_destination.reduce((sum, tx) => sum + (tx.tokenAmount || 0), 0);
            const totalTokensSold = wallet.transactions_source.reduce((sum, tx) => sum + (tx.tokenAmount || 0), 0);
            const totalTokensHeld = totalTokensAcquired - totalTokensSold;

            if (totalTokensHeld <= 0) return null;

            const totalAcquisitionCost = wallet.transactions_destination.reduce((sum, tx) => sum + ((tx.tokenAmount || 0) * (tx.token_price_usd || 0)), 0);
            const averageAcquisitionCost = totalTokensAcquired > 0 ? totalAcquisitionCost / totalTokensAcquired : 0;
            const percentageOfTotalSupply = (totalTokensHeld / TOTAL_TOKEN_SUPPLY) * 100;
            const unrealizedPL = (currentPrice - averageAcquisitionCost) * totalTokensHeld;

            const recentBuys = allTransactions.filter(tx => tx.type === 'buy' && tx.blockTime > thirtyDaysAgo).reduce((sum, tx) => sum + tx.tokenAmount, 0);
            const recentSells = allTransactions.filter(tx => tx.type === 'sell' && tx.blockTime > thirtyDaysAgo).reduce((sum, tx) => sum + tx.tokenAmount, 0);
            const netFlow = recentBuys - recentSells;

            return {
                walletAddress: wallet.address,
                totalTokensHeld,
                averageAcquisitionCost,
                percentageOfTotalSupply,
                unrealizedPL,
                tier: getHolderTier(percentageOfTotalSupply),
                firstActivity: new Date(allTransactions[0].blockTime * 1000).toISOString(),
                lastActivity: new Date(allTransactions[allTransactions.length - 1].blockTime * 1000).toISOString(),
                netFlow30d: netFlow > 0 ? 'Buying' : netFlow < 0 ? 'Selling' : 'Holding',
            };
        }).filter(Boolean); // Remove nulls for wallets with no holdings

        holderMetrics.sort((a, b) => b.totalTokensHeld - a.totalTokensHeld);

        const top10 = holderMetrics.slice(0, 10).reduce((sum, h) => sum + h.percentageOfTotalSupply, 0);
        const top50 = holderMetrics.slice(0, 50).reduce((sum, h) => sum + h.percentageOfTotalSupply, 0);
        const top100 = holderMetrics.slice(0, 100).reduce((sum, h) => sum + h.percentageOfTotalSupply, 0);

        return {
            holders: holderMetrics,
            concentration: {
                top10: top10,
                top50: top50,
                top100: top100,
            },
            summary: {
                totalHolders: holderMetrics.length,
                currentPrice: currentPrice,
            }
        };
    }
}

module.exports = AnalysisService;
