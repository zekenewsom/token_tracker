
import React from 'react';

const TierBadge = ({ tier }) => {
    const tierColors = {
        Whale: 'bg-blue-500',
        Shark: 'bg-indigo-500',
        Dolphin: 'bg-cyan-500',
        Fish: 'bg-teal-500',
        Crab: 'bg-gray-500',
    };
    return (
        <span className={`px-2 py-1 text-xs font-semibold text-white rounded-full ${tierColors[tier] || 'bg-gray-600'}`}>
            {tier}
        </span>
    );
};

const HoldersTable = ({ data }) => {
    if (!data || data.length === 0) {
        return <p className="text-center text-gray-400">No holder data available.</p>;
    }

    return (
        <div className="overflow-x-auto bg-gray-800 rounded-lg">
            <table className="min-w-full text-white">
                <thead className="bg-gray-700">
                    <tr>
                        <th className="p-3 text-left text-sm font-semibold">Wallet Address</th>
                        <th className="p-3 text-left text-sm font-semibold">Tier</th>
                        <th className="p-3 text-right text-sm font-semibold">Tokens Held</th>
                        <th className="p-3 text-right text-sm font-semibold">Avg. Cost (USD)</th>
                        <th className="p-3 text-right text-sm font-semibold">Unrealized P/L</th>
                        <th className="p-3 text-right text-sm font-semibold">% of Supply</th>
                        <th className="p-3 text-center text-sm font-semibold">30d Flow</th>
                        <th className="p-3 text-left text-sm font-semibold">Last Activity</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((holder, index) => (
                        <tr key={index} className="border-b border-gray-700 hover:bg-gray-600 transition-colors">
                            <td className="p-3 font-mono text-sm">{`${holder.walletAddress.slice(0, 6)}...${holder.walletAddress.slice(-4)}`}</td>
                            <td className="p-3 text-center"><TierBadge tier={holder.tier} /></td>
                            <td className="p-3 text-right">{holder.totalTokensHeld.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                            <td className="p-3 text-right">${holder.averageAcquisitionCost.toFixed(6)}</td>
                            <td className={`p-3 text-right ${holder.unrealizedPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {holder.unrealizedPL.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                            </td>
                            <td className="p-3 text-right">{holder.percentageOfTotalSupply.toFixed(4)}%</td>
                            <td className="p-3 text-center text-sm">{holder.netFlow30d}</td>
                            <td className="p-3 text-sm">{new Date(holder.lastActivity).toLocaleDateString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default HoldersTable;
