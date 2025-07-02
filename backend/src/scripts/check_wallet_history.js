const prisma = require('../utils/prismaClient');

async function checkWalletHistory() {
    const walletAddress = 'FQr9cK4dzHwdyGVm5M4pjN3VnPwf3W8b6Z1cskUDLQLC';
    
    console.log(`=== CHECKING WALLET TRANSACTION HISTORY COMPLETENESS ===\n`);
    
    const wallet = await prisma.wallet.findUnique({
        where: { address: walletAddress }
    });
    
    if (!wallet) {
        console.log('Wallet not found!');
        return;
    }
    
    // Get the earliest and latest transactions
    const transactions = await prisma.transaction.findMany({
        where: {
            OR: [
                { source_wallet_id: wallet.id },
                { destination_wallet_id: wallet.id }
            ]
        },
        orderBy: { blockTime: 'asc' }
    });
    
    if (transactions.length === 0) {
        console.log('No transactions found for this wallet!');
        return;
    }
    
    const earliestTx = transactions[0];
    const latestTx = transactions[transactions.length - 1];
    
    console.log('TRANSACTION TIMELINE:');
    console.log(`Earliest transaction: ${new Date(earliestTx.blockTime * 1000).toISOString()}`);
    console.log(`Latest transaction: ${new Date(latestTx.blockTime * 1000).toISOString()}`);
    console.log(`Total transactions captured: ${transactions.length}`);
    console.log('');
    
    // Calculate balance progression
    console.log('BALANCE PROGRESSION:');
    let runningBalance = 0;
    let suspiciousTransactions = [];
    
    transactions.forEach((tx, index) => {
        const prevBalance = runningBalance;
        
        if (tx.destination_wallet_id === wallet.id) {
            runningBalance += tx.tokenAmount || 0; // IN
        } else {
            runningBalance -= tx.tokenAmount || 0; // OUT
        }
        
        const date = new Date(tx.blockTime * 1000).toISOString();
        const direction = tx.destination_wallet_id === wallet.id ? 'IN' : 'OUT';
        
        // Check for suspicious patterns
        if (runningBalance < 0 && direction === 'OUT') {
            suspiciousTransactions.push({
                index,
                signature: tx.signature,
                date,
                direction,
                amount: tx.tokenAmount,
                balanceBefore: prevBalance,
                balanceAfter: runningBalance
            });
        }
        
        if (index < 5 || index >= transactions.length - 5 || runningBalance < 0) {
            console.log(`${index + 1}. ${date} ${direction} ${(tx.tokenAmount || 0).toFixed(2)} → Balance: ${runningBalance.toFixed(2)}`);
        } else if (index === 5) {
            console.log('... (middle transactions omitted) ...');
        }
    });
    
    console.log('\n=== SUSPICIOUS TRANSACTIONS (selling more than owned) ===');
    if (suspiciousTransactions.length > 0) {
        suspiciousTransactions.forEach(tx => {
            console.log(`${tx.index + 1}. ${tx.date}`);
            console.log(`   ${tx.direction} ${tx.amount} tokens`);
            console.log(`   Balance before: ${tx.balanceBefore.toFixed(2)}`);
            console.log(`   Balance after: ${tx.balanceAfter.toFixed(2)} (NEGATIVE!)`);
            console.log(`   Signature: ${tx.signature}`);
            console.log('');
        });
    } else {
        console.log('No suspicious transactions found');
    }
    
    // Check if this wallet appears in any earlier time periods where we might have missed transactions
    console.log('=== CHECKING FOR MISSING EARLY HISTORY ===');
    
    // Look for any transactions involving this wallet before our earliest captured transaction
    const veryEarlyTx = await prisma.transaction.findFirst({
        where: {
            AND: [
                {
                    OR: [
                        { source_wallet_id: wallet.id },
                        { destination_wallet_id: wallet.id }
                    ]
                },
                { blockTime: { lt: earliestTx.blockTime } }
            ]
        },
        orderBy: { blockTime: 'asc' }
    });
    
    if (veryEarlyTx) {
        console.log(`🚨 Found even earlier transaction: ${new Date(veryEarlyTx.blockTime * 1000).toISOString()}`);
        console.log(`   This suggests our transaction sync is incomplete!`);
    } else {
        console.log('✅ No earlier transactions found in our database');
    }
    
    // Get the current TokenHolder data
    const tokenHolder = await prisma.tokenHolder.findFirst({
        where: { wallet_id: wallet.id }
    });
    
    console.log('\n=== SUMMARY ===');
    console.log(`Current database balance: ${tokenHolder?.balance || 'N/A'}`);
    console.log(`Calculated from transactions: ${runningBalance.toFixed(2)}`);
    console.log(`Missing tokens: ${((tokenHolder?.balance || 0) - runningBalance).toFixed(2)}`);
    console.log(`Suspicious transactions: ${suspiciousTransactions.length}`);
    
    if (Math.abs((tokenHolder?.balance || 0) - runningBalance) > 1000000) {
        console.log('\n🚨 MAJOR DISCREPANCY DETECTED!');
        console.log('This wallet likely has significant missing transaction history.');
        console.log('The balance from Helius DAS differs drastically from transaction history.');
        console.log('This suggests either:');
        console.log('1. Many early transactions are missing from our sync');
        console.log('2. There was a large initial balance not captured in transactions');
        console.log('3. Token transfers happened through mechanisms not captured by standard RPC calls');
    }
    
    await prisma.$disconnect();
}

checkWalletHistory().catch(console.error);