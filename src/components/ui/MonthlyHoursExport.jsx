/**
 * MonthlyHoursExport — coordinator-only monthly tutor hours CSV export.
 *
 * Renders a month picker and "Download CSV" button. Queries sessions
 * for the selected month across ALL tutors, sums minutes_worked per
 * tutor per student, and generates a single CSV file.
 *
 * NULL-handling: minutes_worked can be NULL (pre-migration or skipped).
 * The export includes a "Sessions Missing Hours" column so the coordinator
 * knows when totals are incomplete. Totals only sum non-NULL values.
 *
 * Admin-only: the parent must gate this behind ROLES.ADMIN. The Supabase
 * query relies on admin RLS for full table access.
 */

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { tutorName } from '../../utils/people';

/**
 * Generates CSV content string from rows.
 * @param {string[]} headers
 * @param {Array<Array<string|number>>} rows
 * @returns {string}
 */
function buildCsv(headers, rows) {
  const escape = (val) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escape).join(',')];
  rows.forEach((row) => lines.push(row.map(escape).join(',')));
  return lines.join('\r\n');
}

function downloadCsvFile(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Returns the first and last day of a month as ISO date strings.
 * @param {number} year
 * @param {number} month - 1-indexed (1=Jan, 12=Dec)
 */
function getMonthRange(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export default function MonthlyHoursExport() {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const monthLabel = new Date(selectedYear, selectedMonth - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  async function handleExport() {
    setLoading(true);
    setError(null);
    setLastResult(null);

    try {
      const { start, end } = getMonthRange(selectedYear, selectedMonth);

      // Fetch all sessions in the month with tutor and student info
      const { data: sessions, error: sessErr } = await supabase
        .from('sessions')
        .select(`
          id, session_date, minutes_worked,
          tutor:profiles!tutor_id(id, display_name, email),
          student:students!student_id(id, first_name, last_name)
        `)
        .gte('session_date', start)
        .lte('session_date', end)
        .order('session_date', { ascending: true });
      if (sessErr) throw sessErr;

      if (!sessions || sessions.length === 0) {
        setLastResult({ sessionCount: 0 });
        setLoading(false);
        return;
      }

      // Aggregate: tutor -> student -> { sessions, totalMinutes, missingCount }
      const agg = {};
      sessions.forEach((sess) => {
        const tutorKey = sess.tutor?.id || 'unknown';
        const tutorLabel = tutorName(sess.tutor, 'Unknown Tutor');
        const studentKey = sess.student?.id || 'unknown';
        const studentLabel = sess.student
          ? `${sess.student.first_name} ${sess.student.last_name}`
          : 'Unknown Student';

        if (!agg[tutorKey]) {
          agg[tutorKey] = { tutorLabel, students: {} };
        }
        if (!agg[tutorKey].students[studentKey]) {
          agg[tutorKey].students[studentKey] = {
            studentLabel,
            sessionCount: 0,
            totalMinutes: 0,
            missingCount: 0,
          };
        }

        const entry = agg[tutorKey].students[studentKey];
        entry.sessionCount += 1;
        if (sess.minutes_worked != null) {
          entry.totalMinutes += sess.minutes_worked;
        } else {
          entry.missingCount += 1;
        }
      });

      // Build CSV rows
      const headers = [
        'Tutor',
        'Month',
        'Student',
        'Sessions',
        'Total Minutes',
        'Total Hours',
        'Sessions Missing Hours',
      ];

      const rows = [];
      Object.values(agg)
        .sort((a, b) => a.tutorLabel.localeCompare(b.tutorLabel))
        .forEach((tutor) => {
          Object.values(tutor.students)
            .sort((a, b) => a.studentLabel.localeCompare(b.studentLabel))
            .forEach((entry) => {
              rows.push([
                tutor.tutorLabel,
                `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`,
                entry.studentLabel,
                entry.sessionCount,
                entry.totalMinutes,
                (entry.totalMinutes / 60).toFixed(2),
                entry.missingCount,
              ]);
            });
        });

      const csv = buildCsv(headers, rows);
      const filename = `tutor-hours-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.csv`;
      downloadCsvFile(csv, filename);

      const totalMissing = rows.reduce((sum, r) => sum + r[6], 0);
      setLastResult({
        sessionCount: sessions.length,
        rowCount: rows.length,
        totalMissing,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Year options: current year and 2 prior
  const yearOptions = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) {
    yearOptions.push(y);
  }

  return (
    <div className="monthly-hours-export">
      <h4>Monthly Tutor Hours Export</h4>
      <p className="form-hint">
        Download a CSV of all tutor hours for a given month. One row per tutor per student.
      </p>

      <div className="form-row" style={{ marginTop: 'var(--space-3)', alignItems: 'flex-end' }}>
        <div className="form-group">
          <label className="form-label" htmlFor="export-month">Month</label>
          <select
            id="export-month"
            className="input"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleDateString('en-US', { month: 'long' })}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="export-year">Year</label>
          <select
            id="export-year"
            className="input"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={loading}
            type="button"
          >
            {loading ? 'Exporting...' : `Export ${monthLabel}`}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginTop: 'var(--space-3)' }}>
          {error}
        </div>
      )}

      {lastResult && lastResult.sessionCount === 0 && (
        <p className="form-hint" style={{ marginTop: 'var(--space-3)' }}>
          No sessions found for {monthLabel}.
        </p>
      )}

      {lastResult && lastResult.sessionCount > 0 && (
        <p className="form-hint" style={{ marginTop: 'var(--space-3)' }}>
          Exported {lastResult.rowCount} row{lastResult.rowCount !== 1 ? 's' : ''} from {lastResult.sessionCount} session{lastResult.sessionCount !== 1 ? 's' : ''}.
          {lastResult.totalMissing > 0 && (
            <span className="export-missing-warning">
              {' '}{lastResult.totalMissing} session{lastResult.totalMissing !== 1 ? 's' : ''} missing hours (totals may undercount).
            </span>
          )}
        </p>
      )}
    </div>
  );
}
