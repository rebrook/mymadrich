/**
 * mastery.js — Single source of truth for mastery counting.
 *
 * Every surface in the app calls these functions to count verses.
 * No component computes its own mastery numbers.
 *
 * Quality enum values (from verse_current_status.quality):
 *   'perfect'            → mastered
 *   'minor_mistakes'     → in progress (touched but not yet mastered)
 *   'moderate_mistakes'  → in progress
 *   'still_learning'     → in progress
 *   null / undefined     → not started
 *
 * NOTE ON TORAH-SIDE GOLD: "Gold" is a *render* state, not a separate
 * quality value. A Torah-side verse has quality === 'perfect' plus
 * status === 'torah_side' on a Torah reading. It counts as mastered
 * under the standard quality === 'perfect' test — no special branch.
 *
 * The same quality enum applies to service elements
 * (element_current_status.quality). Use masteryCounts() for elements
 * too — the predicate is identical. Keep verse and element roll-ups
 * as separate calls; don't combine them.
 */

import { QUALITY } from './constants';

// ---- Core counting ----

/**
 * Counts mastery buckets for a flat array of items that each have a
 * `.quality` property (verses or elements from *_current_status).
 *
 * @param {Array} items — objects with at least { quality: string|null }
 * @returns {{ total: number, mastered: number, inProgress: number, notStarted: number }}
 */
export function masteryCounts(items) {
  if (!items || items.length === 0) {
    return { total: 0, mastered: 0, inProgress: 0, notStarted: 0 };
  }

  let mastered = 0;
  let inProgress = 0;
  let notStarted = 0;

  for (let i = 0; i < items.length; i++) {
    const q = items[i].quality;
    if (q === QUALITY.PERFECT) {
      mastered += 1;
    } else if (q) {
      // Any non-null, non-perfect quality: touched but not mastered.
      // Covers minor_mistakes, moderate_mistakes, still_learning.
      inProgress += 1;
    } else {
      notStarted += 1;
    }
  }

  return {
    total: items.length,
    mastered,
    inProgress,
    notStarted,
  };
}

// ---- Type-split counting (Torah / Haftarah) ----

/**
 * Counts mastery buckets split by reading type, plus a combined roll-up.
 *
 * Only call this where readingGroups are already fetched (student detail
 * view, family breakdown). The enrichment fetch stays combined-only.
 *
 * @param {Array} readingGroups — [{ reading_type, verses: [...] }, ...]
 * @returns {{
 *   torah:    { total, mastered, inProgress, notStarted },
 *   haftarah: { total, mastered, inProgress, notStarted },
 *   combined: { total, mastered, inProgress, notStarted },
 * }}
 */
export function masteryCountsByType(readingGroups) {
  const torah = { total: 0, mastered: 0, inProgress: 0, notStarted: 0 };
  const haftarah = { total: 0, mastered: 0, inProgress: 0, notStarted: 0 };

  (readingGroups || []).forEach((rg) => {
    const counts = masteryCounts(rg.verses);
    const bucket = rg.reading_type === 'torah' ? torah : haftarah;
    bucket.total += counts.total;
    bucket.mastered += counts.mastered;
    bucket.inProgress += counts.inProgress;
    bucket.notStarted += counts.notStarted;
  });

  return {
    torah,
    haftarah,
    combined: {
      total: torah.total + haftarah.total,
      mastered: torah.mastered + haftarah.mastered,
      inProgress: torah.inProgress + haftarah.inProgress,
      notStarted: torah.notStarted + haftarah.notStarted,
    },
  };
}

// ---- Percentage ----

/**
 * The single rounding rule for mastery percentage.
 * Every surface calls this — no per-screen drift.
 *
 * @param {number} mastered
 * @param {number} total
 * @returns {number} Integer 0-100
 */
export function masteryPercent(mastered, total) {
  if (!total || total === 0) return 0;
  return Math.round((mastered / total) * 100);
}

// ---- Display formatting ----

/**
 * Shared formatter for the mastery summary string.
 *
 * For verses: "N learned with trope · M in progress"
 * For elements: "N learned · M in progress"
 *
 * Used by every surface that shows mastery counts: admin table, tutor
 * cards, alert chips, family per-reading lines. Guarantees cross-role
 * parity — the same counts produce the same string everywhere.
 *
 * When inProgress is 0, omits the in-progress segment entirely to
 * avoid "2 learned with trope · 0 in progress" noise.
 *
 * When total is 0, returns a fallback string.
 *
 * @param {{ total: number, mastered: number, inProgress: number }} counts
 * @param {Object} [opts]
 * @param {string} [opts.emptyLabel='No verses assigned'] — shown when total is 0
 * @param {'verse'|'element'} [opts.itemType='verse'] — controls "learned with trope" vs "learned"
 * @returns {string}
 */
export function formatMasterySummary(counts, opts = {}) {
  const { emptyLabel = 'No verses assigned', itemType = 'verse' } = opts;

  if (!counts || counts.total === 0) {
    return emptyLabel;
  }

  const masteredLabel = itemType === 'element'
    ? `${counts.mastered} learned`
    : `${counts.mastered} learned with trope`;

  const parts = [masteredLabel];

  if (counts.inProgress > 0) {
    parts.push(`${counts.inProgress} in progress`);
  }

  return parts.join(' \u00B7 ');
}
