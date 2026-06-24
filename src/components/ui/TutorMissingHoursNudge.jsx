/**
 * TutorMissingHoursNudge — in-app nudge shown to tutors on their
 * Dashboard or My Week when they have sessions missing minutes_worked.
 *
 * Detection: queries sessions logged by this tutor in the past 30 days
 * where minutes_worked IS NULL. Shows a count and links to Session History
 * so the tutor can edit them.
 *
 * This is the tutor-facing surface. The admin-facing surface is
 * in AlertsPanel (missing_hours chip type).
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function TutorMissingHoursNudge({ tutorId }) {
  const [missingCount, setMissingCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!tutorId) return;

    async function checkMissing() {
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        const { count, error: err } = await supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('tutor_id', tutorId)
          .gte('session_date', cutoffStr)
          .is('minutes_worked', null);

        if (err) throw err;
        setMissingCount(count || 0);
      } catch {
        // Non-critical; silently fail
      }
    }

    checkMissing();
  }, [tutorId]);

  if (missingCount === 0 || dismissed) return null;

  return (
    <div className="missing-hours-nudge">
      <div className="missing-hours-nudge-content">
        <span className="missing-hours-nudge-icon" aria-hidden="true">{'\u23F1'}</span>
        <span className="missing-hours-nudge-text">
          You have {missingCount} session{missingCount !== 1 ? 's' : ''} in the past 30 days missing time logged.{' '}
          <Link to="/sessions" className="missing-hours-nudge-link">
            Update in Session History
          </Link>
        </span>
      </div>
      <button
        className="missing-hours-nudge-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss reminder"
        type="button"
      >
        {'\u2715'}
      </button>
    </div>
  );
}
