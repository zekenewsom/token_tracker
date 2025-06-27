// backend/src/scripts/refreshData.js
require('dotenv').config();
const { refreshDataViaRPC } = require('../services/solanaService');

async function main() {
    try {
        await refreshDataViaRPC();
        console.log('Data refresh and average cost basis calculation completed successfully.');
    } catch (error) {
        console.error('Error during data refresh or average cost basis calculation:', error);
        process.exit(1);
    }
}

main();
