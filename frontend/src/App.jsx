import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import HolderAnalysis from './pages/HolderAnalysis.jsx'; // Import the new page
import './styles/globals.css';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/analysis" element={<HolderAnalysis />} /> {/* Add the new route */}
      </Routes>
    </Router>
  );
}
