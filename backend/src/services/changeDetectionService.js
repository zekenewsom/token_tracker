const prisma = require('../utils/prismaClient');
const crypto = require('crypto');
const databaseCache = require('./databaseCacheService');

class ChangeDetectionService {
    constructor() {
        this.hashTypes = {
            HOLDER_LIST: 'holder_list',
            TOP_50_HOLDERS: 'top_50_holders',
            TOP_100_HOLDERS: 'top_100_holders',
            PRICE_DATA: 'price_data'
        };
    }

    /**
     * Generate a hash from data for change detection
     * @param {any} data - Data to hash
     * @returns {string} - SHA256 hash
     */
    generateHash(data) {
        return crypto.createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex');
    }

    /**
     * Get current hash for a specific type
     * @param {string} hashType - Type of hash to retrieve
     * @returns {string|null} - Current hash or null if not found
     */
    async getCurrentHash(hashType) {
        try {
            const entry = await prisma.changeDetectionHash.findUnique({
                where: { hash_type: hashType }
            });
            return entry?.current_hash || null;
        } catch (error) {
            console.error(`[CHANGE-DETECT] Error getting hash for ${hashType}:`, error.message);
            return null;
        }
    }

    /**
     * Update hash for a specific type
     * @param {string} hashType - Type of hash to update
     * @param {string} newHash - New hash value
     */
    async updateHash(hashType, newHash) {
        try {
            await prisma.changeDetectionHash.upsert({
                where: { hash_type: hashType },
                update: { 
                    current_hash: newHash,
                    last_updated: new Date()
                },
                create: { 
                    hash_type: hashType,
                    current_hash: newHash 
                }
            });
            console.log(`[CHANGE-DETECT] Updated hash for ${hashType}: ${newHash.substring(0, 8)}...`);
        } catch (error) {
            console.error(`[CHANGE-DETECT] Error updating hash for ${hashType}:`, error.message);
        }
    }

    /**
     * Check if holder list has changed by comparing top holders
     * @param {number} topN - Number of top holders to check (default: 50)
     * @returns {boolean} - True if changed, false otherwise
     */
    async hasHolderListChanged(topN = 50) {
        try {
            console.log(`[CHANGE-DETECT] Checking if top ${topN} holders have changed...`);
            
            // Get current top N holders
            const currentHolders = await prisma.tokenHolder.findMany({
                take: topN,
                orderBy: { balance: 'desc' },
                select: {
                    wallet_id: true,
                    balance: true
                }
            });

            // Generate hash from current data
            const currentHash = this.generateHash(currentHolders);
            
            // Get last known hash
            const hashType = topN === 50 ? this.hashTypes.TOP_50_HOLDERS : this.hashTypes.TOP_100_HOLDERS;
            const lastHash = await this.getCurrentHash(hashType);

            if (!lastHash) {
                // First time - store hash and assume change
                await this.updateHash(hashType, currentHash);
                console.log(`[CHANGE-DETECT] No previous hash for ${hashType}, assuming change`);
                return true;
            }

            if (currentHash !== lastHash) {
                // Hash changed - update and return true
                await this.updateHash(hashType, currentHash);
                console.log(`[CHANGE-DETECT] Top ${topN} holders changed`);
                return true;
            }

            console.log(`[CHANGE-DETECT] Top ${topN} holders unchanged`);
            return false;
        } catch (error) {
            console.error(`[CHANGE-DETECT] Error checking holder list changes:`, error.message);
            // On error, assume change to be safe
            return true;
        }
    }

    /**
     * Check if any wallet in the list needs syncing based on time thresholds
     * @param {string[]} walletAddresses - Array of wallet addresses to check
     * @param {number} maxAgeHours - Maximum age in hours before needing sync (default: 1)
     * @returns {string[]} - Array of wallet addresses that need syncing
     */
    async getWalletsNeedingSync(walletAddresses, maxAgeHours = 1) {
        try {
            const maxAge = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
            const walletsNeedingSync = [];

            for (const address of walletAddresses) {
                const lastCall = await prisma.apiCallLog.findFirst({
                    where: { 
                        endpoint: `wallet_sync_${address}`,
                        success: true,
                        created_at: { gte: maxAge }
                    },
                    orderBy: { created_at: 'desc' }
                });

                if (!lastCall) {
                    walletsNeedingSync.push(address);
                }
            }

            console.log(`[CHANGE-DETECT] ${walletsNeedingSync.length}/${walletAddresses.length} wallets need syncing`);
            return walletsNeedingSync;
        } catch (error) {
            console.error(`[CHANGE-DETECT] Error checking wallet sync needs:`, error.message);
            // On error, return all wallets to be safe
            return walletAddresses;
        }
    }

    /**
     * Log an API call for tracking
     * @param {string} endpoint - API endpoint identifier
     * @param {string} method - API method
     * @param {boolean} success - Whether the call was successful
     * @param {number} responseTime - Response time in milliseconds
     * @param {string} errorMessage - Error message if unsuccessful
     * @param {string} responseHash - Hash of response for change detection
     */
    async logApiCall(endpoint, method, success, responseTime = null, errorMessage = null, responseHash = null) {
        try {
            await prisma.apiCallLog.create({
                data: {
                    endpoint,
                    method,
                    success,
                    response_time: responseTime,
                    error_message: errorMessage,
                    response_hash: responseHash
                }
            });
        } catch (error) {
            console.error(`[CHANGE-DETECT] Error logging API call:`, error.message);
        }
    }

    /**
     * Check if we should perform a full holder refresh
     * @returns {boolean} - True if full refresh is needed
     */
    async shouldPerformFullRefresh() {
        try {
            // Check when we last did a full refresh
            const lastFullRefresh = await prisma.apiCallLog.findFirst({
                where: { 
                    endpoint: 'full_holder_refresh',
                    success: true
                },
                orderBy: { created_at: 'desc' }
            });

            // If no previous refresh or it's been more than 6 hours
            const sixHoursAgo = new Date(Date.now() - (6 * 60 * 60 * 1000));
            
            if (!lastFullRefresh || lastFullRefresh.created_at < sixHoursAgo) {
                console.log(`[CHANGE-DETECT] Full refresh needed (last: ${lastFullRefresh?.created_at || 'never'})`);
                return true;
            }

            // Check if holder list has significantly changed
            const hasChanged = await this.hasHolderListChanged(50);
            
            if (hasChanged) {
                console.log(`[CHANGE-DETECT] Full refresh needed due to holder list changes`);
                return true;
            }

            console.log(`[CHANGE-DETECT] Full refresh not needed`);
            return false;
        } catch (error) {
            console.error(`[CHANGE-DETECT] Error checking full refresh need:`, error.message);
            // On error, don't force full refresh
            return false;
        }
    }

    /**
     * Mark that a full refresh was performed
     */
    async markFullRefreshCompleted() {
        await this.logApiCall('full_holder_refresh', 'complete', true, null, null, null);
        console.log(`[CHANGE-DETECT] Marked full refresh as completed`);
    }

    /**
     * Get API call statistics
     * @param {number} hours - Number of hours to look back (default: 24)
     */
    async getApiCallStats(hours = 24) {
        try {
            const since = new Date(Date.now() - (hours * 60 * 60 * 1000));
            
            const [totalCalls, successfulCalls, uniqueEndpoints] = await Promise.all([
                prisma.apiCallLog.count({
                    where: { created_at: { gte: since } }
                }),
                prisma.apiCallLog.count({
                    where: { 
                        created_at: { gte: since },
                        success: true 
                    }
                }),
                prisma.apiCallLog.groupBy({
                    by: ['endpoint'],
                    where: { created_at: { gte: since } },
                    _count: { endpoint: true }
                })
            ]);

            const avgResponseTime = await prisma.apiCallLog.aggregate({
                where: { 
                    created_at: { gte: since },
                    response_time: { not: null }
                },
                _avg: { response_time: true }
            });

            return {
                total_calls: totalCalls,
                successful_calls: successfulCalls,
                failed_calls: totalCalls - successfulCalls,
                success_rate: totalCalls > 0 ? (successfulCalls / totalCalls * 100).toFixed(2) : 0,
                unique_endpoints: uniqueEndpoints.length,
                average_response_time: avgResponseTime._avg.response_time || 0,
                endpoint_breakdown: uniqueEndpoints
            };
        } catch (error) {
            console.error(`[CHANGE-DETECT] Error getting API stats:`, error.message);
            return {};
        }
    }

    /**
     * Clean up old API call logs (keep last 7 days)
     */
    async cleanupOldLogs() {
        try {
            const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
            
            const result = await prisma.apiCallLog.deleteMany({
                where: {
                    created_at: { lt: sevenDaysAgo }
                }
            });
            
            if (result.count > 0) {
                console.log(`[CHANGE-DETECT] Cleaned up ${result.count} old API call logs`);
            }
            
            return result.count;
        } catch (error) {
            console.error(`[CHANGE-DETECT] Error cleaning up logs:`, error.message);
            return 0;
        }
    }
}

// Export singleton instance
module.exports = new ChangeDetectionService();