#!/usr/bin/env node

// backend/scripts/setup-helius.js
require('dotenv').config();
const axios = require('axios');
const { validateConfig } = require('../src/config/heliusConfig');

console.log('🚀 Helius RPC Integration Setup\n');

async function checkEnvironment() {
    console.log('📋 Checking environment configuration...');
    
    const requiredVars = ['HELIUS_RPC_URL'];
    const optionalVars = ['HELIUS_API_KEY', 'HELIUS_BACKUP_RPC_URL_1', 'HELIUS_BACKUP_RPC_URL_2', 'HELIUS_BACKUP_RPC_URL_3'];
    
    let allGood = true;
    
    // Check required variables
    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            console.log(`❌ Missing required environment variable: ${varName}`);
            allGood = false;
        } else {
            console.log(`✅ ${varName}: Configured`);
        }
    }
    
    // Check optional variables
    for (const varName of optionalVars) {
        if (process.env[varName]) {
            console.log(`✅ ${varName}: Configured`);
        } else {
            console.log(`⚠️  ${varName}: Not configured (optional)`);
        }
    }
    
    return allGood;
}

async function validateConfiguration() {
    console.log('\n🔧 Validating Helius configuration...');
    
    try {
        validateConfig();
        console.log('✅ Configuration validation passed');
        return true;
    } catch (error) {
        console.log(`❌ Configuration validation failed: ${error.message}`);
        return false;
    }
}

async function testHeliusConnection() {
    console.log('\n🌐 Testing Helius RPC connection...');
    
    if (!process.env.HELIUS_RPC_URL) {
        console.log('❌ HELIUS_RPC_URL not configured, skipping connection test');
        return false;
    }
    
    try {
        const response = await axios.post(process.env.HELIUS_RPC_URL, {
            jsonrpc: '2.0',
            id: '1',
            method: 'getHealth'
        }, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.data.result === 'ok') {
            console.log('✅ Helius RPC connection successful');
            return true;
        } else {
            console.log(`❌ Helius RPC returned unexpected result: ${response.data.result}`);
            return false;
        }
    } catch (error) {
        console.log(`❌ Helius RPC connection failed: ${error.message}`);
        return false;
    }
}

async function testTokenAccounts() {
    console.log('\n🪙 Testing token accounts endpoint...');
    
    if (!process.env.HELIUS_RPC_URL) {
        console.log('❌ HELIUS_RPC_URL not configured, skipping token accounts test');
        return false;
    }
    
    try {
        const response = await axios.post(process.env.HELIUS_RPC_URL, {
            jsonrpc: '2.0',
            id: '1',
            method: 'getTokenAccounts',
            params: {
                mint: '2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump',
                limit: 1
            }
        }, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.data.result && response.data.result.token_accounts) {
            console.log(`✅ Token accounts endpoint working (found ${response.data.result.token_accounts.length} accounts)`);
            return true;
        } else {
            console.log('❌ Token accounts endpoint returned unexpected format');
            return false;
        }
    } catch (error) {
        console.log(`❌ Token accounts endpoint failed: ${error.message}`);
        return false;
    }
}

async function checkBackupEndpoints() {
    console.log('\n🔄 Checking backup endpoints...');
    
    const backupUrls = [
        process.env.HELIUS_BACKUP_RPC_URL_1,
        process.env.HELIUS_BACKUP_RPC_URL_2,
        process.env.HELIUS_BACKUP_RPC_URL_3
    ].filter(Boolean);
    
    if (backupUrls.length === 0) {
        console.log('⚠️  No backup endpoints configured');
        return true;
    }
    
    let workingBackups = 0;
    
    for (let i = 0; i < backupUrls.length; i++) {
        try {
            const response = await axios.post(backupUrls[i], {
                jsonrpc: '2.0',
                id: '1',
                method: 'getHealth'
            }, {
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.data.result === 'ok') {
                console.log(`✅ Backup endpoint ${i + 1}: Working`);
                workingBackups++;
            } else {
                console.log(`❌ Backup endpoint ${i + 1}: Unexpected response`);
            }
        } catch (error) {
            console.log(`❌ Backup endpoint ${i + 1}: Failed (${error.message})`);
        }
    }
    
    console.log(`📊 Backup endpoints: ${workingBackups}/${backupUrls.length} working`);
    return workingBackups > 0;
}

async function generateEnvExample() {
    console.log('\n📝 Generating .env.example file...');
    
    const envExample = `# Helius RPC Configuration
# Primary Helius RPC URL (required)
HELIUS_RPC_URL=https://rpc.helius.xyz/?api-key=YOUR_API_KEY

# Helius API Key for enhanced features (optional but recommended)
HELIUS_API_KEY=YOUR_HELIUS_API_KEY

# Backup Helius RPC URLs (optional - for redundancy)
# You can create multiple Helius endpoints for load balancing
HELIUS_BACKUP_RPC_URL_1=https://rpc.helius.xyz/?api-key=YOUR_BACKUP_API_KEY_1
HELIUS_BACKUP_RPC_URL_2=https://rpc.helius.xyz/?api-key=YOUR_BACKUP_API_KEY_2
HELIUS_BACKUP_RPC_URL_3=https://rpc.helius.xyz/?api-key=YOUR_BACKUP_API_KEY_3

# Legacy RPC Configuration (fallback)
QUICKNODE_ENDPOINT_URL=https://your-quicknode-endpoint.com

# Server Configuration
PORT=4000

# Database Configuration
DATABASE_URL="file:./dev.db"

# Optional: CoinGecko API Key for enhanced price data
COINGECKO_API_KEY=YOUR_COINGECKO_API_KEY
`;
    
    const fs = require('fs');
    const path = require('path');
    
    try {
        fs.writeFileSync(path.join(__dirname, '..', '.env.example'), envExample);
        console.log('✅ .env.example file created');
    } catch (error) {
        console.log(`❌ Failed to create .env.example: ${error.message}`);
    }
}

async function showNextSteps() {
    console.log('\n📋 Next Steps:');
    console.log('1. Start the server: npm run dev');
    console.log('2. Test the Helius API endpoints:');
    console.log('   - GET http://localhost:4000/api/helius/status');
    console.log('   - GET http://localhost:4000/api/helius/health');
    console.log('   - POST http://localhost:4000/api/helius/test-connection');
    console.log('3. Monitor the logs for Helius service activity');
    console.log('4. Check the HELIUS_INTEGRATION.md file for detailed documentation');
}

async function main() {
    try {
        const envOk = await checkEnvironment();
        const configOk = await validateConfiguration();
        const connectionOk = await testHeliusConnection();
        const tokenAccountsOk = await testTokenAccounts();
        const backupOk = await checkBackupEndpoints();
        
        await generateEnvExample();
        
        console.log('\n📊 Setup Summary:');
        console.log(`Environment: ${envOk ? '✅' : '❌'}`);
        console.log(`Configuration: ${configOk ? '✅' : '❌'}`);
        console.log(`Primary Connection: ${connectionOk ? '✅' : '❌'}`);
        console.log(`Token Accounts: ${tokenAccountsOk ? '✅' : '❌'}`);
        console.log(`Backup Endpoints: ${backupOk ? '✅' : '⚠️'}`);
        
        const overallSuccess = envOk && configOk && connectionOk && tokenAccountsOk;
        
        if (overallSuccess) {
            console.log('\n🎉 Helius integration setup completed successfully!');
        } else {
            console.log('\n⚠️  Helius integration setup completed with issues. Please review the errors above.');
        }
        
        await showNextSteps();
        
    } catch (error) {
        console.error('\n❌ Setup failed with error:', error.message);
        process.exit(1);
    }
}

// Run the setup
if (require.main === module) {
    main();
}

module.exports = {
    checkEnvironment,
    validateConfiguration,
    testHeliusConnection,
    testTokenAccounts,
    checkBackupEndpoints
}; 