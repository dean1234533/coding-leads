import { useState } from 'react';

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function dateKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function slotsByDate(slots) {
  const map = {};
  slots.forEach(slot => {
    const key = dateKey(new Date(slot.start));
    if (!map[key]) map[key] = [];
    map[key].push(slot);
  });
  return map;
}

function buildCalendarDays(year, month) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  let dow = first.getDay();
  dow = dow === 0 ? 6 : dow - 1; // Mon = 0
  const days = [];
  for (let i = 0; i < dow; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

/**
 * @param {object} props
 * @param {Array}    props.slots        - all slot objects with .start ISO string
 * @param {Date|null} props.selectedDate
 * @param {function} props.onSelectDate - called with Date
 * @param {function} [props.dotStyle]      - (dateKey, daySlots) => tailwind class string for the dot
 * @param {string}   [props.selectedBg]   - inline background for selected day cell (default indigo)
 * @param {string}   [props.todayRing]    - inline ring color for today cell
 */
export default function Calendar({ slots, selectedDate, onSelectDate, dotStyle, selectedBg, todayRing }) {
  const today  = new Date();
  const byDate = slotsByDate(slots);

  // Determine initial month: first slot's month, or today
  const firstSlotDate = slots.length ? new Date(slots[0].start) : today;
  const [viewYear,  setViewYear]  = useState(firstSlotDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(firstSlotDate.getMonth());

  const allSlotDates  = slots.map(s => new Date(s.start));
  const minDate = allSlotDates.length ? new Date(Math.min(...allSlotDates)) : today;
  const maxDate = allSlotDates.length ? new Date(Math.max(...allSlotDates)) : today;

  const canPrev = new Date(viewYear, viewMonth - 1, 1) >= new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const canNext = new Date(viewYear, viewMonth + 1, 1) <= new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

  function prevMonth() {
    if (!canPrev) return;
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (!canNext) return;
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  const calDays  = buildCalendarDays(viewYear, viewMonth);
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const todayKey = dateKey(today);

  return (
    <div className="select-none">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          disabled={!canPrev}
          className="rounded-lg p-1.5 text-gray-400 hover:text-gray-200 disabled:opacity-20 transition"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-200">{monthLabel}</span>
        <button
          onClick={nextMonth}
          disabled={!canNext}
          className="rounded-lg p-1.5 text-gray-400 hover:text-gray-200 disabled:opacity-20 transition"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="py-1 text-center text-[10px] font-bold uppercase tracking-widest text-gray-600">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {calDays.map((date, i) => {
          if (!date) return <div key={`e${i}`} />;

          const key       = dateKey(date);
          const daySlots  = byDate[key] ?? [];
          const hasSlots  = daySlots.length > 0;
          const isToday   = key === todayKey;
          const isSel     = selectedDate && dateKey(selectedDate) === key;
          const dot       = dotStyle ? dotStyle(key, daySlots) : 'bg-indigo-400';

          return (
            <button
              key={key}
              onClick={() => hasSlots && onSelectDate(date)}
              disabled={!hasSlots}
              style={isSel ? { background: selectedBg || '' } : {}}
              className={`relative flex flex-col items-center justify-center rounded-xl py-2 text-xs font-semibold transition
                ${isSel
                  ? (selectedBg ? 'text-white shadow-lg' : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/20')
                  : hasSlots
                    ? 'text-gray-200 hover:bg-gray-700/70'
                    : 'text-gray-700 cursor-default'
                }
                ${isToday && !isSel ? (todayRing ? '' : 'ring-1 ring-inset ring-blue-500/50') : ''}
              `}
            >
              {date.getDate()}
              {hasSlots && (
                <span className={`mt-0.5 h-1 w-1 rounded-full ${isSel ? 'bg-indigo-300' : dot}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
