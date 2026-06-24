import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { emblemGold } from '../../assets/emblem';

/**
 * CelebrationMoment — the candle-lighting "Mazel tov" overlay.
 *
 * Fires when a student reaches a milestone (e.g. a verse hits Torah-side
 * mastery): the Chizuk menorah glows gold, sparkle stars rise, and a
 * Hebrew blessing appears. Purely cosmetic — never blocks data operations.
 *
 * Full-viewport portal by default. Dismiss via button, backdrop tap, or Escape.
 * Focus is trapped within the overlay while open (Tab/Shift+Tab cycle).
 * On close, focus returns to the element that opened the overlay.
 * All animation gated behind prefers-reduced-motion: no-preference.
 * With reduced motion: static glow, no looping animation, fully visible.
 *
 * @param {boolean}        open       Whether the overlay is visible.
 * @param {Function}       onClose    Dismiss handler.
 * @param {string}         title      Headline, e.g. "Mazel tov, Maya!"
 * @param {string}         subtitle   Detail line, e.g. "Vayera, verse 14 — Torah-side mastery."
 * @param {number}         [stars=22] Number of rising gold sparkle elements.
 */

const STAR_CHAR = '\u2726'; // ✦
const HEBREW_MAZAL_TOV = '\u05DE\u05B7\u05D6\u05B8\u05BC\u05DC \u05D8\u05D5\u05B9\u05D1';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

export default function CelebrationMoment({
  open = false,
  onClose,
  title = 'Mazel tov!',
  subtitle = '',
  stars = 22,
}) {
  const backdropRef = useRef(null);
  const triggerRef = useRef(null);

  // Check reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Capture the element that triggered the overlay so focus returns on close
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
    }
  }, [open]);

  // Keyboard handler: Escape to close, Tab trap within the overlay
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const container = backdropRef.current;
        if (!container) return;

        const focusables = container.querySelectorAll(FOCUSABLE_SELECTOR);
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    // Prevent background scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      // Restore focus to the trigger element
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus();
      }
    };
  }, [open, handleKeyDown]);

  // Focus the dismiss button when overlay opens
  const buttonRef = useRef(null);
  useEffect(() => {
    if (open && buttonRef.current) {
      buttonRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  // Backdrop click dismiss
  function handleBackdropClick(e) {
    if (e.target === backdropRef.current && onClose) {
      onClose();
    }
  }

  // Build sparkle star elements (skip under reduced motion)
  const starEls = prefersReducedMotion
    ? null
    : Array.from({ length: stars }, (_, i) => {
        const style = {
          left: `${8 + Math.random() * 84}%`,
          bottom: `${18 + Math.random() * 30}%`,
          fontSize: `${0.7 + Math.random() * 1.1}rem`,
          animationDuration: `${1.9 + Math.random() * 1.7}s`,
          animationDelay: `${Math.random() * 0.9}s`,
        };
        return (
          <span key={i} className="cel-star" aria-hidden="true" style={style}>
            {STAR_CHAR}
          </span>
        );
      });

  const overlay = (
    <div
      className="celebrate"
      ref={backdropRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={handleBackdropClick}
    >
      <img
        className="cel-emblem"
        src={emblemGold}
        alt=""
        aria-hidden="true"
      />

      <div className="cel-he" dir="rtl" lang="he">
        {HEBREW_MAZAL_TOV}
      </div>

      <h2 className="cel-title">{title}</h2>

      {subtitle && (
        <p className="cel-sub">{subtitle}</p>
      )}

      <button
        ref={buttonRef}
        type="button"
        className="btn cel-btn"
        onClick={onClose}
      >
        Continue the journey
      </button>

      {starEls}
    </div>
  );

  return createPortal(overlay, document.body);
}
