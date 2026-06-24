import { useState } from 'react';
import {
  QUALITY,
  getQualityLabels,
  QUALITY_COLORS,
  COLOR_GOLD,
  COLOR_GOLD_HALF,
} from '../../utils/constants';

/**
 * Quality buttons rendered in best-to-worst order.
 * Each entry carries label, value, and CSS custom property for its color.
 */
const QUALITY_ORDER = [
  QUALITY.PERFECT,
  QUALITY.MINOR_MISTAKES,
  QUALITY.MODERATE_MISTAKES,
  QUALITY.STILL_LEARNING,
];

const STATUS_OPTIONS = [
  { value: 'review', label: 'Review' },
  { value: 'new', label: 'New' },
  { value: 'torah_side_transfer', label: 'Transferring' },
  { value: 'torah_side', label: 'Torah Side' },
];

/**
 * Inline Rater (v2 Section 6.11).
 *
 * Opens beneath a tapped pill. Verse mode shows a status segmented
 * control + quality buttons. Element mode shows quality buttons + a
 * collapsible "Add note" input. Only one rater is open at a time
 * (managed by the parent page).
 *
 * Props:
 *   type           – 'verse' | 'element'
 *   itemRef        – display label (e.g., "Genesis 12:1" or "Opening Prayer")
 *   readingType    – 'torah' | 'haftarah' (verse mode; controls Torah Side visibility)
 *   status         – current verse status (verse mode only)
 *   quality        – current quality value or null
 *   notes          – current notes string (element mode only)
 *   showNotes      – if true, notes input renders expanded on mount (edit mode)
 *   onStatusChange – (newStatus) => void (verse mode)
 *   onQualityChange – (newQuality) => void
 *   onNotesChange  – (newNotes) => void (element mode)
 *   onClose        – () => void
 */
export default function InlineRater({
  type = 'verse',
  itemRef,
  readingType,
  status,
  quality,
  notes = '',
  showNotes = false,
  onStatusChange,
  onQualityChange,
  onNotesChange,
  onClose,
}) {
  const isVerse = type === 'verse';
  const [notesExpanded, setNotesExpanded] = useState(showNotes || (notes && notes.length > 0));

  // Resolve gold state: perfect + torah_side or torah_side_transfer
  function getButtonColor(qualityValue) {
    if (qualityValue === QUALITY.PERFECT && !isVerse) return QUALITY_COLORS[qualityValue];
    if (qualityValue === QUALITY.PERFECT && status === 'torah_side') return COLOR_GOLD;
    if (qualityValue === QUALITY.PERFECT && status === 'torah_side_transfer') return COLOR_GOLD_HALF;
    return QUALITY_COLORS[qualityValue];
  }

  // Quality labels keyed on item type: "Learned with Trope" for verses, "Learned" for elements
  const qualityLabels = getQualityLabels('tutor', isVerse ? 'verse' : 'element');

  return (
    <div className="inline-rater" role="group" aria-label={`Rate ${itemRef}`}>
      {/* Header */}
      <div className="inline-rater-header">
        <span className="inline-rater-ref">{itemRef}</span>
        <button
          className="inline-rater-close"
          onClick={onClose}
          type="button"
          aria-label="Close rater"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <line x1="4" y1="4" x2="12" y2="12" />
            <line x1="12" y1="4" x2="4" y2="12" />
          </svg>
        </button>
      </div>

      {/* Status segmented control (verse mode only) */}
      {isVerse && (
        <div className="rater-status-group" role="radiogroup" aria-label="Verse status">
          {STATUS_OPTIONS
            .filter((s) => (s.value !== 'torah_side' && s.value !== 'torah_side_transfer') || readingType === 'torah')
            .map((s) => (
              <button
                key={s.value}
                className={`rater-status-btn${status === s.value ? ' rater-status-btn-active' : ''}`}
                onClick={() => onStatusChange(s.value)}
                type="button"
                role="radio"
                aria-checked={status === s.value}
              >
                {s.label}
              </button>
            ))}
        </div>
      )}

      {/* Quality buttons */}
      <div className="rater-quality-row" role="radiogroup" aria-label="Quality rating">
        {QUALITY_ORDER.map((qValue) => {
          const isSelected = quality === qValue;
          const color = getButtonColor(qValue);
          const label = qualityLabels[qValue];

          return (
            <button
              key={qValue}
              className={`rater-quality-btn${isSelected ? ' rater-quality-btn-selected' : ''}`}
              style={
                isSelected
                  ? { backgroundColor: color, borderColor: color, color: '#fff' }
                  : { borderColor: color, color: color }
              }
              onClick={() => onQualityChange(qValue)}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={label}
            >
              {isSelected && (
                <svg className="rater-quality-check" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="2.5 7 5.5 10 11.5 4" />
                </svg>
              )}
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Notes (element mode only) */}
      {!isVerse && (
        <div className="rater-note-section">
          {notesExpanded ? (
            <input
              className="rater-note-input input"
              type="text"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Optional notes..."
              autoFocus={!showNotes}
            />
          ) : (
            <button
              className="rater-note-toggle"
              onClick={() => setNotesExpanded(true)}
              type="button"
            >
              + Add note
            </button>
          )}
        </div>
      )}
    </div>
  );
}
