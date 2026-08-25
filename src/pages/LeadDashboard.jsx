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
import AppIcon from '../components/AppIcon';

const NAV_TABS = [
  { key: 'codingLeads', label: 'Coding leads', icon: 'tools', title: 'Coding opportunities', description: 'Review developer roles and projects collected from your lead sources.' },
  { key: 'booking', label: 'Bookings', icon: 'calendar', title: 'Bookings', description: 'Manage discovery calls and keep your client calendar organised.' },
  { key: 'pricing', label: 'Pricing', icon: 'pricing', title: 'Pricing calculator', description: 'Build confident project estimates without undercharging for your time.' },
  { key: 'scripts', label: 'Call scripts', icon: 'script', title: 'Call scripts', description: 'Prepare for outreach and discovery calls with a clear conversation framework.' },
];

export default function LeadDashboard() {
  const [activeTab, setActiveTab] = useState('codingLeads');
  const activeMeta = NAV_TABS.find((tab) => tab.key === activeTab) ?? NAV_TABS[0];

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="flex items-center gap-3 px-2">
          <img src="/logo-192.png" alt="" className="app-brand-mark" />
          <div>
            <p className="text-sm font-bold text-white">Dean Digital</p>
            <p className="text-[11px] text-slate-500">Business toolkit</p>
          </div>
        </div>
        <nav className="mt-9 flex-1" aria-label="Tools navigation">
          <p className="app-nav-label">Tools</p>
          <div className="mt-2 space-y-1">
            {NAV_TABS.map(({ key, label, icon }) => (
              <button key={key} onClick={() => setActiveTab(key)} className={`app-nav-item ${activeTab === key ? 'is-active' : ''}`}>
                <AppIcon name={icon} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </nav>
        <Link to="/" className="app-nav-item mt-6 border border-slate-800">
          <AppIcon name="leads" />
          <span>Outreach CRM</span>
          <span className="ml-auto text-slate-600">↗</span>
        </Link>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="flex items-center gap-3">
            <img src="/logo-192.png" alt="" className="app-brand-mark md:hidden" />
            <div>
              <p className="text-sm font-semibold text-slate-100 md:text-xs md:font-medium md:text-slate-400">Business toolkit</p>
              <p className="hidden text-xs text-slate-600 md:block">Useful tools for winning and delivering work.</p>
            </div>
          </div>
          <Link to="/" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-500">
            <AppIcon name="leads" className="h-4 w-4" /> Outreach CRM
          </Link>
        </header>

        <div className="mobile-nav" aria-label="Tools navigation">
          {NAV_TABS.map(({ key, label, icon }) => (
            <button key={key} onClick={() => setActiveTab(key)} className={`app-nav-item ${activeTab === key ? 'is-active' : ''}`}>
              <AppIcon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <InstallBanner />

        <main className="page-wrap">
          <div className="page-heading">
            <div>
              <p className="page-eyebrow">Business toolkit</p>
              <h1 className="page-title">{activeMeta.title}</h1>
              <p className="page-description">{activeMeta.description}</p>
            </div>
          </div>
          {activeTab === 'codingLeads' && <CodingLeadsPage />}
          {activeTab === 'booking'     && <BookingManager />}
          {activeTab === 'pricing'     && <Pricing />}
          {activeTab === 'scripts'     && <CallScripts />}
        </main>
      </div>
    </div>
  );
}
