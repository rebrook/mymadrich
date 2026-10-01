/**
 * Helpers for the student's next session (scheduled date and time).
 * Pure functions, no side effects.
 */

/** Today as YYYY-MM-DD in the user's local time zone. */
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * True when a YYYY-MM-DD date is today or later. A date that has passed is
 * treated as "no session scheduled" everywhere in the app.
 */
export function isUpcomingDate(dateStr, today = localToday()) {
  return Boolean(dateStr) && dateStr >= today;
}

/**
 * Validates the Schedule dialog. Returns an object of plain-language
 * messages keyed by field (date, start, end); empty when everything is valid.
 *
 * start / end are 'HH:MM' strings, or '' when not (fully) chosen.
 * startPartial / endPartial are true when only some of the hour, minutes,
 * and AM/PM selects have been chosen, so a half-picked time is flagged
 * instead of silently dropped.
 */
export function validateNextSession(
  { date, start, end, startPartial = false, endPartial = false },
  today = localToday(),
) {
  const errors = {};

  if (!date) errors.date = 'Choose a date.';
  else if (date < today) errors.date = 'Choose today or a later date.';

  if (startPartial) errors.start = 'Choose an hour, minutes, and AM or PM.';

  if (endPartial) errors.end = 'Choose an hour, minutes, and AM or PM.';
  else if (end && !start && !startPartial) errors.end = 'Add a start time first.';
  else if (end && start && end <= start) errors.end = 'End time must be after the start time.';

  return errors;
}
