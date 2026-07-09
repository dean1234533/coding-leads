import { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { STATUSES, INDUSTRIES } from '../../utils/crmConstants';
import { isOverdue } from '../../utils/crmFollowUps';
import CrmLeadsTable from './CrmLeadsTable';
import CrmLeadAddForm from './CrmLeadAddForm';
import CrmLeadDetail from './CrmLeadDetail';
import CrmBulkSendModal from './CrmBulkSendModal';

const EMPTY_FILTERS = { status: 'all', industry: 'all', priority: 'all', followUpDue: 'all' };

export default function CrmLeadsPage({ leads, openLeadId, onOpenLeadHandled }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkSend, setShowBulkSend] = useState(false);

  useEffect(() => {
    if (openLeadId) {
      setSelectedId(openLeadId);
      onOpenLeadHandled?.();
    }
  }, [openLeadId]);

  const selectedLead = useMemo(() => (leads ?? []).find((l) => l.id === selectedId) ?? null, [leads, selectedId]);

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    const term = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (filters.status !== 'all' && l.status !== filters.status) return false;
      if (filters.industry !== 'all' && l.industry !== filters.industry) return false;
      if (filters.priority !== 'all' && l.priority !== filters.priority) return false;
      if (filters.followUpDue === 'due' && !isOverdue(l.followUpDate) && !l.followUpDate) return false;
      if (filters.followUpDue === 'overdue' && !isOverdue(l.followUpDate)) return false;
      if (term) {
        const haystack = [
          l.businessName, l.email, l.industry, l.website, l.address,
          l.status, ...(l.tags ?? []), ...(l.issuesChecklist ?? []),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [leads, filters, search]);

  async function handleAddLead(data) {
    await addDoc(collection(db, 'crmLeads'), {
      ...data,
      dateAdded: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async function handleUpdateLead(patch) {
    if (!selectedLead) return;
    await updateDoc(doc(db, 'crmLeads', selectedLead.id), { ...patch, updatedAt: serverTimestamp() });
  }

  async function handleDeleteLead(id) {
    await deleteDoc(doc(db, 'crmLeads', id));
    if (selectedId === id) setSelectedId(null);
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  function toggleOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll(visibleIds) {
    setSelectedIds((prev) => {
      const allSelected = visibleIds.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...visibleIds]);
    });
  }

  const selectedLeadsList = useMemo(
    () => (leads ?? []).filter((l) => selectedIds.has(l.id)),
    [leads, selectedIds]
  );

  const loading = leads === null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Leads</h1>
          <p className="text-xs text-gray-500">Every business you find becomes a lead here.</p>
        </div>
        <button onClick={() => setShowAddForm(true)}
          className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400">
          + Add Lead
        </button>
      </div>

      {/* Search + filters */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search business, email, industry, website, tag, issue…"
          className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className="rounded-lg border border-gray-700 bg-gray-800/50 px-2.5 py-2 text-xs text-gray-200 focus:border-blue-500 focus:outline-none">
            <option value="all">All Statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.industry} onChange={(e) => setFilters((f) => ({ ...f, industry: e.target.value }))}
            className="rounded-lg border border-gray-700 bg-gray-800/50 px-2.5 py-2 text-xs text-gray-200 focus:border-blue-500 focus:outline-none">
            <option value="all">All Industries</option>
            {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
            className="rounded-lg border border-gray-700 bg-gray-800/50 px-2.5 py-2 text-xs text-gray-200 focus:border-blue-500 focus:outline-none">
            <option value="all">All Priorities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
          <select value={filters.followUpDue} onChange={(e) => setFilters((f) => ({ ...f, followUpDue: e.target.value }))}
            className="rounded-lg border border-gray-700 bg-gray-800/50 px-2.5 py-2 text-xs text-gray-200 focus:border-blue-500 focus:outline-none">
            <option value="all">Follow Up: Any</option>
            <option value="due">Has Follow Up Date</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
        {(filters.status !== 'all' || filters.industry !== 'all' || filters.priority !== 'all' || filters.followUpDue !== 'all' || search) && (
          <button onClick={() => { setFilters(EMPTY_FILTERS); setSearch(''); }} className="text-xs text-gray-500 hover:text-gray-300">
            Clear filters
          </button>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
          <p className="text-sm text-blue-300">{selectedIds.size} selected</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowBulkSend(true)}
              className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400">
              Send Email
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 hover:text-gray-200">
              Clear selection
            </button>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-gray-800 bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="text-sm font-semibold text-gray-200">Pipeline</h2>
          <span className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-400">
            {filteredLeads.length} / {leads?.length ?? 0}
          </span>
        </div>
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-800/40" />)}
          </div>
        ) : (
          <CrmLeadsTable
            leads={filteredLeads}
            onSelect={(l) => setSelectedId(l.id)}
            onDelete={handleDeleteLead}
            selectedIds={selectedIds}
            onToggleOne={toggleOne}
            onToggleAll={toggleAll}
          />
        )}
      </section>

      {showAddForm && <CrmLeadAddForm onSave={handleAddLead} onClose={() => setShowAddForm(false)} />}

      {selectedLead && (
        <CrmLeadDetail
          lead={selectedLead}
          onUpdate={handleUpdateLead}
          onDelete={handleDeleteLead}
          onClose={() => setSelectedId(null)}
        />
      )}

      {showBulkSend && (
        <CrmBulkSendModal
          leads={selectedLeadsList}
          onClose={() => setShowBulkSend(false)}
          onDone={() => { setShowBulkSend(false); setSelectedIds(new Set()); }}
        />
      )}
    </div>
  );
}
