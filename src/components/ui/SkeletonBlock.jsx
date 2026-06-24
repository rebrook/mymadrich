/**
 * SkeletonBlock — warm shimmer loading placeholder.
 *
 * Uses the `.skeleton` CSS class (gated behind prefers-reduced-motion).
 * With motion off, renders as a static warm-tinted block.
 *
 * @param {string}  [width]     CSS width (default '100%')
 * @param {string}  [height]    CSS height (default '1em')
 * @param {string}  [radius]    CSS border-radius (default 'var(--radius-sm)')
 * @param {string}  [className] Additional CSS class(es)
 * @param {number}  [count]     Number of skeleton lines to render (default 1)
 */
export default function SkeletonBlock({
  width = '100%',
  height = '1em',
  radius = 'var(--radius-sm)',
  className = '',
  count = 1,
}) {
  const style = { width, height, borderRadius: radius };

  if (count === 1) {
    return (
      <div
        className={`skeleton ${className}`}
        style={style}
        aria-hidden="true"
      />
    );
  }

  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`skeleton skeleton-line ${className}`}
          style={i === count - 1 ? { width: '60%' } : undefined}
        />
      ))}
    </div>
  );
}

/**
 * DashboardSkeleton — loading placeholder for the full student dashboard.
 * Shows a hero-shaped block, three stat tiles, and two content cards.
 */
export function DashboardSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading dashboard">
      {/* Hero placeholder */}
      <div className="skeleton skeleton-card" style={{ height: '120px' }} />

      {/* Stat tiles */}
      <div className="stat-tiles">
        <div className="skeleton skeleton-tile" />
        <div className="skeleton skeleton-tile" />
        <div className="skeleton skeleton-tile" />
      </div>

      {/* Content cards */}
      <div className="dash-grid">
        <div className="dash-main">
          <div className="skeleton skeleton-card" style={{ height: '200px' }} />
        </div>
        <div className="dash-rail">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      </div>
    </div>
  );
}

/**
 * SessionListSkeleton — loading placeholder for session history.
 */
export function SessionListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading sessions">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="skeleton skeleton-card"
          style={{ height: '64px', marginBottom: 'var(--space-3)' }}
        />
      ))}
    </div>
  );
}
