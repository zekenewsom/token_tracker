require('dotenv').config();
const prisma = require('../utils/prismaClient');
const { refreshDataViaRPC } = require('../services/solanaService');

async function clearAllData() {
    console.log('[CACHE REFRESH] Clearing all existing data...');
    
    try {
        // Clear all data in the correct order to respect foreign key constraints
        await prisma.transaction.deleteMany({});
        console.log('[CACHE REFRESH] ✓ Cleared all transactions');
        
        await prisma.tokenHolder.deleteMany({});
        console.log('[CACHE REFRESH] ✓ Cleared all token holders');
        
        await prisma.wallet.deleteMany({});
        console.log('[CACHE REFRESH] ✓ Cleared all wallets');
        
        await prisma.hourlyPrice.deleteMany({});
        console.log('[CACHE REFRESH] ✓ Cleared all hourly prices');
        
        console.log('[CACHE REFRESH] All data cleared successfully!');
    } catch (error) {
        console.error('[CACHE REFRESH] Error clearing data:', error);
        throw error;
    }
}

async function fullCacheRefresh() {
    console.log('🚀 Starting FULL CACHE REFRESH...');
    console.log('This will clear all existing data and rebuild everything from scratch.');
    console.log('This process may take several minutes depending on the amount of data.\n');
    
    const startTime = Date.now();
    
    try {
        // Step 1: Clear all existing data
        await clearAllData();
        
        // Step 2: Refresh all data via RPC
        console.log('\n[CACHE REFRESH] Starting data refresh via RPC...');
        await refreshDataViaRPC();
        
        // Step 3: Verify the refresh
        await verifyRefresh();
        
        const endTime = Date.now();
        const duration = Math.round((endTime - startTime) / 1000);
        
        console.log(`\n🎉 FULL CACHE REFRESH COMPLETED SUCCESSFULLY!`);
        console.log(`⏱️  Total duration: ${duration} seconds`);
        console.log(`📊 All data has been refreshed and cached for optimal performance.`);
        
    } catch (error) {
        console.error('\n❌ FULL CACHE REFRESH FAILED:', error);
        process.exit(1);
    }
}

async function verifyRefresh() {
    console.log('\n[CACHE REFRESH] Verifying refresh results...');
    
    try {
        const walletCount = await prisma.wallet.count();
        const transactionCount = await prisma.transaction.count();
        const holderCount = await prisma.tokenHolder.count();
        const priceCount = await prisma.hourlyPrice.count();
        
        console.log(`[CACHE REFRESH] ✓ Wallets: ${walletCount}`);
        console.log(`[CACHE REFRESH] ✓ Transactions: ${transactionCount}`);
        console.log(`[CACHE REFRESH] ✓ Token Holders: ${holderCount}`);
        console.log(`[CACHE REFRESH] ✓ Hourly Prices: ${priceCount}`);
        
        if (walletCount === 0 || transactionCount === 0) {
            throw new Error('Refresh verification failed: No data was loaded');
        }
        
        console.log('[CACHE REFRESH] ✓ All data verified successfully!');
        
    } catch (error) {
        console.error('[CACHE REFRESH] Verification failed:', error);
        throw error;
    }
}

// Run the full cache refresh
fullCacheRefresh(); 