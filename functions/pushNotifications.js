'use strict';

const { onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { requireOwner } = require('./authGuard');
const { withErrorAlert } = require('./errorAlert');

const TERMINAL_STATUSES = ['Won', 'Lost', 'Archive'];

// ─────────────────────────────────────────────────────────────────────────────
// savePushToken — registers a device's FCM token. Token itself is the doc ID,
// so re-registering the same device is a harmless no-op, not a duplicate.
// ─────────────────────────────────────────────────────────────────────────────
const savePushToken = onCall(
  { cors: true, timeoutSeconds: 10, memory: '256MiB' },
  async (request) => {
    requireOwner(request);
    const { token } = request.data ?? {};
    if (!token?.trim()) return { success: false };
    const db = getFirestore();
    await db.collection('pushTokens').doc(token.trim()).set({ createdAt: FieldValue.serverTimestamp() });
    return { success: true };
  }
);

/**
 * Finds leads due for follow-up today or earlier (excluding closed-out
 * leads) and, if any exist, sends one multicast push notification to every
 * registered device. Shared by the scheduled daily digest and the manual
 * "send now" test trigger.
 */
async function runDigest() {
  const db = getFirestore();

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const dueSnap = await db.collection('crmLeads')
    .where('followUpDate', '<=', Timestamp.fromDate(endOfToday))
    .get();

  const due = dueSnap.docs
    .map((d) => d.data())
    .filter((lead) => !TERMINAL_STATUSES.includes(lead.status));

  if (due.length === 0) return { sent: false, due: 0 };

  const tokensSnap = await db.collection('pushTokens').get();
  const tokens = tokensSnap.docs.map((d) => d.id);
  if (tokens.length === 0) return { sent: false, due: due.length, reason: 'no registered devices' };

  const names = due.slice(0, 2).map((l) => l.businessName || 'a lead').join(', ');
  const body = due.length > 2
    ? `${names}, and ${due.length - 2} more.`
    : names;

  const appUrl = (process.env.APP_URL?.trim() ?? '').replace(/\/$/, '');

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: `${due.length} follow-up${due.length === 1 ? '' : 's'} due today`,
      body,
    },
    webpush: {
      fcmOptions: { link: `${appUrl}/outreach-crm` },
    },
  });

  // Clean up tokens FCM says are dead (uninstalled/expired) so they don't
  // keep accumulating and getting retried forever.
  const deadTokens = response.responses
    .map((r, i) => (!r.success ? tokens[i] : null))
    .filter(Boolean);
  if (deadTokens.length > 0) {
    await Promise.all(deadTokens.map((t) => db.collection('pushTokens').doc(t).delete()));
  }

  return { sent: true, due: due.length, notified: response.successCount, removed: deadTokens.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// sendFollowUpDigest — scheduled daily digest, 8am Europe/London
// ─────────────────────────────────────────────────────────────────────────────
const sendFollowUpDigest = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'Europe/London', timeoutSeconds: 60, memory: '256MiB', secrets: ['APP_URL'] },
  withErrorAlert('sendFollowUpDigest', async () => { await runDigest(); })
);

// ─────────────────────────────────────────────────────────────────────────────
// sendFollowUpDigestNow — manual trigger for testing
// ─────────────────────────────────────────────────────────────────────────────
const sendFollowUpDigestNow = onCall(
  { cors: true, timeoutSeconds: 60, memory: '256MiB', secrets: ['APP_URL'] },
  async (request) => { requireOwner(request); return runDigest(); }
);

// ─────────────────────────────────────────────────────────────────────────────
// notifyNewHotLeads — same-night alert for a standout lead the overnight
// business auto-scan just added, so Dean can respond fast instead of only
// finding out the next time he opens the app. The coding-leads scan already
// has the equivalent (notifyHighScoreLeads, email-based); this is the
// business-scan counterpart, push-based like the rest of this file.
// ─────────────────────────────────────────────────────────────────────────────
async function notifyNewHotLeads(hotLeads) {
  if (!hotLeads?.length) return;
  const db = getFirestore();
  const tokensSnap = await db.collection('pushTokens').get();
  const tokens = tokensSnap.docs.map((d) => d.id);
  if (tokens.length === 0) return;

  const names = hotLeads.slice(0, 2).map((l) => l.businessName || 'a lead').join(', ');
  const body = hotLeads.length > 2 ? `${names}, and ${hotLeads.length - 2} more.` : names;
  const appUrl = (process.env.APP_URL?.trim() ?? '').replace(/\/$/, '');

  await getMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: `${hotLeads.length} hot lead${hotLeads.length === 1 ? '' : 's'} found overnight`,
      body,
    },
    webpush: { fcmOptions: { link: `${appUrl}/outreach-crm` } },
  }).catch((err) => console.error('[notifyNewHotLeads] send failed:', err.message));
}

// ─────────────────────────────────────────────────────────────────────────────
// notifyOwner — generic single-notification send, for the workflow engine's
// NOTIFY_OWNER action and anything else that just needs "push Dean a message"
// without the lead-list-specific formatting the two functions above do.
// ─────────────────────────────────────────────────────────────────────────────
async function notifyOwner(title, body, link) {
  const db = getFirestore();
  const tokensSnap = await db.collection('pushTokens').get();
  const tokens = tokensSnap.docs.map((d) => d.id);
  if (tokens.length === 0) return { notified: 0 };

  const appUrl = (process.env.APP_URL?.trim() ?? '').replace(/\/$/, '');
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: { fcmOptions: { link: `${appUrl}${link ?? '/outreach-crm'}` } },
  }).catch((err) => { console.error('[notifyOwner] send failed:', err.message); return null; });

  return { notified: response?.successCount ?? 0 };
}

module.exports = { savePushToken, sendFollowUpDigest, sendFollowUpDigestNow, notifyNewHotLeads, notifyOwner };
