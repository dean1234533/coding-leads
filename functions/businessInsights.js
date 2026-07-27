'use strict';

const axios = require('axios');
const { onCall } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { requireOwner } = require('./authGuard');
const { aiKeysFromEnv, COMMS_SECRETS } = require('./aiCommsAssistant');

const TERMINAL_STATUSES = ['Won', 'Lost', 'Archive'];
const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // recomputing walks every crmLeads/codingLeads doc plus an AI call — not something to redo on every dashboard load

function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000);
}

async function computeStats(db) {
  const [crmSnap, codingSnap, issueAnalyticsSnap, templatesSnap, commsStatsSnap] = await Promise.all([
    db.collection('crmLeads').get(),
    db.collection('codingLeads').get(),
    db.collection('issueAnalytics').get(),
    db.collection('crmTemplates').get(),
    db.collection('commsStats').get(),
  ]);

  const crmLeads = crmSnap.docs.map((d) => d.data());
  const codingLeads = codingSnap.docs.map((d) => d.data());
  const cutoff30 = daysAgo(30);

  const leadsGenerated30d = crmLeads.filter((l) => l.dateAdded?.toDate?.() >= cutoff30).length;
  const codingLeadsGenerated30d = codingLeads.filter((l) => l.createdAt?.toDate?.() >= cutoff30).length;

  const won = crmLeads.filter((l) => l.status === 'Won');
  const lost = crmLeads.filter((l) => l.status === 'Lost');
  const conversionRate = (won.length + lost.length) > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : null;

  const revenue = won.reduce((sum, l) => sum + (Number(l.estimatedProjectValue) || 0), 0);
  const openPipelineValue = crmLeads
    .filter((l) => !TERMINAL_STATUSES.includes(l.status))
    .reduce((sum, l) => sum + (Number(l.estimatedProjectValue) || 0), 0);

  // Grouped by source — only sources with 2+ leads get a win rate (a single
  // lead "converting" is a coin flip, not a signal).
  const bySource = {};
  for (const l of crmLeads) {
    const src = l.source || 'Unknown';
    bySource[src] ??= { total: 0, won: 0, lost: 0 };
    bySource[src].total++;
    if (l.status === 'Won') bySource[src].won++;
    if (l.status === 'Lost') bySource[src].lost++;
  }
  const bestSources = Object.entries(bySource)
    .map(([source, s]) => ({
      source, total: s.total, won: s.won,
      winRate: (s.won + s.lost) >= 2 ? Math.round((s.won / (s.won + s.lost)) * 100) : null,
    }))
    .sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1));

  // "Retention" is approximated from what this CRM actually tracks (pre-sale
  // outreach + lastContactDate) — there's no repeat-purchase/job-history
  // data model (see workflowEngine.js's LEAD_WON comment), so this reports
  // "won clients not recontacted in 90+ days" as the closest honest proxy,
  // not true repeat-business tracking.
  const staleCutoff = daysAgo(90);
  const staleWonClients = won.filter((l) => {
    const last = l.lastContactDate?.toDate?.();
    return !last || last <= staleCutoff;
  }).length;

  const issueAnalytics = issueAnalyticsSnap.docs.map((d) => d.data())
    .filter((i) => (i.sentCount ?? 0) > 0)
    .map((i) => ({ issue: i.issue, sentCount: i.sentCount, repliedCount: i.repliedCount ?? 0, replyRate: Math.round(((i.repliedCount ?? 0) / i.sentCount) * 100) }))
    .sort((a, b) => b.replyRate - a.replyRate);

  const templatePerformance = templatesSnap.docs.map((d) => d.data())
    .filter((t) => (t.sentCount ?? 0) > 0)
    .map((t) => ({ name: t.name, sentCount: t.sentCount, repliedCount: t.repliedCount ?? 0, replyRate: Math.round(((t.repliedCount ?? 0) / t.sentCount) * 100) }))
    .sort((a, b) => b.replyRate - a.replyRate);

  // AI comms reply-rate breakdown (see markApprovalSent/runReplySync) —
  // channel only ever gets a sent count since only email replies are
  // detectable at all (no API reads WhatsApp/Instagram/Facebook for
  // replies), so channel rows never carry a replyRate, only volume.
  const commsStatsByDimension = { tone: [], purpose: [], channel: [] };
  for (const doc of commsStatsSnap.docs) {
    const d = doc.data();
    if (!d.dimension || !d.value || !(d.sentCount > 0)) continue;
    const row = { value: d.value, sentCount: d.sentCount, repliedCount: d.repliedCount ?? 0 };
    if (d.dimension !== 'channel') row.replyRate = Math.round(((d.repliedCount ?? 0) / d.sentCount) * 100);
    commsStatsByDimension[d.dimension]?.push(row);
  }
  commsStatsByDimension.tone.sort((a, b) => b.replyRate - a.replyRate);
  commsStatsByDimension.purpose.sort((a, b) => b.replyRate - a.replyRate);
  commsStatsByDimension.channel.sort((a, b) => b.sentCount - a.sentCount);

  return {
    leadsGenerated30d, codingLeadsGenerated30d,
    totalCrmLeads: crmLeads.length,
    conversionRate, revenue, openPipelineValue,
    wonCount: won.length, lostCount: lost.length,
    bestSources, staleWonClients,
    issueAnalytics, templatePerformance,
    commsStatsByTone: commsStatsByDimension.tone,
    commsStatsByPurpose: commsStatsByDimension.purpose,
    commsStatsByChannel: commsStatsByDimension.channel,
    appointmentStats: null, // no booking-history collection exists — confirmBooking only creates a calendar event, nothing persisted to query
  };
}

function buildRecommendationsPrompt(stats) {
  return `You are a business analyst summarizing CRM data for a solo UK web developer. Based on the stats below, write 3-5 short, specific, plain-English recommendations a busy owner could act on today. Match this style exactly:
"You have 25 customers who have not returned in 90 days."
"Your highest converting service is your premium package."
"Leads from this source convert 3x better."

Only state things the data actually supports — do not invent numbers not given below. If a stat is null/missing, don't make a recommendation about it.

STATS:
${JSON.stringify(stats, null, 2)}

Respond with ONLY a JSON array of strings, no other text. Example: ["...", "...", "..."]`;
}

function parseRecommendations(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) return null;
  return parsed.filter((s) => typeof s === 'string' && s.trim());
}

async function generateRecommendations(stats, keys) {
  const prompt = buildRecommendationsPrompt(stats);
  const providers = [
    {
      key: keys?.gemini,
      run: async () => {
        const { data } = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${keys.gemini}`,
          { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } },
          { timeout: 20_000 }
        );
        return parseRecommendations(data.candidates?.[0]?.content?.parts?.[0]?.text);
      },
    },
    {
      key: keys?.groq,
      run: async () => {
        const { data } = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          { model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } },
          { timeout: 20_000, headers: { Authorization: `Bearer ${keys.groq}` } }
        );
        // Groq's json_object mode wraps arrays in an object sometimes — accept either shape.
        const raw = data.choices?.[0]?.message?.content;
        const cleaned = String(raw ?? '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : (Array.isArray(parsed.recommendations) ? parsed.recommendations : null);
      },
    },
  ];
  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const result = await provider.run();
      if (result?.length) return result;
    } catch (err) {
      console.warn(`[businessInsights] provider failed: ${err.response?.data?.error?.message ?? err.message}`);
    }
  }
  return [];
}

function buildAdAdvicePrompt(stats) {
  return `You are a marketing advisor for a solo UK web developer (Dean, dean-da-dev.co.uk — builds websites/apps for local businesses, runs a booking-platform product called Bookrightly, has an Instagram business account @deandadev123, and has a set of free browser-based tools on his site like an image compressor, QR code generator, and website cost calculator). He wants advice on Facebook/Instagram (Meta) ads AND organic Instagram growth to find more local-business clients.

IMPORTANT CONTEXT: his audience is local BUSINESS OWNERS deciding whether to hire a developer or try a new tool — not general consumers buying a product. Timing and content advice should reflect that (e.g. business owners often browse during work hours/lunch breaks, not just evenings like consumer retail audiences).

Here's what his CRM actually shows about where his best leads/clients have come from so far:
${JSON.stringify({ bestSources: stats.bestSources, leadsGenerated30d: stats.leadsGenerated30d, conversionRate: stats.conversionRate }, null, 2)}

For the Instagram section specifically: recommend a realistic posting frequency for a solo developer (not an agency with a content team — don't recommend more than he could realistically sustain alone), and suggest content types that fit what he actually has to show (real before/after website rebuilds, short build-process clips, client results, quick tips using his own free tools, Bookrightly feature highlights) rather than generic "post reels" advice.

Respond with ONLY a JSON object in exactly this shape, no other text:
{"bestTimes": "2-3 sentences on when to run/schedule PAID ads for reaching local business owners specifically, referencing real reasoning not just generic e-commerce advice", "tips": ["3-5 short, specific, actionable tips for growing this specific business beyond just ad timing — can reference the CRM data above where relevant, e.g. doubling down on a source that's converting well"], "instagram": {"bestTimes": "2-3 sentences on when to post organically on Instagram to reach local business owners", "postFrequency": "one sentence recommending a realistic posting cadence for a solo developer", "contentIdeas": ["4-6 specific content ideas that fit what Dean actually has to show, not generic advice"]}}`;
}

function parseAdAdvice(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.bestTimes !== 'string' || !Array.isArray(parsed.tips)) return null;
  const instagram = parsed.instagram && typeof parsed.instagram === 'object'
    ? {
        bestTimes: typeof parsed.instagram.bestTimes === 'string' ? parsed.instagram.bestTimes : '',
        postFrequency: typeof parsed.instagram.postFrequency === 'string' ? parsed.instagram.postFrequency : '',
        contentIdeas: Array.isArray(parsed.instagram.contentIdeas) ? parsed.instagram.contentIdeas.filter((s) => typeof s === 'string' && s.trim()) : [],
      }
    : null;
  return {
    bestTimes: parsed.bestTimes,
    tips: parsed.tips.filter((s) => typeof s === 'string' && s.trim()),
    instagram,
  };
}

async function generateAdAdvice(stats, keys) {
  const prompt = buildAdAdvicePrompt(stats);
  const providers = [
    {
      key: keys?.gemini,
      run: async () => {
        const { data } = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${keys.gemini}`,
          { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } },
          { timeout: 20_000 }
        );
        return parseAdAdvice(data.candidates?.[0]?.content?.parts?.[0]?.text);
      },
    },
    {
      key: keys?.groq,
      run: async () => {
        const { data } = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          { model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } },
          { timeout: 20_000, headers: { Authorization: `Bearer ${keys.groq}` } }
        );
        return parseAdAdvice(data.choices?.[0]?.message?.content);
      },
    },
  ];
  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const result = await provider.run();
      if (result) return result;
    } catch (err) {
      console.warn(`[businessInsights] ad-advice provider failed: ${err.response?.data?.error?.message ?? err.message}`);
    }
  }
  return null;
}

const getBusinessInsights = onCall(
  { cors: true, timeoutSeconds: 60, memory: '256MiB', secrets: COMMS_SECRETS },
  async (request) => {
    requireOwner(request);
    const db = getFirestore();
    const forceRefresh = !!request.data?.forceRefresh;

    if (!forceRefresh) {
      const cached = await db.collection('businessInsightsCache').doc('latest').get();
      if (cached.exists) {
        const computedAt = cached.data().computedAt?.toDate?.();
        if (computedAt && (Date.now() - computedAt.getTime()) < CACHE_MAX_AGE_MS) {
          return cached.data();
        }
      }
    }

    const stats = await computeStats(db);
    const keys = aiKeysFromEnv();
    const [recommendations, adAdvice] = await Promise.all([
      generateRecommendations(stats, keys),
      generateAdAdvice(stats, keys),
    ]);
    const result = { ...stats, recommendations, adAdvice, computedAt: FieldValue.serverTimestamp() };
    await db.collection('businessInsightsCache').doc('latest').set(result);
    return result;
  }
);

module.exports = { getBusinessInsights };
