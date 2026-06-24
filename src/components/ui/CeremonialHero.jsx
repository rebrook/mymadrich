import { Link } from 'react-router-dom';
import MenorahReadiness from '../domain/MenorahReadiness';
import { emblemGold } from '../../assets/emblem';
import { READING_TYPE, milestoneForReadiness } from '../../utils/constants';
import { tutorName } from '../../utils/people';

/**
 * CeremonialHero — the elevated student/parent hero panel.
 *
 * Deep-purple panel with radial bloom and gold corner ring.
 * Three grid areas: content (left), menorah (right), footer (chip/date).
 * On mobile (≤768px), content stacks above a footer row where the menorah
 * sits beside the date/readiness info.
 */
export default function CeremonialHero({
  student,
  readings = [],
  daysToMitzvah,
  masteryPct = 0,
  cohortName,
  isFullCompletion = false,
}) {
  if (!student) return null;

  const firstName = student.first_name || '';
  const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim();

  // Primary Torah reading for parsha info
  const torahReading = readings.find((r) => r.reading_type === READING_TYPE.TORAH);
  const primaryReading = torahReading || readings[0] || null;

  const tutorDisplayName = tutorName(student.tutor, null);

  const mitzvahDateFormatted = student.mitzvah_date
    ? formatMitzvahDate(student.mitzvah_date)
    : null;

  // Countdown
  let chipText = null;
  let chipComplete = false;
  if (daysToMitzvah !== null && daysToMitzvah !== undefined && student.mitzvah_date) {
    if (daysToMitzvah > 0) {
      chipText = `${daysToMitzvah} day${daysToMitzvah === 1 ? '' : 's'} to the bimah`;
    } else if (daysToMitzvah === 0) {
      chipText = 'Today!';
      chipComplete = true;
    } else {
      chipText = 'Mitzvah complete';
      chipComplete = true;
    }
  }

  return (
    <section className={`ceremonial-hero${isFullCompletion ? ' ceremonial-hero-complete' : ''}`}>
      {/* Grid area: content */}
      <div className="ceremonial-hero-content">
        {/* Full eyebrow (desktop) */}
        <span className="ceremonial-hero-eyebrow ceremonial-hero-eyebrow-full">
          <span className="ceremonial-hero-star" aria-hidden="true">{'\u2605'}</span>
          {' '}{firstName}{'\u2019'}s journey to the bimah
        </span>
        {/* Short eyebrow (mobile) */}
        <span className="ceremonial-hero-eyebrow ceremonial-hero-eyebrow-short">
          <span className="ceremonial-hero-star" aria-hidden="true">{'\u2605'}</span>
          {' '}To the bimah
        </span>

        <h2 className="ceremonial-hero-name">{fullName}</h2>

        {student.hebrew_name && (
          <div className="ceremonial-hero-hebrew-name" dir="rtl" lang="he">
            {student.hebrew_name}
          </div>
        )}

        {primaryReading && (
          <div className="ceremonial-hero-sub">
            {primaryReading.portion_name_hebrew && (
              <span className="ceremonial-hero-he" dir="rtl" lang="he">
                {primaryReading.portion_name_hebrew}
              </span>
            )}
            <span className="ceremonial-hero-en">
              Parashat {primaryReading.portion_name}
            </span>
            {primaryReading.reference && (
              <span className="ceremonial-hero-ref">
                {primaryReading.reference}
              </span>
            )}
          </div>
        )}

        <div className="ceremonial-hero-meta">
          <span>Chizuk Amuno</span>
          {cohortName && (
            <>
              <span className="ceremonial-hero-dot" aria-hidden="true" />
              <span>{cohortName}</span>
            </>
          )}
          {tutorDisplayName && (
            <>
              <span className="ceremonial-hero-dot" aria-hidden="true" />
              <span>Tutor: {tutorDisplayName}</span>
            </>
          )}
        </div>
      </div>

      {/* Grid area: menorah */}
      <div className="ceremonial-hero-menorah">
        <MenorahReadiness
          percent={masteryPct}
          size={152}
          emblemSrc={emblemGold}
          sub="Lighting the way to the bimah"
        />
        {(() => {
          const stage = milestoneForReadiness(masteryPct);
          return (
            <div className="ceremonial-hero-stage">
              <span className="ceremonial-hero-stage-he" dir="rtl" lang="he">
                {stage.he}
              </span>
              <span className="ceremonial-hero-stage-en">
                {stage.en}
              </span>
            </div>
          );
        })()}
        {/* "View the full journey" link — sits below stage in menorah column */}
        <Link
          to={`/road-to-the-bimah?student=${student.id}`}
          className="ceremonial-hero-journey-link"
        >
          View the full journey {'\u2192'}
        </Link>
      </div>

      {/* Grid area: footer (chip + date) */}
      {chipText && (
        <div className="ceremonial-hero-footer">
          {/* Desktop chip */}
          <div className={`ceremonial-hero-chip${chipComplete ? ' ceremonial-hero-chip-complete' : ''}`}>
            <span className="ceremonial-hero-star" aria-hidden="true">{'\u2605'}</span>
            {chipText}
            {mitzvahDateFormatted && !chipComplete && (
              <>
                <span className="ceremonial-hero-sep" aria-hidden="true">{'\u00B7'}</span>
                {mitzvahDateFormatted}
              </>
            )}
          </div>
          {/* Mobile date block (visible only on mobile, beside menorah) */}
          <div className="ceremonial-hero-mobile-date">
            <div className="ceremonial-hero-mobile-date-d">
              {masteryPct}% ready {'\u00B7'} {chipText}
            </div>
            {mitzvahDateFormatted && (
              <div className="ceremonial-hero-mobile-date-l">{mitzvahDateFormatted}</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function formatMitzvahDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = d.getDay();
  const dayName = dayOfWeek === 6 ? 'Shabbat' : d.toLocaleDateString('en-US', { weekday: 'long' });
  const rest = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `${dayName}, ${rest}`;
}
