// backend/src/scripts/quickRefresh.js
require('dotenv').config();
const IncrementalSyncService = require('../services/incrementalSyncService');

async function main() {
    try {
        console.log('Starting quick incremental refresh...');
        await IncrementalSyncService.performIncrementalRefresh();
        console.log('Quick refresh completed successfully.');
    } catch (error) {
        console.error('Error during quick refresh:', error);
        process.exit(1);
    }
}

main();