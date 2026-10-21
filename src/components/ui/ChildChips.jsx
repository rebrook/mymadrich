import { useRef } from 'react';
import { isChildCompleted } from '../../utils/familyChildren';

/**
 * ChildChips — how a family chooses between their children.
 *
 * A single choice among a handful of options, always visible, one tap to switch. The label
 * describes the CHILD (name and where they stand), never a parent: a family picking a child
 * should not be shown anyone's parent. Staff and large families keep the searchable
 * StudentSwitcher; this is used for 2 to 5 children.
 *
 * Accessible as a radio group: one tab stop, arrow keys / Home / End move and select.
 * Chips wrap onto a second row instead of shrinking, so no name is ever cut off.
 *
 * Props:
 *   students   - array of { id, first_name, last_name, status, mitzvah_date }
 *   selectedId - the child being viewed, or null
 *   onSelect   - callback(id)
 *   label      - accessible name for the group
 */
export default function ChildChips({
  students = [],
  selectedId = null,
  onSelect,
  label = 'Choose a child',
}) {
  const refs = useRef({});

  // Two children with the same first name get a last initial so they stay distinguishable
  const firstNameCounts = {};
  students.forEach((s) => {
    const key = (s.first_name || '').trim().toLowerCase();
    firstNameCounts[key] = (firstNameCounts[key] || 0) + 1;
  });

  function chipName(s) {
    const first = (s.first_name || '').trim();
    const lastInitial = (s.last_name || '').trim().charAt(0);
    if (firstNameCounts[first.toLowerCase()] > 1 && lastInitial) return `${first} ${lastInitial}.`;
    return first || 'Child';
  }

  function statusLine(s) {
    const date = formatShortDate(s.mitzvah_date);
    if (isChildCompleted(s)) return date ? `Completed ${date}` : 'Completed';
    return date || 'Date not set';
  }

  // The one tab stop: the selected chip, or the first when nothing is selected yet
  const tabStopId = students.some((s) => s.id === selectedId) ? selectedId : (students[0] && students[0].id);

  function handleKeyDown(e) {
    const ids = students.map((s) => s.id);
    const current = ids.indexOf(document.activeElement && document.activeElement.dataset
      ? document.activeElement.dataset.childId
      : null);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1 + ids.length) % ids.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (current - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ids.length - 1;
    if (next === null || ids.length === 0) return;
    e.preventDefault();
    const id = ids[next];
    if (onSelect) onSelect(id);
    const el = refs.current[id];
    if (el) el.focus();
  }

  if (students.length === 0) return null;

  return (
    <div className="child-chips" role="radiogroup" aria-label={label} onKeyDown={handleKeyDown}>
      {students.map((s) => {
        const selected = s.id === selectedId;
        return (
          <button
            key={s.id}
            ref={(el) => { refs.current[s.id] = el; }}
            data-child-id={s.id}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={s.id === tabStopId ? 0 : -1}
            className={`child-chip${selected ? ' child-chip-selected' : ''}`}
            onClick={() => { if (onSelect) onSelect(s.id); }}
          >
            <span className="child-chip-name">{chipName(s)}</span>
            <span className="child-chip-status">{statusLine(s)}</span>
          </button>
        );
      })}
    </div>
  );
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
