import { useState } from 'react';
import {
  QUALITY_COLORS,
  COLOR_GRAY,
  getQualityLabels,
  QUALITY_LABEL_NOT_STARTED,
} from '../../utils/constants';

// ---- Tint palette: light bg + dark text per status ----

const TINT_MAP = {
  perfect: { bg: '#eaf3de', text: '#27500a' },
  minor_mistakes: { bg: '#f0f4d6', text: '#3d5a0f' },
  moderate_mistakes: { bg: '#fdf3d7', text: '#6b4c04' },
  still_learning: { bg: '#fde8da', text: '#6b2d0a' },
};

/**
 * ElementGroup (v2 Section 6.7)
 *
 * Renders a category group with eyebrow label.
 * Collapses consecutive not-started items of the same family
 * into one expandable row when 2+ consecutive exist.
 *
 * Props:
 *   category  – category key (e.g., "blessings")
 *   label     – formatted category label
 *   items     – array of element status objects (sorted by sort_order)
 *   role      – viewer role for quality labels
 */
export function ElementGroup({ category, label, items, role }) {
  if (!items || items.length === 0) return null;

  // Build collapsed runs: consecutive not-started items
  const rows = buildCollapsedRows(items);

  return (
    <div className="element-group">
      <span className="element-group-eyebrow">{label}</span>
      <div className="element-group-list">
        {rows.map((row, i) =>
          row.type === 'single' ? (
            <ElementRow key={row.item.element_id} item={row.item} role={role} />
          ) : (
            <CollapsedRow
              key={`collapse-${category}-${i}`}
              items={row.items}
              role={role}
            />
          ),
        )}
      </div>
    </div>
  );
}

/**
 * Builds an array of { type: 'single', item } or { type: 'collapsed', items }
 * by grouping consecutive not-started items.
 */
function buildCollapsedRows(items) {
  const rows = [];
  let i = 0;

  while (i < items.length) {
    if (!items[i].quality) {
      // Start of a not-started run
      const runStart = i;
      while (i < items.length && !items[i].quality) {
        i++;
      }
      const run = items.slice(runStart, i);
      if (run.length >= 2) {
        rows.push({ type: 'collapsed', items: run });
      } else {
        rows.push({ type: 'single', item: run[0] });
      }
    } else {
      rows.push({ type: 'single', item: items[i] });
      i++;
    }
  }

  return rows;
}

/**
 * ElementRow: single element with tinted surface or noise floor.
 */
function ElementRow({ item, role }) {
  const hasStatus = !!item.quality;
  const tint = hasStatus ? TINT_MAP[item.quality] : null;
  const labels = getQualityLabels(role, 'element');
  const statusLabel = hasStatus
    ? labels[item.quality] || item.quality
    : QUALITY_LABEL_NOT_STARTED;

  const dotColor = hasStatus
    ? QUALITY_COLORS[item.quality] || COLOR_GRAY
    : COLOR_GRAY;

  return (
    <div
      className={`element-row ${hasStatus ? 'element-row-tinted' : 'element-row-noise'}`}
      style={
        tint
          ? { backgroundColor: tint.bg, color: tint.text }
          : undefined
      }
    >
      <span
        className="element-row-dot"
        style={{ backgroundColor: dotColor }}
        aria-hidden="true"
      />
      <span className="element-row-label">{item.label}</span>
      <span className="element-row-status">{statusLabel}</span>
    </div>
  );
}

/**
 * CollapsedRow: collapsed group of consecutive not-started items.
 * Shows "0 of N started", expandable on tap.
 */
function CollapsedRow({ items, role }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="element-collapse">
      <button
        type="button"
        className="element-collapse-toggle element-row element-row-noise"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span
          className="element-row-dot"
          style={{ backgroundColor: COLOR_GRAY }}
          aria-hidden="true"
        />
        <span className="element-row-label">
          {items[0].label}
          {items.length > 1 && (
            <span className="element-collapse-count">
              {' '}and {items.length - 1} more
            </span>
          )}
        </span>
        <span className="element-row-status">
          0 of {items.length} started
        </span>
        <span className="element-collapse-chevron" aria-hidden="true">
          {expanded ? '\u25B4' : '\u25BE'}
        </span>
      </button>
      {expanded && (
        <div className="element-collapse-body">
          {items.map((item) => (
            <ElementRow key={item.element_id} item={item} role={role} />
          ))}
        </div>
      )}
    </div>
  );
}

export default ElementRow;
