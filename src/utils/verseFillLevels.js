/**
 * MyMadrich — verse fill-level mapping utilities.
 *
 * Maps the quality enum to fill heights for the colorblind-safe
 * fill-cell progress display. Progress is encoded as bar height
 * (0% to 100%), not hue. Survives total grayscale.
 *
 * Level mapping (quality enum -> fill %):
 *   null (not started)              ->  0%
 *   still_learning                  -> 25%
 *   moderate_mistakes               -> 50%
 *   minor_mistakes                  -> 75%
 *   perfect                         -> 100%  + check icon
 *   perfect + torah_side_transfer   -> 100%  half-gold + outline star (SVG)
 *   perfect + torah_side            -> 100%  gold + solid star
 */

import { QUALITY } from './constants';

/* ---- Fill heights ---- */

/** Fill height (%) for each quality value. */
export const FILL_HEIGHTS = {
  [QUALITY.STILL_LEARNING]: 25,
  [QUALITY.MODERATE_MISTAKES]: 50,
  [QUALITY.MINOR_MISTAKES]: 75,
  [QUALITY.PERFECT]: 100,
};

/** Get fill height for a quality value. Returns 0 for null/not started. */
export function getFillHeight(quality) {
  if (!quality) return 0;
  return FILL_HEIGHTS[quality] ?? 0;
}

/** True if the verse qualifies for full gold display (Torah-side mastery). */
export function isGoldVerse(quality, status, readingType) {
  return (
    quality === QUALITY.PERFECT
    && status === 'torah_side'
    && readingType === 'torah'
  );
}

/** True if the verse qualifies for half-gold display (transferring to Torah side). */
export function isHalfGoldVerse(quality, status, readingType) {
  return (
    quality === QUALITY.PERFECT
    && status === 'torah_side_transfer'
    && readingType === 'torah'
  );
}

/**
 * True if the fill is high enough that the verse number should render
 * in white (the fill bar covers most of the cell).
 * Threshold: 75% (minor_mistakes or better).
 */
export function isLitVerse(quality) {
  return getFillHeight(quality) >= 75;
}

/**
 * Map quality + status to the active rater level (0-6).
 *   0 = not started
 *   1 = still_learning
 *   2 = moderate_mistakes
 *   3 = minor_mistakes
 *   4 = perfect (learned with trope)
 *   5 = perfect + torah_side_transfer (transferring to Torah side)
 *   6 = perfect + torah_side (Torah-side mastery)
 */
export function getActiveLevel(quality, status, readingType) {
  if (!quality) return 0;
  if (isGoldVerse(quality, status, readingType)) return 6;
  if (isHalfGoldVerse(quality, status, readingType)) return 5;
  if (quality === QUALITY.PERFECT) return 4;
  if (quality === QUALITY.MINOR_MISTAKES) return 3;
  if (quality === QUALITY.MODERATE_MISTAKES) return 2;
  if (quality === QUALITY.STILL_LEARNING) return 1;
  return 0;
}

/* ---- Rater level definitions ---- */

/**
 * The 6 rater levels used by the inline verse rater.
 * Each maps to a quality enum value, a fill height %, and a label.
 * Levels 5 and 6 are Torah-only; Haftarah uses levels 1-4.
 * Level 5 (transfer) sets status to 'torah_side_transfer'.
 * Level 6 (Torah-side) sets status to 'torah_side'.
 */
export const RATER_LEVELS = [
  { level: 1, quality: QUALITY.STILL_LEARNING, fill: 25, label: 'Still learning' },
  { level: 2, quality: QUALITY.MODERATE_MISTAKES, fill: 50, label: 'Getting there' },
  { level: 3, quality: QUALITY.MINOR_MISTAKES, fill: 75, label: 'Almost' },
  { level: 4, quality: QUALITY.PERFECT, fill: 100, label: 'Learned with Trope' },
  { level: 5, quality: QUALITY.PERFECT, fill: 100, label: 'Transferring to Torah side', halfGold: true },
  { level: 6, quality: QUALITY.PERFECT, fill: 100, label: 'Torah-side', gold: true },
];

/* ---- Legend level definitions ---- */

/**
 * The 7 legend levels (includes "Not started" at 0%).
 * Used by FillLegend to render fill-swatch legend items.
 * The `labelKey` maps to the quality enum key or a special key
 * for use with getQualityLabels().
 */
export const LEGEND_LEVELS = [
  { fill: 0, labelKey: 'not_started' },
  { fill: 25, labelKey: QUALITY.STILL_LEARNING },
  { fill: 50, labelKey: QUALITY.MODERATE_MISTAKES },
  { fill: 75, labelKey: QUALITY.MINOR_MISTAKES },
  { fill: 100, labelKey: QUALITY.PERFECT },
  { fill: 100, labelKey: 'torah_side_transfer', halfGold: true },
  { fill: 100, labelKey: 'torah_side', gold: true },
];
