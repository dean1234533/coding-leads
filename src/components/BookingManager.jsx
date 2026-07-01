import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { app, db } from '../firebase';
import Calendar, { dateKey, slotsByDate } from './Calendar';

const DURATION_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
];

const PERMANENT_LINK = `${window.location.origin}/book`;

function slotTimeLondon(isoString) {
  return new Date(isoString).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
  });
}

function formatTime(slot) {
  const from = slotTimeLondon(slot.start);
  const to   = new Date(slot.end).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  return `${from} – ${to}`;
}

export default function BookingManager() {
  const [duration,     setDuration]     = useState(15);
  const [title,        setTitle]        = useState('Discovery Call — Dean Burt');
  const [allSlots,     setAllSlots]     = useState([]);
  const [approved,     setApproved]     = useState(new Set());
  const [selectedDate, setSelectedDate] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError,   setSlotsError]   = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [saveError,    setSaveError]    = useState(null);
  const [copied,       setCopied]       = useState(false);
  const [initialising, setInitialising] = useState(true);

  async function loadSlots(dur) {
    setLoadingSlots(true);
    setSlotsError(null);
    try {
      const res = await httpsCallable(getFunctions(app), 'getAvailableSlots')({ durationMins: dur });
      const slots = res.data.slots ?? [];
      setAllSlots(slots);
      if (slots.length > 0) setSelectedDate(new Date(slots[0].start));
    } catch (err) {
      setSlotsError(err?.message ?? 'Could not load slots.');
    } finally {
      setLoadingSlots(false);
    }
  }

  // On mount: load saved config from Firestore first, then fetch slots
  useEffect(() => {
    async function init() {
      try {
        const snap = await getDoc(doc(db, 'booking_config', 'default'));
        if (snap.exists()) {
          const data = snap.data();
          const savedDur      = data.durationMins ?? 15;
          const savedTitle    = data.title ?? 'Discovery Call — Dean Burt';
          const savedApproved = data.approvedSlots ?? [];
          setTitle(savedTitle);
          setDuration(savedDur);
          if (savedApproved.length > 0) setApproved(new Set(savedApproved));
          await loadSlots(savedDur);
        } else {
          await loadSlots(15);
        }
      } catch {
        await loadSlots(15);
      } finally {
        setInitialising(false);
      }
    }
    init();
  }, []);

  function toggleSlot(startIso) {
    setApproved(prev => {
      const next = new Set(prev);
      next.has(startIso) ? next.delete(startIso) : next.add(startIso);
      return next;
    });
  }

  function toggleDay(daySlots) {
    const allOn = daySlots.every(s => approved.has(s.start));
    setApproved(prev => {
      const next = new Set(prev);
      daySlots.forEach(s => allOn ? next.delete(s.start) : next.add(s.start));
      return next;
    });
  }

  // Copy the approved times from the current day to all other days
  function repeatToAllDays() {
    const approvedTimes = daySlots
      .filter(s => approved.has(s.start))
      .map(s => slotTimeLondon(s.start));

    if (approvedTimes.length === 0) return;

    setApproved(prev => {
      const next = new Set(prev);
      allSlots.forEach(slot => {
        if (approvedTimes.includes(slotTimeLondon(slot.start))) {
          next.add(slot.start);
        }
      });
      return next;
    });
  }

  async function handleDurationChange(dur) {
    setDuration(dur);
    setApproved(new Set());
    setSelectedDate(null);
    await loadSlots(dur);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await httpsCallable(getFunctions(app), 'updateBookingSettings')({
        title,
        durationMins:  duration,
        approvedSlots: approved.size > 0 ? [...approved] : null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err?.message ?? 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(PERMANENT_LINK).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const byDate   = slotsByDate(allSlots);
  const daySlots = selectedDate ? (byDate[dateKey(selectedDate)] ?? []) : [];
  const allDayOn = daySlots.length > 0 && daySlots.every(s => approved.has(s.start));
  const dayHasApproved = daySlots.some(s => approved.has(s.start));

  function dotStyle(key, slots) {
    return slots.some(s => approved.has(s.start)) ? 'bg-emerald-400' : 'bg-blue-400';
  }

  if (initialising) {
    return (
      <div className="flex items-center gap-2 py-12 text-xs text-gray-500">
        <svg className="h-4 w-4 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        Loading your booking settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-xl font-bold text-white">Booking</h1>
        <p className="text-xs text-gray-500">
          Click a date on the calendar, toggle the slots you want to show clients, then save.
        </p>
      </div>

      {/* Booking link */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
        <div>
          <p className="text-sm font-semibold text-emerald-400">Your booking link</p>
          <p className="mt-0.5 text-xs text-gray-500">Share this everywhere — it always shows your approved slots.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={PERMANENT_LINK}
            className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-300 font-mono outline-none"
          />
          <button
            onClick={copyLink}
            className={`flex-shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              copied
                ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-400 hover:to-cyan-400'
            }`}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <a href="/book" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition">
          Preview as client →
        </a>
      </div>

      {/* Settings */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-5">
        <h2 className="text-sm font-semibold text-gray-200">Settings</h2>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-gray-500">Call Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-gray-500">Slot Duration</label>
          <div className="flex flex-wrap gap-2">
            {DURATION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleDurationChange(opt.value)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  duration === opt.value
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar + slot picker */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-200">Pick your available slots</h2>
          {approved.size > 0 && (
            <span className="text-xs text-emerald-400 font-medium">{approved.size} approved</span>
          )}
        </div>

        {loadingSlots ? (
          <div className="flex items-center gap-2 py-8 text-xs text-gray-500">
            <svg className="h-4 w-4 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Loading your calendar…
          </div>
        ) : slotsError ? (
          <p className="text-xs text-red-400 py-4">{slotsError}</p>
        ) : allSlots.length === 0 ? (
          <p className="text-xs text-gray-500 py-4">No free slots found in the next 14 days.</p>
        ) : (
          <>
            <Calendar
              slots={allSlots}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              dotStyle={dotStyle}
            />

            {/* Slots for selected day */}
            {selectedDate && (
              <div className="border-t border-gray-800 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-300">
                    {selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  {daySlots.length > 0 && (
                    <button
                      onClick={() => toggleDay(daySlots)}
                      className="text-[10px] font-semibold text-blue-400 hover:text-blue-300 transition"
                    >
                      {allDayOn ? 'Deselect all' : 'Select all'}
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {daySlots.map(slot => {
                    const on = approved.has(slot.start);
                    return (
                      <button
                        key={slot.start}
                        onClick={() => toggleSlot(slot.start)}
                        className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                          on
                            ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                            : 'bg-gray-800 text-gray-500 hover:text-gray-300 ring-1 ring-gray-700'
                        }`}
                      >
                        {formatTime(slot)}
                      </button>
                    );
                  })}
                </div>

                {/* Repeat to all days */}
                {daySlots.length > 0 && (
                  <button
                    onClick={repeatToAllDays}
                    disabled={!dayHasApproved}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ring-1 ring-inset w-full justify-center ${
                      dayHasApproved
                        ? 'text-blue-300 ring-blue-500/40 hover:bg-blue-500/10'
                        : 'text-gray-600 ring-gray-700 cursor-not-allowed'
                    }`}
                  >
                    <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                    {dayHasApproved ? 'Repeat these times to all other days' : 'Select slots above to repeat them'}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        <p className="text-[11px] text-gray-600">
          Green = shown to clients. If nothing is approved, all free slots are shown.
        </p>
      </div>

      {saveError && <p className="text-xs text-red-400">{saveError}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className={`w-full rounded-xl py-3.5 text-sm font-semibold transition ${
          saved
            ? 'bg-emerald-600 text-white'
            : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-400 hover:to-cyan-400 disabled:opacity-50'
        }`}
      >
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save & Publish'}
      </button>

    </div>
  );
}
