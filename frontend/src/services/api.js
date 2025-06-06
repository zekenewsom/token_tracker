import axios from 'axios';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const fetchRecentTransactions = () => axios.get(`${API_BASE}/api/token/transactions`);
export const fetchHolders = () => axios.get(`${API_BASE}/api/token/holders`);
// Add more API calls as needed
