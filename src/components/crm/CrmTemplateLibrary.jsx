import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import Modal from '../Modal';

const EMPTY = { name: '', category: 'Outreach', subject: '', body: '' };

export default function CrmTemplateLibrary() {
  const [templates, setTemplates] = useState(null);
  const [editing, setEditing] = useState(null); // template object or 'new' or null
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    const q = query(collection(db, 'crmTemplates'), orderBy('category'), orderBy('name'));
    return onSnapshot(q, (snap) => setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setTemplates([]));
  }, []);

  function startEdit(t) {
    setEditing(t ?? 'new');
    setForm(t ? { name: t.name, category: t.category, subject: t.subject, body: t.body } : EMPTY);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.subject.trim()) return;
    if (editing === 'new') {
      await addDoc(collection(db, 'crmTemplates'), { ...form, createdAt: serverTimestamp() });
    } else {
      await updateDoc(doc(db, 'crmTemplates', editing.id), form);
    }
    setEditing(null);
  }

  async function handleDelete(id) {
    await deleteDoc(doc(db, 'crmTemplates', id));
  }

  const grouped = (templates ?? []).reduce((acc, t) => {
    (acc[t.category ?? 'Other'] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Email Templates</h2>
          <p className="mt-0.5 text-xs text-gray-500">Reusable templates with {'{{business}} {{contact}} {{website}} {{industry}} {{issue}} {{portfolio}} {{myname}}'} variables.</p>
        </div>
        <button onClick={() => startEdit(null)}
          className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400">
          + New Template
        </button>
      </div>

      {templates === null && <p className="text-sm text-gray-600">Loading…</p>}

      {Object.entries(grouped).map(([category, list]) => (
        <div key={category} className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-600">{category}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((t) => (
              <div key={t.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p className="font-medium text-gray-100">{t.name}</p>
                <p className="mt-1 truncate text-xs text-gray-500">{t.subject}</p>
                <p className="mt-2 line-clamp-3 text-xs text-gray-600 whitespace-pre-line">{t.body}</p>
                <div className="mt-3 flex gap-3">
                  <button onClick={() => startEdit(t)} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                  <button onClick={() => handleDelete(t.id)} className="text-xs text-gray-600 hover:text-red-400">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {editing && (
        <Modal title={editing === 'new' ? 'New Template' : 'Edit Template'} onClose={() => setEditing(null)} maxWidth="max-w-xl">
          <form onSubmit={handleSave}>
            <div className="space-y-3">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Template name"
                className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
              <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Category"
                className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
              <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Subject line"
                className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
              <textarea rows={8} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Email body…"
                className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button type="submit" className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white hover:from-blue-400 hover:to-cyan-400">Save</button>
              <button type="button" onClick={() => setEditing(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
