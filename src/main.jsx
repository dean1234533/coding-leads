import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LeadDashboard from './pages/LeadDashboard';
import BookingPage   from './pages/BookingPage';
import OutreachCrmPage from './pages/OutreachCrmPage';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/"              element={<LeadDashboard />} />
        <Route path="/book" element={<BookingPage />} />
        <Route path="/outreach-crm" element={<OutreachCrmPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
