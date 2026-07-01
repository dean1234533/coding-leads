import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';
import Calendar, { dateKey, slotsByDate } from '../components/Calendar';

const GRAD = 'linear-gradient(135deg, #3b82f6, #06b6d4)';
const GRAD_SHADOW = '0 8px 28px rgba(59,130,246,0.45)';

function formatSlot(slot) {
  const start = new Date(slot.start);
  const end   = new Date(slot.end);
  const day   = start.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' });
  const from  = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  const to    = end.toLocaleTimeString('en-GB',   { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  return { day, time: `${from} – ${to}` };
}

const inputStyle = {
  width: '100%', padding: '12px 16px', borderRadius: 12, outline: 'none',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff', fontSize: 14, fontFamily: 'inherit',
};

export default function BookingPage() {
  const [session,      setSession]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selected,     setSelected]     = useState(null);
  const [name,         setName]         = useState('');
  const [email,        setEmail]        = useState('');
  const [note,         setNote]         = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [confirmed,    setConfirmed]    = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await httpsCallable(getFunctions(app), 'getLiveAvailability')({});
        const data = res.data;
        setSession(data);
        if (data.slots?.length > 0) setSelectedDate(new Date(data.slots[0].start));
      } catch (err) {
        setError(err?.message ?? 'Unable to load availability. Please try again later.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleConfirm(e) {
    e.preventDefault();
    if (!selected || !name.trim() || !email.trim()) return;
    setSubmitting(true);
    try {
      const res = await httpsCallable(getFunctions(app), 'confirmBooking')({
        slotStart:   selected.start,
        slotEnd:     selected.end,
        clientName:  name.trim(),
        clientEmail: email.trim(),
        clientNote:  note.trim(),
      });
      setConfirmed(res.data.confirmedTime);
    } catch (err) {
      setError(err?.message ?? 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '3px solid rgba(59,130,246,0.3)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Fatal error ───────────────────────────────────────────────────────────
  if (error && !session) {
    return (
      <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>
        </div>
      </div>
    );
  }

  // ── Confirmed ─────────────────────────────────────────────────────────────
  if (confirmed) {
    return (
      <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
        {/* glow */}
        <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse at top,rgba(59,130,246,0.3),transparent 65%)', filter: 'blur(40px)', pointerEvents: 'none' }} />
        <div style={{ textAlign: 'center', maxWidth: 420, position: 'relative' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 28 }}>✓</div>
          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 10px' }}>You're booked!</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, marginBottom: 12 }}>Your call has been confirmed for:</p>
          <p style={{ background: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{confirmed}</p>
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>A calendar invite has been sent to your email. Dean will be in touch if anything changes.</p>
        </div>
      </div>
    );
  }

  const slots    = session?.slots ?? [];
  const hasSlots = slots.length > 0;
  const byDate   = slotsByDate(slots);
  const daySlots = selectedDate ? (byDate[dateKey(selectedDate)] ?? []) : [];

  function handleDateSelect(date) {
    setSelectedDate(date);
    setSelected(null);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', fontFamily: 'Inter, system-ui, sans-serif', color: '#fff' }}>

      {/* Grid background */}
      <div style={{ position: 'fixed', inset: 0, opacity: 0.1, backgroundImage: 'linear-gradient(rgba(59,130,246,0.4) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.4) 1px,transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />
      {/* Top glow */}
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: 700, height: 350, background: 'radial-gradient(ellipse at top,rgba(59,130,246,0.28),transparent 65%)', filter: 'blur(40px)', pointerEvents: 'none' }} />

      {/* Nav */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', justifyContent: 'center', padding: '14px 16px 0' }}>
        <nav style={{ width: '100%', maxWidth: 680, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 18px', borderRadius: 18, background: 'rgba(9,9,11,0.88)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>D</div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em' }}>Dean Burt</span>
          </div>
          <a href="https://dean-da-dev.co.uk" target="_blank" rel="noopener noreferrer"
            style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
            Portfolio →
          </a>
        </nav>
      </div>

      {/* Main */}
      <main style={{ maxWidth: 600, margin: '0 auto', padding: 'clamp(48px,8vw,80px) 20px 80px', position: 'relative' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 99, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', marginBottom: 24 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 0 3px rgba(16,185,129,0.25)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#60a5fa', letterSpacing: '0.02em' }}>Dean Burt · Developer</span>
          </div>
          <h1 style={{ fontSize: 'clamp(28px,6vw,44px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#fff', margin: '0 0 12px', lineHeight: 1.1 }}>
            {session?.title ?? 'Book a Call'}
          </h1>
          {session?.durationMins && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>{session.durationMins} minutes · Video or phone call</p>
          )}
        </div>

        {!hasSlots ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>No slots currently available. Check back soon or email <a href="mailto:deanburt1308@gmail.com" style={{ color: '#60a5fa' }}>deanburt1308@gmail.com</a></p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

            {/* Step 1: Calendar */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6', marginBottom: 16 }}>1 — Pick a date</p>
              <div style={{ borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '24px 20px' }}>
                <Calendar
                  slots={slots}
                  selectedDate={selectedDate}
                  onSelectDate={handleDateSelect}
                  selectedBg={GRAD}
                  dotStyle={() => 'bg-blue-500'}
                />
              </div>

              {/* Time slots */}
              {selectedDate && (
                <div style={{ marginTop: 20 }}>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 12, fontWeight: 500 }}>
                    {selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  {daySlots.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>No slots on this day.</p>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {daySlots.map(slot => {
                        const { time } = formatSlot(slot);
                        const isSel    = selected?.start === slot.start;
                        return (
                          <button
                            key={slot.start}
                            onClick={() => setSelected(slot)}
                            style={{
                              padding: '10px 18px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                              background: isSel ? GRAD : 'rgba(255,255,255,0.06)',
                              border: isSel ? '1px solid transparent' : '1px solid rgba(255,255,255,0.1)',
                              color: '#fff',
                              boxShadow: isSel ? GRAD_SHADOW : 'none',
                            }}
                          >
                            {time}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Details */}
            {selected && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6', marginBottom: 16 }}>2 — Your details</p>

                <div style={{ borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '24px 20px' }}>

                  {/* Selected slot pill */}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 99, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', marginBottom: 24, fontSize: 13, color: '#93c5fd', fontWeight: 600 }}>
                    📅 {formatSlot(selected).day} · {formatSlot(selected).time}
                  </div>

                  {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</p>}

                  <form onSubmit={handleConfirm} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>Your Name</label>
                        <input
                          required type="text" value={name}
                          onChange={e => setName(e.target.value)}
                          placeholder="Jane Smith"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>Email Address</label>
                        <input
                          required type="email" value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="jane@business.com"
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>Anything you'd like Dean to know? (optional)</label>
                      <textarea
                        rows={3} value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="e.g. I run a hair salon and I'm looking for a website..."
                        style={{ ...inputStyle, resize: 'none' }}
                      />
                    </div>

                    <button
                      type="submit" disabled={submitting}
                      style={{
                        width: '100%', padding: '16px 24px', borderRadius: 14, border: 'none',
                        background: submitting ? 'rgba(59,130,246,0.5)' : GRAD,
                        color: '#fff', fontSize: 15, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit', boxShadow: submitting ? 'none' : GRAD_SHADOW,
                        transition: 'all 0.15s',
                      }}
                    >
                      {submitting ? 'Confirming…' : 'Confirm Booking →'}
                    </button>

                    <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
                      A calendar invite will be sent to your email address.
                    </p>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 80, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 28 }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.18)' }}>© {new Date().getFullYear()} Dean Burt · Full-Stack Developer · UK</p>
        </div>
      </main>
    </div>
  );
}
