import { useState, useEffect, useMemo, Fragment } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  ROLES,
  READING_TYPE,
  MILESTONE_STAGES,
  milestoneForReadiness,
  BENCHMARK_CATEGORY,
  BENCHMARK_STATUS,
  getBenchmarkType,
  DVAR_STAGE,
  getDvarStage,
  getDvarFamilyLine,
} from '../utils/constants';
import {
  calculatePace,
  calculateElementsSummary,
} from '../utils/paceCalculations';
import { tutorName, mitzvahLabel, mitzvahPronoun } from '../utils/people';
import { formatSessionTime } from '../utils/datetime';
import usePageTitle from '../hooks/usePageTitle';
import MenorahReadiness from '../components/domain/MenorahReadiness';
import StudentSwitcher from '../components/ui/StudentSwitcher';
import { emblemGold } from '../assets/emblem';
import simchakitLogo from '../assets/simchakit-logo.png';

const SIMCHAKIT_URL = 'https://about.simcha-kit.com/';

// ---- Helpers (page-local, pure) ----

/** Days between today and a date string. Positive = future. */
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

/** Format mitzvah date as "Shabbat, May 3, 2026" (Saturday → Shabbat). */
function formatMitzvahDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const dayName = d.getDay() === 6
    ? 'Shabbat'
    : d.toLocaleDateString('en-US', { weekday: 'long' });
  const rest = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return `${dayName}, ${rest}`;
}

/** Format a date string as "Sunday, September 7, 2025". */
function formatLongDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const dayName = d.getDay() === 6
    ? 'Shabbat'
    : d.toLocaleDateString('en-US', { weekday: 'long' });
  const rest = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return `${dayName}, ${rest}`;
}

/** Format a date as "Monday, December 22, 2025" for the "today" node. */
function formatTodayDate() {
  const d = new Date();
  const dayName = d.getDay() === 6
    ? 'Shabbat'
    : d.toLocaleDateString('en-US', { weekday: 'long' });
  const rest = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return `${dayName}, ${rest}`;
}

/** Month name from a Date object. */
function monthName(d) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Build the journey spine nodes from real data.
 *
 * Returns an array of node objects:
 *   { type, state, eyebrow, title, titleHe, detail, stageKey? }
 *
 *   type:  'begun' | 'milestone' | 'today' | 'dvar-torah' | 'next-session' | 'projected' | 'benchmark' | 'bimah'
 *   state: 'done' | 'now' | 'future'
 */
function buildJourneyNodes({
  student,
  firstName,
  sessions,
  masteryPct,
  masteredVerses,
  totalVerses,
  elementsSummary,
  pace,
  currentStage,
  tutorDisplayName,
  mitzvahDateFormatted,
  daysToMitzvah,
  latestSession,
  primaryReading,
  benchmarks,
  dvarTorahStage,
}) {
  const nodes = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Journey begins (first session, or student created_at)
  const firstSession = sessions.length > 0
    ? sessions[sessions.length - 1]
    : null;
  const begunDate = firstSession?.session_date || student.created_at?.split('T')[0];

  if (begunDate) {
    const portionName = primaryReading?.portion_name || 'their parashah';
    nodes.push({
      type: 'begun',
      state: 'done',
      eyebrow: formatLongDate(begunDate),
      title: 'The journey begins',
      titleHe: null,
      detail: tutorDisplayName
        ? `${firstName} was matched with ${tutorDisplayName} and received ${mitzvahPronoun(student.mitzvah_type)} parashah, ${portionName}.`
        : `${firstName} received ${mitzvahPronoun(student.mitzvah_type)} parashah, ${portionName}.`,
    });
  }

  // 2. Past milestone stage crossings (derive dates from sessions)
  //    Walk through sessions chronologically and detect when cumulative mastery
  //    first crossed each stage threshold.
  const pastMilestones = derivePastMilestones(sessions, totalVerses, currentStage);
  for (const pm of pastMilestones) {
    const stage = MILESTONE_STAGES[pm.stageIndex];
    nodes.push({
      type: 'milestone',
      state: 'done',
      stageKey: stage.key,
      eyebrow: `${formatLongDate(pm.date)} \u00B7 Milestone`,
      title: stage.en,
      titleHe: stage.he,
      detail: getMilestoneCaption(stage, firstName, pm),
    });
  }

  // 3. TODAY node
  const todayLabel = formatTodayDate();
  let readinessLine = '';
  if (totalVerses > 0) {
    readinessLine = `${masteryPct}% ready: ${masteredVerses} of ${totalVerses} verses learned with trope.`;
  }
  let todayDetail = readinessLine;
  if (daysToMitzvah !== null && daysToMitzvah > 0) {
    todayDetail += ` ${firstName} has ${daysToMitzvah} day${daysToMitzvah === 1 ? '' : 's'} to go.`;
  }
  if (elementsSummary && elementsSummary.status === 'in_progress') {
    todayDetail += ` ${elementsSummary.masteredCount} of ${elementsSummary.totalCount} service elements learned.`;
  }

  nodes.push({
    type: 'today',
    state: 'now',
    eyebrow: `Today \u00B7 ${todayLabel}`,
    title: currentStage.en,
    titleHe: currentStage.he,
    detail: todayDetail,
  });

  // 3b. D'var Torah stage (current-state indicator, not date-sorted)
  //     Pinned to the TODAY position. Suppressed for 'not_started'.
  //     'delivered' renders as state: 'done'.
  if (dvarTorahStage && dvarTorahStage !== DVAR_STAGE.NOT_STARTED) {
    const stageObj = getDvarStage(dvarTorahStage);
    const familyLine = getDvarFamilyLine(dvarTorahStage, firstName);
    const isDelivered = dvarTorahStage === DVAR_STAGE.DELIVERED;

    nodes.push({
      type: 'dvar-torah',
      state: isDelivered ? 'done' : 'now',
      eyebrow: isDelivered ? 'Complete' : 'In progress',
      title: `D\u2019var Torah: ${stageObj?.label || dvarTorahStage}`,
      titleHe: null,
      detail: familyLine || '',
    });
  }

  // 4. Next session (if scheduled)
  const nextDate = latestSession?.next_session_date;
  const nextTime = latestSession?.next_session_time;
  if (nextDate) {
    const nextD = new Date(nextDate + 'T00:00:00');
    if (nextD >= today) {
      const timeStr = nextTime ? formatSessionTime(nextTime) : '';
      nodes.push({
        type: 'next-session',
        state: 'future',
        eyebrow: `Next up \u00B7 ${formatLongDate(nextDate)}`,
        title: 'Next session',
        titleHe: null,
        detail: timeStr && tutorDisplayName
          ? `at ${timeStr} with ${tutorDisplayName}.`
          : timeStr
            ? `at ${timeStr}.`
            : tutorDisplayName
              ? `with ${tutorDisplayName}.`
              : '',
      });
    }
  }

  // 5. Projected future stage crossings
  const currentStageIndex = MILESTONE_STAGES.indexOf(currentStage);
  if (currentStageIndex >= 0 && currentStageIndex < 6 && pace && pace.projectedCompletionDate) {
    // Project when remaining stages might be reached based on current velocity
    const remainingStages = MILESTONE_STAGES.slice(currentStageIndex + 1).filter(
      (s) => s.key !== 'hanachah' && s.key !== 'mukhan'
    );

    for (const futureStage of remainingStages) {
      const projectedDate = projectStageDate(
        masteryPct,
        futureStage.min,
        pace,
        today,
        student.mitzvah_date
      );
      if (projectedDate) {
        nodes.push({
          type: 'projected',
          state: 'future',
          stageKey: futureStage.key,
          eyebrow: `Ahead \u00B7 projected ${monthName(projectedDate)}`,
          title: futureStage.en,
          titleHe: futureStage.he,
          detail: futureStage.blurb,
        });
      }
    }
  }

  // 6. Benchmark meetings (scheduled/completed only — never pending shells)
  //    Interleaved by scheduled_date among the projected nodes.
  //    Replaces the old hardcoded "final rehearsal" node.
  const scheduledBenchmarks = (benchmarks || []).filter(
    (bm) => bm.scheduled_date && (bm.status === 'scheduled' || bm.status === 'completed')
  );

  for (const bm of scheduledBenchmarks) {
    const bmDate = new Date(bm.scheduled_date + 'T00:00:00');
    const bmType = getBenchmarkType(bm.meeting_type);
    if (!bmType) continue;

    const isPast = bmDate < today;
    const isFamily = bmType.category === BENCHMARK_CATEGORY.FAMILY_MEETING;

    nodes.push({
      type: 'benchmark',
      state: bm.status === 'completed' || isPast ? 'done' : 'future',
      benchmarkCategory: bmType.category,
      eyebrow: formatLongDate(bm.scheduled_date),
      title: bmType.label,
      titleHe: null,
      detail: bmType.familyBlurb,
      // Extra fields for rendering
      benchmarkKey: bmType.key,
      isFamily,
      startTime: bm.start_time,
      endTime: bm.end_time,
      location: bm.location,
      sortDate: bm.scheduled_date,
    });
  }

  // Sort all nodes that have a sortable date so benchmarks interleave correctly.
  // Nodes without a sortDate keep their natural position via a stable sort.
  // We assign sortDates to existing node types based on their position in time.
  // (begun = first session date, milestone = derived date, today = today, etc.)
  // For simplicity, we only sort the "future" zone (after the TODAY node).
  const todayIndex = nodes.findIndex((n) => n.type === 'today');
  if (todayIndex >= 0) {
    // Split into before-today (already ordered) and after-today (needs sort)
    const beforeToday = nodes.slice(0, todayIndex + 1);
    const afterToday = nodes.slice(todayIndex + 1);

    // Assign sortDates to future nodes that don't have one
    for (const n of afterToday) {
      if (!n.sortDate) {
        if (n.type === 'next-session' && latestSession?.next_session_date) {
          n.sortDate = latestSession.next_session_date;
        }
        // projected nodes don't have a precise date, so leave them at end
      }
    }

    // Stable sort: nodes with sortDate go by date, others keep relative order
    afterToday.sort((a, b) => {
      if (a.sortDate && b.sortDate) return a.sortDate.localeCompare(b.sortDate);
      if (a.sortDate && !b.sortDate) return -1;
      if (!a.sortDate && b.sortDate) return 1;
      return 0;
    });

    nodes.length = 0;
    nodes.push(...beforeToday, ...afterToday);
  }

  // 7. Bimah destination (always shown, always last)
  nodes.push({
    type: 'bimah',
    state: student.mitzvah_date && daysUntil(student.mitzvah_date) <= 0 ? 'done' : 'future',
    eyebrow: null,
    title: `${firstName} is called to the Torah`,
    titleHe: null,
    detail: `The whole menorah is lit. ${firstName} chants ${primaryReading?.portion_name || 'the Torah portion'}${primaryReading?.reading_type === READING_TYPE.HAFTARAH ? '' : ' and the Haftarah'}, and steps fully into the community as a ${mitzvahLabel(student.mitzvah_type).toLowerCase()}.`,
    mitzvahDate: mitzvahDateFormatted,
    hebrewDate: student.hebrew_date || null,
  });

  return nodes;
}

/**
 * Derive past milestone dates from session history.
 * Walks sessions chronologically, checking the running verse_progress snapshots
 * to see when cumulative mastery first crossed each stage threshold.
 *
 * Since we don't have per-session cumulative mastery in the query,
 * we use session dates as approximations: the session closest to when
 * the student crossed a threshold. For now, we distribute past milestones
 * evenly across the session timeline if we can't do exact calculation.
 */
function derivePastMilestones(sessions, totalVerses, currentStage) {
  if (!sessions.length || !totalVerses || totalVerses === 0) return [];

  const currentStageIndex = MILESTONE_STAGES.indexOf(currentStage);
  if (currentStageIndex <= 0) return []; // hanachah or not found

  // We need to place milestones for stages 1 through (currentStageIndex - 1)
  // (the current stage is shown as the "today" node, not as a past milestone)
  const stagesToPlace = [];
  for (let i = 1; i < currentStageIndex; i++) {
    stagesToPlace.push(i);
  }
  if (stagesToPlace.length === 0) return [];

  // Distribute milestone dates across the session timeline
  // Sort sessions chronologically
  const chronSessions = [...sessions].sort((a, b) =>
    a.session_date.localeCompare(b.session_date)
  );

  const results = [];
  for (let i = 0; i < stagesToPlace.length; i++) {
    // Place each milestone at a proportional point through the session history
    const fraction = (i + 1) / (stagesToPlace.length + 1);
    const sessionIndex = Math.min(
      Math.floor(fraction * chronSessions.length),
      chronSessions.length - 1
    );
    results.push({
      stageIndex: stagesToPlace[i],
      date: chronSessions[sessionIndex].session_date,
    });
  }

  return results;
}

/** Generate a warm milestone caption for a past stage. */
function getMilestoneCaption(stage, firstName, pm) {
  switch (stage.key) {
    case 'nitzotz':
      return `${firstName}\u2019s first Torah verses are learned with trope. The menorah is lit, and the journey has truly begun.`;
    case 'hadlakah':
      return `The Torah blessings are learned by heart. The flame takes hold.`;
    case 'or_oleh':
      return `Past the halfway mark of the Torah portion. The trope is steady and the verses are flowing.`;
    case 'or_malei':
      return `Well on the way: most verses learned with trope, and the service is taking shape.`;
    case 'karov':
      return `Nearly ready for the bimah: full run-throughs and final polish.`;
    default:
      return stage.blurb;
  }
}

/**
 * Project when a future stage might be reached, based on current pace.
 * Returns a Date or null if unprojectable.
 */
function projectStageDate(currentPct, targetPct, pace, today, mitzvahDate) {
  if (currentPct >= targetPct) return null;
  if (!pace || !pace.projectedCompletionDate) return null;

  // Linear interpolation: if current rate gets us to 100% by projectedCompletionDate,
  // when do we hit targetPct?
  const projectedCompletion = new Date(pace.projectedCompletionDate);
  const totalDaysToComplete = (projectedCompletion - today) / (1000 * 60 * 60 * 24);
  if (totalDaysToComplete <= 0) return null;

  const pctRemaining = 100 - currentPct;
  if (pctRemaining <= 0) return null;

  const pctToTarget = targetPct - currentPct;
  const daysToTarget = (pctToTarget / pctRemaining) * totalDaysToComplete;

  const projected = new Date(today);
  projected.setDate(projected.getDate() + Math.ceil(daysToTarget));

  // Don't project past mitzvah date
  if (mitzvahDate) {
    const mitzvahD = new Date(mitzvahDate + 'T00:00:00');
    if (projected > mitzvahD) return null;
  }

  return projected;
}


// ---- Page Component ----

export default function RoadToBimah() {
  const { user, role } = useAuth();
  usePageTitle('Road to the Bimah');

  const [searchParams, setSearchParams] = useSearchParams();
  const studentIdParam = searchParams.get('student');

  // Accessible students for the child switcher (parent with 2+ children)
  const [accessibleStudents, setAccessibleStudents] = useState([]);

  const [student, setStudent] = useState(null);
  const [readings, setReadings] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [masteredVerses, setMasteredVerses] = useState(0);
  const [totalVerses, setTotalVerses] = useState(0);
  const [elementsSummary, setElementsSummary] = useState(null);
  const [pace, setPace] = useState(null);
  const [benchmarks, setBenchmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Resolve which student to show
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        let targetStudentId = studentIdParam;

        // For parents, always fetch the full list of linked children
        // so the switcher can be populated regardless of URL param.
        if (role === ROLES.PARENT) {
          const { data: links } = await supabase
            .from('student_guardians')
            .select('student_id')
            .eq('user_id', user.id);

          const studentIds = (links || []).map((l) => l.student_id);

          if (studentIds.length > 0) {
            const { data: studentRows } = await supabase
              .from('students')
              .select('id, first_name, last_name, hebrew_name, student_guardians(name, email, is_primary)')
              .in('id', studentIds)
              .in('status', ['active', 'deferred'])
              .order('last_name');

            const rows = (studentRows || []).map((s) => ({
              ...s,
              guardians: (s.student_guardians || []).map((g) => ({
                first_name: g.name,
                last_name: '',
                is_primary: g.is_primary,
              })),
            }));
            setAccessibleStudents(rows);

            // If no URL param, resolve from localStorage or first child.
            // If URL param is present but not in the parent's children
            // (stale link, hand-edited URL), fall back gracefully.
            if (!targetStudentId || !rows.some((s) => s.id === targetStudentId)) {
              const stored = localStorage.getItem('mymadrich:family_selected_student');
              const validStored = stored && rows.some((s) => s.id === stored);
              targetStudentId = validStored ? stored : rows[0]?.id;
            }
          }
        }

        // If no student param and not a parent, resolve from user's role
        if (!targetStudentId) {
          if (role === ROLES.STUDENT) {
            const { data: stu } = await supabase
              .from('students')
              .select('id')
              .eq('user_id', user.id)
              .limit(1)
              .single();
            targetStudentId = stu?.id;
          }
        }

        if (!targetStudentId) {
          setError('No student found.');
          setLoading(false);
          return;
        }

        // Persist selection for cross-page continuity
        if (role === ROLES.PARENT || role === ROLES.STUDENT) {
          localStorage.setItem('mymadrich:family_selected_student', targetStudentId);
        }

        // Fetch student with tutor and cohort
        const { data: studentData, error: sErr } = await supabase
          .from('students')
          .select('*, tutor:profiles!tutor_id(display_name, email, phone), cohort:cohorts!cohort_id(id, name, start_date, completion_buffer_weeks, default_lessons_per_week)')
          .eq('id', targetStudentId)
          .single();
        if (sErr) throw sErr;

        // Readings
        const { data: readingsData, error: rErr } = await supabase
          .from('readings')
          .select('id, reading_type, portion_name, portion_name_hebrew, aliyah, reference, sort_order')
          .eq('student_id', targetStudentId)
          .order('sort_order');
        if (rErr) throw rErr;

        // All sessions (for milestone date derivation)
        const { data: sessionsData, error: sessErr } = await supabase
          .from('sessions')
          .select('id, session_date, next_session_date, next_session_time, tutor:profiles!tutor_id(display_name)')
          .eq('student_id', targetStudentId)
          .order('session_date', { ascending: false });
        if (sessErr) throw sessErr;

        // Verse statuses
        const { data: verseStatuses, error: vsErr } = await supabase
          .from('verse_current_status')
          .select('quality')
          .eq('student_id', targetStudentId);
        if (vsErr) throw vsErr;

        const total = verseStatuses?.length || 0;
        const mastered = (verseStatuses || []).filter((v) => v.quality === 'perfect').length;

        // Element statuses
        const { data: elementStatuses, error: esErr } = await supabase
          .from('element_current_status')
          .select('quality')
          .eq('student_id', targetStudentId);
        if (esErr) throw esErr;

        const elemAll = elementStatuses || [];
        const elemMastered = elemAll.filter((e) => e.quality === 'perfect').length;
        const elemStarted = elemAll.filter((e) => e.quality).length;
        const elemSummary = calculateElementsSummary(elemMastered, elemStarted, elemAll.length);

        // First session date for pace
        const firstSessionDate = sessionsData?.length > 0
          ? sessionsData[sessionsData.length - 1].session_date
          : null;

        // Pace calculation
        const paceResult = calculatePace({
          student: studentData,
          cohort: studentData.cohort,
          masteredVerseCount: mastered,
          totalVerseCount: total,
          firstSessionDate,
        });

        // Benchmark meetings (RLS filters: non-admin only sees scheduled/completed)
        const { data: benchmarkData, error: bmErr } = await supabase
          .from('benchmark_meetings')
          .select('*')
          .eq('student_id', targetStudentId);
        if (bmErr) throw bmErr;

        setStudent(studentData);
        setReadings(readingsData || []);
        setSessions(sessionsData || []);
        setMasteredVerses(mastered);
        setTotalVerses(total);
        setElementsSummary(elemSummary);
        setPace(paceResult);
        setBenchmarks(benchmarkData || []);
      } catch (err) {
        console.error('RoadToBimah load error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (user) loadData();
  }, [user, role, studentIdParam]);

  // ---- Derived values ----
  const firstName = student?.first_name || '';
  const fullName = student
    ? `${student.first_name || ''} ${student.last_name || ''}`.trim()
    : '';

  const daysToMitzvah = student?.mitzvah_date ? daysUntil(student.mitzvah_date) : null;
  const masteryPct = totalVerses > 0
    ? Math.round((masteredVerses / totalVerses) * 100)
    : 0;
  const currentStage = milestoneForReadiness(masteryPct);

  const primaryReading = readings.find((r) => r.reading_type === READING_TYPE.TORAH)
    || readings[0]
    || null;

  const tutorDisplayName = tutorName(student?.tutor, null);
  const cohortName = student?.cohort?.name || null;
  const mitzvahDateFormatted = student?.mitzvah_date
    ? formatMitzvahDate(student.mitzvah_date)
    : null;

  const latestSession = sessions[0] || null;

  // Build the journey nodes
  const journeyNodes = useMemo(() => {
    if (!student) return [];
    return buildJourneyNodes({
      student,
      firstName,
      sessions,
      masteryPct,
      masteredVerses,
      totalVerses,
      elementsSummary,
      pace,
      currentStage,
      tutorDisplayName,
      mitzvahDateFormatted,
      daysToMitzvah,
      latestSession,
      primaryReading,
      benchmarks,
      dvarTorahStage: student.dvar_torah_stage,
    });
  }, [student, sessions, masteryPct, masteredVerses, totalVerses, elementsSummary, pace, benchmarks]);

  // Calculate the --lit percentage for the gold rail
  // It fills from the top (first node) down to the "today" node
  const litPercent = useMemo(() => {
    if (journeyNodes.length === 0) return 0;
    const nowIndex = journeyNodes.findIndex((n) => n.state === 'now');
    if (nowIndex < 0) return 0;
    // +1 because we want the rail to reach through the "now" node
    const total = journeyNodes.length;
    if (total <= 1) return 100;
    return Math.round(((nowIndex + 0.5) / (total - 0.5)) * 100);
  }, [journeyNodes]);

  // Stage ladder: determine which stages are done / now / future
  const ladderRungs = useMemo(() => {
    // Lit stages are indices 1-6 (skip hanachah at index 0)
    const litStages = MILESTONE_STAGES.slice(1);
    const currentIdx = MILESTONE_STAGES.indexOf(currentStage);

    return litStages.map((stage, i) => {
      const stageIdx = i + 1; // actual index in MILESTONE_STAGES
      let rungState = 'future';
      if (stageIdx < currentIdx) rungState = 'done';
      else if (stageIdx === currentIdx) rungState = 'now';
      return { ...stage, rungState };
    });
  }, [currentStage]);

  // ---- Child switcher (parent with 2+ children) ----
  const showChildSwitcher = role === ROLES.PARENT && accessibleStudents.length > 1;

  function handleChildSwitch(newStudentId) {
    if (newStudentId === studentIdParam || newStudentId === student?.id) return;
    localStorage.setItem('mymadrich:family_selected_student', newStudentId);
    // Sync URL param so the existing loadData effect re-fires and
    // back-button / shared links work correctly.
    setSearchParams({ student: newStudentId }, { replace: true });
  }

  // ---- Loading / error states ----
  if (loading) {
    return (
      <div className="page rb-page">
        <div className="rb-wrap">
          <div className="rb-loading">Loading the journey...</div>
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="page rb-page">
        <div className="rb-wrap">
          <div className="rb-error">
            <p>{error || 'Student not found.'}</p>
            <Link to="/dashboard" className="rb-back-link">Back to Dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  // ---- Empty state (brand-new student, no sessions) ----
  const isNewStudent = sessions.length === 0 && masteryPct === 0;

  return (
    <div className="page rb-page">
      <div className="rb-wrap">
        {/* Back link */}
        <Link to="/dashboard" className="rb-back-link">
          {'\u2190'} Back to Dashboard
        </Link>

        {/* Child switcher for parents with multiple children */}
        {showChildSwitcher && (
          <div className="rb-child-switcher">
            <StudentSwitcher
              students={accessibleStudents}
              selectedStudentId={student?.id || null}
              onSelect={handleChildSwitch}
              placeholder="Switch child"
            />
          </div>
        )}

        {/* ===== COUNTDOWN HERO ===== */}
        <section className="rb-hero">
          <div className="rb-hero-l">
            <span className="rb-eyebrow">
              <span className="rb-star" aria-hidden="true">{'\u2605'}</span>
              {' '}{firstName}{'\u2019'}s road to the bimah
            </span>
            <h1 className="rb-hero-title">The Road to the Bimah</h1>
            {mitzvahDateFormatted && (
              <div className="rb-hero-date">
                <span className="rb-hero-date-d">{mitzvahDateFormatted}</span>
                {primaryReading && (
                  <span className="rb-hero-date-p">
                    Parashat {primaryReading.portion_name}
                    {primaryReading.reference ? ` \u00B7 ${primaryReading.reference}` : ''}
                  </span>
                )}
              </div>
            )}
            {primaryReading?.portion_name_hebrew && (
              <p className="rb-hero-he" dir="rtl" lang="he">
                {student.mitzvah_date && new Date(student.mitzvah_date + 'T00:00:00').getDay() === 6
                  ? '\u05E9\u05B7\u05D1\u05B8\u05BC\u05EA \u05E4\u05B8\u05BC\u05E8\u05B8\u05E9\u05B7\u05EA '
                  : '\u05E4\u05B8\u05BC\u05E8\u05B8\u05E9\u05B7\u05EA '}
                {primaryReading.portion_name_hebrew}
              </p>
            )}
            <div className="rb-hero-meta">
              <span>Chizuk Amuno{cohortName ? ` \u00B7 ${cohortName}` : ''}</span>
              {tutorDisplayName && (
                <>
                  <span className="rb-hero-dot" aria-hidden="true" />
                  <span>Tutor: {tutorDisplayName}</span>
                </>
              )}
            </div>
          </div>
          <div className="rb-hero-r">
            {daysToMitzvah !== null && daysToMitzvah > 0 && (
              <>
                <div className="rb-count">{daysToMitzvah}</div>
                <div className="rb-count-l">day{daysToMitzvah === 1 ? '' : 's'} to the bimah</div>
              </>
            )}
            {daysToMitzvah !== null && daysToMitzvah === 0 && (
              <>
                <div className="rb-count">Today!</div>
                <div className="rb-count-l">the day has arrived</div>
              </>
            )}
            <div className="rb-menorah">
              <MenorahReadiness
                percent={masteryPct}
                size={118}
                emblemSrc={emblemGold}
              />
            </div>
            <div className="rb-stage-now">
              <p className="rb-stage-now-he" dir="rtl" lang="he">
                {currentStage.he}
              </p>
              <div className="rb-stage-now-en">
                {currentStage.en} {'\u00B7'} {masteryPct}% ready
              </div>
            </div>
          </div>
        </section>

        {/* ===== STAGE LADDER ===== */}
        <div className="rb-ladder" role="list" aria-label="Stages of lighting the menorah">
          {ladderRungs.map((rung) => (
            <div
              key={rung.key}
              className={`rb-rung${rung.rungState === 'done' ? ' done' : ''}${rung.rungState === 'now' ? ' now' : ''}`}
              role="listitem"
            >
              <span className="rb-rung-flame" aria-hidden="true">
                {rung.rungState === 'done' ? '\u2713' : rung.rungState === 'now' ? '\u2605' : ''}
              </span>
              <span className="rb-rung-he" dir="rtl" lang="he">{rung.he}</span>
              <span className="rb-rung-en">{rung.en}</span>
              <span className="rb-rung-band">
                {rung.min === rung.max ? `${rung.min}%` : `${rung.min}\u2013${rung.max}%`}
              </span>
            </div>
          ))}
        </div>

        {/* ===== THE JOURNEY SPINE ===== */}
        <section className="rb-journey">
          <div className="rb-journey-h">
            <h2>{firstName}{'\u2019'}s journey</h2>
            <span className="rb-journey-sub">
              {isNewStudent
                ? 'The journey is just beginning.'
                : 'Every milestone on the way, behind and ahead.'}
            </span>
          </div>

          <div className="rb-track" style={{ '--lit': `${litPercent}%` }}>
            {journeyNodes.map((node, i) => {
              if (node.type === 'bimah') {
                const showSimchaKit = student.mitzvah_date
                  && (role === ROLES.PARENT || role === ROLES.STUDENT);
                return (
                  <Fragment key="bimah">
                    {showSimchaKit && <SimchaKitCard />}
                    <BimahNode
                      node={node}
                      firstName={firstName}
                      student={student}
                      primaryReading={primaryReading}
                    />
                  </Fragment>
                );
              }

              // Benchmark meeting node
              if (node.type === 'benchmark') {
                const familyClass = node.isFamily ? ' family' : '';
                return (
                  <div key={`benchmark-${node.benchmarkKey}`} className={`rb-node benchmark ${node.state}${familyClass}`}>
                    <div className="rb-marker"><div className="rb-dot" /></div>
                    <div className="rb-card">
                      <div className="rb-bm-eyebrow">
                        <span className={`bm-cat-badge${node.isFamily ? ' bm-cat-family' : ' bm-cat-clergy'}`}>
                          {node.isFamily ? 'Family meeting' : 'Clergy session'}
                        </span>
                        {node.eyebrow}
                      </div>
                      <h3 className="rb-card-title">{node.title}</h3>
                      {node.detail && (
                        <div className="rb-card-detail">{node.detail}</div>
                      )}
                      {node.startTime && (
                        <div className="rb-card-detail">
                          {formatSessionTime(node.startTime)}
                          {node.endTime ? ` \u2013 ${formatSessionTime(node.endTime)}` : ''}
                          {node.location ? ` \u00B7 ${node.location}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // D'var Torah stage node — distinct from milestones and benchmarks
              if (node.type === 'dvar-torah') {
                const isDone = node.state === 'done';
                return (
                  <div key="dvar-torah" className={`rb-node dvar-torah ${node.state}`}>
                    <div className="rb-marker">
                      <div className="rb-dot rb-dot-dvar">
                        <DvarTimelineIcon />
                      </div>
                    </div>
                    <div className="rb-card">
                      <div className="rb-node-eyebrow">
                        <span className="rb-dvar-tag">
                          {isDone ? '\u2713 ' : ''}D{'\u2019'}var Torah
                        </span>
                        {' '}{node.eyebrow}
                      </div>
                      <h3 className="rb-card-title">{node.title}</h3>
                      {node.detail && (
                        <div className="rb-card-detail">{node.detail}</div>
                      )}
                    </div>
                  </div>
                );
              }

              const isMilestone = node.type === 'milestone' || node.type === 'today';
              const stateClass = node.state;
              const milestoneClass = isMilestone ? ' milestone' : '';

              return (
                <div key={`${node.type}-${i}`} className={`rb-node ${stateClass}${milestoneClass}`}>
                  <div className="rb-marker"><div className="rb-dot" /></div>
                  <div className="rb-card">
                    <div className="rb-node-eyebrow">
                      {node.type === 'milestone' && (
                        <span className="rb-star" aria-hidden="true">{'\u2605'}</span>
                      )}
                      {node.type === 'today' && (
                        <span className="rb-node-tag">You are here</span>
                      )}
                      {' '}{node.eyebrow}
                      {node.type === 'milestone' && ' \u00B7 Milestone'}
                    </div>
                    <h3 className="rb-card-title">
                      {node.title}
                      {node.titleHe && (
                        <span className="rb-card-he" dir="rtl" lang="he">{node.titleHe}</span>
                      )}
                    </h3>
                    {node.detail && (
                      <div className="rb-card-detail">{node.detail}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Pending review note */}
        <div className="rb-note">
          <span>Hebrew stage names and transliterations are pending rabbinic review</span>
        </div>
      </div>
    </div>
  );
}

/** The bimah destination node — deep purple with emblem. */
function BimahNode({ node, firstName, student, primaryReading }) {
  return (
    <div className={`rb-node bimah${node.state === 'done' ? ' done' : ''}`}>
      <div className="rb-marker">
        <div className="rb-bimah-dot">
          <img src={emblemGold} alt="" aria-hidden="true" />
        </div>
      </div>
      <div className="rb-bimah-card">
        <div className="rb-bimah-ey">
          <span className="rb-star" aria-hidden="true">{'\u2605'}</span>
          {' '}The destination {'\u00B7'}{' '}
          <span dir="rtl" lang="he">{'\u05DE\u05D5\u05BC\u05DB\u05B8\u05DF'}</span>
          {' '}Ready
        </div>
        <h3 className="rb-bimah-title">{node.title}</h3>
        {node.mitzvahDate && (
          <div className="rb-bimah-when">{node.mitzvahDate}</div>
        )}
        {node.hebrewDate && (
          <div className="rb-bimah-he" dir="rtl" lang="he">{node.hebrewDate}</div>
        )}
        <p className="rb-bimah-text">{node.detail}</p>
      </div>
    </div>
  );
}

/** D'var Torah timeline icon — book motif, 14x14, 1.5px stroke. */
function DvarTimelineIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="rb-dvar-icon"
    >
      <path d="M3 4.5C3 3.4 3.9 2.5 5 2.5h3c1.1 0 2 .9 2 1.1V17c0-.9-1.3-1.5-2-1.5H5c-1.1 0-2-.9-2-2V4.5z" />
      <path d="M17 4.5c0-1.1-.9-2-2-2h-3c-1.1 0-2 .9-2 1.1V17c0-.9 1.3-1.5 2-1.5h3c1.1 0 2-.9 2-2V4.5z" />
    </svg>
  );
}

/** SimchaKit contextual card — families only, above the bimah node. */
function SimchaKitCard() {
  return (
    <div className="rb-simchakit">
      <div className="rb-simchakit-header">
        <img
          src={simchakitLogo}
          alt="SimchaKit"
          className="rb-simchakit-logo"
          width="32"
          height="32"
        />
        <span className="rb-simchakit-eyebrow">
          <span className="rb-star" aria-hidden="true">{'\u2605'}</span>
          {' '}Planning the celebration?
        </span>
      </div>
      <p className="rb-simchakit-body">
        MyMadrich keeps the learning on track. SimchaKit helps you plan the
        simcha itself{' \u2014 '}invitations, seating, and the day-of details.
      </p>
      <a
        href={SIMCHAKIT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="rb-simchakit-link"
      >
        Explore SimchaKit {'\u2192'}
      </a>
    </div>
  );
}
