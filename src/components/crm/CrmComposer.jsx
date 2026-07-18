import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, doc, increment, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../../firebase';
import { applyTemplateVars, buildTemplateVars } from '../../utils/crmConstants';

const MY_NAME = 'Dean Burt';
const SIGNATURE = `<p>Kind regards,</p><p>Dean Burt<br>dean-da-dev<br>📧 dean@dean-da-dev.co.uk<br>🌐 https://www.dean-da-dev.co.uk</p>`;

const TOOLBAR = [
  { cmd: 'bold', label: 'B', className: 'font-bold' },
  { cmd: 'italic', label: 'I', className: 'italic' },
  { cmd: 'insertUnorderedList', label: '• List' },
  { cmd: 'createLink', label: 'Link', prompt: true },
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function CrmComposer({ lead, threadId, inReplyTo, references, defaultTo = '', defaultSubject = '', onSent, onSaved }) {
  const [templates, setTemplates] = useState([]);
  const [portfolioDemos, setPortfolioDemos] = useState([]);
  const [selectedDemoId, setSelectedDemoId] = useState('');
  const [to, setTo] = useState(defaultTo || lead?.email || '');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [plainText, setPlainText] = useState('');
  const [richMode, setRichMode] = useState(true);
  const [attachments, setAttachments] = useState([]);
  const [scheduleAt, setScheduleAt] = useState('');
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const editorRef = useRef(null);

  useEffect(() => {
    const unsubT = onSnapshot(query(collection(db, 'crmTemplates'), orderBy('name')), (snap) => setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const unsubP = onSnapshot(collection(db, 'crmPortfolio'), (snap) => setPortfolioDemos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => { unsubT(); unsubP(); };
  }, []);

  const selectedDemo = portfolioDemos.find((p) => p.id === selectedDemoId);
  const vars = buildTemplateVars(lead, { demoUrl: selectedDemo?.url ?? '', myName: MY_NAME });

  function insertAtCursor(html) {
    if (richMode && editorRef.current) {
      editorRef.current.focus();
      document.execCommand('insertHTML', false, html);
    } else {
      setPlainText((t) => `${t}\n${html.replace(/<[^>]+>/g, '')}`);
    }
  }

  // Writes a personalized email from the lead's real audit findings
  // (page speed, issuesChecklist, AI design note) via the same AI providers
  // used for the design audit — always lands in the editor for review, never
  // sent automatically. Subject stays the standard audit-email subject;
  // only the body is generated.
  async function generateWithAi() {
    setGeneratingAi(true);
    setAiError(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'generateAuditEmailNow', { timeout: 30000 });
      const { data } = await fn({ lead, myName: MY_NAME });
      if (!subject.trim()) setSubject(applyTemplateVars(`A quick audit of {{business}}'s website`, vars));
      const html = data.body.replace(/\n/g, '<br>');
      if (richMode && editorRef.current) {
        editorRef.current.innerHTML = html;
      } else {
        setPlainText(data.body);
      }
    } catch (err) {
      console.error('[CrmComposer] AI generation failed:', err);
      setAiError(err?.message ?? 'AI generation failed.');
    } finally {
      setGeneratingAi(false);
    }
  }

  function applyTemplate(templateId) {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    setSelectedTemplateId(templateId);
    setSubject(applyTemplateVars(t.subject, vars));
    const body = applyTemplateVars(t.body, vars);
    if (richMode && editorRef.current) {
      editorRef.current.innerHTML = body.replace(/\n/g, '<br>');
    } else {
      setPlainText(body);
    }
  }

  // Selecting a demo both remembers it (so {{portfolio}} in any template
  // applied afterward resolves to its URL) and inserts the link immediately,
  // for when you're writing free-hand rather than starting from a template.
  function insertPortfolio(demoId) {
    setSelectedDemoId(demoId);
    const demo = portfolioDemos.find((p) => p.id === demoId);
    if (!demo?.url) return;
    insertAtCursor(`<a href="${demo.url}">${demo.name} demo: ${demo.url}</a>`);
  }

  function insertWebsite() {
    if (!lead?.website) return;
    insertAtCursor(`${lead.website}`);
  }

  function insertSignature() {
    insertAtCursor(SIGNATURE);
  }

  function exec(cmd, needsPrompt) {
    if (!richMode) return;
    editorRef.current?.focus();
    if (needsPrompt) {
      const url = window.prompt('Link URL:');
      if (!url) return;
      document.execCommand(cmd, false, url);
    } else {
      document.execCommand(cmd, false, null);
    }
  }

  async function handleAttach(e) {
    const files = Array.from(e.target.files ?? []);
    const encoded = await Promise.all(files.map(async (f) => ({
      filename: f.name,
      mimeType: f.type || 'application/octet-stream',
      dataBase64: await fileToBase64(f),
    })));
    setAttachments((a) => [...a, ...encoded]);
  }

  function getBody() {
    const bodyHtml = richMode ? (editorRef.current?.innerHTML ?? '') : undefined;
    const bodyText = richMode ? undefined : plainText;
    return { bodyHtml, bodyText };
  }

  async function handleSend() {
    if (!to.trim()) { setStatus({ type: 'error', message: 'Recipient email is required.' }); return; }
    setSending(true);
    setStatus(null);
    try {
      if (scheduleAt) {
        const { bodyHtml, bodyText } = getBody();
        await addDoc(collection(db, 'scheduledEmails'), {
          to: to.trim(), cc: cc.trim() || null, subject, bodyHtml: bodyHtml ?? null, bodyText: bodyText ?? null,
          attachments, sendAt: new Date(scheduleAt), leadId: lead?.id ?? null, templateId: selectedTemplateId || null, sent: false, createdAt: serverTimestamp(),
        });
        setStatus({ type: 'success', message: 'Email scheduled.' });
      } else {
        const fn = httpsCallable(getFunctions(app), 'gmailSendEmail');
        const { bodyHtml, bodyText } = getBody();
        const { data } = await fn({ to: to.trim(), cc: cc.trim() || undefined, subject, bodyHtml, bodyText, attachments, threadId, inReplyTo, references });
        setStatus({ type: 'success', message: 'Email sent.' });
        onSent?.(data.threadId);

        // Template performance tracking — records which template (if any)
        // was used so the Template Library can show real send/reply counts,
        // and remembers it on the lead so a later reply can be attributed
        // back to this specific template. Best-effort: a tracking failure
        // shouldn't be reported as a failed send, the email already sent.
        if (selectedTemplateId) {
          updateDoc(doc(db, 'crmTemplates', selectedTemplateId), { sentCount: increment(1) }).catch(() => {});
          if (lead?.id) updateDoc(doc(db, 'crmLeads', lead.id), { lastTemplateId: selectedTemplateId }).catch(() => {});
        }
      }
    } catch (err) {
      setStatus({ type: 'error', message: err?.message ?? 'Send failed.' });
    } finally {
      setSending(false);
    }
  }

  async function handleSaveDraft() {
    setSending(true);
    setStatus(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'gmailSaveDraft');
      const { bodyHtml, bodyText } = getBody();
      const { data } = await fn({ to: to.trim(), cc: cc.trim() || undefined, subject, bodyHtml, bodyText, attachments, threadId });
      setStatus({ type: 'success', message: 'Draft saved to Gmail.' });
      onSaved?.(data.draftId);
    } catch (err) {
      setStatus({ type: 'error', message: err?.message ?? 'Save failed.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To…" type="email"
          className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
        <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Cc (optional)"
          className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
      </div>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject"
        className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none" />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-800 bg-gray-950/60 p-1.5">
        {TOOLBAR.map(({ cmd, label, className, prompt }) => (
          <button key={cmd} type="button" onClick={() => exec(cmd, prompt)} disabled={!richMode}
            className={`rounded px-2.5 py-1 text-xs text-gray-300 transition hover:bg-gray-800 disabled:opacity-30 ${className ?? ''}`}>
            {label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-gray-800" />
        <select onChange={(e) => e.target.value && applyTemplate(e.target.value)} defaultValue=""
          className="rounded bg-gray-800/50 px-2 py-1 text-xs text-gray-300 focus:outline-none">
          <option value="">Insert template…</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={selectedDemoId} onChange={(e) => e.target.value && insertPortfolio(e.target.value)}
          className="rounded bg-gray-800/50 px-2 py-1 text-xs text-gray-300 focus:outline-none">
          <option value="">Insert demo…</option>
          {portfolioDemos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button
          type="button"
          onClick={generateWithAi}
          disabled={generatingAi}
          title="Writes a personalized email from this lead's real audit findings — review before sending"
          className="rounded bg-violet-500/15 px-2 py-1 text-xs font-semibold text-violet-300 ring-1 ring-inset ring-violet-500/30 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generatingAi ? 'Writing…' : 'Generate with AI'}
        </button>
        <button type="button" onClick={insertWebsite} className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-800">+ Website</button>
        <button type="button" onClick={insertSignature} className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-800">+ Signature</button>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setPreview((p) => !p)} className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-800">
            {preview ? 'Edit' : 'Preview'}
          </button>
          <button type="button" onClick={() => setRichMode((r) => !r)} className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-800">
            {richMode ? 'Plain text' : 'Rich text'}
          </button>
        </span>
      </div>

      {/* Body */}
      {preview ? (
        <div className="min-h-[10rem] max-w-full overflow-x-auto break-words rounded-lg border border-gray-800 bg-gray-950/60 p-4 text-sm text-gray-200 [&_img]:max-w-full [&_table]:max-w-full"
          dangerouslySetInnerHTML={{ __html: richMode ? (editorRef.current?.innerHTML ?? '') : plainText.replace(/\n/g, '<br>') }} />
      ) : richMode ? (
        <div ref={editorRef} contentEditable suppressContentEditableWarning
          className="min-h-[10rem] overflow-x-auto break-words rounded-lg border border-gray-700 bg-gray-800/50 p-4 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      ) : (
        <textarea rows={8} value={plainText} onChange={(e) => setPlainText(e.target.value)}
          className="w-full rounded-lg border border-gray-700 bg-gray-800/50 p-4 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      )}

      {/* Attachments */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-700">
          Attach files
          <input type="file" multiple onChange={handleAttach} className="hidden" />
        </label>
        {attachments.map((a, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300">
            {a.filename}
            <button onClick={() => setAttachments((arr) => arr.filter((_, idx) => idx !== i))} className="text-gray-500 hover:text-red-400">×</button>
          </span>
        ))}
        <span className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          Schedule:
          <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-800/50 px-2 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none" />
        </span>
      </div>

      {aiError && <p className="text-xs text-red-400">{aiError}</p>}
      {status && (
        <p className={`text-xs ${status.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{status.message}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button onClick={handleSend} disabled={sending || !to.trim()}
          className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40">
          {sending ? 'Working…' : scheduleAt ? 'Schedule Send' : 'Send'}
        </button>
        <button onClick={handleSaveDraft} disabled={sending}
          className="rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-semibold text-gray-200 transition hover:bg-gray-700 disabled:opacity-40">
          Save Draft
        </button>
      </div>
    </div>
  );
}
