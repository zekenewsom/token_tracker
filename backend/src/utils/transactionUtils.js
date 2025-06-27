const prisma = require('./prismaClient');

/**
 * Executes a database transaction with proper error handling and retry logic
 * @param {Function} transactionFn - The transaction function to execute
 * @param {Object} options - Transaction options
 * @param {number} options.maxWait - Maximum wait time for transaction (default: 5000ms)
 * @param {number} options.timeout - Transaction timeout (default: 10000ms)
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} options.retryDelay - Delay between retries in ms (default: 1000ms)
 * @param {string} options.operationName - Name of the operation for logging
 * @returns {Promise<any>} - Transaction result
 */
async function executeTransaction(transactionFn, options = {}) {
    const {
        maxWait = 5000,
        timeout = 10000,
        maxRetries = 3,
        retryDelay = 1000,
        operationName = 'Database Transaction'
    } = options;

    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[TRANSACTION] ${operationName} - Attempt ${attempt}/${maxRetries}`);
            
            const result = await prisma.$transaction(transactionFn, {
                maxWait,
                timeout,
            });
            
            console.log(`[TRANSACTION] ${operationName} - Success on attempt ${attempt}`);
            return result;
            
        } catch (error) {
            lastError = error;
            console.error(`[TRANSACTION] ${operationName} - Attempt ${attempt} failed:`, error.message);
            
            // Don't retry on certain types of errors
            if (isNonRetryableError(error)) {
                console.error(`[TRANSACTION] ${operationName} - Non-retryable error, aborting`);
                throw error;
            }
            
            if (attempt < maxRetries) {
                console.log(`[TRANSACTION] ${operationName} - Retrying in ${retryDelay}ms...`);
                await sleep(retryDelay);
            }
        }
    }
    
    console.error(`[TRANSACTION] ${operationName} - All ${maxRetries} attempts failed`);
    throw lastError;
}

/**
 * Determines if an error is non-retryable
 * @param {Error} error - The error to check
 * @returns {boolean} - True if the error should not be retried
 */
function isNonRetryableError(error) {
    // Prisma specific non-retryable errors
    const nonRetryableErrors = [
        'P2002', // Unique constraint violation
        'P2003', // Foreign key constraint violation
        'P2025', // Record not found
        'P2027', // Multiple records found
        'P2034', // Transaction failed
    ];
    
    // Check if it's a Prisma error with a non-retryable code
    if (error.code && nonRetryableErrors.includes(error.code)) {
        return true;
    }
    
    // Check for connection errors that shouldn't be retried
    if (error.message && error.message.includes('Connection')) {
        return true;
    }
    
    return false;
}

/**
 * Utility function to sleep for a given number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Batch processor for large datasets with transaction support
 * @param {Array} items - Items to process
 * @param {Function} processorFn - Function to process each item
 * @param {Object} options - Processing options
 * @param {number} options.batchSize - Number of items per batch (default: 100)
 * @param {string} options.operationName - Name of the operation for logging
 * @returns {Promise<Array>} - Results of all processed items
 */
async function processBatchWithTransaction(items, processorFn, options = {}) {
    const {
        batchSize = 100,
        operationName = 'Batch Processing'
    } = options;
    
    const results = [];
    const totalBatches = Math.ceil(items.length / batchSize);
    
    console.log(`[BATCH] ${operationName} - Processing ${items.length} items in ${totalBatches} batches`);
    
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        
        console.log(`[BATCH] ${operationName} - Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`);
        
        try {
            const batchResults = await executeTransaction(
                async (tx) => {
                    return await Promise.all(batch.map(item => processorFn(item, tx)));
                },
                {
                    operationName: `${operationName} - Batch ${batchNumber}`,
                    maxWait: 10000,
                    timeout: 30000,
                }
            );
            
            results.push(...batchResults);
            console.log(`[BATCH] ${operationName} - Batch ${batchNumber} completed successfully`);
            
        } catch (error) {
            console.error(`[BATCH] ${operationName} - Batch ${batchNumber} failed:`, error.message);
            throw error;
        }
    }
    
    console.log(`[BATCH] ${operationName} - All batches completed successfully`);
    return results;
}

/**
 * Validates transaction data before processing
 * @param {Object} data - Data to validate
 * @param {Array} requiredFields - Required field names
 * @returns {boolean} - True if data is valid
 */
function validateTransactionData(data, requiredFields) {
    for (const field of requiredFields) {
        if (data[field] === undefined || data[field] === null) {
            throw new Error(`Missing required field: ${field}`);
        }
    }
    return true;
}

module.exports = {
    executeTransaction,
    processBatchWithTransaction,
    validateTransactionData,
    isNonRetryableError,
    sleep
}; 