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
  const [crmSnap, codingSnap, issueAnalyticsSnap, templatesSnap] = await Promise.all([
    db.collection('crmLeads').get(),
    db.collection('codingLeads').get(),
    db.collection('issueAnalytics').get(),
    db.collection('crmTemplates').get(),
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

  return {
    leadsGenerated30d, codingLeadsGenerated30d,
    totalCrmLeads: crmLeads.length,
    conversionRate, revenue, openPipelineValue,
    wonCount: won.length, lostCount: lost.length,
    bestSources, staleWonClients,
    issueAnalytics, templatePerformance,
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
    const recommendations = await generateRecommendations(stats, aiKeysFromEnv());
    const result = { ...stats, recommendations, computedAt: FieldValue.serverTimestamp() };
    await db.collection('businessInsightsCache').doc('latest').set(result);
    return result;
  }
);

module.exports = { getBusinessInsights };
