import { useEffect, useState } from 'react';
import emblemGold from '../../assets/chizuk-emblem-gold.png';

/**
 * CohortSummaryHero — deep-purple ceremonial panel showing aggregate
 * cohort readiness. Features an SVG readiness ring (gold stroke),
 * cohort name, student count + avg days to mitzvah, and pace count pills.
 *
 * Renders on the admin Dashboard landing, scoped to the selected cohort.
 */

const PACE_PILLS = [
  { key: 'on_track', label: 'On track', color: 'var(--color-pace-on-track)' },
  { key: 'behind', label: 'Behind', color: 'var(--color-pace-behind)' },
  { key: 'critical', label: 'Critical', color: 'var(--color-pace-critical)' },
  { key: 'completed', label: 'Completed', color: 'var(--color-accent)' },
  { key: 'not_started', label: 'Not started', color: 'rgba(255,255,255,0.35)', title: 'No readings assigned yet or no pace data' },
  { key: 'family_tutored', label: 'Family-tutored', color: 'rgba(255,255,255,0.7)', title: 'Taught by a family member; pace is not tracked here' },
];

export default function CohortSummaryHero({
  cohortName = '',
  studentCount = 0,
  avgDaysToMitzvah = null,
  readinessPct = 0,
  paceCounts = {},
}) {
  // Animate ring fill (respects reduced motion)
  const [fill, setFill] = useState(0);
  const target = Math.max(0, Math.min(100, readinessPct));

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setFill(target);
      return undefined;
    }

    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setFill(target))
    );
    return () => cancelAnimationFrame(id);
  }, [target]);

  // SVG ring geometry
  const RADIUS = 65;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const offset = CIRCUMFERENCE * (1 - fill / 100);

  // Build sub-line
  const subParts = [];
  if (studentCount > 0) subParts.push(`${studentCount} student${studentCount !== 1 ? 's' : ''}`);
  if (avgDaysToMitzvah !== null) subParts.push(`avg. ${avgDaysToMitzvah} days to mitzvah`);
  const subLine = subParts.join(' \u00B7 ');

  return (
    <section className="cohort-summary-hero" aria-label={`Cohort readiness: ${Math.round(target)}%`}>
      {/* Faint emblem watermark */}
      <img
        className="cohort-summary-emblem"
        src={emblemGold}
        alt=""
        aria-hidden="true"
      />

      {/* SVG readiness ring */}
      <div className="cs-ring" aria-hidden="true">
        <svg width="150" height="150" viewBox="0 0 150 150">
          <circle
            cx="75"
            cy="75"
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="11"
          />
          <circle
            cx="75"
            cy="75"
            r={RADIUS}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="cs-ring-stroke"
          />
        </svg>
        <div className="cs-ring-center">
          <div className="cs-ring-num">{Math.round(target)}%</div>
          <div className="cs-ring-label">cohort ready</div>
        </div>
      </div>

      {/* Info section */}
      <div className="cs-info">
        <div className="cs-title">{cohortName}</div>
        {subLine && <div className="cs-sub">{subLine}</div>}

        <div className="cs-pills">
          {PACE_PILLS.map((pill) => {
            const count = paceCounts[pill.key] || 0;
            return (
              <div
                key={pill.key}
                className="cs-pill"
                title={pill.title}
              >
                <b>{count}</b>
                <span>
                  <i className="cs-pill-dot" style={{ backgroundColor: pill.color }} />
                  {pill.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
