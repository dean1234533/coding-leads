import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

export default function CrmTasksList({ leadId }) {
  const [tasks, setTasks] = useState(null);
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'crmLeads', leadId, 'tasks'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setTasks([]));
  }, [leadId]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await addDoc(collection(db, 'crmLeads', leadId, 'tasks'), {
      text: text.trim(), done: false, dueDate: dueDate || null, createdAt: serverTimestamp(),
    });
    setText(''); setDueDate('');
  }

  async function toggleDone(task) {
    await updateDoc(doc(db, 'crmLeads', leadId, 'tasks', task.id), { done: !task.done });
  }

  async function handleDelete(taskId) {
    await deleteDoc(doc(db, 'crmLeads', leadId, 'tasks', taskId));
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Send follow-up, check website again…"
          className="min-w-[10rem] flex-1 rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="rounded-lg bg-gray-800 px-4 py-2 text-xs font-semibold text-gray-200 transition hover:bg-gray-700 disabled:opacity-50"
        >
          Add Task
        </button>
      </form>

      <div className="space-y-1">
        {tasks === null && <p className="text-xs text-gray-600">Loading…</p>}
        {tasks?.length === 0 && <p className="text-xs text-gray-600">No tasks yet.</p>}
        {tasks?.map((task) => (
          <div key={task.id} className="group flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-gray-800/30">
            <input type="checkbox" checked={task.done} onChange={() => toggleDone(task)} className="accent-blue-500" />
            <span className={`flex-1 text-sm ${task.done ? 'text-gray-600 line-through' : 'text-gray-200'}`}>{task.text}</span>
            {task.dueDate && <span className="text-xs text-gray-600">{task.dueDate}</span>}
            <button onClick={() => handleDelete(task.id)} className="text-gray-700 opacity-0 transition hover:text-red-400 group-hover:opacity-100">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
