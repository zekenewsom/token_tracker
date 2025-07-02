
import React from 'react';

const StatCard = ({ title, value, subValue }) => (
    <div className="bg-gray-800 p-4 rounded-lg">
        <h3 className="text-sm font-medium text-gray-400">{title}</h3>
        <p className="text-2xl font-semibold text-white">{value}</p>
        {subValue && <p className="text-xs text-gray-500">{subValue}</p>}
    </div>
);

const AnalysisSummary = ({ summary, concentration }) => {
    if (!summary || !concentration) {
        return <div className="text-center p-4">Loading summary...</div>;
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Holders" value={summary.totalHolders?.toLocaleString() || '0'} />
            <StatCard title="Current Price" value={`$${summary.currentPrice?.toFixed(6) || '0.00'}`} />
            <StatCard title="Top 10% Holdings" value={`${concentration.top10?.toFixed(2) || '0.00'}%`} />
            <StatCard title="Top 50% Holdings" value={`${concentration.top50?.toFixed(2) || '0.00'}%`} />
        </div>
    );
};

export default AnalysisSummary;
