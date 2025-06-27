# Backend Transaction Optimization

This document outlines the implementation of atomic database transactions in the Token Tracker backend to ensure data consistency and prevent partial updates.

## Overview

The Token Tracker backend now uses Prisma transactions to ensure that all related database operations are executed atomically. This prevents data inconsistencies that could occur if some operations succeed while others fail.

## Problems Solved

### Before Optimization
- **Partial Updates**: If wallet creation succeeded but transaction creation failed, the database would be left in an inconsistent state
- **Race Conditions**: Multiple concurrent operations could create duplicate records or inconsistent data
- **No Rollback**: Failed operations couldn't be rolled back, leaving orphaned data
- **Poor Error Handling**: No retry logic or proper error classification

### After Optimization
- **Atomic Operations**: All related operations succeed or fail together
- **Data Consistency**: Database state remains consistent even on failures
- **Automatic Rollback**: Failed transactions are automatically rolled back
- **Robust Error Handling**: Retry logic with proper error classification

## Implementation Details

### 1. Transaction Wrapper Utility

Created `utils/transactionUtils.js` with the following features:

```javascript
// Execute transaction with retry logic
await executeTransaction(async (tx) => {
    // All database operations here
}, {
    operationName: 'Operation Name',
    maxWait: 10000,
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000
});
```

**Features:**
- **Retry Logic**: Automatically retries failed transactions
- **Error Classification**: Distinguishes between retryable and non-retryable errors
- **Timeout Management**: Configurable timeouts for different operations
- **Comprehensive Logging**: Detailed logging for debugging and monitoring

### 2. Error Classification

The system classifies errors into retryable and non-retryable:

**Non-Retryable Errors:**
- `P2002`: Unique constraint violation
- `P2003`: Foreign key constraint violation
- `P2025`: Record not found
- `P2027`: Multiple records found
- `P2034`: Transaction failed
- Connection errors

**Retryable Errors:**
- Deadlocks
- Temporary network issues
- Database overload

### 3. Batch Processing

For large datasets, the system uses batch processing with transaction support:

```javascript
await processBatchWithTransaction(items, async (item, tx) => {
    // Process individual item within transaction
}, {
    batchSize: 100,
    operationName: 'Batch Processing'
});
```

## Optimized Functions

### 1. `refreshHolderData()`

**Before:**
```javascript
// Multiple separate operations
const existingWallets = await prisma.wallet.findMany({...});
await prisma.wallet.createMany({...});
const newWallets = await prisma.wallet.findMany({...});
await Promise.all(upsertPromises);
```

**After:**
```javascript
await executeTransaction(async (tx) => {
    const existingWallets = await tx.wallet.findMany({...});
    await tx.wallet.createMany({...});
    const newWallets = await tx.wallet.findMany({...});
    await Promise.all(upsertPromises);
}, {
    operationName: 'Refresh Holder Data',
    maxWait: 10000,
    timeout: 30000,
});
```

### 2. Transaction Processing

**Before:**
```javascript
// Separate wallet creation and transaction processing
await prisma.wallet.createMany({...});
const newWallets = await prisma.wallet.findMany({...});
for (const tx of transactionsToProcess) {
    await prisma.transaction.upsert({...});
}
```

**After:**
```javascript
await executeTransaction(async (tx) => {
    // All operations within single transaction
    await tx.wallet.createMany({...});
    const newWallets = await tx.wallet.findMany({...});
    const transactionPromises = transactionsToProcess.map(async (txData) => {
        return tx.transaction.upsert({...});
    });
    await Promise.all(transactionPromises);
}, {
    operationName: 'Process Transactions',
    maxWait: 15000,
    timeout: 60000,
});
```

## Performance Considerations

### 1. Transaction Timeouts

Different operations have different timeout requirements:

- **Holder Data Refresh**: 30 seconds (large dataset)
- **Transaction Processing**: 60 seconds (complex operations)
- **Standard Operations**: 10 seconds (simple operations)

### 2. Batch Sizes

- **Default Batch Size**: 100 items per batch
- **Configurable**: Can be adjusted based on data size and performance requirements
- **Memory Efficient**: Processes large datasets without memory issues

### 3. Retry Strategy

- **Max Retries**: 3 attempts per operation
- **Retry Delay**: 1 second between retries
- **Exponential Backoff**: Future enhancement for better retry strategy

## Monitoring and Logging

### 1. Transaction Logging

```javascript
[TRANSACTION] Refresh Holder Data - Attempt 1/3
[TRANSACTION] Refresh Holder Data - Success on attempt 1
[TRANSACTION] Process Transactions - Attempt 1/3
[TRANSACTION] Process Transactions - Success on attempt 1
```

### 2. Error Logging

```javascript
[TRANSACTION] Operation Name - Attempt 1 failed: Connection timeout
[TRANSACTION] Operation Name - Retrying in 1000ms...
[TRANSACTION] Operation Name - Non-retryable error, aborting
```

### 3. Batch Processing Logging

```javascript
[BATCH] Batch Processing - Processing 1000 items in 10 batches
[BATCH] Batch Processing - Processing batch 1/10 (100 items)
[BATCH] Batch Processing - Batch 1 completed successfully
```

## Database Schema Considerations

### 1. Indexes

Ensure proper indexes for transaction performance:

```sql
-- Wallet address index for fast lookups
CREATE INDEX idx_wallet_address ON wallet(address);

-- Transaction signature index for upserts
CREATE INDEX idx_transaction_signature ON transaction(signature);

-- Composite indexes for common queries
CREATE INDEX idx_token_holder_wallet_balance ON token_holder(wallet_id, balance);
```

### 2. Constraints

Proper constraints ensure data integrity:

```sql
-- Unique constraints
ALTER TABLE wallet ADD CONSTRAINT uk_wallet_address UNIQUE (address);
ALTER TABLE transaction ADD CONSTRAINT uk_transaction_signature UNIQUE (signature);

-- Foreign key constraints
ALTER TABLE token_holder ADD CONSTRAINT fk_token_holder_wallet 
    FOREIGN KEY (wallet_id) REFERENCES wallet(id);
ALTER TABLE transaction ADD CONSTRAINT fk_transaction_source_wallet 
    FOREIGN KEY (source_wallet_id) REFERENCES wallet(id);
```

## Testing Strategy

### 1. Unit Tests

```javascript
describe('Transaction Utils', () => {
    test('should retry on retryable errors', async () => {
        // Test retry logic
    });
    
    test('should not retry on non-retryable errors', async () => {
        // Test error classification
    });
    
    test('should handle transaction timeouts', async () => {
        // Test timeout handling
    });
});
```

### 2. Integration Tests

```javascript
describe('Database Transactions', () => {
    test('should rollback on partial failure', async () => {
        // Test atomicity
    });
    
    test('should handle concurrent operations', async () => {
        // Test race condition handling
    });
});
```

### 3. Load Tests

```javascript
describe('Performance Tests', () => {
    test('should handle large datasets', async () => {
        // Test with 10,000+ records
    });
    
    test('should maintain performance under load', async () => {
        // Test concurrent operations
    });
});
```

## Future Enhancements

### 1. Advanced Retry Strategies

- **Exponential Backoff**: Increase delay between retries
- **Circuit Breaker**: Stop retrying after too many failures
- **Jitter**: Add randomness to retry delays

### 2. Monitoring and Alerting

- **Transaction Metrics**: Track success/failure rates
- **Performance Monitoring**: Monitor transaction duration
- **Alerting**: Alert on repeated failures

### 3. Optimizations

- **Connection Pooling**: Optimize database connections
- **Query Optimization**: Further optimize database queries
- **Caching**: Add caching layer for frequently accessed data

## Best Practices

### 1. Transaction Design

- **Keep transactions small**: Don't include unnecessary operations
- **Use appropriate timeouts**: Set realistic timeouts for operations
- **Handle errors gracefully**: Always have proper error handling

### 2. Performance

- **Batch operations**: Use batch processing for large datasets
- **Optimize queries**: Ensure efficient database queries
- **Monitor performance**: Track transaction performance metrics

### 3. Reliability

- **Test thoroughly**: Test all transaction scenarios
- **Monitor in production**: Track transaction success rates
- **Have fallback plans**: Plan for transaction failures

## Conclusion

The implementation of atomic database transactions significantly improves the reliability and consistency of the Token Tracker backend. The system now handles failures gracefully, prevents data inconsistencies, and provides comprehensive monitoring and logging for debugging and optimization.

Key benefits:
- **Data Consistency**: All operations succeed or fail together
- **Reliability**: Robust error handling and retry logic
- **Performance**: Optimized batch processing and timeouts
- **Monitoring**: Comprehensive logging and metrics
- **Maintainability**: Clean, reusable transaction utilities 