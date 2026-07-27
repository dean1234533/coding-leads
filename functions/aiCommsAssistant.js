'use strict';

const axios = require('axios');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { requireOwner } = require('./authGuard');

const TONES = ['Professional', 'Friendly', 'Premium', 'Casual', 'Local'];

const PURPOSES = ['reply', 'follow_up', 'quote_response', 'reactivation', 'review_request', 'sales_reply', 'general'];

const CHANNELS = ['email', 'whatsapp', 'sms', 'instagram', 'facebook'];

// The same prompt structure was producing email-length, email-formality
// drafts regardless of what channel they were actually going to — an SMS
// draft could come back as long as a quote-response email. Each channel
// gets its own concrete constraints instead of leaving length/formality to
// chance.
const CHANNEL_GUIDANCE = {
  email: 'This is an EMAIL. Include a real subject line. A few short paragraphs is fine for a proper reply/quote, but a first-contact or follow-up should still be brief — nobody reads a wall of text from a stranger.',
  whatsapp: 'This is a WHATSAPP message, not an email. No subject line. Write it as ONE short message (2-4 sentences max) — no paragraph breaks, no formal sign-off ("Kind regards" etc.), just the first name and the website at the end. Reads like a text from a person, not a mail merge.',
  sms: 'This is an SMS. No subject line, no formal sign-off. ONE short sentence or two, under 300 characters total, and the website URL still has to fit in that count — SMS has no formatting and gets worse to read the longer it is, so keep everything else tight to make room for it.',
  instagram: 'This is an INSTAGRAM DM. No subject line. Casual and short (2-4 sentences), a "Hey" or "Hi" opener is fine, one emoji is fine if the tone allows it (never more than one), no formal sign-off — just the first name and the website at the end.',
  facebook: 'This is a FACEBOOK MESSENGER DM, not an email. No subject line. Short (2-4 sentences), casual "Hi" opener, no formal sign-off — just the first name and the website at the end.',
};

const TONE_GUIDANCE = {
  Professional: 'Formal, precise, no slang. Reads like a competent contractor who takes the work seriously.',
  Friendly: 'Warm and conversational, like emailing someone you already get on with. Contractions are fine.',
  Premium: 'Confident and polished, like a boutique agency that doesn\'t need to oversell. Understated, not showy.',
  Casual: 'Relaxed and brief, closer to a text message than a formal letter. Short sentences.',
  Local: 'Down-to-earth, community-minded tone — references being UK-based/local where natural, avoids sounding corporate.',
};

// Static profile rather than a Firestore-configurable one — this is a
// single-business app (Dean's own CRM), not a multi-tenant product, so
// there's no "which business is this for" lookup needed.
const BUSINESS_PROFILE = {
  name: 'Dean',
  business: 'dean-da-dev',
  website: 'dean-da-dev.co.uk',
  services: 'Website design & development, app/MVP development, booking systems, ecommerce, website redesigns, SEO fixes, and website audits',
};

function buildPrompt({ purpose, tone, channel, customerName, customerMessage, businessContext, previousConversation, extraContext }) {
  return `You are writing an outgoing message as ${BUSINESS_PROFILE.name}, a real person — not a company, not an "on behalf of". ${BUSINESS_PROFILE.name} runs ${BUSINESS_PROFILE.business} (${BUSINESS_PROFILE.website}) and personally does this work: ${BUSINESS_PROFILE.services}.

CHANNEL: ${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.email}

MESSAGE PURPOSE: ${purpose}
TONE: ${tone} — ${TONE_GUIDANCE[tone] ?? ''}

RECIPIENT / BUSINESS NAME: ${customerName || 'unknown — use a generic greeting'}
WHAT WE KNOW ABOUT THIS SPECIFIC BUSINESS: ${businessContext || 'nothing beyond the name — see the rule below on what to do when this is empty'}
CUSTOMER'S MESSAGE / SITUATION (if any): ${customerMessage || '(none provided)'}
PREVIOUS CONVERSATION (most recent last): ${previousConversation || '(none — this is the first contact)'}
${extraContext ? `ADDITIONAL CONTEXT: ${extraContext}` : ''}

TWO THINGS THIS MESSAGE MUST ANSWER, IN PLAIN WORDS, EARLY ON — NOT IMPLIED, STATED:
1. WHO IS THIS: "I'm ${BUSINESS_PROFILE.name}, I build websites/apps for local businesses" (or similar, in your own words) — not just the company name dropped in passing. A stranger reading this has no idea who's emailing them or why until you say so plainly.
2. WHAT'S THE OFFER: a concrete, specific thing you're proposing — e.g. "I'd like to take a quick look and send over a couple of ideas, free, no obligation" or "I can fix that for you" — never a vague abstraction like "enhance your online presence" or "create a more comprehensive experience". If you can't name something concrete because you don't know enough about them yet, the concrete offer IS "let me take a proper look and send you something specific" — that's still concrete, unlike padding the message with vague praise instead.

GREETING: Start with "Hi" (or "Hi [name]" if you have one) — never "Dear [Business Name]," which reads like a corporate form letter, not a person.

IF "WHAT WE KNOW ABOUT THIS SPECIFIC BUSINESS" IS EMPTY: don't invent specifics, but also don't pad the gap with vague corporate language ("potential for enhancement", "engagement elements", "comprehensive online experience") to sound more substantial than it is. Write a SHORTER, plainer message instead — acknowledge you're reaching out cold, say who you are, and make the concrete offer (see above). Short and honest beats long and vague.

BANNED — do not use any of these, they're the exact phrases that make a message read as AI-written rather than human: "I hope this email finds you well", "In today's digital age", "I've reviewed/noticed the potential for enhancement", "essential ... elements", "comprehensive and engaging [experience/solution]", "assist in creating", "leverage", "synergy", corporate transition words ("Furthermore", "Additionally", "Moreover"), exclamation marks, and generic compliments that could apply to any business ("great work you're doing", "impressive business", "striking design").

EXAMPLE OF THE STANDARD TO HIT (cold outreach, business context = a tattoo studio chain with three locations and an online style-browsing feature on their site):
"Hi Urban Ink team,

I am Dean, an independent web developer who builds websites and booking systems for local businesses.

I came across your website and was impressed by how you've showcased your artists across your Southend, Brentwood and Romford studios, as well as how easy it is for clients to browse different tattoo styles. While looking through the site, I noticed a few opportunities to make the booking journey even smoother and help convert more visitors into enquiries.

I'd like to put together a free homepage redesign and booking flow concept for Urban Ink, with no obligation. The aim is simply to show how a few design and usability improvements could help increase enquiries and make the booking experience even better.

If you're open to seeing a few ideas, let me know and I'll send them over for you to review.

Regards,
Dean
${BUSINESS_PROFILE.website}"
Notice what makes this work: it names real specifics pulled from the business (three named locations, the style-browsing feature) instead of generic praise, states who Dean is and the offer in the first two lines, closes with a low-pressure ask, and ends with the website on its own line under the name. Match this level of specificity and structure — but only using the actual details given for THIS lead, never inventing details like these.

OTHER RULES
- ALWAYS include "${BUSINESS_PROFILE.website}" somewhere in the message — on its own line directly under the sign-off name is the default place for it, unless the channel guidance above says otherwise (e.g. a channel with a fixed profile link where repeating the URL in-body would be redundant). Every message needs it; never send one without it.
- Sign off with just the first name, no "Best regards" corporate closings unless the tone is Professional.
- Reference something REAL and SPECIFIC from "WHAT WE KNOW ABOUT THIS SPECIFIC BUSINESS" when it's not empty (industry, website, a known issue) — never generic filler that could be sent to any business unchanged.
- No hard sales pressure, no fake urgency, no made-up claims (reviews, guarantees, timelines you weren't told).
- Keep it as short as the purpose allows — a follow-up should be shorter than a quote response, and a cold-first-contact with no known details should be shorter still.
- This will be reviewed by ${BUSINESS_PROFILE.name} before sending, so it's fine to be direct rather than hedge everything.

Respond with ONLY a JSON object in exactly this shape, no other text:
{"subject": "...", "body": "..."}
(subject can be an empty string if this isn't an email)`;
}

function parseModelJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.body !== 'string' || !parsed.body.trim()) return null;
  return { subject: typeof parsed.subject === 'string' ? parsed.subject : '', body: parsed.body };
}

async function generateWithGemini(prompt, apiKey) {
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } },
    { timeout: 20_000 }
  );
  return parseModelJson(data.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function generateWithOpenAiCompatible(prompt, apiKey, { baseUrl, model }) {
  const { data } = await axios.post(
    `${baseUrl}/chat/completions`,
    { model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } },
    { timeout: 20_000, headers: { Authorization: `Bearer ${apiKey}` } }
  );
  return parseModelJson(data.choices?.[0]?.message?.content);
}

/**
 * Generates one tone-selected outgoing message (email/WhatsApp/SMS copy —
 * channel-agnostic, the caller decides where it goes). Same free-tier
 * provider fallback chain used throughout this app.
 */
async function generateMessage(input, keys) {
  const prompt = buildPrompt(input);
  // Ordered by actual writing quality for this specific task (persuasive,
  // natural-sounding outreach copy), not just "whichever's listed first
  // elsewhere in the app" — Cerebras' gpt-oss-120b is the largest, most
  // capable model in this whole free-tier lineup and has a genuine
  // daily-resetting free quota (1M tokens/day, confirmed live against
  // Cerebras' current docs, not a one-time trial credit), so it leads here
  // specifically. Groq's 70B model is the next-strongest, same daily-reset
  // guarantee. Gemini drops down the list — still a fine fallback, just not
  // the best available for natural-sounding copy, and its free tier is far
  // stingier (seen hitting quota limits fast in production).
  const providers = [
    { key: keys?.cerebras, run: () => generateWithOpenAiCompatible(prompt, keys.cerebras, { baseUrl: 'https://api.cerebras.ai/v1', model: 'gpt-oss-120b' }) },
    { key: keys?.groq, run: () => generateWithOpenAiCompatible(prompt, keys.groq, { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' }) },
    { key: keys?.gemini, run: () => generateWithGemini(prompt, keys.gemini) },
    { key: keys?.mistral, run: () => generateWithOpenAiCompatible(prompt, keys.mistral, { baseUrl: 'https://api.mistral.ai/v1', model: 'pixtral-12b-2409' }) },
    { key: keys?.openrouter, run: () => generateWithOpenAiCompatible(prompt, keys.openrouter, { baseUrl: 'https://openrouter.ai/api/v1', model: 'nvidia/nemotron-nano-12b-v2-vl:free' }) },
    { key: keys?.huggingface, run: () => generateWithOpenAiCompatible(prompt, keys.huggingface, { baseUrl: 'https://router.huggingface.co/v1', model: 'meta-llama/Llama-3.1-8B-Instruct' }) },
  ];
  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const result = await provider.run();
      if (result) return result;
    } catch (err) {
      console.warn(`[aiCommsAssistant] provider failed: ${err.response?.data?.error?.message ?? err.message}`);
    }
  }
  return null;
}

function aiKeysFromEnv() {
  return {
    gemini: process.env.GEMINI_API_KEY,
    groq: process.env.GROQ_API_KEY,
    mistral: process.env.MISTRAL_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    cerebras: process.env.CEREBRAS_API_KEY,
    huggingface: process.env.HUGGINGFACE_API_KEY,
  };
}

const COMMS_SECRETS = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY', 'CEREBRAS_API_KEY', 'HUGGINGFACE_API_KEY'];

// Pulls the last few notes for a crmLeads doc as cheap "previous conversation"
// context — the notes subcollection already exists (crmGmailService.js), no
// new data model needed for this.
async function previousConversationFor(db, leadCollection, leadId) {
  if (leadCollection !== 'crmLeads') return '';
  const notesSnap = await db.collection('crmLeads').doc(leadId).collection('notes')
    .orderBy('createdAt', 'desc').limit(5).get();
  return notesSnap.docs.map((d) => d.data().text).filter(Boolean).reverse().join('\n---\n');
}

// The single biggest cause of generic-sounding drafts: the AI was only ever
// told a business's NAME, nothing else about it — it had no website,
// industry, or audit findings to actually reference, so "personalizing"
// was never possible regardless of how good the prompt wording was. Builds
// a real, concrete context block from whatever's actually on the lead doc.
function describeLead(leadData, leadCollection) {
  if (!leadData) return '';
  if (leadCollection === 'codingLeads') {
    const parts = [];
    if (leadData.leadType) parts.push(`Type of work they need: ${leadData.leadType}`);
    if (leadData.location) parts.push(`Location: ${leadData.location}`);
    if (leadData.budget) parts.push(`Budget mentioned: ${leadData.budget}`);
    if (leadData.source) parts.push(`Found via: ${leadData.source}`);
    if (leadData.snippet) parts.push(`What they posted: ${leadData.snippet}`);
    return parts.join('\n');
  }
  const parts = [];
  if (leadData.website) parts.push(`Website: ${leadData.website}`);
  if (leadData.industry) parts.push(`Industry: ${leadData.industry}`);
  if (leadData.source) parts.push(`Found via: ${leadData.source}`);
  if (Array.isArray(leadData.issuesChecklist) && leadData.issuesChecklist.length > 0) {
    parts.push(`Known website issues from an audit: ${leadData.issuesChecklist.join(', ')}`);
  }
  if (leadData.aiDesignNote) parts.push(`Specific observation from reviewing their site: ${leadData.aiDesignNote}`);
  return parts.join('\n');
}

/**
 * generateCommsMessage — on-demand or workflow-triggered draft. Always lands
 * in the pendingApprovals queue with status "pending" — nothing this
 * function does can send anything, by design (see approveApproval below).
 */
const generateCommsMessage = onCall(
  { cors: true, timeoutSeconds: 30, memory: '256MiB', secrets: COMMS_SECRETS },
  async (request) => {
    requireOwner(request);
    const { leadId, leadCollection, leadName, channel, purpose, tone, customerMessage, source } = request.data ?? {};
    if (!leadId || !leadCollection) throw new HttpsError('invalid-argument', 'leadId and leadCollection are required.');
    if (!TONES.includes(tone)) throw new HttpsError('invalid-argument', `tone must be one of ${TONES.join(', ')}.`);
    if (!PURPOSES.includes(purpose)) throw new HttpsError('invalid-argument', `purpose must be one of ${PURPOSES.join(', ')}.`);
    const resolvedChannel = CHANNELS.includes(channel) ? channel : 'email';

    const db = getFirestore();
    const [previousConversation, leadSnap] = await Promise.all([
      previousConversationFor(db, leadCollection, leadId),
      db.collection(leadCollection).doc(leadId).get(),
    ]);
    const leadData = leadSnap.exists ? leadSnap.data() : null;
    const resolvedName = leadName || leadData?.businessName || leadData?.title || '';
    const businessContext = describeLead(leadData, leadCollection);

    const result = await generateMessage({
      purpose, tone, channel: resolvedChannel, customerName: resolvedName, customerMessage, businessContext, previousConversation,
    }, aiKeysFromEnv());
    if (!result) throw new HttpsError('unavailable', 'Every AI provider failed — try again shortly.');

    const docRef = await db.collection('pendingApprovals').add({
      leadId, leadCollection, leadName: resolvedName || null,
      channel: resolvedChannel, purpose, tone,
      subject: result.subject, body: result.body,
      status: 'pending',
      source: source === 'workflow' ? 'workflow' : 'manual',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { id: docRef.id, subject: result.subject, body: result.body };
  }
);

/**
 * approveApproval — marks a draft approved with whatever final text the
 * owner edited it to (edits are common — the AI draft is a starting point,
 * not a final message). Does NOT send anything; email sending happens via
 * the existing gmailSendEmail call from the client straight after this, and
 * WhatsApp/SMS have no server-side send path at all (see markApprovalSent).
 */
const approveApproval = onCall(
  { cors: true, timeoutSeconds: 15, memory: '256MiB' },
  async (request) => {
    requireOwner(request);
    const { approvalId, body, subject, channel } = request.data ?? {};
    if (!approvalId) throw new HttpsError('invalid-argument', 'approvalId is required.');
    const db = getFirestore();
    const patch = { status: 'approved', updatedAt: FieldValue.serverTimestamp() };
    if (typeof body === 'string' && body.trim()) patch.body = body;
    if (typeof subject === 'string') patch.subject = subject;
    // Lets a draft generated for one channel actually get sent via another —
    // e.g. drafted as email but this lead's easier to reach on WhatsApp.
    if (CHANNELS.includes(channel)) patch.channel = channel;
    await db.collection('pendingApprovals').doc(approvalId).update(patch);
    return { success: true };
  }
);

const rejectApproval = onCall(
  { cors: true, timeoutSeconds: 15, memory: '256MiB' },
  async (request) => {
    requireOwner(request);
    const { approvalId, reason } = request.data ?? {};
    if (!approvalId) throw new HttpsError('invalid-argument', 'approvalId is required.');
    const db = getFirestore();
    await db.collection('pendingApprovals').doc(approvalId).update({
      status: 'rejected', rejectReason: reason ?? null, updatedAt: FieldValue.serverTimestamp(),
    });
    return { success: true };
  }
);

// One doc per dimension value (e.g. "tone:Professional", "channel:email") —
// deliberately not a full tone×purpose×channel combo matrix, which would
// need real volume per cell to mean anything. Three separate single-
// dimension breakdowns answer "which tone/purpose/channel converts best"
// without needing months of data to fill a combo matrix.
async function incrementCommsStat(db, dimension, value, field) {
  if (!value) return;
  await db.collection('commsStats').doc(`${dimension}:${value}`).set({
    dimension, value, [field]: FieldValue.increment(1),
  }, { merge: true }).catch((err) => console.warn(`[incrementCommsStat] failed for ${dimension}:${value}:`, err.message));
}

// Called by the client immediately after either gmailSendEmail succeeds
// (email channel) or the wa.me/sms:/m.me/clipboard handoff happens (other
// channels, where there's no way to confirm the tap through to actually
// sending — this just records that the approved draft was handed off).
const markApprovalSent = onCall(
  { cors: true, timeoutSeconds: 15, memory: '256MiB' },
  async (request) => {
    requireOwner(request);
    const { approvalId } = request.data ?? {};
    if (!approvalId) throw new HttpsError('invalid-argument', 'approvalId is required.');
    const db = getFirestore();
    const ref = db.collection('pendingApprovals').doc(approvalId);
    const snap = await ref.get();
    const approval = snap.exists ? snap.data() : null;

    await ref.update({
      status: 'sent', sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });

    if (approval) {
      await Promise.all([
        incrementCommsStat(db, 'tone', approval.tone, 'sentCount'),
        incrementCommsStat(db, 'purpose', approval.purpose, 'sentCount'),
        incrementCommsStat(db, 'channel', approval.channel, 'sentCount'),
      ]);

      // Only email replies are ever detectable (see runReplySync in
      // crmGmailService.js — it reads Gmail directly; WhatsApp/SMS/
      // Instagram/Facebook have no API this app reads for replies at all),
      // so only stamp the lead when there's a real chance of later
      // attributing a reply back to this specific tone/purpose.
      if (approval.channel === 'email' && approval.leadCollection === 'crmLeads' && approval.leadId) {
        await db.collection('crmLeads').doc(approval.leadId).update({
          lastCommsTone: approval.tone ?? null,
          lastCommsPurpose: approval.purpose ?? null,
          lastCommsSentAt: FieldValue.serverTimestamp(),
        }).catch(() => {});
      }
    }

    return { success: true };
  }
);

module.exports = {
  TONES, PURPOSES, CHANNELS, COMMS_SECRETS,
  generateMessage, aiKeysFromEnv, previousConversationFor, describeLead, incrementCommsStat,
  generateCommsMessage, approveApproval, rejectApproval, markApprovalSent,
};
