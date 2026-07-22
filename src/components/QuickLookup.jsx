import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { app, db } from '../firebase';

// Walk-by lookup: type a business name you're standing outside of and get
// its website + email on the spot, without running a full area scan.
export default function QuickLookup() {
  const [name, setName] = useState('');
  const [useLocation, setUseLocation] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [candidates, setCandidates] = useState(null);

  const [selected, setSelected] = useState(null); // candidate being looked up
  const [loadingContact, setLoadingContact] = useState(false);
  const [contact, setContact] = useState(null);
  const [crmStatus, setCrmStatus] = useState(null); // 'adding' | 'added' | 'duplicate' | 'error'

  function getCurrentPosition() {
    return new Promise((resolve) => {
      if (!useLocation || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null), // denied/unavailable — just search without a bias
        { timeout: 5000 }
      );
    });
  }

  async function handleSearch(e) {
    e?.preventDefault();
    if (!name.trim()) return;
    setSearching(true);
    setError(null);
    setCandidates(null);
    setSelected(null);
    setContact(null);
    setCrmStatus(null);
    try {
      const coords = await getCurrentPosition();
      const fn = httpsCallable(getFunctions(app), 'searchBusinessByName', { timeout: 20000 });
      const { data } = await fn({ query: name.trim(), lat: coords?.lat, lng: coords?.lng });
      const results = data?.results ?? [];
      if (!results.length) {
        setError(`No businesses found matching "${name.trim()}".`);
      } else if (results.length === 1) {
        handleSelect(results[0]);
      } else {
        setCandidates(results);
      }
    } catch (err) {
      console.error('[QuickLookup] search failed:', err);
      setError(err?.message ?? 'Search failed.');
    } finally {
      setSearching(false);
    }
  }

  async function handleSelect(candidate) {
    setSelected(candidate);
    setCandidates(null);
    setContact(null);
    setCrmStatus(null);
    setLoadingContact(true);
    setError(null);
    try {
      // Kept above getBusinessContactByPlaceId's own timeoutSeconds (480s,
      // raised when a second desktop PageSpeed + vision pass was added to
      // the audit it runs internally) — a shorter client timeout cuts the
      // request off before the server-side work even finishes.
      const fn = httpsCallable(getFunctions(app), 'getBusinessContactByPlaceId', { timeout: 500000 });
      const { data } = await fn({ placeId: candidate.placeId });
      setContact(data);
    } catch (err) {
      console.error('[QuickLookup] contact lookup failed:', err);
      setError(err?.message ?? 'Lookup failed.');
    } finally {
      setLoadingContact(false);
    }
  }

  async function handleAddToCrm() {
    if (!contact) return;
    setCrmStatus('adding');
    try {
      if (contact.googleMapsUrl) {
        const dupeQuery = query(collection(db, 'crmLeads'), where('googleMapsUrl', '==', contact.googleMapsUrl));
        const dupeSnap = await getDocs(dupeQuery);
        if (!dupeSnap.empty) {
          setCrmStatus('duplicate');
          return;
        }
      }
      await addDoc(collection(db, 'crmLeads'), {
        businessName: contact.name ?? null,
        website: contact.website ?? null,
        email: contact.contactEmail ?? null,
        phone: contact.phone ?? null,
        contactName: contact.ownerName ?? null,
        instagramUrl: contact.instagramUrl ?? null,
        whatsappUrl: contact.whatsappUrl ?? null,
        industry: null,
        address: contact.address ?? null,
        googleMapsUrl: contact.googleMapsUrl ?? null,
        overallImpression: contact.overallImpression ?? null,
        websiteScore: contact.websiteScore ?? null,
        issuesChecklist: contact.issuesChecklist ?? [],
        speedNotes: contact.speedNotes ?? null,
        mobileNotes: contact.mobileNotes ?? null,
        seoNotes: contact.seoNotes ?? null,
        aiDesignNote: contact.aiDesignNote ?? null,
        status: 'New',
        priority: 'Medium',
        source: 'Quick Lookup',
        tags: [],
        dateAdded: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCrmStatus('added');
    } catch (err) {
      console.error('[QuickLookup] add to CRM failed:', err);
      setCrmStatus('error');
    }
  }

  function reset() {
    setName('');
    setCandidates(null);
    setSelected(null);
    setContact(null);
    setError(null);
    setCrmStatus(null);
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
      <h2 className="text-sm font-semibold text-gray-200">Quick Lookup</h2>
      <p className="mt-1 text-xs text-gray-500">
        Walking past a business? Type its name and get its website + email on the spot.
      </p>

      <form onSubmit={handleSearch} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. The Green Fig Cafe"
          className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={searching || !name.trim()}
          className="shrink-0 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>
      <label className="mt-2 flex items-center gap-2 text-xs text-gray-500">
        <input type="checkbox" checked={useLocation} onChange={(e) => setUseLocation(e.target.checked)} className="accent-blue-500" />
        Use my current location to find the right one nearby
      </label>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {candidates && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-500">Multiple matches — which one?</p>
          {candidates.map((c) => (
            <button
              key={c.placeId}
              onClick={() => handleSelect(c)}
              className="block w-full rounded-lg border border-gray-800 bg-gray-800/40 px-3.5 py-2.5 text-left text-sm text-gray-200 transition hover:border-blue-500/50 hover:bg-gray-800"
            >
              <span className="font-medium">{c.name}</span>
              <span className="block text-xs text-gray-500">{c.address}{c.rating ? ` · ★ ${c.rating}` : ''}</span>
            </button>
          ))}
        </div>
      )}

      {loadingContact && (
        <p className="mt-4 text-xs text-gray-500">Looking up {selected?.name}'s website, email, and running a quick website audit…</p>
      )}

      {contact && (
        <div className="mt-4 rounded-lg border border-gray-800 bg-gray-800/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-100">{contact.name}</p>
              <p className="text-xs text-gray-500">{contact.address}</p>
            </div>
            <button onClick={reset} className="shrink-0 text-xs text-gray-500 hover:text-gray-300">New search</button>
          </div>
          <dl className="mt-3 space-y-1.5 text-xs">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-gray-500">Website</dt>
              <dd className="text-gray-200">
                {contact.website ? <a href={contact.website} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{contact.website}</a> : 'None found'}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-gray-500">Email</dt>
              <dd className="text-gray-200">{contact.contactEmail ?? 'None found'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-gray-500">Phone</dt>
              <dd className="text-gray-200">{contact.phone ?? '—'}</dd>
            </div>
            {contact.ownerName && (
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-gray-500">Contact</dt>
                <dd className="text-gray-200">{contact.ownerName}</dd>
              </div>
            )}
            {contact.instagramUrl && (
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-gray-500">Instagram</dt>
                <dd>
                  <a href={contact.instagramUrl} target="_blank" rel="noreferrer" className="text-pink-400 hover:underline">
                    {contact.instagramUrl.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}
                  </a>
                </dd>
              </div>
            )}
          </dl>

          {contact.website && (
            <div className="mt-3 border-t border-gray-800 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Website Audit</p>
              {contact.websiteScore !== null ? (
                <>
                  <p className="mt-1 text-xs text-gray-300">Performance score: {contact.websiteScore}/100</p>
                  {contact.issuesChecklist?.length > 0 && (
                    <p className="mt-1 text-xs text-gray-400">Issues: {contact.issuesChecklist.join(', ')}</p>
                  )}
                  {contact.aiDesignNote && <p className="mt-1 text-xs text-gray-400">{contact.aiDesignNote}</p>}
                </>
              ) : (
                <p className="mt-1 text-xs text-gray-500">{contact.overallImpression ?? 'Audit could not run for this site.'}</p>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleAddToCrm}
              disabled={crmStatus === 'adding' || crmStatus === 'added' || crmStatus === 'duplicate'}
              className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {crmStatus === 'adding' ? 'Adding…' : crmStatus === 'added' ? 'Added' : crmStatus === 'duplicate' ? 'Already in CRM' : 'Add to CRM'}
            </button>
            {crmStatus === 'error' && <span className="text-xs text-red-400">Failed to add — try again.</span>}
          </div>
        </div>
      )}
    </section>
  );
}
