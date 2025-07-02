require('dotenv').config();
const heliusRpcService = require('../services/heliusRpcService');
const solanaService = require('../services/solanaService');

async function monitorRateLimits() {
    console.log('🔍 Rate Limiting Monitor Starting...\n');
    
    try {
        // Get Helius service stats
        const heliusStats = heliusRpcService.getStats();
        console.log('📊 Helius Service Statistics:');
        console.log(JSON.stringify(heliusStats, null, 2));
        
        // Get RPC endpoint status
        const rpcStatus = solanaService.getRpcEndpointStatus();
        console.log('\n🌐 RPC Endpoint Status:');
        console.log(JSON.stringify(rpcStatus, null, 2));
        
        // Test basic connectivity
        console.log('\n🧪 Testing Basic Connectivity...');
        
        try {
            const testResult = await heliusRpcService.makeRpcCall({
                jsonrpc: '2.0',
                id: '1',
                method: 'getHealth'
            });
            console.log('✅ Health check successful:', testResult);
        } catch (error) {
            console.log('❌ Health check failed:', error.message);
        }
        
        // Test token accounts fetching with small limit
        console.log('\n🧪 Testing Token Accounts Fetching...');
        try {
            const tokenAccounts = await heliusRpcService.getTokenAccounts('2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump', {
                limit: 10,
                useCache: false
            });
            console.log('✅ Token accounts test successful, found:', tokenAccounts?.token_accounts?.length || 0, 'accounts');
        } catch (error) {
            console.log('❌ Token accounts test failed:', error.message);
        }
        
        console.log('\n📈 Rate Limiting Recommendations:');
        console.log('1. If you see many rate limit errors, consider:');
        console.log('   - Reducing batch sizes further');
        console.log('   - Increasing delays between requests');
        console.log('   - Adding more backup RPC endpoints');
        console.log('2. Monitor the endpoint health status above');
        console.log('3. Check if any endpoints are in circuit breaker state');
        
    } catch (error) {
        console.error('❌ Monitor failed:', error.message);
    }
}

// Run if called directly
if (require.main === module) {
    monitorRateLimits()
        .then(() => {
            console.log('\n✅ Rate limiting monitor completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Rate limiting monitor failed:', error);
            process.exit(1);
        });
}

module.exports = { monitorRateLimits }; 