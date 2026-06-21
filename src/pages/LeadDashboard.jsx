/**
 * LeadDashboard
 *
 * Main page of the Client Outreach Dashboard.
 * Renders a lead intake form and a real-time table of past leads.
 *
 * Data flow:
 *   1. User fills in Company Name, Website URL, Owner Name and clicks "Generate Draft"
 *   2. Frontend calls the `createOutreachDraft` Firebase Cloud Function
 *   3. The function looks up the email, creates a Gmail Draft, and writes to Firestore
 *   4. The LeadTable auto-updates via an onSnapshot Firestore listener
 */

import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../firebase';
import LeadTable from '../components/LeadTable';

// ─── Form field component ─────────────────────────────────────────────────────

/**
 * Reusable labeled input field styled for the dashboard form.
 *
 * @param {{ label: string, id: string, type?: string, placeholder: string,
 *           value: string, onChange: function, required?: boolean }} props
 */
function FormField({ label, id, type = 'text', placeholder, value, onChange, required }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[11px] font-semibold uppercase tracking-widest text-gray-500"
      >
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
        className="
          w-full rounded-lg border border-gray-700 bg-gray-800/50
          px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600
          transition
          focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500
          hover:border-gray-600
        "
      />
    </div>
  );
}

// ─── Alert component ──────────────────────────────────────────────────────────

/**
 * Dismissible inline alert for success and error feedback.
 *
 * @param {{ type: 'success'|'error', message: string, onDismiss: function }} props
 */
function Alert({ type, message, onDismiss }) {
  const styles = {
    success: {
      wrapper: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
      icon: (
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0
             00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2
             2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      ),
    },
    error: {
      wrapper: 'bg-red-500/10 border-red-500/20 text-red-400',
      icon: (
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7
             4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102
             0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      ),
    },
  };

  const s = styles[type];

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${s.wrapper}`}
    >
      {/* Icon */}
      <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        {s.icon}
      </svg>

      {/* Message */}
      <p className="flex-1">{message}</p>

      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-auto opacity-60 transition hover:opacity-100"
      >
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
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [leads,   setLeads]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [alert,   setAlert]   = useState(null); // { type, message }

  // ── Real-time Firestore listener ──────────────────────────────────────────
  // Subscribes to the "leads" collection, ordered newest-first.
  // onSnapshot fires immediately with cached data and again on any change.
  useEffect(() => {
    const q = query(
      collection(db, 'leads'),
      orderBy('createdAt', 'desc')
    );

    // Returns an unsubscribe function — called automatically on component unmount
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLeads(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return unsubscribe;
  }, []);

  // ── Form field helper ─────────────────────────────────────────────────────
  // Returns value + onChange props for a given form key
  const field = (key) => ({
    value:    form[key],
    onChange: (v) => setForm((prev) => ({ ...prev, [key]: v })),
    required: true,
  });

  // ── Submit handler ────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setAlert(null);
    setLoading(true);

    try {
      const fns = getFunctions(app);
      const createOutreachDraft = httpsCallable(fns, 'createOutreachDraft');
      const result = await createOutreachDraft(form);

      const { emailFound } = result.data;
      setAlert({
        type:    'success',
        message: emailFound
          ? 'Draft created and saved to Gmail with the owner\'s email address.'
          : 'Draft created and saved to Gmail. No email was found — add the recipient manually.',
      });

      // Clear the form on success
      setForm(EMPTY_FORM);
    } catch (err) {
      setAlert({
        type:    'error',
        message: err?.message ?? 'Something went wrong. Check the Firebase console for details.',
      });
    } finally {
      setLoading(false);
    }
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalLeads    = leads.length;
  const draftsCreated = leads.filter((l) => l.status === 'draft_created').length;
  const emailsFound   = leads.filter((l) => l.ownerEmail).length;

  return (
    <div className="min-h-screen bg-gray-950 font-sans text-gray-100 antialiased">

      {/* ── Navigation bar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">

          {/* Branding */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-400">
              Client Outreach
            </p>
            <h1 className="text-base font-semibold leading-tight text-gray-100">
              Lead Dashboard
            </h1>
          </div>

          {/* Sender identity pill */}
          <div className="flex items-center gap-2 rounded-full border border-gray-800
                          bg-gray-900 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_theme(colors.emerald.400)]" />
            <span className="text-xs text-gray-400">Dean Burt · deanburt1308@gmail.com</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">

        {/* ── Stats row ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Leads',    value: totalLeads    },
            { label: 'Drafts Created', value: draftsCreated },
            { label: 'Emails Found',   value: emailsFound   },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                {label}
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-gray-100">
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Lead intake form ───────────────────────────────────────────── */}
        <section className="rounded-xl border border-gray-800 bg-gray-900">

          {/* Section header */}
          <div className="border-b border-gray-800 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-200">New Lead</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Submit a business to look up their email and create a Gmail draft automatically.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            {/* Three-column input grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                id="companyName"
                label="Company Name"
                placeholder="Riverside Gym"
                {...field('companyName')}
              />
              <FormField
                id="websiteUrl"
                label="Website URL"
                type="url"
                placeholder="https://riversidegym.com"
                {...field('websiteUrl')}
              />
              <FormField
                id="ownerName"
                label="Owner Name"
                placeholder="Marcus"
                {...field('ownerName')}
              />
            </div>

            {/* Alert feedback */}
            {alert && (
              <Alert
                type={alert.type}
                message={alert.message}
                onDismiss={() => setAlert(null)}
              />
            )}

            {/* Submit button */}
            <div>
              <button
                type="submit"
                disabled={loading}
                className="
                  inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5
                  text-sm font-medium text-white transition
                  hover:bg-indigo-500
                  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900
                  disabled:cursor-not-allowed disabled:bg-indigo-900 disabled:text-indigo-500
                "
              >
                {/* Spinner shown while loading */}
                {loading && (
                  <svg
                    className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8z"
                    />
                  </svg>
                )}
                {loading ? 'Creating Draft...' : 'Generate Draft'}
              </button>
            </div>
          </form>
        </section>

        {/* ── Lead history table ──────────────────────────────────────────── */}
        <section className="rounded-xl border border-gray-800 bg-gray-900">

          {/* Section header */}
          <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-200">Lead Pipeline</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Updates automatically as drafts are created.
              </p>
            </div>
            <span className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-400">
              {totalLeads} {totalLeads === 1 ? 'lead' : 'leads'}
            </span>
          </div>

          {/* The table component handles its own empty state */}
          <LeadTable leads={leads} />
        </section>

      </main>
    </div>
  );
}
