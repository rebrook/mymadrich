/**
 * VerseProgress — colorblind-safe fill-cell verse grid.
 *
 * The product's signature progress display, replacing the rainbow pill grid.
 * Each verse is a rounded square that fills from bottom to top based on quality.
 * Progress is encoded as fill HEIGHT (length channel), not hue.
 *
 * Icon progression at 100% fill (colorblind-safe primary differentiator):
 *   L4 Learned with Trope   — green fill,     check mark (✓)
 *   L5 Transferring          — half-gold fill, outline star (SVG stroke-only)
 *   L6 Torah-side            — full gold fill, solid star (★)
 *
 * Exports:
 *   VerseProgress  — the main grid (display or rate mode)
 *   FillLegend     — standalone fill-swatch legend
 */

import { useState } from 'react';
import {
  getQualityLabels,
  QUALITY_LABEL_NOT_STARTED,
  QUALITY_LABEL_TORAH_TRANSFER,
  QUALITY_LABEL_TORAH_MASTERY,
} from '../../utils/constants';
import {
  getFillHeight,
  isGoldVerse,
  isHalfGoldVerse,
  isLitVerse,
  getActiveLevel,
  RATER_LEVELS,
  LEGEND_LEVELS,
} from '../../utils/verseFillLevels';
import HelpTip from './HelpTip';

/* ================================================================ */
/*  Inline SVG star icons (deterministic rendering, no Unicode)      */
/* ================================================================ */

/**
 * Outline star — SVG stroke-only, 1.5px, matching the bespoke icon set.
 * Used for L5 "Transferring to Torah side" (half-gold).
 * Renders identically across all platforms at any size.
 */
function OutlineStar({ size = 10, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M10 2l2.47 5.01L18 7.75l-4 3.9.94 5.51L10 14.68l-4.94 2.48.94-5.51-4-3.9 5.53-.74z" />
    </svg>
  );
}

/**
 * Solid (filled) star — same path, filled.
 * Used for L6 "Torah-side" (full gold).
 */
function SolidStar({ size = 10, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M10 2l2.47 5.01L18 7.75l-4 3.9.94 5.51L10 14.68l-4.94 2.48.94-5.51-4-3.9 5.53-.74z" />
    </svg>
  );
}

/* ================================================================ */
/*  Chapter grouping (verse numbers instead of sequential position)  */
/* ================================================================ */

/**
 * Parse "Book Chapter:Verse" into parts. Book name may contain
 * spaces (e.g. "1 Samuel"). Returns null if the ref doesn't match
 * the expected shape.
 */
function parseVerseRef(ref) {
  if (!ref) return null;
  const match = ref.match(/^(.+)\s+(\d+):(\d+)$/);
  if (!match) return null;
  return { book: match[1], chapter: match[2], verse: match[3] };
}

/**
 * Group a flat verses array into chapter groups, in original order.
 * Always groups, even for a single chapter, so the chapter label is
 * a consistent element regardless of how many chapters a reading
 * spans (deliberate: consistency over conditional UI).
 *
 * Falls back to the verse's position (1-based) as its displayed
 * number if the ref doesn't parse, rather than breaking the grid.
 */
function groupVersesByChapter(verses) {
  const groups = [];
  let currentKey = null;
  let currentGroup = null;

  verses.forEach((verse, index) => {
    const parsed = parseVerseRef(verse.ref);
    const key = parsed ? `${parsed.book} ${parsed.chapter}` : `__unparsed_${index}`;

    if (key !== currentKey) {
      currentGroup = {
        label: parsed ? `Chapter ${parsed.chapter}` : null,
        items: [],
      };
      groups.push(currentGroup);
      currentKey = key;
    }

    currentGroup.items.push({
      verse,
      verseNumber: parsed ? parsed.verse : String(index + 1),
    });
  });

  return groups;
}

/* ================================================================ */
/*  VerseProgress                                                    */
/* ================================================================ */

/**
 * Fill-cell verse grid.
 *
 * @param {Object} props
 * @param {Array}  props.verses   — { id, ref, quality, status, readingType, lastSessionDate? }
 * @param {string} props.mode     — 'display' (tap-to-reveal) or 'rate' (tap-to-select + rater)
 * @param {string} props.role     — viewer's role (for label selection)
 * @param {Function} props.onRate — (verseId, { quality, status? }) => void  (rate mode)
 * @param {Function} props.onCelebrate — ({ verseRef }) => void  (Torah-side trigger)
 * @param {string} props.className
 */
export function VerseProgress({
  verses = [],
  mode = 'display',
  role,
  onRate,
  onCelebrate,
  className = '',
}) {
  const [selectedId, setSelectedId] = useState(null);
  const isRate = mode === 'rate';
  const qualityLabels = getQualityLabels(role);

  function getVerseLabel(verse) {
    if (!verse.quality) return QUALITY_LABEL_NOT_STARTED;
    if (isGoldVerse(verse.quality, verse.status, verse.readingType)) {
      return QUALITY_LABEL_TORAH_MASTERY;
    }
    if (isHalfGoldVerse(verse.quality, verse.status, verse.readingType)) {
      return QUALITY_LABEL_TORAH_TRANSFER;
    }
    return qualityLabels[verse.quality] || verse.quality;
  }

  function handleCellClick(verse) {
    setSelectedId(selectedId === verse.id ? null : verse.id);
  }

  function handleRaterPick(verse, raterLevel) {
    if (!onRate) return;

    const update = { quality: raterLevel.quality };

    // Torah-side levels: set the appropriate status
    if (raterLevel.level === 6) {
      update.status = 'torah_side';
    } else if (raterLevel.level === 5) {
      update.status = 'torah_side_transfer';
    } else if (verse.status === 'torah_side' || verse.status === 'torah_side_transfer') {
      // Lowering from a Torah-side level: clear the status back to review
      update.status = 'review';
    }

    onRate(verse.id, update);

    // Only full Torah-side (L6) triggers celebration; transfer (L5) does not
    if (raterLevel.level === 6 && onCelebrate) {
      onCelebrate({ verseRef: verse.ref });
    }
  }

  const selectedVerse = verses.find((v) => v.id === selectedId);
  const chapterGroups = groupVersesByChapter(verses);

  return (
    <div className={className}>
      {chapterGroups.map((group, groupIndex) => (
        <div key={groupIndex} className="verse-chapter-group">
          {group.label && (
            <p className="verse-chapter-label">{group.label}</p>
          )}
          <div className="verse-grid">
            {group.items.map(({ verse, verseNumber }) => {
              const fill = getFillHeight(verse.quality);
              const gold = isGoldVerse(verse.quality, verse.status, verse.readingType);
              const halfGold = isHalfGoldVerse(verse.quality, verse.status, verse.readingType);
              const lit = isLitVerse(verse.quality);
              const selected = selectedId === verse.id;

              return (
                <button
                  key={verse.id}
                  type="button"
                  className={[
                    'verse-cell',
                    gold ? 'verse-cell-gold' : '',
                    halfGold ? 'verse-cell-half-gold' : '',
                    lit ? 'verse-cell-lit' : '',
                    selected ? 'verse-cell-selected' : '',
                  ].filter(Boolean).join(' ')}
                  aria-label={`${verse.ref}: ${getVerseLabel(verse)}`}
                  onClick={() => handleCellClick(verse)}
                >
                  <span
                    className="verse-cell-fill"
                    style={{ height: `${fill}%` }}
                  />
                  <span className="verse-cell-num">{verseNumber}</span>
                  {gold && (
                    <span className="verse-cell-icon" aria-hidden="true">
                      <SolidStar size={9} />
                    </span>
                  )}
                  {halfGold && (
                    <span className="verse-cell-icon" aria-hidden="true">
                      <OutlineStar size={9} />
                    </span>
                  )}
                  {!gold && !halfGold && fill === 100 && (
                    <span className="verse-cell-icon" aria-hidden="true">
                      {'\u2713'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Rate mode: inline rater strip */}
      {isRate && selectedVerse && (
        <VerseRater
          verse={selectedVerse}
          verseIndex={verses.indexOf(selectedVerse)}
          onPick={(level) => handleRaterPick(selectedVerse, level)}
        />
      )}

      {/* Display mode: tap-to-reveal detail */}
      {!isRate && selectedVerse && (
        <div className="verse-cell-detail">
          <strong>{selectedVerse.ref}</strong>
          <span className="verse-cell-detail-status">
            {getVerseLabel(selectedVerse)}
          </span>
          {selectedVerse.lastSessionDate && (
            <span className="verse-cell-detail-meta">
              Last worked:{' '}
              {new Date(
                selectedVerse.lastSessionDate + 'T00:00:00'
              ).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================ */
/*  VerseRater (internal)                                            */
/* ================================================================ */

/**
 * Inline level picker strip.
 * 6 fill-swatch buttons for Torah; 4 for Haftarah (no Torah-side steps).
 */
function VerseRater({ verse, verseIndex, onPick }) {
  const activeLevel = getActiveLevel(
    verse.quality,
    verse.status,
    verse.readingType
  );
  const isTorah = verse.readingType === 'torah';
  const levels = isTorah ? RATER_LEVELS : RATER_LEVELS.slice(0, 4);

  return (
    <div
      className="verse-rater"
      role="radiogroup"
      aria-label={`Rate ${verse.ref || `verse ${verseIndex + 1}`}`}
    >
      <span className="verse-rater-label">
        <span className="verse-rater-num">Verse {verseIndex + 1}</span>
        {verse.ref && (
          <span className="verse-rater-ref">{verse.ref}</span>
        )}
      </span>
      {levels.map((lvl) => {
        const isActive = lvl.level === activeLevel;
        return (
          <button
            key={lvl.level}
            type="button"
            className={[
              'verse-rate-btn',
              isActive ? 'verse-rate-btn-active' : '',
              lvl.gold ? 'verse-rate-btn-gold' : '',
              lvl.halfGold ? 'verse-rate-btn-half-gold' : '',
            ].filter(Boolean).join(' ')}
            data-level={lvl.level}
            onClick={() => onPick(lvl)}
            role="radio"
            aria-checked={isActive}
            aria-label={lvl.label}
          >
            <span
              className={[
                'verse-rate-mini',
                lvl.gold ? 'verse-rate-mini-gold' : '',
                lvl.halfGold ? 'verse-rate-mini-half-gold' : '',
              ].filter(Boolean).join(' ')}
            >
              <i style={{ height: `${lvl.fill}%` }} />
            </span>
            {lvl.label}
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================ */
/*  FillLegend                                                       */
/* ================================================================ */

/**
 * Fill-swatch legend for the quality ramp.
 * 7 swatches that fill to each level height, with role-aware labels.
 */
export function FillLegend({ role, className = '' }) {
  const qualityLabels = getQualityLabels(role);

  function getLabel(item) {
    if (item.labelKey === 'not_started') return QUALITY_LABEL_NOT_STARTED;
    if (item.labelKey === 'torah_side_transfer') return QUALITY_LABEL_TORAH_TRANSFER;
    if (item.labelKey === 'torah_side') return QUALITY_LABEL_TORAH_MASTERY;
    return qualityLabels[item.labelKey] || item.labelKey;
  }

  return (
    <div className={`fill-legend ${className}`}>
      {LEGEND_LEVELS.map((item) => (
        <span key={item.labelKey} className="fill-legend-item">
          <span
            className={[
              'fill-legend-swatch',
              item.gold ? 'fill-legend-swatch-gold' : '',
              item.halfGold ? 'fill-legend-swatch-half-gold' : '',
            ].filter(Boolean).join(' ')}
          >
            <i style={{ height: `${item.fill}%` }} />
          </span>
          {getLabel(item)}
          {item.labelKey === 'torah_side_transfer' && (
            <HelpTip text="Transferring to Torah side means the student is beginning to practice this verse from the Torah scroll, without vowels or trope marks. The next step is full Torah-side mastery." />
          )}
          {item.labelKey === 'torah_side' && (
            <HelpTip text="Torah-side mastery means the student can chant this verse from the Torah scroll without vowels or trope marks. This is the highest level of preparation." />
          )}
        </span>
      ))}
    </div>
  );
}
