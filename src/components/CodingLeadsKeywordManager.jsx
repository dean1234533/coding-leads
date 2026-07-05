import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_SOURCES } from '../utils/codingLeadsScoring';

const GROUP_LABELS = {
  webDev:  'Web Developer Keywords',
  appDev:  'App Developer Keywords',
  saasMvp: 'SaaS / MVP Keywords',
  location: 'Location Keywords',
};

function KeywordGroup({ groupKey, label, keywords, onChange }) {
  const [draft, setDraft] = useState('');

  function addKeyword() {
    const value = draft.trim();
    if (!value || keywords.includes(value)) return;
    onChange(groupKey, [...keywords, value]);
    setDraft('');
  }

  function removeKeyword(kw) {
    onChange(groupKey, keywords.filter((k) => k !== kw));
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-200">{label}</h3>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {keywords.map((kw) => (
          <span key={kw} className="inline-flex items-center gap-1 rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300 ring-1 ring-inset ring-gray-700">
            {kw}
            <button onClick={() => removeKeyword(kw)} aria-label={`Remove ${kw}`} className="text-gray-500 hover:text-red-400">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        {keywords.length === 0 && <p className="text-xs text-gray-600">No keywords yet.</p>}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
          placeholder="Add a phrase…"
          className="flex-1 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button onClick={addKeyword} className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-300 transition hover:bg-gray-700">
          Add
        </button>
      </div>
    </div>
  );
}

function SourcesManager({ sources, onChange }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');

  function toggle(id) {
    onChange(sources.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }

  function remove(id) {
    onChange(sources.filter((s) => s.id !== id));
  }

  function add() {
    if (!url.trim()) return;
    const id = `custom_${Date.now()}`;
    onChange([...sources, { id, name: name.trim() || url.trim(), url: url.trim(), enabled: true }]);
    setUrl('');
    setName('');
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <h3 className="mb-1 text-sm font-semibold text-gray-200">RSS Sources</h3>
      <p className="mb-3 text-xs text-gray-500">
        Public RSS feeds scanned every 6 hours (or on demand via "Scan Now"). Only public feeds — no logins, no private groups.
      </p>
      <div className="mb-3 space-y-2">
        {sources.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-gray-200">{s.name}</p>
              <p className="truncate text-xs text-gray-600">{s.url}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggle(s.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                  s.enabled ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30' : 'text-gray-500 ring-gray-700 hover:text-gray-300'
                }`}
              >
                {s.enabled ? 'Enabled' : 'Disabled'}
              </button>
              <button onClick={() => remove(s.id)} aria-label={`Remove ${s.name}`} className="text-gray-600 hover:text-red-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Label (optional)"
          className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/feed.rss"
          className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <button onClick={add} className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-300 transition hover:bg-gray-700">
          Add Feed
        </button>
      </div>
    </div>
  );
}

export default function CodingLeadsKeywordManager({ keywords, sources }) {
  const [saved, setSaved] = useState(false);

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function updateGroup(groupKey, values) {
    await setDoc(doc(db, 'codingLeadsConfig', 'keywords'), { ...keywords, [groupKey]: values }, { merge: true });
    flashSaved();
  }

  async function updateSources(list) {
    await setDoc(doc(db, 'codingLeadsConfig', 'sources'), { list }, { merge: true });
    flashSaved();
  }

  const groups = keywords ?? {};
  const sourceList = sources?.length ? sources : DEFAULT_SOURCES;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          These phrases drive both the auto-discovery scan and the intent score explanation. Changes save automatically.
        </p>
        {saved && <span className="text-xs font-medium text-emerald-400">Saved</span>}
      </div>
      {Object.entries(GROUP_LABELS).map(([key, label]) => (
        <KeywordGroup key={key} groupKey={key} label={label} keywords={groups[key] ?? []} onChange={updateGroup} />
      ))}
      <SourcesManager sources={sourceList} onChange={updateSources} />
    </div>
  );
}
