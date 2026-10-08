import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useCohorts } from '../hooks/useCohorts';
import { useStudents } from '../hooks/useStudents';
import {
  ROLES,
  milestoneForReadiness,
} from '../utils/constants';
import {
  calculatePace,
  PACE_STATUS,
  PACE_LABELS,
} from '../utils/paceCalculations';
import { masteryCountsByType, masteryPercent } from '../utils/mastery';
import { getCurrentCohort, sortCohortsChronologically } from '../utils/cohorts';
import { tutorName } from '../utils/people';
import { getTodayDateString } from '../utils/datetime';
import usePageTitle from '../hooks/usePageTitle';
import CohortReport from '../components/calendar/CohortReport';
import StudentReport from '../components/calendar/StudentReport';

/**
 * CohortCalendar — the coordinator's planning surface.
 *
 * Shows the full season of b'nai mitzvah dates as a Shabbat-by-Shabbat
 * timeline, with clustering detection, pace dots, and a density band.
 * Admin-only (guarded at the route level).
 */
export default function CohortCalendar() {
  usePageTitle('Cohort Calendar');
  const { profile, role } = useAuth();

  // ---- Cohort selection ----
  const { cohorts, loading: cohortsLoading } = useCohorts();
  const [selectedCohortId, setSelectedCohortId] = useState(null);

  // Restore saved cohort or default to active cohort on first load
  useEffect(() => {
    if (cohorts.length === 0) return;
    if (selectedCohortId) return; // already selected

    const STORAGE_KEY = 'mymadrich:calendar_cohort';
    const stored = localStorage.getItem(STORAGE_KEY);
    const validStored = stored && cohorts.some((c) => c.id === stored);

    if (validStored) {
      setSelectedCohortId(stored);
    } else {
      // Date-aware "current" cohort; if none qualifies, leave
      // selectedCohortId null so the dropdown prompts a manual pick
      // rather than forcing an arbitrary selection.
      const current = getCurrentCohort(cohorts);
      if (current) setSelectedCohortId(current.id);
    }
  }, [cohorts, selectedCohortId]);

  // Persist cohort selection (guard against null initial state)
  useEffect(() => {
    if (!selectedCohortId) return;
    localStorage.setItem('mymadrich:calendar_cohort', selectedCohortId);
  }, [selectedCohortId]);

  const selectedCohort = cohorts.find((c) => c.id === selectedCohortId) || null;

  // ---- Students ----
  const { students, loading: studentsLoading } = useStudents(selectedCohortId);

  // ---- Per-student verse/element/session data ----
  const [studentMeta, setStudentMeta] = useState({});
  const [metaLoading, setMetaLoading] = useState(false);

  useEffect(() => {
    if (!students.length) {
      setStudentMeta({});
      return;
    }

    let cancelled = false;

    async function loadMeta() {
      setMetaLoading(true);
      const meta = {};

      try {
        const studentIds = students.map((s) => s.id);

        // Verse mastery counts per student (with reading_type for Torah/Haftarah split)
        const { data: verseRows } = await supabase
          .from('verse_current_status')
          .select('student_id, quality, reading_id, reading_type')
          .in('student_id', studentIds);

        // Element counts per student
        const { data: elemRows } = await supabase
          .from('element_current_status')
          .select('student_id, quality')
          .in('student_id', studentIds);

        // Sessions: first session date + upcoming sessions
        const { data: sessionRows } = await supabase
          .from('sessions')
          .select('student_id, session_date, tutor:profiles!tutor_id(display_name)')
          .in('student_id', studentIds)
          .order('session_date', { ascending: true });

        // Readings (for parashah info per student)
        const { data: readingRows } = await supabase
          .from('readings')
          .select('student_id, reading_type, portion_name, portion_name_hebrew, reference, sort_order')
          .in('student_id', studentIds)
          .order('sort_order');

        if (cancelled) return;

        // Group by student
        for (const s of students) {
          const verses = (verseRows || []).filter((v) => v.student_id === s.id);

          // Group verses into reading groups by reading_id for type-split counting
          const readingGroupMap = new Map();
          for (const v of verses) {
            if (!readingGroupMap.has(v.reading_id)) {
              readingGroupMap.set(v.reading_id, {
                reading_type: v.reading_type,
                verses: [],
              });
            }
            readingGroupMap.get(v.reading_id).verses.push(v);
          }
          const readingGroups = Array.from(readingGroupMap.values());
          const typeCounts = masteryCountsByType(readingGroups);

          const totalVerses = typeCounts.combined.total;
          const masteredVerses = typeCounts.combined.mastered;

          const elems = (elemRows || []).filter((e) => e.student_id === s.id);
          const totalElems = elems.length;
          const masteredElems = elems.filter((e) => e.quality === 'perfect').length;

          const studentSessions = (sessionRows || []).filter((ss) => ss.student_id === s.id);
          const firstSessionDate = studentSessions.length > 0
            ? studentSessions[0].session_date
            : null;

          const studentReadings = (readingRows || []).filter((r) => r.student_id === s.id);
          const primaryReading = studentReadings.find((r) => r.reading_type === 'torah')
            || studentReadings[0]
            || null;

          // Pace
          const pace = calculatePace({
            student: s,
            cohort: selectedCohort,
            masteredVerseCount: masteredVerses,
            totalVerseCount: totalVerses,
            firstSessionDate,
          });

          const masteryPct = totalVerses > 0
            ? Math.round((masteredVerses / totalVerses) * 100)
            : 0;

          // Upcoming session (stored on the student record)
          const nextSessionDate = s.next_session_date || null;
          const nextSessionTime = s.next_session_time || null;

          meta[s.id] = {
            totalVerses,
            masteredVerses,
            torahCounts: typeCounts.torah,
            haftarahCounts: typeCounts.haftarah,
            torahPct: typeCounts.torah.total > 0
              ? masteryPercent(typeCounts.torah.mastered, typeCounts.torah.total)
              : null,
            haftarahPct: typeCounts.haftarah.total > 0
              ? masteryPercent(typeCounts.haftarah.mastered, typeCounts.haftarah.total)
              : null,
            totalElems,
            masteredElems,
            firstSessionDate,
            pace,
            masteryPct,
            primaryReading,
            nextSessionDate,
            nextSessionTime,
            sessionCount: studentSessions.length,
          };
        }

        setStudentMeta(meta);
      } catch (err) {
        console.error('CohortCalendar: meta load error', err);
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    }

    loadMeta();
    return () => { cancelled = true; };
  }, [students, selectedCohort]);

  // ---- Derived: students with bimah dates, grouped by service date ----
  const calendarData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only students with a mitzvah_date
    const dated = students
      .filter((s) => s.mitzvah_date)
      .map((s) => {
        const meta = studentMeta[s.id] || {};
        const mitzvahD = new Date(s.mitzvah_date + 'T00:00:00');
        return {
          ...s,
          mitzvahD,
          meta,
          paceStatus: meta.pace?.status || PACE_STATUS.NOT_STARTED,
        };
      })
      .sort((a, b) => a.mitzvahD - b.mitzvahD);

    // Group by service date (YYYY-MM-DD)
    const byDate = new Map();
    for (const s of dated) {
      const key = s.mitzvah_date;
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(s);
    }

    // Build Shabbat rows
    const shabbatRows = [];
    for (const [dateStr, studs] of byDate) {
      const d = new Date(dateStr + 'T00:00:00');
      const isCluster = studs.length >= 2;
      // Use the first student's reading as the parashah for that Shabbat
      const reading = studs[0]?.meta?.primaryReading || null;

      shabbatRows.push({
        dateStr,
        date: d,
        dow: d.getDay() === 6 ? 'Sat' : d.toLocaleDateString('en-US', { weekday: 'short' }),
        dd: d.getDate(),
        month: d.toLocaleDateString('en-US', { month: 'short' }),
        monthFull: d.toLocaleDateString('en-US', { month: 'long' }),
        year: d.getFullYear(),
        monthKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        students: studs,
        isCluster,
        reading,
      });
    }

    // Group rows by month
    const monthGroups = [];
    let currentMonthKey = null;
    for (const row of shabbatRows) {
      if (row.monthKey !== currentMonthKey) {
        currentMonthKey = row.monthKey;
        monthGroups.push({
          key: row.monthKey,
          label: `${row.monthFull} ${row.year}`,
          rows: [],
        });
      }
      monthGroups[monthGroups.length - 1].rows.push(row);
    }

    // Stats
    const totalServiceDates = shabbatRows.length;
    const heavyShabbatot = shabbatRows.filter((r) => r.isCluster).length;
    const daysOut = dated.map((s) => {
      const diff = Math.ceil((s.mitzvahD - today) / (1000 * 60 * 60 * 24));
      return diff;
    });
    const avgDaysOut = daysOut.length > 0
      ? Math.round(daysOut.reduce((a, b) => a + b, 0) / daysOut.length)
      : 0;

    // Next b'nai mitzvah
    const futureDated = dated.filter((s) => s.mitzvahD >= today);
    const nextBnaiDays = futureDated.length > 0
      ? Math.ceil((futureDated[0].mitzvahD - today) / (1000 * 60 * 60 * 24))
      : null;

    // Density band: months from first to last bimah date
    const densityBand = [];
    if (dated.length > 0) {
      const first = dated[0].mitzvahD;
      const last = dated[dated.length - 1].mitzvahD;

      // Start one month before the earliest, end one month after the latest
      const startMonth = new Date(first.getFullYear(), first.getMonth() - 1, 1);
      const endMonth = new Date(last.getFullYear(), last.getMonth() + 1, 1);

      const cursor = new Date(startMonth);
      while (cursor <= endMonth) {
        const mKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        const studentsThisMonth = dated.filter((s) => {
          return s.mitzvahD.getFullYear() === cursor.getFullYear()
            && s.mitzvahD.getMonth() === cursor.getMonth();
        });
        const isNow = today.getFullYear() === cursor.getFullYear()
          && today.getMonth() === cursor.getMonth();
        const isClusterMonth = studentsThisMonth.length >= 2;

        densityBand.push({
          key: mKey,
          label: cursor.toLocaleDateString('en-US', { month: 'short' }),
          count: studentsThisMonth.length,
          isNow,
          isCluster: isClusterMonth,
        });

        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    // Upcoming sessions this week
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const upcomingSessions = [];
    for (const s of students) {
      const meta = studentMeta[s.id];
      if (meta?.nextSessionDate) {
        const nd = new Date(meta.nextSessionDate + 'T00:00:00');
        if (nd >= today && nd <= weekEnd) {
          upcomingSessions.push({
            student: s,
            date: nd,
            dateStr: meta.nextSessionDate,
            time: meta.nextSessionTime,
          });
        }
      }
    }
    upcomingSessions.sort((a, b) => a.date - b.date);

    // Pace breakdown for report
    const paceBreakdown = {
      ahead: 0,
      onTrack: 0,
      behind: 0,
      critical: 0,
      notStarted: 0,
      completed: 0,
    };
    for (const s of dated) {
      const ps = s.paceStatus;
      if (ps === PACE_STATUS.AHEAD) paceBreakdown.ahead++;
      else if (ps === PACE_STATUS.ON_TRACK) paceBreakdown.onTrack++;
      else if (ps === PACE_STATUS.BEHIND) paceBreakdown.behind++;
      else if (ps === PACE_STATUS.CRITICAL) paceBreakdown.critical++;
      else if (ps === PACE_STATUS.NOT_STARTED) paceBreakdown.notStarted++;
      else if (ps === PACE_STATUS.COMPLETED) paceBreakdown.completed++;
    }

    return {
      dated,
      shabbatRows,
      monthGroups,
      totalServiceDates,
      heavyShabbatot,
      avgDaysOut,
      nextBnaiDays,
      densityBand,
      upcomingSessions,
      paceBreakdown,
    };
  }, [students, studentMeta]);

  // ---- Report state ----
  const [showCohortReport, setShowCohortReport] = useState(false);
  const [reportStudent, setReportStudent] = useState(null);

  // Print handler
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // ---- Hebrew year (approximate from cohort dates or current) ----
  const hebrewYear = useMemo(() => {
    // Simple approximation: Jewish year ~= Gregorian year + 3760 (before Rosh Hashanah)
    const now = new Date();
    const month = now.getMonth(); // 0-indexed
    const gregYear = now.getFullYear();
    // Rosh Hashanah is roughly September/October
    const jewishYear = month >= 8 ? gregYear + 3761 : gregYear + 3760;
    return jewishYear;
  }, []);

  // ---- Loading ----
  const isLoading = cohortsLoading || studentsLoading || metaLoading;

  if (isLoading && !students.length) {
    return (
      <div className="page">
        <div className="cc-wrap">
          <div className="cc-loading">Loading cohort calendar...</div>
        </div>
      </div>
    );
  }

  // ---- Cohort report overlay ----
  if (showCohortReport) {
    return (
      <CohortReport
        cohort={selectedCohort}
        calendarData={calendarData}
        students={students}
        studentMeta={studentMeta}
        hebrewYear={hebrewYear}
        onBack={() => setShowCohortReport(false)}
        onPrint={handlePrint}
      />
    );
  }

  // ---- Student report overlay ----
  if (reportStudent) {
    const meta = studentMeta[reportStudent.id] || {};
    return (
      <StudentReport
        student={reportStudent}
        meta={meta}
        cohort={selectedCohort}
        onBack={() => setReportStudent(null)}
        onPrint={handlePrint}
      />
    );
  }

  // ---- Format upcoming session time ----
  function formatTime(timeStr) {
    if (!timeStr) return '';
    try {
      const [h, m] = timeStr.split(':');
      const hour = parseInt(h, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const h12 = hour % 12 || 12;
      return `${h12}:${m} ${ampm}`;
    } catch {
      return timeStr;
    }
  }

  function formatShortDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay() === 6 ? 'Sat' : d.toLocaleDateString('en-US', { weekday: 'short' });
    return `${dow} ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  /** Pace dot CSS class */
  function paceDotClass(status) {
    switch (status) {
      case PACE_STATUS.CRITICAL:
      case PACE_STATUS.PAST_DUE:
        return 'cc-pace cc-pace-critical';
      case PACE_STATUS.BEHIND:
        return 'cc-pace cc-pace-behind';
      case PACE_STATUS.ON_TRACK:
        return 'cc-pace cc-pace-ontrack';
      case PACE_STATUS.AHEAD:
        return 'cc-pace cc-pace-ahead';
      case PACE_STATUS.COMPLETED:
        return 'cc-pace cc-pace-completed';
      default:
        return 'cc-pace cc-pace-neutral';
    }
  }

  /** Avatar initials */
  function initials(student) {
    const f = student.first_name?.[0] || '';
    const l = student.last_name?.[0] || '';
    return `${f}${l}`.toUpperCase();
  }

  // A service date is "past" only once it is strictly before today's local date.
  // Compared as YYYY-MM-DD strings, so there is no timezone or time-of-day edge.
  const todayStr = getTodayDateString();

  return (
    <div className="page cc-page">
      <div className="cc-wrap">

        {/* ===== SUMMARY HERO ===== */}
        <section className="cc-hero" data-theme="dark">
          <div className="cc-hero-in">
            <div>
              <span className="cc-eyebrow">
                <span className="cc-star" aria-hidden="true">{'\u2605'}</span>
                {' '}Coordinator {'\u00B7'} planning view
              </span>
              <h1 className="cc-hero-title">
                {selectedCohort?.name || 'Cohort Calendar'} {'\u00B7'} {hebrewYear}
              </h1>
              <p className="cc-hero-he" dir="rtl" lang="he">
                {'\u05DC\u05D5\u05BC\u05D7\u05B7 \u05D6\u05B0\u05DE\u05B7\u05E0\u05B4\u05D9\u05DD'}
              </p>
              <div className="cc-hero-meta">
                <span>Chizuk Amuno Congregation</span>
                <span className="cc-dot" aria-hidden="true" />
                <span>{calendarData.dated.length} student{calendarData.dated.length !== 1 ? 's' : ''}</span>
                {calendarData.nextBnaiDays !== null && (
                  <>
                    <span className="cc-dot" aria-hidden="true" />
                    <span>next b{'\u2019'}nai mitzvah in {calendarData.nextBnaiDays} day{calendarData.nextBnaiDays !== 1 ? 's' : ''}</span>
                  </>
                )}
              </div>
            </div>
            <div className="cc-stats">
              <div className="cc-stat">
                <div className="cc-stat-n">{calendarData.totalServiceDates}</div>
                <div className="cc-stat-l">service dates</div>
              </div>
              <div className="cc-stat">
                <div className={`cc-stat-n${calendarData.heavyShabbatot > 0 ? ' cc-stat-warn' : ''}`}>
                  {calendarData.heavyShabbatot}
                </div>
                <div className="cc-stat-l">
                  heavy Shabbat{calendarData.heavyShabbatot !== 1 ? 'ot' : ''}
                </div>
              </div>
              <div className="cc-stat">
                <div className="cc-stat-n">{calendarData.avgDaysOut}</div>
                <div className="cc-stat-l">avg days out</div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== SEASON DENSITY BAND ===== */}
        {calendarData.densityBand.length > 0 && (
          <div className="cc-band" aria-label="Season density by month">
            {calendarData.densityBand.map((m) => (
              <div
                key={m.key}
                className={
                  'cc-mon'
                  + (m.isNow ? ' cc-mon-now' : '')
                  + (m.isCluster ? ' cc-mon-cluster' : '')
                  + (m.count === 0 ? ' cc-mon-empty' : '')
                }
              >
                <div className="cc-mon-label">{m.label}</div>
                <div className="cc-mon-pips">
                  {Array.from({ length: m.count }, (_, i) => (
                    <span key={i} className="cc-pip" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ===== CONTROLS / LEGEND ===== */}
        <div className="cc-controls">
          <h2 className="cc-controls-title">The season ahead</h2>
          <div className="cc-controls-actions">
            {cohorts.length > 1 && (
              <select
                className="input cohort-select"
                value={selectedCohortId || ''}
                onChange={(e) => setSelectedCohortId(e.target.value)}
                aria-label="Select cohort"
              >
                {sortCohortsChronologically(cohorts).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.is_active ? '' : ' (archived)'}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="btn-secondary cc-print-btn"
              onClick={() => setShowCohortReport(true)}
            >
              <PrintIcon /> Cohort report
            </button>
          </div>
          <div className="cc-legend" aria-label="Pace legend">
            <span className="cc-legend-item">
              <i className="cc-legend-dot" style={{ background: 'var(--color-accent)' }} />
              b{'\u2019'}nai mitzvah
            </span>
            <span className="cc-legend-item">
              <i className="cc-legend-dot cc-pace-critical" />
              critical
            </span>
            <span className="cc-legend-item">
              <i className="cc-legend-dot cc-pace-behind" />
              behind
            </span>
            <span className="cc-legend-item">
              <i className="cc-legend-dot cc-pace-ontrack" />
              on track
            </span>
            <span className="cc-legend-item">
              <i className="cc-legend-dot cc-pace-ahead" />
              ahead
            </span>
          </div>
        </div>

        {/* ===== SHABBAT TIMELINE ===== */}
        <div className="cc-list">

          {/* Upcoming sessions (dashed, this week) */}
          {calendarData.upcomingSessions.length > 0 && (
            <>
              <div className="cc-month-label">This week</div>
              <div className="cc-shab cc-shab-sessions">
                <div className="cc-date-col">
                  <span className="cc-date-dow">
                    {calendarData.upcomingSessions[0].date.getDay() === 6
                      ? 'Sat'
                      : calendarData.upcomingSessions[0].date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span className="cc-date-dd">
                    {calendarData.upcomingSessions[0].date.getDate()}
                  </span>
                  <span className="cc-date-mo">
                    {calendarData.upcomingSessions[0].date.toLocaleDateString('en-US', { month: 'short' })}
                  </span>
                </div>
                <div className="cc-body">
                  <div className="cc-sesh-line">
                    <b>{calendarData.upcomingSessions.length} tutoring session{calendarData.upcomingSessions.length !== 1 ? 's' : ''}</b> this week
                  </div>
                  {calendarData.upcomingSessions.length > 0 && (() => {
                    const first = calendarData.upcomingSessions[0];
                    const tName = tutorName(first.student.tutor, null);
                    const timeStr = first.time ? formatTime(first.time) : '';
                    return (
                      <div className="cc-sesh-line">
                        Earliest: <b>{first.student.first_name} {first.student.last_name}</b>
                        {' '}{'\u00B7'}{' '}{formatShortDate(first.dateStr)}
                        {timeStr ? ` at ${timeStr}` : ''}
                        {tName ? ` with ${tName}` : ''}
                        .
                      </div>
                    );
                  })()}
                </div>
              </div>
            </>
          )}

          {/* Shabbat rows by month */}
          {calendarData.monthGroups.map((group) => (
            <div key={group.key}>
              <div className="cc-month-label">{group.label}</div>
              {group.rows.map((row) => (
                <div
                  key={row.dateStr}
                  className={`cc-shab${row.isCluster && row.dateStr >= todayStr ? ' cc-shab-cluster' : ''}`}
                >
                  <div className="cc-date-col">
                    <span className="cc-date-dow">{row.dow}</span>
                    <span className="cc-date-dd">{row.dd}</span>
                    <span className="cc-date-mo">{row.month}</span>
                  </div>
                  <div className="cc-body">
                    {row.dateStr < todayStr ? (
                      <>
                        {/* Past service: always celebrated, whatever the progress
                            or whether a reading was ever entered */}
                        <div className="cc-parashah">
                          <span className="cc-parashah-name cc-parashah-complete">
                            B{'\u2019'}nai mitzvah complete
                          </span>
                        </div>
                        {row.reading && (
                          <div className="cc-parashah">
                            <span className="cc-parashah-ref">
                              Parashat {row.reading.portion_name}
                            </span>
                            {row.reading.portion_name_hebrew && (
                              <span className="cc-parashah-he" dir="rtl" lang="he">
                                {row.reading.portion_name_hebrew}
                              </span>
                            )}
                            {row.reading.reference && (
                              <span className="cc-parashah-ref">
                                {'\u00B7'} {row.reading.reference}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Today or later: the upcoming parashah, or pending */}
                        {row.reading ? (
                          <div className="cc-parashah">
                            <span className="cc-parashah-name">
                              Parashat {row.reading.portion_name}
                            </span>
                            {row.reading.portion_name_hebrew && (
                              <span className="cc-parashah-he" dir="rtl" lang="he">
                                {row.reading.portion_name_hebrew}
                              </span>
                            )}
                            {row.reading.reference && (
                              <span className="cc-parashah-ref">
                                {'\u00B7'} {row.reading.reference}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="cc-parashah">
                            <span className="cc-parashah-name cc-parashah-pending">
                              Parashah pending assignment
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Cluster flag: a planning cue, so upcoming services only */}
                    {row.isCluster && row.dateStr >= todayStr && (
                      <div className="cc-flag">
                        <span className="cc-star" aria-hidden="true">{'\u2605'}</span>
                        <span>
                          <b>Heavy Shabbat: {row.students.length} b{'\u2019'}nai mitzvah</b> on one service. Confirm honors, aliyot & timing early.
                        </span>
                      </div>
                    )}

                    {/* Student chips */}
                    <div className="cc-students">
                      {row.students.map((s) => {
                        const isPast = row.dateStr < todayStr;
                        const tName = tutorName(s.tutor, null);
                        const torahPct = s.meta?.torahPct;
                        const haftarahPct = s.meta?.haftarahPct;
                        const hasTorah = torahPct !== null && torahPct !== undefined;
                        const hasHaftarah = haftarahPct !== null && haftarahPct !== undefined;

                        return (
                          <button
                            key={s.id}
                            type="button"
                            className="cc-chip"
                            onClick={() => setReportStudent(s)}
                            title={`View progress report for ${s.first_name} ${s.last_name}`}
                          >
                            <span className="cc-av">{initials(s)}</span>
                            <span className="cc-chip-who">{s.first_name} {s.last_name}</span>
                            {tName && (
                              <span className="cc-chip-tut">{'\u00B7'} {tName}</span>
                            )}
                            {!isPast && (hasTorah || hasHaftarah) && (
                              <span className="cc-chip-readiness">
                                {hasTorah && (
                                  <span className="cc-chip-pct">Torah {torahPct}%</span>
                                )}
                                {hasTorah && hasHaftarah && (
                                  <span className="cc-chip-sep">{'\u00B7'}</span>
                                )}
                                {hasHaftarah && (
                                  <span className="cc-chip-pct">Haft {haftarahPct}%</span>
                                )}
                              </span>
                            )}
                            {!isPast && (
                              <span className={paceDotClass(s.paceStatus)} aria-label={PACE_LABELS[s.paceStatus] || 'Unknown pace'} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {/* Empty state */}
          {calendarData.dated.length === 0 && !isLoading && (
            <div className="cc-empty">
              <p>No students with assigned mitzvah dates in this cohort yet.</p>
              <p>
                <Link to="/admin">Assign dates in Admin</Link> to populate the calendar.
              </p>
            </div>
          )}
        </div>

        {/* ===== NOTE ===== */}
        <div className="cc-note">
          <span>
            Parashot and Hebrew are derived from student reading assignments {'\u00B7'} dates pending calendar review
          </span>
        </div>
      </div>
    </div>
  );
}


/* ---- Inline icon (print) ---- */
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
