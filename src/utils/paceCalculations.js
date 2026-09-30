/**
 * Pace calculation utility for MyMadrich suggested learning timeline.
 *
 * Pure functions — no side effects, no API calls.
 * All data is passed in from hooks/components that already fetch it.
 */

// ---- Status constants ----

export const PACE_STATUS = {
  AHEAD: 'ahead',
  ON_TRACK: 'on_track',
  BEHIND: 'behind',
  CRITICAL: 'critical',
  NOT_STARTED: 'not_started',
  COMPLETED: 'completed',
  PAST_DUE: 'past_due',
  NO_VERSES: 'no_verses',
  FAMILY_TUTORED: 'family_tutored',
};

export const PACE_LABELS = {
  [PACE_STATUS.AHEAD]: 'Ahead',
  [PACE_STATUS.ON_TRACK]: 'On Track',
  [PACE_STATUS.BEHIND]: 'Behind',
  [PACE_STATUS.CRITICAL]: 'Critical',
  [PACE_STATUS.NOT_STARTED]: 'Not Started',
  [PACE_STATUS.COMPLETED]: 'Completed',
  [PACE_STATUS.PAST_DUE]: 'Past Due',
  [PACE_STATUS.NO_VERSES]: 'No Verses',
  [PACE_STATUS.FAMILY_TUTORED]: 'Family-tutored',
};

export const PACE_COLORS = {
  [PACE_STATUS.AHEAD]: '#2563eb',
  [PACE_STATUS.ON_TRACK]: '#3d8b40',
  [PACE_STATUS.BEHIND]: '#c95d1e',
  [PACE_STATUS.CRITICAL]: '#c53030',
  [PACE_STATUS.NOT_STARTED]: '#6b7280',
  [PACE_STATUS.COMPLETED]: '#3d8b40',
  [PACE_STATUS.PAST_DUE]: '#c53030',
  [PACE_STATUS.NO_VERSES]: '#6b7280',
  [PACE_STATUS.FAMILY_TUTORED]: '#6b7280',
};

// ---- Thresholds ----

const AHEAD_THRESHOLD = 0.10;
const BEHIND_THRESHOLD = -0.10;
const CRITICAL_THRESHOLD = -0.25;

// ---- Helper functions ----

/**
 * Returns the number of weeks between two dates (fractional).
 */
function weeksBetween(startDate, endDate) {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return (end.getTime() - start.getTime()) / msPerWeek;
}

/**
 * Computes the target completion date for a student.
 *
 * Priority:
 *   1. student.target_completion_date (explicit override)
 *   2. student.mitzvah_date minus cohort.completion_buffer_weeks
 */
export function getTargetDate(student, cohort) {
  if (student.target_completion_date) {
    return new Date(student.target_completion_date + 'T00:00:00');
  }

  const mitzvahDate = new Date(student.mitzvah_date + 'T00:00:00');
  const bufferWeeks = cohort?.completion_buffer_weeks ?? 4;
  const target = new Date(mitzvahDate);
  target.setDate(target.getDate() - bufferWeeks * 7);
  return target;
}

/**
 * Determines the effective start date for pace calculation.
 *
 * Priority:
 *   1. Student's first session date (most accurate)
 *   2. Cohort start_date (fallback)
 *   3. Student created_at (last resort)
 */
export function getStartDate(student, cohort, firstSessionDate) {
  if (firstSessionDate) {
    return new Date(firstSessionDate + 'T00:00:00');
  }
  if (cohort?.start_date) {
    return new Date(cohort.start_date + 'T00:00:00');
  }
  return new Date(student.created_at);
}

/**
 * Gets the effective lessons-per-week for a student.
 * Student override takes priority over cohort default.
 */
export function getLessonsPerWeek(student, cohort) {
  return student.lessons_per_week ?? cohort?.default_lessons_per_week ?? 1;
}

// ---- Main calculation ----

/**
 * Calculates pace metrics for a single student.
 *
 * @param {Object} params
 * @param {Object} params.student - Student record
 * @param {Object} params.cohort - Cohort record
 * @param {number} params.masteredVerseCount - Verses with quality_rating = 'perfect'
 * @param {number} params.totalVerseCount - Total assigned verses
 * @param {string|null} params.firstSessionDate - ISO date string of earliest session, or null
 * @param {Date} [params.now] - Current date (injectable for testing)
 *
 * @returns {Object} Pace calculation result
 */
export function calculatePace({
  student,
  cohort,
  masteredVerseCount,
  totalVerseCount,
  firstSessionDate,
  now = new Date(),
}) {
  const targetDate = getTargetDate(student, cohort);
  const lessonsPerWeek = getLessonsPerWeek(student, cohort);

  // Family-tutored students are taught off-system, so sessions and progress
  // are not logged here and a pace cannot be calculated meaningfully.
  if (student?.family_tutored) {
    return {
      status: PACE_STATUS.FAMILY_TUTORED,
      masteredCount: masteredVerseCount || 0,
      totalCount: totalVerseCount || 0,
      masteryPct: 0,
      expectedPct: null,
      paceDelta: null,
      targetDate,
      projectedCompletionDate: null,
      lessonsPerWeek,
    };
  }

  // Edge case: no verses assigned
  if (!totalVerseCount || totalVerseCount === 0) {
    return {
      status: PACE_STATUS.NO_VERSES,
      masteredCount: 0,
      totalCount: 0,
      masteryPct: 0,
      expectedPct: 0,
      paceDelta: 0,
      targetDate,
      projectedCompletionDate: null,
      lessonsPerWeek,
    };
  }

  const masteryPct = masteredVerseCount / totalVerseCount;

  // Edge case: all verses mastered
  if (masteredVerseCount >= totalVerseCount) {
    return {
      status: PACE_STATUS.COMPLETED,
      masteredCount: masteredVerseCount,
      totalCount: totalVerseCount,
      masteryPct: 1,
      expectedPct: null,
      paceDelta: null,
      targetDate,
      projectedCompletionDate: null,
      lessonsPerWeek,
    };
  }

  // Edge case: no sessions yet
  if (!firstSessionDate) {
    const weeksUntilTarget = weeksBetween(now, targetDate);
    return {
      status: PACE_STATUS.NOT_STARTED,
      masteredCount: 0,
      totalCount: totalVerseCount,
      masteryPct: 0,
      expectedPct: 0,
      paceDelta: 0,
      targetDate,
      projectedCompletionDate: null,
      lessonsPerWeek,
      weeksRemaining: Math.max(0, Math.round(weeksUntilTarget * 10) / 10),
    };
  }

  const startDate = getStartDate(student, cohort, firstSessionDate);
  const totalWeeks = weeksBetween(startDate, targetDate);
  const weeksElapsed = weeksBetween(startDate, now);
  const weeksRemaining = weeksBetween(now, targetDate);

  // Edge case: target date is in the past
  if (weeksRemaining <= 0) {
    return {
      status: masteryPct >= 1 ? PACE_STATUS.COMPLETED : PACE_STATUS.PAST_DUE,
      masteredCount: masteredVerseCount,
      totalCount: totalVerseCount,
      masteryPct,
      expectedPct: 1,
      paceDelta: masteryPct - 1,
      targetDate,
      projectedCompletionDate: null,
      lessonsPerWeek,
      weeksRemaining: 0,
    };
  }

  // Edge case: totalWeeks is zero or negative
  if (totalWeeks <= 0) {
    return {
      status: masteryPct >= 1 ? PACE_STATUS.COMPLETED : PACE_STATUS.BEHIND,
      masteredCount: masteredVerseCount,
      totalCount: totalVerseCount,
      masteryPct,
      expectedPct: 1,
      paceDelta: masteryPct - 1,
      targetDate,
      projectedCompletionDate: null,
      lessonsPerWeek,
      weeksRemaining: Math.max(0, Math.round(weeksRemaining * 10) / 10),
    };
  }

  // Normal case: linear interpolation
  const expectedPct = Math.min(1, weeksElapsed / totalWeeks);
  const paceDelta = masteryPct - expectedPct;

  // Determine status from pace delta
  let status;
  if (paceDelta > AHEAD_THRESHOLD) {
    status = PACE_STATUS.AHEAD;
  } else if (paceDelta >= BEHIND_THRESHOLD) {
    status = PACE_STATUS.ON_TRACK;
  } else if (paceDelta >= CRITICAL_THRESHOLD) {
    status = PACE_STATUS.BEHIND;
  } else {
    status = PACE_STATUS.CRITICAL;
  }

  // Project completion date based on current rate
  let projectedCompletionDate = null;
  if (masteredVerseCount > 0 && weeksElapsed > 0) {
    const currentRate = masteredVerseCount / weeksElapsed;
    const remainingVerses = totalVerseCount - masteredVerseCount;
    const weeksToComplete = remainingVerses / currentRate;
    const projected = new Date(now);
    projected.setDate(projected.getDate() + Math.ceil(weeksToComplete * 7));
    projectedCompletionDate = projected;
  }

  return {
    status,
    masteredCount: masteredVerseCount,
    totalCount: totalVerseCount,
    masteryPct: Math.round(masteryPct * 1000) / 1000,
    expectedPct: Math.round(expectedPct * 1000) / 1000,
    paceDelta: Math.round(paceDelta * 1000) / 1000,
    targetDate,
    projectedCompletionDate,
    lessonsPerWeek,
    weeksRemaining: Math.round(weeksRemaining * 10) / 10,
  };
}

// ---- Service elements summary ----

/**
 * Computes a simple status summary for service elements.
 */
export function calculateElementsSummary(masteredElementCount, startedElementCount, totalElementCount) {
  if (!totalElementCount || totalElementCount === 0) {
    return {
      status: 'none',
      label: 'No Elements',
      masteredCount: 0,
      startedCount: 0,
      totalCount: 0,
    };
  }

  if (masteredElementCount >= totalElementCount) {
    return {
      status: 'complete',
      label: 'Elements Complete',
      masteredCount: masteredElementCount,
      startedCount: startedElementCount,
      totalCount: totalElementCount,
    };
  }

  if (startedElementCount > 0) {
    return {
      status: 'in_progress',
      label: `${masteredElementCount} of ${totalElementCount} elements learned`,
      masteredCount: masteredElementCount,
      startedCount: startedElementCount,
      totalCount: totalElementCount,
    };
  }

  return {
    status: 'not_started',
    label: 'Elements Not Started',
    masteredCount: 0,
    startedCount: 0,
    totalCount: totalElementCount,
  };
}

// ---- Formatting helpers ----

/**
 * Formats a fractional weeks-remaining value into natural phrasing.
 * Under 2 weeks: shows days ("4 days"), since nobody actually says
 * "0.5 weeks" or "1.3 weeks" out loud. 2 weeks or more: shows whole
 * weeks, rounded ("3 weeks"), since a decimal week count is equally
 * unnatural at longer distances.
 *
 * Returns just the quantity + unit (e.g. "4 days", "3 weeks") with no
 * "left"/"remaining"/"out" suffix — callers append whatever fits their
 * sentence.
 *
 * @param {number|null} weeksRemaining
 * @returns {string}
 */
export function formatWeeksRemaining(weeksRemaining) {
  if (weeksRemaining == null) return '';
  if (weeksRemaining <= 0) return 'due now';

  if (weeksRemaining < 2) {
    const days = Math.max(1, Math.round(weeksRemaining * 7));
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  const wholeWeeks = Math.round(weeksRemaining);
  return `${wholeWeeks} week${wholeWeeks === 1 ? '' : 's'}`;
}

/**
 * Formats a date as a short readable string (e.g., "Oct 15, 2026").
 */
export function formatTargetDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Returns a human-readable pace summary string.
 */
export function getPaceSummaryText(paceResult) {
  const { status, targetDate, projectedCompletionDate, masteredCount, totalCount } = paceResult;

  switch (status) {
    case PACE_STATUS.COMPLETED:
      return `All ${totalCount} verses learned with trope`;

    case PACE_STATUS.NOT_STARTED:
      return `${totalCount} verses assigned, no sessions yet`;

    case PACE_STATUS.NO_VERSES:
      return 'No verses assigned';

    case PACE_STATUS.FAMILY_TUTORED:
      return 'Taught by a family member. Pace is not tracked here.';

    case PACE_STATUS.PAST_DUE:
      return `${masteredCount} of ${totalCount} verses learned with trope. Target date has passed.`;

    case PACE_STATUS.AHEAD:
    case PACE_STATUS.ON_TRACK: {
      const targetStr = formatTargetDate(targetDate);
      return `On track to complete by ${targetStr}`;
    }

    case PACE_STATUS.BEHIND:
    case PACE_STATUS.CRITICAL: {
      if (projectedCompletionDate) {
        const projStr = formatTargetDate(projectedCompletionDate);
        return `${masteredCount} of ${totalCount} learned with trope. Projected completion: ${projStr}`;
      }
      return `${masteredCount} of ${totalCount} verses learned with trope. Behind pace.`;
    }

    default:
      return '';
  }
}

/**
 * Returns a human-readable rationale explaining WHY the pace status is what it is.
 * Intended for admin/tutor surfaces (tooltips, inline explanations).
 * Quotes only values already computed by calculatePace — no new math.
 *
 * @param {Object} paceResult - Return value from calculatePace()
 * @returns {string} One-liner explanation
 */
export function getPaceRationale(paceResult) {
  if (!paceResult) return '';

  const {
    status,
    masteredCount,
    totalCount,
    masteryPct,
    expectedPct,
    targetDate,
    projectedCompletionDate,
    weeksRemaining,
  } = paceResult;

  const targetStr = formatTargetDate(targetDate);
  const pctActual = Math.round((masteryPct ?? 0) * 100);
  const pctExpected = Math.round((expectedPct ?? 0) * 100);

  switch (status) {
    case PACE_STATUS.ON_TRACK:
      return `On track: ${masteredCount} of ${totalCount} learned with trope (${pctActual}%) against ${pctExpected}% expected. Target ${targetStr}, ${formatWeeksRemaining(weeksRemaining)} remaining.`;

    case PACE_STATUS.AHEAD:
      return `Ahead of schedule: ${masteredCount} of ${totalCount} learned with trope (${pctActual}%) vs. ${pctExpected}% expected. Well positioned for ${targetStr}.`;

    case PACE_STATUS.BEHIND: {
      const projStr = projectedCompletionDate ? formatTargetDate(projectedCompletionDate) : null;
      if (projStr) {
        const weeksLate = Math.round(weeksBetweenDates(targetDate, projectedCompletionDate));
        return `Behind pace: ${masteredCount} of ${totalCount} learned with trope (${pctActual}%) vs. ${pctExpected}% expected. Projected completion ${projStr}, about ${weeksLate} weeks after the ${targetStr} target.`;
      }
      return `Behind pace: ${masteredCount} of ${totalCount} learned with trope (${pctActual}%) vs. ${pctExpected}% expected. Target ${targetStr}.`;
    }

    case PACE_STATUS.CRITICAL: {
      const projStr = projectedCompletionDate ? formatTargetDate(projectedCompletionDate) : null;
      if (projStr) {
        return `Critical: ${masteredCount} of ${totalCount} learned with trope (${pctActual}%) vs. ${pctExpected}% expected. At current pace, projected completion ${projStr}; target was ${targetStr}.`;
      }
      return `Critical: ${masteredCount} of ${totalCount} learned with trope (${pctActual}%) vs. ${pctExpected}% expected. At current pace, won't finish by ${targetStr}.`;
    }

    case PACE_STATUS.NOT_STARTED:
      return `Not started: ${totalCount} verses assigned, no sessions yet. Target ${targetStr} is ${formatWeeksRemaining(weeksRemaining)} out.`;

    case PACE_STATUS.COMPLETED:
      return `All ${totalCount} verses learned with trope.`;

    case PACE_STATUS.PAST_DUE:
      return `Past due: ${masteredCount} of ${totalCount} learned with trope. Target date ${targetStr} has passed.`;

    case PACE_STATUS.NO_VERSES:
      return 'No verses assigned yet.';

    case PACE_STATUS.FAMILY_TUTORED:
      return "Family-tutored: progress isn't logged in MyMadrich, so pace isn't calculated.";

    default:
      return '';
  }
}

/**
 * Weeks between two Date objects (for rationale display).
 * Positive if end is after start. Exported only for internal use by getPaceRationale.
 */
function weeksBetweenDates(start, end) {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  return Math.abs(e.getTime() - s.getTime()) / msPerWeek;
}
