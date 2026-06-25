/**
 * LeadDashboard
 *
 * Main page of the Client Outreach Dashboard.
 *
 * Data flow:
 *   Manual form → createOutreachDraft (Hunter.io lookup + Gmail draft)
 *   RSS Scout   → onCopyToForm pre-fills the form → user submits
 *                 OR direct "Send Manual Draft" → createManualDraft (no AI, no lookup)
 *   Both paths write to Firestore → LeadTable updates in real time via onSnapshot
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, onSnapshot, orderBy, query, doc, deleteDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable }              from 'firebase/functions';
import { db, app }    from '../firebase';
import LeadTable      from '../components/LeadTable';
import RssScout       from '../components/RssScout';

// ─── Form field ───────────────────────────────────────────────────────────────

function FormField({ label, id, type = 'text', placeholder, value, onChange, required, highlight }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete="off"
        className={`
          w-full rounded-lg border px-3.5 py-2.5 text-sm text-gray-100
          placeholder-gray-600 transition
          focus:outline-none focus:ring-1
          hover:border-gray-600
          ${highlight
            ? 'border-indigo-500 bg-indigo-950/30 focus:border-indigo-400 focus:ring-indigo-400'
            : 'border-gray-700 bg-gray-800/50 focus:border-indigo-500 focus:ring-indigo-500'
          }
        `}
      />
    </div>
  );
}

// ─── Alert ────────────────────────────────────────────────────────────────────

function Alert({ type, message, onDismiss }) {
  const cfg = {
    success: { wrapper: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', d: 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z' },
    error:   { wrapper: 'bg-red-500/10 border-red-500/20 text-red-400',             d: 'M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z' },
  }[type];

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${cfg.wrapper}`}>
      <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d={cfg.d} clipRule="evenodd" />
      </svg>
      <p className="flex-1">{message}</p>
      <button onClick={onDismiss} aria-label="Dismiss" className="opacity-60 transition hover:opacity-100">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ─── Lead Type dropdown ───────────────────────────────────────────────────────

// All supported lead types. Add new entries here to extend the dropdown.
const LEAD_TYPES = [
  { value: 'local_business', label: 'Local Business' },
  { value: 'digital_agency', label: 'Digital Agency' },
];

/**
 * Styled dropdown for selecting the outreach mode.
 * Visually distinct from the text inputs to signal it controls the form shape.
 */
function LeadTypeSelect({ value, onChange }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="leadType" className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
        Lead Type
      </label>
      <div className="relative">
        <select
          id="leadType"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="
            w-full appearance-none rounded-lg border border-gray-700 bg-gray-800/50
            px-3.5 py-2.5 pr-9 text-sm text-gray-100 transition
            focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500
            hover:border-gray-600 cursor-pointer
          "
        >
          {LEAD_TYPES.map(({ value: v, label }) => (
            <option key={v} value={v} className="bg-gray-900">
              {label}
            </option>
          ))}
        </select>
        {/* Chevron icon */}
        <svg
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

const EMPTY_FORM = { companyName: '', websiteUrl: '', ownerName: '', toEmail: '' };

// Field config per lead type — controls labels, placeholders, and which fields render
const FORM_CONFIG = {
  local_business: {
    badge:              { label: 'Local Business', classes: 'bg-sky-500/10 text-sky-400 ring-sky-500/20' },
    companyLabel:       'Company Name',
    companyPlaceholder: 'Riverside Gym',
    showWebsiteUrl:     true,
    ownerLabel:         'Owner Name (optional)',
    ownerPlaceholder:   'Leave blank → "Hi there,"',
  },
  digital_agency: {
    badge:              { label: 'Agency Partner', classes: 'bg-violet-500/10 text-violet-400 ring-violet-500/20' },
    companyLabel:       'Agency Name',
    companyPlaceholder: 'Momentum Digital',
    showWebsiteUrl:     false,
    ownerLabel:         'Contact Person (optional)',
    ownerPlaceholder:   'Leave blank → "Hi there,"',
  },
};

export default function LeadDashboard() {
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [leadType,  setLeadType]  = useState('local_business');
  const [leads,     setLeads]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [alert,     setAlert]     = useState(null);
  // True for 2s after RSS Scout copies data into the form — highlights the fields
  const [formHighlight, setFormHighlight] = useState(false);
  // Ref for scrolling the form into view when RSS Scout copies a post
  const formRef = useRef(null);

  // Clear the form and alert when the lead type changes
  function handleLeadTypeChange(newType) {
    setLeadType(newType);
    setForm(EMPTY_FORM);
    setAlert(null);
  }

  // ── Real-time Firestore listener ─────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // ── RSS Scout callback ────────────────────────────────────────────────────
  // Called when user clicks "Copy to Lead Form" on an RSS post.
  // Merges post data into the form, scrolls to it, and briefly highlights fields.
  const handleCopyToForm = useCallback(({ companyName, websiteUrl, ownerName, toEmail, leadType: lt }) => {
    setForm({ companyName, websiteUrl: websiteUrl ?? '', ownerName: ownerName ?? '', toEmail: toEmail ?? '' });
    if (lt) setLeadType(lt);
    setFormHighlight(true);
    setAlert(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => setFormHighlight(false), 2500);
  }, []);

  const field = (key, required = false) => ({
    value:     form[key],
    onChange:  (v) => setForm((p) => ({ ...p, [key]: v })),
    required,
    highlight: formHighlight && form[key] !== '',
  });

  // ── Submit: createOutreachDraft (Hunter lookup + template) ────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setAlert(null);
    setLoading(true);
    try {
      const fn = httpsCallable(getFunctions(app), 'createOutreachDraft');
      const { data } = await fn(form);
      setAlert({
        type:    'success',
        message: data.emailFound
          ? "Draft saved to Gmail with the owner's email."
          : "Draft saved to Gmail — no email found, add the recipient manually.",
      });
      setForm(EMPTY_FORM);
    } catch (err) {
      setAlert({ type: 'error', message: err?.message ?? 'Something went wrong.' });
    } finally {
      setLoading(false);
    }
  }

  // ── Quick send: createManualDraft (template only, no lookup) ─────────────
  async function handleManualDraft(e) {
    e.preventDefault();
    const cfg = FORM_CONFIG[leadType];
    if (!form.companyName?.trim()) {
      setAlert({ type: 'error', message: `${cfg.companyLabel} is required.` });
      return;
    }
    setAlert(null);
    setLoading(true);
    try {
      const fn = httpsCallable(getFunctions(app), 'createManualDraft');
      await fn({ ...form, leadType, source: leadType === 'digital_agency' ? 'agency' : 'manual' });
      setAlert({ type: 'success', message: `${cfg.badge.label} draft saved to Gmail.` });
      setForm(EMPTY_FORM);
    } catch (err) {
      setAlert({ type: 'error', message: err?.message ?? 'Something went wrong.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteLead(leadId) {
    await deleteDoc(doc(db, 'leads', leadId));
  }

  const totalLeads    = leads.length;
  const draftsCreated = leads.filter((l) => l.status === 'draft_created').length;
  const errors        = leads.filter((l) => l.status === 'error').length;

  return (
    <div className="min-h-screen bg-gray-950 font-sans text-gray-100 antialiased">

      {/* ── Nav ── */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-400">Client Outreach</p>
            <h1 className="text-base font-semibold leading-tight text-gray-100">Lead Dashboard</h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900 px-3 py-1.5">
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_theme(colors.emerald.400)]" />
            <span className="text-xs text-gray-400 hidden sm:inline">Dean Burt · deanburt1308@gmail.com</span>
            <span className="text-xs text-gray-400 sm:hidden">Dean Burt</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: 'Total Leads',    value: totalLeads    },
            { label: 'Drafts Created', value: draftsCreated },
            { label: 'Errors',         value: errors        },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-3 sm:px-5 sm:py-4">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-gray-500 truncate">{label}</p>
              <p className="mt-1 text-2xl sm:text-3xl font-semibold tabular-nums text-gray-100">{value}</p>
            </div>
          ))}
        </div>

        {/* ── RSS Scout ── */}
        {/*
          Placed above the form so the user sees live posts first,
          clicks "Copy to Lead Form", and the form below auto-fills and scrolls into view.
        */}
        <RssScout onCopyToForm={handleCopyToForm} />

        {/* ── Lead form ── */}
        <section ref={formRef} className="rounded-xl border border-gray-800 bg-gray-900 scroll-mt-24">

          {/* Header with active mode badge */}
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 sm:px-6 sm:py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-200">New Lead</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Fill in manually or copy from the Scout above.
              </p>
            </div>
            {/* Shows which mode is currently active */}
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${FORM_CONFIG[leadType].badge.classes}`}>
              {FORM_CONFIG[leadType].badge.label}
            </span>
          </div>

          <form className="p-4 sm:p-6 space-y-5">

            {/* ── Row 1: Lead Type selector (always visible, full width on mobile) ── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <LeadTypeSelect value={leadType} onChange={handleLeadTypeChange} />
            </div>

            {/* ── Row 2: Fields ── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

              {/* Company Name / Agency Name — only required field */}
              <FormField
                id="companyName"
                label={FORM_CONFIG[leadType].companyLabel}
                placeholder={FORM_CONFIG[leadType].companyPlaceholder}
                {...field('companyName', true)}
              />

              {/* Website URL — optional, shown for Local Business only */}
              {FORM_CONFIG[leadType].showWebsiteUrl && (
                <FormField
                  id="websiteUrl"
                  label="Website URL (optional)"
                  type="url"
                  placeholder="https://example.com"
                  {...field('websiteUrl')}
                />
              )}

                {/* To Email — auto-filled from Scout, editable */}
              <FormField
                id="toEmail"
                label="To Email (optional)"
                type="email"
                placeholder="contact@business.com"
                {...field('toEmail')}
              />
            </div>

            {alert && <Alert type={alert.type} message={alert.message} onDismiss={() => setAlert(null)} />}

            {/* ── Submit button ── */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleManualDraft}
                disabled={loading || !form.companyName.trim()}
                className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-40 ${
                  leadType === 'digital_agency'
                    ? 'bg-violet-600 hover:bg-violet-500 focus:ring-violet-500'
                    : 'bg-indigo-600 hover:bg-indigo-500 focus:ring-indigo-500'
                }`}
              >
                {loading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Creating…
                  </>
                ) : 'Create Draft in Gmail'}
              </button>
              <p className="text-xs text-gray-600">Saves to Gmail drafts — never auto-sends</p>
            </div>
          </form>
        </section>

        {/* ── Pipeline table ── */}
        <section className="rounded-xl border border-gray-800 bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 sm:px-6 sm:py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-200">Lead Pipeline</h2>
              <p className="mt-0.5 text-xs text-gray-500">Updates automatically as drafts are created.</p>
            </div>
            <span className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-400">
              {totalLeads} {totalLeads === 1 ? 'lead' : 'leads'}
            </span>
          </div>
          <LeadTable leads={leads} onDelete={handleDeleteLead} />
        </section>

      </main>
    </div>
  );
}
