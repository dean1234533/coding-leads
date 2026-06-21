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
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob' // out-of-band redirect used when getting the token
  );

  // Set the stored refresh token — the client will auto-renew the access token
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
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

module.exports = { createGmailDraft };
