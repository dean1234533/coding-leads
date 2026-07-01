'use strict';

const { google } = require('googleapis');

function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.CALENDAR_CLIENT_ID?.trim(),
    process.env.CALENDAR_CLIENT_SECRET?.trim(),
  );
  client.setCredentials({
    refresh_token: process.env.CALENDAR_REFRESH_TOKEN?.trim(),
  });
  return client;
}

/**
 * Returns busy time blocks from the primary Google Calendar.
 */
async function getFreeBusy(timeMin, timeMax) {
  const auth     = getOAuth2Client();
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: 'Europe/London',
      items:    [{ id: 'primary' }],
    },
  });
  return res.data.calendars?.primary?.busy ?? [];
}

/**
 * Creates a confirmed booking event in the primary Google Calendar.
 */
async function createCalendarEvent({ summary, description, startTime, endTime, attendeeEmail, attendeeName }) {
  const auth     = getOAuth2Client();
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.events.insert({
    calendarId:  'primary',
    sendUpdates: 'all',
    requestBody: {
      summary,
      description,
      start:     { dateTime: startTime, timeZone: 'Europe/London' },
      end:       { dateTime: endTime,   timeZone: 'Europe/London' },
      attendees: attendeeEmail ? [{ email: attendeeEmail, displayName: attendeeName ?? '' }] : [],
    },
  });
  return res.data;
}

/**
 * Generates all candidate time slots within business hours (9am–6pm, Mon–Fri UK).
 */
function generateSlots(from, to, durationMins) {
  const slots  = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= to) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      for (let startMin = 9 * 60; startMin + durationMins <= 18 * 60; startMin += durationMins) {
        const start = new Date(cursor);
        start.setHours(0, startMin, 0, 0);
        const end = new Date(start);
        end.setMinutes(end.getMinutes() + durationMins);
        slots.push({ start: start.toISOString(), end: end.toISOString() });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return slots;
}

/**
 * Filters out slots that overlap with any busy block.
 */
function filterFreeSlots(slots, busyTimes) {
  return slots.filter(slot => {
    const sStart = new Date(slot.start);
    const sEnd   = new Date(slot.end);
    return !busyTimes.some(busy => {
      const bStart = new Date(busy.start);
      const bEnd   = new Date(busy.end);
      return sStart < bEnd && sEnd > bStart;
    });
  });
}

module.exports = { getFreeBusy, createCalendarEvent, generateSlots, filterFreeSlots };
