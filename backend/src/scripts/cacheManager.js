require('dotenv').config();
const { 
    getCacheStats, 
    clearAllCaches,
    invalidateTokenHoldersCache,
    invalidateTopHoldersCache,
    invalidateWalletBalanceCache,
    invalidateTransactionsCache,
    invalidatePriceDataCache,
    invalidateAvgAcquisitionPriceCache
} = require('../services/cacheService');

function displayCacheStats() {
    console.log('\n📊 CACHE STATISTICS');
    console.log('==================');
    
    const stats = getCacheStats();
    
    console.log(`Token Holders Cache:`);
    console.log(`  ✓ Cached: ${stats.tokenHolders.cached ? 'Yes' : 'No'}`);
    console.log(`  ⏰ Last Updated: ${stats.tokenHolders.lastUpdated ? new Date(stats.tokenHolders.lastUpdated).toLocaleString() : 'Never'}`);
    console.log(`  ⏱️  TTL: ${Math.round(stats.tokenHolders.ttl / 1000)}s`);
    
    console.log(`\nTop Holders Cache:`);
    console.log(`  ✓ Cached: ${stats.topHolders.cached ? 'Yes' : 'No'}`);
    console.log(`  ⏰ Last Updated: ${stats.topHolders.lastUpdated ? new Date(stats.topHolders.lastUpdated).toLocaleString() : 'Never'}`);
    console.log(`  ⏱️  TTL: ${Math.round(stats.topHolders.ttl / 1000)}s`);
    
    console.log(`\nWallet Balances Cache:`);
    console.log(`  📦 Cached Entries: ${stats.walletBalances.cachedEntries}`);
    console.log(`  ⏱️  TTL: ${Math.round(stats.walletBalances.ttl / 1000)}s`);
    
    console.log(`\nTransactions Cache:`);
    console.log(`  ✓ Cached: ${stats.transactions.cached ? 'Yes' : 'No'}`);
    console.log(`  ⏰ Last Updated: ${stats.transactions.lastUpdated ? new Date(stats.transactions.lastUpdated).toLocaleString() : 'Never'}`);
    console.log(`  ⏱️  TTL: ${Math.round(stats.transactions.ttl / 1000)}s`);
    
    console.log(`\nPrice Data Cache:`);
    console.log(`  📦 Cached Entries: ${stats.priceData.cachedEntries}`);
    console.log(`  ⏱️  TTL: ${Math.round(stats.priceData.ttl / 1000)}s`);
    
    console.log(`\nAverage Acquisition Prices Cache:`);
    console.log(`  📦 Cached Entries: ${stats.avgAcquisitionPrices.cachedEntries}`);
    console.log(`  ⏱️  TTL: ${Math.round(stats.avgAcquisitionPrices.ttl / 1000)}s`);
}

function showHelp() {
    console.log('\n🔧 CACHE MANAGEMENT TOOL');
    console.log('======================');
    console.log('Usage: node src/scripts/cacheManager.js [command]');
    console.log('');
    console.log('Commands:');
    console.log('  stats                    - Show cache statistics');
    console.log('  clear-all                - Clear all caches');
    console.log('  clear-token-holders      - Clear token holders cache');
    console.log('  clear-top-holders        - Clear top holders cache');
    console.log('  clear-wallet-balances    - Clear all wallet balance caches');
    console.log('  clear-transactions       - Clear transactions cache');
    console.log('  clear-price-data         - Clear all price data caches');
    console.log('  clear-avg-prices         - Clear all average acquisition price caches');
    console.log('  help                     - Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  node src/scripts/cacheManager.js stats');
    console.log('  node src/scripts/cacheManager.js clear-all');
    console.log('  node src/scripts/cacheManager.js clear-wallet-balances');
}

async function main() {
    const command = process.argv[2] || 'help';
    
    try {
        switch (command) {
            case 'stats':
                displayCacheStats();
                break;
                
            case 'clear-all':
                console.log('🗑️  Clearing all caches...');
                clearAllCaches();
                console.log('✅ All caches cleared successfully!');
                break;
                
            case 'clear-token-holders':
                console.log('🗑️  Clearing token holders cache...');
                invalidateTokenHoldersCache();
                console.log('✅ Token holders cache cleared!');
                break;
                
            case 'clear-top-holders':
                console.log('🗑️  Clearing top holders cache...');
                invalidateTopHoldersCache();
                console.log('✅ Top holders cache cleared!');
                break;
                
            case 'clear-wallet-balances':
                console.log('🗑️  Clearing all wallet balance caches...');
                invalidateWalletBalanceCache();
                console.log('✅ All wallet balance caches cleared!');
                break;
                
            case 'clear-transactions':
                console.log('🗑️  Clearing transactions cache...');
                invalidateTransactionsCache();
                console.log('✅ Transactions cache cleared!');
                break;
                
            case 'clear-price-data':
                console.log('🗑️  Clearing all price data caches...');
                invalidatePriceDataCache();
                console.log('✅ All price data caches cleared!');
                break;
                
            case 'clear-avg-prices':
                console.log('🗑️  Clearing all average acquisition price caches...');
                invalidateAvgAcquisitionPriceCache();
                console.log('✅ All average acquisition price caches cleared!');
                break;
                
            case 'help':
            default:
                showHelp();
                break;
        }
    } catch (error) {
        console.error('❌ Error executing cache management command:', error);
        process.exit(1);
    }
}

// Run the cache manager
main(); 