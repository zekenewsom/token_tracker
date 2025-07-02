const prisma = require('../utils/prismaClient');

async function testDeduplication() {
  const wallet = await prisma.wallet.findUnique({
    where: { address: 'FQr9cK4dzHwdyGVm5M4pjN3VnPwf3W8b6Z1cskUDLQLC' }
  });
  
  const allTransactions = await prisma.transaction.findMany({
    where: {
      OR: [
        { source_wallet_id: wallet.id },
        { destination_wallet_id: wallet.id },
      ],
    },
    orderBy: { blockTime: 'asc' },
  });
  
  console.log(`Total transactions before deduplication: ${allTransactions.length}`);
  
  // Apply same deduplication logic
  const transactionMap = new Map();
  allTransactions.forEach(tx => {
    const existing = transactionMap.get(tx.signature);
    if (!existing) {
      transactionMap.set(tx.signature, tx);
    } else {
      if (tx.destination_wallet_id === wallet.id) {
        transactionMap.set(tx.signature, tx);
      }
    }
  });
  
  const transactions = Array.from(transactionMap.values()).sort((a, b) => a.blockTime - b.blockTime);
  console.log(`Total transactions after deduplication: ${transactions.length}`);
  
  let balance = 0;
  console.log('\nTransaction flow:');
  transactions.forEach(tx => {
    const isBuy = tx.destination_wallet_id === wallet.id;
    const amount = tx.tokenAmount || 0;
    if (isBuy) {
      balance += amount;
    } else {
      balance -= amount;
    }
    console.log(`${tx.signature.slice(0,8)}... ${isBuy ? '+' : '-'}${amount} = ${balance.toFixed(2)}`);
  });
  
  console.log(`\nFinal calculated balance: ${balance}`);
  console.log(`Expected balance: 32043193.934614`);
  console.log(`Match: ${Math.abs(balance - 32043193.934614) < 1 ? 'YES' : 'NO'}`);
  
  await prisma.$disconnect();
}

testDeduplication().catch(console.error);