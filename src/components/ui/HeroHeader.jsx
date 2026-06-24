import { READING_TYPE } from '../../utils/constants';
import { formatSessionDate } from '../../utils/datetime';
import { mitzvahLabel } from '../../utils/people';

/**
 * HeroHeader (v2 Section 6.3)
 *
 * Avatar circle (50px, purple, serif initials) + student name (--text-4xl serif)
 * + metadata line (middot separated) + gold countdown chip.
 *
 * Props:
 *   student           – student record with first_name, last_name, mitzvah_date, mitzvah_type
 *   readings          – array of reading objects (for portion name in metadata)
 *   daysToMitzvah     – integer, null if no mitzvah_date
 *   isFullCompletion  – boolean, true when all verses + elements are mastered
 */
export default function HeroHeader({ student, readings = [], daysToMitzvah, isFullCompletion }) {
  if (!student) return null;

  const initials = `${student.first_name?.charAt(0) || ''}${student.last_name?.charAt(0) || ''}`.toUpperCase();

  // Mitzvah type label
  const mitzvahType = mitzvahLabel(student.mitzvah_type);

  // Primary portion name (first Torah reading, or first reading)
  const torahReading = readings.find((r) => r.reading_type === READING_TYPE.TORAH);
  const primaryPortion = torahReading?.portion_name || readings[0]?.portion_name || null;

  // Mitzvah date formatted
  const mitzvahDateStr = student.mitzvah_date
    ? formatSessionDate(student.mitzvah_date, { style: 'date' })
    : null;

  // Countdown chip
  let countdownText = null;
  let countdownClass = 'hero-countdown-chip';
  if (isFullCompletion && mitzvahDateStr) {
    countdownText = `Ready for ${mitzvahDateStr}`;
    countdownClass += ' hero-countdown-chip-complete';
  } else if (daysToMitzvah !== null && daysToMitzvah !== undefined) {
    if (daysToMitzvah > 0) {
      countdownText = `${daysToMitzvah} day${daysToMitzvah === 1 ? '' : 's'} to go`;
    } else if (daysToMitzvah === 0) {
      countdownText = 'Today!';
      countdownClass += ' hero-countdown-chip-complete';
    } else {
      countdownText = 'Mitzvah complete';
      countdownClass += ' hero-countdown-chip-complete';
    }
  }

  // Build metadata segments
  const metaParts = [mitzvahType];
  if (primaryPortion) metaParts.push(`Parashat ${primaryPortion}`);
  if (mitzvahDateStr) metaParts.push(mitzvahDateStr);

  return (
    <div className="hero-header">
      <div className="hero-avatar" aria-hidden="true">
        {initials}
      </div>
      <div className="hero-content">
        <h2 className="hero-name">
          {student.first_name} {student.last_name}
        </h2>
        {student.hebrew_name && (
          <span className="hero-hebrew-name" dir="rtl" lang="he">
            {student.hebrew_name}
          </span>
        )}
        <p className="hero-meta">
          {metaParts.map((part, i) => (
            <span key={i}>
              {i > 0 && <span className="hero-meta-dot" aria-hidden="true">{'\u00B7'}</span>}
              {part}
            </span>
          ))}
        </p>
        {countdownText && (
          <span className={countdownClass}>
            <CalendarIcon />
            {countdownText}
          </span>
        )}
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" />
      <line x1="4.5" y1="1" x2="4.5" y2="4" />
      <line x1="9.5" y1="1" x2="9.5" y2="4" />
      <line x1="1.5" y1="6" x2="12.5" y2="6" />
    </svg>
  );
}
