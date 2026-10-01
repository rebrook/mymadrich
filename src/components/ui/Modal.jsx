import { useEffect, useRef, useCallback } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

/**
 * Reusable modal dialog with focus trap.
 * Goes full-screen on mobile (handled via CSS).
 *
 * Focus behavior:
 *   - On mount, captures the previously focused element and moves focus
 *     into the modal (first focusable child, or the close button).
 *   - Tab / Shift+Tab cycle within the modal.
 *   - On unmount, returns focus to the trigger element.
 *
 * Props:
 *   title    - string, displayed in the header
 *   onClose  - function, called when overlay or X is clicked
 *   children - modal body content
 *   footer   - optional React node for the footer area
 */
export default function Modal({ title, onClose, children, footer }) {
  const overlayRef = useRef(null);
  const modalRef = useRef(null);
  const triggerRef = useRef(null);

  // Capture the element that opened the modal so we can restore focus on close
  useEffect(() => {
    triggerRef.current = document.activeElement;
  }, []);

  // Move focus into the modal on mount; restore on unmount
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    // Prefer an element marked data-autofocus (e.g. the first form field, or
    // the safe button in a confirmation); otherwise the first focusable.
    const preferred = modal.querySelector('[data-autofocus]');
    const focusables = modal.querySelectorAll(FOCUSABLE_SELECTOR);
    if (preferred) {
      preferred.focus();
    } else if (focusables.length > 0) {
      focusables[0].focus();
    }

    return () => {
      // Restore focus to the trigger when the modal unmounts
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus();
      }
    };
  }, []);

  // Keyboard handler: Escape to close, Tab trap
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const modal = modalRef.current;
        if (!modal) return;

        const focusables = modal.querySelectorAll(FOCUSABLE_SELECTOR);
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          // Shift+Tab on first element wraps to last
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab on last element wraps to first
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Close when clicking the overlay (not the modal itself)
  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="modal" ref={modalRef}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
