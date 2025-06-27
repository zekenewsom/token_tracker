// frontend/src/components/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { refreshData, fetchTransactions, fetchHolders } from '../services/api';
import TransactionFeed from './TransactionFeed.jsx';
import HolderDistribution from './HolderDistribution.jsx';

export default function Dashboard() {
  const [transactions, setTransactions] = useState([]);
  const [holders, setHolders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState('Ready.');

  const handleRefresh = async () => {
    setIsLoading(true);
    setError(null);
    setStatusMessage('Refreshing data... This may take a few minutes.');
    try {
      const refreshRes = await refreshData();
      setStatusMessage(refreshRes.data.message || 'Data refreshed. Fetching updated data...');
      const [transactionsRes, holdersRes] = await Promise.all([
        fetchTransactions(),
        fetchHolders(1000),
      ]);
      setTransactions(transactionsRes.data);
      setHolders(holdersRes.data.holders);
      setStatusMessage(`Displaying ${transactionsRes.data.length} transactions and ${holdersRes.data.holders.length} holders.`);
    } catch (err) {
      const message = err.response?.data?.message || err.message;
      setError(`Failed to refresh data: ${message}`);
      setStatusMessage('Error!');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch initial data on load
  useEffect(() => {
    const loadInitialData = async () => {
        setIsLoading(true);
        setStatusMessage('Fetching initial data...');
        try {
            const [transactionsRes, holdersRes] = await Promise.all([
              fetchTransactions(),
              fetchHolders(1000),
            ]);
            setTransactions(transactionsRes.data);
            setHolders(holdersRes.data.holders);
            if (transactionsRes.data.length === 0) {
                setStatusMessage('No data found. Click "Refresh Data" to fetch from the blockchain.');
            } else {
                setStatusMessage(`Displaying ${transactionsRes.data.length} cached transactions and ${holdersRes.data.holders.length} holders.`);
            }
        } catch (err) {
            setError('Could not fetch initial data. The backend might be offline or needs to be refreshed.');
            setStatusMessage('Error!');
        } finally {
            setIsLoading(false);
        }
    };
    loadInitialData();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Solana Token Tracker</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tracking: 2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-75 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>

        {/* Status and Error Display */}
        <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <h2 className="font-semibold text-lg mb-2">Status</h2>
            {error && <p className="text-red-500 bg-red-100 dark:bg-red-900/50 p-3 rounded-md">{error}</p>}
            {!error && <p className="text-gray-600 dark:text-gray-300">{statusMessage}</p>}
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 lg:col-span-2">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Transaction Feed</h2>
            <TransactionFeed transactions={transactions} isLoading={isLoading && transactions.length === 0} />
          </div>
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 lg:col-span-2">
            <HolderDistribution holders={holders} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}
