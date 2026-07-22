'use strict';

const axios = require('axios');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { requireOwner } = require('./authGuard');

const TONES = ['Professional', 'Friendly', 'Premium', 'Casual', 'Local'];

const PURPOSES = ['reply', 'follow_up', 'quote_response', 'reactivation', 'review_request', 'sales_reply', 'general'];

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

function buildPrompt({ purpose, tone, customerName, customerMessage, previousConversation, extraContext }) {
  return `You are writing an outgoing message on behalf of ${BUSINESS_PROFILE.name}, who runs ${BUSINESS_PROFILE.business} (${BUSINESS_PROFILE.website}).

BUSINESS SERVICES: ${BUSINESS_PROFILE.services}

MESSAGE PURPOSE: ${purpose}
TONE: ${tone} — ${TONE_GUIDANCE[tone] ?? ''}

CUSTOMER NAME: ${customerName || 'unknown — use a generic greeting'}
CUSTOMER'S MESSAGE / SITUATION: ${customerMessage || '(none provided)'}
PREVIOUS CONVERSATION (most recent last): ${previousConversation || '(none — this is the first contact)'}
${extraContext ? `ADDITIONAL CONTEXT: ${extraContext}` : ''}

RULES
- Write as ${BUSINESS_PROFILE.name}, first person, signing off with just the first name.
- Reference specifics from the customer's message/situation — never generic filler.
- No hard sales pressure, no fake urgency, no made-up claims (reviews, guarantees, timelines you weren't told).
- Keep it as short as the purpose allows — a follow-up should be shorter than a quote response.
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
  const providers = [
    { key: keys?.gemini, run: () => generateWithGemini(prompt, keys.gemini) },
    { key: keys?.groq, run: () => generateWithOpenAiCompatible(prompt, keys.groq, { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' }) },
    { key: keys?.mistral, run: () => generateWithOpenAiCompatible(prompt, keys.mistral, { baseUrl: 'https://api.mistral.ai/v1', model: 'pixtral-12b-2409' }) },
    { key: keys?.openrouter, run: () => generateWithOpenAiCompatible(prompt, keys.openrouter, { baseUrl: 'https://openrouter.ai/api/v1', model: 'nvidia/nemotron-nano-12b-v2-vl:free' }) },
    { key: keys?.cerebras, run: () => generateWithOpenAiCompatible(prompt, keys.cerebras, { baseUrl: 'https://api.cerebras.ai/v1', model: 'gpt-oss-120b' }) },
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

    const db = getFirestore();
    const previousConversation = await previousConversationFor(db, leadCollection, leadId);

    const result = await generateMessage({
      purpose, tone, customerName: leadName, customerMessage, previousConversation,
    }, aiKeysFromEnv());
    if (!result) throw new HttpsError('unavailable', 'Every AI provider failed — try again shortly.');

    const docRef = await db.collection('pendingApprovals').add({
      leadId, leadCollection, leadName: leadName ?? null,
      channel: channel || 'email', purpose, tone,
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
    const { approvalId, body, subject } = request.data ?? {};
    if (!approvalId) throw new HttpsError('invalid-argument', 'approvalId is required.');
    const db = getFirestore();
    const patch = { status: 'approved', updatedAt: FieldValue.serverTimestamp() };
    if (typeof body === 'string' && body.trim()) patch.body = body;
    if (typeof subject === 'string') patch.subject = subject;
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

// Called by the client immediately after either gmailSendEmail succeeds
// (email channel) or the wa.me/sms: deep link is opened (whatsapp/sms
// channels, where there's no way to confirm the tap through to actually
// sending — this just records that the approved draft was handed off).
const markApprovalSent = onCall(
  { cors: true, timeoutSeconds: 15, memory: '256MiB' },
  async (request) => {
    requireOwner(request);
    const { approvalId } = request.data ?? {};
    if (!approvalId) throw new HttpsError('invalid-argument', 'approvalId is required.');
    const db = getFirestore();
    await db.collection('pendingApprovals').doc(approvalId).update({
      status: 'sent', sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    return { success: true };
  }
);

module.exports = {
  TONES, PURPOSES, COMMS_SECRETS,
  generateMessage, aiKeysFromEnv, previousConversationFor,
  generateCommsMessage, approveApproval, rejectApproval, markApprovalSent,
};
