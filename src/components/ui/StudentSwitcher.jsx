import { useState, useRef, useEffect, useCallback, useId, forwardRef, useImperativeHandle } from 'react';

/**
 * Student Switcher (v2 Section 6.2 + Session 14 cohort grouping).
 * Searchable combobox with avatar, student name, and guardian metadata.
 *
 * Props:
 *   students           - array of student objects (with optional cohort data)
 *   selectedStudentId  - currently selected student ID, or null
 *   onSelect(id)       - callback when a student is chosen
 *   placeholder        - trigger text when no student selected
 *   activeCohortId     - UUID of the active cohort (optional; enables grouping)
 *   activeCohortLabel  - display label for the active cohort (e.g., "Cohort 5786 · 7 students")
 *   onCohortMismatch   - callback(student) when an out-of-cohort student is picked;
 *                         caller is responsible for showing the confirm modal.
 *                         If not provided, selection proceeds without guard.
 *
 * Ref: exposes focus(), which moves focus to the trigger button. A parent can
 * use it (e.g. to point at a validation message) without knowing this markup.
 */
const StudentSwitcher = forwardRef(function StudentSwitcher({
  students = [],
  selectedStudentId = null,
  onSelect,
  placeholder = 'Switch student',
  activeCohortId = null,
  activeCohortLabel = null,
  onCohortMismatch = null,
}, ref) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [showOtherCohorts, setShowOtherCohorts] = useState(false);

  const comboId = useId();
  const listboxId = `${comboId}-listbox`;

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const triggerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => triggerRef.current?.focus(),
  }), []);

  // ---- Derived data ----

  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  const filtered = students.filter((s) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const fullName = `${s.first_name} ${s.last_name}`.toLowerCase();
    const guardianNames = (s.guardians || [])
      .map((g) => `${g.first_name || ''} ${g.last_name || ''}`.toLowerCase())
      .join(' ');
    return fullName.includes(q) || guardianNames.includes(q);
  });

  // Split into active cohort and other cohorts when grouping is enabled
  const hasCohortGrouping = Boolean(activeCohortId);
  const activeCohortStudents = hasCohortGrouping
    ? filtered.filter((s) => s.cohort_id === activeCohortId)
    : filtered;
  const otherCohortStudents = hasCohortGrouping
    ? filtered.filter((s) => s.cohort_id !== activeCohortId)
    : [];

  // Group the "other" students by their cohort name
  const otherCohortGroups = {};
  otherCohortStudents.forEach((s) => {
    const cohortName = s.cohort?.name || 'No Cohort';
    if (!otherCohortGroups[cohortName]) otherCohortGroups[cohortName] = [];
    otherCohortGroups[cohortName].push(s);
  });

  // Flat list for keyboard navigation index tracking
  const flatList = hasCohortGrouping
    ? [
        ...activeCohortStudents,
        ...(showOtherCohorts || query.trim() ? otherCohortStudents : []),
      ]
    : filtered;

  // ---- Helpers ----

  function getInitials(student) {
    const first = student.first_name?.charAt(0) || '';
    const last = student.last_name?.charAt(0) || '';
    return `${first}${last}`.toUpperCase();
  }

  function getGuardianLabel(student) {
    const guardians = student.guardians || [];
    if (guardians.length === 0) return '';
    const primary = guardians.find((g) => g.is_primary) || guardians[0];
    const name = [primary.first_name, primary.last_name].filter(Boolean).join(' ');
    return name || '';
  }

  function getDisplayName(student) {
    return `${student.first_name} ${student.last_name}`;
  }

  // ---- Open / close ----

  function openDropdown() {
    setOpen(true);
    setQuery('');
    setFocusedIndex(-1);
    setShowOtherCohorts(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function closeDropdown(returnFocus = true) {
    setOpen(false);
    setQuery('');
    setFocusedIndex(-1);
    if (returnFocus) triggerRef.current?.focus();
  }

  function selectStudent(student) {
    // Cohort mismatch guard
    if (hasCohortGrouping && student.cohort_id !== activeCohortId && onCohortMismatch) {
      closeDropdown();
      onCohortMismatch(student);
      return;
    }
    onSelect?.(student.id);
    closeDropdown();
  }

  // ---- Outside click ----

  const handleOutsideClick = useCallback(
    (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        closeDropdown(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open, handleOutsideClick]);

  // ---- Keyboard ----

  function handleTriggerKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDropdown();
    }
  }

  function handleInputKeyDown(e) {
    const count = flatList.length;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => (prev < count - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : count - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < count) {
          selectStudent(flatList[focusedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        break;
      case 'Tab':
        closeDropdown(false);
        break;
      default:
        break;
    }
  }

  // Reset focused index when filtered list changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [query]);

  // Scroll focused option into view
  useEffect(() => {
    if (focusedIndex < 0) return;
    const option = document.getElementById(`${comboId}-option-${focusedIndex}`);
    option?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex, comboId]);

  // ---- Render option row ----

  function renderOption(student, flatIndex, showCohortTag = false) {
    const isSelected = student.id === selectedStudentId;
    const isFocused = flatIndex === focusedIndex;
    return (
      <li
        key={student.id}
        id={`${comboId}-option-${flatIndex}`}
        className={[
          'student-switcher-option',
          isFocused ? 'student-switcher-option-focused' : '',
          isSelected ? 'student-switcher-option-selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="option"
        aria-selected={isSelected}
        onClick={() => selectStudent(student)}
        onMouseEnter={() => setFocusedIndex(flatIndex)}
      >
        <span className="student-switcher-option-avatar" aria-hidden="true">
          {getInitials(student)}
        </span>
        <span className="student-switcher-option-text">
          <span className="student-switcher-option-name">
            {getDisplayName(student)}
          </span>
          {getGuardianLabel(student) && (
            <span className="student-switcher-option-meta">
              {getGuardianLabel(student)}
            </span>
          )}
        </span>
        {showCohortTag && student.cohort?.name && (
          <span className="student-switcher-cohort-tag">
            {student.cohort.name}
          </span>
        )}
      </li>
    );
  }

  // ---- Render ----

  const activeDescendant =
    focusedIndex >= 0 ? `${comboId}-option-${focusedIndex}` : undefined;

  return (
    <div className="student-switcher" ref={containerRef}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        className="student-switcher-trigger"
        onClick={open ? () => closeDropdown() : openDropdown}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        type="button"
      >
        <span className="student-switcher-trigger-icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <span
          className={`student-switcher-trigger-text ${
            !selectedStudent ? 'student-switcher-trigger-text-placeholder' : ''
          }`}
        >
          {selectedStudent ? getDisplayName(selectedStudent) : placeholder}
        </span>
        <span className="student-switcher-trigger-chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="student-switcher-dropdown">
          <div className="student-switcher-search">
            <span className="student-switcher-trigger-icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              ref={inputRef}
              className="student-switcher-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Search students..."
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={activeDescendant}
              aria-autocomplete="list"
              autoComplete="off"
            />
          </div>

          <ul
            id={listboxId}
            className="student-switcher-list"
            role="listbox"
            aria-label="Students"
          >
            {flatList.length === 0 ? (
              <li className="student-switcher-empty" role="option" aria-disabled="true">
                No students found
              </li>
            ) : hasCohortGrouping && !query.trim() ? (
              <>
                {/* Active cohort header */}
                {activeCohortLabel && (
                  <li className="student-switcher-cohort-label" role="presentation">
                    {activeCohortLabel}
                  </li>
                )}

                {/* Active cohort students */}
                {activeCohortStudents.map((student) => {
                  const flatIndex = flatList.indexOf(student);
                  return renderOption(student, flatIndex, false);
                })}

                {activeCohortStudents.length === 0 && (
                  <li className="student-switcher-empty" role="presentation">
                    No students in this cohort
                  </li>
                )}

                {/* "Show other cohorts" toggle */}
                {otherCohortStudents.length > 0 && !showOtherCohorts && (
                  <li role="presentation">
                    <button
                      type="button"
                      className="student-switcher-group-divider"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowOtherCohorts(true);
                      }}
                    >
                      Show {otherCohortStudents.length} student{otherCohortStudents.length !== 1 ? 's' : ''} from other cohorts
                    </button>
                  </li>
                )}

                {/* Other cohort students (grouped) */}
                {showOtherCohorts && Object.entries(otherCohortGroups).map(([cohortName, groupStudents]) => (
                  <li key={cohortName} role="presentation">
                    <div className="student-switcher-cohort-label" style={{ borderTop: '1px solid var(--color-border)' }}>
                      {cohortName}
                    </div>
                    <ul role="group" aria-label={cohortName} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {groupStudents.map((student) => {
                        const flatIndex = flatList.indexOf(student);
                        return renderOption(student, flatIndex, true);
                      })}
                    </ul>
                  </li>
                ))}
              </>
            ) : (
              /* Flat list: no grouping (backward-compatible or search active) */
              flatList.map((student, index) => renderOption(student, index, hasCohortGrouping))
            )}
          </ul>
        </div>
      )}
    </div>
  );
});

export default StudentSwitcher;

// ---- Icons ----

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" />
      <line x1="10.5" y1="10.5" x2="14" y2="14" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4 6 8 10 12 6" />
    </svg>
  );
}
