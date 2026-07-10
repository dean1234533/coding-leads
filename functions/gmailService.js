'use strict';

const { google } = require('googleapis');
const { OUTREACH_FROM_ADDRESS } = require('./emailConfig');
const { encodeMimeHeader } = require('./mimeHeader');

/**
 * Builds an authenticated Gmail API client using OAuth2.
 *
 * Prefers the refresh token stored by the in-app Connect Gmail flow
 * (functions/gmailOAuth.js, encrypted in Firestore at gmailTokens/default).
 * Falls back to the legacy CLI-configured GMAIL_REFRESH_TOKEN secret so
 * existing deployments keep working until they reconnect through the UI.
 *
 * Required environment variables:
 *   GMAIL_CLIENT_ID      — OAuth2 client ID from Google Cloud Console
 *   GMAIL_CLIENT_SECRET  — OAuth2 client secret
 *   GMAIL_REFRESH_TOKEN  — legacy fallback refresh token (optional once connected via UI)
 *
 * @returns {Promise<import('googleapis').gmail_v1.Gmail>}
 */
async function getGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID?.trim(),
    process.env.GMAIL_CLIENT_SECRET?.trim(),
    'urn:ietf:wg:oauth:2.0:oob'
  );

  // Lazy require to avoid a circular dependency (gmailOAuth.js doesn't import this file).
  const { getStoredRefreshToken } = require('./gmailOAuth');
  const storedToken = await getStoredRefreshToken();

  oauth2Client.setCredentials({
    refresh_token: storedToken ?? process.env.GMAIL_REFRESH_TOKEN?.trim(),
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Saves an email as a Gmail Draft. This function NEVER sends the email.
 *
 * The raw RFC 2822 message is base64url-encoded before being passed to the API,
 * which is what Gmail's `drafts.create` endpoint expects.
 *
 * @param {object} params
 * @param {string} params.to      - Recipient email address (can be empty string)
 * @param {string} params.subject - Email subject line
 * @param {string} params.body    - Plain-text email body
 * @returns {Promise<string>} The Gmail draft ID (e.g. "r123456789")
 */
async function createGmailDraft({ to, subject, body }) {
  const gmail = await getGmailClient();

  // Build a minimal RFC 2822 message
  const rawLines = [
    `From: ${OUTREACH_FROM_ADDRESS}`,
    to ? `To: ${to}` : '',
    `Subject: ${encodeMimeHeader(subject)}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ]
    .filter(Boolean)
    .join('\r\n');

  // Gmail requires base64url encoding (not standard base64)
  const encodedMessage = Buffer.from(rawLines).toString('base64url');

  const response = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: { raw: encodedMessage },
    },
  });

  const draftId = response.data.id;
  console.log(`[gmailService] Draft created successfully. ID: ${draftId}`);
  return draftId;
}

/**
 * Sends an email immediately via Gmail API.
 * Used for owner notifications only — outreach emails remain drafts.
 */
async function sendEmail({ to, subject, body }) {
  const gmail = await getGmailClient();

  const rawLines = [
    `From: ${OUTREACH_FROM_ADDRESS}`,
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n');

  const encodedMessage = Buffer.from(rawLines).toString('base64url');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });
}

module.exports = { getGmailClient, createGmailDraft, sendEmail };
