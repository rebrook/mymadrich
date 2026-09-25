import { Link } from 'react-router-dom';
import { formatDateShort } from '../../utils/datetime';
import { tutorName as formatTutorName } from '../../utils/people';

/**
 * SessionRow (v2 Section 6.9)
 *
 * Compact session row for the Dashboard rail.
 * Date (medium weight) + tutor name + count chips + edited indicator + chevron.
 *
 * Props:
 *   session        – session object with id, session_date, created_at, updated_at,
 *                    tutor: { display_name }, session_verse_progress, session_element_progress
 *   studentId      – for the session history link
 */
export default function SessionRow({ session, studentId }) {
  if (!session) return null;

  const dateStr = formatDateShort(session.session_date);

  const tutorDisplay = formatTutorName(session.tutor, null);
  const verseCount = session.session_verse_progress?.length || 0;
  const elementCount = session.session_element_progress?.length || 0;

  // Edited: updated_at differs from created_at (compare first 19 chars to ignore ms)
  const isEdited =
    session.updated_at &&
    session.created_at &&
    session.updated_at.slice(0, 19) !== session.created_at.slice(0, 19);

  return (
    <Link
      to={`/sessions?student=${studentId}&session=${session.id}`}
      className="session-row"
    >
      <span className="session-row-date">{dateStr}</span>
      {tutorDisplay && <span className="session-row-tutor">{tutorDisplay}</span>}
      <span className="session-row-chips">
        {verseCount > 0 && (
          <span className="session-row-chip">{verseCount} verse{verseCount !== 1 ? 's' : ''}</span>
        )}
        {elementCount > 0 && (
          <span className="session-row-chip">{elementCount} element{elementCount !== 1 ? 's' : ''}</span>
        )}
      </span>
      {isEdited && <span className="session-row-edited">Edited</span>}
      <ChevronRightIcon />
    </Link>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      className="session-row-chevron"
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
      <polyline points="5 3 9 7 5 11" />
    </svg>
  );
}
