const prisma = require('../utils/prismaClient');

async function debugWallet() {
    const walletAddress = 'FQr9cK4dzHwdyGVm5M4pjN3VnPwf3W8b6Z1cskUDLQLC';
    
    console.log(`=== DEBUGGING WALLET: ${walletAddress} ===\n`);
    
    // Get wallet info
    const wallet = await prisma.wallet.findUnique({
        where: { address: walletAddress },
        include: {
            token_holders: true,
            transactions_source: {
                orderBy: { blockTime: 'asc' },
                include: {
                    destinationWallet: true
                }
            },
            transactions_destination: {
                orderBy: { blockTime: 'asc' },
                include: {
                    sourceWallet: true
                }
            }
        }
    });
    
    if (!wallet) {
        console.log('Wallet not found!');
        return;
    }
    
    console.log('WALLET INFO:');
    console.log(`ID: ${wallet.id}`);
    console.log(`Address: ${wallet.address}`);
    console.log(`Created: ${wallet.created_at}`);
    console.log('');
    
    // Token holder info
    if (wallet.token_holders.length > 0) {
        const holder = wallet.token_holders[0];
        console.log('TOKEN HOLDER DATA:');
        console.log(`Balance: ${holder.balance}`);
        console.log(`Average Acquisition Price USD: ${holder.average_acquisition_price_usd}`);
        console.log(`Total Cost USD: ${holder.total_cost_usd}`);
        console.log(`Total Tokens Acquired: ${holder.total_tokens_acquired}`);
        console.log(`Last Updated: ${holder.last_updated}`);
        console.log('');
    }
    
    // All transactions (buy/sell)
    const allTransactions = [
        ...wallet.transactions_destination.map(tx => ({ ...tx, type: 'BUY', direction: 'IN' })),
        ...wallet.transactions_source.map(tx => ({ ...tx, type: 'SELL', direction: 'OUT' }))
    ].sort((a, b) => a.blockTime - b.blockTime);
    
    console.log(`TRANSACTION HISTORY (${allTransactions.length} total):`);
    console.log('Time\t\t\tType\tAmount\t\tPrice USD\tSignature');
    console.log('='.repeat(100));
    
    let runningBalance = 0;
    let runningCost = 0;
    
    allTransactions.forEach((tx, index) => {
        const date = new Date(tx.blockTime * 1000).toISOString();
        const amount = tx.tokenAmount || 0;
        const price = tx.token_price_usd || 0;
        
        if (tx.direction === 'IN') {
            runningBalance += amount;
            runningCost += amount * price;
        } else {
            runningBalance -= amount;
            // For FIFO, we should subtract the average cost
            if (runningBalance > 0) {
                const avgCost = runningCost / (runningBalance + amount);
                runningCost -= amount * avgCost;
            }
        }
        
        const avgPrice = runningBalance > 0 ? runningCost / runningBalance : 0;
        
        console.log(`${date}\t${tx.direction}\t${amount.toFixed(2)}\t\t${price.toFixed(8)}\t${tx.signature.substring(0, 8)}...`);
        console.log(`    Running: Balance=${runningBalance.toFixed(2)}, Cost=${runningCost.toFixed(2)}, Avg=${avgPrice.toFixed(8)}`);
        
        if (index < 10 || index >= allTransactions.length - 5) {
            // Show first 10 and last 5 transactions in detail
        } else if (index === 10) {
            console.log('... (showing first 10 and last 5 transactions) ...');
        }
    });
    
    // Check for any unusual price data
    console.log('\nPRICE ANALYSIS:');
    const uniquePrices = [...new Set(allTransactions.map(tx => tx.token_price_usd))].sort((a, b) => b - a);
    console.log('Unique prices used in transactions:');
    uniquePrices.forEach(price => {
        const count = allTransactions.filter(tx => tx.token_price_usd === price).length;
        console.log(`  $${price}: ${count} transactions`);
    });
    
    // Check recent transactions
    console.log('\nRECENT TRANSACTIONS (last 5):');
    const recentTxs = allTransactions.slice(-5);
    recentTxs.forEach(tx => {
        const date = new Date(tx.blockTime * 1000).toISOString();
        console.log(`${date}: ${tx.direction} ${tx.tokenAmount} tokens at $${tx.token_price_usd} each`);
    });
    
    await prisma.$disconnect();
}

debugWallet().catch(console.error);