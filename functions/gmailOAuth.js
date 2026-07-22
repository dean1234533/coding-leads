'use strict';

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const crypto = require('crypto');
const { google } = require('googleapis');
const { requireOwner } = require('./authGuard');

// Full mailbox access (read, send, labels, drafts) via a single scope/consent.
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
];

const OAUTH_SECRETS = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEY', 'APP_URL'];

function getRedirectUri() {
  // 2nd-gen onRequest functions resolve to a Cloud Run URL, not the legacy
  // us-central1-PROJECT.cloudfunctions.net pattern used by 1st-gen functions.
  // Override via the OAUTH_REDIRECT_URI secret if this function is ever
  // deleted and recreated (which changes the Cloud Run URL's random suffix).
  return process.env.OAUTH_REDIRECT_URI?.trim()
    ?? 'https://gmailoauthcallback-fuhvokki4q-uc.a.run.app';
}

function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID?.trim(),
    process.env.GMAIL_CLIENT_SECRET?.trim(),
    getRedirectUri()
  );
}

/**
 * AES-256-GCM encryption for the refresh token at rest in Firestore.
 * TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key
 * (generate with: openssl rand -base64 32).
 */
function encryptToken(plaintext) {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY?.trim() ?? '', 'base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

function decryptToken(payload) {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY?.trim() ?? '', 'base64');
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Reads and decrypts the stored Gmail refresh token, if connected.
 * @returns {Promise<string|null>}
 */
async function getStoredRefreshToken() {
  const db = getFirestore();
  const snap = await db.collection('gmailTokens').doc('default').get();
  if (!snap.exists) return null;
  const encrypted = snap.data()?.refreshToken;
  if (!encrypted) return null;
  try {
    return decryptToken(encrypted);
  } catch (err) {
    console.error('[gmailOAuth] Failed to decrypt stored refresh token:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getGmailAuthUrl — returns the Google consent URL for the frontend to open
// ─────────────────────────────────────────────────────────────────────────────
const getGmailAuthUrl = onCall(
  { cors: true, timeoutSeconds: 10, memory: '256MiB', secrets: OAUTH_SECRETS },
  async (request) => {
    requireOwner(request);
    const oauth2Client = buildOAuthClient();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GMAIL_SCOPES,
    });
    return { url };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// gmailOAuthCallback — Google redirects the browser here with ?code=...
// ─────────────────────────────────────────────────────────────────────────────
const gmailOAuthCallback = onRequest(
  // Google's redirect is an unauthenticated browser GET — this must be publicly
  // invokable or Cloud Run's IAM layer rejects it before our code ever runs.
  { cors: true, timeoutSeconds: 30, memory: '256MiB', secrets: OAUTH_SECRETS, invoker: 'public' },
  async (req, res) => {
    const appUrl = (process.env.APP_URL?.trim() ?? '').replace(/\/$/, '');
    const code = req.query.code;

    if (!code) {
      res.redirect(`${appUrl}/outreach-crm?gmail=error&reason=missing_code`);
      return;
    }

    try {
      const oauth2Client = buildOAuthClient();
      const { tokens } = await oauth2Client.getToken(String(code));

      if (!tokens.refresh_token) {
        // Google only issues a refresh_token on first consent (or with prompt=consent, every time).
        res.redirect(`${appUrl}/outreach-crm?gmail=error&reason=no_refresh_token`);
        return;
      }

      oauth2Client.setCredentials(tokens);
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });

      const db = getFirestore();
      await db.collection('gmailTokens').doc('default').set({
        refreshToken: encryptToken(tokens.refresh_token),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await db.collection('gmailConnectionStatus').doc('default').set({
        connected: true,
        emailAddress: profile.data.emailAddress ?? null,
        connectedAt: FieldValue.serverTimestamp(),
      });

      res.redirect(`${appUrl}/outreach-crm?gmail=connected`);
    } catch (err) {
      console.error('[gmailOAuthCallback]', err.message);
      res.redirect(`${appUrl}/outreach-crm?gmail=error&reason=exchange_failed`);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// disconnectGmail — revokes the token and clears connection state
// ─────────────────────────────────────────────────────────────────────────────
const disconnectGmail = onCall(
  { cors: true, timeoutSeconds: 20, memory: '256MiB', secrets: OAUTH_SECRETS },
  async (request) => {
    requireOwner(request);
    const db = getFirestore();
    const refreshToken = await getStoredRefreshToken();

    if (refreshToken) {
      try {
        const oauth2Client = buildOAuthClient();
        await oauth2Client.revokeToken(refreshToken);
      } catch (err) {
        // Token may already be invalid/revoked upstream — still clear local state.
        console.warn('[disconnectGmail] revokeToken failed:', err.message);
      }
    }

    await db.collection('gmailTokens').doc('default').delete();
    await db.collection('gmailConnectionStatus').doc('default').set({
      connected: false,
      emailAddress: null,
      connectedAt: null,
    });

    return { success: true };
  }
);

module.exports = {
  GMAIL_SCOPES,
  OAUTH_SECRETS,
  getGmailAuthUrl,
  gmailOAuthCallback,
  disconnectGmail,
  getStoredRefreshToken,
  encryptToken,
  decryptToken,
};
