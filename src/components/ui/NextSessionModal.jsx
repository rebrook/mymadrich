import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Modal from './Modal';
import TimeSelect from './TimeSelect';
import { formatDayDate, formatSessionTime, formatSessionTimeRange } from '../../utils/datetime';
import { isUpcomingDate, localToday, validateNextSession } from '../../utils/nextSession';

/** The database returns times as HH:MM:SS; TimeSelect works in HH:MM. */
function toHHMM(t) {
  return t ? String(t).slice(0, 5) : '';
}

/** Plain-language message for a failed save. Never shows raw errors. */
function friendlyError(err) {
  const msg = (err && err.message) || '';
  if (msg.includes('only schedule sessions for your own')) {
    return 'You can only schedule sessions for your own students.';
  }
  if (msg.includes('Not signed in')) {
    return 'Your sign-in expired. Sign in again to continue.';
  }
  return "Couldn't save the next session. Try again.";
}

/**
 * NextSessionModal
 *
 * Schedule, edit, or cancel a student's next session. The next session is
 * stored on the student, so this works whether or not any session has been
 * logged. One dialog, two views: the form, and a cancel confirmation.
 *
 * Props:
 *   student      - { id, first_name, last_name, next_session_date,
 *                    next_session_time, next_session_end_time }
 *   initialView  - 'form' (default) or 'cancel' (opens on the confirmation)
 *   onClose()    - dismiss without changes
 *   onSaved(studentId, next) - after a successful save or cancel; `next` is
 *                  { next_session_date, next_session_time, next_session_end_time }
 */
export default function NextSessionModal({ student, initialView = 'form', onClose, onSaved }) {
  const hasExisting = isUpcomingDate(student.next_session_date);
  const openedOnConfirm = hasExisting && initialView === 'cancel';

  const [view, setView] = useState(openedOnConfirm ? 'confirm' : 'form');
  const [date, setDate] = useState(hasExisting ? student.next_session_date : '');
  const [start, setStart] = useState(hasExisting ? toHHMM(student.next_session_time) : '');
  const [end, setEnd] = useState(hasExisting ? toHHMM(student.next_session_end_time) : '');
  const [startPartial, setStartPartial] = useState(false);
  const [endPartial, setEndPartial] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const keepRef = useRef(null);
  const fullName = `${student.first_name} ${student.last_name}`;

  // When the cancel confirmation opens from inside the form, move focus to the
  // safe choice (Keep session) so Enter can't cancel by accident.
  useEffect(() => {
    if (view === 'confirm' && keepRef.current) keepRef.current.focus();
  }, [view]);

  async function persist(nextDate, nextStart, nextEnd) {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('schedule_next_session', {
        p_student_id: student.id,
        p_date: nextDate || null,
        p_start_time: nextStart || null,
        p_end_time: nextEnd || null,
      });
      if (error) throw error;
      onSaved(student.id, {
        next_session_date: nextDate || null,
        next_session_time: nextStart || null,
        next_session_end_time: nextEnd || null,
      });
    } catch (err) {
      console.error('Next session save failed:', err && err.message);
      setErrors({ form: friendlyError(err) });
      setSaving(false);
    }
  }

  function handleSave() {
    const found = validateNextSession({ date, start, end, startPartial, endPartial });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    persist(date, start, end);
  }

  function handleConfirmCancel() {
    persist(null, null, null);
  }

  function handleKeep() {
    if (openedOnConfirm) {
      onClose();
    } else {
      setErrors({});
      setView('form');
    }
  }

  function clearError(field) {
    setErrors((prev) => (prev[field] || prev.form ? { ...prev, [field]: undefined, form: undefined } : prev));
  }

  // ---- Existing session text for the confirmation ----
  const existingTime = student.next_session_time
    ? (student.next_session_end_time
        ? formatSessionTimeRange(student.next_session_time, student.next_session_end_time)
        : formatSessionTime(student.next_session_time))
    : null;

  // ---- Per-view content (one <Modal> element, so focus handling is not reset) ----
  let title;
  let footer;
  let body;

  if (view === 'confirm') {
    title = 'Cancel next session?';
    body = (
      <>
        {errors.form && (
          <div className="alert alert-error" role="alert">{errors.form}</div>
        )}
        <p>
          {`${student.first_name}'s session on ${formatDayDate(student.next_session_date)}${existingTime ? ` at ${existingTime}` : ''} will be removed. You can schedule a new one at any time.`}
        </p>
      </>
    );
    footer = (
      <>
        <button
          ref={keepRef}
          className="btn btn-outline"
          type="button"
          data-autofocus
          onClick={handleKeep}
          disabled={saving}
        >
          Keep session
        </button>
        <button
          className="btn btn-danger-outline"
          type="button"
          onClick={handleConfirmCancel}
          disabled={saving}
        >
          {saving ? 'Cancelling...' : 'Cancel session'}
        </button>
      </>
    );
  } else {
    title = hasExisting ? 'Edit next session' : 'Schedule next session';
    body = (
      <>
        <p className="form-hint">{fullName}</p>

        {errors.form && (
          <div className="alert alert-error" role="alert">{errors.form}</div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="next-session-date">Date</label>
          <input
            id="next-session-date"
            type="date"
            className="input"
            min={localToday()}
            value={date}
            onChange={(e) => { setDate(e.target.value); clearError('date'); }}
            required
            data-autofocus
            aria-invalid={errors.date ? 'true' : undefined}
            aria-describedby={errors.date ? 'next-session-date-error' : undefined}
          />
          {errors.date && (
            <span id="next-session-date-error" className="field-error-text" role="alert">
              {errors.date}
            </span>
          )}
        </div>

        <div className="form-group">
          <span className="form-label" id="next-session-start-label">Start time (optional)</span>
          <div
            role="group"
            aria-labelledby="next-session-start-label"
            aria-describedby={errors.start ? 'next-session-start-error' : undefined}
          >
            <TimeSelect
              value={start}
              onChange={(v) => { setStart(v); clearError('start'); clearError('end'); }}
              onPartialChange={setStartPartial}
              ariaLabelPrefix="Start time"
            />
          </div>
          {errors.start && (
            <span id="next-session-start-error" className="field-error-text" role="alert">
              {errors.start}
            </span>
          )}
        </div>

        <div className="form-group">
          <span className="form-label" id="next-session-end-label">End time (optional)</span>
          <div
            role="group"
            aria-labelledby="next-session-end-label"
            aria-describedby={errors.end ? 'next-session-end-error' : undefined}
          >
            <TimeSelect
              value={end}
              onChange={(v) => { setEnd(v); clearError('end'); }}
              onPartialChange={setEndPartial}
              ariaLabelPrefix="End time"
            />
          </div>
          {errors.end && (
            <span id="next-session-end-error" className="field-error-text" role="alert">
              {errors.end}
            </span>
          )}
        </div>
      </>
    );
    footer = (
      <>
        {hasExisting && (
          <button
            className="btn btn-danger-outline next-session-cancel-link"
            type="button"
            onClick={() => { setErrors({}); setView('confirm'); }}
            disabled={saving}
          >
            Cancel session
          </button>
        )}
        <button className="btn btn-outline" type="button" onClick={onClose} disabled={saving}>
          Close
        </button>
        <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </>
    );
  }

  return (
    <Modal title={title} onClose={onClose} footer={footer}>
      {body}
    </Modal>
  );
}
