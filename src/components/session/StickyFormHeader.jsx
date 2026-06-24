import { useState, useRef } from 'react';
import StudentSwitcher from '../ui/StudentSwitcher';
import { formatDateCompact, formatDateShort } from '../../utils/datetime';

/**
 * Sticky Form Header (v2 Section 6.12 + Session 14 cohort-scoped picker).
 *
 * Desktop (>= 1024px): sticky row at top of form with avatar, student,
 * date, running tally, and Save button.
 * Mobile (< 1024px): student + date in a flow card; tally + save in a
 * fixed bar above bottom nav.
 *
 * Both layouts are rendered; CSS controls visibility.
 */
export default function StickyFormHeader({
  // Student
  students,
  selectedStudentId,
  onSelectStudent,
  isEditMode,
  studentName,
  studentInitials,
  loadingStudents,
  // Cohort (Session 14)
  activeCohortId,
  activeCohortLabel,
  onCohortMismatch,
  // Date
  sessionDate,
  onDateChange,
  // Tally
  verseCount,
  elementCount,
  homeworkCount,
  nextSessionDate,
  // Save
  onSave,
  saving,
  disabled,
  disabledReason,
  saveLabel,
}) {
  const [editingDate, setEditingDate] = useState(false);
  const dateInputRef = useRef(null);

  // ---- Tally text ----
  const ratedCount = verseCount + elementCount;
  const tallyParts = [];
  if (ratedCount > 0) {
    tallyParts.push(`${verseCount} verse${verseCount !== 1 ? 's' : ''} rated`);
  }
  if (homeworkCount > 0) {
    tallyParts.push(`${homeworkCount} homework item${homeworkCount !== 1 ? 's' : ''}`);
  }
  if (nextSessionDate) {
    const nextFormatted = formatDateShort(nextSessionDate);
    tallyParts.push(`next session ${nextFormatted}`);
  }
  const tallyText = tallyParts.length > 0 ? tallyParts.join(' \u00B7 ') : 'No items rated';

  // ---- Formatted date ----
  const formattedDate = sessionDate
    ? formatDateCompact(sessionDate)
    : 'No date set';

  // ---- Date edit handlers ----
  function handleDateClick() {
    setEditingDate(true);
    requestAnimationFrame(() => {
      dateInputRef.current?.showPicker?.();
      dateInputRef.current?.focus();
    });
  }

  function handleDateBlur() {
    setEditingDate(false);
  }

  function handleDateChange(e) {
    onDateChange(e.target.value);
    setEditingDate(false);
  }

  // ---- Student area rendering ----
  function renderStudentArea(className) {
    if (isEditMode) {
      return (
        <div className={`sfh-student ${className || ''}`}>
          <span className="sfh-avatar" aria-hidden="true">{studentInitials}</span>
          <span className="sfh-student-name">{studentName}</span>
        </div>
      );
    }

    return (
      <div className={`sfh-student ${className || ''}`}>
        {loadingStudents ? (
          <span className="sfh-student-name sfh-student-loading">Loading students...</span>
        ) : (
          <StudentSwitcher
            students={students}
            selectedStudentId={selectedStudentId}
            onSelect={onSelectStudent}
            placeholder="Select student..."
            activeCohortId={activeCohortId}
            activeCohortLabel={activeCohortLabel}
            onCohortMismatch={onCohortMismatch}
          />
        )}
      </div>
    );
  }

  // ---- Date area rendering ----
  function renderDateArea(className) {
    return (
      <div className={`sfh-date ${className || ''}`}>
        {editingDate ? (
          <input
            ref={dateInputRef}
            type="date"
            className="input sfh-date-input"
            value={sessionDate}
            onChange={handleDateChange}
            onBlur={handleDateBlur}
          />
        ) : (
          <button
            className="sfh-date-trigger"
            onClick={handleDateClick}
            type="button"
            aria-label={`Session date: ${formattedDate}. Click to change.`}
          >
            <span>{formattedDate}</span>
            <svg className="sfh-date-pencil" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 2l2 2-8 8H2v-2l8-8z" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // ---- Tally + Save rendering ----
  function renderTallySave(className) {
    return (
      <div className={`sfh-actions ${className || ''}`}>
        <span className="sfh-tally">{tallyText}</span>
        <div className="sfh-save-wrap">
          <button
            className="btn btn-primary sfh-save-btn"
            onClick={onSave}
            disabled={saving || disabled}
            type="button"
          >
            {saving ? 'Saving...' : saveLabel}
          </button>
          {disabled && !saving && disabledReason && (
            <span className="sfh-save-reason">{disabledReason}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop: single sticky row */}
      <div className="sticky-form-header sfh-desktop">
        {renderStudentArea()}
        {renderDateArea()}
        {renderTallySave()}
      </div>

      {/* Mobile: student + date in flow */}
      <div className="sfh-mobile-info card">
        {renderStudentArea()}
        {renderDateArea()}
      </div>

      {/* Mobile: tally + save fixed bar above bottom nav */}
      <div className="sfh-mobile-bar">
        {renderTallySave()}
      </div>
    </>
  );
}
