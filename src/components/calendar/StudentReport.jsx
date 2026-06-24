import {
  MILESTONE_STAGES,
  milestoneForReadiness,
  QUALITY_LABELS_ENCOURAGEMENT,
} from '../../utils/constants';
import { tutorName } from '../../utils/people';

/**
 * StudentReport — family-ready progress report for a single student.
 *
 * Written in the family-facing voice: warm, encouraging, no pace words
 * (behind/critical/ahead), no internal emails, pronoun-free.
 * Prints cleanly as a single page via window.print().
 */
export default function StudentReport({
  student,
  meta,
  cohort,
  onBack,
  onPrint,
}) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const firstName = student.first_name || '';
  const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim();
  const hebrewName = student.hebrew_name || null;

  // Mitzvah date
  const mitzvahDate = student.mitzvah_date
    ? formatMitzvahDate(student.mitzvah_date)
    : null;
  const daysToMitzvah = student.mitzvah_date
    ? daysUntil(student.mitzvah_date)
    : null;

  // Readiness
  const masteryPct = meta.masteryPct || 0;
  const stage = milestoneForReadiness(masteryPct);

  // Reading info
  const reading = meta.primaryReading;
  const portionName = reading?.portion_name || null;
  const portionHe = reading?.portion_name_hebrew || null;
  const reference = reading?.reference || null;

  // Verse / element counts
  const totalVerses = meta.totalVerses || 0;
  const masteredVerses = meta.masteredVerses || 0;
  const totalElems = meta.totalElems || 0;
  const masteredElems = meta.masteredElems || 0;
  const torahCounts = meta.torahCounts || null;
  const haftarahCounts = meta.haftarahCounts || null;

  // Tutor (display name only, never email)
  const tName = tutorName(student.tutor, null);

  // Reading breakdown (family-facing, pronoun-free)
  const readingLines = buildReadingBreakdown({
    firstName,
    totalVerses,
    masteredVerses,
    totalElems,
    masteredElems,
    masteryPct,
    torahCounts,
    haftarahCounts,
  });

  return (
    <div className="cc-report-page cc-student-report-page">
      {/* Screen-only toolbar */}
      <div className="cc-report-toolbar no-print">
        <button type="button" className="btn-ghost" onClick={onBack}>
          {'\u2190'} Back
        </button>
        <button type="button" className="btn-primary" onClick={onPrint}>
          <PrintIcon /> Print / Save as PDF
        </button>
      </div>

      {/* Print content */}
      <div className="cc-report cc-student-report">
        {/* Header */}
        <header className="cc-report-header">
          <div className="cc-report-lockup">
            <span className="cc-report-logo">MyMadrich</span>
            <span className="cc-report-sep">{'\u00B7'}</span>
            <span className="cc-report-org">Chizuk Amuno Congregation</span>
          </div>
          <div className="cc-report-date">Prepared {dateStr}</div>
        </header>

        {/* Student identity */}
        <div className="sr-identity">
          <h1 className="sr-name">{fullName}</h1>
          {hebrewName && (
            <p className="sr-name-he" dir="rtl" lang="he">{hebrewName}</p>
          )}
        </div>

        {/* Bimah date + parashah */}
        {mitzvahDate && (
          <div className="sr-bimah-block">
            <div className="sr-bimah-date">{mitzvahDate}</div>
            {portionName && (
              <div className="sr-bimah-parashah">
                Parashat {portionName}
                {portionHe && (
                  <span className="sr-bimah-he" dir="rtl" lang="he">
                    {' '}{portionHe}
                  </span>
                )}
                {reference && (
                  <span className="sr-bimah-ref"> {'\u00B7'} {reference}</span>
                )}
              </div>
            )}
            {daysToMitzvah !== null && daysToMitzvah > 0 && (
              <div className="sr-bimah-countdown">
                {daysToMitzvah} day{daysToMitzvah !== 1 ? 's' : ''} to the bimah
              </div>
            )}
          </div>
        )}

        {/* Milestone stage */}
        <section className="sr-section">
          <h2 className="sr-h2">Current stage</h2>
          <div className="sr-stage-card">
            <div className="sr-stage-flame" aria-hidden="true">
              {stage.key === 'hanachah' ? '\u25CB' : '\u2605'}
            </div>
            <div className="sr-stage-body">
              <div className="sr-stage-en">{stage.en}</div>
              <div className="sr-stage-he" dir="rtl" lang="he">{stage.he}</div>
              <div className="sr-stage-translit">{stage.translit}</div>
              <div className="sr-stage-blurb">{stage.blurb}</div>
            </div>
            <div className="sr-stage-pct">{masteryPct}%</div>
          </div>
        </section>

        {/* Reading progress (family-facing) */}
        <section className="sr-section">
          <h2 className="sr-h2">Reading progress</h2>
          {readingLines.map((line, i) => (
            <p key={i} className="sr-reading-line">{line}</p>
          ))}
        </section>

        {/* The menorah journey (stages overview) */}
        <section className="sr-section">
          <h2 className="sr-h2">The journey</h2>
          <div className="sr-journey-stages">
            {MILESTONE_STAGES.slice(1).map((s) => {
              const isDone = masteryPct >= s.min && s.key !== stage.key && masteryPct > s.max;
              const isCurrent = s.key === stage.key;
              return (
                <div
                  key={s.key}
                  className={
                    'sr-journey-rung'
                    + (isDone ? ' sr-rung-done' : '')
                    + (isCurrent ? ' sr-rung-now' : '')
                  }
                >
                  <span className="sr-rung-flame" aria-hidden="true">
                    {isDone ? '\u2713' : isCurrent ? '\u2605' : ''}
                  </span>
                  <span className="sr-rung-en">{s.en}</span>
                  <span className="sr-rung-band">
                    {s.min === s.max ? `${s.min}%` : `${s.min}\u2013${s.max}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Journey highlights */}
        <section className="sr-section">
          <h2 className="sr-h2">Highlights</h2>
          <div className="sr-highlights">
            {tName && (
              <div className="sr-highlight">
                <span className="sr-hl-label">Tutor</span>
                <span className="sr-hl-value">{tName}</span>
              </div>
            )}
            {meta.sessionCount > 0 && (
              <div className="sr-highlight">
                <span className="sr-hl-label">Sessions completed</span>
                <span className="sr-hl-value">{meta.sessionCount}</span>
              </div>
            )}
            {meta.firstSessionDate && (
              <div className="sr-highlight">
                <span className="sr-hl-label">First session</span>
                <span className="sr-hl-value">
                  {new Date(meta.firstSessionDate + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            )}
            {cohort && (
              <div className="sr-highlight">
                <span className="sr-hl-label">Cohort</span>
                <span className="sr-hl-value">{cohort.name}</span>
              </div>
            )}
          </div>
        </section>

        {/* Note */}
        <div className="sr-note">
          <span>
            Hebrew stage names and transliterations are pending rabbinic review
          </span>
        </div>

        {/* Footer */}
        <footer className="cc-report-footer">
          <p>MyMadrich {'\u00B7'} Chizuk Amuno Congregation {'\u00B7'} Prepared for the family</p>
        </footer>
      </div>
    </div>
  );
}


/* ---- Helpers (family-facing, pronoun-free) ---- */

function buildReadingBreakdown({ firstName, totalVerses, masteredVerses, totalElems, masteredElems, masteryPct, torahCounts, haftarahCounts }) {
  const lines = [];

  if (totalVerses > 0) {
    // Type-split lines (when available from calendar meta)
    const hasTorah = torahCounts && torahCounts.total > 0;
    const hasHaftarah = haftarahCounts && haftarahCounts.total > 0;

    if (hasTorah || hasHaftarah) {
      if (hasTorah) {
        const torahPct = Math.round((torahCounts.mastered / torahCounts.total) * 100);
        lines.push(
          `Torah: ${torahCounts.mastered} of ${torahCounts.total} verses learned with trope (${torahPct}%).`
        );
      }
      if (hasHaftarah) {
        const haftarahPct = Math.round((haftarahCounts.mastered / haftarahCounts.total) * 100);
        lines.push(
          `Haftarah: ${haftarahCounts.mastered} of ${haftarahCounts.total} verses learned with trope (${haftarahPct}%).`
        );
      }
      lines.push(
        `Overall readiness: ${masteryPct}%.`
      );
    } else {
      // Fallback: combined line (no type-split data available)
      lines.push(
        `${masteredVerses} of ${totalVerses} verses learned with trope (${masteryPct}% overall readiness).`
      );
    }
  } else {
    lines.push('No verses have been assigned yet.');
  }

  if (totalElems > 0) {
    lines.push(
      `${masteredElems} of ${totalElems} service elements learned.`
    );
  }

  if (masteryPct === 100) {
    lines.push(`${firstName} is fully prepared for the bimah.`);
  } else if (masteryPct >= 80) {
    lines.push(`${firstName} is nearly ready, with final polish in progress.`);
  } else if (masteryPct >= 50) {
    lines.push(`${firstName} has passed the halfway mark and the readings are taking shape.`);
  } else if (masteryPct >= 20) {
    lines.push(`The first verses are learned with trope and ${firstName} is building momentum.`);
  } else if (totalVerses > 0) {
    lines.push(`${firstName} is just getting started on the journey.`);
  }

  return lines;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function formatMitzvahDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const dayName = d.getDay() === 6
    ? 'Shabbat'
    : d.toLocaleDateString('en-US', { weekday: 'long' });
  const rest = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return `${dayName}, ${rest}`;
}

function PrintIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ marginRight: 6, verticalAlign: -2 }}
    >
      <polyline points="6 9 6 2 14 2 14 9" />
      <path d="M6 14H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2" />
      <rect x="6" y="12" width="8" height="6" />
    </svg>
  );
}
