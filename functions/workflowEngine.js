'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { requireOwner } = require('./authGuard');
const { withErrorAlert } = require('./errorAlert');
const { notifyOwner } = require('./pushNotifications');

const TRIGGER_TYPES = ['NEW_CRM_LEAD', 'NEW_CODING_LEAD', 'LEAD_WON', 'LEAD_INACTIVE_DAYS'];
// DRAFT_MESSAGE used to write AI-drafted messages to a pendingApprovals
// queue reviewed from an Approvals tab. That tab is gone (outreach is now
// self-serve via the Growth Audit tool, not an approve-then-send queue), so
// the only automated action left is a notification — draft on demand from a
// lead's Growth Audit Outreach tab instead.
const ACTION_TYPES = ['NOTIFY_OWNER'];

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
    name: 'New CRM Lead → Notify',
    enabled: true,
    trigger: { type: 'NEW_CRM_LEAD', config: {} },
    actions: [
      { type: 'NOTIFY_OWNER', config: { title: 'New lead: {{name}}', body: 'Open the lead to run a Growth Audit and generate outreach.' } },
    ],
  },
  {
    name: 'Deal Won → Notify',
    enabled: true,
    trigger: { type: 'LEAD_WON', config: {} },
    actions: [
      { type: 'NOTIFY_OWNER', config: { title: '{{name}} marked Won', body: 'Consider following up for a review or referral.' } },
    ],
  },
  {
    name: 'Lead Inactive 60 Days → Notify',
    enabled: true,
    trigger: { type: 'LEAD_INACTIVE_DAYS', config: { days: 60 } },
    actions: [
      { type: 'NOTIFY_OWNER', config: { title: '{{name}} has gone quiet', body: 'No contact in 60+ days — worth a reactivation follow-up.' } },
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

const CONDITION_OPERATORS = ['equals', 'not_equals', 'greater_than', 'less_than', 'contains'];

// Optional extra filter beyond the trigger itself — e.g. "only if
// industry equals Salon" or "only if intentScore greater_than 70". A
// workflow with no conditions (the common case, and every DEFAULT_WORKFLOWS
// entry) always passes. Field values come from buildFieldsContext below.
function evaluateCondition(condition, fields) {
  const actual = fields[condition.field];
  switch (condition.operator) {
    case 'equals': return actual === condition.value;
    case 'not_equals': return actual !== condition.value;
    case 'greater_than': return typeof actual === 'number' && actual > Number(condition.value);
    case 'less_than': return typeof actual === 'number' && actual < Number(condition.value);
    case 'contains': return typeof actual === 'string' && actual.includes(String(condition.value));
    default: return false;
  }
}

// A flat, condition-evaluable view of whatever's actually on the lead doc —
// deliberately permissive (undefined fields just make that condition false
// rather than throwing) since not every lead has every field set.
function buildFieldsContext(data, leadCollection) {
  if (leadCollection === 'codingLeads') {
    return {
      status: data.status ?? null, source: data.source ?? null, leadType: data.leadType ?? null,
      intentScore: typeof data.intentScore === 'number' ? data.intentScore : null,
      location: data.location ?? null, budget: data.budget ?? null,
    };
  }
  return {
    status: data.status ?? null, source: data.source ?? null, industry: data.industry ?? null,
    priority: data.priority ?? null, leadScore: typeof data.leadScore === 'number' ? data.leadScore : null,
    estimatedProjectValue: typeof data.estimatedProjectValue === 'number' ? data.estimatedProjectValue : null,
  };
}

async function runAction(action, { leadCollection, leadName }) {
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

async function runWorkflows(db) {
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
      const fields = buildFieldsContext(data, leadCollection);

      for (const workflow of matching) {
        const conditionsPass = (workflow.conditions ?? []).every((c) => evaluateCondition(c, fields));
        if (!conditionsPass) continue;

        for (const action of workflow.actions ?? []) {
          // One action throwing (an AI provider erroring unexpectedly, a
          // malformed action config, etc.) used to propagate all the way up
          // through withErrorAlert's outer catch, aborting the whole batch
          // mid-loop — every lead after the failing one silently never got
          // processed, with no record of what happened. Isolated per-action
          // so the rest of the batch keeps going and the failure is visible
          // in the run's own result instead of only in an error-alert email.
          let result;
          try {
            result = await runAction(action, { leadCollection, leadName });
          } catch (err) {
            result = { type: action.type, ok: false, reason: err.message };
            console.error(`[workflowEngine] action failed for "${leadName}" (${workflow.name}):`, err.message);
          }
          actionResults.push({ workflow: workflow.name, lead: leadName, ...result });
        }
      }
      await docSnap.ref.update({ [`workflowsRun.${flagKey}`]: true });
      leadsProcessed++;
    }
  }

  return { leadsProcessed, actionsRun: actionResults.length, actionResults };
}

// Deployed in europe-west1, not the default us-central1 — see the
// setGlobalOptions note in index.js. Clients calling runWorkflowsNow/
// saveWorkflow must use getFunctions(app, 'europe-west1').
const scheduledWorkflowEngine = onSchedule(
  { region: 'europe-west1', schedule: 'every 15 minutes', timeoutSeconds: 300, memory: '256MiB', secrets: ['APP_URL'] },
  withErrorAlert('scheduledWorkflowEngine', async () => { await runWorkflows(getFirestore()); })
);

const runWorkflowsNow = onCall(
  { region: 'europe-west1', cors: true, timeoutSeconds: 300, memory: '256MiB', secrets: ['APP_URL'] },
  async (request) => {
    requireOwner(request);
    return runWorkflows(getFirestore());
  }
);

const saveWorkflow = onCall(
  { region: 'europe-west1', cors: true, timeoutSeconds: 15, memory: '256MiB' },
  async (request) => {
    requireOwner(request);
    const { id, name, enabled, trigger, actions, conditions } = request.data ?? {};
    if (!name?.trim()) throw new HttpsError('invalid-argument', 'name is required.');
    if (!TRIGGER_TYPES.includes(trigger?.type)) throw new HttpsError('invalid-argument', 'invalid trigger type.');
    for (const a of actions ?? []) {
      if (!ACTION_TYPES.includes(a.type)) throw new HttpsError('invalid-argument', `invalid action type: ${a.type}`);
    }
    for (const c of conditions ?? []) {
      if (!c.field || !CONDITION_OPERATORS.includes(c.operator)) throw new HttpsError('invalid-argument', `invalid condition: ${JSON.stringify(c)}`);
    }
    const db = getFirestore();
    const payload = { name, enabled: !!enabled, trigger, actions: actions ?? [], conditions: conditions ?? [], updatedAt: FieldValue.serverTimestamp() };
    if (id) {
      await db.collection('workflows').doc(id).update(payload);
      return { id };
    }
    const ref = await db.collection('workflows').add({ ...payload, createdAt: FieldValue.serverTimestamp() });
    return { id: ref.id };
  }
);

module.exports = { scheduledWorkflowEngine, runWorkflowsNow, saveWorkflow, TRIGGER_TYPES, ACTION_TYPES, CONDITION_OPERATORS, evaluateCondition };
