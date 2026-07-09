import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../firebase';
import CrmGmailConnect, { useGmailConnection } from '../components/crm/CrmGmailConnect';
import CrmDashboard from '../components/crm/CrmDashboard';
import CrmLeadsPage from '../components/crm/CrmLeadsPage';
import CrmGmailInbox from '../components/crm/CrmGmailInbox';
import CrmTemplateLibrary from '../components/crm/CrmTemplateLibrary';
import CrmPortfolioSelector from '../components/crm/CrmPortfolioSelector';
import RssScout from '../components/RssScout';

const SUB_TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'leads',     label: 'Leads'     },
  { key: 'inbox',     label: 'Inbox'     },
  { key: 'scanner',   label: 'Scanner'   },
  { key: 'templates', label: 'Templates' },
  { key: 'settings',  label: 'Settings'  },
];

function MigrateLegacyLeads() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleMigrate() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'migrateLegacyLeads');
      const { data } = await fn();
      setResult(data);
    } catch (err) {
      setError(err?.message ?? 'Migration failed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
      <h2 className="text-sm font-semibold text-gray-200">Migrate Legacy Leads</h2>
      <p className="mt-1 text-xs text-gray-500">
        One-time import of any leads still sitting in the old Lead Pipeline into this CRM. Safe to run more than once — already-migrated leads are skipped.
      </p>
      <button
        onClick={handleMigrate}
        disabled={running}
        className="mt-4 rounded-lg bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-200 transition hover:bg-gray-700 disabled:opacity-50"
      >
        {running ? 'Migrating…' : 'Migrate Legacy Leads'}
      </button>
      {result && (
        <p className="mt-3 text-xs text-emerald-400">Migrated {result.migrated}, skipped {result.skipped} (already in CRM).</p>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </section>
  );
}

export default function OutreachCrmPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [subTab, setSubTab] = useState('dashboard');
  const [leads, setLeads] = useState(null);
  const [openLeadId, setOpenLeadId] = useState(null);
  const gmailStatus = useGmailConnection();

  // Handle ?gmail=connected / ?gmail=error redirect from the OAuth callback
  const gmailParam = searchParams.get('gmail');
  useEffect(() => {
    if (gmailParam) {
      setSubTab('settings');
      const next = new URLSearchParams(searchParams);
      next.delete('gmail');
      next.delete('reason');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmailParam]);

  useEffect(() => {
    const q = query(collection(db, 'crmLeads'), orderBy('dateAdded', 'desc'));
    return onSnapshot(q, (snap) => setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setLeads([]));
  }, []);

  function openLead(id) {
    setOpenLeadId(id);
    setSubTab('leads');
  }

  return (
    <div className="min-h-screen bg-gray-950 font-sans text-gray-100 antialiased">
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 sm:py-4">
            <div>
              <Link to="/tools" className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400 hover:text-blue-300 transition">
                More Tools →
              </Link>
              <h1 className="text-base font-semibold leading-tight text-gray-100">Outreach CRM</h1>
            </div>
            <CrmGmailConnect />
          </div>
          <div className="flex gap-1 -mb-px overflow-x-auto">
            {SUB_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSubTab(key)}
                className={`whitespace-nowrap px-4 py-2 text-xs font-semibold border-b-2 transition ${
                  subTab === key
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

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {gmailStatus && !gmailStatus.connected && subTab !== 'settings' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
            <p className="text-sm text-amber-300">Connect Gmail to send email, view your inbox, and enable reply detection.</p>
            <CrmGmailConnect compact />
          </div>
        )}

        {subTab === 'dashboard' && (
          <CrmDashboard leads={leads ?? []} onOpenLead={openLead} onGoToLeads={() => setSubTab('leads')} onGoToInbox={() => setSubTab('inbox')} />
        )}
        {subTab === 'leads' && (
          <CrmLeadsPage leads={leads} openLeadId={openLeadId} onOpenLeadHandled={() => setOpenLeadId(null)} />
        )}
        {subTab === 'inbox' && <CrmGmailInbox connected={!!gmailStatus?.connected} />}
        {subTab === 'scanner' && <RssScout />}
        {subTab === 'templates' && <CrmTemplateLibrary />}
        {subTab === 'settings' && (
          <div className="space-y-6">
            <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-gray-200">Gmail Connection</h2>
              <p className="mt-1 text-xs text-gray-500">
                Connects once via Google OAuth. Powers sending, drafts, inbox, threads, and automatic reply detection. Never stores your password.
              </p>
              <div className="mt-4">
                <CrmGmailConnect />
              </div>
              {gmailParam === 'error' && (
                <p className="mt-3 text-xs text-red-400">
                  Connection failed ({searchParams.get('reason') ?? 'unknown error'}). Please try again.
                </p>
              )}
            </section>
            <CrmPortfolioSelector managing />
            <MigrateLegacyLeads />
          </div>
        )}
      </main>
    </div>
  );
}
