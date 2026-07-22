'use strict';

const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

// Background/scheduled functions run with nobody watching — a failure
// (Cloud Run quota, an expired token, a provider outage) was previously
// only visible by going and reading logs. Reuses the same FCM push
// infrastructure already built for the follow-up digest to surface
// failures the same way: a push notification to whatever device(s) are
// registered. Best-effort and silent on its own failure — an alerting
// failure must never mask or replace the original error being reported.
async function sendErrorAlert(title, body) {
  try {
    const db = getFirestore();
    const tokensSnap = await db.collection('pushTokens').get();
    const tokens = tokensSnap.docs.map((d) => d.id);
    if (tokens.length === 0) return;

    await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body: body.slice(0, 200) },
    });
  } catch (err) {
    console.error('[errorAlert] Failed to send alert push:', err.message);
  }
}

// Wraps a scheduled function's handler: runs it, and on any thrown error,
// fires a push alert with the function's own name before re-throwing (so
// the error still shows up in Cloud Functions logs exactly as before —
// this only adds visibility, it doesn't swallow anything).
function withErrorAlert(functionName, handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      await sendErrorAlert(`${functionName} failed`, err.message ?? String(err));
      throw err;
    }
  };
}

module.exports = { sendErrorAlert, withErrorAlert };
