'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { requireOwner } = require('./authGuard');
const { withErrorAlert } = require('./errorAlert');
const { generateMessage, aiKeysFromEnv, previousConversationFor, COMMS_SECRETS } = require('./aiCommsAssistant');
const { notifyOwner } = require('./pushNotifications');

const TRIGGER_TYPES = ['NEW_CRM_LEAD', 'NEW_CODING_LEAD', 'LEAD_WON', 'LEAD_INACTIVE_DAYS'];
const ACTION_TYPES = ['DRAFT_MESSAGE', 'NOTIFY_OWNER'];

const TERMINAL_STATUSES = ['Won', 'Lost', 'Archive'];

// Adapted from the three worked examples in the spec to what this business
// actually has: no post-sale "appointment completed" concept exists (see
// research — this is a pre-sale outreach CRM + a consultation-booking
// calendar, not a job-tracking system), so "appointment completed" becomes
// "deal marked Won", and "customer inactive" maps onto crmLeads whose
// lastContactDate has gone stale. Seeded once, then left alone — editing or
// disabling happens from the Workflows tab, not by re-running this.
const DEFAULT_WORKFLOWS = [
  {
    name: 'New CRM Lead → Draft Reply + Notify',
    enabled: true,
    trigger: { type: 'NEW_CRM_LEAD', config: {} },
    actions: [
      { type: 'DRAFT_MESSAGE', config: { purpose: 'sales_reply', tone: 'Professional', channel: 'email' } },
      { type: 'NOTIFY_OWNER', config: { title: 'New lead: {{name}}', body: 'A draft reply is waiting for approval.' } },
    ],
  },
  {
    name: 'Deal Won → Request Review + Follow-Up',
    enabled: true,
    trigger: { type: 'LEAD_WON', config: {} },
    actions: [
      { type: 'DRAFT_MESSAGE', config: { purpose: 'review_request', tone: 'Friendly', channel: 'email', extraContext: 'Also warmly mention you\'re happy to help again in future or take referrals — don\'t be pushy about it.' } },
      { type: 'NOTIFY_OWNER', config: { title: '{{name}} marked Won', body: 'A review-request draft is waiting for approval.' } },
    ],
  },
  {
    name: 'Lead Inactive 60 Days → Reactivation Draft',
    enabled: true,
    trigger: { type: 'LEAD_INACTIVE_DAYS', config: { days: 60 } },
    actions: [
      { type: 'DRAFT_MESSAGE', config: { purpose: 'reactivation', tone: 'Friendly', channel: 'email' } },
    ],
  },
];

async function ensureDefaultWorkflows(db) {
  const snap = await db.collection('workflows').limit(1).get();
  if (!snap.empty) return;
  const batch = db.batch();
  for (const wf of DEFAULT_WORKFLOWS) {
    batch.set(db.collection('workflows').doc(), { ...wf, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
}

function interpolate(template, vars) {
  return String(template ?? '').replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

async function runAction(db, keys, action, { leadId, leadCollection, leadName, leadContext }) {
  if (action.type === 'DRAFT_MESSAGE') {
    const previousConversation = await previousConversationFor(db, leadCollection, leadId);
    const result = await generateMessage({
      purpose: action.config.purpose,
      tone: action.config.tone,
      customerName: leadName,
      customerMessage: leadContext,
      previousConversation,
      extraContext: action.config.extraContext,
    }, keys);
    if (!result) return { type: 'DRAFT_MESSAGE', ok: false, reason: 'all AI providers failed' };
    await db.collection('pendingApprovals').add({
      leadId, leadCollection, leadName: leadName ?? null,
      channel: action.config.channel || 'email',
      purpose: action.config.purpose, tone: action.config.tone,
      subject: result.subject, body: result.body,
      status: 'pending', source: 'workflow',
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    return { type: 'DRAFT_MESSAGE', ok: true };
  }
  if (action.type === 'NOTIFY_OWNER') {
    await notifyOwner(interpolate(action.config.title, { name: leadName ?? 'a lead' }), action.config.body ?? '', leadCollection === 'codingLeads' ? '/coding-leads' : '/outreach-crm');
    return { type: 'NOTIFY_OWNER', ok: true };
  }
  return { type: action.type, ok: false, reason: 'unknown action type' };
}

// Deliberately polling rather than Firestore triggers (onDocumentCreated) —
// this whole codebase's automation so far is onSchedule-based (see
// sendScheduledEmails, scheduledAutoFollowUp), and a flag-field check here
// avoids needing new composite indexes: every query below is a single-field
// orderBy, filtered in-memory, matching the pattern used everywhere else in
// this app rather than introducing a new architecture for one feature.
// requireUntouchedStatus guards against the "new lead" trigger firing for
// leads that only look new because they predate this feature and never got
// a workflowsRun flag — without it, the very first run treats every
// existing lead as brand new, including ones already messaged, replied to,
// or closed out. Only crmLeads has a meaningful "still at its initial
// status" signal (codingLeads has no equivalent untouched-status concept).
async function findNewLeads(db, collectionName, dateField, flagKey, { limit = 50, requireUntouchedStatus = false } = {}) {
  const snap = await db.collection(collectionName).orderBy(dateField, 'desc').limit(limit).get();
  return snap.docs.filter((d) => {
    const data = d.data();
    if (data.workflowsRun?.[flagKey]) return false;
    if (requireUntouchedStatus && data.status !== 'New') return false;
    return true;
  });
}

async function findWonLeads(db, flagKey, limit = 50) {
  const snap = await db.collection('crmLeads').orderBy('updatedAt', 'desc').limit(limit).get();
  return snap.docs.filter((d) => d.data().status === 'Won' && !d.data().workflowsRun?.[flagKey]);
}

async function findInactiveLeads(db, days, flagKey, limit = 100) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const snap = await db.collection('crmLeads').orderBy('lastContactDate', 'asc').limit(limit).get();
  return snap.docs.filter((d) => {
    const data = d.data();
    if (TERMINAL_STATUSES.includes(data.status)) return false;
    if (data.workflowsRun?.[flagKey]) return false;
    const lastContact = data.lastContactDate?.toDate?.();
    return lastContact && lastContact <= cutoff;
  });
}

async function runWorkflows(db, keys) {
  await ensureDefaultWorkflows(db);
  const workflowsSnap = await db.collection('workflows').where('enabled', '==', true).get();
  const workflows = workflowsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  let leadsProcessed = 0;
  const actionResults = [];

  for (const type of TRIGGER_TYPES) {
    const matching = workflows.filter((w) => w.trigger?.type === type);
    if (!matching.length) continue;
    const flagKey = type; // one flag per trigger type is enough — re-running a disabled/re-enabled workflow of the same trigger type on an already-processed lead isn't the goal here

    let docs = [];
    if (type === 'NEW_CRM_LEAD') docs = await findNewLeads(db, 'crmLeads', 'dateAdded', flagKey, { requireUntouchedStatus: true });
    else if (type === 'NEW_CODING_LEAD') docs = await findNewLeads(db, 'codingLeads', 'createdAt', flagKey);
    else if (type === 'LEAD_WON') docs = await findWonLeads(db, flagKey);
    else if (type === 'LEAD_INACTIVE_DAYS') docs = await findInactiveLeads(db, matching[0]?.trigger?.config?.days ?? 60, flagKey);

    for (const docSnap of docs) {
      const data = docSnap.data();
      const leadCollection = type === 'NEW_CODING_LEAD' ? 'codingLeads' : 'crmLeads';
      const leadName = data.businessName || data.title || data.contactName || '';
      const leadContext = data.notes || data.snippet || data.aiDesignNote || '';

      for (const workflow of matching) {
        for (const action of workflow.actions ?? []) {
          const result = await runAction(db, keys, action, { leadId: docSnap.id, leadCollection, leadName, leadContext });
          actionResults.push({ workflow: workflow.name, lead: leadName, ...result });
        }
      }
      await docSnap.ref.update({ [`workflowsRun.${flagKey}`]: true });
      leadsProcessed++;
    }
  }

  return { leadsProcessed, actionsRun: actionResults.length, actionResults };
}

const scheduledWorkflowEngine = onSchedule(
  { schedule: 'every 15 minutes', timeoutSeconds: 300, memory: '256MiB', secrets: [...COMMS_SECRETS, 'APP_URL'] },
  withErrorAlert('scheduledWorkflowEngine', async () => { await runWorkflows(getFirestore(), aiKeysFromEnv()); })
);

const runWorkflowsNow = onCall(
  { cors: true, timeoutSeconds: 300, memory: '256MiB', secrets: [...COMMS_SECRETS, 'APP_URL'] },
  async (request) => {
    requireOwner(request);
    return runWorkflows(getFirestore(), aiKeysFromEnv());
  }
);

const saveWorkflow = onCall(
  { cors: true, timeoutSeconds: 15, memory: '256MiB' },
  async (request) => {
    requireOwner(request);
    const { id, name, enabled, trigger, actions } = request.data ?? {};
    if (!name?.trim()) throw new HttpsError('invalid-argument', 'name is required.');
    if (!TRIGGER_TYPES.includes(trigger?.type)) throw new HttpsError('invalid-argument', 'invalid trigger type.');
    for (const a of actions ?? []) {
      if (!ACTION_TYPES.includes(a.type)) throw new HttpsError('invalid-argument', `invalid action type: ${a.type}`);
    }
    const db = getFirestore();
    const payload = { name, enabled: !!enabled, trigger, actions: actions ?? [], updatedAt: FieldValue.serverTimestamp() };
    if (id) {
      await db.collection('workflows').doc(id).update(payload);
      return { id };
    }
    const ref = await db.collection('workflows').add({ ...payload, createdAt: FieldValue.serverTimestamp() });
    return { id: ref.id };
  }
);

module.exports = { scheduledWorkflowEngine, runWorkflowsNow, saveWorkflow, TRIGGER_TYPES, ACTION_TYPES };
