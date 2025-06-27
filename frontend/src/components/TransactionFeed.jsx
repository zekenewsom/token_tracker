// frontend/src/components/TransactionFeed.jsx
import React from 'react';

const formatAddress = (address) => {
    if (!address) return 'N/A';
    if (address.length <= 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

const formatNumber = (num) => {
    if (typeof num !== 'number') return '0.00';
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// New function to get style based on transfer type
const getTypeClass = (type) => {
    switch (type) {
        case 'transfer_in':
            return 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-600/20';
        case 'transfer_out':
            return 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-600/20';
        default:
            return 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-1 ring-inset ring-blue-600/20';
    }
};

export default function TransactionFeed({ transactions, isLoading }) {
  if (isLoading && transactions.length === 0) {
    return <div className="text-center p-8">Loading transactions...</div>;
  }

  if (!transactions || transactions.length === 0) {
    return <div className="text-center p-8 text-gray-500">No transactions to display.</div>;
  }

  return (
    <div className="flow-root">
      <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
          <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
            <thead>
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-0">Type</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">Date</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">From</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">To</th>
                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 dark:text-white">Token Amount</th>
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0 text-left text-sm font-semibold text-gray-900 dark:text-white">Signature</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {transactions.map((tx) => (
                <tr key={tx.signature}>
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-0">
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${getTypeClass(tx.type)}`}>
                      {tx.type.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">{new Date(tx.block_time * 1000).toLocaleString()}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm font-mono text-gray-500 dark:text-gray-400">{formatAddress(tx.source_address)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm font-mono text-gray-500 dark:text-gray-400">{formatAddress(tx.destination_address)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-right font-medium text-gray-900 dark:text-white">{formatNumber(tx.token_amount)}</td>
                  <td className="whitespace-nowrap py-4 pl-3 pr-4 text-sm text-blue-500 hover:underline sm:pr-0">
                    <a href={`https://solscan.io/tx/${tx.signature}`} target="_blank" rel="noopener noreferrer">
                      {formatAddress(tx.signature)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}