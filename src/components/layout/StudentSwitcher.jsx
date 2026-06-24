import { useState, useRef, useEffect, useCallback, useId } from 'react';

/**
 * Student Switcher (v2 Section 6.2).
 * Searchable combobox with avatar, student name, and guardian metadata.
 * Created in Session B; integration into pages happens in Sessions C, D, F.
 *
 * Props:
 *   students       – array of { id, first_name, last_name, hebrew_name, guardians }
 *   selectedStudentId – currently selected student ID, or null
 *   onSelect(id)   – callback when a student is chosen
 *   placeholder     – trigger text when no student selected (default: "Switch student")
 */
export default function StudentSwitcher({
  students = [],
  selectedStudentId = null,
  onSelect,
  placeholder = 'Switch student',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const comboId = useId();
  const listboxId = `${comboId}-listbox`;

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const triggerRef = useRef(null);

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
    // Focus input after render
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function closeDropdown(returnFocus = true) {
    setOpen(false);
    setQuery('');
    setFocusedIndex(-1);
    if (returnFocus) triggerRef.current?.focus();
  }

  function selectStudent(id) {
    onSelect?.(id);
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
    const count = filtered.length;

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
          selectStudent(filtered[focusedIndex].id);
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
            {filtered.length === 0 ? (
              <li className="student-switcher-empty" role="option" aria-disabled="true">
                No students found
              </li>
            ) : (
              filtered.map((student, index) => {
                const isSelected = student.id === selectedStudentId;
                const isFocused = index === focusedIndex;
                return (
                  <li
                    key={student.id}
                    id={`${comboId}-option-${index}`}
                    className={[
                      'student-switcher-option',
                      isFocused ? 'student-switcher-option-focused' : '',
                      isSelected ? 'student-switcher-option-selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectStudent(student.id)}
                    onMouseEnter={() => setFocusedIndex(index)}
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
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

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
