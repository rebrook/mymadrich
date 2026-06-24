/**
 * StatTile (v2 Section 6.4)
 *
 * White card tile for the 4-tile grid.
 * Variants: number, badge (pace), date.
 * Layout: label (11px secondary), value (20px), optional third line,
 *         optional thin progress thread at bottom.
 *
 * Props:
 *   label      – small secondary label text
 *   value      – primary display value (string or ReactNode)
 *   meta       – optional third line text (string or ReactNode)
 *   metaColor  – optional color override for meta line
 *   thread     – optional { percent, color } for thin progress bar at bottom
 */
export default function StatTile({ label, value, meta, metaColor, thread }) {
  return (
    <div className="stat-tile card">
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value">{value}</span>
      {meta && (
        <span
          className="stat-tile-meta"
          style={metaColor ? { color: metaColor } : undefined}
        >
          {meta}
        </span>
      )}
      {thread && (
        <div
          className="stat-tile-thread"
          role="img"
          aria-label={`${Math.round(thread.percent * 100)}% complete`}
        >
          <div
            className="stat-tile-thread-fill"
            style={{
              width: `${Math.min(100, Math.round(thread.percent * 100))}%`,
              backgroundColor: thread.color || 'var(--color-primary)',
            }}
          />
        </div>
      )}
    </div>
  );
}
