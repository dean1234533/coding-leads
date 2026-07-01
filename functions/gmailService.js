'use strict';

const { google } = require('googleapis');

/**
 * Builds an authenticated Gmail API client using OAuth2.
 *
 * Required environment variables:
 *   GMAIL_CLIENT_ID      — OAuth2 client ID from Google Cloud Console
 *   GMAIL_CLIENT_SECRET  — OAuth2 client secret
 *   GMAIL_REFRESH_TOKEN  — Long-lived refresh token with gmail.compose scope
 *
 * @returns {import('googleapis').gmail_v1.Gmail}
 */
function getGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID?.trim(),
    process.env.GMAIL_CLIENT_SECRET?.trim(),
    'urn:ietf:wg:oauth:2.0:oob'
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN?.trim(),
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
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  console.log('[gmailService] client_id prefix:', clientId?.slice(0, 12));
  console.log('[gmailService] client_secret present:', !!clientSecret);
  console.log('[gmailService] refresh_token present:', !!refreshToken);

  const gmail = getGmailClient();

  // Build a minimal RFC 2822 message
  const rawLines = [
    `From: me`,
    to ? `To: ${to}` : '',
    `Subject: ${subject}`,
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
  const gmail = getGmailClient();

  const rawLines = [
    `From: me`,
    `To: ${to}`,
    `Subject: ${subject}`,
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

module.exports = { createGmailDraft, sendEmail };
