import { useState, useRef, useEffect, useMemo } from 'react';

/**
 * TimeCombobox
 *
 * A single text field showing a formatted time ("9:00 AM") that opens a
 * dropdown list of preset 15-minute options on focus/click. Typing filters
 * the list. Value in/out is the same "HH:MM" 24-hour string the rest of the
 * app already uses, so callers don't need to change.
 *
 * Replaces the earlier three-<select> TimeSelect component with a single
 * combobox pattern (text input + filtered dropdown list), matching the
 * "text input with smart autocomplete" pattern used by mature scheduling
 * UIs (e.g. Klaviyo's send-time picker).
 */

// Build all 96 options for a full day in 15-minute increments.
const ALL_OPTIONS = (() => {
  const opts = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const period = h < 12 ? 'AM' : 'PM';
      let hour12 = h % 12;
      if (hour12 === 0) hour12 = 12;
      const display = `${hour12}:${String(m).padStart(2, '0')} ${period}`;
      opts.push({ value, display });
    }
  }
  return opts;
})();

function formatDisplay(value) {
  if (!value) return '';
  const match = ALL_OPTIONS.find((o) => o.value === value);
  return match ? match.display : '';
}

export default function TimeCombobox({ value, onChange, disabled = false, ariaLabel = 'Time' }) {
  const [inputText, setInputText] = useState(formatDisplay(value));
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);
  const listRef = useRef(null);

  // Keep the visible text in sync when the controlled value changes
  // from outside (e.g. loading an existing session for edit).
  useEffect(() => {
    setInputText(formatDisplay(value));
  }, [value]);

  // Close the dropdown on outside click.
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setInputText(formatDisplay(value));
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value]);

  const filteredOptions = useMemo(() => {
    const q = inputText.trim().toLowerCase();
    if (!q) return ALL_OPTIONS;
    // Filter on the displayed format, e.g. typing "3" matches "3:00 AM", "3:15 PM", etc.
    return ALL_OPTIONS.filter((o) => o.display.toLowerCase().replace(/\s/g, '').includes(q.replace(/\s/g, '')));
  }, [inputText]);

  function openList() {
    setIsOpen(true);
    setHighlightedIndex(-1);
  }

  function selectOption(opt) {
    onChange(opt.value);
    setInputText(opt.display);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }

  function handleInputChange(e) {
    setInputText(e.target.value);
    setIsOpen(true);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(e) {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      openList();
      return;
    }
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
        selectOption(filteredOptions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setInputText(formatDisplay(value));
    }
  }

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightedIndex];
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  return (
    <div className="time-combobox" ref={containerRef}>
      <input
        type="text"
        className="input time-combobox-input"
        value={inputText}
        onChange={handleInputChange}
        onFocus={openList}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="--:-- --"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        autoComplete="off"
      />
      {isOpen && (
        <ul className="time-combobox-list" role="listbox" ref={listRef}>
          {filteredOptions.length === 0 && (
            <li className="time-combobox-empty">No matching times</li>
          )}
          {filteredOptions.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={[
                'time-combobox-option',
                i === highlightedIndex ? 'time-combobox-option-highlighted' : '',
                opt.value === value ? 'time-combobox-option-selected' : '',
              ].filter(Boolean).join(' ')}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus, avoid blur firing first
                selectOption(opt);
              }}
              onMouseEnter={() => setHighlightedIndex(i)}
            >
              {opt.display}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
