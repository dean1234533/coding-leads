'use strict';

const { HttpsError } = require('firebase-functions/v2/https');

// The only Google account allowed to call any CRM-side Cloud Function.
// Frontend sign-in is silent anonymous auth (so there's no login-screen
// friction and Firestore rules have *something* to check) — but that means
// `request.auth != null` is satisfied by literally any visitor, anonymous
// session included. Every onCall handler that touches CRM data, sends email,
// or spends API quota must call requireOwner() first; the two genuinely
// public customer-facing booking functions (getLiveAvailability,
// confirmBooking) are the deliberate exception and must NOT call this.
const OWNER_EMAIL = 'deanburt1308@gmail.com';

function requireOwner(request) {
  if (request.auth?.token?.email !== OWNER_EMAIL) {
    throw new HttpsError('permission-denied', 'Not authorized.');
  }
}

module.exports = { OWNER_EMAIL, requireOwner };
