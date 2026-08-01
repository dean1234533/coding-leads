import { useEffect, useRef } from 'react';
import { collection, onSnapshot, setDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { DEFAULT_TEMPLATES, slugify } from '../../utils/crmConstants';

/**
 * Keeps crmTemplates populated with the built-in defaults and free of
 * duplicates. Mounted once at the top of the CRM (not inside a tab) so it
 * runs regardless of which tab is open.
 *
 * Looks up existing docs BY NAME first (not by assuming the doc ID equals
 * slugify(name)) and updates them in place using their real ID — templates
 * created before deterministic IDs existed have random Firestore auto-IDs,
 * and treating slugify(name) as "the" doc ID for those caused a second,
 * duplicate doc to be created every load, with the dedupe pass unpredictably
 * keeping the old stale one over the freshly-written one. Docs are only
 * refreshed while `isDefault !== false` — editing a built-in template
 * through the UI sets isDefault: false so your edit sticks.
 */
function useAutoSeedCollection(collectionName, defaults) {
  const seededRef = useRef(false);

  useEffect(() => {
    return onSnapshot(collection(db, collectionName), (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (!seededRef.current) {
        seededRef.current = true;
        const byName = new Map(docs.map((d) => [d.name, d]));
        const writes = defaults
          .map((item) => {
            const existing = byName.get(item.name);
            if (existing && existing.isDefault === false) return null; // user-edited, leave it alone
            const targetId = existing ? existing.id : slugify(item.name);
            return setDoc(doc(db, collectionName, targetId), { ...item, isDefault: true, createdAt: serverTimestamp() }, { merge: true });
          })
          .filter(Boolean);
        Promise.all(writes).catch((err) => console.error(`[CrmAutoSeed] ${collectionName} seed failed:`, err));
      }

      // Dedupe any duplicates (from before this fix, or from a name collision) —
      // prefer keeping the doc at the canonical slug ID when one exists among
      // the duplicates, since that's the one seeding above will keep refreshing.
      const byName = new Map();
      for (const d of docs) (byName.get(d.name) ?? byName.set(d.name, []).get(d.name)).push(d);
      const extras = [];
      for (const group of byName.values()) {
        if (group.length <= 1) continue;
        const canonicalId = slugify(group[0].name);
        const keep = group.find((d) => d.id === canonicalId) ?? group[0];
        extras.push(...group.filter((d) => d !== keep).map((d) => d.id));
      }

      // Retire built-in templates that were merged/renamed/deleted from
      // `defaults` (e.g. duplicate industry variants consolidated into one) —
      // otherwise the stale seeded doc lingers in Firestore forever and keeps
      // showing up in the compose-time picker even though it's gone from the
      // source. Never touches a doc the user edited themselves (isDefault:
      // false) or anything not originally seeded by this component at all
      // (isDefault === undefined, i.e. a genuinely custom template).
      const defaultNames = new Set(defaults.map((d) => d.name));
      const retired = docs
        .filter((d) => d.isDefault === true && !defaultNames.has(d.name))
        .map((d) => d.id);

      const toDelete = [...new Set([...extras, ...retired])];
      if (toDelete.length > 0) {
        Promise.all(toDelete.map((id) => deleteDoc(doc(db, collectionName, id))))
          .catch((err) => console.error(`[CrmAutoSeed] ${collectionName} cleanup failed:`, err));
      }
    });
  }, [collectionName, defaults]);
}

export default function CrmAutoSeed() {
  useAutoSeedCollection('crmTemplates', DEFAULT_TEMPLATES);
  return null;
}
