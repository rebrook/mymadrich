import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  ROLES,
  STUDENT_STATUS,
  milestoneForReadiness,
  DVAR_STAGE,
  getDvarFamilyLine,
} from '../utils/constants';
import { calculatePace, calculateElementsSummary, formatTargetDate, formatWeeksRemaining, PACE_STATUS, PACE_COLORS, getPaceRationale } from '../utils/paceCalculations';
import { tutorName, tutorListLabel } from '../utils/people';
import { formatDateCompact, formatDateShort, formatDayDate, formatSessionTime, formatSessionTimeRange } from '../utils/datetime';
import { buildNudgeTutorMailto, buildCaseloadNudgeMailto, resolvePrimaryGuardianContact } from '../utils/mailto';
import { masteryCounts, masteryCountsByType, masteryPercent, formatMasterySummary } from '../utils/mastery';
import usePageTitle from '../hooks/usePageTitle';
import { useCohorts } from '../hooks/useCohorts';
import { useStudents, fetchTutors } from '../hooks/useStudents';
import HelpTip from '../components/ui/HelpTip';
import PaceBadge from '../components/ui/PaceBadge';
import AlertsPanel from '../components/ui/AlertsPanel';
import StudentSwitcher from '../components/ui/StudentSwitcher';
import HeroHeader from '../components/ui/HeroHeader';
import CeremonialHero from '../components/ui/CeremonialHero';
import CohortSummaryHero from '../components/ui/CohortSummaryHero';
import StatTile from '../components/ui/StatTile';
import { ElementGroup } from '../components/ui/ElementRow';
import PersonRow from '../components/ui/PersonRow';
import SessionRow from '../components/ui/SessionRow';
import TutorFirstRunStrip from '../components/ui/TutorFirstRunStrip';
import InternalNotesSection from '../components/admin/InternalNotesSection';
import { useInternalNotes } from '../hooks/useInternalNotes';
import { VerseProgress, FillLegend } from '../components/ui/VerseProgress';
import { formatVerseRange } from '../utils/verseFormat';
import { getCurrentCohort, sortCohortsChronologically } from '../utils/cohorts';
import FamilyReadingSummary from '../components/ui/FamilyReadingSummary';
import CelebrationMoment from '../components/ui/CelebrationMoment';
import { DashboardSkeleton } from '../components/ui/SkeletonBlock';
import ShabbatBanner, { useShabbat } from '../components/ui/ShabbatBanner';
import BenchmarkUpcoming from '../components/ui/BenchmarkUpcoming';
import TutorMissingHoursNudge from '../components/ui/TutorMissingHoursNudge';
import MonthlyHoursExport from '../components/ui/MonthlyHoursExport';

// ---- Helpers ----

// Date formatting delegates to shared datetime utilities (src/utils/datetime.js).
// Local aliases preserved to minimize churn in calling code.
function formatDate(dateStr) {
  return formatDateCompact(dateStr);
}

function formatShortDate(dateStr) {
  return formatDateShort(dateStr);
}

function formatCategory(cat) {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

/** Compute days since a date (for "X days ago" display). */
function getDaysAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today - d) / (1000 * 60 * 60 * 24));
}

/** Format a relative "last session" string. */
function formatLastSession(dateStr) {
  const days = getDaysAgo(dateStr);
  if (days === null) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** Pace priority for attention-first sorting (lower = higher priority). */
const PACE_SORT_PRIORITY = {
  critical: 0,
  past_due: 0,
  behind: 1,
  on_track: 2,
  ahead: 2,
  completed: 3,
  not_started: 4,
  no_verses: 4,
};

/** Sort students attention-first: critical > behind > on-track/ahead, then soonest bimah date. */
function sortStudentsAttentionFirst(studentList, pMap) {
  return [...studentList].sort((a, b) => {
    const pa = PACE_SORT_PRIORITY[pMap[a.id]?.pace?.status] ?? 4;
    const pb = PACE_SORT_PRIORITY[pMap[b.id]?.pace?.status] ?? 4;
    if (pa !== pb) return pa - pb;
    const da = a.mitzvah_date || '9999-12-31';
    const db = b.mitzvah_date || '9999-12-31';
    return da.localeCompare(db);
  });
}

/** Compute days until a date from today. */
function getDaysToMitzvah(mitzvahDate) {
  if (!mitzvahDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(mitzvahDate + 'T00:00:00');
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

// ---- Main Dashboard ----

export default function Dashboard() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  usePageTitle('Dashboard');

  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loadingStudents, setLoadingStudents] = useState(true);

  const [dashData, setDashData] = useState(null);
  const [loadingDash, setLoadingDash] = useState(false);
  const [error, setError] = useState(null);

  // Enrichment data for tutor landing page (O-5) and alerts panel
  const [lastSessionMap, setLastSessionMap] = useState({});
  const [progressMap, setProgressMap] = useState({});
  const [paceMap, setPaceMap] = useState({});
  const [homeworkMap, setHomeworkMap] = useState({});

  // Missing hours detection (admin alerts)
  const [missingHoursData, setMissingHoursData] = useState([]);
  const [inactiveTutors, setInactiveTutors] = useState([]);

  // Role checks
  const isAdminOrTutor = role === ROLES.ADMIN || role === ROLES.TUTOR;
  const isStudentOrParent = role === ROLES.STUDENT || role === ROLES.PARENT;

  // Internal notes (admin/tutor only, enforced by RLS). Only fetch for
  // the currently selected student, and only for roles that can see them.
  const {
    notes: internalNotes,
    loading: internalNotesLoading,
    error: internalNotesError,
    addNote: addInternalNote,
    editNote: editInternalNote,
    deleteNote: deleteInternalNote,
  } = useInternalNotes(isAdminOrTutor ? selectedStudentId : null);

  // Shabbat awareness (decorative banner + soft button de-emphasis)
  const isShabbat = useShabbat();

  // Welcome line dismissal (student/parent, localStorage)
  const [welcomeDismissed, setWelcomeDismissed] = useState(
    () => localStorage.getItem('mymadrich:welcome_dismissed') === '1'
  );

  // ---- Admin cohort landing state ----
  const { cohorts: allCohorts } = useCohorts();
  const [adminCohortId, setAdminCohortId] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [adminSortKey, setAdminSortKey] = useState('pace');
  const [adminSortDir, setAdminSortDir] = useState('asc');

  // "By Tutor" lens toggle within admin Students view
  const [adminLens, setAdminLens] = useState('students'); // 'students' | 'tutor'

  // Bulk selection state (admin only)
  const [bulkSelectedIds, setBulkSelectedIds] = useState(new Set());
  const [bulkAction, setBulkAction] = useState(null); // null | 'reassign' | 'advance' | 'complete'
  const [bulkConfirmData, setBulkConfirmData] = useState(null); // { label, ids, updates, priorValues }
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkToast, setBulkToast] = useState(null); // { message, undoFn, timer }

  // Tutor list for reassignment dropdown
  const [allTutors, setAllTutors] = useState([]);
  const [bulkReassignTutorId, setBulkReassignTutorId] = useState('');
  const [bulkAdvanceCohortId, setBulkAdvanceCohortId] = useState('');

  // Fetch tutors when bulk reassign is initiated
  useEffect(() => {
    if (bulkAction === 'reassign' && allTutors.length === 0) {
      fetchTutors().then(setAllTutors).catch(() => {});
    }
  }, [bulkAction, allTutors.length]);

  // useStudents hook for batchUpdate (uses the admin cohort filter)
  const { batchUpdate, refetch: refetchStudents } = useStudents(adminCohortId || undefined);

  // Clear bulk selection when cohort or lens changes
  useEffect(() => {
    setBulkSelectedIds(new Set());
    setBulkAction(null);
    setBulkConfirmData(null);
  }, [adminCohortId, adminLens]);

  // Auto-dismiss undo toast after 6 seconds
  useEffect(() => {
    if (!bulkToast) return;
    const timer = setTimeout(() => setBulkToast(null), 6000);
    return () => clearTimeout(timer);
  }, [bulkToast]);


  // ---- Load students (RLS filters by role) ----
  const loadStudents = useCallback(async () => {
    setLoadingStudents(true);
    try {
      const { data, error: err } = await supabase
        .from('students')
        .select(`
          id, first_name, last_name, hebrew_name, mitzvah_date, mitzvah_type, tutor_id,
          lessons_per_week, target_completion_date, created_at, status,
          tutor:profiles!tutor_id(display_name, email),
          cohort:cohorts!cohort_id(id, name, start_date, completion_buffer_weeks, default_lessons_per_week),
          student_guardians(name, email, is_primary),
          student_tutors(tutor_id, created_at, tutor:profiles!tutor_id(id, display_name, email))
        `)
        .in('status', ['active', 'deferred'])
        .order('last_name');
      if (err) throw err;

      setStudents(data || []);

      // Auto-select for students and parents: restore last-viewed child
      // from localStorage, or fall back to first child alphabetically.
      // The list is already sorted by last_name from the query.
      if (data && data.length >= 1 && isStudentOrParent) {
        const stored = localStorage.getItem('mymadrich:family_selected_student');
        const validStored = stored && data.some((s) => s.id === stored);
        setSelectedStudentId(validStored ? stored : data[0].id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingStudents(false);
    }
  }, [user, role, isStudentOrParent]);

  useEffect(() => {
    if (user) loadStudents();
  }, [user, loadStudents]);

  // ---- Persist family child selection to localStorage ----
  useEffect(() => {
    if (!isStudentOrParent || !selectedStudentId) return;
    localStorage.setItem('mymadrich:family_selected_student', selectedStudentId);
  }, [selectedStudentId, isStudentOrParent]);

  // ---- Admin: default to current cohort (active + date-aware) ----
  useEffect(() => {
    if (role !== ROLES.ADMIN || adminCohortId || allCohorts.length === 0) return;
    const current = getCurrentCohort(allCohorts);
    if (current) setAdminCohortId(current.id);
  }, [role, adminCohortId, allCohorts]);

  // ---- Load enrichment data for admin/tutor ----
  useEffect(() => {
    if (!isAdminOrTutor || students.length === 0) return;

    const studentIds = students.map((s) => s.id);

    async function fetchEnrichment() {
      try {
        const { data: sessionData, error: sessErr } = await supabase
          .from('sessions')
          .select('student_id, session_date')
          .in('student_id', studentIds)
          .order('session_date', { ascending: false });
        if (sessErr) throw sessErr;

        const sessMap = {};
        const firstSessMap = {};
        (sessionData || []).forEach((row) => {
          if (!sessMap[row.student_id]) sessMap[row.student_id] = row.session_date;
          firstSessMap[row.student_id] = row.session_date;
        });
        setLastSessionMap(sessMap);

        const { data: verseData, error: verseErr } = await supabase
          .from('verse_current_status')
          .select('student_id, quality')
          .in('student_id', studentIds);
        if (verseErr) throw verseErr;

        // Group verse rows by student, then run masteryCounts once per student.
        // Shape: { total, mastered, inProgress, notStarted }
        const versesByStudent = {};
        (verseData || []).forEach((row) => {
          if (!versesByStudent[row.student_id]) versesByStudent[row.student_id] = [];
          versesByStudent[row.student_id].push(row);
        });
        const progMap = {};
        Object.entries(versesByStudent).forEach(([sid, rows]) => {
          progMap[sid] = masteryCounts(rows);
        });
        setProgressMap(progMap);

        const { data: elemData, error: elemErr } = await supabase
          .from('element_current_status')
          .select('student_id, quality')
          .in('student_id', studentIds);
        if (elemErr) throw elemErr;

        // Group element rows by student, then run masteryCounts
        const elemsByStudent = {};
        (elemData || []).forEach((row) => {
          if (!elemsByStudent[row.student_id]) elemsByStudent[row.student_id] = [];
          elemsByStudent[row.student_id].push(row);
        });
        const elemMap = {};
        Object.entries(elemsByStudent).forEach(([sid, rows]) => {
          const ec = masteryCounts(rows);
          // calculateElementsSummary expects (mastered, started, total) where started = mastered + inProgress
          elemMap[sid] = { total: ec.total, mastered: ec.mastered, started: ec.mastered + ec.inProgress };
        });

        const pMap = {};
        students.forEach((s) => {
          const prog = progMap[s.id];
          const firstSession = firstSessMap[s.id] || null;
          const elem = elemMap[s.id] || { total: 0, mastered: 0, started: 0 };

          pMap[s.id] = {
            pace: calculatePace({
              student: s,
              cohort: s.cohort,
              masteredVerseCount: prog?.mastered || 0,
              totalVerseCount: prog?.total || 0,
              firstSessionDate: firstSession,
            }),
            elements: calculateElementsSummary(elem.mastered, elem.started, elem.total),
          };
        });
        setPaceMap(pMap);

        // Homework completion counts (per-student aggregate, single query)
        // Join: sessions -> homework_items, grouped by student_id
        const { data: hwData, error: hwErr } = await supabase
          .from('sessions')
          .select(`
            student_id,
            homework_items(id, completed_at)
          `)
          .in('student_id', studentIds)
          .order('session_date', { ascending: false });
        if (hwErr) throw hwErr;

        // For each student, take only the most recent session's homework
        const hwMap = {};
        (hwData || []).forEach((row) => {
          if (hwMap[row.student_id]) return; // already have most recent
          const items = row.homework_items || [];
          if (items.length === 0) return;
          hwMap[row.student_id] = {
            total: items.length,
            done: items.filter((i) => i.completed_at != null).length,
          };
        });
        setHomeworkMap(hwMap);

        // Admin-only: detect missing hours and inactive tutors
        if (role === ROLES.ADMIN) {
          const cutoff30 = new Date();
          cutoff30.setDate(cutoff30.getDate() - 30);
          const cutoffStr = cutoff30.toISOString().split('T')[0];

          // Sessions in the past 30 days with NULL minutes_worked
          const { data: missingRows, error: mhErr } = await supabase
            .from('sessions')
            .select('student_id, tutor_id')
            .gte('session_date', cutoffStr)
            .is('minutes_worked', null);
          if (!mhErr && missingRows && missingRows.length > 0) {
            // Group by student, count per student
            const byStudent = {};
            missingRows.forEach((r) => {
              if (!byStudent[r.student_id]) byStudent[r.student_id] = 0;
              byStudent[r.student_id] += 1;
            });
            const mhData = Object.entries(byStudent)
              .map(([sid, count]) => {
                const student = students.find((s) => s.id === sid);
                return student ? { student, missingCount: count } : null;
              })
              .filter(Boolean);
            setMissingHoursData(mhData);
          } else {
            setMissingHoursData([]);
          }

          // Inactive tutors: tutors with active students but no session in 14+ days
          const cutoff14 = new Date();
          cutoff14.setDate(cutoff14.getDate() - 14);
          const cutoff14Str = cutoff14.toISOString().split('T')[0];

          // Build tutor -> student count + last session date (M:N via student_tutors)
          const tutorMap = {};
          students.forEach((s) => {
            if (s.status !== 'active') return;
            const assignments = s.student_tutors || [];
            assignments.forEach((st) => {
              const tid = st.tutor_id;
              if (!tid) return;
              if (!tutorMap[tid]) {
                tutorMap[tid] = { tutor: st.tutor, studentCount: 0, lastSessionDate: null };
              }
              tutorMap[tid].studentCount += 1;
              // Use the last session from lastSessionMap for any student of this tutor
              const lastSess = sessMap[s.id];
              if (lastSess && (!tutorMap[tid].lastSessionDate || lastSess > tutorMap[tid].lastSessionDate)) {
                tutorMap[tid].lastSessionDate = lastSess;
              }
            });
          });

          const inactive = Object.values(tutorMap).filter((t) => {
            if (t.studentCount === 0) return false;
            if (!t.lastSessionDate) return true; // never logged
            return t.lastSessionDate < cutoff14Str;
          });
          setInactiveTutors(inactive);
        }
      } catch (err) {
        console.error('Failed to load enrichment data:', err.message);
      }
    }

    fetchEnrichment();
  }, [students, role, isAdminOrTutor]);

  // ---- Load dashboard data for selected student ----
  useEffect(() => {
    if (!selectedStudentId) {
      setDashData(null);
      return;
    }

    async function loadData() {
      setLoadingDash(true);
      setError(null);
      try {
        // Verse current statuses
        const { data: verseStatuses, error: vsErr } = await supabase
          .from('verse_current_status')
          .select('*')
          .eq('student_id', selectedStudentId);
        if (vsErr) throw vsErr;

        // Element current statuses
        const { data: elementStatuses, error: esErr } = await supabase
          .from('element_current_status')
          .select('*')
          .eq('student_id', selectedStudentId);
        if (esErr) throw esErr;

        // Readings (includes portion_name_hebrew for ceremonial hero + reading cards)
        const { data: readings, error: rErr } = await supabase
          .from('readings')
          .select('id, reading_type, portion_name, portion_name_hebrew, aliyah, reference, sefaria_url, sort_order')
          .eq('student_id', selectedStudentId)
          .order('sort_order');
        if (rErr) throw rErr;

        // Student record with tutor and cohort
        const { data: student, error: sErr } = await supabase
          .from('students')
          .select('*, tutor:profiles!tutor_id(display_name, email, phone), cohort:cohorts!cohort_id(id, start_date, completion_buffer_weeks, default_lessons_per_week), student_tutors(tutor_id, created_at, tutor:profiles!tutor_id(id, display_name, email, phone))')
          .eq('id', selectedStudentId)
          .single();
        if (sErr) throw sErr;

        // Guardians
        const { data: guardians, error: gErr } = await supabase
          .from('student_guardians')
          .select('*')
          .eq('student_id', selectedStudentId)
          .order('sort_order');
        if (gErr) throw gErr;

        // Recent sessions (last 5) with tutor name and counts
        const { data: sessions, error: sessErr } = await supabase
          .from('sessions')
          .select(`
            id, session_date, homework_notes, homework_minutes_per_day,
            next_session_date, next_session_time, next_session_end_time, created_at, updated_at,
            tutor:profiles!tutor_id(display_name),
            session_verse_progress(id),
            session_element_progress(id)
          `)
          .eq('student_id', selectedStudentId)
          .order('session_date', { ascending: false })
          .limit(5);
        if (sessErr) throw sessErr;

        // Homework from most recent session
        let homework = [];
        if (sessions && sessions.length > 0) {
          const { data: hw, error: hwErr } = await supabase
            .from('homework_items')
            .select('*')
            .eq('session_id', sessions[0].id);
          if (hwErr) throw hwErr;
          homework = hw || [];
        }

        // Group verse statuses by reading
        const readingMap = {};
        (readings || []).forEach((r) => {
          readingMap[r.id] = { ...r, verses: [] };
        });
        (verseStatuses || []).forEach((vs) => {
          if (readingMap[vs.reading_id]) {
            readingMap[vs.reading_id].verses.push(vs);
          }
        });
        Object.values(readingMap).forEach((r) => {
          r.verses.sort((a, b) => a.sort_order - b.sort_order);
        });
        const readingGroups = Object.values(readingMap).sort((a, b) => a.sort_order - b.sort_order);

        // Group element statuses by category
        const elementGroups = {};
        (elementStatuses || []).forEach((es) => {
          if (!elementGroups[es.category]) elementGroups[es.category] = [];
          elementGroups[es.category].push(es);
        });
        Object.values(elementGroups).forEach((arr) =>
          arr.sort((a, b) => a.sort_order - b.sort_order)
        );

        // Compute overall stats via mastery module (single source of truth)
        const verseCounts = masteryCounts(verseStatuses || []);
        const verseCountsByType = masteryCountsByType(readingGroups);

        // First session date for pace
        const { data: firstSessData } = await supabase
          .from('sessions')
          .select('session_date')
          .eq('student_id', selectedStudentId)
          .order('session_date', { ascending: true })
          .limit(1);
        const firstSessionDate = firstSessData?.[0]?.session_date || null;

        // Compute pace
        const paceResult = calculatePace({
          student,
          cohort: student.cohort,
          masteredVerseCount: verseCounts.mastered,
          totalVerseCount: verseCounts.total,
          firstSessionDate,
        });

        // Compute element summary via mastery module
        const elemCounts = masteryCounts(elementStatuses || []);
        const elementsSummary = calculateElementsSummary(elemCounts.mastered, elemCounts.mastered + elemCounts.inProgress, elemCounts.total);

        // Benchmark meetings (RLS filters: non-admin sees only scheduled/completed)
        const { data: benchmarkData, error: bmErr } = await supabase
          .from('benchmark_meetings')
          .select('*')
          .eq('student_id', selectedStudentId);
        if (bmErr) throw bmErr;

        setDashData({
          student,
          readings: readings || [],
          readingGroups,
          elementGroups,
          guardians: guardians || [],
          sessions: sessions || [],
          homework,
          totalVerses: verseCounts.total,
          masteredVerses: verseCounts.mastered,
          verseCounts,
          verseCountsByType,
          pace: paceResult,
          elementsSummary,
          benchmarks: benchmarkData || [],
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingDash(false);
      }
    }

    loadData();
  }, [selectedStudentId]);

  // ---- Derived values ----
  const showSelector = role === ROLES.ADMIN || role === ROLES.TUTOR || students.length > 1;
  const daysToMitzvah = dashData?.student?.mitzvah_date
    ? getDaysToMitzvah(dashData.student.mitzvah_date)
    : null;

  // Most recent session for homework / next session
  const latestSession = dashData?.sessions?.[0] || null;

  // Mastery percentage (for stat tile) — single rounding rule from mastery.js
  const masteryPct = dashData
    ? masteryPercent(dashData.masteredVerses, dashData.totalVerses)
    : 0;

  // Cohort name from students list (available without extra query)
  const cohortName = students.find((s) => s.id === selectedStudentId)?.cohort?.name || null;

  // Prepare students for the switcher (transform guardians)
  const switcherStudents = students.map((s) => ({
    ...s,
    guardians: (s.student_guardians || []).map((g) => ({
      first_name: g.name,
      last_name: '',
      is_primary: g.is_primary,
    })),
  }));

  // ---- Admin cohort landing: filtered data & aggregates ----

  const adminFilteredStudents = useMemo(() => {
    if (role !== ROLES.ADMIN) return [];
    let list = students;
    // Filter by selected cohort
    if (adminCohortId) {
      list = list.filter((s) => s.cohort?.id === adminCohortId);
    }
    // Search filter
    if (adminSearch.trim()) {
      const q = adminSearch.toLowerCase();
      list = list.filter((s) => {
        const full = `${s.first_name} ${s.last_name}`.toLowerCase();
        const reversed = `${s.last_name}, ${s.first_name}`.toLowerCase();
        return full.includes(q) || reversed.includes(q);
      });
    }
    return list;
  }, [role, students, adminCohortId, adminSearch]);

  // Sort admin filtered students
  const adminSortedStudents = useMemo(() => {
    if (adminFilteredStudents.length === 0) return [];
    return [...adminFilteredStudents].sort((a, b) => {
      let cmp = 0;
      switch (adminSortKey) {
        case 'name': {
          const na = `${a.last_name} ${a.first_name}`.toLowerCase();
          const nb = `${b.last_name} ${b.first_name}`.toLowerCase();
          cmp = na.localeCompare(nb);
          break;
        }
        case 'mitzvah_date': {
          const da = a.mitzvah_date || null;
          const db = b.mitzvah_date || null;
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          cmp = da.localeCompare(db);
          break;
        }
        case 'tutor': {
          // M:N: sort by first (oldest) assigned tutor name, with fallback to legacy tutor
          const getTutorSort = (s) => {
            const entries = (s.student_tutors || []).filter((st) => st.tutor);
            if (entries.length > 0) {
              const sorted = [...entries].sort((x, y) => (x.created_at || '').localeCompare(y.created_at || ''));
              return tutorName(sorted[0].tutor, '').toLowerCase();
            }
            return s.tutor ? tutorName(s.tutor, '').toLowerCase() : '';
          };
          const ta = getTutorSort(a);
          const tb = getTutorSort(b);
          cmp = ta.localeCompare(tb);
          break;
        }
        case 'last_session': {
          const sa = lastSessionMap[a.id] || null;
          const sb = lastSessionMap[b.id] || null;
          if (!sa && !sb) return 0;
          if (!sa) return adminSortDir === 'asc' ? -1 : 1;
          if (!sb) return adminSortDir === 'asc' ? 1 : -1;
          cmp = sa.localeCompare(sb);
          break;
        }
        case 'progress': {
          const pa = progressMap[a.id];
          const pb = progressMap[b.id];
          if (!pa && !pb) return 0;
          if (!pa) return 1;
          if (!pb) return -1;
          const pctA = pa.total > 0 ? pa.mastered / pa.total : 0;
          const pctB = pb.total > 0 ? pb.mastered / pb.total : 0;
          cmp = pctA - pctB;
          break;
        }
        case 'pace': {
          const SEVERITY = { critical: 0, past_due: 0, behind: 1, not_started: 2, no_verses: 2, on_track: 3, ahead: 4, completed: 5 };
          const ra = SEVERITY[paceMap[a.id]?.pace?.status] ?? 99;
          const rb = SEVERITY[paceMap[b.id]?.pace?.status] ?? 99;
          cmp = ra - rb;
          break;
        }
        case 'status': {
          const ORDER = { active: 0, deferred: 1, completed: 2, withdrawn: 3 };
          cmp = (ORDER[a.status] ?? 99) - (ORDER[b.status] ?? 99);
          break;
        }
        default: break;
      }
      return adminSortDir === 'asc' ? cmp : -cmp;
    });
  }, [adminFilteredStudents, adminSortKey, adminSortDir, lastSessionMap, progressMap, paceMap]);

  // Cohort-scoped students for hero aggregates (pre-search, cohort only)
  const adminCohortStudents = useMemo(() => {
    if (role !== ROLES.ADMIN || !adminCohortId) return students;
    return students.filter((s) => s.cohort?.id === adminCohortId);
  }, [role, students, adminCohortId]);

  // Aggregate hero values
  const adminHeroData = useMemo(() => {
    const list = adminCohortStudents;
    if (list.length === 0) return { readinessPct: 0, avgDays: null, paceCounts: {} };

    let totalVerse = 0;
    let masteredVerse = 0;
    const counts = { on_track: 0, behind: 0, critical: 0, completed: 0, not_started: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let daysSum = 0;
    let daysCount = 0;

    list.forEach((s) => {
      const prog = progressMap[s.id];
      if (prog) {
        totalVerse += prog.total;
        masteredVerse += prog.mastered;
      }
      const paceStatus = paceMap[s.id]?.pace?.status;
      if (paceStatus === 'on_track' || paceStatus === 'ahead') counts.on_track += 1;
      else if (paceStatus === 'behind') counts.behind += 1;
      else if (paceStatus === 'critical' || paceStatus === 'past_due') counts.critical += 1;
      else if (paceStatus === 'completed') counts.completed += 1;
      else counts.not_started += 1;

      if (s.mitzvah_date) {
        const mDate = new Date(s.mitzvah_date + 'T00:00:00');
        const diff = Math.ceil((mDate - today) / (1000 * 60 * 60 * 24));
        if (diff > 0) {
          daysSum += diff;
          daysCount += 1;
        }
      }
    });

    const pct = masteryPercent(masteredVerse, totalVerse);
    const avg = daysCount > 0 ? Math.round(daysSum / daysCount) : null;

    return { readinessPct: pct, avgDays: avg, paceCounts: counts };
  }, [adminCohortStudents, progressMap, paceMap]);

  // Admin sort column handler (first click uses useful default direction)
  const ADMIN_FIRST_CLICK = { name: 'asc', mitzvah_date: 'asc', tutor: 'asc', last_session: 'asc', progress: 'asc', pace: 'asc', status: 'asc' };
  function handleAdminSort(key) {
    if (key === adminSortKey) {
      setAdminSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setAdminSortKey(key);
      setAdminSortDir(ADMIN_FIRST_CLICK[key] || 'asc');
    }
  }

  function adminSortArrow(key) {
    const active = key === adminSortKey;
    return (
      <span className={`sort-arrow ${active ? 'sort-arrow-active' : ''}`} aria-hidden="true">
        {active ? (adminSortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u25B2'}
      </span>
    );
  }

  function adminAriaSortValue(key) {
    if (key !== adminSortKey) return 'none';
    return adminSortDir === 'asc' ? 'ascending' : 'descending';
  }

  function isStaleSession(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    return Math.floor((now - d) / (1000 * 60 * 60 * 24)) > 14;
  }

  function getStatusBadgeClass(status) {
    return { active: 'badge-active', completed: 'badge-completed', deferred: 'badge-deferred', withdrawn: 'badge-withdrawn' }[status] || '';
  }

  function getInitials(firstName, lastName) {
    return `${(firstName || '').charAt(0)}${(lastName || '').charAt(0)}`.toUpperCase();
  }

  // ---- Tutor Caseload Lens (admin "By Tutor" view) ----

  const tutorCaseloadData = useMemo(() => {
    if (role !== ROLES.ADMIN || adminLens !== 'tutor') return [];
    const tutorMap = {};

    adminFilteredStudents.forEach((s) => {
      const assignments = s.student_tutors || [];

      // If no tutors assigned, group under '__unassigned'
      const tutorEntries = assignments.length > 0
        ? assignments
        : [{ tutor_id: '__unassigned', tutor: null }];

      tutorEntries.forEach((st) => {
        const tid = st.tutor_id || '__unassigned';
        if (!tutorMap[tid]) {
          tutorMap[tid] = {
            tutorId: tid,
            tutorProfile: st.tutor || null,
            tutorDisplayName: tid === '__unassigned' ? 'Unassigned' : tutorName(st.tutor, 'Unknown tutor'),
            tutorEmail: st.tutor?.email || '',
            students: [],
            lastLoggedDate: null,
            sessionDates: [],
            paceBuckets: { critical: 0, behind: 0, on_track: 0, ahead: 0, other: 0 },
          };
        }

        const group = tutorMap[tid];
        // Avoid adding the same student twice to the same tutor group
        if (!group.students.some((existing) => existing.id === s.id)) {
          group.students.push(s);
        }

        // Track last logged date across all their students
        const lastDate = lastSessionMap[s.id];
        if (lastDate) {
          group.sessionDates.push(lastDate);
          if (!group.lastLoggedDate || lastDate > group.lastLoggedDate) {
            group.lastLoggedDate = lastDate;
          }
        }

        // Pace buckets
        const pStatus = paceMap[s.id]?.pace?.status;
        if (pStatus === 'critical' || pStatus === 'past_due') group.paceBuckets.critical += 1;
        else if (pStatus === 'behind') group.paceBuckets.behind += 1;
        else if (pStatus === 'on_track') group.paceBuckets.on_track += 1;
        else if (pStatus === 'ahead') group.paceBuckets.ahead += 1;
        else group.paceBuckets.other += 1;
      }); // end tutorEntries.forEach
    }); // end adminFilteredStudents.forEach

    // Compute average cadence per tutor
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    Object.values(tutorMap).forEach((group) => {
      if (group.sessionDates.length < 2) {
        group.avgCadenceDays = null;
      } else {
        const sorted = [...group.sessionDates].sort();
        let totalGap = 0;
        for (let i = 1; i < sorted.length; i++) {
          const a = new Date(sorted[i - 1] + 'T00:00:00');
          const b = new Date(sorted[i] + 'T00:00:00');
          totalGap += (b - a) / (1000 * 60 * 60 * 24);
        }
        group.avgCadenceDays = Math.round(totalGap / (sorted.length - 1));
      }
    });

    // Sort attention-first: most critical/behind students first
    return Object.values(tutorMap).sort((a, b) => {
      const scoreA = a.paceBuckets.critical * 3 + a.paceBuckets.behind * 1;
      const scoreB = b.paceBuckets.critical * 3 + b.paceBuckets.behind * 1;
      if (scoreA !== scoreB) return scoreB - scoreA; // higher score = more attention needed
      return a.tutorDisplayName.localeCompare(b.tutorDisplayName);
    });
  }, [role, adminLens, adminFilteredStudents, lastSessionMap, paceMap]);

  // Expanded tutor rows in the lens
  const [expandedTutorIds, setExpandedTutorIds] = useState({});
  function toggleTutorExpand(tutorId) {
    setExpandedTutorIds((prev) => ({ ...prev, [tutorId]: !prev[tutorId] }));
  }

  // ---- Bulk Operations (admin only) ----

  function toggleBulkSelect(studentId) {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function toggleBulkSelectAll() {
    if (bulkSelectedIds.size === adminSortedStudents.length) {
      setBulkSelectedIds(new Set());
    } else {
      setBulkSelectedIds(new Set(adminSortedStudents.map((s) => s.id)));
    }
  }

  function cancelBulkAction() {
    setBulkAction(null);
    setBulkConfirmData(null);
    setBulkReassignTutorId('');
    setBulkAdvanceCohortId('');
  }

  function prepareBulkConfirm() {
    const ids = Array.from(bulkSelectedIds);
    const affected = students.filter((s) => bulkSelectedIds.has(s.id));

    if (bulkAction === 'reassign' && bulkReassignTutorId) {
      const tutorObj = allTutors.find((t) => t.id === bulkReassignTutorId);
      const tutorLabel = tutorObj ? tutorName(tutorObj) : 'selected tutor';
      // Snapshot each student's full student_tutors array for undo
      const priorTutorSets = {};
      affected.forEach((s) => {
        priorTutorSets[s.id] = (s.student_tutors || []).map((st) => st.tutor_id);
      });
      setBulkConfirmData({
        label: `Reassign ${ids.length} student${ids.length === 1 ? '' : 's'} to ${tutorLabel}?`,
        ids,
        type: 'reassign',
        newTutorId: bulkReassignTutorId,
        priorTutorSets,
      });
    } else if (bulkAction === 'advance' && bulkAdvanceCohortId) {
      const cohortObj = allCohorts.find((c) => c.id === bulkAdvanceCohortId);
      const cohortLabel = cohortObj?.name || 'selected cohort';
      const priorValues = {};
      affected.forEach((s) => { priorValues[s.id] = s.cohort?.id || null; });
      setBulkConfirmData({
        label: `Move ${ids.length} student${ids.length === 1 ? '' : 's'} to ${cohortLabel}?`,
        ids,
        type: 'advance',
        updates: { cohort_id: bulkAdvanceCohortId },
        priorField: 'cohort_id',
        priorValues,
      });
    } else if (bulkAction === 'complete') {
      const priorValues = {};
      affected.forEach((s) => { priorValues[s.id] = s.status; });
      setBulkConfirmData({
        label: `Mark ${ids.length} student${ids.length === 1 ? '' : 's'} as completed?`,
        ids,
        type: 'complete',
        updates: { status: STUDENT_STATUS.COMPLETED },
        priorField: 'status',
        priorValues,
      });
    }
  }

  async function executeBulkAction() {
    if (!bulkConfirmData) return;
    setBulkProcessing(true);
    try {
      if (bulkConfirmData.type === 'reassign') {
        // M:N reassign: for each student, atomically delete all student_tutors
        // rows and insert one row for the new tutor via RPC. The RPC wraps
        // both operations in a single transaction so a student can never be
        // left with zero tutors if the insert fails after the delete.
        const { ids, newTutorId } = bulkConfirmData;
        const succeeded = [];
        const failed = [];

        for (const studentId of ids) {
          try {
            const { error: rpcErr } = await supabase.rpc('reassign_student_tutors', {
              p_student_id: studentId,
              p_new_tutor_id: newTutorId,
            });
            if (rpcErr) throw rpcErr;
            succeeded.push(studentId);
          } catch (err) {
            const student = students.find((s) => s.id === studentId);
            const name = student ? `${student.first_name} ${student.last_name}` : studentId;
            failed.push({ studentId, name, message: err.message });
          }
        }

        if (failed.length > 0 && succeeded.length === 0) {
          // Complete failure
          throw new Error(`All ${failed.length} reassignments failed. First error: ${failed[0].message}`);
        }

        if (failed.length > 0) {
          // Partial failure: report which students were not changed
          const failedNames = failed.map((f) => f.name).join(', ');
          setError(`Reassigned ${succeeded.length} of ${ids.length} students. Failed: ${failedNames}. These students were not changed.`);
        }

        // The mirror trigger keeps students.tutor_id in sync automatically.
      } else {
        // Advance cohort / mark completed: unchanged, uses batchUpdate on students table
        await batchUpdate(bulkConfirmData.ids, bulkConfirmData.updates);
      }

      // Re-load the Dashboard's student list
      await loadStudents();

      const undoData = { ...bulkConfirmData };
      // For reassign, track which students actually changed (partial failure safety)
      const reassignSucceeded = bulkConfirmData.type === 'reassign' ? succeeded : null;
      const undoCount = reassignSucceeded ? reassignSucceeded.length : undoData.ids.length;

      setBulkToast({
        message: `Done. ${undoCount} student${undoCount === 1 ? '' : 's'} updated.`,
        undoFn: async () => {
          if (undoData.type === 'reassign') {
            // Restore only the students that were actually reassigned
            const idsToUndo = reassignSucceeded || undoData.ids;
            for (const studentId of idsToUndo) {
              // Delete current assignments
              const { error: delErr } = await supabase
                .from('student_tutors')
                .delete()
                .eq('student_id', studentId);
              if (delErr) throw delErr;

              // Re-insert prior tutor set
              const priorIds = undoData.priorTutorSets[studentId] || [];
              if (priorIds.length > 0) {
                const rows = priorIds.map((tid) => ({
                  student_id: studentId,
                  tutor_id: tid,
                }));
                const { error: insErr } = await supabase
                  .from('student_tutors')
                  .insert(rows);
                if (insErr) throw insErr;
              }
            }
          } else {
            // Advance / complete: group by prior value for efficient undo
            const groups = {};
            Object.entries(undoData.priorValues).forEach(([id, val]) => {
              const key = val || '__null';
              if (!groups[key]) groups[key] = { ids: [], value: val };
              groups[key].ids.push(id);
            });
            for (const group of Object.values(groups)) {
              await batchUpdate(group.ids, { [undoData.priorField]: group.value });
            }
          }
          await loadStudents();
          setBulkToast(null);
        },
      });

      setBulkSelectedIds(new Set());
      cancelBulkAction();
    } catch (err) {
      setError(`Bulk update failed: ${err.message}`);
    } finally {
      setBulkProcessing(false);
    }
  }

  // ---- Milestone banners (v2 Section 10, student/parent only) ----
  const [dismissedMilestones, setDismissedMilestones] = useState({});

  // Celebration replay overlay (student/parent tap on milestone banner)
  const [celebrationReplay, setCelebrationReplay] = useState(null);

  // Load dismissed state from localStorage when student changes
  useEffect(() => {
    if (!selectedStudentId || !isStudentOrParent) return;
    const dismissed = {};
    const firstVerseKey = `mymadrich:milestone:first_verse:${selectedStudentId}`;
    if (localStorage.getItem(firstVerseKey)) dismissed[firstVerseKey] = true;
    // Check reading completions
    if (dashData?.readingGroups) {
      dashData.readingGroups.forEach((rg) => {
        const key = `mymadrich:milestone:reading:${selectedStudentId}:${rg.id}`;
        if (localStorage.getItem(key)) dismissed[key] = true;
      });
    }
    setDismissedMilestones(dismissed);
  }, [selectedStudentId, dashData?.readingGroups, isStudentOrParent]);

  function dismissMilestone(key) {
    localStorage.setItem(key, '1');
    setDismissedMilestones((prev) => ({ ...prev, [key]: true }));
  }

  // Compute milestone state
  const milestones = [];
  if (dashData && isStudentOrParent) {
    const sid = selectedStudentId;
    const firstName = dashData.student?.first_name || '';

    // First verse learned with trope
    const firstVerseKey = `mymadrich:milestone:first_verse:${sid}`;
    if (dashData.masteredVerses >= 1 && !dismissedMilestones[firstVerseKey]) {
      const text = role === ROLES.STUDENT
        ? <><strong>Mazel tov, {firstName}!</strong> You{'\u2019'}ve learned your first verse with trope.</>
        : <><strong>Mazel tov!</strong> {firstName}{'\u2019'}s first verse is learned with trope.</>;
      milestones.push({
        key: firstVerseKey,
        text,
        celebrationTitle: `Mazel tov, ${firstName}!`,
        celebrationSubtitle: role === ROLES.STUDENT
          ? 'You\u2019ve learned your first verse with trope. The journey has begun.'
          : `${firstName}\u2019s first verse is learned with trope. The journey has begun.`,
      });
    }

    // Readings at 100%
    (dashData.readingGroups || []).forEach((rg) => {
      if (rg.verses.length === 0) return;
      const rgCounts = masteryCounts(rg.verses);
      if (rgCounts.mastered < rgCounts.total) return;
      const readingKey = `mymadrich:milestone:reading:${sid}:${rg.id}`;
      if (dismissedMilestones[readingKey]) return;
      const readingName = rg.portion_name || rg.portionName || 'Reading';
      milestones.push({
        key: readingKey,
        text: <><strong>Mazel tov!</strong> {readingName} is complete {'\u2014'} every verse learned with trope.</>,
        celebrationTitle: `Mazel tov, ${firstName}!`,
        celebrationSubtitle: `${readingName} is complete \u2014 every verse learned with trope.`,
      });
    });
  }

  // Full completion: all verses learned with trope + all elements learned
  const isFullCompletion = dashData && isStudentOrParent
    && dashData.totalVerses > 0
    && dashData.masteredVerses === dashData.totalVerses
    && dashData.elementsSummary
    && dashData.elementsSummary.totalCount > 0
    && dashData.elementsSummary.masteredCount === dashData.elementsSummary.totalCount;

  // ---- Render helper: milestone banners ----
  function renderMilestoneBanners() {
    if (milestones.length === 0) return null;
    return (
      <div className="milestone-banners">
        {milestones.map((m) => (
          <div key={m.key} className="milestone-banner">
            <button
              className="milestone-banner-replay"
              type="button"
              onClick={() => setCelebrationReplay({
                title: m.celebrationTitle,
                subtitle: m.celebrationSubtitle,
              })}
              title="Replay milestone celebration"
              aria-label={`Replay celebration: ${m.celebrationTitle}`}
            >
              <span className="milestone-banner-star" aria-hidden="true">&#x2605;</span>
              <span className="milestone-banner-text">{m.text}</span>
            </button>
            <button
              className="milestone-banner-dismiss"
              onClick={() => dismissMilestone(m.key)}
              aria-label="Dismiss milestone"
              type="button"
            >
              &#x2715;
            </button>
          </div>
        ))}
      </div>
    );
  }

  // ---- Render helper: stat tiles by role ----
  function renderStatTiles() {
    if (!dashData) return null;

    const tiles = [];

    if (isAdminOrTutor) {
      // ---- Admin/Tutor tiles (unchanged) ----

      // Verses learned with trope tile
      tiles.push(
        <StatTile
          key="mastery"
          label="Verses Learned with Trope"
          value={dashData.totalVerses > 0 ? `${masteryPct}%` : '\u2014'}
          meta={dashData.verseCounts
            ? formatMasterySummary(dashData.verseCounts)
            : 'No verses assigned'}
          thread={dashData.totalVerses > 0
            ? { percent: dashData.masteredVerses / dashData.totalVerses, color: 'var(--color-primary)' }
            : null}
        />
      );

      // Pace tile
      const pace = dashData.pace;
      let paceMeta = '';
      let paceMetaColor = undefined;
      if (pace) {
        if (pace.status === PACE_STATUS.BEHIND || pace.status === PACE_STATUS.CRITICAL) {
          const projStr = pace.projectedCompletionDate ? formatTargetDate(pace.projectedCompletionDate) : '';
          paceMeta = projStr ? `Projected: ${projStr}` : '';
          if (pace.weeksRemaining !== undefined) {
            const remaining = `${formatWeeksRemaining(pace.weeksRemaining)} left`;
            paceMeta += paceMeta ? ` \u00B7 ${remaining}` : remaining;
          }
          paceMetaColor = PACE_COLORS[pace.status];
        } else if (pace.status === PACE_STATUS.ON_TRACK || pace.status === PACE_STATUS.AHEAD) {
          paceMeta = `Target: ${formatTargetDate(pace.targetDate)}`;
          if (pace.weeksRemaining !== undefined) {
            paceMeta += ` \u00B7 ${formatWeeksRemaining(pace.weeksRemaining)} left`;
          }
        } else if (pace.status === PACE_STATUS.COMPLETED) {
          paceMeta = `All ${pace.totalCount} verses learned with trope`;
        } else if (pace.status === PACE_STATUS.NOT_STARTED) {
          paceMeta = 'No sessions yet';
          if (pace.weeksRemaining !== undefined) {
            paceMeta += ` \u00B7 ${formatWeeksRemaining(pace.weeksRemaining)} left`;
          }
        } else if (pace.status === PACE_STATUS.NO_VERSES) {
          paceMeta = 'No verses assigned';
        } else if (pace.status === PACE_STATUS.PAST_DUE) {
          paceMeta = 'Target date has passed';
          paceMetaColor = PACE_COLORS[pace.status];
        }
      }

      tiles.push(
        <StatTile
          key="pace"
          label={<>Learning Pace <HelpTip text="Pace is calculated by comparing verses learned with trope against a linear progression toward the target completion date. Visible to admins and tutors only." /></>}
          value={pace ? <PaceBadge status={pace.status} size="lg" rationale={getPaceRationale(pace)} /> : '\u2014'}
          meta={paceMeta}
          metaColor={paceMetaColor}
        />
      );

      // Elements tile
      tiles.push(
        <StatTile
          key="elements"
          label="Service Elements"
          value={dashData.elementsSummary
            ? `${dashData.elementsSummary.masteredCount}/${dashData.elementsSummary.totalCount}`
            : '\u2014'}
          meta={dashData.elementsSummary?.label || ''}
        />
      );

      // Last session tile
      tiles.push(
        <StatTile
          key="last-session"
          label="Last Session"
          value={latestSession ? formatShortDate(latestSession.session_date) : '\u2014'}
          meta={latestSession ? '' : 'No sessions yet'}
        />
      );
    } else {
      // ---- Student/Parent tiles (elevated: 3 tiles) ----

      // 1. Overall readiness with gold thread
      const elemSummary = dashData.elementsSummary;
      const readinessStage = milestoneForReadiness(masteryPct);
      tiles.push(
        <StatTile
          key="readiness"
          label="Overall readiness"
          value={dashData.totalVerses > 0 ? `${masteryPct}%` : '\u2014'}
          meta={dashData.verseCounts && dashData.verseCounts.total > 0
            ? `${formatMasterySummary(dashData.verseCounts)} \u2014 ${readinessStage.blurb.replace(/\.$/, '').toLowerCase()}.`
            : 'No verses assigned'}
          thread={dashData.totalVerses > 0
            ? { percent: dashData.masteredVerses / dashData.totalVerses, color: 'var(--color-gold)' }
            : null}
          className="stat-tile-gold"
        />
      );

      // 2. Service elements with purple thread
      const elemTotal = elemSummary?.totalCount || 0;
      const elemMastered = elemSummary?.masteredCount || 0;
      const elemToGo = elemTotal - elemMastered;
      const elemMeta = elemTotal > 0
        ? (elemToGo > 0
          ? `${elemToGo} to go`
          : 'All elements learned')
        : 'No elements assigned';
      tiles.push(
        <StatTile
          key="elements"
          label="Service elements"
          value={elemTotal > 0 ? `${elemMastered} / ${elemTotal}` : '\u2014'}
          meta={elemMeta}
          thread={elemTotal > 0
            ? { percent: elemMastered / elemTotal, color: 'var(--color-primary)' }
            : null}
        />
      );

      // 3. Next session with day-of-week date + time + tutor
      const nextDate = latestSession?.next_session_date;
      const nextTime = latestSession?.next_session_time;
      const nextTutor = tutorName(dashData.student?.tutor, null);
      let nextMeta = '';
      if (nextDate) {
        const parts = [];
        if (nextTime) parts.push(formatSessionTime(nextTime));
        if (nextTutor) parts.push(`with ${nextTutor}`);
        nextMeta = parts.join(' ');
      } else {
        nextMeta = 'Not scheduled';
      }
      tiles.push(
        <StatTile
          key="next-session"
          label="Next session"
          value={nextDate ? formatDayDate(nextDate) : '\u2014'}
          meta={nextMeta}
          className="stat-tile-next-session"
        />
      );
    }

    return <div className={`stat-tiles${isStudentOrParent ? ' stat-tiles-elevated' : ''}`}>{tiles}</div>;
  }

  // ---- Render helper: d'var Torah family line ----
  function renderDvarTorahLine() {
    if (!dashData || !isStudentOrParent) return null;

    const stage = dashData.student?.dvar_torah_stage;
    if (!stage || stage === DVAR_STAGE.NOT_STARTED) return null;

    const firstName = dashData.student?.first_name || '';
    const line = getDvarFamilyLine(stage, firstName);
    if (!line) return null;

    const isDelivered = stage === DVAR_STAGE.DELIVERED;

    return (
      <div className={`dvar-family-line${isDelivered ? ' dvar-family-line-delivered' : ''}`}>
        <DvarFamilyIcon delivered={isDelivered} />
        <span className="dvar-family-line-text">{line}</span>
      </div>
    );
  }

  // ---- Render helper: internal notes (admin/tutor only) ----
  function renderInternalNotes() {
    if (!isAdminOrTutor || !selectedStudentId) return null;
    return (
      <InternalNotesSection
        notes={internalNotes}
        loading={internalNotesLoading}
        error={internalNotesError}
        onAddNote={addInternalNote}
        onEditNote={editInternalNote}
        onDeleteNote={deleteInternalNote}
      />
    );
  }

  // ---- Render helper: inline legend ----
  // ---- Render helper: reading progress card ----
  function renderReadingProgress() {
    if (!dashData) return null;
    const hasReadings = dashData.readingGroups.length > 0;

    // Family view: plain-language breakdown, no per-verse grid
    if (isStudentOrParent) {
      return (
        <div className="card">
          <div className="dash-card-header">
            <div>
              <h3>Reading Progress</h3>
            </div>
          </div>
          {!hasReadings ? (
            <div className="empty-state">
              <p>{dashData.student?.first_name}{'\u2019'}s readings will appear here once the tutor assigns a Torah and Haftarah portion.</p>
            </div>
          ) : (
            <FamilyReadingSummary
              studentName={dashData.student?.first_name || ''}
              readingGroups={dashData.readingGroups}
            />
          )}
        </div>
      );
    }

    // Admin/tutor view: fill-cell grid per reading
    return (
      <div className="card">
        <div className="dash-card-header">
          <div>
            <h3>Reading Progress</h3>
            {hasReadings && (
              <p className="card-sub">Tap a verse to see when it was last worked.</p>
            )}
          </div>
        </div>

        {!hasReadings ? (
          <div className="empty-state">
            <p>No readings assigned yet.</p>
            {role === ROLES.ADMIN && (
              <Link to={`/admin/students/${selectedStudentId}`} className="btn btn-primary btn-small empty-state-action">Assign readings</Link>
            )}
          </div>
        ) : (
          <>
            <div className="dash-readings">
              {dashData.readingGroups.map((rg) => {
                const rgCounts = masteryCounts(rg.verses);

                // Map verse data to VerseProgress shape
                const verseData = rg.verses.map((vs) => ({
                  id: vs.verse_id,
                  ref: vs.verse_reference,
                  quality: vs.quality,
                  status: vs.status,
                  readingType: vs.reading_type,
                  lastSessionDate: vs.last_session_date,
                }));

                return (
                  <div key={rg.id} className="dash-reading-block">
                    <div className="dash-reading-header">
                      <div className="dash-reading-title">
                        <span className="reading-eyebrow">
                          {rg.reading_type === 'torah' ? 'TORAH' : 'HAFTARAH'}
                        </span>
                        {rg.portion_name_hebrew && (
                          <span className="dash-reading-he" dir="rtl" lang="he">{rg.portion_name_hebrew}</span>
                        )}
                        <strong>{rg.portion_name}</strong>
                        {rg.aliyah && <span className="form-hint">({rg.aliyah})</span>}
                        <span className="progress-summary">{formatMasterySummary(rgCounts)}</span>
                      </div>
                      {rg.sefaria_url && (
                        <a href={rg.sefaria_url} target="_blank" rel="noopener noreferrer" className="dash-reading-link">
                          Sefaria
                        </a>
                      )}
                    </div>

                    <p className="dash-reading-range">{formatVerseRange(rg.verses)}</p>

                    <VerseProgress
                      verses={verseData}
                      mode="display"
                      role={role}
                    />
                  </div>
                );
              })}
            </div>
            <div className="dash-legend-separator">
              <FillLegend role={role} />
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- Render helper: service elements card ----
  function renderServiceElements() {
    if (!dashData) return null;
    const groupKeys = Object.keys(dashData.elementGroups);

    return (
      <div className="card">
        <h3>Service Elements</h3>

        {groupKeys.length === 0 ? (
          <div className="empty-state">
            <p>
              {isAdminOrTutor
                ? 'No service elements assigned yet.'
                : `Service elements will appear here once ${dashData.student?.first_name || 'the student'}\u2019s tutor adds blessings, prayers, and readings to track.`}
            </p>
            {role === ROLES.ADMIN && (
              <Link to={`/admin/students/${selectedStudentId}`} className="btn btn-primary btn-small empty-state-action">Set up elements</Link>
            )}
          </div>
        ) : (
          <div className="dash-elements">
            {groupKeys.map((cat) => (
              <ElementGroup
                key={cat}
                category={cat}
                label={formatCategory(cat)}
                items={dashData.elementGroups[cat]}
                role={role}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- Render helper: homework accent card (v2 6.10 + Session 12 checkable) ----

  /** Toggle a homework item's completion via RPC. Optimistic update. */
  async function handleHomeworkToggle(itemId, currentlyCompleted) {
    const newCompleted = !currentlyCompleted;
    const previousHomework = [...dashData.homework];

    // Optimistic update
    setDashData((prev) => ({
      ...prev,
      homework: prev.homework.map((hw) =>
        hw.id === itemId
          ? { ...hw, completed_at: newCompleted ? new Date().toISOString() : null, completed: newCompleted }
          : hw
      ),
    }));

    try {
      const { error: rpcErr } = await supabase.rpc('toggle_homework_completion', {
        item_id: itemId,
        is_completed: newCompleted,
      });
      if (rpcErr) throw rpcErr;
    } catch (err) {
      console.error('Failed to toggle homework:', err.message);
      // Revert on failure
      setDashData((prev) => ({ ...prev, homework: previousHomework }));
    }
  }

  // Track which item just got checked for the micro-flourish
  const [hwFlourishId, setHwFlourishId] = useState(null);

  function handleHomeworkCheck(itemId, currentlyCompleted) {
    if (!currentlyCompleted) {
      // Trigger flourish on check (not uncheck)
      setHwFlourishId(itemId);
      setTimeout(() => setHwFlourishId(null), 500);
    }
    handleHomeworkToggle(itemId, currentlyCompleted);
  }

  function renderHomeworkCard() {
    if (!dashData) return null;

    const hasHomework = dashData.homework.length > 0 || latestSession?.homework_notes;
    const firstName = dashData.student?.first_name || 'the student';

    // Completion counts
    const hwItems = dashData.homework || [];
    const hwDone = hwItems.filter((hw) => hw.completed_at != null).length;
    const hwTotal = hwItems.length;
    const allComplete = hwTotal > 0 && hwDone === hwTotal;

    // No sessions yet: encouraging empty state
    if (dashData.sessions.length === 0) {
      return (
        <div className="card homework-card">
          <div className="homework-card-header">
            <BookIcon />
            <h3>This week{'\u2019'}s homework</h3>
          </div>
          <div className="empty-state">
            <p>
              {isAdminOrTutor
                ? 'No sessions logged yet.'
                : `No homework yet \u2014 your tutor will add practice after the next session.`}
            </p>
            {isAdminOrTutor && (
              <button
                className="btn btn-primary btn-small empty-state-action"
                onClick={() => navigate(`/sessions/new?student=${selectedStudentId}`)}
                type="button"
              >
                Log a session
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="card homework-card">
        <div className="homework-card-header">
          <BookIcon />
          <h3>This week{'\u2019'}s homework</h3>
        </div>

        {!hasHomework ? (
          <p className="form-hint" style={{ marginTop: 'var(--space-2)' }}>No homework assigned from the last session.</p>
        ) : (
          <>
            {latestSession?.session_date && (
              <p className="homework-card-meta">
                Assigned {formatShortDate(latestSession.session_date)}
                {latestSession.homework_minutes_per_day && (
                  <> {'\u00B7'} {latestSession.homework_minutes_per_day} min/day</>
                )}
              </p>
            )}

            {/* Tutor/admin: summary count line */}
            {isAdminOrTutor && hwTotal > 0 && (
              <p className={`homework-card-summary${allComplete ? ' homework-card-summary--complete' : ''}`}>
                Homework: {hwDone} of {hwTotal} practiced
              </p>
            )}

            {hwTotal > 0 && (
              <div className="homework-card-items">
                {hwItems.map((hw) => {
                  const isChecked = hw.completed_at != null;
                  const showFlourish = hwFlourishId === hw.id;

                  // Student/parent: interactive checkbox button
                  if (isStudentOrParent) {
                    return (
                      <button
                        key={hw.id}
                        type="button"
                        role="checkbox"
                        aria-checked={isChecked}
                        className="homework-card-item-btn"
                        onClick={() => handleHomeworkCheck(hw.id, isChecked)}
                      >
                        <span className="hw-check-indicator" aria-hidden="true">
                          {isChecked ? '\u2713' : ''}
                        </span>
                        <span className="hw-check-label">
                          {hw.description}
                        </span>
                        {/* Micro-flourish element */}
                        <span
                          className={`hw-check-flourish${showFlourish ? ' hw-check-flourish--active' : ''}`}
                          aria-hidden="true"
                        >
                          <span className="hw-check-ring" />
                        </span>
                      </button>
                    );
                  }

                  // Tutor/admin: static display with checked state visible
                  return (
                    <div key={hw.id} className="homework-card-item">
                      <span className="homework-card-item-check" aria-hidden="true">
                        {isChecked ? '\u2611' : '\u2610'}
                      </span>
                      <span style={isChecked ? { textDecoration: 'line-through', opacity: 0.55 } : undefined}>
                        {hw.description}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Practice complete line (student/parent only, all items checked) */}
            {isStudentOrParent && allComplete && (
              <div className="homework-complete-line">
                <span className="homework-complete-star" aria-hidden="true">{'\u2605'}</span>
                <span>Practice complete this week {'\u2014'} nice work, {firstName}</span>
              </div>
            )}

            {latestSession?.homework_notes && (
              <p className="homework-card-notes">{latestSession.homework_notes}</p>
            )}
          </>
        )}
      </div>
    );
  }


  // ---- Render helper: guardians card ----
  function renderGuardiansCard() {
    if (!dashData) return null;
    return (
      <div className="card">
        <h3>Guardians</h3>
        {dashData.guardians.length === 0 ? (
          <div className="empty-state">
            <p>
              {isAdminOrTutor
                ? 'No guardians on file.'
                : 'No guardian information on file yet.'}
            </p>
            {role === ROLES.ADMIN && (
              <Link to={`/admin/students/${selectedStudentId}`} className="btn btn-primary btn-small empty-state-action">Add guardians</Link>
            )}
          </div>
        ) : (
          <div className="dash-person-list">
            {dashData.guardians.map((g) => (
              <PersonRow
                key={g.id}
                name={g.name}
                relationship={g.relationship}
                email={g.email}
                phone={g.phone}
                isPrimary={g.is_primary}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- Render helper: tutor contact card (student/parent) ----
  function renderTutorContactCard() {
    // M:N: show all assigned tutors from student_tutors, fall back to legacy tutor
    const studentTutors = dashData?.student?.student_tutors || [];
    const tutorProfiles = studentTutors
      .filter((st) => st.tutor)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
      .map((st) => st.tutor);

    // Dual-read fallback: if student_tutors is empty, use legacy tutor
    if (tutorProfiles.length === 0 && dashData?.student?.tutor) {
      tutorProfiles.push(dashData.student.tutor);
    }

    if (tutorProfiles.length === 0) return null;

    return (
      <div className="card">
        <h3>{tutorProfiles.length === 1 ? 'Your Tutor' : 'Your Tutors'}</h3>
        <div className="dash-person-list">
          {tutorProfiles.map((tutor, idx) => (
            <PersonRow
              key={tutor.id || idx}
              name={tutorName(tutor)}
              relationship="Tutor"
              email={tutor.email}
              phone={tutor.phone}
              avatarColor="var(--color-primary-light)"
            />
          ))}
        </div>
      </div>
    );
  }

  // ---- Render helper: next session rail card (student/parent) ----
  function renderNextSessionCard() {
    if (!dashData) return null;
    const nextDate = latestSession?.next_session_date;
    const nextTime = latestSession?.next_session_time;
    const nextEndTime = latestSession?.next_session_end_time;
    const nextTutorName = tutorName(dashData.student?.tutor, null);

    return (
      <div className="card">
        <h3>Next Session</h3>
        {nextDate ? (
          <div className="next-session-detail">
            <span className="next-session-date">{formatDate(nextDate)}</span>
            {nextTime && (
              <span className="next-session-time">
                at {nextEndTime ? formatSessionTimeRange(nextTime, nextEndTime) : formatSessionTime(nextTime)}
              </span>
            )}
            {nextTutorName && <span className="next-session-tutor">with {nextTutorName}</span>}
          </div>
        ) : (
          <p className="form-hint">Not yet scheduled.</p>
        )}
      </div>
    );
  }

  // ---- Render helper: sessions rail card ----
  function renderSessionsCard() {
    if (!dashData) return null;
    return (
      <div className="card">
        <div className="dash-card-header">
          <h3>Recent Sessions</h3>
          <Link to={`/sessions?student=${selectedStudentId}`} className="btn btn-outline btn-small">View all</Link>
        </div>

        {dashData.sessions.length === 0 ? (
          <div className="empty-state">
            <p>
              {isAdminOrTutor
                ? 'No sessions logged yet.'
                : 'Sessions will appear here as the journey unfolds.'}
            </p>
            {isAdminOrTutor && (
              <button
                className="btn btn-primary btn-small empty-state-action"
                onClick={() => navigate(`/sessions/new?student=${selectedStudentId}`)}
                type="button"
              >
                Log a session
              </button>
            )}
          </div>
        ) : (
          <div className="dash-session-list">
            {dashData.sessions.map((sess) => (
              <SessionRow key={sess.id} session={sess} studentId={selectedStudentId} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- Render helper: upcoming benchmark meetings strip ----
  function renderBenchmarkUpcoming(tutorOnly = false) {
    if (!dashData?.benchmarks || dashData.benchmarks.length === 0) return null;
    return (
      <BenchmarkUpcoming
        benchmarks={dashData.benchmarks}
        firstName={dashData.student?.first_name}
        tutorOnly={tutorOnly}
      />
    );
  }

  // ---- Render helper: log session shortcut (tutor) ----
  function renderLogSessionShortcut() {
    if (!dashData) return null;
    return (
      <button
        className="btn btn-primary dash-log-shortcut"
        onClick={() => navigate(`/sessions/new?student=${selectedStudentId}`)}
        type="button"
      >
        Log session for {dashData.student.first_name}
      </button>
    );
  }

  // ---- Render: two-column layout with role-based ordering ----
  function renderDashboardContent() {
    if (!dashData || loadingDash) return null;

    if (role === ROLES.ADMIN) {
      // Admin mobile: Reading > Elements > Sessions > Guardians > Homework
      return (
        <div className="dash-grid">
          <div className="dash-main">
            {renderReadingProgress()}
            {renderServiceElements()}
            {renderInternalNotes()}
          </div>
          <div className="dash-rail">
            {renderSessionsCard()}
            {renderBenchmarkUpcoming()}
            {renderGuardiansCard()}
            {renderHomeworkCard()}
          </div>
        </div>
      );
    }

    if (role === ROLES.TUTOR) {
      // Tutor mobile: Log shortcut > Reading > Elements > Guardians > Homework > Sessions
      return (
        <>
          <div className="dash-mobile-priority">{renderLogSessionShortcut()}</div>
          <div className="dash-grid">
            <div className="dash-main">
              {renderReadingProgress()}
              {renderServiceElements()}
              {renderInternalNotes()}
            </div>
            <div className="dash-rail">
              {renderBenchmarkUpcoming(true)}
              {renderGuardiansCard()}
              <div className="dash-desktop-priority">{renderLogSessionShortcut()}</div>
              {renderHomeworkCard()}
              {renderSessionsCard()}
            </div>
          </div>
        </>
      );
    }

    // Student/Parent mobile: Homework > Reading > Elements > Next Session > Tutor Contact > Sessions
    return (
      <>
        <div className="dash-mobile-priority">{renderHomeworkCard()}</div>
        <div className="dash-grid">
          <div className="dash-main">
            {renderReadingProgress()}
            {renderServiceElements()}
          </div>
          <div className="dash-rail">
            <div className="dash-desktop-priority">{renderHomeworkCard()}</div>
            {renderBenchmarkUpcoming()}
            {renderNextSessionCard()}
            {renderTutorContactCard()}
            {renderSessionsCard()}
          </div>
        </div>
      </>
    );
  }

  // ---- Render helper: admin cohort landing (elevated direction) ----
  function renderAdminLanding() {
    const selectedCohort = allCohorts.find((c) => c.id === adminCohortId);
    const cohortDisplayName = selectedCohort?.name || 'All Students';

    const hasBulkSelection = bulkSelectedIds.size > 0;
    const allSelected = adminSortedStudents.length > 0 && bulkSelectedIds.size === adminSortedStudents.length;

    return (
      <div className="admin-landing">
        {/* Cohort summary hero */}
        <CohortSummaryHero
          cohortName={cohortDisplayName}
          studentCount={adminCohortStudents.length}
          avgDaysToMitzvah={adminHeroData.avgDays}
          readinessPct={adminHeroData.readinessPct}
          paceCounts={adminHeroData.paceCounts}
        />

        {/* Alerts panel scoped to selected cohort */}
        {adminCohortStudents.length > 0 && (
          <AlertsPanel
            students={adminCohortStudents}
            paceMap={paceMap}
            lastSessionMap={lastSessionMap}
            progressMap={progressMap}
            onSelectStudent={(id) => setSelectedStudentId(id)}
            missingHoursData={missingHoursData}
            inactiveTutors={inactiveTutors}
          />
        )}

        {/* Toolbar: cohort selector, lens toggle, search, actions */}
        <div className="admin-landing-toolbar">
          <div className="admin-landing-cohort-row">
            <select
              className="input cohort-select"
              value={adminCohortId}
              onChange={(e) => { setAdminCohortId(e.target.value); setAdminSearch(''); }}
              aria-label="Filter by cohort"
            >
              {sortCohortsChronologically(allCohorts).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.is_active ? '' : ' (archived)'}
                </option>
              ))}
            </select>
            <Link to="/admin" className="btn btn-outline btn-small">Manage</Link>
          </div>

          <div className="admin-landing-controls-row">
            {/* Lens toggle: Students | By Tutor */}
            <div className="admin-lens-toggle" role="radiogroup" aria-label="View grouping">
              <button
                className={`admin-lens-btn ${adminLens === 'students' ? 'admin-lens-btn-active' : ''}`}
                type="button"
                role="radio"
                aria-checked={adminLens === 'students'}
                onClick={() => setAdminLens('students')}
              >
                Students
              </button>
              <button
                className={`admin-lens-btn ${adminLens === 'tutor' ? 'admin-lens-btn-active' : ''}`}
                type="button"
                role="radio"
                aria-checked={adminLens === 'tutor'}
                onClick={() => setAdminLens('tutor')}
              >
                By Tutor
              </button>
            </div>

            {adminLens === 'students' && adminCohortStudents.length > 5 && (
              <input
                className="input admin-landing-search"
                placeholder="Search by name&#x2026;"
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
              />
            )}
          </div>
        </div>

        {/* ---- Tutor Caseload Lens ---- */}
        {adminLens === 'tutor' && (
          <div className="tutor-caseload">
            {tutorCaseloadData.length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <p>No tutors with assigned students in this cohort.</p>
                </div>
              </div>
            ) : (
              tutorCaseloadData.map((group) => {
                const isExpanded = expandedTutorIds[group.tutorId];
                const isStale = group.lastLoggedDate && isStaleSession(group.lastLoggedDate);
                const nudgeMailto = group.tutorEmail
                  ? buildCaseloadNudgeMailto({
                      tutorEmail: group.tutorEmail,
                      tutorDisplayName: group.tutorDisplayName,
                      studentCount: group.students.length,
                      lastSessionDate: group.lastLoggedDate,
                    })
                  : '';

                return (
                  <div key={group.tutorId} className="tutor-caseload-row card">
                    <div
                      className="tutor-caseload-header"
                      onClick={() => toggleTutorExpand(group.tutorId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTutorExpand(group.tutorId); }}}
                      aria-expanded={!!isExpanded}
                    >
                      <div className="tutor-caseload-info">
                        <span className="tutor-caseload-avatar" aria-hidden="true">
                          {getInitials(group.tutorDisplayName.split(' ')[0], group.tutorDisplayName.split(' ')[1] || '')}
                        </span>
                        <div>
                          <div className="tutor-caseload-name">{group.tutorDisplayName}</div>
                          <div className="tutor-caseload-meta">
                            {group.students.length} student{group.students.length === 1 ? '' : 's'}
                            {group.lastLoggedDate && (
                              <>{' \u00B7 '}Last logged: <span className={isStale ? 'session-stale' : ''}>
                                {formatDateShort(group.lastLoggedDate)}
                              </span></>
                            )}
                            {group.avgCadenceDays != null && (
                              <>{' \u00B7 '}{group.avgCadenceDays}d avg cadence</>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="tutor-caseload-right">
                        {/* Pace bucket pills */}
                        <div className="tutor-caseload-buckets">
                          {group.paceBuckets.critical > 0 && (
                            <span className="tutor-bucket tutor-bucket-critical">{group.paceBuckets.critical} critical</span>
                          )}
                          {group.paceBuckets.behind > 0 && (
                            <span className="tutor-bucket tutor-bucket-behind">{group.paceBuckets.behind} behind</span>
                          )}
                          {group.paceBuckets.on_track > 0 && (
                            <span className="tutor-bucket tutor-bucket-ok">{group.paceBuckets.on_track + group.paceBuckets.ahead} on track</span>
                          )}
                        </div>

                        <div className="tutor-caseload-actions">
                          {nudgeMailto && (
                            <a
                              href={nudgeMailto}
                              className="btn btn-outline btn-small"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Email tutor
                            </a>
                          )}
                          <span className="tutor-caseload-expand" aria-hidden="true">
                            {isExpanded ? '\u25BC' : '\u25B6'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="tutor-caseload-students">
                        {sortStudentsAttentionFirst(group.students, paceMap).map((s) => {
                          const lastDate = lastSessionMap[s.id];
                          const prog = progressMap[s.id];
                          const pct = prog ? masteryPercent(prog.mastered, prog.total) : 0;
                          const paceStatus = paceMap[s.id]?.pace?.status;
                          const stale = isStaleSession(lastDate);

                          return (
                            <div
                              key={s.id}
                              className="tutor-caseload-student"
                              onClick={() => setSelectedStudentId(s.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedStudentId(s.id); } }}
                            >
                              <span className="student-avatar student-avatar-sm" aria-hidden="true">
                                {getInitials(s.first_name, s.last_name)}
                              </span>
                              <div className="tutor-caseload-student-info">
                                <span className="tutor-caseload-student-name">{s.first_name} {s.last_name}</span>
                                <span className="tutor-caseload-student-meta">
                                  {s.mitzvah_date ? formatDateShort(s.mitzvah_date) : 'No date'}
                                  {lastDate && <>{' \u00B7 '}<span className={stale ? 'session-stale' : ''}>{formatLastSession(lastDate)}</span></>}
                                </span>
                              </div>
                              <div className="tutor-caseload-student-right">
                                <span className="tutor-caseload-student-pct">{pct}%</span>
                                {paceStatus && <PaceBadge status={paceStatus} />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ---- Students Lens (default) ---- */}
        {adminLens === 'students' && (
          <>
            {adminSortedStudents.length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <p>
                    {adminSearch
                      ? 'No students match your search.'
                      : 'No students in this cohort yet.'}
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Readiness table (desktop) */}
                <div className="readiness-table-wrap desktop-only">
                  <table className="readiness-table">
                    <thead>
                      <tr>
                        <th className="th-checkbox">
                          <input
                            type="checkbox"
                            className="bulk-checkbox"
                            checked={allSelected}
                            onChange={toggleBulkSelectAll}
                            aria-label="Select all students"
                          />
                        </th>
                        <th className="th-sortable" aria-sort={adminAriaSortValue('name')}>
                          <button type="button" className="th-sort-inner" onClick={() => handleAdminSort('name')}>Name{adminSortArrow('name')}</button>
                        </th>
                        <th className="th-sortable" aria-sort={adminAriaSortValue('mitzvah_date')}>
                          <button type="button" className="th-sort-inner" onClick={() => handleAdminSort('mitzvah_date')}>B{'\u2019'}nai Mitzvah{adminSortArrow('mitzvah_date')}</button>
                        </th>
                        <th className="th-sortable" aria-sort={adminAriaSortValue('tutor')}>
                          <button type="button" className="th-sort-inner" onClick={() => handleAdminSort('tutor')}>Tutor{adminSortArrow('tutor')}</button>
                        </th>
                        <th className="th-sortable" aria-sort={adminAriaSortValue('last_session')}>
                          <button type="button" className="th-sort-inner" onClick={() => handleAdminSort('last_session')}>Last Session{adminSortArrow('last_session')}</button>
                        </th>
                        <th className="th-sortable" aria-sort={adminAriaSortValue('progress')}>
                          <button type="button" className="th-sort-inner" onClick={() => handleAdminSort('progress')}>Progress{adminSortArrow('progress')}</button>
                        </th>
                        <th className="th-sortable" aria-sort={adminAriaSortValue('pace')}>
                          <button type="button" className="th-sort-inner" onClick={() => handleAdminSort('pace')}>Pace{adminSortArrow('pace')}</button>
                        </th>
                        <th className="th-sortable" aria-sort={adminAriaSortValue('status')}>
                          <button type="button" className="th-sort-inner" onClick={() => handleAdminSort('status')}>Status{adminSortArrow('status')}</button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminSortedStudents.map((s) => {
                        const lastDate = lastSessionMap[s.id];
                        const prog = progressMap[s.id];
                        const pct = prog ? masteryPercent(prog.mastered, prog.total) : 0;
                        const paceStatus = paceMap[s.id]?.pace?.status;
                        const stale = isStaleSession(lastDate);
                        const isChecked = bulkSelectedIds.has(s.id);

                        return (
                          <tr
                            key={s.id}
                            className={isChecked ? 'bulk-row-selected' : ''}
                            onClick={(e) => {
                              if (window.getSelection().toString()) return;
                              const tag = e.target.tagName;
                              if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT') return;
                              if (e.target.closest('a') || e.target.closest('button') || e.target.closest('input')) return;
                              setSelectedStudentId(s.id);
                            }}
                          >
                            <td className="td-checkbox" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="bulk-checkbox"
                                checked={isChecked}
                                onChange={() => toggleBulkSelect(s.id)}
                                aria-label={`Select ${s.first_name} ${s.last_name}`}
                              />
                            </td>
                            <td>
                              <div className="readiness-name-cell">
                                <span className="student-avatar" aria-hidden="true">
                                  {getInitials(s.first_name, s.last_name)}
                                </span>
                                <Link to={`/admin/students/${s.id}`}>
                                  {s.last_name}, {s.first_name}
                                </Link>
                              </div>
                            </td>
                            <td>{formatDate(s.mitzvah_date)}</td>
                            <td>{tutorListLabel(s.student_tutors, s.tutor, '\u2014')}</td>
                            <td>
                              {lastDate ? (
                                <span className={stale ? 'session-stale' : ''}>
                                  {formatDate(lastDate)}
                                </span>
                              ) : (
                                <span className="form-hint">No sessions</span>
                              )}
                            </td>
                            <td>
                              {prog && prog.total > 0 ? (() => {
                                const paceResult = paceMap[s.id]?.pace;
                                const targetPct = paceResult && paceResult.expectedPct != null
                                  ? Math.round(paceResult.expectedPct * 100)
                                  : null;
                                return (
                                  <div className="progress-cell">
                                    <span className="progress-cell-bar">
                                      <span className="progress-cell-fill" style={{ width: `${pct}%` }} />
                                      {targetPct != null && (
                                        <span
                                          className="progress-cell-tick"
                                          style={{ left: `${targetPct}%` }}
                                          aria-label={`Target: ${targetPct}%`}
                                        />
                                      )}
                                    </span>
                                    <span className="progress-cell-pct">{pct}%</span>
                                  </div>
                                );
                              })() : (
                                <span className="form-hint">No readings</span>
                              )}
                            </td>
                            <td>
                              {paceStatus ? (
                                <PaceBadge status={paceStatus} rationale={getPaceRationale(paceMap[s.id]?.pace)} />
                              ) : (
                                <span className="form-hint">{'\u2014'}</span>
                              )}
                            </td>
                            <td>
                              <span className={`badge ${getStatusBadgeClass(s.status)}`}>
                                {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile stacked cards with bulk checkboxes */}
                <div className="readiness-cards mobile-only">
                  {adminSortedStudents.map((s) => {
                    const lastDate = lastSessionMap[s.id];
                    const prog = progressMap[s.id];
                    const pct = prog ? masteryPercent(prog.mastered, prog.total) : 0;
                    const paceStatus = paceMap[s.id]?.pace?.status;
                    const stale = isStaleSession(lastDate);
                    const isChecked = bulkSelectedIds.has(s.id);

                    return (
                      <div
                        key={s.id}
                        className={`readiness-card ${isChecked ? 'bulk-row-selected' : ''}`}
                        onClick={() => {
                          if (hasBulkSelection) {
                            toggleBulkSelect(s.id);
                          } else {
                            setSelectedStudentId(s.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedStudentId(s.id); } }}
                      >
                        <div className="readiness-card-top">
                          <input
                            type="checkbox"
                            className="bulk-checkbox"
                            checked={isChecked}
                            onChange={(e) => { e.stopPropagation(); toggleBulkSelect(s.id); }}
                            aria-label={`Select ${s.first_name} ${s.last_name}`}
                          />
                          <span className="student-avatar" aria-hidden="true">
                            {getInitials(s.first_name, s.last_name)}
                          </span>
                          <div className="readiness-card-info">
                            <div className="readiness-card-name">{s.first_name} {s.last_name}</div>
                            <div className="readiness-card-meta">
                              {s.mitzvah_date ? `Bimah ${formatShortDate(s.mitzvah_date)}` : 'No date set'}
                              {lastDate && (
                                <>{' \u00B7 '}<span className={stale ? 'session-stale' : ''}>
                                  {formatLastSession(lastDate)}
                                </span></>
                              )}
                            </div>
                          </div>
                          {paceStatus && <PaceBadge status={paceStatus} rationale={getPaceRationale(paceMap[s.id]?.pace)} />}
                        </div>
                        <div className="readiness-card-row">
                          <span className={stale ? 'session-stale' : ''}>
                            {stale ? 'Needs a session' : (s.status.charAt(0).toUpperCase() + s.status.slice(1))}
                          </span>
                          <span><b>{pct}%</b> {prog && prog.total > 0 ? formatMasterySummary(prog) : 'learned with trope'}</span>
                        </div>
                        <div className="readiness-card-bar">
                          <span className="readiness-card-bar-fill" style={{ width: `${pct}%` }} />
                          {(() => {
                            const paceResult = paceMap[s.id]?.pace;
                            const targetPct = paceResult && paceResult.expectedPct != null
                              ? Math.round(paceResult.expectedPct * 100)
                              : null;
                            return targetPct != null ? (
                              <span
                                className="progress-cell-tick"
                                style={{ left: `${targetPct}%` }}
                                aria-label={`Target: ${targetPct}%`}
                              />
                            ) : null;
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Bulk batch action bar */}
            {hasBulkSelection && (
              <div className="bulk-batch-bar">
                <div className="bulk-batch-bar-inner">
                  <span className="bulk-batch-count">
                    {bulkSelectedIds.size} selected
                  </span>

                  {!bulkAction && !bulkConfirmData && (
                    <div className="bulk-batch-actions">
                      <button
                        className="btn btn-outline btn-small"
                        type="button"
                        onClick={() => setBulkAction('reassign')}
                      >
                        Reassign tutor
                      </button>
                      <button
                        className="btn btn-outline btn-small"
                        type="button"
                        onClick={() => setBulkAction('advance')}
                      >
                        Move to cohort
                      </button>
                      <button
                        className="btn btn-outline btn-small"
                        type="button"
                        onClick={() => { setBulkAction('complete'); }}
                      >
                        Mark completed
                      </button>
                      <button
                        className="bulk-batch-clear"
                        type="button"
                        onClick={() => setBulkSelectedIds(new Set())}
                        aria-label="Clear selection"
                      >
                        {'\u2715'}
                      </button>
                    </div>
                  )}

                  {bulkAction === 'reassign' && !bulkConfirmData && (
                    <div className="bulk-batch-picker">
                      <select
                        className="input"
                        value={bulkReassignTutorId}
                        onChange={(e) => setBulkReassignTutorId(e.target.value)}
                        aria-label="Select tutor"
                      >
                        <option value="">Choose tutor...</option>
                        {allTutors.map((t) => (
                          <option key={t.id} value={t.id}>{tutorName(t)}</option>
                        ))}
                      </select>
                      <button
                        className="btn btn-primary btn-small"
                        type="button"
                        disabled={!bulkReassignTutorId}
                        onClick={prepareBulkConfirm}
                      >
                        Confirm
                      </button>
                      <button className="btn btn-outline btn-small" type="button" onClick={cancelBulkAction}>Cancel</button>
                    </div>
                  )}

                  {bulkAction === 'advance' && !bulkConfirmData && (
                    <div className="bulk-batch-picker">
                      <select
                        className="input"
                        value={bulkAdvanceCohortId}
                        onChange={(e) => setBulkAdvanceCohortId(e.target.value)}
                        aria-label="Select cohort"
                      >
                        <option value="">Choose cohort...</option>
                        {sortCohortsChronologically(allCohorts).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        className="btn btn-primary btn-small"
                        type="button"
                        disabled={!bulkAdvanceCohortId}
                        onClick={prepareBulkConfirm}
                      >
                        Confirm
                      </button>
                      <button className="btn btn-outline btn-small" type="button" onClick={cancelBulkAction}>Cancel</button>
                    </div>
                  )}

                  {bulkAction === 'complete' && !bulkConfirmData && (
                    <div className="bulk-batch-confirm">
                      <span className="bulk-batch-confirm-label">
                        Mark {bulkSelectedIds.size} student{bulkSelectedIds.size === 1 ? '' : 's'} as completed?
                      </span>
                      <button
                        className="btn btn-primary btn-small"
                        type="button"
                        disabled={bulkProcessing}
                        onClick={() => {
                          prepareBulkConfirm();
                          // executeBulkAction will be called when confirmData is set
                        }}
                      >
                        Yes, proceed
                      </button>
                      <button
                        className="btn btn-outline btn-small"
                        type="button"
                        onClick={cancelBulkAction}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {bulkConfirmData && (
                    <div className="bulk-batch-confirm">
                      <span className="bulk-batch-confirm-label">{bulkConfirmData.label}</span>
                      <button
                        className="btn btn-primary btn-small"
                        type="button"
                        disabled={bulkProcessing}
                        onClick={executeBulkAction}
                      >
                        {bulkProcessing ? 'Updating\u2026' : 'Yes, proceed'}
                      </button>
                      <button
                        className="btn btn-outline btn-small"
                        type="button"
                        disabled={bulkProcessing}
                        onClick={cancelBulkAction}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Monthly tutor hours export */}
        <div className="card" style={{ marginTop: 'var(--space-6)' }}>
          <MonthlyHoursExport />
        </div>

        {/* Undo toast */}
        {bulkToast && (
          <div className="bulk-toast">
            <span>{bulkToast.message}</span>
            {bulkToast.undoFn && (
              <button
                className="bulk-toast-undo"
                type="button"
                onClick={bulkToast.undoFn}
              >
                Undo
              </button>
            )}
            <button
              className="bulk-toast-dismiss"
              type="button"
              onClick={() => setBulkToast(null)}
              aria-label="Dismiss"
            >
              {'\u2715'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="sr-only">Dashboard</h1>

      {isShabbat && <ShabbatBanner />}

      {error && <div className="alert alert-error">{error}</div>}

      {/* Alerts panel (tutor: always; admin: only when viewing a student) */}
      {((role === ROLES.TUTOR) || (role === ROLES.ADMIN && selectedStudentId)) && !loadingStudents && students.length > 0 && (
        <AlertsPanel
          students={students}
          paceMap={paceMap}
          lastSessionMap={lastSessionMap}
          progressMap={progressMap}
          onSelectStudent={(id) => setSelectedStudentId(id)}
          missingHoursData={role === ROLES.ADMIN ? missingHoursData : undefined}
          inactiveTutors={role === ROLES.ADMIN ? inactiveTutors : undefined}
        />
      )}

      {/* Utility row with student switcher */}
      {/* Admin: hide when on cohort landing (the landing has its own UI) */}
      {showSelector && !(role === ROLES.ADMIN && !selectedStudentId) && (
        <div className="dash-utility-row">
          {loadingStudents ? (
            <div className="skeleton" style={{ width: '280px', height: '42px', borderRadius: 'var(--radius-md)' }} aria-hidden="true" />
          ) : students.length === 0 ? (
            <div className="empty-state">
              <p>
                {role === ROLES.ADMIN
                  ? 'No students in the system yet. Add students in Admin Setup.'
                  : role === ROLES.TUTOR
                    ? 'No students assigned to you yet.'
                    : 'No students found.'}
              </p>
              {role === ROLES.ADMIN && (
                <Link to="/admin" className="btn btn-primary btn-small empty-state-action">Go to Admin Setup</Link>
              )}
            </div>
          ) : (
            <StudentSwitcher
              students={switcherStudents}
              selectedStudentId={selectedStudentId || null}
              onSelect={(id) => setSelectedStudentId(id)}
              placeholder="Switch student"
            />
          )}

          {/* Tutor: back to student list */}
          {selectedStudentId && role === ROLES.TUTOR && (
            <button
              className="btn btn-outline btn-small"
              onClick={() => setSelectedStudentId('')}
              type="button"
            >
              {'\u2190'} My students
            </button>
          )}

          {/* Admin: back to cohort overview */}
          {selectedStudentId && role === ROLES.ADMIN && (
            <button
              className="btn btn-outline btn-small"
              onClick={() => setSelectedStudentId('')}
              type="button"
            >
              {'\u2190'} Cohort overview
            </button>
          )}
        </div>
      )}

      {loadingDash && <DashboardSkeleton />}

      {/* Student dashboard (selected student) */}
      {dashData && !loadingDash && (
        <>
          {/* Ceremonial hero for student/parent; standard hero for admin/tutor */}
          {isStudentOrParent ? (
            <CeremonialHero
              student={dashData.student}
              readings={dashData.readings}
              daysToMitzvah={daysToMitzvah}
              masteryPct={masteryPct}
              cohortName={cohortName}
              isFullCompletion={isFullCompletion}
            />
          ) : (
            <div className={isFullCompletion ? 'hero-wrapper-complete' : undefined}>
              <HeroHeader
                student={dashData.student}
                readings={dashData.readings}
                daysToMitzvah={daysToMitzvah}
                isFullCompletion={isFullCompletion}
              />
            </div>
          )}

          {/* Student/parent welcome line (v2 Section 14.3) */}
          {isStudentOrParent && !welcomeDismissed && (
            <div className="welcome-line">
              <p className="welcome-line-text">
                This is where you'll follow {dashData.student.first_name}'s journey to the bimah, updated after every lesson.
              </p>
              <button
                className="welcome-line-dismiss"
                onClick={() => {
                  localStorage.setItem('mymadrich:welcome_dismissed', '1');
                  setWelcomeDismissed(true);
                }}
                aria-label="Dismiss welcome message"
                type="button"
              >
                {'\u2715'}
              </button>
            </div>
          )}

          {renderMilestoneBanners()}
          {renderStatTiles()}
          {renderDvarTorahLine()}
          {renderDashboardContent()}
        </>
      )}

      {/* Tutor landing: attention-first student card grid */}
      {!selectedStudentId && !loadingStudents && students.length > 0 && role === ROLES.TUTOR && (() => {
        const sorted = sortStudentsAttentionFirst(students, paceMap);
        const attentionCount = students.filter((s) => {
          const st = paceMap[s.id]?.pace?.status;
          return st === 'critical' || st === 'past_due' || st === 'behind';
        }).length;

        return (
          <div className="tutor-landing">
            <TutorFirstRunStrip />
            <TutorMissingHoursNudge tutorId={user?.id} />

            {/* Header: count + attention + log button */}
            <div className="tut-header">
              <div className="tut-header-meta">
                {students.length} active
                {attentionCount > 0 && (
                  <>{' \u00B7 '}<span className="tut-attention-count">{attentionCount} need attention</span>{' this week'}</>
                )}
              </div>
              <button
                className={`btn btn-primary btn-small${isShabbat ? ' shabbat-log-quiet' : ''}`}
                onClick={() => navigate('/sessions/new')}
                type="button"
              >
                + Log a session
              </button>
            </div>

            {/* Student card grid */}
            <div className="tut-grid">
              {sorted.map((s) => {
                const lastDate = lastSessionMap[s.id];
                const prog = progressMap[s.id];
                const pct = prog ? masteryPercent(prog.mastered, prog.total) : 0;
                const paceStatus = paceMap[s.id]?.pace?.status;
                const initials = `${s.first_name?.charAt(0) || ''}${s.last_name?.charAt(0) || ''}`.toUpperCase();
                const isStale = lastDate && getDaysAgo(lastDate) > 14;
                const lastLabel = formatLastSession(lastDate);
                const hwStat = homeworkMap[s.id];

                return (
                  <div key={s.id} className="tut-card">
                    <div className="tut-card-top">
                      <span className="tut-card-avatar">{initials}</span>
                      <div className="tut-card-top-text">
                        <div className="tut-card-name">{s.first_name} {s.last_name}</div>
                        <div className="tut-card-meta">
                          {s.mitzvah_date ? `Bimah ${formatDate(s.mitzvah_date)}` : 'No date set'}
                        </div>
                      </div>
                    </div>
                    <div className="tut-card-row">
                      <span className={isStale ? 'session-stale' : ''}>
                        {lastLabel ? `Last session: ${lastLabel}` : 'No sessions yet'}
                      </span>
                      {paceStatus && <PaceBadge status={paceStatus} />}
                    </div>
                    <div className="tut-card-progress">
                      <div className="tut-card-row">
                        <span>Reading progress</span>
                        <span className="tut-card-pct">
                          {prog && prog.total > 0 ? `${pct}%` : '\u2014'}
                        </span>
                      </div>
                      <div className="tut-card-bar">
                        <span className="tut-card-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      {prog && prog.total > 0 && (
                        <div className="tut-card-row">
                          <span className="tut-card-summary">{formatMasterySummary(prog)}</span>
                        </div>
                      )}
                    </div>
                    {hwStat && (
                      <div className="tut-card-row">
                        <span className={`tut-card-hw-badge${hwStat.done === hwStat.total ? ' tut-card-hw-badge--complete' : ''}`}>
                          Homework {hwStat.done}/{hwStat.total}
                        </span>
                      </div>
                    )}
                    <div className="tut-card-actions">
                      <button
                        className={`btn btn-primary btn-small${isShabbat ? ' shabbat-log-quiet' : ''}`}
                        onClick={() => navigate(`/sessions/new?student=${s.id}`)}
                        type="button"
                      >
                        Log session
                      </button>
                      <button
                        className="btn btn-outline btn-small"
                        onClick={() => setSelectedStudentId(s.id)}
                        type="button"
                      >
                        View progress
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Admin cohort landing (no student selected) */}
      {!selectedStudentId && !loadingStudents && role === ROLES.ADMIN && (
        students.length > 0
          ? renderAdminLanding()
          : (
            <div className="card">
              <div className="empty-state">
                <p>No students in the system yet. Add students in Admin Setup.</p>
                <Link to="/admin" className="btn btn-primary btn-small empty-state-action">Go to Admin Setup</Link>
              </div>
            </div>
          )
      )}

      {/* No student selected prompt (student/parent with multiple children) */}
      {!selectedStudentId && !loadingStudents && students.length > 0 && showSelector && role !== ROLES.TUTOR && role !== ROLES.ADMIN && (
        <div className="card">
          <div className="empty-state">
            <p>Select a student above to view their progress.</p>
          </div>
        </div>
      )}

      {/* Milestone celebration replay overlay (student/parent) */}
      <CelebrationMoment
        open={celebrationReplay !== null}
        onClose={() => setCelebrationReplay(null)}
        title={celebrationReplay?.title}
        subtitle={celebrationReplay?.subtitle}
      />
    </div>
  );
}

// ---- Icons ----

function DvarFamilyIcon({ delivered }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`dvar-family-icon${delivered ? ' dvar-family-icon-delivered' : ''}`}
    >
      <path d="M3 4.5C3 3.4 3.9 2.5 5 2.5h3c1.1 0 2 .9 2 1.1V17c0-.9-1.3-1.5-2-1.5H5c-1.1 0-2-.9-2-2V4.5z" />
      <path d="M17 4.5c0-1.1-.9-2-2-2h-3c-1.1 0-2 .9-2 1.1V17c0-.9 1.3-1.5 2-1.5h3c1.1 0 2-.9 2-2V4.5z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="homework-card-icon"
    >
      <path d="M2 3.5C2 2.67 2.67 2 3.5 2H7c.83 0 2 .67 2 1.5V16c0-.83-1.17-1.5-2-1.5H3.5C2.67 14.5 2 13.83 2 13V3.5z" />
      <path d="M16 3.5C16 2.67 15.33 2 14.5 2H11c-.83 0-2 .67-2 1.5V16c0-.83 1.17-1.5 2-1.5h3.5c.83 0 1.5-.67 1.5-1.5V3.5z" />
    </svg>
  );
}
