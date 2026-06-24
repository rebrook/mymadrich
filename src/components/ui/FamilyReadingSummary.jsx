/**
 * FamilyReadingSummary — plain-language reading progress for families.
 *
 * Replaces the per-verse grid with a format families can read at a glance:
 * a headline sentence, a warm journey-progress sentence, condensed per-reading
 * lines (aliyot grouped into a single Torah/Haftarah row), and three
 * labeled fill bars.
 *
 * No grid, no legend, no system to learn.
 *
 * Colorblind-safe: bar length + text labels + icons (check / dot / circle).
 * Never hue alone.
 */

import { masteryCounts, formatMasterySummary } from '../../utils/mastery';

/**
 * @param {Object}   props
 * @param {string}   props.studentName   — first name only
 * @param {Array}    props.readingGroups — { id, reading_type, portion_name, verses: [...] }
 * @param {string}   props.className
 */
export default function FamilyReadingSummary({
  studentName,
  readingGroups,
  className = '',
}) {
  // Compute counts across all readings via mastery module (single source of truth)
  let totalVerses = 0;
  let masteredVerses = 0;
  let inProgressVerses = 0;

  // Group readings by type + portion_name to condense aliyot
  const readingMap = new Map();

  (readingGroups || []).forEach((rg) => {
    const counts = masteryCounts(rg.verses);

    totalVerses += counts.total;
    masteredVerses += counts.mastered;
    inProgressVerses += counts.inProgress;

    if (counts.total > 0) {
      const typeLabel =
        rg.reading_type === 'torah' ? 'Torah' : 'Haftarah';
      const name = rg.portion_name || typeLabel;
      const groupKey = `${typeLabel}-${name}`;

      if (readingMap.has(groupKey)) {
        const existing = readingMap.get(groupKey);
        existing.mastered += counts.mastered;
        existing.inProgress += counts.inProgress;
        existing.total += counts.total;
      } else {
        readingMap.set(groupKey, { typeLabel, name, mastered: counts.mastered, inProgress: counts.inProgress, total: counts.total });
      }
    }
  });

  const condensedLines = Array.from(readingMap.values());
  const notStartedVerses = totalVerses - masteredVerses - inProgressVerses;
  const masteredPct =
    totalVerses > 0
      ? Math.round((masteredVerses / totalVerses) * 100)
      : 0;
  const inProgressPct =
    totalVerses > 0
      ? Math.round((inProgressVerses / totalVerses) * 100)
      : 0;
  const notStartedPct =
    totalVerses > 0
      ? Math.round((notStartedVerses / totalVerses) * 100)
      : 0;

  if (totalVerses === 0) {
    return (
      <div className={`family-summary ${className}`}>
        <p className="family-summary-empty">
          No readings assigned yet. Your tutor will set these up.
        </p>
      </div>
    );
  }

  return (
    <div className={`family-summary ${className}`}>
      {/* Headline: name-first, uses mastery summary */}
      <div className="family-summary-headline">
        {studentName} has learned {masteredVerses} of {totalVerses} verses with trope.
      </div>

      {/* Journey sentence: warm, proportional framing */}
      <div className="family-summary-sentence">
        {buildJourneySentence(masteredPct, inProgressVerses, notStartedVerses)}
      </div>

      {/* Condensed per-reading lines (aliyot grouped) — "N learned with trope · M in progress" */}
      <div className="family-summary-readings">
        {condensedLines.map((rl) => (
          <div
            key={`${rl.typeLabel}-${rl.name}`}
            className="family-summary-reading"
          >
            <span>
              <strong>{rl.typeLabel}</strong> {'\u00B7'} {rl.name}
            </span>
            <span>{formatMasterySummary(rl)}</span>
          </div>
        ))}
      </div>

      {/* Three labeled fill bars */}
      <div className="family-summary-bars">
        <FamilyBar
          icon={'\u2713'}
          iconClass="family-bar-icon-mastered"
          label="Learned with Trope"
          count={masteredVerses}
          pct={masteredPct}
          fillClass="family-bar-fill-mastered"
        />
        <FamilyBar
          icon={'\u00B7'}
          iconClass="family-bar-icon-progress"
          label="In progress"
          count={inProgressVerses}
          pct={inProgressPct}
          fillClass="family-bar-fill-progress"
        />
        <FamilyBar
          icon={'\u25CB'}
          iconClass="family-bar-icon-notyet"
          label="Not yet started"
          count={notStartedVerses}
          pct={notStartedPct}
          fillClass="family-bar-fill-notyet"
        />
      </div>
    </div>
  );
}

/* ---- Internal: journey-progress sentence ---- */

function buildJourneySentence(masteredPct, inProgressCount, notStartedCount) {
  // Proportional framing
  let fraction;
  if (masteredPct >= 100) {
    return 'Every verse learned with trope. Ready for the bimah!';
  } else if (masteredPct >= 90) {
    fraction = 'Almost there';
  } else if (masteredPct >= 72) {
    fraction = 'About three-quarters of the way to the bimah';
  } else if (masteredPct >= 60) {
    fraction = 'Almost two-thirds of the way to the bimah';
  } else if (masteredPct >= 45) {
    fraction = 'About halfway to the bimah';
  } else if (masteredPct >= 30) {
    fraction = 'About a third of the way to the bimah';
  } else if (masteredPct >= 20) {
    fraction = 'About a quarter of the way to the bimah';
  } else if (masteredPct > 0) {
    fraction = 'Getting started on the journey to the bimah';
  } else {
    fraction = 'Just getting started on the journey to the bimah';
  }

  // Build the tail: "X verses are nearly ready and Y are still to come."
  const parts = [];
  if (inProgressCount > 0) {
    parts.push(`${inProgressCount} ${inProgressCount === 1 ? 'verse is' : 'verses are'} nearly ready`);
  }
  if (notStartedCount > 0) {
    parts.push(`${notStartedCount} ${notStartedCount === 1 ? 'is' : 'are'} still to come`);
  }

  if (parts.length > 0) {
    return `${fraction}: ${parts.join(' and ')}.`;
  }
  return `${fraction}.`;
}

/* ---- Internal: single bar row ---- */

function FamilyBar({ icon, iconClass, label, count, pct, fillClass }) {
  return (
    <div className="family-bar">
      <div className="family-bar-top">
        <span className="family-bar-label">
          <span
            className={`family-bar-icon ${iconClass}`}
            aria-hidden="true"
          >
            {icon}
          </span>
          {label}
        </span>
        <span className="family-bar-value">
          {count} {count === 1 ? 'verse' : 'verses'}
        </span>
      </div>
      <div className="family-bar-track">
        <span
          className={`family-bar-fill ${fillClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
