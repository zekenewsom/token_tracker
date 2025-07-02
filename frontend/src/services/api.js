// frontend/src/services/api.js
import axios from 'axios';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const api = axios.create({
    baseURL: API_BASE,
});

/**
 * Triggers a full data refresh on the backend.
 */
export const refreshData = () => api.post('/api/token/refresh');

/**
 * Fetches transactions from the backend.
 * @param {number} page - The page number to fetch.
 * @param {number} limit - The number of transactions per page.
 */
export const fetchTransactions = (page = 1, limit = 100) => 
    api.get(`/api/token/transactions?page=${page}&limit=${limit}`);

/**
 * Fetches token holders from the backend.
 */
export const fetchHolders = (limit = 1000) => 
    api.get(`/api/token/holders?limit=${limit}`);

/**
 * Fetches holder analysis data from the backend.
 */
export const fetchHolderAnalysis = () => api.get('/api/analysis/holders');

/**
 * Fetches comprehensive trading dashboard data
 */
export const fetchCompleteTradingDashboard = (timeframe = '24h') => 
    api.get(`/api/analysis/complete-dashboard?timeframe=${timeframe}`);

/**
 * Fetches whale analysis data
 */
export const fetchWhaleAnalysis = (limit = 20) => 
    api.get(`/api/analysis/whale-analysis?limit=${limit}`);

/**
 * Fetches trading insights and signals
 */
export const fetchTradingInsights = (timeframe = '24h') => 
    api.get(`/api/analysis/trading-insights?timeframe=${timeframe}`);

/**
 * Fetches market data and technical analysis
 */
export const fetchMarketData = (timeframe = '24h') => 
    api.get(`/api/analysis/market-data?timeframe=${timeframe}`);

/**
 * Fetches whale alerts
 */
export const fetchWhaleAlerts = () => 
    api.get('/api/analysis/whale-alerts');

/**
 * Fetches market sentiment analysis
 */
export const fetchMarketSentiment = (timeframe = '24h') => 
    api.get(`/api/analysis/market-sentiment?timeframe=${timeframe}`);

/**
 * Fetches risk assessment data
 */
export const fetchRiskAssessment = (timeframe = '24h') => 
    api.get(`/api/analysis/risk-assessment?timeframe=${timeframe}`);
