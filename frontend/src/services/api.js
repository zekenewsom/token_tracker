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
export const fetchHolders = () => api.get('/api/token/holders');
