import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Homework Builder (v2 Section 6.13).
 *
 * Gold accent card that auto-populates removable chips from rated
 * verses/elements, offers a "+ Add" chip for manual additions, and
 * provides notes + minutes/day inputs.
 *
 * Props:
 *   readings            – full readings array from studentDetail
 *   elements            – full elements array from studentDetail
 *   verseProgress       – { [verseId]: { rated, quality, ... } }
 *   elementProgress     – { [elementId]: { rated, quality, ... } }
 *   homeworkSelections   – { [key]: boolean } where key = 'reading-<id>' or 'element-<id>'
 *   onToggleHomework     – (key) => void — toggles a homework selection
 *   homeworkNotes        – string
 *   onNotesChange        – (value) => void
 *   homeworkMinutes      – string
 *   onMinutesChange      – (value) => void
 */
export default function HomeworkBuilder({
  readings = [],
  elements = [],
  verseProgress = {},
  elementProgress = {},
  homeworkSelections = {},
  onToggleHomework,
  homeworkNotes = '',
  onNotesChange,
  homeworkMinutes = '',
  onMinutesChange,
}) {
  const [addOpen, setAddOpen] = useState(false);
  const popoverRef = useRef(null);

  // ---- Derive active chips (selected items) ----

  const activeChips = [];

  readings.forEach((r) => {
    const key = `reading-${r.id}`;
    if (homeworkSelections[key]) {
      activeChips.push({
        key,
        label: `${r.portion_name}${r.aliyah ? ' ' + r.aliyah : ''}`,
        type: 'reading',
      });
    }
  });

  elements.forEach((el) => {
    const key = `element-${el.id}`;
    if (homeworkSelections[key]) {
      activeChips.push({
        key,
        label: el.label,
        type: 'element',
      });
    }
  });

  // ---- Derive available items for "+ Add" popover ----

  const availableItems = [];

  readings.forEach((r) => {
    const key = `reading-${r.id}`;
    if (!homeworkSelections[key]) {
      availableItems.push({
        key,
        label: `${r.portion_name}${r.aliyah ? ' ' + r.aliyah : ''}`,
        type: 'reading',
      });
    }
  });

  elements.forEach((el) => {
    const key = `element-${el.id}`;
    if (!homeworkSelections[key]) {
      availableItems.push({
        key,
        label: el.label,
        type: 'element',
      });
    }
  });

  // ---- Close popover on outside click ----

  const handleOutsideClick = useCallback((e) => {
    if (popoverRef.current && !popoverRef.current.contains(e.target)) {
      setAddOpen(false);
    }
  }, []);

  useEffect(() => {
    if (addOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [addOpen, handleOutsideClick]);

  // ---- Handlers ----

  function removeChip(key) {
    onToggleHomework(key, false);
  }

  function addItem(key) {
    onToggleHomework(key, true);
    setAddOpen(false);
  }

  return (
    <div className="homework-builder card">
      <div className="homework-builder-header">
        <span className="homework-builder-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4.5h14a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1v-10a1 1 0 011-1z" />
            <path d="M2 7.5h16" />
            <path d="M7 4.5v-2" />
            <path d="M13 4.5v-2" />
          </svg>
        </span>
        <h3>Homework</h3>
      </div>

      {/* Chips */}
      <div className="homework-chips-wrap">
        {activeChips.map((chip) => (
          <span key={chip.key} className="homework-chip">
            <span className="homework-chip-label">{chip.label}</span>
            <button
              className="homework-chip-remove"
              onClick={() => removeChip(chip.key)}
              type="button"
              aria-label={`Remove ${chip.label} from homework`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <line x1="3" y1="3" x2="9" y2="9" />
                <line x1="9" y1="3" x2="3" y2="9" />
              </svg>
            </button>
          </span>
        ))}

        {/* "+ Add" chip */}
        {availableItems.length > 0 && (
          <span className="homework-chip-add-wrapper" ref={popoverRef}>
            <button
              className="homework-chip-add"
              onClick={() => setAddOpen((prev) => !prev)}
              type="button"
              aria-expanded={addOpen}
              aria-label="Add homework item"
            >
              + Add
            </button>

            {addOpen && (
              <ul className="homework-add-popover" role="listbox">
                {availableItems.map((item) => (
                  <li key={item.key} role="option">
                    <button
                      className="homework-add-item"
                      onClick={() => addItem(item.key)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </span>
        )}

        {activeChips.length === 0 && availableItems.length === 0 && (
          <span className="homework-chip-empty">No items to assign</span>
        )}
      </div>

      {/* Notes + Minutes */}
      <div className="homework-builder-fields">
        <div className="form-group" style={{ flex: 2 }}>
          <label className="form-label">Additional Notes</label>
          <textarea
            className="input"
            rows={2}
            value={homeworkNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Any extra homework instructions..."
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Daily Practice (min)</label>
          <input
            type="number"
            className="input"
            value={homeworkMinutes}
            onChange={(e) => onMinutesChange(e.target.value)}
            placeholder="e.g., 15"
            min="0"
          />
        </div>
      </div>
    </div>
  );
}
