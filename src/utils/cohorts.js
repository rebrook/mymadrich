/**
 * Cohort selection utilities for MyMadrich.
 *
 * Pure functions — no side effects, no API calls.
 */

import { getTodayDateString } from './datetime';

/**
 * Sorts cohorts chronologically, oldest start_date first. For display
 * in dropdowns/selectors, where "oldest to newest" is the natural
 * mental model, distinct from useCohorts()'s raw fetch order (which
 * is sorted by created_at, newest first, more useful for a management
 * list where recently-added items are top of mind).
 *
 * Cohorts with no start_date sort to the end, after all dated cohorts.
 *
 * @param {Array} cohorts
 * @returns {Array} A new sorted array; does not mutate the input.
 */
export function sortCohortsChronologically(cohorts) {
  return [...(cohorts || [])].sort((a, b) => {
    if (!a.start_date && !b.start_date) return 0;
    if (!a.start_date) return 1;
    if (!b.start_date) return -1;
    return a.start_date.localeCompare(b.start_date);
  });
}

/**
 * Determines which cohort should be treated as "current" by default.
 *
 * `is_active` means "not archived" (a manually-toggled flag), not
 * "the one running right now" — a congregation can legitimately have
 * multiple active, non-archived cohorts overlapping (e.g. this year's
 * and next year's). This function picks the single best default among
 * them based on today's date:
 *
 *   1. Archived cohorts (is_active: false) are never eligible.
 *   2. If exactly one active cohort exists, return it directly —
 *      skips date logic entirely, so a cohort mid-setup with
 *      incomplete start_date/end_date still gets selected correctly.
 *   3. Among multiple active cohorts, prefer the one whose date range
 *      contains today (start_date <= today <= end_date).
 *   4. If none contains today (a real gap between cohorts), fall back
 *      to the most recently ENDED active cohort — more likely to be
 *      relevant than an upcoming cohort with no students engaged yet.
 *   5. If there's no past cohort either, fall back to the soonest
 *      UPCOMING active cohort.
 *   6. If active cohorts exist but none have usable dates to rank,
 *      fall back to the first active cohort rather than null.
 *   7. If there are no active cohorts at all, returns null — callers
 *      should treat this as "let the user pick," not an error state.
 *
 * Date strings are compared lexicographically ("YYYY-MM-DD" sorts the
 * same as chronologically) — deliberate, not a shortcut. Don't refactor
 * this into Date object comparisons; that reintroduces timezone bugs
 * that getTodayDateString() specifically avoids.
 *
 * @param {Array} cohorts - array from useCohorts(), each with
 *   { id, is_active, start_date, end_date, ... }
 * @returns {Object|null} The selected cohort, or null if none qualify.
 */
export function getCurrentCohort(cohorts) {
  const activeCohorts = (cohorts || []).filter((c) => c.is_active);

  if (activeCohorts.length === 0) return null;
  if (activeCohorts.length === 1) return activeCohorts[0];

  const today = getTodayDateString();

  const current = activeCohorts.find(
    (c) => c.start_date && c.end_date && c.start_date <= today && today <= c.end_date
  );
  if (current) return current;

  const past = activeCohorts
    .filter((c) => c.end_date && c.end_date < today)
    .sort((a, b) => b.end_date.localeCompare(a.end_date));
  if (past.length > 0) return past[0];

  const future = activeCohorts
    .filter((c) => c.start_date && c.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (future.length > 0) return future[0];

  // Active cohorts exist but none have usable dates to rank.
  return activeCohorts[0];
}
