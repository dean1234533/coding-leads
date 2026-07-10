// Follow-up ladder: First Email -> +7d -> Follow Up 1 -> +7d -> Follow Up 2 -> +14d -> Archive
// followUpStage: 0 = first email just sent, 1 = first follow-up sent, 2 = second follow-up sent (next = archive)
const LADDER_DAYS = [7, 7, 14];

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate(); // Firestore Timestamp
  return new Date(value);
}

/**
 * Given the stage just completed (0 = first email, 1 = follow-up 1, 2 = follow-up 2)
 * and the date it was sent, returns the next follow-up date, or null if the
 * ladder is exhausted (lead should be archived).
 */
export function computeNextFollowUp(stageJustSent, sentDate) {
  const days = LADDER_DAYS[stageJustSent];
  if (days == null) return null; // stage 2 was the last rung — archive next
  return addDays(toDate(sentDate) ?? new Date(), days);
}

export function isOverdue(followUpDate) {
  const d = toDate(followUpDate);
  if (!d) return false;
  return d < new Date(new Date().setHours(0, 0, 0, 0));
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const ACTIVE_STATUSES = new Set(['Won', 'Lost', 'Archive']);

/**
 * The Firestore patch to apply whenever an email is actually sent to a lead —
 * advances the follow-up ladder by one step automatically (or starts it, if
 * this is the first send) instead of requiring a manual status change every
 * time. Used by both the single-lead composer and bulk send, so re-sending
 * to a lead that's already partway through the ladder advances it rather
 * than resetting back to stage 0. Leaves closed-out leads alone.
 */
export function followUpPatchForSend(lead, sentDate = new Date()) {
  if (ACTIVE_STATUSES.has(lead.status)) {
    return { lastContactDate: sentDate };
  }
  const stage = (lead.followUpStage ?? -1) + 1;
  const nextDate = computeNextFollowUp(stage, sentDate);
  return {
    status: nextDate ? (stage === 0 ? 'Email Sent' : 'Follow Up Due') : 'Archive',
    followUpStage: stage,
    followUpDate: nextDate,
    lastContactDate: sentDate,
  };
}

/** Groups leads with a followUpDate into today / tomorrow / this week / late buckets. */
export function groupFollowUps(leads) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);

  const groups = { today: [], tomorrow: [], thisWeek: [], late: [] };

  for (const lead of leads) {
    if (!lead.followUpDate || ACTIVE_STATUSES.has(lead.status)) continue;
    const d = toDate(lead.followUpDate);
    if (!d) continue;
    const dOnly = new Date(d); dOnly.setHours(0, 0, 0, 0);

    if (dOnly < today) groups.late.push(lead);
    else if (isSameDay(dOnly, today)) groups.today.push(lead);
    else if (isSameDay(dOnly, tomorrow)) groups.tomorrow.push(lead);
    else if (dOnly <= weekEnd) groups.thisWeek.push(lead);
  }

  return groups;
}
