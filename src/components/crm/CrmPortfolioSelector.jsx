import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { DEFAULT_PORTFOLIO } from '../../utils/crmConstants';

export default function CrmPortfolioSelector({ managing = false, onSelect }) {
  const [demos, setDemos] = useState(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    return onSnapshot(collection(db, 'crmPortfolio'), (snap) => setDemos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setDemos([]));
  }, []);

  async function seedDefaults() {
    setSeeding(true);
    try {
      const snap = await getDocs(collection(db, 'crmPortfolio'));
      const existing = new Set(snap.docs.map((d) => d.data().name));
      const missing = DEFAULT_PORTFOLIO.filter((d) => !existing.has(d.name));
      await Promise.all(missing.map((d) => addDoc(collection(db, 'crmPortfolio'), d)));
    } finally {
      setSeeding(false);
    }
  }

  async function updateUrl(id, url) {
    await updateDoc(doc(db, 'crmPortfolio', id), { url });
  }

  async function addDemo() {
    const name = window.prompt('Demo name (e.g. "Restaurant"):');
    if (!name?.trim()) return;
    await addDoc(collection(db, 'crmPortfolio'), { name: name.trim(), url: '' });
  }

  async function removeDemo(id) {
    await deleteDoc(doc(db, 'crmPortfolio', id));
  }

  if (!managing) {
    return (
      <div className="flex flex-wrap gap-2">
        {(demos ?? []).map((d) => (
          <button key={d.id} type="button" disabled={!d.url} onClick={() => onSelect?.(d)}
            className="rounded-full bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition hover:bg-gray-700 disabled:opacity-40">
            {d.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Portfolio Demos</h2>
          <p className="mt-0.5 text-xs text-gray-500">Choose which demo to send — the URL is stored automatically.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={seedDefaults} disabled={seeding} className="rounded-lg bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-700 disabled:opacity-50">
            {seeding ? 'Loading…' : 'Load Defaults'}
          </button>
          <button onClick={addDemo} className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-3.5 py-2 text-xs font-semibold text-white hover:from-blue-400 hover:to-cyan-400">
            + Add Demo
          </button>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {(demos ?? []).map((d) => (
          <div key={d.id} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-sm text-gray-300">{d.name}</span>
            <input
              defaultValue={d.url}
              onBlur={(e) => updateUrl(d.id, e.target.value)}
              placeholder="https://…"
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <button onClick={() => removeDemo(d.id)} className="text-gray-600 hover:text-red-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        {demos?.length === 0 && <p className="text-xs text-gray-600">No demos yet — load the defaults to get started.</p>}
      </div>
    </section>
  );
}
