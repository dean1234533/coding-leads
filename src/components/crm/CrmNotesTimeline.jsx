import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

function formatDateTime(value) {
  if (!value) return '…';
  const d = value.toDate ? value.toDate() : new Date(value);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function CrmNotesTimeline({ leadId }) {
  const [notes, setNotes] = useState(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'crmLeads', leadId, 'notes'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setNotes([]));
  }, [leadId]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'crmLeads', leadId, 'notes'), { text: text.trim(), createdAt: serverTimestamp() });
      setText('');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(noteId) {
    await deleteDoc(doc(db, 'crmLeads', leadId, 'notes', noteId));
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Checked website, sent first email…"
          className="flex-1 rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={saving || !text.trim()}
          className="rounded-lg bg-gray-800 px-4 py-2 text-xs font-semibold text-gray-200 transition hover:bg-gray-700 disabled:opacity-50"
        >
          Add Note
        </button>
      </form>

      <div className="space-y-3 border-l border-gray-800 pl-4">
        {notes === null && <p className="text-xs text-gray-600">Loading…</p>}
        {notes?.length === 0 && <p className="text-xs text-gray-600">No notes yet.</p>}
        {notes?.map((note) => (
          <div key={note.id} className="group relative -ml-[21px] pl-4">
            <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-blue-500" />
            <p className="text-sm text-gray-200">{note.text}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-[11px] text-gray-600">{formatDateTime(note.createdAt)}</p>
              <button onClick={() => handleDelete(note.id)} className="text-[11px] text-gray-700 opacity-0 transition hover:text-red-400 group-hover:opacity-100">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
