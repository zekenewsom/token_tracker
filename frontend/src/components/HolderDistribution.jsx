import React, { useState, useEffect } from 'react';
import { fetchHolders } from '../services/api';

// Helper to format wallet addresses for display
const formatAddress = (address) => {
    if (!address) return 'N/A';
    if (address.length <= 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

// Helper to format numbers with commas
const formatNumber = (num) => {
    if (typeof num !== 'number') return '0.00';
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function HolderDistribution({ holders, isLoading }) {

  if (isLoading) return <div className="text-center p-8">Loading holders...</div>;
  if (holders.length === 0) return <div className="text-center p-8 text-gray-500">No holder data available. Please refresh data.</div>;

  return (
    <div className="flow-root">
      <h2 className="text-xl font-bold mb-4">Top Token Holders</h2>
      <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
          <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
            <thead>
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-0">Rank</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">Holder Address</th>
                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">Balance</th>
                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">Avg. Acq. Price (USD)</th>
                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">Avg. Acq. Price (Mkt Cap)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {holders.map((holder, index) => {
                const avgAcqPriceUsd = holder.average_acquisition_price_usd;
                const avgAcqPriceMktCap = avgAcqPriceUsd !== null && avgAcqPriceUsd !== undefined
                  ? (avgAcqPriceUsd * 1000000000).toFixed(2)
                  : null;

                return (
                  <tr key={holder.address}>
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-0">{index + 1}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-mono text-blue-500 hover:underline">
                       <a href={`https://solscan.io/account/${holder.address}`} target="_blank" rel="noopener noreferrer">
                          {formatAddress(holder.address)}
                       </a>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                      {formatNumber(holder.balance)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-500 dark:text-gray-400">
                      {avgAcqPriceUsd ? `${avgAcqPriceUsd.toFixed(6)}` : 'N/A'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-500 dark:text-gray-400">
                      {avgAcqPriceMktCap ? `${formatNumber(parseFloat(avgAcqPriceMktCap))}` : 'N/A'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

