/**
 * Tools
 *
 * Secondary tools that live outside the Outreach CRM: Coding Leads,
 * Booking, Pricing, and Call Scripts. The old manual Lead Pipeline that
 * used to live here has been retired in favour of the Outreach CRM at "/".
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import Pricing        from '../components/Pricing';
import CallScripts    from '../components/CallScripts';
import BookingManager from '../components/BookingManager';
import InstallBanner  from '../components/InstallBanner';
import CodingLeadsPage from '../components/CodingLeadsPage';

const NAV_TABS = [
  { key: 'codingLeads', label: 'Coding Leads' },
  { key: 'booking',     label: 'Booking'      },
  { key: 'pricing',     label: 'Pricing'      },
  { key: 'scripts',     label: 'Call Scripts' },
];

export default function LeadDashboard() {
  const [activeTab, setActiveTab] = useState('codingLeads');

  return (
    <div className="min-h-screen bg-gray-950 font-sans text-gray-100 antialiased">

      {/* ── Nav ── */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 sm:py-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400">dean-da-dev</p>
              <h1 className="text-base font-semibold leading-tight text-gray-100">Tools</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400"
              >
                ← Outreach CRM
              </Link>
              <div className="flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900 px-3 py-1.5">
                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_theme(colors.emerald.400)]" />
                <span className="text-xs text-gray-400 hidden sm:inline">Dean Burt · deanburt1308@gmail.com</span>
                <span className="text-xs text-gray-400 sm:hidden">Dean Burt</span>
              </div>
            </div>
          </div>
          {/* Tab bar */}
          <div className="flex gap-1 -mb-px overflow-x-auto">
            {NAV_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`whitespace-nowrap px-4 py-2 text-xs font-semibold border-b-2 transition ${
                  activeTab === key
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <InstallBanner />

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {activeTab === 'codingLeads' && <CodingLeadsPage />}
        {activeTab === 'booking'     && <BookingManager />}
        {activeTab === 'pricing'     && <Pricing />}
        {activeTab === 'scripts'     && <CallScripts />}
      </main>
    </div>
  );
}
