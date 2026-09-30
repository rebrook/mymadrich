import PaceBadge from './PaceBadge';
import { PACE_STATUS, formatTargetDate, getPaceSummaryText } from '../../utils/paceCalculations';
import HelpTip from './HelpTip';

/**
 * PaceSection — renders the pace status panel on the Dashboard and Student Detail.
 * Only shown to admin and tutor roles.
 *
 * Props:
 *   pace             — calculatePace() result
 *   elementsSummary  — calculateElementsSummary() result (optional)
 *   rationale        — getPaceRationale() string; when provided, renders as
 *                      always-visible inline text below the summary (used on
 *                      Student Detail). When absent, behaves as before.
 */
export default function PaceSection({ pace, elementsSummary, rationale }) {
  if (!pace) return null;

  const summaryText = getPaceSummaryText(pace);
  const targetStr = formatTargetDate(pace.targetDate);
  const showProjection = pace.projectedCompletionDate &&
    (pace.status === PACE_STATUS.BEHIND || pace.status === PACE_STATUS.CRITICAL);

  const showDetails = pace.status !== PACE_STATUS.NO_VERSES &&
    pace.status !== PACE_STATUS.COMPLETED &&
    pace.status !== PACE_STATUS.NOT_STARTED &&
    pace.status !== PACE_STATUS.FAMILY_TUTORED;

  return (
    <div className="pace-section">
      <div className="pace-section-header">
        <h3 className="pace-section-title">
          Learning Pace
          <HelpTip text="Pace is calculated by comparing verses learned with trope against a linear progression toward the target completion date. Visible to admins and tutors only." />
        </h3>
        <PaceBadge status={pace.status} size="lg" />
      </div>

      <div className="pace-detail-row">
        <span>{summaryText}</span>
      </div>

      {showDetails && (
        <div className="pace-detail-row">
          <span>
            {pace.masteredCount} of {pace.totalCount} verses learned with trope
            ({Math.round(pace.masteryPct * 100)}%)
          </span>
          <span className="pace-detail-separator">|</span>
          <span>Target: {targetStr}</span>
          {pace.weeksRemaining !== undefined && (
            <>
              <span className="pace-detail-separator">|</span>
              <span>{pace.weeksRemaining} weeks remaining</span>
            </>
          )}
        </div>
      )}

      {showProjection && (
        <div className="pace-detail-row">
          <span style={{ color: 'var(--color-pace-behind)' }}>
            At current pace, projected completion: {formatTargetDate(pace.projectedCompletionDate)}
          </span>
        </div>
      )}

      {/* Always-visible rationale (Student Detail page) */}
      {rationale && (
        <div className="pace-detail-row pace-rationale">
          <span>{rationale}</span>
        </div>
      )}

      {elementsSummary && elementsSummary.status !== 'none' && (
        <div className="pace-detail-row" style={{ marginTop: 'var(--space-2)' }}>
          <span className={`pace-badge pace-badge-sm ${elementsSummary.status === 'complete' ? '' : 'pace-badge-outline'}`}
            style={elementsSummary.status === 'complete'
              ? { backgroundColor: 'var(--color-pace-on-track)' }
              : { backgroundColor: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }
            }
          >
            {elementsSummary.label}
          </span>
        </div>
      )}
    </div>
  );
}
