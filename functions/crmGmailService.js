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
const { generateGrowthAuditOutreach } = require('./growthAuditOutreachWriter');
const { classifyReply } = require('./aiReplyClassifier');
const { requireOwner } = require('./authGuard');
const { withErrorAlert } = require('./errorAlert');
const { notifyOwner } = require('./pushNotifications');
const { incrementCommsStat } = require('./aiCommsAssistant');

// Mirrors slugify() in src/utils/crmConstants.js — same deterministic-ID
// purpose (one doc per issue name in issueAnalytics), duplicated rather than
// shared since the frontend util isn't reachable from this CommonJS backend.
function slugifyIssue(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const REPLY_AI_KEYS = () => ({
  gemini: process.env.GEMINI_API_KEY,
  groq: process.env.GROQ_API_KEY,
  mistral: process.env.MISTRAL_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY,
  cerebras: process.env.CEREBRAS_API_KEY,
  cloudflare: process.env.CLOUDFLARE_AI_KEY,
  huggingface: process.env.HUGGINGFACE_API_KEY,
});

const CRM_GMAIL_SECRETS = [...new Set([...OAUTH_SECRETS, 'GMAIL_REFRESH_TOKEN'])];

// Ground-truth way to tell "Dean sent this himself" apart from "an
// automation sent this" for the sent-count dashboard tile — a Firestore
// counter could drift out of sync with what's actually in Gmail (a failed
// write after a successful send, etc.), whereas a label applied to the real
// sent message can't. Hidden from the label sidebar (labelHide) since it's
// internal bookkeeping, not something Dean needs cluttering his inbox UI —
// still fully searchable via `label:Auto-Sent`. Cached in module scope since
// Cloud Functions containers are reused across warm-start invocations.
const AUTO_SENT_LABEL_NAME = 'Auto-Sent';
let autoSentLabelIdCache = null;

async function getAutoSentLabelId(gmail) {
  if (autoSentLabelIdCache) return autoSentLabelIdCache;
  const { data } = await gmail.users.labels.list({ userId: 'me' });
  const existing = data.labels?.find((l) => l.name === AUTO_SENT_LABEL_NAME);
  if (existing) { autoSentLabelIdCache = existing.id; return existing.id; }
  const { data: created } = await gmail.users.labels.create({
    userId: 'me',
    requestBody: { name: AUTO_SENT_LABEL_NAME, labelListVisibility: 'labelHide', messageListVisibility: 'show' },
  });
  autoSentLabelIdCache = created.id;
  return created.id;
}

// Best-effort — a labeling failure shouldn't undo or fail the send itself,
// it would just mean this one message doesn't count toward "auto" on the
// dashboard tile.
async function labelAsAutoSent(gmail, messageId) {
  try {
    const labelId = await getAutoSentLabelId(gmail);
    await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { addLabelIds: [labelId] } });
  } catch (err) {
    console.warn('[labelAsAutoSent] failed:', err.response?.data?.error?.message ?? err.message);
  }
}

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
    requireOwner(request);
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
    requireOwner(request);
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
    requireOwner(request);
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
    requireOwner(request);
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
  async (request) => {
    requireOwner(request);
    const gmail = await getGmailClient();
    const res = await gmail.users.labels.list({ userId: 'me' });
    return { labels: res.data.labels ?? [] };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// getGmailSentStats — live counts for the two Gmail-backed dashboard tiles
// ─────────────────────────────────────────────────────────────────────────────
// Cloud Functions run in UTC — plain `date.setHours(0,0,0,0)` gives UTC
// midnight, not UK midnight, silently shifting the "today" boundary by an
// hour during BST (and would be wrong outright for any deploy region not
// defaulting to UTC). Confirmed this app is UK-only elsewhere (booking page
// timezone, follow-up schedule), so "today" should mean the UK calendar day.
function startOfUkDay(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).map((p) => [p.type, p.value])
  );
  const utcMidnightGuess = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0));
  // If UK is on BST (UTC+1), midnight UTC reads as 01:00 in London — that
  // hour value IS the offset to subtract to land on true UK midnight.
  const ukHourAtGuess = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' }).format(utcMidnightGuess));
  return new Date(utcMidnightGuess.getTime() - ukHourAtGuess * 3_600_000);
}

const getGmailSentStats = onCall(
  { cors: true, timeoutSeconds: 20, memory: '256MiB', secrets: CRM_GMAIL_SECRETS },
  async (request) => {
    requireOwner(request);
    const gmail = await getGmailClient();

    const now = new Date();
    const startOfToday = startOfUkDay(now);
    const startOfWeek = startOfUkDay(new Date(now.getTime() - now.getUTCDay() * 86_400_000));

    const epoch = (d) => Math.floor(d.getTime() / 1000);
    const countOf = (res) => res.data.messages?.length ?? res.data.resultSizeEstimate ?? 0;

    // Auto-Sent (see labelAsAutoSent) is only ever applied to emails a human
    // never reviewed — automated follow-ups. Everything else (manual sends,
    // and Composer "send later" schedules, which Dean wrote and reviewed
    // himself before scheduling) counts as manual by not carrying that label.
    const [todayTotal, todayAuto, weekTotal, weekAuto] = await Promise.all([
      gmail.users.messages.list({ userId: 'me', q: `in:sent after:${epoch(startOfToday)}`, maxResults: 500 }),
      gmail.users.messages.list({ userId: 'me', q: `in:sent after:${epoch(startOfToday)} label:${AUTO_SENT_LABEL_NAME}`, maxResults: 500 }),
      gmail.users.messages.list({ userId: 'me', q: `in:sent after:${epoch(startOfWeek)}`, maxResults: 500 }),
      gmail.users.messages.list({ userId: 'me', q: `in:sent after:${epoch(startOfWeek)} label:${AUTO_SENT_LABEL_NAME}`, maxResults: 500 }),
    ]);

    const sentTodayTotal = countOf(todayTotal);
    const sentTodayAuto = countOf(todayAuto);
    const sentThisWeekTotal = countOf(weekTotal);
    const sentThisWeekAuto = countOf(weekAuto);

    return {
      sentToday: sentTodayTotal,
      sentTodayManual: Math.max(0, sentTodayTotal - sentTodayAuto),
      sentTodayAuto,
      sentThisWeek: sentThisWeekTotal,
      sentThisWeekManual: Math.max(0, sentThisWeekTotal - sentThisWeekAuto),
      sentThisWeekAuto,
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
      const labelIds = last.labelIds ?? [];
      const isInInbox = labelIds.includes('INBOX');
      const isInSpam  = labelIds.includes('SPAM');

      // A genuine lead reply landing in Spam is worse than one sitting
      // unread in the Inbox — it's invisible unless someone thinks to check
      // Spam manually. Since we already know this thread belongs to a real
      // lead we emailed first, false-positive risk is low, so it's moved
      // out automatically (removeLabelIds/addLabelIds is Gmail's own "Not
      // spam" action) rather than just flagging it and leaving it buried.
      let movedFromSpam = false;
      if (isInbound && isInSpam) {
        try {
          await gmail.users.messages.modify({ userId: 'me', id: last.id, requestBody: { removeLabelIds: ['SPAM'], addLabelIds: ['INBOX'] } });
          movedFromSpam = true;
        } catch (err) {
          console.warn(`[syncGmailReplies] failed to un-spam message for lead ${doc.id}:`, err.message);
        }
      }

      if (isInbound && (isInInbox || movedFromSpam)) {
        // Classifies the reply's sentiment so it shows up triaged in the
        // Inbox instead of Dean having to read every reply cold to find the
        // ones actually worth answering first. Best-effort — a classifier
        // failure shouldn't block marking the lead as replied.
        const classification = await classifyReply(last.snippet, lead.businessName, REPLY_AI_KEYS()).catch(() => null);

        await doc.ref.update({
          status: 'Replied',
          replyClassification: classification,
          updatedAt: FieldValue.serverTimestamp(),
        });
        const spamNote = movedFromSpam ? ' This reply had landed in Spam — moved to Inbox automatically.' : '';
        await doc.ref.collection('notes').add({
          text: (classification ? `Reply detected in Gmail — looks ${classification}.` : 'Reply detected in Gmail.') + spamNote,
          createdAt: FieldValue.serverTimestamp(),
        });

        if (movedFromSpam) {
          await notifyOwner('Reply rescued from Spam', `${lead.businessName || 'A lead'}'s reply was in Spam — moved to Inbox.`, '/outreach-crm')
            .catch(() => {}); // never fail reply sync over a push-notification hiccup
        }

        // Template performance tracking — a reply on a lead whose last send
        // used a known template counts as that template earning a reply,
        // so the Template Library can show a real reply rate per template.
        if (lead.lastTemplateId) {
          await db.collection('crmTemplates').doc(lead.lastTemplateId)
            .update({ repliedCount: FieldValue.increment(1) })
            .catch((err) => console.warn(`[syncGmailReplies] template repliedCount update failed:`, err.message));
        }

        // Per-issue reply tracking — the send-time half of this is written
        // client-side (recordIssuesSent in issueAnalytics.js) right after a
        // successful send; this is the reply-time half, so the dashboard can
        // show which *kind* of finding actually gets replies, not just which
        // template. interestedCount is a subset of repliedCount, not added
        // to it separately.
        for (const issue of lead.issuesChecklist ?? []) {
          const slug = slugifyIssue(issue);
          const update = { issue, repliedCount: FieldValue.increment(1) };
          if (classification === 'Interested') update.interestedCount = FieldValue.increment(1);
          await db.collection('issueAnalytics').doc(slug).set(update, { merge: true })
            .catch((err) => console.warn(`[syncGmailReplies] issueAnalytics update failed for "${issue}":`, err.message));
        }

        // Attributes this reply back to whichever tone/purpose the last
        // AI-drafted-and-approved email actually used (stamped on the lead
        // by markApprovalSent in aiCommsAssistant.js) — the only way to
        // answer "does Professional tone actually get more replies than
        // Casual" with real data instead of a guess.
        if (lead.lastCommsTone || lead.lastCommsPurpose) {
          await Promise.all([
            incrementCommsStat(db, 'tone', lead.lastCommsTone, 'repliedCount'),
            incrementCommsStat(db, 'purpose', lead.lastCommsPurpose, 'repliedCount'),
          ]);
        }

        updated += 1;
      }
    } catch (err) {
      console.warn(`[syncGmailReplies] lead ${doc.id} thread check failed:`, err.message);
    }
  }

  return { checked: snap.size, updated };
}

const REPLY_SYNC_SECRETS = [...CRM_GMAIL_SECRETS, 'GEMINI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY', 'CEREBRAS_API_KEY', 'CLOUDFLARE_AI_KEY', 'HUGGINGFACE_API_KEY'];

const checkRepliesNow = onCall(
  { cors: true, timeoutSeconds: 120, memory: '256MiB', secrets: REPLY_SYNC_SECRETS },
  async (request) => { requireOwner(request); return runReplySync(); }
);

const syncGmailReplies = onSchedule(
  { schedule: 'every 15 minutes', timeoutSeconds: 300, memory: '256MiB', secrets: REPLY_SYNC_SECRETS },
  withErrorAlert('syncGmailReplies', async () => { await runReplySync(); })
);

// ─────────────────────────────────────────────────────────────────────────────
// sendScheduledEmails — dispatches due rows from the scheduledEmails collection
// ─────────────────────────────────────────────────────────────────────────────
const sendScheduledEmails = onSchedule(
  { schedule: 'every 5 minutes', timeoutSeconds: 300, memory: '256MiB', secrets: CRM_GMAIL_SECRETS },
  withErrorAlert('sendScheduledEmails', async () => {
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
          const leadRef = db.collection('crmLeads').doc(item.leadId);
          const leadSnap = await leadRef.get();
          const sentDate = new Date();
          await leadRef.update({
            gmailThreadId: res.data.threadId,
            ...(leadSnap.exists ? nextFollowUpPatch(leadSnap.data(), sentDate) : { lastContactDate: sentDate }),
            updatedAt: FieldValue.serverTimestamp(),
            ...(item.templateId ? { lastTemplateId: item.templateId } : {}),
          }).catch(() => {});
        }
        if (item.templateId) {
          await db.collection('crmTemplates').doc(item.templateId).update({ sentCount: FieldValue.increment(1) }).catch(() => {});
        }
      } catch (err) {
        console.error(`[sendScheduledEmails] failed for ${doc.id}:`, err.message);
        await doc.ref.update({ error: err.message }).catch(() => {});
      }
    }
  })
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
const MY_WEBSITE = 'https://bookrightly.co.uk';
const MY_EMAIL = 'info@bookrightly.co.uk';
const FOLLOW_UP_LADDER_DAYS = [7, 7, 14];
const FOLLOW_UP_EXCLUDED_STATUSES = new Set(['Won', 'Lost', 'Archive', 'Replied']);

const FOLLOW_UP_SUBJECT = 'Following up — {{business}}';
const FOLLOW_UP_BODY = `Hi {{contact}},

I hope you're doing well.

I just wanted to follow up on my previous email in case you hadn't had a chance to read it.

Bookrightly gives small businesses their own professional website and online booking system in one place — so customers can find out about you, view your services, and book online (and pay a deposit) without everything having to go through calls or messages.

I'd be happy to show you what it could look like for your business, no obligation.

Thank you for your time, and I hope to hear from you.

{{signature}}`;

function renderFollowUpTemplate(lead) {
  const vars = {
    business: lead.businessName ?? '',
    contact: lead.contactName?.trim() ?? '',
    signature: `Thanks,\n\n${MY_NAME}\nFounder, Bookrightly\n📧 ${MY_EMAIL}\n🌐 ${MY_WEBSITE}`,
  };
  const fill = (text) => text
    .replace(/\{\{(\w+)\}\}/g, (m, key) => (typeof vars[key] === 'string' && vars[key].trim() ? vars[key] : ''))
    .replace(/ +,/g, ',').replace(/[ \t]{2,}/g, ' ');
  return { subject: fill(FOLLOW_UP_SUBJECT), body: fill(FOLLOW_UP_BODY) };
}

function nextFollowUpPatch(lead, sentDate) {
  if (FOLLOW_UP_EXCLUDED_STATUSES.has(lead.status) || lead.category === 'Backlink') {
    return { lastContactDate: sentDate };
  }
  const stage = (lead.followUpStage ?? -1) + 1;
  const days = FOLLOW_UP_LADDER_DAYS[stage];
  if (days == null) return { status: 'Archive', followUpStage: stage, followUpDate: null, lastContactDate: sentDate };
  const nextDate = new Date(sentDate);
  nextDate.setDate(nextDate.getDate() + days);
  return { status: 'Follow Up Scheduled', followUpStage: stage, followUpDate: nextDate, lastContactDate: sentDate };
}

// Extracted so both the daily schedule and the manual "Send Now" test
// trigger run identically — previously this only ever ran on a schedule
// with no way to check on demand whether it was actually working, and
// several of the early-return paths (nothing due, none past the excluded
// statuses) logged nothing at all, so a quiet day looked identical to a
// broken one in the logs. skipEnabledCheck lets the manual trigger verify
// behavior regardless of the Settings toggle, matching how
// sendAuditEmailsNow already treats autoAuditEmailConfig.
async function runAutoFollowUp({ skipEnabledCheck = false } = {}) {
  const db = getFirestore();

  if (!skipEnabledCheck) {
    const configSnap = await db.collection('autoFollowUpConfig').doc('settings').get();
    if (!configSnap.exists || !configSnap.data()?.enabled) {
      console.log('[autoFollowUp] skipped: disabled in Settings.');
      return { ran: false, reason: 'disabled' };
    }
  }

  const now = new Date();
  const snap = await db.collection('crmLeads')
    .where('followUpDate', '<=', now)
    .limit(30)
    .get();
  console.log(`[autoFollowUp] query matched ${snap.size} lead(s) with followUpDate <= now.`);

  // Backlink prospects (category: 'Backlink') are a one-shot "submit and
  // wait" ask (a tool mention/guest post pitch), not an ongoing sales
  // conversation — they were never meant to get pulled into the same
  // multi-touch follow-up ladder as a real lead, but nothing here actually
  // excluded them from the query.
  const due = snap.docs.filter((d) => {
    const lead = d.data();
    return lead.email?.trim() && !FOLLOW_UP_EXCLUDED_STATUSES.has(lead.status) && lead.category !== 'Backlink';
  });
  console.log(`[autoFollowUp] ${due.length}/${snap.size} have an email, aren't Won/Lost/Archive/Replied, and aren't a Backlink prospect.`);
  if (!due.length) return { ran: true, sent: 0, matched: snap.size };

  const gmail = await getGmailClient();
  let sent = 0;

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
      await labelAsAutoSent(gmail, res.data.id);

      await doc.ref.update({
        gmailThreadId: res.data.threadId,
        ...nextFollowUpPatch(lead, sentDate),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[autoFollowUp] sent to "${lead.businessName}" (${lead.email}).`);
      sent++;
    } catch (err) {
      console.error(`[autoFollowUp] failed for "${lead.businessName}":`, err.response?.data?.error?.message ?? err.message);
    }
  }
  return { ran: true, sent, matched: snap.size, candidates: due.length };
}

const scheduledAutoFollowUp = onSchedule(
  { schedule: '35 9 * * 2-4', timeZone: 'Europe/London', timeoutSeconds: 300, memory: '256MiB', secrets: CRM_GMAIL_SECRETS },
  withErrorAlert('scheduledAutoFollowUp', () => runAutoFollowUp())
);

// Manual "Send Now" trigger for the Settings toggle — runs the exact same
// logic, ignoring the enabled flag, so it can actually be tested on demand
// instead of only ever finding out it's broken (or that there's nothing due)
// by waiting for the next 9am run.
const sendAutoFollowUpNow = onCall(
  { cors: true, timeoutSeconds: 120, memory: '256MiB', secrets: CRM_GMAIL_SECRETS },
  async (request) => { requireOwner(request); return runAutoFollowUp({ skipEnabledCheck: true }); }
);

// ─────────────────────────────────────────────────────────────────────────────
// scheduledAutoAuditEmail — writes a personalized outreach email (via the
// same outreach generator used by the manual "Generate with AI" button in
// the composer — see growthAuditOutreachWriter.js) for any new lead that's
// already had a lightweight outreach website check run against it, and
// saves it as a Gmail DRAFT rather than sending it. Dean still has to open
// the draft and hit send himself — this only automates the writing, never
// the sending, so a bad or off-tone AI output never reaches a real business
// unreviewed.
//
// Deliberately does NOT trigger a fresh website check itself (see
// outreachWebsiteAudit.js) — it only drafts for leads someone has already
// run "Run Outreach Website Check" against manually. A lead with no stored
// findings yet is simply skipped until that's done. Off by default (gated
// on autoAuditEmailConfig/settings.enabled).
// ─────────────────────────────────────────────────────────────────────────────
const AUDIT_EMAIL_AI_SECRETS = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY', 'CEREBRAS_API_KEY', 'HUGGINGFACE_API_KEY'];

// A lead is only a candidate if it's still fresh (never contacted, still
// 'New'), has somewhere to send to, hasn't already had a draft written for
// it, and already has a real Growth Audit on file with enough genuine
// findings to build outreach around.
function isAuditEmailCandidate(lead) {
  return lead.email?.trim()
    && lead.status === 'New'
    && !lead.lastContactDate
    && !lead.auditEmailDrafted
    && Array.isArray(lead.growthAuditFindings)
    && lead.growthAuditHasEnoughFindings === true;
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
    cerebras: process.env.CEREBRAS_API_KEY,
    huggingface: process.env.HUGGINGFACE_API_KEY,
  };

  const gmail = await getGmailClient();
  let drafted = 0;
  for (const doc of due) {
    const lead = doc.data();
    try {
      const result = await generateGrowthAuditOutreach({
        businessName: lead.businessName,
        contactName: lead.contactName,
        industry: lead.industry,
        channel: 'email',
        myName: MY_NAME,
        findings: lead.growthAuditFindings,
        mode: 'initial',
        website: lead.website,
        leadId: doc.id,
        leadCollection: 'crmLeads',
      }, keys);
      if (!result) { console.warn(`[autoAuditEmail] AI generation failed for "${lead.businessName}" — every provider unavailable.`); continue; }

      // result.body already comes back as a complete message (greeting +
      // sign-off included, per growthAuditOutreachWriter.js's email prompt)
      // so it's used as-is, unlike the old aiEmailWriter.js output which was
      // body-only and needed wrapping.
      const bodyHtml = result.body.replace(/\n/g, '<br>');
      const raw = buildRawMessage({ to: lead.email, subject: result.subject, bodyHtml, bodyText: result.body });

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

// Deployed in europe-west1, not the default us-central1 — that region's
// Cloud Run CPU quota is saturated for this project (see the same fix
// applied to generateGrowthAuditOutreachNow etc. in index.js). This is a
// cron with no client caller, so no frontend region change is needed.
const scheduledAutoAuditEmail = onSchedule(
  { region: 'europe-west1', schedule: '15 9 * * *', timeZone: 'Europe/London', timeoutSeconds: 300, memory: '256MiB', secrets: [...CRM_GMAIL_SECRETS, ...AUDIT_EMAIL_AI_SECRETS] },
  withErrorAlert('scheduledAutoAuditEmail', async () => {
    const db = getFirestore();
    const configSnap = await db.collection('autoAuditEmailConfig').doc('settings').get();
    if (!configSnap.exists || !configSnap.data()?.enabled) return;
    await runAutoAuditEmail();
  })
);

// Manual "Draft Now" trigger for the Settings toggle — runs the exact same
// logic, ignoring the enabled flag, so Dean can verify it before turning
// the daily schedule on.
const sendAuditEmailsNow = onCall(
  { cors: true, timeoutSeconds: 300, memory: '256MiB', secrets: [...CRM_GMAIL_SECRETS, ...AUDIT_EMAIL_AI_SECRETS] },
  async (request) => { requireOwner(request); return runAutoAuditEmail(); }
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
  sendAutoFollowUpNow,
  scheduledAutoAuditEmail,
  sendAuditEmailsNow,
};
