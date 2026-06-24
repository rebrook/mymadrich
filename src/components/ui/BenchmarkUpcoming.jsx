import {
  BENCHMARK_CATEGORY,
  BENCHMARK_STATUS,
  getBenchmarkType,
} from '../../utils/constants';
import { formatSessionTime } from '../../utils/datetime';

/**
 * Format a date string as "Thu, Apr 30" (short, no year) for compact display.
 */
function formatCompactDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Displays upcoming scheduled benchmark meetings for a student.
 *
 * Used on the family dashboard and tutor views. Shows only scheduled
 * meetings with a future date. For tutors, optionally filters to only
 * meetings where the tutor is invited.
 *
 * @param {Object} props
 * @param {Array}  props.benchmarks  - Raw benchmark_meetings rows
 * @param {string} props.firstName   - Student's first name (for family copy)
 * @param {boolean} props.tutorOnly  - If true, only show tutor-invited meetings
 * @param {number} props.limit       - Max items to show (default 3)
 */
export default function BenchmarkUpcoming({
  benchmarks,
  firstName,
  tutorOnly = false,
  limit = 3,
}) {
  if (!benchmarks || benchmarks.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter to scheduled + future only
  let upcoming = benchmarks.filter((bm) => {
    if (bm.status !== BENCHMARK_STATUS.SCHEDULED) return false;
    if (!bm.scheduled_date) return false;
    const d = new Date(bm.scheduled_date + 'T00:00:00');
    return d >= today;
  });

  // Tutor filter: only types where tutor is invited
  if (tutorOnly) {
    upcoming = upcoming.filter((bm) => {
      const type = getBenchmarkType(bm.meeting_type);
      return type?.tutorInvited;
    });
  }

  // Sort by date, take limited set
  upcoming.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  upcoming = upcoming.slice(0, limit);

  if (upcoming.length === 0) return null;

  return (
    <div className="bm-upcoming">
      <div className="bm-upcoming-title">
        {tutorOnly ? 'Your upcoming benchmark sessions' : 'Upcoming meetings'}
      </div>
      <div className="bm-upcoming-list">
        {upcoming.map((bm) => {
          const type = getBenchmarkType(bm.meeting_type);
          if (!type) return null;
          const isFamily = type.category === BENCHMARK_CATEGORY.FAMILY_MEETING;

          return (
            <div key={bm.id} className="bm-upcoming-item">
              <span className={`bm-cat-badge${isFamily ? ' bm-cat-family' : ' bm-cat-clergy'}`}>
                {isFamily ? 'Family' : 'Clergy'}
              </span>
              <span className="bm-upcoming-date">
                {formatCompactDate(bm.scheduled_date)}
              </span>
              <span className="bm-upcoming-label">
                {type.label}
                {bm.start_time ? ` at ${formatSessionTime(bm.start_time)}` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
