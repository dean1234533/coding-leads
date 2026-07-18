'use strict';

const { onCall, onSchedule, HttpsError } = (() => {
  const https = require('firebase-functions/v2/https');
  const scheduler = require('firebase-functions/v2/scheduler');
  return { onCall: https.onCall, HttpsError: https.HttpsError, onSchedule: scheduler.onSchedule };
})();
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getGmailClient } = require('./gmailService');
const { OAUTH_SECRETS } = require('./gmailOAuth');
const { OUTREACH_FROM_ADDRESS } = require('./emailConfig');
const { encodeMimeHeader } = require('./mimeHeader');
const { generateAuditEmail } = require('./aiEmailWriter');

const CRM_GMAIL_SECRETS = [...new Set([...OAUTH_SECRETS, 'GMAIL_REFRESH_TOKEN'])];

/**
 * Builds a raw base64url RFC 2822 message, optionally multipart with attachments.
 */
function buildRawMessage({ to, cc, subject, bodyHtml, bodyText, attachments = [], threadHeaders = {} }) {
  const boundary = `crm_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const hasAttachments = attachments.length > 0;

  const headers = [
    `From: ${OUTREACH_FROM_ADDRESS}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : '',
    `Subject: ${encodeMimeHeader(subject ?? '')}`,
    'MIME-Version: 1.0',
    threadHeaders.inReplyTo ? `In-Reply-To: ${threadHeaders.inReplyTo}` : '',
    threadHeaders.references ? `References: ${threadHeaders.references}` : '',
  ].filter(Boolean);

  const textPart = bodyText ?? (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, ' ') : '');
  const htmlPart = bodyHtml ?? (bodyText ? `<p>${bodyText.replace(/\n/g, '<br>')}</p>` : '');

  const altBoundary = `${boundary}_alt`;
  const altPart = [
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    textPart,
    `--${altBoundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlPart,
    `--${altBoundary}--`,
  ].join('\r\n');

  if (!hasAttachments) {
    const message = [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      altPart,
    ].join('\r\n');
    return Buffer.from(message).toString('base64url');
  }

  const attachmentParts = attachments.map((att) => [
    `--${boundary}`,
    `Content-Type: ${att.mimeType || 'application/octet-stream'}; name="${att.filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${att.filename}"`,
    '',
    att.dataBase64,
  ].join('\r\n')).join('\r\n');

  const message = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    altPart,
    '',
    attachmentParts,
    `--${boundary}--`,
  ].join('\r\n');

  return Buffer.from(message).toString('base64url');
}

function decodeBase64Url(data) {
  if (!data) return '';
  return Buffer.from(data, 'base64url').toString('utf8');
}

/** Recursively finds the first text/plain and text/html body parts of a Gmail message payload. */
function extractBodies(payload) {
  let text = '';
  let html = '';

  function walk(part) {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body?.data) {
      text += decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      html += decodeBase64Url(part.body.data);
    }
    (part.parts ?? []).forEach(walk);
  }

  walk(payload);
  if (!text && payload?.body?.data && !payload.parts) {
    text = decodeBase64Url(payload.body.data);
  }
  return { text, html };
}

function headerValue(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// gmailListMessages — inbox / sent / search, list view
// ─────────────────────────────────────────────────────────────────────────────
const gmailListMessages = onCall(
  { cors: true, timeoutSeconds: 30, memory: '256MiB', secrets: CRM_GMAIL_SECRETS },
  async (request) => {
    const { folder = 'inbox', query = '', pageToken } = request.data ?? {};
    const gmail = await getGmailClient();

    const folderQuery = folder === 'sent' ? 'in:sent' : folder === 'search' ? '' : 'in:inbox';
    const q = [folderQuery, query].filter(Boolean).join(' ').trim();

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: q || undefined,
      maxResults: 25,
      pageToken: pageToken || undefined,
    });

    const ids = (listRes.data.messages ?? []).map((m) => m.id);
    const messages = await Promise.all(
      ids.map((id) =>
        gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'To', 'Subject', 'Date'] })
          .then((r) => r.data)
          .catch(() => null)
      )
    );

    const items = messages.filter(Boolean).map((m) => ({
      id: m.id,
      threadId: m.threadId,
      snippet: m.snippet,
      labelIds: m.labelIds ?? [],
      unread: (m.labelIds ?? []).includes('UNREAD'),
      from: headerValue(m.payload?.headers, 'From'),
      to: headerValue(m.payload?.headers, 'To'),
      subject: headerValue(m.payload?.headers, 'Subject'),
      date: headerValue(m.payload?.headers, 'Date'),
    }));

    return { items, nextPageToken: listRes.data.nextPageToken ?? null };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// gmailGetThread — full conversation for the thread viewer
// ─────────────────────────────────────────────────────────────────────────────
const gmailGetThread = onCall(
  { cors: true, timeoutSeconds: 30, memory: '256MiB', secrets: CRM_GMAIL_SECRETS },
  async (request) => {
    const { threadId } = request.data ?? {};
    if (!threadId) throw new HttpsError('invalid-argument', 'threadId is required.');

    const gmail = await getGmailClient();
    const res = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });

    const messages = (res.data.messages ?? []).map((m) => {
      const { text, html } = extractBodies(m.payload);
      return {
        id: m.id,
        labelIds: m.labelIds ?? [],
        from: headerValue(m.payload?.headers, 'From'),
        to: headerValue(m.payload?.headers, 'To'),
        cc: headerValue(m.payload?.headers, 'Cc'),
        subject: headerValue(m.payload?.headers, 'Subject'),
        date: headerValue(m.payload?.headers, 'Date'),
        messageIdHeader: headerValue(m.payload?.headers, 'Message-ID'),
        bodyText: text,
        bodyHtml: html,
      };
    });

    return { threadId, messages };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// gmailSendEmail — send now, optionally threaded as a reply
// ─────────────────────────────────────────────────────────────────────────────
const gmailSendEmail = onCall(
  { cors: true, timeoutSeconds: 45, memory: '256MiB', secrets: CRM_GMAIL_SECRETS },
  async (request) => {
    const { to, cc, subject, bodyHtml, bodyText, attachments, threadId, inReplyTo, references } = request.data ?? {};
    if (!to?.trim()) throw new HttpsError('invalid-argument', 'to is required.');

    const gmail = await getGmailClient();
    const raw = buildRawMessage({
      to, cc, subject, bodyHtml, bodyText,
      attachments: attachments ?? [],
      threadHeaders: { inReplyTo, references },
    });

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw, threadId: threadId || undefined },
    });

    return { success: true, messageId: res.data.id, threadId: res.data.threadId };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// gmailSaveDraft — general-purpose draft (cc/attachments/threadId)
// ─────────────────────────────────────────────────────────────────────────────
const gmailSaveDraft = onCall(
  { cors: true, timeoutSeconds: 45, memory: '256MiB', secrets: CRM_GMAIL_SECRETS },
  async (request) => {
    const { to, cc, subject, bodyHtml, bodyText, attachments, threadId } = request.data ?? {};

    const gmail = await getGmailClient();
    const raw = buildRawMessage({ to: to ?? '', cc, subject, bodyHtml, bodyText, attachments: attachments ?? [] });

    const res = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw, threadId: threadId || undefined } },
    });

    return { success: true, draftId: res.data.id };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// gmailListLabels
// ─────────────────────────────────────────────────────────────────────────────
const gmailListLabels = onCall(
  { cors: true, timeoutSeconds: 15, memory: '256MiB', secrets: CRM_GMAIL_SECRETS },
  async () => {
    const gmail = await getGmailClient();
    const res = await gmail.users.labels.list({ userId: 'me' });
    return { labels: res.data.labels ?? [] };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// getGmailSentStats — live counts for the two Gmail-backed dashboard tiles
// ─────────────────────────────────────────────────────────────────────────────
const getGmailSentStats = onCall(
  { cors: true, timeoutSeconds: 20, memory: '256MiB', secrets: CRM_GMAIL_SECRETS },
  async () => {
    const gmail = await getGmailClient();

    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0);

    const epoch = (d) => Math.floor(d.getTime() / 1000);

    const [todayRes, weekRes] = await Promise.all([
      gmail.users.messages.list({ userId: 'me', q: `in:sent after:${epoch(startOfToday)}`, maxResults: 500 }),
      gmail.users.messages.list({ userId: 'me', q: `in:sent after:${epoch(startOfWeek)}`, maxResults: 500 }),
    ]);

    return {
      sentToday: todayRes.data.messages?.length ?? todayRes.data.resultSizeEstimate ?? 0,
      sentThisWeek: weekRes.data.messages?.length ?? weekRes.data.resultSizeEstimate ?? 0,
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Reply detection — checks crmLeads with a linked gmailThreadId
// ─────────────────────────────────────────────────────────────────────────────
const TERMINAL_STATUSES = new Set(['Replied', 'Won', 'Lost', 'Archive']);

async function runReplySync() {
  const db = getFirestore();
  const gmail = await getGmailClient();
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const selfEmail = (profile.data.emailAddress ?? '').toLowerCase();

  const snap = await db.collection('crmLeads')
    .where('gmailThreadId', '!=', null)
    .limit(100)
    .get();

  let updated = 0;

  for (const doc of snap.docs) {
    const lead = doc.data();
    if (TERMINAL_STATUSES.has(lead.status)) continue;
    if (!lead.gmailThreadId) continue;

    try {
      const threadRes = await gmail.users.threads.get({ userId: 'me', id: lead.gmailThreadId, format: 'metadata', metadataHeaders: ['From', 'Date'] });
      const messages = threadRes.data.messages ?? [];
      if (!messages.length) continue;

      const last = messages[messages.length - 1];
      const from = (headerValue(last.payload?.headers, 'From') ?? '').toLowerCase();
      const isInbound = from && !from.includes(selfEmail);
      const isUnreadInInbox = (last.labelIds ?? []).includes('INBOX');

      if (isInbound && isUnreadInInbox) {
        await doc.ref.update({ status: 'Replied', updatedAt: FieldValue.serverTimestamp() });
        await doc.ref.collection('notes').add({
          text: 'Reply detected in Gmail.',
          createdAt: FieldValue.serverTimestamp(),
        });
        updated += 1;
      }
    } catch (err) {
      console.warn(`[syncGmailReplies] lead ${doc.id} thread check failed:`, err.message);
    }
  }

  return { checked: snap.size, updated };
}

const checkRepliesNow = onCall(
  { cors: true, timeoutSeconds: 120, memory: '256MiB', secrets: CRM_GMAIL_SECRETS },
  async () => runReplySync()
);

const syncGmailReplies = onSchedule(
  { schedule: 'every 15 minutes', timeoutSeconds: 300, memory: '256MiB', secrets: CRM_GMAIL_SECRETS },
  async () => { await runReplySync(); }
);

// ─────────────────────────────────────────────────────────────────────────────
// sendScheduledEmails — dispatches due rows from the scheduledEmails collection
// ─────────────────────────────────────────────────────────────────────────────
const sendScheduledEmails = onSchedule(
  { schedule: 'every 5 minutes', timeoutSeconds: 300, memory: '256MiB', secrets: CRM_GMAIL_SECRETS },
  async () => {
    const db = getFirestore();
    const now = new Date();

    const snap = await db.collection('scheduledEmails')
      .where('sent', '==', false)
      .where('sendAt', '<=', now)
      .limit(25)
      .get();

    if (snap.empty) return;

    const gmail = await getGmailClient();

    for (const doc of snap.docs) {
      const item = doc.data();
      try {
        const raw = buildRawMessage({
          to: item.to, cc: item.cc, subject: item.subject,
          bodyHtml: item.bodyHtml, bodyText: item.bodyText,
          attachments: item.attachments ?? [],
        });
        const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });

        await doc.ref.update({ sent: true, sentAt: FieldValue.serverTimestamp(), messageId: res.data.id, threadId: res.data.threadId });

        if (item.leadId) {
          await db.collection('crmLeads').doc(item.leadId).update({
            gmailThreadId: res.data.threadId,
            lastContactDate: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }).catch(() => {});
        }
      } catch (err) {
        console.error(`[sendScheduledEmails] failed for ${doc.id}:`, err.message);
        await doc.ref.update({ error: err.message }).catch(() => {});
      }
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// scheduledAutoFollowUp — sends the "Follow Up" email itself to any lead
// whose followUpDate is due, then advances the ladder exactly like a manual
// send does. Off by default (gated on autoFollowUpConfig/settings.enabled)
// since this contacts real businesses with no human review — a lead that's
// already replied is always excluded regardless of the setting, so a reply
// never gets a canned "just following up" email on top of it.
// ─────────────────────────────────────────────────────────────────────────────
const MY_NAME = 'Dean Burt';
const MY_WEBSITE = 'https://www.dean-da-dev.co.uk';
const MY_PORTFOLIO = 'https://www.dean-da-dev.co.uk/portfolio';
const MY_EMAIL = 'dean@dean-da-dev.co.uk';
const FOLLOW_UP_LADDER_DAYS = [7, 7, 14];
const FOLLOW_UP_EXCLUDED_STATUSES = new Set(['Won', 'Lost', 'Archive', 'Replied']);

const FOLLOW_UP_SUBJECT = 'Following up — {{business}}';
const FOLLOW_UP_BODY = `Hi {{contact}},

I hope you're doing well.

I just wanted to follow up on my previous email in case you hadn't had a chance to read it.

When I visited your website, I noticed a few areas where I believe it could be improved. Whether that was an outdated design, mobile usability issues, slow loading, or another issue, I'd be happy to discuss it further if it's something you're already considering.

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`;

function renderFollowUpTemplate(lead) {
  const vars = {
    business: lead.businessName ?? '',
    contact: lead.contactName?.trim() ?? '',
    portfolio_line: `\n\nYou can view my portfolio and live demos here:\n\nPortfolio: ${MY_PORTFOLIO}`,
    signature: `Kind regards,\n\n${MY_NAME}\ndean-da-dev\n📧 ${MY_EMAIL}\n🌐 ${MY_WEBSITE}`,
  };
  const fill = (text) => text
    .replace(/\{\{(\w+)\}\}/g, (m, key) => (typeof vars[key] === 'string' && vars[key].trim() ? vars[key] : ''))
    .replace(/ +,/g, ',').replace(/[ \t]{2,}/g, ' ');
  return { subject: fill(FOLLOW_UP_SUBJECT), body: fill(FOLLOW_UP_BODY) };
}

function nextFollowUpPatch(lead, sentDate) {
  const stage = (lead.followUpStage ?? -1) + 1;
  const days = FOLLOW_UP_LADDER_DAYS[stage];
  if (days == null) return { status: 'Archive', followUpStage: stage, followUpDate: null, lastContactDate: sentDate };
  const nextDate = new Date(sentDate);
  nextDate.setDate(nextDate.getDate() + days);
  return { status: 'Follow Up Scheduled', followUpStage: stage, followUpDate: nextDate, lastContactDate: sentDate };
}

const scheduledAutoFollowUp = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'Europe/London', timeoutSeconds: 300, memory: '256MiB', secrets: CRM_GMAIL_SECRETS },
  async () => {
    const db = getFirestore();

    const configSnap = await db.collection('autoFollowUpConfig').doc('settings').get();
    if (!configSnap.exists || !configSnap.data()?.enabled) return;

    const now = new Date();
    const snap = await db.collection('crmLeads')
      .where('followUpDate', '<=', now)
      .limit(30)
      .get();

    const due = snap.docs.filter((d) => {
      const lead = d.data();
      return lead.email?.trim() && !FOLLOW_UP_EXCLUDED_STATUSES.has(lead.status);
    });
    if (!due.length) return;

    const gmail = await getGmailClient();

    for (const doc of due) {
      const lead = doc.data();
      try {
        const { subject, body } = renderFollowUpTemplate(lead);
        const bodyHtml = body.replace(/\n/g, '<br>');
        // Threading relies on the `threadId` param on the send call below,
        // not RFC In-Reply-To/References headers — those need the previous
        // message's actual Message-ID, which isn't stored on the lead (only
        // the Gmail thread ID is), and Gmail's own UI threads correctly off
        // threadId alone.
        const raw = buildRawMessage({ to: lead.email, subject, bodyHtml, bodyText: body });
        const sentDate = new Date();
        const res = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw, threadId: lead.gmailThreadId || undefined },
        });

        await doc.ref.update({
          gmailThreadId: res.data.threadId,
          ...nextFollowUpPatch(lead, sentDate),
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`[scheduledAutoFollowUp] sent to "${lead.businessName}" (${lead.email}).`);
      } catch (err) {
        console.error(`[scheduledAutoFollowUp] failed for "${lead.businessName}":`, err.message);
      }
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// scheduledAutoAuditEmail — writes a personalized outreach email (via the
// same "senior conversion-focused web strategist" AI prompt used by the
// manual "Generate with AI" button in the composer) for any new lead whose
// website was auto-audited and came back with issues, and saves it as a
// Gmail DRAFT rather than sending it. Dean still has to open the draft and
// hit send himself — this only automates the writing, never the sending,
// so a bad or off-tone AI output never reaches a real business unreviewed.
// Off by default (gated on autoAuditEmailConfig/settings.enabled).
// ─────────────────────────────────────────────────────────────────────────────
const AUDIT_EMAIL_AI_SECRETS = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY'];

// A lead is only a candidate if it's still fresh (never contacted, still
// 'New'), has somewhere to send to, hasn't already had a draft written for
// it, and the audit actually found something worth writing about — a clean
// audit with no issues has nothing to pitch.
function isAuditEmailCandidate(lead) {
  return lead.email?.trim()
    && lead.status === 'New'
    && !lead.lastContactDate
    && !lead.auditEmailDrafted
    && Array.isArray(lead.issuesChecklist)
    && lead.issuesChecklist.length > 0;
}

async function runAutoAuditEmail() {
  const db = getFirestore();
  const snap = await db.collection('crmLeads').where('status', '==', 'New').limit(50).get();
  const due = snap.docs.filter((d) => isAuditEmailCandidate(d.data()));
  if (!due.length) return { drafted: 0, candidates: 0 };

  const keys = {
    gemini: process.env.GEMINI_API_KEY,
    groq: process.env.GROQ_API_KEY,
    mistral: process.env.MISTRAL_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
  };

  const gmail = await getGmailClient();
  let drafted = 0;
  for (const doc of due) {
    const lead = doc.data();
    try {
      const body = await generateAuditEmail(lead, MY_NAME, keys);
      if (!body) { console.warn(`[autoAuditEmail] AI generation failed for "${lead.businessName}" — every provider unavailable.`); continue; }

      const subject = `A quick audit of ${lead.businessName ?? 'your'} website`;
      const greeting = lead.contactName?.trim() ? `Hi ${lead.contactName.trim()},` : 'Hi,';
      const signOff = `Kind regards,\n\n${MY_NAME}\ndean-da-dev\n📧 ${MY_EMAIL}\n🌐 ${MY_WEBSITE}`;
      const fullBody = `${greeting}\n\n${body}\n\n${signOff}`;
      const bodyHtml = fullBody.replace(/\n/g, '<br>');
      const raw = buildRawMessage({ to: lead.email, subject, bodyHtml, bodyText: fullBody });

      await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } });

      // Only marks the draft as written — status/lastContactDate/follow-up
      // ladder are untouched, since nothing has actually been sent yet.
      // Those only advance once Dean opens the draft in Gmail and sends it.
      await doc.ref.update({ auditEmailDrafted: true, updatedAt: FieldValue.serverTimestamp() });
      drafted++;
      console.log(`[autoAuditEmail] drafted for "${lead.businessName}" (${lead.email}).`);
    } catch (err) {
      console.error(`[autoAuditEmail] failed for "${lead.businessName}":`, err.message);
    }
  }
  return { drafted, candidates: due.length };
}

const scheduledAutoAuditEmail = onSchedule(
  { schedule: '15 9 * * *', timeZone: 'Europe/London', timeoutSeconds: 300, memory: '256MiB', secrets: [...CRM_GMAIL_SECRETS, ...AUDIT_EMAIL_AI_SECRETS] },
  async () => {
    const db = getFirestore();
    const configSnap = await db.collection('autoAuditEmailConfig').doc('settings').get();
    if (!configSnap.exists || !configSnap.data()?.enabled) return;
    await runAutoAuditEmail();
  }
);

// Manual "Draft Now" trigger for the Settings toggle — runs the exact same
// logic, ignoring the enabled flag, so Dean can verify it before turning
// the daily schedule on.
const sendAuditEmailsNow = onCall(
  { cors: true, timeoutSeconds: 300, memory: '256MiB', secrets: [...CRM_GMAIL_SECRETS, ...AUDIT_EMAIL_AI_SECRETS] },
  async () => runAutoAuditEmail()
);

module.exports = {
  gmailListMessages,
  gmailGetThread,
  gmailSendEmail,
  gmailSaveDraft,
  gmailListLabels,
  getGmailSentStats,
  checkRepliesNow,
  syncGmailReplies,
  sendScheduledEmails,
  scheduledAutoFollowUp,
  scheduledAutoAuditEmail,
  sendAuditEmailsNow,
};
