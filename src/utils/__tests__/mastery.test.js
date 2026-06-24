/**
 * mastery.test.js — Unit tests for the single-source-of-truth mastery module.
 *
 * Coverage:
 *   - Strict mastered count (only 'perfect')
 *   - In-progress bucket (each quality level)
 *   - Not-started bucket (null/undefined quality)
 *   - Torah vs Haftarah split
 *   - Combined roll-up
 *   - Rounding rule (edge cases)
 *   - Cross-role parity (same object → same counts)
 *   - formatMasterySummary output
 *   - Empty / null / edge inputs
 */

import { describe, it, expect } from 'vitest';
import {
  masteryCounts,
  masteryCountsByType,
  masteryPercent,
  formatMasterySummary,
} from '../mastery';

// ---- Test data factories ----

function verse(quality) {
  return { quality: quality || null };
}

function readingGroup(type, verses) {
  return { reading_type: type, verses };
}

// ---- masteryCounts ----

describe('masteryCounts', () => {
  it('counts perfect as mastered', () => {
    const items = [verse('perfect'), verse('perfect'), verse('minor_mistakes')];
    const result = masteryCounts(items);
    expect(result.mastered).toBe(2);
  });

  it('counts minor_mistakes as in-progress', () => {
    const items = [verse('minor_mistakes')];
    const result = masteryCounts(items);
    expect(result.inProgress).toBe(1);
    expect(result.mastered).toBe(0);
  });

  it('counts moderate_mistakes as in-progress', () => {
    const items = [verse('moderate_mistakes')];
    const result = masteryCounts(items);
    expect(result.inProgress).toBe(1);
  });

  it('counts still_learning as in-progress', () => {
    const items = [verse('still_learning')];
    const result = masteryCounts(items);
    expect(result.inProgress).toBe(1);
  });

  it('counts null quality as not-started', () => {
    const items = [verse(null)];
    const result = masteryCounts(items);
    expect(result.notStarted).toBe(1);
    expect(result.mastered).toBe(0);
    expect(result.inProgress).toBe(0);
  });

  it('counts undefined quality as not-started', () => {
    const items = [{}]; // quality is undefined
    const result = masteryCounts(items);
    expect(result.notStarted).toBe(1);
  });

  it('returns correct total', () => {
    const items = [
      verse('perfect'),
      verse('minor_mistakes'),
      verse('moderate_mistakes'),
      verse('still_learning'),
      verse(null),
      verse(null),
    ];
    const result = masteryCounts(items);
    expect(result.total).toBe(6);
    expect(result.mastered).toBe(1);
    expect(result.inProgress).toBe(3);
    expect(result.notStarted).toBe(2);
    // Buckets sum to total
    expect(result.mastered + result.inProgress + result.notStarted).toBe(result.total);
  });

  it('returns zeros for empty array', () => {
    const result = masteryCounts([]);
    expect(result).toEqual({ total: 0, mastered: 0, inProgress: 0, notStarted: 0 });
  });

  it('returns zeros for null input', () => {
    const result = masteryCounts(null);
    expect(result).toEqual({ total: 0, mastered: 0, inProgress: 0, notStarted: 0 });
  });

  it('returns zeros for undefined input', () => {
    const result = masteryCounts(undefined);
    expect(result).toEqual({ total: 0, mastered: 0, inProgress: 0, notStarted: 0 });
  });

  it('treats Torah-side gold as mastered (quality is still perfect)', () => {
    // Gold is a render state: quality=perfect + status=torah_side + readingType=torah.
    // masteryCounts only looks at .quality, so gold counts as mastered.
    const items = [
      { quality: 'perfect', status: 'torah_side', readingType: 'torah' },
      { quality: 'perfect' },
    ];
    const result = masteryCounts(items);
    expect(result.mastered).toBe(2);
    expect(result.inProgress).toBe(0);
  });
});

// ---- masteryCountsByType ----

describe('masteryCountsByType', () => {
  it('splits Torah and Haftarah correctly', () => {
    const groups = [
      readingGroup('torah', [
        verse('perfect'),
        verse('perfect'),
        verse('minor_mistakes'),
        verse(null),
      ]),
      readingGroup('haftarah', [
        verse('still_learning'),
        verse('moderate_mistakes'),
        verse(null),
        verse(null),
        verse(null),
      ]),
    ];

    const result = masteryCountsByType(groups);

    expect(result.torah).toEqual({ total: 4, mastered: 2, inProgress: 1, notStarted: 1 });
    expect(result.haftarah).toEqual({ total: 5, mastered: 0, inProgress: 2, notStarted: 3 });
  });

  it('computes correct combined roll-up', () => {
    const groups = [
      readingGroup('torah', [verse('perfect'), verse('minor_mistakes')]),
      readingGroup('haftarah', [verse(null), verse('perfect')]),
    ];

    const result = masteryCountsByType(groups);

    expect(result.combined).toEqual({ total: 4, mastered: 2, inProgress: 1, notStarted: 1 });
    // Verify combined = torah + haftarah
    expect(result.combined.total).toBe(result.torah.total + result.haftarah.total);
    expect(result.combined.mastered).toBe(result.torah.mastered + result.haftarah.mastered);
    expect(result.combined.inProgress).toBe(result.torah.inProgress + result.haftarah.inProgress);
    expect(result.combined.notStarted).toBe(result.torah.notStarted + result.haftarah.notStarted);
  });

  it('handles Torah-only (no Haftarah)', () => {
    const groups = [
      readingGroup('torah', [verse('perfect'), verse('perfect')]),
    ];

    const result = masteryCountsByType(groups);

    expect(result.torah).toEqual({ total: 2, mastered: 2, inProgress: 0, notStarted: 0 });
    expect(result.haftarah).toEqual({ total: 0, mastered: 0, inProgress: 0, notStarted: 0 });
    expect(result.combined).toEqual({ total: 2, mastered: 2, inProgress: 0, notStarted: 0 });
  });

  it('handles multiple Torah aliyot (groups sum, not replace)', () => {
    const groups = [
      readingGroup('torah', [verse('perfect'), verse(null)]),
      readingGroup('torah', [verse('minor_mistakes'), verse('perfect')]),
      readingGroup('haftarah', [verse(null)]),
    ];

    const result = masteryCountsByType(groups);

    expect(result.torah).toEqual({ total: 4, mastered: 2, inProgress: 1, notStarted: 1 });
    expect(result.haftarah).toEqual({ total: 1, mastered: 0, inProgress: 0, notStarted: 1 });
  });

  it('returns zeros for null input', () => {
    const result = masteryCountsByType(null);
    expect(result.combined).toEqual({ total: 0, mastered: 0, inProgress: 0, notStarted: 0 });
  });

  it('returns zeros for empty array', () => {
    const result = masteryCountsByType([]);
    expect(result.combined).toEqual({ total: 0, mastered: 0, inProgress: 0, notStarted: 0 });
  });
});

// ---- masteryPercent ----

describe('masteryPercent', () => {
  it('rounds to nearest integer', () => {
    expect(masteryPercent(1, 3)).toBe(33);   // 33.33 → 33
    expect(masteryPercent(2, 3)).toBe(67);   // 66.67 → 67
    expect(masteryPercent(1, 6)).toBe(17);   // 16.67 → 17
    expect(masteryPercent(2, 12)).toBe(17);  // 16.67 → 17 — the "2/12" case from the audit
  });

  it('returns 0 for zero total', () => {
    expect(masteryPercent(0, 0)).toBe(0);
  });

  it('returns 0 for null total', () => {
    expect(masteryPercent(0, null)).toBe(0);
  });

  it('returns 0 for undefined total', () => {
    expect(masteryPercent(0, undefined)).toBe(0);
  });

  it('returns 100 for all mastered', () => {
    expect(masteryPercent(12, 12)).toBe(100);
  });

  it('returns 0 for none mastered', () => {
    expect(masteryPercent(0, 12)).toBe(0);
  });

  it('handles 50% exactly', () => {
    expect(masteryPercent(6, 12)).toBe(50);
  });
});

// ---- formatMasterySummary ----

describe('formatMasterySummary', () => {
  it('shows mastered and in-progress when both non-zero', () => {
    const counts = { total: 12, mastered: 2, inProgress: 4, notStarted: 6 };
    expect(formatMasterySummary(counts)).toBe('2 mastered \u00B7 4 in progress');
  });

  it('omits in-progress segment when zero', () => {
    const counts = { total: 7, mastered: 7, inProgress: 0, notStarted: 0 };
    expect(formatMasterySummary(counts)).toBe('7 mastered');
  });

  it('shows 0 mastered with in-progress (the Haftarah case)', () => {
    const counts = { total: 7, mastered: 0, inProgress: 4, notStarted: 3 };
    expect(formatMasterySummary(counts)).toBe('0 mastered \u00B7 4 in progress');
  });

  it('shows 0 mastered, 0 in-progress (all not started)', () => {
    const counts = { total: 7, mastered: 0, inProgress: 0, notStarted: 7 };
    expect(formatMasterySummary(counts)).toBe('0 mastered');
  });

  it('returns empty label when total is 0', () => {
    const counts = { total: 0, mastered: 0, inProgress: 0, notStarted: 0 };
    expect(formatMasterySummary(counts)).toBe('No verses assigned');
  });

  it('returns custom empty label', () => {
    const counts = { total: 0, mastered: 0, inProgress: 0, notStarted: 0 };
    expect(formatMasterySummary(counts, { emptyLabel: 'No readings' })).toBe('No readings');
  });

  it('returns empty label for null counts', () => {
    expect(formatMasterySummary(null)).toBe('No verses assigned');
  });
});

// ---- Cross-role parity ----

describe('cross-role parity', () => {
  it('same student data produces identical counts regardless of caller', () => {
    // Simulate a student with 12 verses: 2 perfect, 4 in-progress, 6 not started
    const verses = [
      verse('perfect'),
      verse('perfect'),
      verse('minor_mistakes'),
      verse('moderate_mistakes'),
      verse('still_learning'),
      verse('still_learning'),
      verse(null),
      verse(null),
      verse(null),
      verse(null),
      verse(null),
      verse(null),
    ];

    // "Admin" calls masteryCounts
    const adminResult = masteryCounts(verses);
    // "Tutor" calls masteryCounts
    const tutorResult = masteryCounts(verses);
    // "Parent" calls masteryCounts
    const parentResult = masteryCounts(verses);

    // All identical
    expect(adminResult).toEqual(tutorResult);
    expect(tutorResult).toEqual(parentResult);

    // And the percentage is the same too
    const adminPct = masteryPercent(adminResult.mastered, adminResult.total);
    const parentPct = masteryPercent(parentResult.mastered, parentResult.total);
    expect(adminPct).toBe(parentPct);
    expect(adminPct).toBe(17); // 2/12 = 16.67 → 17

    // And the formatted string is the same
    const adminStr = formatMasterySummary(adminResult);
    const parentStr = formatMasterySummary(parentResult);
    expect(adminStr).toBe(parentStr);
    expect(adminStr).toBe('2 mastered \u00B7 4 in progress');
  });

  it('same readingGroups produce identical type splits', () => {
    const groups = [
      readingGroup('torah', [verse('perfect'), verse('minor_mistakes'), verse(null)]),
      readingGroup('haftarah', [verse('still_learning'), verse(null), verse(null)]),
    ];

    // Two callers
    const resultA = masteryCountsByType(groups);
    const resultB = masteryCountsByType(groups);

    expect(resultA).toEqual(resultB);
    expect(resultA.torah).toEqual({ total: 3, mastered: 1, inProgress: 1, notStarted: 1 });
    expect(resultA.haftarah).toEqual({ total: 3, mastered: 0, inProgress: 1, notStarted: 2 });
  });
});
