'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { findOwnerEmail, findGenericEmail } = require('./leadService');
const axios = require('axios');

// ─────────────────────────────────────────────────────────────────────────────
// findLeadEmail — Hunter.io lookup for a CRM lead, ported from the old
// createOutreachDraft flow so the CRM can find an email without the legacy
// manual-draft form. Falls back to a generic domain-level email (hello@,
// contact@, etc.) when there's no known contact name to search against —
// e.g. a backlink prospect found via search, not a named business owner.
// ─────────────────────────────────────────────────────────────────────────────
const findLeadEmail = onCall(
  { cors: true, timeoutSeconds: 20, memory: '256MiB', secrets: ['HUNTER_KEY'] },
  async (request) => {
    const { website, contactName } = request.data ?? {};
    if (!website?.trim()) {
      throw new HttpsError('invalid-argument', 'website is required.');
    }

    let domain;
    try {
      const url = website.startsWith('http') ? website.trim() : `https://${website.trim()}`;
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      throw new HttpsError('invalid-argument', 'Could not parse a domain from that website.');
    }

    const email = contactName?.trim()
      ? await findOwnerEmail(domain, contactName.trim().split(/\s+/)[0])
      : await findGenericEmail(domain);
    return { email };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// migrateLegacyLeads — one-time import of the old `leads` collection into
// `crmLeads`. Safe to run more than once: dedupes on businessName + website.
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_MAP = {
  pending: 'New',
  draft_created: 'Ready To Contact',
  error: 'New',
};

const migrateLegacyLeads = onCall(
  { cors: true, timeoutSeconds: 120, memory: '256MiB' },
  async () => {
    const db = getFirestore();

    const [legacySnap, crmSnap] = await Promise.all([
      db.collection('leads').get(),
      db.collection('crmLeads').get(),
    ]);

    const existingKeys = new Set(
      crmSnap.docs.map((d) => {
        const data = d.data();
        return `${(data.businessName ?? '').trim().toLowerCase()}|${(data.website ?? '').trim().toLowerCase()}`;
      })
    );

    let migrated = 0;
    let skipped = 0;
    const batch = db.batch();

    for (const doc of legacySnap.docs) {
      const lead = doc.data();
      const key = `${(lead.companyName ?? '').trim().toLowerCase()}|${(lead.websiteUrl ?? '').trim().toLowerCase()}`;
      if (existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
      existingKeys.add(key);

      const newDocRef = db.collection('crmLeads').doc();
      batch.set(newDocRef, {
        businessName: lead.companyName ?? null,
        website: lead.websiteUrl ?? null,
        contactName: lead.ownerName ?? null,
        email: lead.ownerEmail ?? null,
        demoUrl: lead.mockupUrl ?? null,
        status: STATUS_MAP[lead.status] ?? 'New',
        priority: 'Medium',
        source: lead.source ?? 'Legacy Pipeline',
        tags: [],
        notes: lead.status === 'error' && lead.errorMessage
          ? `Migrated from Lead Pipeline. Previous error: ${lead.errorMessage}`
          : 'Migrated from Lead Pipeline.',
        dateAdded: lead.createdAt ?? FieldValue.serverTimestamp(),
        updatedAt: lead.updatedAt ?? FieldValue.serverTimestamp(),
      });
      migrated += 1;
    }

    if (migrated > 0) await batch.commit();

    return { migrated, skipped };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// recoverBacklinkPageTitles — the businessName fix above overwrote the only
// place the article title was stored on already-scanned leads (new scans
// save it into notes too, but these existing ones predate that). Since the
// source pages are still live, re-fetch each one's real <title> tag and
// restore it into notes instead of leaving it lost. Processes up to 40 per
// call to stay well under the timeout — safe/cheap to run more than once,
// since already-recovered leads (notes already has "Page:") are skipped.
// ─────────────────────────────────────────────────────────────────────────────
const recoverBacklinkPageTitles = onCall(
  { cors: true, timeoutSeconds: 300, memory: '256MiB' },
  async () => {
    const db = getFirestore();
    const snap = await db.collection('crmLeads').where('category', '==', 'Backlink').get();

    const allPending = snap.docs.filter((d) => !d.data().notes?.includes('Page:'));
    const pending = allPending.slice(0, 40);

    let updated = 0;
    let failed = 0;

    for (const doc of pending) {
      const { website, notes } = doc.data();
      if (!website) { failed++; continue; }
      try {
        const { data: html } = await axios.get(website, {
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; coding-leads-tracker/1.0)' },
        });
        const match = String(html).match(/<title[^>]*>([^<]*)<\/title>/i);
        const title = match?.[1]?.trim().replace(/\s+/g, ' ').slice(0, 200);
        if (!title) { failed++; continue; }
        await doc.ref.update({ notes: `Page: ${title}\n\n${notes ?? ''}`.trim() });
        updated++;
      } catch {
        failed++;
      }
    }

    return { updated, failed, remaining: allPending.length - updated - failed };
  }
);

module.exports = { findLeadEmail, migrateLegacyLeads, recoverBacklinkPageTitles };
