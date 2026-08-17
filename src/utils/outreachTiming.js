const TIMING = {
  email: {
    label: 'Email',
    days: [2, 3, 4],
    slots: [[9, 35], [14, 10]],
    summary: 'Tuesday–Thursday, 9:30–11:00 is the strongest window; around 14:00 is the backup.',
  },
  linkedin: {
    label: 'LinkedIn',
    days: [2, 3, 4],
    slots: [[10, 10], [14, 20]],
    summary: 'Tuesday–Thursday, 09:00–11:00 works best for professional inboxes.',
  },
  whatsapp: {
    label: 'WhatsApp',
    days: [2, 3, 4],
    slots: [[10, 30], [14, 30]],
    summary: 'Tuesday–Thursday, 10:00–11:30 or 14:00–16:00; avoid mornings, lunch and evenings.',
  },
  instagram: {
    label: 'Instagram DM',
    days: [2, 3, 4],
    slots: [[11, 15], [15, 0]],
    summary: 'Tuesday–Thursday, late morning or 14:00–16:00, when owners are more likely to check DMs.',
  },
  facebook: {
    label: 'Facebook Messenger',
    days: [2, 3, 4],
    slots: [[11, 15], [15, 0]],
    summary: 'Tuesday–Thursday, late morning or 14:00–16:00; avoid weekends for cold outreach.',
  },
};

export function getOutreachTiming(channel = 'email') {
  return TIMING[channel] ?? TIMING.email;
}

/** Finds the next recommended UK-business send slot, at least 15 minutes away. */
export function nextRecommendedOutreachTime(channel = 'email', now = new Date()) {
  const timing = getOutreachTiming(channel);
  const earliest = new Date(now.getTime() + 15 * 60 * 1000);
  for (let offset = 0; offset < 14; offset += 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + offset);
    if (!timing.days.includes(day.getDay())) continue;
    for (const [hour, minute] of timing.slots) {
      const candidate = new Date(day);
      candidate.setHours(hour, minute, 0, 0);
      if (candidate >= earliest) return candidate;
    }
  }
  throw new Error('Could not find a recommended outreach time.');
}

export function toDateTimeLocal(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatRecommendedTime(date) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

