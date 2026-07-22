import { useState } from 'react';
import Modal from './Modal';
import { parseCsv, csvRowToLead } from '../utils/codingLeadsCsvImport';

export default function CodingLeadsCsvImport({ locationKeywords, onImport, onClose }) {
  const [rawText, setRawText] = useState('');
  const [leads, setLeads] = useState(null); // parsed + scored, null until a file/paste is processed
  const [skipped, setSkipped] = useState(0);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  function process(text) {
    setRawText(text);
    setError(null);
    if (!text.trim()) { setLeads(null); setSkipped(0); return; }
    try {
      const rows = parseCsv(text);
      const mapped = rows.map((r) => csvRowToLead(r, locationKeywords));
      setLeads(mapped.filter(Boolean));
      setSkipped(mapped.filter((l) => !l).length);
    } catch {
      setError('Could not parse that as CSV — check it has a header row and try again.');
      setLeads(null);
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => process(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!leads?.length) return;
    setImporting(true);
    try {
      await onImport(leads);
      onClose();
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal title="Import Leads from CSV" subtitle="Paste a CSV, or upload a file exported from a spreadsheet or another CRM." onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="csv-file" className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            Upload a .csv file
          </label>
          <input
            id="csv-file" type="file" accept=".csv,text/csv"
            onChange={handleFile}
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-gray-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gray-200 hover:file:bg-gray-600"
          />
        </div>

        <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest text-gray-600">
          <div className="h-px flex-1 bg-gray-800" /> or paste <div className="h-px flex-1 bg-gray-800" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="csv-paste" className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            Paste CSV text
          </label>
          <textarea
            id="csv-paste" rows={6}
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-xs font-mono text-gray-100 placeholder-gray-600 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={'title,source,location,budget,snippet\n"Need a website for my gym",Referral,London,£800,"Looking for someone to build..."'}
            value={rawText}
            onChange={(e) => process(e.target.value)}
          />
          <p className="text-[11px] text-gray-600">
            Recognised columns: title, source, url, location, budget, snippet/description, leadType, contactLink/email. Only "title" is required — anything else gets auto-scored the same way manually-added leads are.
          </p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {leads !== null && !error && (
          <div className="rounded-lg border border-gray-800 bg-gray-800/30 p-3">
            <p className="text-sm text-gray-300">
              {leads.length} lead{leads.length === 1 ? '' : 's'} ready to import
              {skipped > 0 && <span className="text-gray-500"> ({skipped} row{skipped === 1 ? '' : 's'} skipped — no title)</span>}
            </p>
            {leads.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-gray-500">
                {leads.slice(0, 8).map((l, i) => (
                  <li key={i} className="truncate">
                    <span className="text-gray-300">{l.title}</span> — {l.leadType}, score {l.intentScore}
                  </li>
                ))}
                {leads.length > 8 && <li>… and {leads.length - 8} more</li>}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-400 transition hover:text-gray-200">
            Cancel
          </button>
          <button type="button" onClick={handleImport} disabled={importing || !leads?.length}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40">
            {importing ? 'Importing…' : `Import ${leads?.length ?? 0} Lead${leads?.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
