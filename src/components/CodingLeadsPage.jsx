import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, orderBy, query, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../firebase';
import { LEAD_TYPES, STATUSES } from '../utils/codingLeadsScoring';
import { exportLeadsToCsv } from '../utils/codingLeadsCsv';
import CodingLeadsAnalytics from './CodingLeadsAnalytics';
import CodingLeadsTable from './CodingLeadsTable';
import CodingLeadAddForm from './CodingLeadAddForm';
import CodingLeadsCsvImport from './CodingLeadsCsvImport';
import CodingLeadDetail from './CodingLeadDetail';
import CodingLeadsKeywordManager from './CodingLeadsKeywordManager';

const EMPTY_FILTERS = {
  status: 'all', leadType: 'all', source: 'all', location: '',
  minScore: 0, budgetOnly: false, contacted: 'all',
};

const SUB_TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'keywords',  label: 'Keywords & Sources' },
];

const CONTACTED_STATUSES = new Set(['Contacted', 'Replied', 'Follow Up', 'Won', 'Lost']);

export default function CodingLeadsPage() {
  const [subTab, setSubTab] = useState('dashboard');
  const [leads, setLeads] = useState(null);
  const [keywords, setKeywords] = useState(null);
  const [sources, setSources] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'codingLeads'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setLeads([]));
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, 'codingLeadsConfig', 'keywords'), (snap) => setKeywords(snap.exists() ? snap.data() : {}));
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, 'codingLeadsConfig', 'sources'), (snap) => setSources(snap.exists() ? snap.data().list ?? [] : []));
  }, []);

  const sourceOptions = useMemo(() => {
    if (!leads) return [];
    return [...new Set(leads.map((l) => l.source).filter(Boolean))].sort();
  }, [leads]);

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    const term = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (filters.status !== 'all' && l.status !== filters.status) return false;
      if (filters.leadType !== 'all' && l.leadType !== filters.leadType) return false;
      if (filters.source !== 'all' && l.source !== filters.source) return false;
      if (filters.location && !(l.location ?? '').toLowerCase().includes(filters.location.toLowerCase())) return false;
      if ((l.intentScore ?? 0) < filters.minScore) return false;
      if (filters.budgetOnly && !l.budget) return false;
      if (filters.contacted === 'contacted' && !CONTACTED_STATUSES.has(l.status)) return false;
      if (filters.contacted === 'not_contacted' && CONTACTED_STATUSES.has(l.status)) return false;
      if (term) {
        const haystack = `${l.title ?? ''} ${l.snippet ?? ''} ${l.source ?? ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [leads, filters, search]);

  async function handleAddLead(data) {
    await addDoc(collection(db, 'codingLeads'), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // Firestore batches cap at 500 writes — chunked so a large CSV export
  // (e.g. from another CRM) can't silently fail past that limit. Each lead's
  // `id` (a hash of its url/title, see codingLeadsCsvImport.js) is used as
  // the doc ID with merge:true, so re-importing the same list overwrites the
  // same docs instead of creating duplicates. Known tradeoff: createdAt gets
  // reset to "now" on every re-import (needed so the lead still shows up in
  // the default createdAt-ordered list at all) — acceptable since re-import
  // is a rare, deliberate action, not something that happens silently.
  async function handleImportLeads(newLeads) {
    const CHUNK = 450;
    for (let i = 0; i < newLeads.length; i += CHUNK) {
      const batch = writeBatch(db);
      for (const { id, ...lead } of newLeads.slice(i, i + CHUNK)) {
        batch.set(doc(db, 'codingLeads', id), {
          ...lead,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      await batch.commit();
    }
  }

  async function handleUpdateLead(id, patch) {
    await updateDoc(doc(db, 'codingLeads', id), { ...patch, updatedAt: serverTimestamp() });
    setSelectedLead((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }

  async function handleDeleteLead(id) {
    await deleteDoc(doc(db, 'codingLeads', id));
  }

  async function handleScanNow() {
    setScanning(true);
    setScanError(null);
    setScanResult(null);
    try {
      // Default httpsCallable timeout (70s) isn't enough now that there are more
      // sources staggered 3s apart to avoid Reddit's rate limit, plus a
      // slow-to-timeout AI provider in the per-item analysis chain — matches
      // the backend function's own timeoutSeconds.
      const fn = httpsCallable(getFunctions(app), 'scanCodingLeadsNow', { timeout: 300000 });
      const { data } = await fn();
      setScanResult(data);
    } catch (err) {
      setScanError(err?.message ?? 'Scan failed.');
    } finally {
      setScanning(false);
    }
  }

  const loading = leads === null;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Coding Leads</h1>
          <p className="text-xs text-gray-500">Internal tracker for people publicly looking for a developer.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleScanNow}
            disabled={scanning}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-200 transition hover:bg-gray-700 disabled:opacity-50"
          >
            {scanning ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Scanning…
              </>
            ) : 'Scan Now'}
          </button>
          <button
            onClick={() => exportLeadsToCsv(filteredLeads)}
            disabled={!leads?.length}
            className="rounded-lg bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-200 transition hover:bg-gray-700 disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onClick={() => setShowCsvImport(true)}
            className="rounded-lg bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-200 transition hover:bg-gray-700"
          >
            Import CSV
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400"
          >
            + Add Lead
          </button>
        </div>
      </div>

      {scanResult && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-400">
          Scanned {scanResult.scanned} posts, added {scanResult.added} new lead{scanResult.added === 1 ? '' : 's'}.
        </div>
      )}
      {scanError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">{scanError}</div>
      )}

      {/* Sub tabs */}
      <div className="flex gap-1 rounded-xl border border-gray-800 bg-gray-900 p-1 w-fit">
        {SUB_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              subTab === key ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'keywords' ? (
        <CodingLeadsKeywordManager keywords={keywords} sources={sources} />
      ) : (
        <>
          <CodingLeadsAnalytics leads={leads ?? []} />

          {/* Search + filters */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, snippet, source…"
              className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                className="rounded-lg border border-gray-700 bg-gray-800/50 px-2.5 py-2 text-xs text-gray-200 focus:border-blue-500 focus:outline-none">
                <option value="all">All Statuses</option>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filters.leadType} onChange={(e) => setFilters((f) => ({ ...f, leadType: e.target.value }))}
                className="rounded-lg border border-gray-700 bg-gray-800/50 px-2.5 py-2 text-xs text-gray-200 focus:border-blue-500 focus:outline-none">
                <option value="all">All Types</option>
                {LEAD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}
                className="rounded-lg border border-gray-700 bg-gray-800/50 px-2.5 py-2 text-xs text-gray-200 focus:border-blue-500 focus:outline-none">
                <option value="all">All Sources</option>
                {sourceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                value={filters.location}
                onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
                placeholder="Location contains…"
                className="rounded-lg border border-gray-700 bg-gray-800/50 px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              />
              <select value={filters.contacted} onChange={(e) => setFilters((f) => ({ ...f, contacted: e.target.value }))}
                className="rounded-lg border border-gray-700 bg-gray-800/50 px-2.5 py-2 text-xs text-gray-200 focus:border-blue-500 focus:outline-none">
                <option value="all">Contacted: Any</option>
                <option value="contacted">Contacted</option>
                <option value="not_contacted">Not Contacted</option>
              </select>
              <label className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-2.5 py-2 text-xs text-gray-300">
                <input type="checkbox" checked={filters.budgetOnly}
                  onChange={(e) => setFilters((f) => ({ ...f, budgetOnly: e.target.checked }))} />
                Budget mentioned
              </label>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500 whitespace-nowrap">Min Score: {filters.minScore}</label>
              <input type="range" min="0" max="100" value={filters.minScore}
                onChange={(e) => setFilters((f) => ({ ...f, minScore: Number(e.target.value) }))}
                className="w-full accent-blue-500" />
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="whitespace-nowrap text-xs text-gray-500 hover:text-gray-300">
                Clear filters
              </button>
            </div>
          </div>

          {/* Table */}
          <section className="rounded-xl border border-gray-800 bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 sm:px-6 sm:py-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-200">Leads</h2>
                <p className="mt-0.5 text-xs text-gray-500">Click a row for full details, outreach message, and status controls.</p>
              </div>
              <span className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-400">
                {filteredLeads.length} / {leads?.length ?? 0}
              </span>
            </div>
            {loading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-800/40" />
                ))}
              </div>
            ) : (
              <CodingLeadsTable
                leads={filteredLeads}
                totalCount={leads?.length ?? 0}
                onSelect={setSelectedLead}
                onDelete={handleDeleteLead}
                onStatusChange={(id, status) => handleUpdateLead(id, { status })}
              />
            )}
          </section>
        </>
      )}

      {showAddForm && (
        <CodingLeadAddForm
          locationKeywords={keywords?.location}
          onSave={handleAddLead}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {showCsvImport && (
        <CodingLeadsCsvImport
          locationKeywords={keywords?.location}
          onImport={handleImportLeads}
          onClose={() => setShowCsvImport(false)}
        />
      )}

      {selectedLead && (
        <CodingLeadDetail
          lead={selectedLead}
          onUpdate={handleUpdateLead}
          onDelete={handleDeleteLead}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </div>
  );
}
