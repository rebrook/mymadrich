/**
 * MyMadrich shared constants
 *
 * Single source of truth for enums, labels, and color mappings
 * used across the application.
 */

// ---- User Roles ----

export const ROLES = {
  ADMIN: 'admin',
  TUTOR: 'tutor',
  STUDENT: 'student',
  PARENT: 'parent',
};

export const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.TUTOR]: 'Tutor',
  [ROLES.STUDENT]: 'Student',
  [ROLES.PARENT]: 'Parent / Guardian',
};

// ---- Quality Ratings ----

export const QUALITY = {
  PERFECT: 'perfect',
  MINOR_MISTAKES: 'minor_mistakes',
  MODERATE_MISTAKES: 'moderate_mistakes',
  STILL_LEARNING: 'still_learning',
};

export const QUALITY_LABELS = {
  [QUALITY.PERFECT]: 'Learned with Trope',
  [QUALITY.MINOR_MISTAKES]: '1\u20132 mistakes',
  [QUALITY.MODERATE_MISTAKES]: '3\u20135 mistakes',
  [QUALITY.STILL_LEARNING]: 'Still learning',
};

// ---- Quality Labels: Role-Aware (Decision 3) ----

/** Precision labels for admin and tutor views */
export const QUALITY_LABELS_PRECISION = {
  [QUALITY.PERFECT]: 'Learned with Trope',
  [QUALITY.MINOR_MISTAKES]: '1\u20132 mistakes',
  [QUALITY.MODERATE_MISTAKES]: '3\u20135 mistakes',
  [QUALITY.STILL_LEARNING]: 'Still learning',
};

/** Encouragement labels for student and parent views */
export const QUALITY_LABELS_ENCOURAGEMENT = {
  [QUALITY.PERFECT]: 'Learned with Trope',
  [QUALITY.MINOR_MISTAKES]: 'Almost there',
  [QUALITY.MODERATE_MISTAKES]: 'Getting there',
  [QUALITY.STILL_LEARNING]: 'Still learning',
};

/** Shared labels (all roles) */
export const QUALITY_LABEL_NOT_STARTED = 'Not started';
export const QUALITY_LABEL_TORAH_TRANSFER = 'Transferring to Torah side';
export const QUALITY_LABEL_TORAH_MASTERY = 'Torah-side mastery';

// ---- Quality Labels: Element-Specific ----
//
// Service elements (blessings, prayers, responsive readings) share the
// same quality enum as verses, but "trope" is a cantillation concept
// that doesn't apply to them. Element labels use "Learned" instead of
// "Learned with Trope" at the perfect level. Levels 1-3 are identical.

/** Precision labels for admin and tutor views (elements) */
export const QUALITY_LABELS_ELEMENT_PRECISION = {
  [QUALITY.PERFECT]: 'Learned',
  [QUALITY.MINOR_MISTAKES]: '1\u20132 mistakes',
  [QUALITY.MODERATE_MISTAKES]: '3\u20135 mistakes',
  [QUALITY.STILL_LEARNING]: 'Still learning',
};

/** Encouragement labels for student and parent views (elements) */
export const QUALITY_LABELS_ELEMENT_ENCOURAGEMENT = {
  [QUALITY.PERFECT]: 'Learned',
  [QUALITY.MINOR_MISTAKES]: 'Almost there',
  [QUALITY.MODERATE_MISTAKES]: 'Getting there',
  [QUALITY.STILL_LEARNING]: 'Still learning',
};

/**
 * Returns the quality label set appropriate for the viewer's role and item type.
 *
 * @param {'admin'|'tutor'|'student'|'parent'} role
 * @param {'verse'|'element'} [itemType='verse'] — verse labels use "Learned with Trope";
 *   element labels use "Learned" (trope is a cantillation concept, not applicable to
 *   blessings, prayers, or service parts).
 * @returns {Object} Label map keyed by QUALITY enum values
 */
export function getQualityLabels(role, itemType = 'verse') {
  if (itemType === 'element') {
    if (role === ROLES.STUDENT || role === ROLES.PARENT) {
      return QUALITY_LABELS_ELEMENT_ENCOURAGEMENT;
    }
    return QUALITY_LABELS_ELEMENT_PRECISION;
  }
  if (role === ROLES.STUDENT || role === ROLES.PARENT) {
    return QUALITY_LABELS_ENCOURAGEMENT;
  }
  return QUALITY_LABELS_PRECISION;
}

// Color mapping for the progress bar and status dots.
// Gray (not started) is handled in the component when no rating exists.
export const QUALITY_COLORS = {
  [QUALITY.STILL_LEARNING]: 'var(--color-orange)',
  [QUALITY.MODERATE_MISTAKES]: 'var(--color-yellow)',
  [QUALITY.MINOR_MISTAKES]: 'var(--color-green-yellow)',
  [QUALITY.PERFECT]: 'var(--color-green)',
};

// Gold is a special case: perfect + torah_side on a Torah reading.
export const COLOR_GOLD = 'var(--color-gold)';
export const COLOR_GOLD_HALF = 'var(--color-gold-half)';
export const COLOR_GRAY = 'var(--color-gray)';

// ---- Verse Status ----

export const VERSE_STATUS = {
  REVIEW: 'review',
  NEW: 'new',
  TORAH_SIDE_TRANSFER: 'torah_side_transfer',
  TORAH_SIDE: 'torah_side',
};

export const VERSE_STATUS_LABELS = {
  [VERSE_STATUS.REVIEW]: 'Review',
  [VERSE_STATUS.NEW]: 'New',
  [VERSE_STATUS.TORAH_SIDE_TRANSFER]: 'Transferring to Torah side',
  [VERSE_STATUS.TORAH_SIDE]: 'Learning on Torah side',
};

// ---- Reading Types ----

export const READING_TYPE = {
  TORAH: 'torah',
  HAFTARAH: 'haftarah',
};

// ---- Student Status ----

export const STUDENT_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  DEFERRED: 'deferred',
  WITHDRAWN: 'withdrawn',
  ARCHIVED: 'archived',
};

export const STUDENT_STATUS_LABELS = {
  [STUDENT_STATUS.ACTIVE]: 'Active',
  [STUDENT_STATUS.COMPLETED]: 'Completed',
  [STUDENT_STATUS.DEFERRED]: 'Deferred',
  [STUDENT_STATUS.WITHDRAWN]: 'Withdrawn',
  [STUDENT_STATUS.ARCHIVED]: 'Archived',
};

// ---- Milestone Stages (Brand → Milestone Stages card) ----
//
// The named ceremonial stages tied to the menorah readiness motif.
// Six lit stages + one pre-start stage. Gold marks every stage but Hanachah.
//
// PENDING: Hebrew strings, transliterations, and band thresholds await
// rabbinic / Hebrew review before production.

export const MILESTONE_STAGES = [
  {
    key: 'hanachah',
    he: '\u05D4\u05B7\u05E0\u05B8\u05BC\u05D7\u05B8\u05D4',
    translit: 'Hanachah',
    en: 'Ready to begin',
    min: 0,
    max: 0,
    blurb: 'The menorah waits to be lit.',
  },
  {
    key: 'nitzotz',
    he: '\u05E0\u05B4\u05D9\u05E6\u05D5\u05B9\u05E5',
    translit: 'Nitzotz',
    en: 'First Spark',
    min: 1,
    max: 20,
    blurb: 'The first verses are kindled.',
  },
  {
    key: 'hadlakah',
    he: '\u05D4\u05B7\u05D3\u05B0\u05DC\u05B8\u05E7\u05B8\u05D4',
    translit: 'Hadlakah',
    en: 'The Kindling',
    min: 21,
    max: 40,
    blurb: 'The flame takes hold.',
  },
  {
    key: 'or_oleh',
    he: '\u05D0\u05D5\u05B9\u05E8 \u05E2\u05D5\u05B9\u05DC\u05B6\u05D4',
    translit: 'Or Oleh',
    en: 'Rising Light',
    min: 41,
    max: 60,
    blurb: 'Past the halfway mark.',
  },
  {
    key: 'or_malei',
    he: '\u05D0\u05D5\u05B9\u05E8 \u05DE\u05B8\u05DC\u05B5\u05D0',
    translit: 'Or Malei',
    en: 'Full Light',
    min: 61,
    max: 80,
    blurb: 'Most verses learned with trope.',
  },
  {
    key: 'karov',
    he: '\u05E7\u05B8\u05E8\u05D5\u05B9\u05D1',
    translit: 'Karov',
    en: 'Drawing Near',
    min: 81,
    max: 99,
    blurb: 'Nearly ready for the bimah.',
  },
  {
    key: 'mukhan',
    he: '\u05DE\u05D5\u05BC\u05DB\u05B8\u05DF',
    translit: 'Mukhan',
    en: 'Ready',
    min: 100,
    max: 100,
    blurb: 'The whole menorah is lit.',
  },
];

/**
 * Returns the milestone stage object for a given readiness percentage.
 *
 * @param {number} pct - Readiness percentage (0-100, integer).
 * @returns {Object} The matching stage from MILESTONE_STAGES.
 */
export function milestoneForReadiness(pct) {
  const p = Math.round(pct);
  if (p <= 0) return MILESTONE_STAGES[0];
  if (p >= 100) return MILESTONE_STAGES[6];
  for (let i = 1; i <= 5; i++) {
    if (p >= MILESTONE_STAGES[i].min && p <= MILESTONE_STAGES[i].max) {
      return MILESTONE_STAGES[i];
    }
  }
  return MILESTONE_STAGES[0];
}

// ---- D'var Torah Stage Tracker ----
//
// Tracks the *document* status of the student's d'var Torah.
// This is distinct from the dvar_torah_checkin benchmark meeting
// (sequence 5), which tracks a *meeting* with the Cantor where
// the student brings a draft. The two are parallel workstreams:
// the meeting can be scheduled/completed independently of the
// document stage.
//
// Stage order is fixed; staff can move forward or back freely.
// Family roles can read but not update.

export const DVAR_STAGE = {
  NOT_STARTED: 'not_started',
  DRAFT: 'draft',
  IN_REVISION: 'in_revision',
  FINAL_POLISH: 'final_polish',
  DELIVERED: 'delivered',
};

export const DVAR_STAGES = [
  {
    key: 'not_started',
    sequence: 1,
    label: 'Not started',
    familyLine: null, // suppress in family view until there's progress
  },
  {
    key: 'draft',
    sequence: 2,
    label: 'Draft',
    familyLine: '{name}\u2019s d\u2019var Torah is in the drafting stage.',
  },
  {
    key: 'in_revision',
    sequence: 3,
    label: 'In revision',
    familyLine: '{name}\u2019s d\u2019var Torah is being revised.',
  },
  {
    key: 'final_polish',
    sequence: 4,
    label: 'Final polish',
    familyLine: '{name}\u2019s d\u2019var Torah is getting its final polish.',
  },
  {
    key: 'delivered',
    sequence: 5,
    label: 'Delivered',
    familyLine: '{name}\u2019s d\u2019var Torah is written and ready.',
  },
];

/**
 * Look up a d'var Torah stage by its key.
 * @param {string} key - e.g. 'in_revision'
 * @returns {Object|undefined}
 */
export function getDvarStage(key) {
  return DVAR_STAGES.find((s) => s.key === key);
}

/**
 * Returns the family-facing line for a d'var Torah stage,
 * with the student's first name interpolated.
 * Returns null for 'not_started' (suppressed in family view).
 *
 * @param {string} stageKey - DVAR_STAGE value
 * @param {string} firstName - Student's first name
 * @returns {string|null}
 */
export function getDvarFamilyLine(stageKey, firstName) {
  const stage = getDvarStage(stageKey);
  if (!stage || !stage.familyLine) return null;
  return stage.familyLine.replace('{name}', firstName);
}

// ---- Benchmark Meeting Types (Cantor Lichterman sequence) ----
//
// Fixed set of meeting types anchored to the bimah date. Two categories:
// - clergy_session: Cantor + student (tutor sometimes invited)
// - family_meeting: Cantor/family + student, where service elements are decided
//
// Offsets are approximate suggestions; the coordinator sets the actual date.
// The sequence index (array position) is the canonical display order.

export const BENCHMARK_CATEGORY = {
  CLERGY_SESSION: 'clergy_session',
  FAMILY_MEETING: 'family_meeting',
};

export const BENCHMARK_CATEGORY_LABELS = {
  [BENCHMARK_CATEGORY.CLERGY_SESSION]: 'Clergy session',
  [BENCHMARK_CATEGORY.FAMILY_MEETING]: 'Family meeting',
};

export const BENCHMARK_STATUS = {
  PENDING: 'pending',
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const BENCHMARK_STATUS_LABELS = {
  [BENCHMARK_STATUS.PENDING]: 'Not yet scheduled',
  [BENCHMARK_STATUS.SCHEDULED]: 'Scheduled',
  [BENCHMARK_STATUS.COMPLETED]: 'Completed',
  [BENCHMARK_STATUS.CANCELLED]: 'Cancelled',
};

export const BENCHMARK_TYPES = [
  {
    key: 'progress_checkin',
    sequence: 1,
    label: 'Progress check-in',
    category: BENCHMARK_CATEGORY.CLERGY_SESSION,
    offsetMonths: 9,
    offsetWeeks: null,
    defaultDurationMin: 45,
    defaultAttendees: 'Cantor, student',
    familyBlurb: 'The Cantor reviews progress and sets the next learning target.',
    tutorInvited: false,
  },
  {
    key: 'learning_targets',
    sequence: 2,
    label: 'Learning-targets session',
    category: BENCHMARK_CATEGORY.CLERGY_SESSION,
    offsetMonths: 8,
    offsetWeeks: null,
    defaultDurationMin: 45,
    defaultAttendees: 'Cantor, student, tutor',
    familyBlurb: 'The Cantor, tutor, and student discuss and set learning targets together.',
    tutorInvited: true,
  },
  {
    key: 'family_service_planning',
    sequence: 3,
    label: 'Family service-planning meeting',
    category: BENCHMARK_CATEGORY.FAMILY_MEETING,
    offsetMonths: 6,
    offsetWeeks: null,
    defaultDurationMin: 60,
    defaultAttendees: 'Cantor, family, student',
    familyBlurb: 'Discuss who else reads Torah, service elements, and Acts of Hesed / Gemilut Hasadim. Your family may be connected with the Director to plan your contribution.',
    tutorInvited: false,
  },
  {
    key: 'tefillah_review',
    sequence: 4,
    label: 'Tefillah review',
    category: BENCHMARK_CATEGORY.CLERGY_SESSION,
    offsetMonths: 4,
    offsetWeeks: null,
    defaultDurationMin: 45,
    defaultAttendees: 'Cantor, student, tutor',
    familyBlurb: 'The Cantor reviews tefillah and begins additional prayers the student is ready to learn.',
    tutorInvited: true,
  },
  {
    key: 'dvar_torah_checkin',
    sequence: 5,
    label: 'Check-in + d\u2019var Torah draft',
    category: BENCHMARK_CATEGORY.CLERGY_SESSION,
    offsetMonths: 2,
    offsetWeeks: null,
    defaultDurationMin: 45,
    defaultAttendees: 'Cantor, student',
    familyBlurb: 'An on-track check with the Cantor. The student brings a draft of the d\u2019var Torah.',
    tutorInvited: false,
  },
  {
    key: 'final_cantor',
    sequence: 6,
    label: 'Final cantor session',
    category: BENCHMARK_CATEGORY.CLERGY_SESSION,
    offsetMonths: 1,
    offsetWeeks: null,
    defaultDurationMin: 45,
    defaultAttendees: 'Cantor, student',
    familyBlurb: 'The Cantor reviews all readings and the d\u2019var Torah, and suggests final polish.',
    tutorInvited: false,
  },
  {
    key: 'final_rehearsal',
    sequence: 7,
    label: 'Final rehearsal',
    category: BENCHMARK_CATEGORY.FAMILY_MEETING,
    offsetMonths: null,
    offsetWeeks: 1,
    defaultDurationMin: 60,
    defaultAttendees: 'Student, family',
    familyBlurb: 'On the bimah itself: aliyot and honors confirmed, logistics reviewed with the family.',
    tutorInvited: false,
  },
  {
    key: 'minyan_aliyah',
    sequence: 8,
    label: 'Minyan aliyah',
    category: BENCHMARK_CATEGORY.CLERGY_SESSION,
    offsetMonths: null,
    offsetWeeks: 1,
    defaultDurationMin: 30,
    defaultAttendees: 'Student (family welcome)',
    familyBlurb: 'Join a morning minyan and take an aliyah. Encouraged but not required; family is welcome.',
    tutorInvited: false,
  },
];

/**
 * Look up a benchmark type by its key.
 * @param {string} key - e.g. 'progress_checkin'
 * @returns {Object|undefined}
 */
export function getBenchmarkType(key) {
  return BENCHMARK_TYPES.find((t) => t.key === key);
}

/**
 * Compute a suggested date for a benchmark, given the bimah date.
 *
 * Final rehearsal suggests the Thursday before; minyan aliyah suggests
 * the Tuesday before (staggered so they don't stack on the same day).
 *
 * @param {Object} benchmarkType - Entry from BENCHMARK_TYPES
 * @param {string} mitzvahDateStr - ISO date string (YYYY-MM-DD)
 * @returns {Date|null}
 */
export function suggestBenchmarkDate(benchmarkType, mitzvahDateStr) {
  if (!mitzvahDateStr) return null;
  const mitzvahDate = new Date(mitzvahDateStr + 'T00:00:00');

  if (benchmarkType.offsetMonths !== null) {
    const suggested = new Date(mitzvahDate);
    suggested.setMonth(suggested.getMonth() - benchmarkType.offsetMonths);
    return suggested;
  }

  if (benchmarkType.offsetWeeks !== null) {
    // Week-before events: stagger rehearsal (Thursday) vs. minyan (Tuesday)
    if (benchmarkType.key === 'final_rehearsal') {
      // Thursday before the bimah
      const d = new Date(mitzvahDate);
      d.setDate(d.getDate() - (mitzvahDate.getDay() + 3) % 7 || 7);
      // If that lands on the bimah day itself, go back a week
      if (d >= mitzvahDate) d.setDate(d.getDate() - 7);
      return d;
    }
    if (benchmarkType.key === 'minyan_aliyah') {
      // Tuesday of the week before the bimah
      const d = new Date(mitzvahDate);
      d.setDate(d.getDate() - (mitzvahDate.getDay() + 5) % 7 || 7);
      if (d >= mitzvahDate) d.setDate(d.getDate() - 7);
      return d;
    }
    // Generic week offset fallback
    const d = new Date(mitzvahDate);
    d.setDate(d.getDate() - benchmarkType.offsetWeeks * 7);
    return d;
  }

  return null;
}
