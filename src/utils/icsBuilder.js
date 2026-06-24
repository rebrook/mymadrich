/**
 * icsBuilder.js — Client-side .ics (iCalendar) file generator.
 *
 * Pure functions — no side effects, no API calls.
 * Generates RFC 5545 compliant VCALENDAR text that imports into
 * Apple Calendar, Google Calendar, Outlook, etc.
 *
 * All times are floating local (no TZID) — acceptable for a hand-off
 * file where the tutor and student are in the same timezone.
 *
 * Duration defaults to 45 minutes when no end time is provided.
 * When session.nextEndTime is set, DTEND uses the real end time.
 */

/**
 * Formats a Date as an iCalendar DTSTAMP string (UTC).
 * @param {Date} [d] - Defaults to now.
 * @returns {string} e.g. "20260615T120000Z"
 */
function icsTimestamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Formats a date-only string as VALUE=DATE ("20260616").
 * @param {string} dateStr - ISO date "2026-06-16"
 * @returns {string}
 */
function icsDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

/**
 * Formats a date + time as a floating local DTSTART ("20260616T163000").
 * @param {string} dateStr - ISO date "2026-06-16"
 * @param {string} timeStr - Time "16:30" or "16:30:00"
 * @returns {string}
 */
function icsDateTime(dateStr, timeStr) {
  const datePart = dateStr.replace(/-/g, '');
  const parts = timeStr.split(':');
  const hh = parts[0].padStart(2, '0');
  const mm = (parts[1] || '00').padStart(2, '0');
  const ss = (parts[2] || '00').padStart(2, '0');
  return `${datePart}T${hh}${mm}${ss}`;
}

/**
 * Adds minutes to a date+time and returns a floating local string.
 * @param {string} dateStr - ISO date
 * @param {string} timeStr - Time "HH:MM" or "HH:MM:SS"
 * @param {number} minutes - Duration in minutes
 * @returns {string} Floating local datetime
 */
function icsDateTimeAdd(dateStr, timeStr, minutes) {
  const parts = timeStr.split(':');
  const d = new Date(`${dateStr}T${parts[0].padStart(2, '0')}:${(parts[1] || '00').padStart(2, '0')}:00`);
  d.setMinutes(d.getMinutes() + minutes);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}${mo}${day}T${hh}${mm}00`;
}

/**
 * Folds a line to 75-octet max per RFC 5545 content line folding.
 * @param {string} line
 * @returns {string}
 */
function foldLine(line) {
  if (line.length <= 75) return line;
  const parts = [];
  parts.push(line.substring(0, 75));
  let i = 75;
  while (i < line.length) {
    parts.push(' ' + line.substring(i, i + 74));
    i += 74;
  }
  return parts.join('\r\n');
}

/**
 * Escapes text for iCalendar TEXT values.
 * @param {string} text
 * @returns {string}
 */
function escapeText(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// ---- Default duration (minutes) ----
// No duration column exists on sessions yet. Default to 45 min.
const DEFAULT_DURATION_MIN = 45;

/**
 * Builds a single VEVENT block.
 *
 * @param {Object} session
 * @param {string} session.studentId - Student UUID (for deterministic UID)
 * @param {string} session.studentName - "First Last"
 * @param {string} session.nextDate - ISO date string
 * @param {string|null} session.nextTime - Start time string "HH:MM" or null
 * @param {string|null} [session.nextEndTime] - End time string "HH:MM" or null
 * @param {string} [session.parashah] - Parashah name for description
 * @param {string} [session.paceLabel] - Pace status label
 * @param {string} [session.appUrl] - Link to MyMadrich
 * @returns {string} VEVENT block (no VCALENDAR wrapper)
 */
function buildVevent(session) {
  const uid = `${session.studentId}-${session.nextDate}@mymadrich`;
  const stamp = icsTimestamp();
  const summary = `MyMadrich: ${session.studentName}`;

  const descParts = [];
  if (session.parashah) descParts.push(`Parashah: ${session.parashah}`);
  if (session.paceLabel) descParts.push(`Pace: ${session.paceLabel}`);
  if (session.appUrl) descParts.push(`Open MyMadrich: ${session.appUrl}`);
  const description = escapeText(descParts.join('\n'));

  const lines = [
    'BEGIN:VEVENT',
    foldLine(`UID:${uid}`),
    `DTSTAMP:${stamp}`,
  ];

  if (session.nextTime) {
    const dtStart = icsDateTime(session.nextDate, session.nextTime);
    // Use real end time when available; fall back to 45-min default
    const dtEnd = session.nextEndTime
      ? icsDateTime(session.nextDate, session.nextEndTime)
      : icsDateTimeAdd(session.nextDate, session.nextTime, DEFAULT_DURATION_MIN);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
  } else {
    // All-day event when no time is set
    lines.push(`DTSTART;VALUE=DATE:${icsDate(session.nextDate)}`);
  }

  lines.push(foldLine(`SUMMARY:${escapeText(summary)}`));
  if (description) {
    lines.push(foldLine(`DESCRIPTION:${description}`));
  }
  lines.push('LOCATION:');
  lines.push('END:VEVENT');

  return lines.join('\r\n');
}

/**
 * Wraps VEVENT(s) in a VCALENDAR envelope.
 * @param {string} vevents - One or more VEVENT blocks joined by \r\n
 * @returns {string} Complete .ics file content
 */
function wrapCalendar(vevents) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MyMadrich//Tutor My Week//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    vevents,
    'END:VCALENDAR',
  ].join('\r\n');
}

// ---- Public API ----

/**
 * Generates a .ics string for a single session.
 * @param {Object} session - See buildVevent param shape.
 * @returns {string} Complete .ics file content.
 */
export function buildSessionIcs(session) {
  return wrapCalendar(buildVevent(session));
}

/**
 * Generates a .ics string for multiple sessions (week bundle).
 * @param {Array<Object>} sessions - Array of session objects.
 * @returns {string} Complete .ics file content with multiple VEVENTs.
 */
export function buildWeekIcs(sessions) {
  const vevents = sessions.map(buildVevent).join('\r\n');
  return wrapCalendar(vevents);
}

/**
 * Triggers a browser download of an .ics file.
 * @param {string} icsContent - Complete .ics string.
 * @param {string} filename - e.g. "my-week.ics" or "ari-bloom-jun-16.ics"
 */
export function downloadIcs(icsContent, filename) {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
