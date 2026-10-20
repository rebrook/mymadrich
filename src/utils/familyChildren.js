/**
 * familyChildren.js — shared rules for a family's view of their children.
 *
 * Two rules live here so every family screen agrees:
 *   1. When is a child "completed"?
 *   2. Which child does a family land on first?
 *
 * "Passed" matches the family report: the mitzvah date is strictly before today
 * (local calendar date). A service happening today is not yet celebrated.
 */

import { getTodayDateString } from './datetime';

/**
 * True once the mitzvah date is before today.
 *
 * @param {{ mitzvah_date?: string|null }} student
 * @param {string} [today] - 'YYYY-MM-DD' (defaults to today's local date; pass it in tests)
 */
export function hasMitzvahPassed(student, today = getTodayDateString()) {
  return Boolean(student && student.mitzvah_date) && student.mitzvah_date < today;
}

/**
 * True when a family should see the look-back (celebration) view for this child:
 * the child is marked completed, or the date has passed.
 */
export function isChildCompleted(student, today = getTodayDateString()) {
  if (!student) return false;
  return student.status === 'completed' || hasMitzvahPassed(student, today);
}

// Soonest date first; children with no date last; first name then id keep the order stable.
function byUpcomingDate(a, b) {
  const da = a.mitzvah_date || null;
  const db = b.mitzvah_date || null;
  if (da && db && da !== db) return da < db ? -1 : 1;
  if (da && !db) return -1;
  if (!da && db) return 1;
  return tieBreak(a, b);
}

// Most recent date first; children with no date last.
function byRecentDate(a, b) {
  const da = a.mitzvah_date || null;
  const db = b.mitzvah_date || null;
  if (da && db && da !== db) return da > db ? -1 : 1;
  if (da && !db) return -1;
  if (!da && db) return 1;
  return tieBreak(a, b);
}

function tieBreak(a, b) {
  const byName = String(a.first_name || '').localeCompare(String(b.first_name || ''));
  if (byName !== 0) return byName;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

/**
 * Which child a family should land on.
 *
 *   1. The child they last viewed, if still in progress.
 *   2. Otherwise a child still in progress, soonest mitzvah date first.
 *   3. If every child is completed: the last-viewed child (their own choice stands),
 *      or else the most recent mitzvah date.
 *   First name, then id, break ties so the result never changes between loads.
 *
 * @param {Array<{id:string, first_name?:string, mitzvah_date?:string|null, status?:string}>} children
 * @param {string|null|undefined} storedId - the last child the family viewed on this device
 * @param {string} [today] - 'YYYY-MM-DD' (defaults to today's local date; pass it in tests)
 * @returns {string|null} the child's id, or null when there are no children
 */
export function pickDefaultChild(children, storedId, today = getTodayDateString()) {
  if (!Array.isArray(children) || children.length === 0) return null;

  const stored = storedId ? children.find((c) => c.id === storedId) : null;
  const inProgress = children.filter((c) => !isChildCompleted(c, today));

  if (inProgress.length > 0) {
    if (stored && !isChildCompleted(stored, today)) return stored.id;
    return [...inProgress].sort(byUpcomingDate)[0].id;
  }

  // Every child is completed
  if (stored) return stored.id;
  return [...children].sort(byRecentDate)[0].id;
}
