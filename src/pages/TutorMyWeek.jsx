/**
 * TutorMyWeek — Tutor lesson-planning cockpit.
 *
 * Shows the tutor's upcoming sessions (rolling 7-day window),
 * grouped by day, with session prep, suggested focus, and actions.
 *
 * Data is read-only — no new writable data. Suggested focus is
 * computed from existing verse_current_status + last_session_date.
 *
 * Route: /my-week (tutor + admin only)
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { QUALITY, QUALITY_LABELS_PRECISION, QUALITY_COLORS, COLOR_GRAY } from '../utils/constants';
import { calculatePace, PACE_STATUS, PACE_LABELS, formatTargetDate } from '../utils/paceCalculations';
import { masteryCounts } from '../utils/mastery';
import { formatSessionTime, formatDateShort, formatSessionTimeRange, computeDurationMinutes } from '../utils/datetime';
import { mitzvahLabel } from '../utils/people';
import { resolvePrimaryGuardianContact, buildTutorSessionMailto } from '../utils/mailto';
import { buildSessionIcs, buildWeekIcs, downloadIcs } from '../utils/icsBuilder';
import usePageTitle from '../hooks/usePageTitle';
import TutorMissingHoursNudge from '../components/ui/TutorMissingHoursNudge';

// ---- Constants ----

/** Default session duration in minutes (no duration column on sessions yet). */
const DEFAULT_DURATION_MIN = 45;

/** Rolling window: today through today + 6 days. */
function getWeekRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const toIso = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return { startDate: toIso(today), endDate: toIso(end), todayDate: toIso(today) };
}

/** Format a date string as "Tuesday, June 16". */
function formatDayHeading(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Get relative day label: "Today", "Tomorrow", or null. */
function getRelativeDayLabel(dateStr, todayStr) {
  if (dateStr === todayStr) return 'Today';
  const today = new Date(todayStr + 'T00:00:00');
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  if (dateStr === tomorrowStr) return 'Tomorrow';
  return null;
}

/** Extract time parts from "HH:MM" or "HH:MM:SS" for display. */
function parseTimeForDisplay(timeStr) {
  if (!timeStr) return { hour: '', ampm: '' };
  const parts = timeStr.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1] || '00';
  if (isNaN(h)) return { hour: '', ampm: '' };
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return { hour: `${h}:${m}`, ampm };
}

/** Get initials from first + last name. */
function getInitials(first, last) {
  return `${first?.charAt(0) || ''}${last?.charAt(0) || ''}`.toUpperCase();
}

// ---- Suggested Focus Logic ----

/**
 * Computes 2-4 suggested focus verses for a student.
 *
 * Priority 1 (STUCK): quality in [still_learning, moderate_mistakes],
 *   sorted by last_session_date ascending (oldest first).
 * Priority 2 (STALE): any non-null quality except perfect,
 *   sorted by last_session_date ascending.
 * Cap at 4, deduplicated.
 *
 * @param {Array} verses - From verse_current_status (all verses for student)
 * @returns {{ verses: Array, isJustStarted: boolean }}
 */
function computeSuggestedFocus(verses) {
  if (!verses || verses.length === 0) {
    return { verses: [], isJustStarted: true };
  }

  // Check if any verse has been rated
  const ratedVerses = verses.filter((v) => v.quality != null);
  if (ratedVerses.length === 0) {
    return { verses: [], isJustStarted: true };
  }

  const byDateAsc = (a, b) => {
    const da = a.last_session_date || '0000-00-00';
    const db = b.last_session_date || '0000-00-00';
    return da.localeCompare(db);
  };

  // P1: Stuck verses (still_learning or moderate_mistakes)
  const stuck = ratedVerses
    .filter((v) =>
      v.quality === QUALITY.STILL_LEARNING ||
      v.quality === QUALITY.MODERATE_MISTAKES
    )
    .sort(byDateAsc);

  // P2: Stale verses (any non-mastered, non-null quality, excluding P1 duplicates)
  const stuckIds = new Set(stuck.map((v) => v.verse_id));
  const stale = ratedVerses
    .filter((v) =>
      v.quality !== QUALITY.PERFECT &&
      !stuckIds.has(v.verse_id)
    )
    .sort(byDateAsc);

  // Merge: P1 first, then P2, cap at 4
  const focus = [...stuck, ...stale].slice(0, 4);

  return { verses: focus, isJustStarted: false };
}

/**
 * Returns the "why" string for a focus verse chip.
 * e.g. "3-5 mistakes, last worked May 31" or "still learning"
 */
function focusWhy(verse) {
  const label = QUALITY_LABELS_PRECISION[verse.quality] || '';
  if (verse.last_session_date) {
    const dateStr = formatDateShort(verse.last_session_date);
    return `${label} \u00B7 last worked ${dateStr}`;
  }
  return label;
}

/**
 * Returns the CSS color for a quality level (for the dot).
 */
function qualityDotColor(quality) {
  return QUALITY_COLORS[quality] || COLOR_GRAY;
}

// ---- Pace CSS class ----
function paceClass(status) {
  if (status === PACE_STATUS.BEHIND || status === PACE_STATUS.CRITICAL || status === PACE_STATUS.PAST_DUE) return 'behind';
  if (status === PACE_STATUS.AHEAD) return 'ahead';
  return 'ontrack';
}

// ---- Component ----

export default function TutorMyWeek() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  usePageTitle('My Week');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Raw data
  const [weekSessions, setWeekSessions] = useState([]);
  const [studentMap, setStudentMap] = useState({});
  const [verseMap, setVerseMap] = useState({});
  const [homeworkMap, setHomeworkMap] = useState({});
  const [lastSessionDetailMap, setLastSessionDetailMap] = useState({});
  const [paceMap, setPaceMap] = useState({});

  // ---- Data fetch ----
  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const { startDate, endDate } = getWeekRange();

        // 1. Get this tutor's students via M:N student_tutors join table
        //    First, get student IDs from student_tutors where tutor_id = me
        const { data: assignmentRows, error: assignErr } = await supabase
          .from('student_tutors')
          .select('student_id')
          .eq('tutor_id', user.id);
        if (assignErr) throw assignErr;

        const myStudentIds = (assignmentRows || []).map((r) => r.student_id);

        if (myStudentIds.length === 0) {
          setWeekSessions([]);
          setStudentMap({});
          setLoading(false);
          return;
        }

        // Then fetch the actual student records for those IDs
        const { data: students, error: studErr } = await supabase
          .from('students')
          .select(`
            id, first_name, last_name, hebrew_name, mitzvah_date, mitzvah_type,
            tutor_id, lessons_per_week, target_completion_date, created_at, status,
            cohort:cohorts!cohort_id(id, name, start_date, completion_buffer_weeks, default_lessons_per_week),
            student_guardians(name, email, is_primary),
            readings:readings(id, reading_type, portion_name, portion_name_hebrew, aliyah, reference, sort_order)
          `)
          .in('id', myStudentIds)
          .in('status', ['active', 'deferred']);
        if (studErr) throw studErr;

        if (!students || students.length === 0) {
          setWeekSessions([]);
          setStudentMap({});
          setLoading(false);
          return;
        }

        // Build student lookup
        const sMap = {};
        students.forEach((s) => { sMap[s.id] = s; });
        setStudentMap(sMap);

        const studentIds = students.map((s) => s.id);

        // 2. Find sessions with next_session_date in the rolling window
        //    These are the most recent sessions per student that scheduled
        //    a next session in this week's range.
        const { data: sessionsRaw, error: sessErr } = await supabase
          .from('sessions')
          .select(`
            id, student_id, session_date, next_session_date, next_session_time, next_session_end_time,
            homework_notes, homework_minutes_per_day,
            session_verse_progress(verse_id, status, quality),
            homework_items(id, description, completed_at)
          `)
          .in('student_id', studentIds)
          .gte('next_session_date', startDate)
          .lte('next_session_date', endDate)
          .order('next_session_date', { ascending: true })
          .order('next_session_time', { ascending: true, nullsFirst: false });
        if (sessErr) throw sessErr;

        // Group: for each student, keep all scheduled sessions in range
        // (a student might have multiple upcoming sessions, like Ari in the prototype)
        const weekSess = (sessionsRaw || []).map((sess) => ({
          ...sess,
          student: sMap[sess.student_id],
        })).filter((s) => s.student);

        setWeekSessions(weekSess);

        // 3. Build homework map from these sessions
        const hwMap = {};
        weekSess.forEach((sess) => {
          const items = sess.homework_items || [];
          if (items.length > 0) {
            hwMap[sess.id] = {
              total: items.length,
              done: items.filter((i) => i.completed_at != null).length,
            };
          }
        });
        setHomeworkMap(hwMap);

        // 4. Fetch verse statuses for all students in the week
        const weekStudentIds = [...new Set(weekSess.map((s) => s.student_id))];
        if (weekStudentIds.length > 0) {
          const { data: verseData, error: verseErr } = await supabase
            .from('verse_current_status')
            .select('verse_id, reading_id, verse_reference, sort_order, student_id, reading_type, portion_name, status, quality, last_session_date')
            .in('student_id', weekStudentIds);
          if (verseErr) throw verseErr;

          const vMap = {};
          (verseData || []).forEach((v) => {
            if (!vMap[v.student_id]) vMap[v.student_id] = [];
            vMap[v.student_id].push(v);
          });
          setVerseMap(vMap);

          // 5. Compute pace for each student
          const pMap = {};
          // Need first session dates for pace
          const { data: firstSessData, error: fsErr } = await supabase
            .from('sessions')
            .select('student_id, session_date')
            .in('student_id', weekStudentIds)
            .order('session_date', { ascending: true });
          if (fsErr) throw fsErr;

          const firstSessMap = {};
          (firstSessData || []).forEach((row) => {
            if (!firstSessMap[row.student_id]) firstSessMap[row.student_id] = row.session_date;
          });

          weekStudentIds.forEach((sid) => {
            const s = sMap[sid];
            if (!s) return;
            const verses = vMap[sid] || [];
            const counts = masteryCounts(verses);
            pMap[sid] = calculatePace({
              student: s,
              cohort: s.cohort,
              masteredVerseCount: counts.mastered,
              totalVerseCount: counts.total,
              firstSessionDate: firstSessMap[sid] || null,
            });
          });
          setPaceMap(pMap);

          // 6. Last session detail (most recent logged session per student, for "Last time" cell)
          const { data: recentSessions, error: rsErr } = await supabase
            .from('sessions')
            .select(`
              id, student_id, session_date,
              session_verse_progress(verse_id, status, quality,
                verse:verses!verse_id(verse_reference)
              )
            `)
            .in('student_id', weekStudentIds)
            .order('session_date', { ascending: false });
          if (rsErr) throw rsErr;

          const lsdMap = {};
          (recentSessions || []).forEach((sess) => {
            if (lsdMap[sess.student_id]) return; // keep only most recent
            lsdMap[sess.student_id] = {
              date: sess.session_date,
              versesWorked: (sess.session_verse_progress || []).map((vp) => ({
                reference: vp.verse?.verse_reference || '',
                quality: vp.quality,
                status: vp.status,
              })),
            };
          });
          setLastSessionDetailMap(lsdMap);
        }
      } catch (err) {
        console.error('TutorMyWeek fetch error:', err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user]);

  // ---- Derived data ----
  const { todayDate } = useMemo(() => getWeekRange(), []);

  // Group sessions by day
  const dayGroups = useMemo(() => {
    const groups = {};
    weekSessions.forEach((sess) => {
      const day = sess.next_session_date;
      if (!groups[day]) groups[day] = [];
      groups[day].push(sess);
    });
    // Sort days chronologically
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sessions]) => ({ date, sessions }));
  }, [weekSessions]);

  // Unique students this week
  const uniqueStudents = useMemo(() => {
    const ids = new Set(weekSessions.map((s) => s.student_id));
    return ids.size;
  }, [weekSessions]);

  // Attention students (behind or critical)
  const attentionStudents = useMemo(() => {
    const seen = new Set();
    return weekSessions
      .filter((sess) => {
        if (seen.has(sess.student_id)) return false;
        const pace = paceMap[sess.student_id];
        const needsAttention = pace &&
          (pace.status === PACE_STATUS.BEHIND ||
           pace.status === PACE_STATUS.CRITICAL ||
           pace.status === PACE_STATUS.PAST_DUE);
        if (needsAttention) {
          seen.add(sess.student_id);
          return true;
        }
        return false;
      })
      .map((sess) => sess.student);
  }, [weekSessions, paceMap]);

  // ---- ICS helpers ----
  function sessionToIcsData(sess) {
    const s = sess.student || studentMap[sess.student_id];
    const reading = s?.readings?.[0];
    const pace = paceMap[sess.student_id];
    return {
      studentId: sess.student_id,
      studentName: s ? `${s.first_name} ${s.last_name}` : 'Student',
      nextDate: sess.next_session_date,
      nextTime: sess.next_session_time || null,
      nextEndTime: sess.next_session_end_time || null,
      parashah: reading?.portion_name || '',
      paceLabel: pace ? PACE_LABELS[pace.status] || '' : '',
      appUrl: `${window.location.origin}/madrich/dashboard`,
    };
  }

  function handleDownloadSessionIcs(sess) {
    const data = sessionToIcsData(sess);
    const s = sess.student || studentMap[sess.student_id];
    const name = s ? `${s.first_name}-${s.last_name}`.toLowerCase() : 'session';
    const dateSlug = sess.next_session_date;
    const ics = buildSessionIcs(data);
    downloadIcs(ics, `${name}-${dateSlug}.ics`);
  }

  function handleDownloadWeekIcs() {
    const allData = weekSessions.map(sessionToIcsData);
    const ics = buildWeekIcs(allData);
    downloadIcs(ics, 'my-week.ics');
  }

  // ---- Mailto helper ----
  function getFamilyMailto(sess) {
    const s = sess.student || studentMap[sess.student_id];
    if (!s) return '';
    const contact = resolvePrimaryGuardianContact(s.student_guardians);
    if (!contact) return '';
    return buildTutorSessionMailto({
      guardianEmail: contact.email,
      guardianName: contact.name,
      studentFirstName: s.first_name,
      tutorDisplayName: profile?.display_name || '',
      sessionDate: sess.next_session_date,
      sessionTime: sess.next_session_time,
    });
  }

  function getFamilyLastName(sess) {
    const s = sess.student || studentMap[sess.student_id];
    return s?.last_name || 'family';
  }

  // ---- Render ----

  if (loading) {
    return (
      <div className="tw-wrap">
        <div className="tw-hero" style={{ minHeight: '140px', opacity: 0.6 }}>
          <div className="tw-hero-in">
            <div>
              <span className="eyebrow"><span className="tw-star" aria-hidden="true">&#x2605;</span> Madrich &middot; lesson planning</span>
              <h1>My Week</h1>
            </div>
          </div>
        </div>
        <p className="form-hint" style={{ marginTop: 'var(--space-6)', textAlign: 'center' }}>Loading your week...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tw-wrap">
        <div className="card" style={{ padding: 'var(--space-6)' }}>
          <p className="form-error">Failed to load schedule: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tw-wrap">
      {/* Hero */}
      <section className="tw-hero">
        <div className="tw-hero-in">
          <div>
            <span className="eyebrow"><span className="tw-star" aria-hidden="true">&#x2605;</span> Madrich &middot; lesson planning</span>
            <h1>My Week</h1>
            <div className="tw-hero-meta">
              <span>{profile?.display_name || 'Tutor'}</span>
              <span className="tw-hero-dot" aria-hidden="true" />
              <span>{uniqueStudents} student{uniqueStudents !== 1 ? 's' : ''}</span>
              <span className="tw-hero-dot" aria-hidden="true" />
              <span><b>{weekSessions.length} session{weekSessions.length !== 1 ? 's' : ''}</b> this week</span>
              {attentionStudents.length > 0 && (
                <>
                  <span className="tw-hero-dot" aria-hidden="true" />
                  <span>{attentionStudents.length} need attention</span>
                </>
              )}
            </div>
          </div>
          {weekSessions.length > 0 && (
            <button
              className="tw-cal"
              type="button"
              onClick={handleDownloadWeekIcs}
            >
              &#x1F4C5; Add my week to calendar
            </button>
          )}
        </div>

        {/* Missing hours nudge */}
        <TutorMissingHoursNudge tutorId={user?.id} />

        {/* Attention strip */}
        {attentionStudents.length > 0 && (
          <div className="tw-attn">
            <span className="tw-attn-ic" aria-hidden="true">&#9888;</span>
            <span>
              <b>Heads up before you teach:</b>{' '}
              {attentionStudents.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && ' and '}
                  <span className="tw-attn-name">{s.first_name} {s.last_name}</span>
                </span>
              ))}
              {' '}{attentionStudents.length === 1 ? 'is' : 'are'} behind pace{' '}
              &mdash; their prep below flags what to drill first.
            </span>
          </div>
        )}
      </section>

      {/* Empty state */}
      {weekSessions.length === 0 && (
        <div className="card" style={{ marginTop: 'var(--space-6)', padding: 'var(--space-6)', textAlign: 'center' }}>
          <p className="form-hint">No sessions scheduled this week.</p>
          <p className="form-hint" style={{ marginTop: 'var(--space-2)' }}>
            Sessions appear here when you set a "Next session" date while logging.
          </p>
        </div>
      )}

      {/* Day groups */}
      {dayGroups.map(({ date, sessions }) => {
        const relativeLabel = getRelativeDayLabel(date, todayDate);
        const isToday = date === todayDate;

        return (
          <div key={date} className="tw-day">
            <div className={`tw-day-h${isToday ? ' today' : ''}`}>
              {relativeLabel && <span className="tw-day-pill">{relativeLabel}</span>}
              <span className="tw-day-d">{formatDayHeading(date)}</span>
              <span className="tw-day-sub">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
            </div>

            {sessions.map((sess) => {
              const s = sess.student || studentMap[sess.student_id];
              if (!s) return null;

              const time = parseTimeForDisplay(sess.next_session_time);
              const initials = getInitials(s.first_name, s.last_name);
              const reading = (s.readings || []).sort((a, b) => a.sort_order - b.sort_order)[0];
              const pace = paceMap[s.id];
              const pStatus = pace?.status || PACE_STATUS.NOT_STARTED;
              const verses = verseMap[s.id] || [];
              const focus = computeSuggestedFocus(verses);
              const hw = homeworkMap[sess.id];
              const lastDetail = lastSessionDetailMap[s.id];
              const mailto = getFamilyMailto(sess);
              const familyName = getFamilyLastName(sess);

              // Compact pace projection string
              let paceProjection = '';
              if (pace) {
                if (pace.weeksRemaining != null && pace.weeksRemaining > 0) {
                  paceProjection = `\u00B7 ~${Math.round(pace.weeksRemaining)} wks left`;
                }
                if (pace.projectedCompletionDate && (pStatus === PACE_STATUS.BEHIND || pStatus === PACE_STATUS.CRITICAL)) {
                  paceProjection += ` \u00B7 projected ${formatTargetDate(pace.projectedCompletionDate)}`;
                }
                if (pStatus === PACE_STATUS.NOT_STARTED && pace.weeksRemaining != null) {
                  paceProjection = `\u00B7 just started \u00B7 ~${Math.round(pace.weeksRemaining)} wks of runway`;
                }
              }

              // "Last time" content
              const lastTimeContent = lastDetail ? (() => {
                const versesWorked = lastDetail.versesWorked || [];
                const refs = versesWorked.map((v) => v.reference).filter(Boolean);
                const masteredThisSession = versesWorked.filter((v) => v.quality === QUALITY.PERFECT);
                let summary = '';
                if (refs.length > 0) {
                  summary = `Worked ${refs.slice(0, 3).join(', ')}${refs.length > 3 ? ` +${refs.length - 3} more` : ''}.`;
                }
                if (masteredThisSession.length > 0) {
                  const masteredRefs = masteredThisSession.map((v) => v.reference).filter(Boolean);
                  summary += ` ${masteredRefs.length > 0 ? masteredRefs.join(', ') : `${masteredThisSession.length} verse${masteredThisSession.length > 1 ? 's' : ''}`} reached mastery.`;
                }
                return summary || 'Session logged, no verse detail recorded.';
              })() : null;

              return (
                <div key={sess.id} className="tw-sesh">
                  {/* Time rail */}
                  <div className="tw-time">
                    {time.hour ? (
                      <>
                        <span className="tw-time-t">{time.hour}</span>
                        <span className="tw-time-ap">{time.ampm}</span>
                      </>
                    ) : (
                      <span className="tw-time-t" style={{ fontSize: 'var(--text-sm)' }}>TBD</span>
                    )}
                    <span className="tw-time-dur">{computeDurationMinutes(sess.next_session_time, sess.next_session_end_time) || DEFAULT_DURATION_MIN} min</span>
                  </div>

                  {/* Body */}
                  <div className="tw-body">
                    {/* Top: student info + pace */}
                    <div className="tw-top">
                      <div className="tw-stu">
                        <span className="tw-av">{initials}</span>
                        <span>
                          <div className="tw-name">{s.first_name} {s.last_name}</div>
                          <div className="tw-sub">
                            {mitzvahLabel(s.mitzvah_type)}
                            {reading && (
                              <>
                                {' \u00B7 Parashat '}{reading.portion_name}
                                {reading.portion_name_hebrew && (
                                  <>{' \u00B7 '}<span className="tw-he" dir="rtl" lang="he">{reading.portion_name_hebrew}</span></>
                                )}
                              </>
                            )}
                            {s.mitzvah_date && <>{' \u00B7 '}{formatTargetDate(s.mitzvah_date)}</>}
                          </div>
                        </span>
                      </div>
                      <span className={`tw-pace ${paceClass(pStatus)}`}>
                        <span className="tw-pace-lab">{PACE_LABELS[pStatus] || pStatus}</span>
                        {paceProjection && <span className="tw-pace-proj">{paceProjection}</span>}
                      </span>
                    </div>

                    {/* Prep block */}
                    <div className="tw-prep">
                      {/* Last time */}
                      <div className="tw-cell">
                        <div className="tw-cell-k">
                          Last time{lastDetail ? ` \u00B7 ${formatDateShort(lastDetail.date)}` : ''}
                        </div>
                        <div className="tw-cell-v">
                          {lastTimeContent || <span className="tw-muted">No previous session logged.</span>}
                        </div>
                      </div>

                      {/* Assigned */}
                      <div className="tw-cell">
                        <div className="tw-cell-k">Assigned</div>
                        <div className="tw-cell-v">
                          {sess.homework_notes ? (
                            <>
                              {sess.homework_notes}
                              {sess.homework_minutes_per_day && <>{' \u00B7 '}{sess.homework_minutes_per_day} min/day</>}
                            </>
                          ) : (
                            <span className="tw-muted">No homework assigned.</span>
                          )}
                          {hw && (
                            <div className={`tw-hw${hw.done === hw.total ? '' : ' partial'}`}>
                              {hw.done === hw.total ? '\u2713' : '\u2682'} Homework: {hw.done} of {hw.total} practiced
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Suggested focus OR building the foundation */}
                      {focus.isJustStarted ? (
                        <div className="tw-note-foundation">
                          <b>Building the foundation.</b> No verses rated yet &mdash; that's expected this early.
                          {pStatus === PACE_STATUS.ON_TRACK || pStatus === PACE_STATUS.NOT_STARTED ? (
                            <> Pace shows <b>{PACE_LABELS[pStatus]}</b> because there's ample runway, not because work is done.</>
                          ) : null}
                        </div>
                      ) : focus.verses.length > 0 ? (
                        <div className="tw-focus">
                          <div className="tw-focus-k">
                            <span className="tw-star" aria-hidden="true">&#x2605;</span>
                            {' '}Suggested focus this session
                          </div>
                          <div className="tw-verses">
                            {focus.verses.map((v) => (
                              <span key={v.verse_id} className="tw-vchip">
                                <span
                                  className="tw-vchip-lvl"
                                  style={{ backgroundColor: qualityDotColor(v.quality) }}
                                  aria-hidden="true"
                                />
                                <span className="tw-vchip-ref">{v.verse_reference}</span>
                                <span className="tw-vchip-why">{focusWhy(v)}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* Actions */}
                      <div className="tw-actions">
                        <button
                          className="tw-btn primary"
                          type="button"
                          onClick={() => navigate(`/sessions/new?student=${s.id}`)}
                        >
                          Open Log Session
                        </button>
                        <button
                          className="tw-btn"
                          type="button"
                          onClick={() => handleDownloadSessionIcs(sess)}
                        >
                          &#x1F4C5; Add to calendar
                        </button>
                        {mailto && (
                          <a
                            className="tw-btn"
                            href={mailto}
                          >
                            &#9993; Message the {familyName}s
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
