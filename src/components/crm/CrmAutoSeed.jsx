import { useEffect, useRef } from 'react';
import { collection, onSnapshot, setDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { DEFAULT_TEMPLATES, DEFAULT_PORTFOLIO, slugify } from '../../utils/crmConstants';

/**
 * Keeps crmTemplates and crmPortfolio populated with the built-in defaults
 * and free of duplicates. Mounted once at the top of the CRM (not inside the
 * Templates/Settings tabs) so it runs regardless of which tab is open —
 * duplicates used to survive indefinitely if you never visited those tabs,
 * since the seed/dedupe logic only ran when they mounted.
 *
 * Seeding uses setDoc with a deterministic ID (slug of the name), which is
 * safe to run repeatedly — writing the same ID twice just overwrites the
 * same doc rather than creating a new one. Docs are only refreshed from the
 * code defaults while `isDefault !== false` — editing a built-in template
 * or demo through the UI sets isDefault: false so your edit sticks instead
 * of being silently reverted the next time the app loads.
 */
function useAutoSeedCollection(collectionName, defaults) {
  const seededRef = useRef(false);

  useEffect(() => {
    return onSnapshot(collection(db, collectionName), (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const byId = new Map(docs.map((d) => [d.id, d]));

      if (!seededRef.current) {
        seededRef.current = true;
        const toWrite = defaults.filter((item) => byId.get(slugify(item.name))?.isDefault !== false);
        Promise.all(
          toWrite.map((item) => setDoc(doc(db, collectionName, slugify(item.name)), { ...item, isDefault: true, createdAt: serverTimestamp() }, { merge: true }))
        ).catch((err) => console.error(`[CrmAutoSeed] ${collectionName} seed failed:`, err));
      }

      // Dedupe anything created before this fix existed (same name, multiple docs).
      const byName = new Map();
      for (const d of docs) (byName.get(d.name) ?? byName.set(d.name, []).get(d.name)).push(d);
      const extras = [...byName.values()]
        .filter((group) => group.length > 1)
        .flatMap((group) => group.slice(1).map((d) => d.id));
      if (extras.length > 0) {
        Promise.all(extras.map((id) => deleteDoc(doc(db, collectionName, id))))
          .catch((err) => console.error(`[CrmAutoSeed] ${collectionName} dedupe failed:`, err));
      }
    });
  }, [collectionName, defaults]);
}

export default function CrmAutoSeed() {
  useAutoSeedCollection('crmTemplates', DEFAULT_TEMPLATES);
  useAutoSeedCollection('crmPortfolio', DEFAULT_PORTFOLIO);
  return null;
}
