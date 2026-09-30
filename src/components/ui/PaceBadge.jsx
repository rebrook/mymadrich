import React, { useState, useRef, useEffect, useId } from 'react';

const PACE = {
  ahead:       { label: 'Ahead',       color: 'var(--color-pace-ahead)',    icon: 'arrowUp' },
  on_track:    { label: 'On Track',    color: 'var(--color-pace-on-track)',  icon: 'check' },
  behind:      { label: 'Behind',      color: 'var(--color-pace-behind)',    icon: 'arrowDown' },
  critical:    { label: 'Critical',    color: 'var(--color-pace-critical)',  icon: 'alert' },
  completed:   { label: 'Completed',   color: 'var(--color-pace-on-track)',  icon: 'check' },
  past_due:    { label: 'Past Due',    color: 'var(--color-pace-critical)',  icon: 'alert' },
  not_started: { label: 'Not Started', color: 'var(--color-pace-neutral)',   icon: null },
  no_verses:   { label: 'No Verses',   color: 'var(--color-pace-neutral)',   icon: null },
  family_tutored: { label: 'Family-tutored', color: 'var(--color-pace-neutral)', icon: null },
};

/** Inline SVG icons at 12px, matching the 20x20 / 1.5px stroke style. */
function PaceIcon({ name }) {
  const props = {
    width: 12,
    height: 12,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    style: { flexShrink: 0 },
  };

  switch (name) {
    case 'arrowUp':
      return <svg {...props}><line x1="10" y1="16" x2="10" y2="4" /><polyline points="5 9 10 4 15 9" /></svg>;
    case 'arrowDown':
      return <svg {...props}><line x1="10" y1="4" x2="10" y2="16" /><polyline points="15 11 10 16 5 11" /></svg>;
    case 'check':
      return <svg {...props}><polyline points="4 10 8 14 16 6" /></svg>;
    case 'alert':
      return <svg {...props}><line x1="10" y1="6" x2="10" y2="11" /><circle cx="10" cy="14.5" r="0.5" fill="currentColor" stroke="none" /></svg>;
    default:
      return null;
  }
}

/**
 * PaceBadge — colored pill signalling a student's progress against their
 * suggested timeline. Admin/tutor surfaces only.
 *
 * When `rationale` is provided, the badge gains a tooltip (hover + focus on
 * desktop, tap-to-toggle on mobile) explaining the pace calculation.
 * Without `rationale`, it renders exactly as before — fully backward-compatible.
 */
export function PaceBadge({ status, size = 'sm', rationale, className = '' }) {
  const cfg = PACE[status];
  if (!cfg) return null;

  const sizeClass = size === 'lg' ? 'pace-badge-lg' : 'pace-badge-sm';

  // No rationale — render the simple badge (original behavior)
  if (!rationale) {
    return (
      <span
        className={`pace-badge ${sizeClass} ${className}`}
        style={{ backgroundColor: cfg.color }}
      >
        {cfg.icon ? <PaceIcon name={cfg.icon} /> : null}
        {cfg.label}
      </span>
    );
  }

  // With rationale — wrap in a tooltip container
  return (
    <PaceBadgeWithTooltip
      cfg={cfg}
      sizeClass={sizeClass}
      className={className}
      rationale={rationale}
    />
  );
}

/**
 * Internal component: PaceBadge + tooltip behavior.
 * Separated to keep the no-rationale path free of hook overhead.
 */
function PaceBadgeWithTooltip({ cfg, sizeClass, className, rationale }) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();
  const containerRef = useRef(null);
  const hoverTimeout = useRef(null);

  // Close on outside click (mobile tap-away)
  useEffect(() => {
    if (!visible) return;

    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setVisible(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [visible]);

  // Escape key closes tooltip
  useEffect(() => {
    if (!visible) return;
    function handleKey(e) {
      if (e.key === 'Escape') setVisible(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [visible]);

  function handleMouseEnter() {
    clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setVisible(true), 200);
  }

  function handleMouseLeave() {
    clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setVisible(false), 150);
  }

  function handleClick(e) {
    // Toggle on tap (mobile); prevent row click propagation
    e.stopPropagation();
    setVisible((prev) => !prev);
  }

  function handleFocus() {
    setVisible(true);
  }

  function handleBlur() {
    setVisible(false);
  }

  return (
    <span
      ref={containerRef}
      className={`pace-badge-tooltip-wrap ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className={`pace-badge pace-badge-interactive ${sizeClass}`}
        style={{ backgroundColor: cfg.color }}
        onClick={handleClick}
        onFocus={handleFocus}
        onBlur={handleBlur}
        aria-describedby={visible ? tooltipId : undefined}
        aria-expanded={visible}
      >
        {cfg.icon ? <PaceIcon name={cfg.icon} /> : null}
        {cfg.label}
      </button>

      {visible && (
        <div
          id={tooltipId}
          className="pace-badge-tooltip"
          role="tooltip"
          onMouseEnter={() => clearTimeout(hoverTimeout.current)}
          onMouseLeave={handleMouseLeave}
        >
          <span className="pace-badge-tooltip-arrow" />
          <span className="pace-badge-tooltip-text">{rationale}</span>
        </div>
      )}
    </span>
  );
}

// Re-export default for backward compat with existing imports
export default PaceBadge;
