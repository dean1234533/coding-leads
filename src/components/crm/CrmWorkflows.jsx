import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../../firebase';

const TRIGGER_LABELS = {
  NEW_CRM_LEAD: 'WHEN a new lead is created',
  NEW_CODING_LEAD: 'WHEN a new coding lead is found',
  LEAD_WON: 'WHEN a deal is marked Won',
  LEAD_INACTIVE_DAYS: 'WHEN a lead has been inactive',
};

const ACTION_LABELS = {
  NOTIFY_OWNER: () => 'Notify you with a push notification',
};

// Matches buildFieldsContext in functions/workflowEngine.js — only fields
// actually available to evaluate against for each trigger's lead type.
const FIELDS_BY_TRIGGER = {
  NEW_CODING_LEAD: ['status', 'source', 'leadType', 'intentScore', 'location', 'budget'],
  NEW_CRM_LEAD: ['status', 'source', 'industry', 'priority', 'leadScore', 'estimatedProjectValue'],
  LEAD_WON: ['status', 'source', 'industry', 'priority', 'leadScore', 'estimatedProjectValue'],
  LEAD_INACTIVE_DAYS: ['status', 'source', 'industry', 'priority', 'leadScore', 'estimatedProjectValue'],
};

const OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'greater_than', label: 'is greater than' },
  { value: 'less_than', label: 'is less than' },
  { value: 'contains', label: 'contains' },
];

const NUMERIC_FIELDS = new Set(['intentScore', 'leadScore', 'estimatedProjectValue']);

function conditionLabel(c) {
  const op = OPERATORS.find((o) => o.value === c.operator)?.label ?? c.operator;
  return `${c.field} ${op} "${c.value}"`;
}

function AddConditionForm({ fields, onAdd }) {
  const [field, setField] = useState(fields[0] ?? '');
  const [operator, setOperator] = useState('equals');
  const [value, setValue] = useState('');

  function handleAdd() {
    if (!field || !value.trim()) return;
    const parsedValue = NUMERIC_FIELDS.has(field) && !Number.isNaN(Number(value)) ? Number(value) : value.trim();
    onAdd({ field, operator, value: parsedValue });
    setValue('');
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <select value={field} onChange={(e) => setField(e.target.value)}
        className="rounded border border-gray-700 bg-gray-800/50 px-2 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none">
        {fields.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <select value={operator} onChange={(e) => setOperator(e.target.value)}
        className="rounded border border-gray-700 bg-gray-800/50 px-2 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none">
        {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <input
        value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        placeholder="value"
        className="w-28 rounded border border-gray-700 bg-gray-800/50 px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
      />
      <button onClick={handleAdd} disabled={!value.trim()}
        className="rounded border border-gray-700 px-2 py-1 text-xs font-semibold text-gray-300 transition hover:bg-gray-800 disabled:opacity-40">
        + Add
      </button>
    </div>
  );
}

function WorkflowCard({ workflow, onSaved }) {
  const [saving, setSaving] = useState(false);

  async function save(patch) {
    setSaving(true);
    try {
      const fn = httpsCallable(getFunctions(app), 'saveWorkflow');
      await fn({
        id: workflow.id, name: workflow.name, enabled: workflow.enabled,
        trigger: workflow.trigger, actions: workflow.actions, conditions: workflow.conditions ?? [],
        ...patch,
      });
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  const toggle = () => save({ enabled: !workflow.enabled });
  const addCondition = (condition) => save({ conditions: [...(workflow.conditions ?? []), condition] });
  const removeCondition = (index) => save({ conditions: (workflow.conditions ?? []).filter((_, i) => i !== index) });

  const fields = FIELDS_BY_TRIGGER[workflow.trigger?.type] ?? [];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-100">{workflow.name}</p>
          <p className="mt-1 text-xs text-gray-500">
            {TRIGGER_LABELS[workflow.trigger?.type] ?? workflow.trigger?.type}
            {workflow.trigger?.type === 'LEAD_INACTIVE_DAYS' && ` for ${workflow.trigger?.config?.days ?? 60}+ days`}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={saving}
          className={`relative h-6 w-11 flex-shrink-0 rounded-full transition disabled:opacity-50 ${workflow.enabled ? 'bg-emerald-500' : 'bg-gray-700'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${workflow.enabled ? 'left-5' : 'left-0.5'}`} />
        </button>
      </div>

      <ul className="mt-3 space-y-1 border-t border-gray-800 pt-3 text-xs text-gray-400">
        {(workflow.actions ?? []).map((a, i) => (
          <li key={i} className="flex gap-2"><span className="text-gray-600">THEN</span> {(ACTION_LABELS[a.type] ?? (() => a.type))(a)}</li>
        ))}
      </ul>

      <div className="mt-3 border-t border-gray-800 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
          Conditions {(workflow.conditions?.length ?? 0) === 0 && <span className="normal-case text-gray-600">(none — always runs on trigger)</span>}
        </p>
        {(workflow.conditions?.length ?? 0) > 0 && (
          <ul className="mt-1.5 space-y-1">
            {workflow.conditions.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-xs text-gray-300">
                <span><span className="text-gray-600">AND</span> {conditionLabel(c)}</span>
                <button onClick={() => removeCondition(i)} disabled={saving} className="text-gray-600 hover:text-red-400 disabled:opacity-40">✕</button>
              </li>
            ))}
          </ul>
        )}
        {fields.length > 0 && <AddConditionForm fields={fields} onAdd={addCondition} />}
      </div>
    </div>
  );
}

export default function CrmWorkflows() {
  const [workflows, setWorkflows] = useState(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'workflows'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snap) => setWorkflows(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setWorkflows([]));
  }, []);

  async function handleRunNow() {
    setRunning(true);
    setError(null);
    setRunResult(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'runWorkflowsNow', { timeout: 300000 });
      const { data } = await fn();
      setRunResult(data);
    } catch (err) {
      setError(err?.message ?? 'Run failed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Workflows</h2>
          <p className="mt-1 text-xs text-gray-500">
            Runs automatically every 15 minutes and notifies you — nothing here can send a message on its own.
            Add conditions to a workflow to narrow when it fires (e.g. only when industry equals Salon).
          </p>
        </div>
        <button
          onClick={handleRunNow}
          disabled={running}
          className="rounded-lg bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-200 transition hover:bg-gray-700 disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run Now'}
        </button>
      </div>

      {runResult && (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-400">
          Processed {runResult.leadsProcessed} lead{runResult.leadsProcessed === 1 ? '' : 's'}, ran {runResult.actionsRun} action{runResult.actionsRun === 1 ? '' : 's'}.
        </p>
      )}
      {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">{error}</p>}

      {workflows === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : workflows.length === 0 ? (
        <p className="text-sm text-gray-500">No workflows yet — they're seeded automatically the first time this runs.</p>
      ) : (
        <div className="space-y-3">
          {workflows.map((w) => <WorkflowCard key={w.id} workflow={w} onSaved={() => {}} />)}
        </div>
      )}
    </div>
  );
}
