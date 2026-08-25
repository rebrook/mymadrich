/**
 * Date and time formatting utilities for MyMadrich.
 *
 * Pure functions — no side effects, no API calls.
 * All output is 12-hour, AM/PM, with NO seconds.
 */

/**
 * Returns today's date as "YYYY-MM-DD" using the browser's LOCAL date,
 * not UTC. Deliberately avoids `new Date().toISOString()`, which reports
 * the UTC date and can be off by one near midnight in US time zones
 * (e.g. 11pm Eastern is already "tomorrow" in UTC).
 *
 * Use this instead of toISOString() wherever "today" is compared against
 * ISO date-only strings from the database (start_date, end_date, etc.).
 *
 * @returns {string} Local date in "YYYY-MM-DD" format.
 */
export function getTodayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Formats an ISO date string for display.
 *
 * @param {string|null} isoDate - ISO date string ("2026-07-12") or
 *   ISO datetime ("2026-07-12T16:00:00"). Null/undefined returns an em dash.
 * @param {Object} [options]
 * @param {'long'|'short'|'date'|'time'} [options.style='short'] - Output style:
 *   - 'long'  → "Sunday, July 12 at 4:00 PM"
 *   - 'short' → "Sun, Jul 12 · 4:00 PM"
 *   - 'date'  → "Sunday, July 12, 2026"
 *   - 'time'  → "4:00 PM"
 * @returns {string}
 */
export function formatSessionDate(isoDate, { style = 'short' } = {}) {
  if (!isoDate) return '\u2014';

  // Normalize: date-only strings get T00:00:00 to avoid timezone shifting
  const dateStr = isoDate.includes('T') ? isoDate : isoDate + 'T00:00:00';
  const d = new Date(dateStr);

  if (isNaN(d.getTime())) return '\u2014';

  switch (style) {
    case 'long': {
      // "Sunday, July 12 at 4:00 PM"
      const dayPart = d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
      // Only append time if the original input included a time component
      if (isoDate.includes('T') && !isoDate.endsWith('T00:00:00')) {
        const timePart = formatTime12(d);
        return `${dayPart} at ${timePart}`;
      }
      return dayPart;
    }

    case 'short': {
      // "Sun, Jul 12 · 4:00 PM"
      const dayPart = d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      if (isoDate.includes('T') && !isoDate.endsWith('T00:00:00')) {
        const timePart = formatTime12(d);
        return `${dayPart} \u00B7 ${timePart}`;
      }
      return dayPart;
    }

    case 'date': {
      // "Sunday, July 12, 2026"
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }

    case 'time': {
      // "4:00 PM"
      return formatTime12(d);
    }

    default:
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
  }
}

/**
 * Formats a bare time string from the database (e.g. "16:00:00")
 * into a 12-hour display string ("4:00 PM").
 *
 * @param {string|null} timeStr - Time in "HH:MM:SS" or "HH:MM" format.
 * @returns {string} 12-hour formatted time, or empty string if null.
 */
export function formatSessionTime(timeStr) {
  if (!timeStr) return '';

  const parts = timeStr.split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';

  if (isNaN(hours)) return '';

  const ampm = hours >= 12 ? 'PM' : 'AM';
  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;

  return `${hours}:${minutes} ${ampm}`;
}

/**
 * Formats a date-only string as a compact date ("Jul 12, 2026").
 * Drop-in replacement for the scattered formatDate() helpers.
 *
 * @param {string|null} dateStr - ISO date string ("2026-07-12").
 * @returns {string}
 */
export function formatDateCompact(dateStr) {
  if (!dateStr) return '\u2014';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '\u2014';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats a date-only string as a compact short date ("Jul 12") — no year.
 *
 * @param {string|null} dateStr - ISO date string.
 * @returns {string}
 */
export function formatDateShort(dateStr) {
  if (!dateStr) return '\u2014';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '\u2014';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Formats a date-only string as "Tue, May 6" — weekday + short date.
 *
 * @param {string|null} dateStr - ISO date string.
 * @returns {string}
 */
export function formatDayDate(dateStr) {
  if (!dateStr) return '\u2014';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '\u2014';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Formats a start + end time range for display.
 * If both are present: "4:00 PM \u2013 4:45 PM"
 * If only start: "4:00 PM"
 * If neither: empty string.
 *
 * @param {string|null} startTime - Time in "HH:MM:SS" or "HH:MM" format.
 * @param {string|null} endTime - Time in "HH:MM:SS" or "HH:MM" format.
 * @returns {string}
 */
export function formatSessionTimeRange(startTime, endTime) {
  const start = formatSessionTime(startTime);
  const end = formatSessionTime(endTime);
  if (start && end) return `${start}\u2013${end}`;
  return start;
}

/**
 * Computes the duration in minutes between two time strings.
 * Returns null if either is missing or if end is before start.
 *
 * @param {string|null} startTime - "HH:MM:SS" or "HH:MM"
 * @param {string|null} endTime - "HH:MM:SS" or "HH:MM"
 * @returns {number|null} Duration in minutes, or null.
 */
export function computeDurationMinutes(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const toMin = (t) => {
    const parts = t.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
  };
  const diff = toMin(endTime) - toMin(startTime);
  return diff > 0 ? diff : null;
}

// ---- Internal ----

/**
 * Extracts 12-hour time from a Date object. No seconds.
 */
function formatTime12(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
