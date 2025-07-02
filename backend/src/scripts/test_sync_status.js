const prisma = require('../utils/prismaClient');

async function checkSyncStatus() {
  const transactionCount = await prisma.transaction.count();
  const walletCount = await prisma.wallet.count();
  
  console.log('Database state:');
  console.log('Transactions:', transactionCount);
  console.log('Wallets:', walletCount);
  
  // Test a known wallet that should have transactions
  const testWallet = 'FQr9cK4dzHwdyGVm5M4pjN3VnPwf3W8b6Z1cskUDLQLC';
  
  // Check sync status using the same logic as the service
  const latestTransaction = await prisma.transaction.findFirst({
    where: {
      OR: [
        { sourceWallet: { address: testWallet } },
        { destinationWallet: { address: testWallet } },
      ],
    },
    orderBy: { blockTime: 'desc' },
  });
  
  console.log(`\nSync status for ${testWallet}:`);
  console.log('Latest transaction:', latestTransaction ? 'Found' : 'None');
  
  if (!latestTransaction) {
    console.log('✅ Should sync: YES (no transactions found)');
  } else {
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    const isRecent = latestTransaction.blockTime > oneHourAgo;
    console.log('Should sync:', !isRecent ? 'YES' : 'NO', `(transaction from ${new Date(latestTransaction.blockTime * 1000).toISOString()})`);
  }
  
  await prisma.$disconnect();
}

checkSyncStatus().catch(console.error);