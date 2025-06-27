
import React, { useState, useEffect } from 'react';
import { fetchHolderAnalysis } from '../services/api';
import HoldersTable from '../components/HoldersTable';
import PriceHoldingsChart from '../components/PriceHoldingsChart';
import AnalysisSummary from '../components/AnalysisSummary';

const HolderAnalysis = () => {
    const [analysisData, setAnalysisData] = useState({ holders: [], concentration: {}, summary: {} });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetchHolderAnalysis();
                setAnalysisData(response.data);
            } catch (err) {
                setError('Failed to fetch holder analysis data.');
                console.error(err);
            }
            setLoading(false);
        };

        fetchData();
    }, []);

    if (loading) return <div className="text-center p-8 text-white">Loading analysis...</div>;
    if (error) return <div className="text-center p-8 text-red-500">{error}</div>;

    return (
        <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold mb-6">Holder Analysis</h1>
                
                <div className="mb-8">
                    <AnalysisSummary summary={analysisData.summary} concentration={analysisData.concentration} />
                </div>

                <div className="mb-8">
                    <PriceHoldingsChart data={analysisData.holders} />
                </div>

                <div>
                    <HoldersTable data={analysisData.holders} />
                </div>
            </div>
        </div>
    );
};

export default HolderAnalysis;
