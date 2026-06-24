import React, { useState, useEffect } from 'react';

/**
 * MenorahReadiness — the signature elevated gauge.
 *
 * Renders the Chizuk Amuno menorah emblem and "lights" it from the base
 * upward to `percent`, fusing the congregation's emblem with the product's
 * core readiness metaphor.
 *
 * FILL TECHNIQUE: a bottom-anchored overflow:hidden wrapper whose HEIGHT
 * animates from 0 to percent%. The inner <img> is full-size and
 * bottom-anchored so it reveals (not squashes) as the wrapper grows.
 * No clip-path transitions — height is reliable across engines.
 *
 * Sits on a deep-purple ceremonial panel. Animates the fill on mount
 * (~1.1s cubic-bezier; honours prefers-reduced-motion: reduce).
 *
 * @param {number}  percent    - Readiness 0..100 (clamped). Default 0.
 * @param {number}  size       - Emblem rendered size in px (square). Default 152.
 * @param {string}  emblemSrc  - URL of the gold, transparent emblem PNG. Required.
 * @param {boolean} showLabel  - Show the "NN% ready" caption below. Default true.
 * @param {React.ReactNode} labelText - Override the default caption content.
 * @param {React.ReactNode} sub       - Optional muted sub-caption beneath the label.
 * @param {string}  className  - Additional class(es) on the outermost wrapper.
 */
export default function MenorahReadiness({
  percent = 0,
  size = 152,
  emblemSrc,
  showLabel = true,
  labelText,
  sub,
  className = '',
}) {
  const target = Math.max(0, Math.min(100, Math.round(percent)));
  const [fill, setFill] = useState(0);

  useEffect(() => {
    // Respect reduced-motion: paint final state immediately, no transition.
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      setFill(target);
      return undefined;
    }

    // Double rAF ensures the browser has painted the 0-height state
    // before we set the target, so the CSS transition fires visibly.
    setFill(0);
    const outer = requestAnimationFrame(() => {
      const inner = requestAnimationFrame(() => {
        setFill(target);
      });
      // inner ID isn't directly cancellable from outer scope,
      // but the outer cancel prevents it from scheduling.
      void inner;
    });

    return () => cancelAnimationFrame(outer);
  }, [target]);

  return (
    <div className={`menorah-readiness${className ? ` ${className}` : ''}`}>
      {/* Menorah emblem container */}
      <div
        className="menorah"
        style={{ '--menorah-size': `${size}px` }}
      >
        {/* Dim base layer — always visible, low opacity */}
        <img
          className="menorah-base"
          src={emblemSrc}
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
        />

        {/* Lit overlay — bottom-anchored, height reveals upward */}
        <div
          className="menorah-fill"
          style={{ height: `${fill}%` }}
        >
          <img
            src={emblemSrc}
            alt=""
            aria-hidden="true"
            width={size}
            height={size}
          />
        </div>
      </div>

      {/* Accessible label for screen readers + visible caption */}
      {showLabel && (
        <div
          className="menorah-readiness-label"
          role="img"
          aria-label={`${target} percent ready`}
        >
          {labelText != null
            ? labelText
            : <><b>{target}%</b> ready</>
          }
        </div>
      )}

      {/* Optional sub-caption */}
      {sub != null && (
        <div className="menorah-readiness-sub">{sub}</div>
      )}
    </div>
  );
}
