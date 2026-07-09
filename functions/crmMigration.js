'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { findOwnerEmail } = require('./leadService');

// ─────────────────────────────────────────────────────────────────────────────
// findLeadEmail — Hunter.io lookup for a CRM lead, ported from the old
// createOutreachDraft flow so the CRM can find an email without the legacy
// manual-draft form.
// ─────────────────────────────────────────────────────────────────────────────
const findLeadEmail = onCall(
  { cors: true, timeoutSeconds: 20, memory: '256MiB', secrets: ['HUNTER_KEY'] },
  async (request) => {
    const { website, contactName } = request.data ?? {};
    if (!website?.trim() || !contactName?.trim()) {
      throw new HttpsError('invalid-argument', 'website and contactName are required.');
    }

    let domain;
    try {
      const url = website.startsWith('http') ? website.trim() : `https://${website.trim()}`;
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      throw new HttpsError('invalid-argument', 'Could not parse a domain from that website.');
    }

    const firstName = contactName.trim().split(/\s+/)[0];
    const email = await findOwnerEmail(domain, firstName);
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

module.exports = { findLeadEmail, migrateLegacyLeads };
