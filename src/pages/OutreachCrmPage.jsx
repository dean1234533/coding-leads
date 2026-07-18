import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query, doc, getDoc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../firebase';
import CrmGmailConnect, { useGmailConnection } from '../components/crm/CrmGmailConnect';
import CrmDashboard from '../components/crm/CrmDashboard';
import CrmLeadsPage from '../components/crm/CrmLeadsPage';
import CrmGmailInbox from '../components/crm/CrmGmailInbox';
import CrmTemplateLibrary from '../components/crm/CrmTemplateLibrary';
import CrmPortfolioSelector from '../components/crm/CrmPortfolioSelector';
import RssScout from '../components/RssScout';
import QuickLookup from '../components/QuickLookup';
import InstallBanner from '../components/InstallBanner';
import CrmAutoSeed from '../components/crm/CrmAutoSeed';
import { enablePushNotifications, onForegroundPush } from '../utils/pushNotifications';

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

function RecoverBacklinkPageTitles() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'recoverBacklinkPageTitles', { timeout: 300000 });
      let totals = { updated: 0, failed: 0, remaining: 1 };
      // Processes 40 leads per call to stay under the function timeout —
      // keep calling until nothing's left, capped so a bug can't loop forever.
      for (let i = 0; i < 10 && totals.remaining > 0; i++) {
        const { data } = await fn();
        totals = { updated: totals.updated + data.updated, failed: totals.failed + data.failed, remaining: data.remaining };
        setResult({ ...totals });
      }
    } catch (err) {
      setError(err?.message ?? 'Recovery failed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
      <h2 className="text-sm font-semibold text-gray-200">Recover Backlink Page Titles</h2>
      <p className="mt-1 text-xs text-gray-500">
        One-time recovery for backlink prospects whose article title was lost when business names were fixed (see above) — re-fetches each live page and saves its title into Notes. Runs in batches automatically; may take a minute for a large list. Safe to run more than once.
      </p>
      <button
        onClick={handleRun}
        disabled={running}
        className="mt-4 rounded-lg bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-200 transition hover:bg-gray-700 disabled:opacity-50"
      >
        {running ? 'Recovering…' : 'Recover Page Titles'}
      </button>
      {result && (
        <p className="mt-3 text-xs text-emerald-400">
          Recovered {result.updated}, failed {result.failed}{result.remaining > 0 ? `, ${result.remaining} remaining (click again)` : ''}.
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </section>
  );
}


const AUTO_SCAN_BUSINESS_TYPES = [
  { value: 'restaurant',         label: 'Restaurants & Cafés'      },
  { value: 'bakery',             label: 'Bakeries'                 },
  { value: 'bar',                label: 'Bars & Pubs'              },
  { value: 'beauty_salon',       label: 'Beauty & Hair Salons'     },
  { value: 'barber',             label: 'Barbers'                  },
  { value: 'nail_salon',         label: 'Nail Salons'              },
  { value: 'spa',                label: 'Spas & Massage'           },
  { value: 'gym',                label: 'Gyms & Fitness'           },
  { value: 'personal_trainer',   label: 'Personal Trainers'        },
  { value: 'yoga_studio',        label: 'Yoga Studios'             },
  { value: 'physiotherapist',    label: 'Physiotherapists'         },
  { value: 'chiropractor',       label: 'Chiropractors'            },
  { value: 'dentist',            label: 'Dentists & Medical'       },
  { value: 'optician',           label: 'Opticians'                },
  { value: 'veterinary_care',    label: 'Veterinary Clinics'       },
  { value: 'lawyer',             label: 'Law Firms'                },
  { value: 'accounting',         label: 'Accountants'              },
  { value: 'real_estate_agency', label: 'Estate Agents'            },
  { value: 'insurance_agency',   label: 'Insurance Agents'         },
  { value: 'financial_advisor',  label: 'Financial Advisors'       },
  { value: 'plumber',            label: 'Plumbers'                 },
  { value: 'electrician',        label: 'Electricians'             },
  { value: 'builder',            label: 'Builders'                 },
  { value: 'roofer',             label: 'Roofers'                  },
  { value: 'painter_decorator',  label: 'Painters & Decorators'    },
  { value: 'locksmith',          label: 'Locksmiths'               },
  { value: 'cleaner',            label: 'Cleaning Services'        },
  { value: 'gardener',           label: 'Gardeners & Landscapers'  },
  { value: 'clothing_store',     label: 'Retail / Clothing'        },
  { value: 'jewelry_store',      label: 'Jewellers'                },
  { value: 'florist',            label: 'Florists'                 },
  { value: 'furniture_store',    label: 'Furniture Stores'         },
  { value: 'pet_store',          label: 'Pet Stores'               },
  { value: 'store',              label: 'General Retail'           },
  { value: 'car_repair',         label: 'Auto Repair Garages'      },
  { value: 'car_dealer',         label: 'Car Dealers'              },
  { value: 'car_wash',           label: 'Car Washes & Valeting'    },
  { value: 'photographer',       label: 'Wedding Photographers'    },
  { value: 'event_planner',      label: 'Event Planners'           },
  { value: 'dj',                 label: 'DJs & Entertainers'       },
  { value: 'tutor',              label: 'Tutors'                   },
  { value: 'driving_school',     label: 'Driving Instructors'      },
  { value: 'nursery',            label: 'Nurseries & Childcare'    },
  { value: 'moving_company',     label: 'Removal Companies'        },
  { value: 'travel_agency',      label: 'Travel Agents'            },
  { value: 'funeral_home',       label: 'Funeral Directors'        },
];

const AUTO_SCAN_RADII = [
  { value: 500,  label: '500m'  },
  { value: 1000, label: '1km'   },
  { value: 2000, label: '2km'   },
  { value: 5000, label: '5km'   },
];

const DEFAULT_AUTO_SCAN_CONFIG = {
  enabled: false,
  location: 'London, UK',
  radius: 2000,
  businessTypes: ['restaurant'],
  dailyLimit: 10,
  scanMode: 'business',
  scanHour: 2,
};

const SCAN_HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: new Date(2000, 0, 1, h).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }),
}));

function CrmAutoFollowUp() {
  const [enabled, setEnabled] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getDoc(doc(db, 'autoFollowUpConfig', 'settings'))
      .then((snap) => setEnabled(snap.exists() ? !!snap.data().enabled : false))
      .catch((err) => { console.error('[CrmAutoFollowUp] load failed:', err); setError(err?.message ?? 'Failed to load.'); setEnabled(false); });
  }, []);

  async function toggle() {
    const next = !enabled;
    setSaving(true);
    setError(null);
    try {
      await setDoc(doc(db, 'autoFollowUpConfig', 'settings'), { enabled: next });
      setEnabled(next);
    } catch (err) {
      console.error('[CrmAutoFollowUp] save failed:', err);
      setError(err?.message ?? 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  if (enabled === null) {
    return (
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-gray-200">Auto Follow-Up</h2>
        <p className="mt-2 text-xs text-gray-500">Loading…</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-200">Auto Follow-Up</h2>
        <button
          onClick={toggle}
          disabled={saving}
          className={`relative h-6 w-11 rounded-full transition disabled:opacity-50 ${enabled ? 'bg-emerald-500' : 'bg-gray-700'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${enabled ? 'left-5' : 'left-0.5'}`} />
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Every morning at 9am, automatically sends the "Follow Up" template to any lead whose follow-up date is due — no manual send needed. Skips anyone who's already replied, Won, Lost, or Archived. This sends real emails with no review step, so double-check the "Follow Up" template in your Template Library reads how you want before turning this on. Turned {enabled ? 'on' : 'off'} right now.
      </p>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </section>
  );
}

function CrmAutoScan() {
  const [config, setConfig] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    getDoc(doc(db, 'autoScanConfig', 'settings'))
      .then((snap) => {
        setConfig(snap.exists() ? { ...DEFAULT_AUTO_SCAN_CONFIG, ...snap.data() } : DEFAULT_AUTO_SCAN_CONFIG);
      })
      .catch((err) => {
        console.error('[CrmAutoScan] load failed:', err);
        setError(err?.message ?? 'Failed to load.');
        setConfig(DEFAULT_AUTO_SCAN_CONFIG);
      });
  }, []);

  function setField(key, value) {
    setConfig((c) => ({ ...c, [key]: value }));
    setDirty(true);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await setDoc(doc(db, 'autoScanConfig', 'settings'), config);
      setDirty(false);
      setSaved(true);
    } catch (err) {
      console.error('[CrmAutoScan] save failed:', err);
      setError(err?.message ?? 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestNow() {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'triggerAutoBusinessScanNow', { timeout: 540000 });
      const { data } = await fn();
      setTestResult(data);
    } catch (err) {
      console.error('[CrmAutoScan] test run failed:', err);
      setError(err?.message ?? 'Test run failed.');
    } finally {
      setTesting(false);
    }
  }

  if (!config) {
    return (
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-gray-200">Auto Scan</h2>
        <p className="mt-2 text-xs text-gray-500">Loading…</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-200">Auto Scan</h2>
        <button
          onClick={() => setField('enabled', !config.enabled)}
          className={`relative h-6 w-11 rounded-full transition ${config.enabled ? 'bg-emerald-500' : 'bg-gray-700'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${config.enabled ? 'left-5' : 'left-0.5'}`} />
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Runs automatically at your chosen time below — finds new business leads matching your settings, pre-audits each one's website, and adds them straight to your CRM. Turned {config.enabled ? 'on' : 'off'} right now.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Scan Time</span>
          <select
            value={config.scanHour ?? 2}
            onChange={(e) => setField('scanHour', Number(e.target.value))}
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            {SCAN_HOUR_OPTIONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Location</span>
          <input
            value={config.location}
            onChange={(e) => setField('location', e.target.value)}
            placeholder="e.g. London, UK"
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Radius</span>
          <select
            value={config.radius}
            onChange={(e) => setField('radius', Number(e.target.value))}
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            {AUTO_SCAN_RADII.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            Business Types {config.businessTypes?.length > 0 && <span className="normal-case text-gray-600">({config.businessTypes.length} selected — searched together each night)</span>}
          </span>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800/50 p-2">
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {AUTO_SCAN_BUSINESS_TYPES.map((t) => {
                const checked = (config.businessTypes ?? []).includes(t.value);
                return (
                  <label key={t.value} className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition ${
                    checked ? 'bg-blue-500/15 text-blue-300' : 'text-gray-400 hover:bg-gray-800'
                  }`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const current = config.businessTypes ?? [];
                        setField('businessTypes', current.includes(t.value) ? current.filter((v) => v !== t.value) : [...current, t.value]);
                      }}
                      className="accent-blue-500"
                    />
                    {t.label}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Businesses Per Night</span>
          <input
            type="number"
            min={1}
            max={20}
            value={config.dailyLimit}
            onChange={(e) => setField('dailyLimit', Number(e.target.value))}
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        <button
          onClick={handleTestNow}
          disabled={testing || dirty}
          title={dirty ? 'Save your settings first' : 'Runs a scan right now using your saved settings, ignoring the scan time'}
          className="rounded-lg border border-gray-700 px-4 py-2 text-xs font-semibold text-gray-300 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {testing ? 'Running…' : 'Test Now'}
        </button>
        {saved && !dirty && <span className="text-xs text-emerald-400">Saved.</span>}
      </div>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      {testResult && (
        <p className="mt-3 text-xs text-gray-400">
          {testResult.reason === 'disabled' && 'Skipped — auto scan is turned off.'}
          {testResult.error && `Scan failed: ${testResult.error}`}
          {testResult.added !== undefined && `Test run complete — added ${testResult.added} new lead${testResult.added === 1 ? '' : 's'} (${testResult.candidatesFound} candidate${testResult.candidatesFound === 1 ? '' : 's'} had an email).`}
        </p>
      )}
    </section>
  );
}

function CrmBacklinkProspecting() {
  const [queries, setQueries] = useState(null);
  const [queriesDirty, setQueriesDirty] = useState(false);
  const [savingQueries, setSavingQueries] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getDoc(doc(db, 'backlinkConfig', 'queries')).then((snap) => {
      setQueries((snap.exists() ? snap.data().list ?? [] : []).join('\n'));
    });
  }, []);

  async function handleSaveQueries() {
    setSavingQueries(true);
    try {
      const list = queries.split('\n').map((q) => q.trim()).filter(Boolean);
      await setDoc(doc(db, 'backlinkConfig', 'queries'), { list });
      setQueriesDirty(false);
    } finally {
      setSavingQueries(false);
    }
  }

  async function handleScan() {
    setScanning(true);
    setError(null);
    setResult(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'scanBacklinkProspectsNow', { timeout: 180000 });
      const { data } = await fn();
      setResult(data);
    } catch (err) {
      setError(err?.message ?? 'Scan failed.');
    } finally {
      setScanning(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
      <h2 className="text-sm font-semibold text-gray-200">Backlink Prospecting</h2>
      <p className="mt-1 text-xs text-gray-500">
        Searches two angles: resource/tools-list pages your free tools could be added to, and web dev/design/tech blogs that openly accept guest writers ("write for us" pages, guest post guidelines) — a real reason to offer a free article. Runs automatically every Monday, or trigger it manually below. Each match is tagged "Tool Mention" or "Guest Post" so you know which template to use — "Backlink Outreach" or "Guest Post Pitch". Requires a SerpAPI key set up as the <code className="text-gray-400">SERPAPI_KEY</code> secret.
      </p>

      <div className="mt-4">
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-gray-500">
          Search queries (one per line)
        </label>
        <textarea
          rows={6}
          value={queries ?? ''}
          onChange={(e) => { setQueries(e.target.value); setQueriesDirty(true); }}
          placeholder="Loading…"
          className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-xs text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleSaveQueries}
          disabled={!queriesDirty || savingQueries}
          className="mt-2 rounded-lg bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-200 transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {savingQueries ? 'Saving…' : 'Save Queries'}
        </button>
      </div>

      <button
        onClick={handleScan}
        disabled={scanning}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:opacity-50"
      >
        {scanning ? 'Scanning…' : 'Scan Now'}
      </button>

      {result && (
        <p className="mt-3 text-xs text-emerald-400">
          Scanned {result.scanned} results, added {result.added} new prospect{result.added === 1 ? '' : 's'}.
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </section>
  );
}

function CrmPushNotifications() {
  const [status, setStatus] = useState(null); // null | 'enabling' | 'enabled' | 'error'
  const [error, setError] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  async function handleEnable() {
    setStatus('enabling');
    setError(null);
    const result = await enablePushNotifications();
    if (result.success) {
      setStatus('enabled');
    } else {
      setStatus('error');
      setError(result.reason);
    }
  }

  async function handleTestNow() {
    setTesting(true);
    setTestResult(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'sendFollowUpDigestNow');
      const { data } = await fn();
      setTestResult(data);
    } catch (err) {
      setTestResult({ error: err?.message ?? 'Failed to send test digest.' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
      <h2 className="text-sm font-semibold text-gray-200">Follow-Up Notifications</h2>
      <p className="mt-1 text-xs text-gray-500">
        One daily push notification (8am) if anything's due for follow-up. On iPhone this only works if the app is added to your Home Screen and opened from that icon (not a Safari tab) — iOS 16.4+.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleEnable}
          disabled={status === 'enabling' || status === 'enabled'}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition disabled:cursor-default ${
            status === 'enabled'
              ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/30'
              : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-400 hover:to-cyan-400'
          }`}
        >
          {status === 'enabling' ? 'Enabling…' : status === 'enabled' ? 'Notifications Enabled' : 'Enable Follow-Up Notifications'}
        </button>
        <button
          onClick={handleTestNow}
          disabled={testing}
          className="rounded-lg bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-200 transition hover:bg-gray-700 disabled:opacity-50"
        >
          {testing ? 'Sending…' : 'Send Test Digest Now'}
        </button>
      </div>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      {testResult && !testResult.error && (
        <p className="mt-3 text-xs text-gray-400">
          {testResult.sent
            ? `Sent — ${testResult.due} due, ${testResult.notified} device(s) notified.`
            : `Nothing sent — ${testResult.due ?? 0} due${testResult.reason ? `, ${testResult.reason}` : ''}.`}
        </p>
      )}
      {testResult?.error && <p className="mt-3 text-xs text-red-400">{testResult.error}</p>}
    </section>
  );
}

export default function OutreachCrmPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [subTab, setSubTab] = useState('dashboard');
  const [leads, setLeads] = useState(null);
  const [openLeadId, setOpenLeadId] = useState(null);
  const [pushBanner, setPushBanner] = useState(null);
  const gmailStatus = useGmailConnection();

  // Browsers only show an OS notification automatically for background
  // pushes — a push arriving while the tab is focused needs to be surfaced
  // in-app instead, or it'd silently go nowhere.
  useEffect(() => {
    let unsubscribe;
    onForegroundPush((notification) => setPushBanner(notification)).then((unsub) => { unsubscribe = unsub; });
    return () => unsubscribe?.();
  }, []);

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

      <CrmAutoSeed />
      <InstallBanner />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {pushBanner && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-blue-300">{pushBanner.title}</p>
              {pushBanner.body && <p className="text-xs text-blue-400/80">{pushBanner.body}</p>}
            </div>
            <button onClick={() => setPushBanner(null)} className="text-xs text-blue-400/60 hover:text-blue-300">Dismiss</button>
          </div>
        )}
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
        {subTab === 'scanner' && (
          <div className="space-y-6">
            <QuickLookup />
            <RssScout />
          </div>
        )}
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
            <CrmAutoFollowUp />
            <CrmAutoScan />
            <CrmBacklinkProspecting />
            <CrmPushNotifications />
            <RecoverBacklinkPageTitles />
            <MigrateLegacyLeads />
          </div>
        )}
      </main>
    </div>
  );
}
