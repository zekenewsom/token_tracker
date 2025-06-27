// backend/src/services/calculationService.js
const prisma = require('../utils/prismaClient');

async function calculateAverageCostBasis() {
    console.log('[LOG] Starting average cost basis calculation for all holders.');

    const wallets = await prisma.wallet.findMany({
        include: {
            token_holders: true,
        }
    });

    for (const wallet of wallets) {
        // Skip if wallet is not a token holder
        if (!wallet.token_holders || wallet.token_holders.length === 0) {
            continue;
        }

        const transactions = await prisma.transaction.findMany({
            where: {
                OR: [
                    { source_wallet_id: wallet.id },
                    { destination_wallet_id: wallet.id },
                ],
            },
            orderBy: {
                blockTime: 'asc',
            },
        });

        let currentTokens = 0;
        let costBasis = 0;

        for (const tx of transactions) {
            const isBuy = tx.destination_wallet_id === wallet.id;
            const tokenAmount = tx.tokenAmount || 0;
            let tokenPrice = tx.token_price_usd;

            console.log(`[DEBUG] Wallet: ${wallet.id}, Signature: ${tx.signature}, Type: ${isBuy ? 'BUY' : 'SELL/TRANSFER OUT'}`);
            console.log(`[DEBUG] Before - currentTokens: ${currentTokens}, costBasis: ${costBasis}`);

            if (isBuy) {
                if (tokenPrice === null || tokenPrice === 0) {
                    const earliestHourlyPrice = await prisma.hourlyPrice.findFirst({
                        orderBy: {
                            timestamp: 'asc',
                        },
                        select: {
                            price_usd: true,
                        }
                    });
                    tokenPrice = earliestHourlyPrice?.price_usd ?? 0.000000001; // Default to a very small value
                    console.warn(`[WARN] Using fallback price ${tokenPrice} for BUY transaction ${tx.signature} due to missing or zero price data in calculation.`);
                }
                currentTokens += tokenAmount;
                costBasis += tokenAmount * tokenPrice;
                console.log(`[DEBUG] Buy - tokenAmount: ${tokenAmount}, tokenPrice: ${tokenPrice}, costIncrease: ${tokenAmount * tokenPrice}`);
            } else { // Sell or transfer out
                const averageCost = currentTokens > 0 ? costBasis / currentTokens : 0;
                const costOfSale = tokenAmount * averageCost;
                costBasis -= costOfSale;
                currentTokens -= tokenAmount;
                console.log(`[DEBUG] Sell - tokenAmount: ${tokenAmount}, averageCost: ${averageCost}, costDecrease: ${costOfSale}`);

                // Handle cases where currentTokens goes negative due to missing initial buys
                if (currentTokens < 0) {
                    const missingAmount = Math.abs(currentTokens);
                    let virtualBuyPrice = 0.000000001; // Default very small price to avoid zero cost

                    // Try to find the price of the earliest transaction for this wallet
                    const earliestTx = await prisma.transaction.findFirst({
                        where: {
                            OR: [
                                { source_wallet_id: wallet.id },
                                { destination_wallet_id: wallet.id },
                            ],
                        },
                        orderBy: {
                            blockTime: 'asc',
                        },
                        select: {
                            token_price_usd: true,
                        }
                    });

                    if (earliestTx && earliestTx.token_price_usd !== null) {
                        virtualBuyPrice = earliestTx.token_price_usd;
                    } else {
                        // Fallback: if earliest transaction has no price, try to find the earliest price in HourlyPrice table
                        const earliestHourlyPrice = await prisma.hourlyPrice.findFirst({
                            orderBy: {
                                timestamp: 'asc',
                            },
                            select: {
                                price_usd: true,
                            }
                        });
                        if (earliestHourlyPrice) {
                            virtualBuyPrice = earliestHourlyPrice.price_usd;
                        }
                    }

<<<<<<< HEAD
                    // FIX: Properly adjust cost basis for the price difference
                    // The oversold tokens were "sold" at the current average cost, but we need to
                    // account for the fact that they should have been acquired at the virtual buy price
                    const costBasisAdjustment = missingAmount * (virtualBuyPrice - averageCost);
                    costBasis += costBasisAdjustment;
                    currentTokens = 0; // Reset to 0 after handling the oversell
                    
                    console.log(`[DEBUG] Oversell handling: missingAmount=${missingAmount}, virtualBuyPrice=${virtualBuyPrice}, averageCost=${averageCost}`);
                    console.log(`[DEBUG] Cost basis adjustment: ${costBasisAdjustment} (price difference: ${virtualBuyPrice - averageCost})`);
=======
                    // Buy the missing amount and immediately deduct it for the sale
                    costBasis += missingAmount * virtualBuyPrice;
                    costBasis -= missingAmount * virtualBuyPrice;
                    currentTokens = 0; // Reset to 0 after handling the oversell
                    console.log(`[DEBUG] Injected virtual buy and sell: missingAmount=${missingAmount}, virtualBuyPrice=${virtualBuyPrice}`);
>>>>>>> 0124d98ad28de894f30389e000a9e15ad944f3d4
                }
            }
            
            const oldCostBasis = costBasis;
            // Clamp cost basis at 0 to avoid negative values from data inconsistencies
            if (costBasis < 0) {
                costBasis = 0;
                console.log(`[DEBUG] Cost basis clamped from ${oldCostBasis} to ${costBasis}`);
            }
            console.log(`[DEBUG] After - currentTokens: ${currentTokens}, costBasis: ${costBasis}\n`);
        }

        const finalAveragePrice = currentTokens > 0 ? costBasis / currentTokens : 0;

        await prisma.tokenHolder.update({
            where: {
                wallet_id: wallet.id,
            },
            data: {
                average_acquisition_price_usd: finalAveragePrice,
                total_cost_usd: costBasis,
                total_tokens_acquired: currentTokens,
            },
        });
    }
    console.log(`[LOG] Finished calculating average cost basis for ${wallets.length} wallets.`);
}

module.exports = {
    calculateAverageCostBasis,
};
