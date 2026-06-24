import { PACE_STATUS, PACE_LABELS, formatTargetDate } from '../../utils/paceCalculations';
import { milestoneForReadiness } from '../../utils/constants';
import { tutorName } from '../../utils/people';

/**
 * CohortReport — board/clergy-ready cohort summary.
 *
 * Renders a clean report page that prints well via window.print().
 * No app chrome in print; keeps the Chizuk lockup + date.
 */
export default function CohortReport({
  cohort,
  calendarData,
  students,
  studentMeta,
  hebrewYear,
  onBack,
  onPrint,
}) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const { dated, totalServiceDates, heavyShabbatot, avgDaysOut, paceBreakdown, shabbatRows } =
    calendarData;

  // Cluster details
  const clusterRows = shabbatRows.filter((r) => r.isCluster);

  return (
    <div className="cc-report-page">
      {/* Screen-only toolbar */}
      <div className="cc-report-toolbar no-print">
        <button type="button" className="btn-ghost" onClick={onBack}>
          {'\u2190'} Back to calendar
        </button>
        <button type="button" className="btn-primary" onClick={onPrint}>
          <PrintIcon /> Print / Save as PDF
        </button>
      </div>

      {/* Print content */}
      <div className="cc-report">
        {/* Header / lockup */}
        <header className="cc-report-header">
          <div className="cc-report-lockup">
            <span className="cc-report-logo">MyMadrich</span>
            <span className="cc-report-sep">{'\u00B7'}</span>
            <span className="cc-report-org">Chizuk Amuno Congregation</span>
          </div>
          <div className="cc-report-date">Generated {dateStr}</div>
        </header>

        {/* Title */}
        <h1 className="cc-report-title">
          Cohort Summary {'\u00B7'} {hebrewYear}
        </h1>
        {cohort && <p className="cc-report-cohort-name">{cohort.name}</p>}

        {/* Overview stats */}
        <section className="cc-report-section">
          <h2 className="cc-report-h2">Overview</h2>
          <div className="cc-report-stats-grid">
            <div className="cc-report-stat">
              <div className="cc-report-stat-n">{dated.length}</div>
              <div className="cc-report-stat-l">students</div>
            </div>
            <div className="cc-report-stat">
              <div className="cc-report-stat-n">{totalServiceDates}</div>
              <div className="cc-report-stat-l">service dates</div>
            </div>
            <div className="cc-report-stat">
              <div className="cc-report-stat-n cc-report-stat-warn">
                {heavyShabbatot}
              </div>
              <div className="cc-report-stat-l">
                heavy Shabbat{heavyShabbatot !== 1 ? 'ot' : ''}
              </div>
            </div>
            <div className="cc-report-stat">
              <div className="cc-report-stat-n">{avgDaysOut}</div>
              <div className="cc-report-stat-l">avg days out</div>
            </div>
          </div>
        </section>

        {/* Pace breakdown */}
        <section className="cc-report-section">
          <h2 className="cc-report-h2">Pace breakdown</h2>
          <table className="cc-report-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              <PaceRow label="Ahead" count={paceBreakdown.ahead} dotClass="cc-pace-ahead" />
              <PaceRow label="On Track" count={paceBreakdown.onTrack} dotClass="cc-pace-ontrack" />
              <PaceRow label="Behind" count={paceBreakdown.behind} dotClass="cc-pace-behind" />
              <PaceRow label="Critical" count={paceBreakdown.critical} dotClass="cc-pace-critical" />
              <PaceRow label="Not Started" count={paceBreakdown.notStarted} dotClass="cc-pace-neutral" />
              <PaceRow label="Completed" count={paceBreakdown.completed} dotClass="cc-pace-completed" />
            </tbody>
          </table>
        </section>

        {/* Cluster warnings */}
        {clusterRows.length > 0 && (
          <section className="cc-report-section">
            <h2 className="cc-report-h2">Heavy Shabbatot</h2>
            <p className="cc-report-body">
              {clusterRows.length} service date{clusterRows.length !== 1 ? 's' : ''} with
              two or more b{'\u2019'}nai mitzvah on the same Shabbat. These require early
              coordination for honors, aliyot, and timing.
            </p>
            {clusterRows.map((row) => (
              <div key={row.dateStr} className="cc-report-cluster">
                <div className="cc-report-cluster-date">
                  {row.date.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {row.reading && (
                    <span className="cc-report-cluster-parasha">
                      {' '}{'\u00B7'} Parashat {row.reading.portion_name}
                    </span>
                  )}
                </div>
                <div className="cc-report-cluster-students">
                  {row.students.map((s) => (
                    <span key={s.id}>
                      {s.first_name} {s.last_name}
                      {tutorName(s.tutor, null) ? ` (${tutorName(s.tutor, null)})` : ''}
                    </span>
                  )).reduce((prev, curr, i) => i === 0 ? [curr] : [...prev, ', ', curr], [])}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Date spread */}
        <section className="cc-report-section">
          <h2 className="cc-report-h2">Date spread</h2>
          <table className="cc-report-table cc-report-table-spread">
            <thead>
              <tr>
                <th>Date</th>
                <th>Parashah</th>
                <th>Student(s)</th>
                <th>Torah</th>
                <th>Haftarah</th>
              </tr>
            </thead>
            <tbody>
              {shabbatRows.map((row) => (
                <tr key={row.dateStr} className={row.isCluster ? 'cc-report-row-cluster' : ''}>
                  <td>
                    {row.date.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td>{row.reading?.portion_name || 'Pending'}</td>
                  <td>
                    {row.students.map((s) => `${s.first_name} ${s.last_name}`).join(', ')}
                  </td>
                  <td>
                    {row.students.map((s) => {
                      const meta = studentMeta[s.id];
                      if (!meta || meta.torahPct === null || meta.torahPct === undefined) return '\u2014';
                      return `${meta.torahPct}%`;
                    }).join(', ')}
                  </td>
                  <td>
                    {row.students.map((s) => {
                      const meta = studentMeta[s.id];
                      if (!meta || meta.haftarahPct === null || meta.haftarahPct === undefined) return '\u2014';
                      return `${meta.haftarahPct}%`;
                    }).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Footer */}
        <footer className="cc-report-footer">
          <p>MyMadrich {'\u00B7'} Chizuk Amuno Congregation {'\u00B7'} Confidential</p>
        </footer>
      </div>
    </div>
  );
}

function PaceRow({ label, count, dotClass }) {
  if (count === 0) return null;
  return (
    <tr>
      <td>
        <span className={`cc-report-pace-dot ${dotClass}`} />
        {label}
      </td>
      <td>{count}</td>
    </tr>
  );
}

function PrintIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ marginRight: 6, verticalAlign: -2 }}
    >
      <polyline points="6 9 6 2 14 2 14 9" />
      <path d="M6 14H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2" />
      <rect x="6" y="12" width="8" height="6" />
    </svg>
  );
}
