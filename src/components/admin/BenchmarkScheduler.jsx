import { useState } from 'react';
import {
  BENCHMARK_CATEGORY,
  BENCHMARK_CATEGORY_LABELS,
  BENCHMARK_STATUS,
  BENCHMARK_STATUS_LABELS,
  suggestBenchmarkDate,
} from '../../utils/constants';
import { formatSessionTime } from '../../utils/datetime';
import Modal from '../ui/Modal';
import TimeCombobox from '../ui/TimeCombobox';

/**
 * Format a Date object as YYYY-MM-DD for input[type=date] value.
 */
function toDateInput(d) {
  if (!d) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a date string as "Thu, Apr 30, 2026" for display.
 */
function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format start_time + end_time as "4:00 PM \u2013 4:45 PM".
 */
function formatTimeRange(start, end) {
  const parts = [];
  if (start) parts.push(formatSessionTime(start));
  if (end) parts.push(formatSessionTime(end));
  return parts.join(' \u2013 ');
}

/**
 * Compute default end_time from start_time + duration in minutes.
 */
function computeEndTime(startTime, durationMin) {
  if (!startTime) return '';
  const [h, m] = startTime.split(':').map(Number);
  const totalMin = h * 60 + m + durationMin;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

// ---- Category badge ----

function CategoryBadge({ category }) {
  const isFamily = category === BENCHMARK_CATEGORY.FAMILY_MEETING;
  return (
    <span className={`bm-cat-badge${isFamily ? ' bm-cat-family' : ' bm-cat-clergy'}`}>
      {BENCHMARK_CATEGORY_LABELS[category]}
    </span>
  );
}

// ---- Status badge ----

function StatusBadge({ status }) {
  if (!status) return null;
  return (
    <span className={`bm-status-badge bm-status-${status}`}>
      {BENCHMARK_STATUS_LABELS[status]}
    </span>
  );
}


// ---- Edit Modal ----

function BenchmarkEditModal({ benchmark, mitzvahDate, onSave, onClose }) {
  const suggestedDate = suggestBenchmarkDate(benchmark, mitzvahDate);

  const [date, setDate] = useState(benchmark.scheduled_date || '');
  const [startTime, setStartTime] = useState(benchmark.start_time || '');
  const [endTime, setEndTime] = useState(
    benchmark.end_time || ''
  );
  const [location, setLocation] = useState(benchmark.location || '');
  const [attendees, setAttendees] = useState(
    benchmark.attendees || benchmark.defaultAttendees || ''
  );
  const [notes, setNotes] = useState(benchmark.notes || '');
  const [status, setStatus] = useState(benchmark.status || BENCHMARK_STATUS.PENDING);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Auto-compute end time when start changes (if end is empty or was auto-computed)
  function handleStartTimeChange(newStart) {
    setStartTime(newStart);
    if (!endTime || endTime === computeEndTime(startTime, benchmark.defaultDurationMin)) {
      setEndTime(computeEndTime(newStart, benchmark.defaultDurationMin));
    }
  }

  function handleUseSuggested() {
    if (suggestedDate) {
      setDate(toDateInput(suggestedDate));
    }
  }

  async function handleSave() {
    // Validate: if scheduling, require a date
    const effectiveStatus = date ? BENCHMARK_STATUS.SCHEDULED : status;
    if (effectiveStatus === BENCHMARK_STATUS.SCHEDULED && !date) {
      setError('A scheduled benchmark must have a date.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({
        meeting_type: benchmark.key,
        scheduled_date: date || null,
        start_time: startTime || null,
        end_time: endTime || null,
        location: location || null,
        attendees: attendees || null,
        notes: notes || null,
        // Auto-promote to scheduled when a date is set
        status: date
          ? (status === BENCHMARK_STATUS.PENDING ? BENCHMARK_STATUS.SCHEDULED : status)
          : status,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="bm-edit-modal">
        <h3 className="bm-edit-title">{benchmark.label}</h3>
        <CategoryBadge category={benchmark.category} />

        <p className="bm-edit-blurb">{benchmark.familyBlurb}</p>

        {/* Suggested date hint */}
        {suggestedDate && !date && (
          <div className="bm-suggested">
            <span className="bm-suggested-label">
              Suggested: {formatShortDate(toDateInput(suggestedDate))}
            </span>
            <button
              type="button"
              className="btn btn-outline btn-small"
              onClick={handleUseSuggested}
            >
              Use suggested date
            </button>
          </div>
        )}

        <div className="bm-edit-fields">
          <label className="bm-field">
            <span className="bm-field-label">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
            />
          </label>

          <div className="bm-field-row">
            <div className="bm-field">
              <span className="bm-field-label">Start time</span>
              <TimeCombobox
                value={startTime}
                onChange={handleStartTimeChange}
                ariaLabel="Start time"
              />
            </div>
            <div className="bm-field">
              <span className="bm-field-label">End time</span>
              <TimeCombobox
                value={endTime}
                onChange={setEndTime}
                ariaLabel="End time"
              />
            </div>
          </div>

          <label className="bm-field">
            <span className="bm-field-label">Location</span>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="input"
              placeholder="e.g. Cantor's office, Main sanctuary"
            />
          </label>

          <label className="bm-field">
            <span className="bm-field-label">Attendees</span>
            <input
              type="text"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              className="input"
              placeholder={benchmark.defaultAttendees}
            />
          </label>

          <label className="bm-field">
            <span className="bm-field-label">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input bm-textarea"
              rows={3}
              placeholder="Internal notes (not shown to families)"
            />
          </label>

          <label className="bm-field">
            <span className="bm-field-label">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input"
            >
              <option value={BENCHMARK_STATUS.PENDING}>
                {BENCHMARK_STATUS_LABELS[BENCHMARK_STATUS.PENDING]}
              </option>
              <option value={BENCHMARK_STATUS.SCHEDULED}>
                {BENCHMARK_STATUS_LABELS[BENCHMARK_STATUS.SCHEDULED]}
              </option>
              <option value={BENCHMARK_STATUS.COMPLETED}>
                {BENCHMARK_STATUS_LABELS[BENCHMARK_STATUS.COMPLETED]}
              </option>
              <option value={BENCHMARK_STATUS.CANCELLED}>
                {BENCHMARK_STATUS_LABELS[BENCHMARK_STATUS.CANCELLED]}
              </option>
            </select>
          </label>
        </div>

        {error && <div className="alert alert-error bm-edit-error">{error}</div>}

        <div className="bm-edit-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving\u2026' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}


// ---- Main Scheduler Component ----

export default function BenchmarkScheduler({ benchmarks, student, onUpsert }) {
  const [editingType, setEditingType] = useState(null);

  if (!benchmarks || benchmarks.length === 0) return null;

  const mitzvahDate = student?.mitzvah_date || null;

  // Group by category for visual separation
  const clergyMeetings = benchmarks.filter(
    (b) => b.category === BENCHMARK_CATEGORY.CLERGY_SESSION
  );
  const familyMeetings = benchmarks.filter(
    (b) => b.category === BENCHMARK_CATEGORY.FAMILY_MEETING
  );

  function renderRow(bm) {
    const isScheduled = bm.status === BENCHMARK_STATUS.SCHEDULED;
    const isCompleted = bm.status === BENCHMARK_STATUS.COMPLETED;
    const isCancelled = bm.status === BENCHMARK_STATUS.CANCELLED;
    const hasDate = !!bm.scheduled_date;

    return (
      <div
        key={bm.key}
        className={`bm-row${isCompleted ? ' bm-row-completed' : ''}${isCancelled ? ' bm-row-cancelled' : ''}`}
      >
        <div className="bm-row-seq">{bm.sequence}</div>
        <div className="bm-row-body">
          <div className="bm-row-top">
            <span className="bm-row-label">{bm.label}</span>
            <StatusBadge status={bm.status} />
          </div>
          {hasDate && (
            <div className="bm-row-meta">
              <span>{formatShortDate(bm.scheduled_date)}</span>
              {(bm.start_time || bm.end_time) && (
                <span className="bm-row-dot">{'\u00B7'}</span>
              )}
              {(bm.start_time || bm.end_time) && (
                <span>{formatTimeRange(bm.start_time, bm.end_time)}</span>
              )}
              {bm.location && (
                <>
                  <span className="bm-row-dot">{'\u00B7'}</span>
                  <span>{bm.location}</span>
                </>
              )}
            </div>
          )}
          {!hasDate && mitzvahDate && (
            <div className="bm-row-suggested">
              Suggested: {formatShortDate(toDateInput(suggestBenchmarkDate(bm, mitzvahDate)))}
            </div>
          )}
          {bm.notes && (
            <div className="bm-row-notes">{bm.notes}</div>
          )}
        </div>
        <button
          type="button"
          className="btn btn-outline btn-small bm-row-edit"
          onClick={() => setEditingType(bm.key)}
        >
          {hasDate ? 'Edit' : 'Schedule'}
        </button>
      </div>
    );
  }

  return (
    <section className="card bm-scheduler">
      <div className="bm-header">
        <h2>Benchmark Meetings</h2>
      </div>
      <p className="bm-intro">
        The fixed meeting sequence with the Cantor, anchored to {student?.first_name || 'the student'}{'\u2019'}s bimah date.
        Set actual dates and times for each; families and tutors will see scheduled meetings on the timeline.
      </p>

      {/* Clergy sessions */}
      <div className="bm-group">
        <div className="bm-group-header">
          <CategoryBadge category={BENCHMARK_CATEGORY.CLERGY_SESSION} />
          <span className="bm-group-count">
            {clergyMeetings.filter((b) => b.status === BENCHMARK_STATUS.SCHEDULED || b.status === BENCHMARK_STATUS.COMPLETED).length} of {clergyMeetings.length} scheduled
          </span>
        </div>
        <div className="bm-group-list">
          {clergyMeetings.map(renderRow)}
        </div>
      </div>

      {/* Family meetings */}
      <div className="bm-group">
        <div className="bm-group-header">
          <CategoryBadge category={BENCHMARK_CATEGORY.FAMILY_MEETING} />
          <span className="bm-group-count">
            {familyMeetings.filter((b) => b.status === BENCHMARK_STATUS.SCHEDULED || b.status === BENCHMARK_STATUS.COMPLETED).length} of {familyMeetings.length} scheduled
          </span>
        </div>
        <div className="bm-group-list">
          {familyMeetings.map(renderRow)}
        </div>
      </div>

      {/* Edit modal */}
      {editingType && (
        <BenchmarkEditModal
          benchmark={benchmarks.find((b) => b.key === editingType)}
          mitzvahDate={mitzvahDate}
          onSave={onUpsert}
          onClose={() => setEditingType(null)}
        />
      )}
    </section>
  );
}
