import { useState, useEffect } from 'react';
import { GeoLocation, Zmanim } from '@hebcal/core';

/**
 * ShabbatBanner — quiet decorative banner shown during Shabbat.
 *
 * Displays "Shabbat Shalom" with a calm subordinate line when the current
 * time falls between Friday sunset and Saturday sunset. Uses @hebcal/core
 * Zmanim for accurate sunset calculations based on a fixed location
 * (Baltimore, MD, the congregation's area).
 *
 * Design: warm gold-tinted bar, no exclamation mark (brand voice is warm
 * and quiet), subordinate text as a gentle nudge. No functionality is
 * blocked or disabled. The companion CSS class .shabbat-log-quiet can be
 * applied to the "Log session" button during Shabbat to soften its
 * visual prominence (outline instead of filled), but it remains clickable.
 *
 * The component exports both the banner and an `isShabbat` flag for
 * parent components to apply the button de-emphasis.
 */

// Baltimore, MD approximate coordinates (Chizuk Amuno area)
const GLOC = new GeoLocation(null, 39.37, -76.71, 0, 'America/New_York');

/**
 * Calculate whether it's currently Shabbat.
 * Friday sunset through Saturday sunset, using accurate solar position.
 */
function checkShabbat() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = today.getDay(); // 0=Sun, 5=Fri, 6=Sat

  if (dayOfWeek === 5) {
    // Friday: Shabbat starts at sunset
    const zmanim = new Zmanim(GLOC, today, false);
    const sunset = zmanim.sunset();
    if (sunset && now >= sunset) {
      return true;
    }
    return false;
  }

  if (dayOfWeek === 6) {
    // Saturday: Shabbat ends at sunset
    const zmanim = new Zmanim(GLOC, today, false);
    const sunset = zmanim.sunset();
    if (sunset && now < sunset) {
      return true;
    }
    return false;
  }

  return false;
}

export function useShabbat() {
  const [isShabbat, setIsShabbat] = useState(() => checkShabbat());

  useEffect(() => {
    // Re-check every 5 minutes for sunset transitions
    const interval = setInterval(() => {
      setIsShabbat(checkShabbat());
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return isShabbat;
}

export default function ShabbatBanner() {
  const isShabbat = useShabbat();

  if (!isShabbat) return null;

  return (
    <div className="shabbat-banner" role="status" aria-live="polite">
      <span className="shabbat-banner-star" aria-hidden="true">{'\u2721'}</span>
      <div className="shabbat-banner-content">
        <span className="shabbat-banner-title">Shabbat Shalom</span>
        <span className="shabbat-banner-sub">Sessions can wait until after Shabbat</span>
      </div>
    </div>
  );
}
