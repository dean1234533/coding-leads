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
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
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

// ─── Main dashboard ───────────────────────────────────────────────────────────

const EMPTY_FORM = { companyName: '', websiteUrl: '', ownerName: '' };

export default function LeadDashboard() {
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [leads,     setLeads]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [alert,     setAlert]     = useState(null);
  // True for 2s after RSS Scout copies data into the form — highlights the fields
  const [formHighlight, setFormHighlight] = useState(false);
  // Ref for scrolling the form into view when RSS Scout copies a post
  const formRef = useRef(null);

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
  const handleCopyToForm = useCallback(({ companyName, websiteUrl, ownerName }) => {
    setForm({ companyName, websiteUrl, ownerName });
    setFormHighlight(true);
    setAlert(null);
    // Smooth scroll to the form section
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => setFormHighlight(false), 2500);
  }, []);

  const field = (key) => ({
    value:     form[key],
    onChange:  (v) => setForm((p) => ({ ...p, [key]: v })),
    required:  true,
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
  // Available as an alternative submit — useful for RSS Scout leads where
  // we already have the owner name but no website to look up.
  async function handleManualDraft(e) {
    e.preventDefault();
    if (!form.companyName?.trim() || !form.ownerName?.trim()) {
      setAlert({ type: 'error', message: 'Company Name and Owner Name are required for a manual draft.' });
      return;
    }
    setAlert(null);
    setLoading(true);
    try {
      const fn = httpsCallable(getFunctions(app), 'createManualDraft');
      await fn({ ...form, source: 'rss' });
      setAlert({ type: 'success', message: 'Manual draft saved to Gmail.' });
      setForm(EMPTY_FORM);
    } catch (err) {
      setAlert({ type: 'error', message: err?.message ?? 'Something went wrong.' });
    } finally {
      setLoading(false);
    }
  }

  const totalLeads    = leads.length;
  const draftsCreated = leads.filter((l) => l.status === 'draft_created').length;
  const emailsFound   = leads.filter((l) => l.ownerEmail).length;

  return (
    <div className="min-h-screen bg-gray-950 font-sans text-gray-100 antialiased">

      {/* ── Nav ── */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-400">Client Outreach</p>
            <h1 className="text-base font-semibold leading-tight text-gray-100">Lead Dashboard</h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_theme(colors.emerald.400)]" />
            <span className="text-xs text-gray-400">Dean Burt · deanburt1308@gmail.com</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Leads',    value: totalLeads    },
            { label: 'Drafts Created', value: draftsCreated },
            { label: 'Emails Found',   value: emailsFound   },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{label}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-gray-100">{value}</p>
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
          <div className="border-b border-gray-800 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-200">New Lead</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Fill in manually or copy from the RSS Scout above.
              <span className="ml-1 text-gray-600">· "Generate Draft" looks up their email · "Manual Draft" uses a template only</span>
            </p>
          </div>

          <form className="p-6 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField id="companyName" label="Company Name" placeholder="Riverside Gym"          {...field('companyName')} />
              <FormField id="websiteUrl"  label="Website URL"  placeholder="https://example.com" type="url" {...field('websiteUrl')} />
              <FormField id="ownerName"   label="Owner Name"   placeholder="Marcus"               {...field('ownerName')} />
            </div>

            {alert && <Alert type={alert.type} message={alert.message} onDismiss={() => setAlert(null)} />}

            {/* Two submit buttons: full lookup vs. quick manual template */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:bg-indigo-900 disabled:text-indigo-500"
              >
                {loading && (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                {loading ? 'Working...' : 'Generate Draft'}
              </button>

              <button
                type="button"
                onClick={handleManualDraft}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-5 py-2.5 text-sm font-medium text-gray-300 transition hover:border-gray-600 hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Manual Draft
              </button>

              <p className="text-xs text-gray-600">
                Generate Draft = Hunter.io lookup · Manual Draft = template only, instant
              </p>
            </div>
          </form>
        </section>

        {/* ── Pipeline table ── */}
        <section className="rounded-xl border border-gray-800 bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-200">Lead Pipeline</h2>
              <p className="mt-0.5 text-xs text-gray-500">Updates automatically as drafts are created.</p>
            </div>
            <span className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-400">
              {totalLeads} {totalLeads === 1 ? 'lead' : 'leads'}
            </span>
          </div>
          <LeadTable leads={leads} />
        </section>

      </main>
    </div>
  );
}
