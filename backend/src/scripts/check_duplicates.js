const prisma = require('../utils/prismaClient');

async function checkDuplicates() {
    const walletAddress = 'FQr9cK4dzHwdyGVm5M4pjN3VnPwf3W8b6Z1cskUDLQLC';
    
    console.log(`=== CHECKING FOR DUPLICATE TRANSACTIONS ===\n`);
    
    // Get wallet ID
    const wallet = await prisma.wallet.findUnique({
        where: { address: walletAddress }
    });
    
    if (!wallet) {
        console.log('Wallet not found!');
        return;
    }
    
    // Check for duplicate signatures
    const transactions = await prisma.transaction.findMany({
        where: {
            OR: [
                { source_wallet_id: wallet.id },
                { destination_wallet_id: wallet.id }
            ]
        },
        orderBy: { blockTime: 'asc' }
    });
    
    console.log(`Found ${transactions.length} transactions for this wallet`);
    
    // Group by signature to find duplicates
    const signatureGroups = {};
    transactions.forEach(tx => {
        if (!signatureGroups[tx.signature]) {
            signatureGroups[tx.signature] = [];
        }
        signatureGroups[tx.signature].push(tx);
    });
    
    // Find signatures with multiple transactions
    const duplicates = Object.entries(signatureGroups).filter(([sig, txs]) => txs.length > 1);
    
    if (duplicates.length > 0) {
        console.log(`\n🚨 FOUND ${duplicates.length} DUPLICATE SIGNATURES:`);
        duplicates.forEach(([signature, txs]) => {
            console.log(`\nSignature: ${signature}`);
            txs.forEach(tx => {
                const direction = tx.source_wallet_id === wallet.id ? 'OUT' : 'IN';
                const date = new Date(tx.blockTime * 1000).toISOString();
                console.log(`  ID: ${tx.id}, ${direction}, Amount: ${tx.tokenAmount}, Price: ${tx.token_price_usd}, Time: ${date}`);
            });
        });
    } else {
        console.log('\n✅ No duplicate signatures found');
    }
    
    // Check for transactions that might be both IN and OUT for the same wallet
    console.log('\n=== CHECKING FOR SAME-WALLET IN/OUT TRANSACTIONS ===');
    
    const inTransactions = await prisma.transaction.findMany({
        where: { destination_wallet_id: wallet.id }
    });
    
    const outTransactions = await prisma.transaction.findMany({
        where: { source_wallet_id: wallet.id }
    });
    
    console.log(`IN transactions: ${inTransactions.length}`);
    console.log(`OUT transactions: ${outTransactions.length}`);
    
    // Check if any signature appears in both IN and OUT
    const inSignatures = new Set(inTransactions.map(tx => tx.signature));
    const outSignatures = new Set(outTransactions.map(tx => tx.signature));
    
    const bothDirections = [...inSignatures].filter(sig => outSignatures.has(sig));
    
    if (bothDirections.length > 0) {
        console.log(`\n🚨 FOUND ${bothDirections.length} SIGNATURES IN BOTH IN AND OUT:`);
        bothDirections.forEach(signature => {
            const inTx = inTransactions.find(tx => tx.signature === signature);
            const outTx = outTransactions.find(tx => tx.signature === signature);
            console.log(`\nSignature: ${signature}`);
            console.log(`  IN: Amount=${inTx.tokenAmount}, Price=${inTx.token_price_usd}`);
            console.log(`  OUT: Amount=${outTx.tokenAmount}, Price=${outTx.token_price_usd}`);
        });
    } else {
        console.log('\n✅ No signatures found in both IN and OUT');
    }
    
    // Check the actual current balance from TokenHolder table
    const tokenHolder = await prisma.tokenHolder.findFirst({
        where: { wallet_id: wallet.id }
    });
    
    if (tokenHolder) {
        console.log('\n=== CURRENT BALANCE FROM DATABASE ===');
        console.log(`Balance: ${tokenHolder.balance}`);
        console.log(`Avg Acquisition Price: ${tokenHolder.average_acquisition_price_usd}`);
        console.log(`Total Cost: ${tokenHolder.total_cost_usd}`);
        console.log(`Total Tokens Acquired: ${tokenHolder.total_tokens_acquired}`);
    }
    
    // Calculate what the balance should be based on transactions
    let calculatedBalance = 0;
    transactions.forEach(tx => {
        if (tx.destination_wallet_id === wallet.id) {
            calculatedBalance += tx.tokenAmount || 0; // IN
        } else {
            calculatedBalance -= tx.tokenAmount || 0; // OUT
        }
    });
    
    console.log('\n=== BALANCE COMPARISON ===');
    console.log(`Database balance: ${tokenHolder?.balance || 'N/A'}`);
    console.log(`Calculated from transactions: ${calculatedBalance}`);
    console.log(`Difference: ${(tokenHolder?.balance || 0) - calculatedBalance}`);
    
    await prisma.$disconnect();
}

checkDuplicates().catch(console.error);