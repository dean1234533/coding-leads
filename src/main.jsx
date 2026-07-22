import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LeadDashboard from './pages/LeadDashboard';
import BookingPage   from './pages/BookingPage';
import OutreachCrmPage from './pages/OutreachCrmPage';
import PwaUpdatePrompt from './components/PwaUpdatePrompt';
import AuthGate from './components/AuthGate';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

// /book is the only route that must stay outside AuthGate — it's the public
// customer-facing booking page and needs no login. Everything else here is
// Dean's own CRM/admin tooling.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/"              element={<AuthGate><OutreachCrmPage /></AuthGate>} />
          <Route path="/outreach-crm"  element={<AuthGate><OutreachCrmPage /></AuthGate>} />
          <Route path="/tools"         element={<AuthGate><LeadDashboard /></AuthGate>} />
          <Route path="/book" element={<BookingPage />} />
        </Routes>
        <PwaUpdatePrompt />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
