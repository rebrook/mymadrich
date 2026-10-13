import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchScopedStudentIds } from '../../utils/scope';
import { ROLES } from '../../utils/constants';
import { isUpcomingDate } from '../../utils/nextSession';
import { mitzvahLabel } from '../../utils/people';
import {
  formatDateShort,
  formatDayDate,
  formatSessionTime,
  formatSessionTimeRange,
} from '../../utils/datetime';

/**
 * "My children": the students the signed-in person is linked to as a guardian,
 * shown on the admin and tutor landings so they can reach their own child's
 * progress without leaving the work they are doing.
 *
 * It finds the children itself (the person's guardian links), so it does not
 * depend on which students the current view lists. If there are none, or the
 * lookup fails, it renders nothing: it is a convenience, never a blocker.
 *
 * Props:
 *   userId            - the signed-in person's id
 *   canOpenFamilyView - true if they hold the Parent role (so the family view exists for them)
 *   canManageRoles    - true if they can give themselves the Parent role (an administrator)
 *   canOpenProgress   - fn(childId) => boolean: can the current view open this child's overview?
 *   onOpenProgress    - fn(childId): open the child's overview in the current view
 *   onOpenFamilyView  - fn(childId): switch to the parent view with this child selected
 */
export default function MyChildrenCard({
  userId,
  canOpenFamilyView,
  canManageRoles,
  canOpenProgress,
  onOpenProgress,
  onOpenFamilyView,
}) {
  const [children, setChildren] = useState(null); // null = still loading

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;

    async function load() {
      try {
        const ids = await fetchScopedStudentIds(ROLES.PARENT, userId);
        if (!ids || ids.length === 0) {
          if (!cancelled) setChildren([]);
          return;
        }
        const { data, error } = await supabase
          .from('students')
          .select('id, first_name, last_name, mitzvah_date, mitzvah_type, status, next_session_date, next_session_time, next_session_end_time')
          .in('id', ids)
          .neq('status', 'archived')
          .order('last_name')
          .order('first_name');
        if (error) throw error;
        if (!cancelled) setChildren(data || []);
      } catch {
        // Non-critical: a card that cannot load simply does not appear
        if (!cancelled) setChildren([]);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!children || children.length === 0) return null;

  function nextSessionText(child) {
    if (!isUpcomingDate(child.next_session_date)) return 'No session scheduled';
    const time = child.next_session_time
      ? (child.next_session_end_time
          ? formatSessionTimeRange(child.next_session_time, child.next_session_end_time)
          : formatSessionTime(child.next_session_time))
      : null;
    return `Next session: ${formatDayDate(child.next_session_date)}${time ? ` at ${time}` : ''}`;
  }

  return (
    <section className="card my-children-card" aria-labelledby="my-children-title">
      <div className="section-header">
        <h3 id="my-children-title">My children</h3>
      </div>

      <ul
        style={{
          listStyle: 'none',
          margin: 'var(--space-3) 0 0',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        {children.map((child) => {
          const label = child.mitzvah_type ? mitzvahLabel(child.mitzvah_type) : "B'nai Mitzvah";
          const showProgress = canOpenProgress ? canOpenProgress(child.id) : false;
          return (
            <li
              key={child.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>
                  {child.first_name} {child.last_name}
                </div>
                <div className="form-hint">
                  {label} {child.mitzvah_date ? formatDateShort(child.mitzvah_date) : '(no date yet)'}
                </div>
                <div className="form-hint">{nextSessionText(child)}</div>
              </div>

              <div className="action-buttons">
                {showProgress && (
                  <button
                    type="button"
                    className="btn btn-small btn-outline"
                    onClick={() => onOpenProgress(child.id)}
                    aria-label={`Open ${child.first_name}'s progress`}
                  >
                    Open progress
                  </button>
                )}
                {canOpenFamilyView && (
                  <button
                    type="button"
                    className="btn btn-small btn-outline"
                    onClick={() => onOpenFamilyView(child.id)}
                    aria-label={`Open ${child.first_name}'s family view`}
                  >
                    Open family view
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!canOpenFamilyView && canManageRoles && (
        <p className="form-hint" style={{ marginTop: 'var(--space-3)' }}>
          To see this as a family does, add the Parent role to your own account (Admin, Users, Manage roles).
        </p>
      )}
    </section>
  );
}
