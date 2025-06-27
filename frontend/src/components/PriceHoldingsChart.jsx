
import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const PriceHoldingsChart = ({ data }) => {
    // We need to filter out wallets with zero holdings for this chart to be meaningful
    const chartData = data.filter(d => d.totalTokensHeld > 0);

    return (
        <div className="bg-gray-800 p-4 rounded-lg">
            <h2 className="text-xl font-semibold text-white mb-4">Acquisition Cost vs. % of Supply</h2>
            <ResponsiveContainer width="100%" height={400}>
                <ScatterChart
                    margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
                    <XAxis 
                        dataKey="averageAcquisitionCost"
                        type="number"
                        name="Avg. Acquisition Cost"
                        unit=" USD"
                        tick={{ fill: '#A0AEC0' }}
                        label={{ value: "Average Acquisition Cost (USD)", position: 'insideBottom', offset: -15, fill: '#CBD5E0' }}
                    />
                    <YAxis 
                        dataKey="percentageOfTotalSupply"
                        type="number"
                        name="% of Supply"
                        unit="%"
                        tick={{ fill: '#A0AEC0' }}
                        label={{ value: "% of Total Supply", angle: -90, position: 'insideLeft', fill: '#CBD5E0' }}
                    />
                    <ZAxis dataKey="totalTokensHeld" type="number" range={[20, 500]} name="Tokens Held" />
                    <Tooltip 
                        cursor={{ strokeDasharray: '3 3' }} 
                        contentStyle={{ backgroundColor: '#2D3748', border: '1px solid #4A5568' }} 
                        formatter={(value, name, props) => [`${props.payload.walletAddress}` ,'Wallet']}
                    />
                    <Legend formatter={(value, entry) => <span className="text-gray-300">{value}</span>} />
                    <Scatter name="Holders" data={chartData} fill="#4299E1" shape="circle" />
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    );
};

export default PriceHoldingsChart;
