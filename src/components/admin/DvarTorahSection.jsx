import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DVAR_STAGES, DVAR_STAGE, getDvarStage } from '../../utils/constants';
import { formatDateCompact } from '../../utils/datetime';

/**
 * DvarTorahSection — compact d'var Torah stage editor for Student Detail.
 *
 * Staff (admin/tutor) can move the stage forward or back freely via a
 * <select>. The update goes through a SECURITY DEFINER RPC that sets
 * audit columns server-side.
 *
 * Props:
 *   student          — student record (must include dvar_torah_stage,
 *                      dvar_stage_updated_at, dvar_stage_updated_by)
 *   updaterName      — display name of the last updater (resolved by parent)
 *   onStageChange    — callback(newStageKey) after a successful update;
 *                      parent should refresh the student record
 */
export default function DvarTorahSection({ student, updaterName, onStageChange }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const currentStage = student?.dvar_torah_stage || DVAR_STAGE.NOT_STARTED;
  const stageObj = getDvarStage(currentStage);
  const isDelivered = currentStage === DVAR_STAGE.DELIVERED;

  async function handleChange(e) {
    const newStage = e.target.value;
    if (newStage === currentStage) return;

    setSaving(true);
    setError(null);

    try {
      const { error: rpcErr } = await supabase.rpc('update_dvar_torah_stage', {
        p_student_id: student.id,
        p_stage: newStage,
      });
      if (rpcErr) throw rpcErr;
      if (onStageChange) onStageChange(newStage);
    } catch (err) {
      console.error('Failed to update d\u2019var Torah stage:', err.message);
      setError('Could not update the stage. Please try again.');
      // Reset the select to the current value
      e.target.value = currentStage;
    } finally {
      setSaving(false);
    }
  }

  // Audit line: "Updated by [Name] on [Date]"
  const auditLine = student?.dvar_stage_updated_at
    ? `Updated${updaterName ? ` by ${updaterName}` : ''} on ${formatDateCompact(student.dvar_stage_updated_at.split('T')[0])}`
    : null;

  // Stepper dots: visual indicator of progress through the 5 stages
  const currentIndex = DVAR_STAGES.findIndex((s) => s.key === currentStage);

  return (
    <div className="dvar-section">
      <div className="dvar-section-header">
        <h3 className="dvar-section-title">
          <DvarIcon />
          D{'\u2019'}var Torah
        </h3>
        {isDelivered && (
          <span className="dvar-delivered-badge">
            {'\u2713'} Delivered
          </span>
        )}
      </div>

      <div className="dvar-section-body">
        {/* Stage stepper dots */}
        <div className="dvar-stepper" role="img" aria-label={`Stage ${currentIndex + 1} of ${DVAR_STAGES.length}: ${stageObj?.label || 'Not started'}`}>
          {DVAR_STAGES.map((stage, i) => (
            <div
              key={stage.key}
              className={`dvar-step${i < currentIndex ? ' done' : ''}${i === currentIndex ? ' current' : ''}`}
            >
              <span className="dvar-step-dot" />
              {i < DVAR_STAGES.length - 1 && <span className="dvar-step-line" />}
            </div>
          ))}
        </div>

        {/* Select control */}
        <div className="dvar-select-row">
          <label htmlFor="dvar-stage-select" className="dvar-select-label">
            Stage
          </label>
          <select
            id="dvar-stage-select"
            className="input dvar-select"
            value={currentStage}
            onChange={handleChange}
            disabled={saving}
          >
            {DVAR_STAGES.map((stage) => (
              <option key={stage.key} value={stage.key}>
                {stage.label}
              </option>
            ))}
          </select>
        </div>

        {/* Audit line */}
        {auditLine && (
          <div className="dvar-audit">{auditLine}</div>
        )}

        {/* Error */}
        {error && (
          <div className="dvar-error">{error}</div>
        )}
      </div>
    </div>
  );
}

/** Book icon — matches the 20x20 / 1.5px stroke house style. */
function DvarIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="dvar-icon"
    >
      <path d="M3 4.5C3 3.4 3.9 2.5 5 2.5h3c1.1 0 2 .9 2 1.1V17c0-.9-1.3-1.5-2-1.5H5c-1.1 0-2-.9-2-2V4.5z" />
      <path d="M17 4.5c0-1.1-.9-2-2-2h-3c-1.1 0-2 .9-2 1.1V17c0-.9 1.3-1.5 2-1.5h3c1.1 0 2-.9 2-2V4.5z" />
      <path d="M7 6.5h1.5M7 9h1.5" />
    </svg>
  );
}
