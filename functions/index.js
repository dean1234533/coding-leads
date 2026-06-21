'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp }      = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { findOwnerEmail }     = require('./leadService');
const { createGmailDraft }   = require('./gmailService');

// Initialize Firebase Admin SDK (uses Application Default Credentials in Cloud)
initializeApp();
const db = getFirestore();

// ─────────────────────────────────────────────────────────────────────────────
// Static Email Template
//
// This template is populated with the lead's details at runtime.
// The 3-sentence structure mirrors the outreach_email_prompt.md persona:
//   Sentence 1 — personalized opener using company name and website
//   Sentence 2 — fixed authority/credibility line
//   Sentence 3 — fixed low-pressure CTA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fills in the static outreach email template with lead-specific values.
 *
 * @param {string} companyName
 * @param {string} websiteUrl
 * @param {string} ownerName
 * @returns {{ subject: string, body: string }}
 */
function buildEmail(companyName, websiteUrl, ownerName) {
  const subject = `A quick idea for ${companyName}`;

  const body = [
    `Hi ${ownerName},`,
    '',
    // Sentence 1 — personalized context using the submitted website URL
    `I was browsing ${companyName}'s website at ${websiteUrl} and noticed your business `
    + `doesn't appear to have a dedicated mobile app — which likely means customers `
    + `can't engage with you conveniently from their phones.`,

    // Sentence 2 — fixed authority line (verbatim from persona brief)
    `I'm a local developer who recently published the "JS Grow Up" app to the Google `
    + `Play Store — I help businesses avoid the tech headache by handling the entire `
    + `process, from design and development through launch and store submission.`,

    // Sentence 3 — fixed low-pressure CTA (verbatim from persona brief)
    `I have capacity for one new local project this month; would you be open to a quick `
    + `5-minute chat to see whether a mobile app could help ${companyName} grow?`,

    '',
    'Dean Burt',
    'deanburt1308@gmail.com',
  ].join('\n');

  return { subject, body };
}

// ─────────────────────────────────────────────────────────────────────────────
// Firebase Callable Function: createOutreachDraft
//
// Called from the frontend via httpsCallable(functions, 'createOutreachDraft').
//
// Flow:
//   1. Validate inputs
//   2. Create a Firestore lead record with status "pending"
//   3. Look up the owner's email via Hunter.io
//   4. Populate the static email template
//   5. Create a Gmail Draft (never sends)
//   6. Update Firestore record with final status and draft ID
// ─────────────────────────────────────────────────────────────────────────────

exports.createOutreachDraft = onCall(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    // Declare secrets so Firebase injects them as process.env at runtime
    secrets: [
      'HUNTER_KEY',
      'GMAIL_CLIENT_ID',
      'GMAIL_CLIENT_SECRET',
      'GMAIL_REFRESH_TOKEN',
    ],
  },
  async (request) => {
    const { companyName, websiteUrl, ownerName } = request.data ?? {};

    // ── Step 1: Validate inputs ──────────────────────────────────────────────
    if (!companyName?.trim() || !websiteUrl?.trim() || !ownerName?.trim()) {
      throw new HttpsError(
        'invalid-argument',
        'companyName, websiteUrl, and ownerName are all required.'
      );
    }

    const normalizedUrl = websiteUrl.startsWith('http')
      ? websiteUrl.trim()
      : `https://${websiteUrl.trim()}`;

    // ── Step 2: Create Firestore record immediately (shown as "Pending") ─────
    const leadRef = await db.collection('leads').add({
      companyName:  companyName.trim(),
      websiteUrl:   normalizedUrl,
      ownerName:    ownerName.trim(),
      ownerEmail:   null,
      gmailDraftId: null,
      status:       'pending',
      createdAt:    FieldValue.serverTimestamp(),
    });

    try {
      // ── Step 3: Look up the owner's email via Hunter.io ───────────────────
      // Extract the root domain from the URL (strips www. prefix)
      const domain = new URL(normalizedUrl).hostname.replace(/^www\./, '');
      const ownerEmail = await findOwnerEmail(domain, ownerName.trim());

      // ── Step 4: Populate the email template ───────────────────────────────
      const { subject, body } = buildEmail(
        companyName.trim(),
        normalizedUrl,
        ownerName.trim()
      );

      // ── Step 5: Create the Gmail Draft ────────────────────────────────────
      // If no email was found, the draft is saved without a "To:" address
      // so it can be filled in manually before sending.
      const gmailDraftId = await createGmailDraft({
        to: ownerEmail ?? '',
        subject,
        body,
      });

      // ── Step 6: Mark the lead as complete ─────────────────────────────────
      await leadRef.update({
        ownerEmail:   ownerEmail ?? null,
        gmailDraftId,
        status:       'draft_created',
        updatedAt:    FieldValue.serverTimestamp(),
      });

      return {
        success:      true,
        leadId:       leadRef.id,
        gmailDraftId,
        emailFound:   ownerEmail !== null,
      };
    } catch (err) {
      // On any error, mark the lead as failed in Firestore so it's visible
      console.error('[createOutreachDraft] Error:', err.message);
      await leadRef.update({
        status:       'error',
        errorMessage: err.message,
        updatedAt:    FieldValue.serverTimestamp(),
      });
      throw new HttpsError('internal', err.message);
    }
  }
);
