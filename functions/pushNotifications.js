'use strict';

const { onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

const TERMINAL_STATUSES = ['Won', 'Lost', 'Archive'];

// ─────────────────────────────────────────────────────────────────────────────
// savePushToken — registers a device's FCM token. Token itself is the doc ID,
// so re-registering the same device is a harmless no-op, not a duplicate.
// ─────────────────────────────────────────────────────────────────────────────
const savePushToken = onCall(
  { cors: true, timeoutSeconds: 10, memory: '256MiB' },
  async (request) => {
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
  async () => { await runDigest(); }
);

// ─────────────────────────────────────────────────────────────────────────────
// sendFollowUpDigestNow — manual trigger for testing
// ─────────────────────────────────────────────────────────────────────────────
const sendFollowUpDigestNow = onCall(
  { cors: true, timeoutSeconds: 60, memory: '256MiB', secrets: ['APP_URL'] },
  async () => runDigest()
);

module.exports = { savePushToken, sendFollowUpDigest, sendFollowUpDigestNow };
