function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate?.() ?? new Date(timestamp);
  return date.toISOString().slice(0, 10);
}

const COLUMNS = [
  ['title',    (l) => l.title],
  ['source',   (l) => l.source],
  ['url',      (l) => l.url],
  ['leadType', (l) => l.leadType],
  ['score',    (l) => l.intentScore],
  ['location', (l) => l.location],
  ['budget',   (l) => l.budget],
  ['status',   (l) => l.status],
  ['notes',    (l) => l.notes],
  ['dateFound', (l) => formatDate(l.createdAt)],
];

export function exportLeadsToCsv(leads, filename = 'coding-leads.csv') {
  const header = COLUMNS.map(([key]) => key).join(',');
  const rows = leads.map((lead) => COLUMNS.map(([, get]) => csvEscape(get(lead))).join(','));
  const csv = [header, ...rows].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
