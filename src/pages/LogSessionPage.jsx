import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  ROLES,
  QUALITY,
  QUALITY_LABELS_PRECISION,
  QUALITY_LABELS_ELEMENT_PRECISION,
  QUALITY_COLORS,
  COLOR_GOLD,
  COLOR_GRAY,
  VERSE_STATUS,
} from '../utils/constants';
import { useCohorts } from '../hooks/useCohorts';
import usePageTitle from '../hooks/usePageTitle';
import { formatSessionDate } from '../utils/datetime';
import HelpTip from '../components/ui/HelpTip';
import Modal from '../components/ui/Modal';
import CelebrationMoment from '../components/ui/CelebrationMoment';
import StickyFormHeader from '../components/session/StickyFormHeader';
import InlineRater from '../components/session/InlineRater';
import HomeworkBuilder from '../components/session/HomeworkBuilder';
import UnsavedChangesGuard from '../components/session/UnsavedChangesGuard';
import { VerseProgress, FillLegend } from '../components/ui/VerseProgress';
import TimeSelect from '../components/ui/TimeSelect';
import { formatVerseRange } from '../utils/verseFormat';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const QUALITY_ORDER = [
  QUALITY.PERFECT,
  QUALITY.MINOR_MISTAKES,
  QUALITY.MODERATE_MISTAKES,
  QUALITY.STILL_LEARNING,
];

const STATUS_OPTIONS = [
  { value: 'review', label: 'Review' },
  { value: 'new', label: 'New' },
  { value: 'torah_side_transfer', label: 'Transferring' },
  { value: 'torah_side', label: 'Torah Side' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LogSessionPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const { user, role } = useAuth();

  const isEditMode = Boolean(sessionId);
  const editDataLoaded = useRef(false);
  usePageTitle(isEditMode ? 'Edit Session' : 'Log Session');

  /* ---- State ---- */

  // Student list
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);

  // Selected student
  const [selectedStudentId, setSelectedStudentId] = useState(
    !sessionId ? (searchParams.get('student') || '') : ''
  );
  const [studentDetail, setStudentDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Form fields
  const today = new Date().toISOString().split('T')[0];
  const [sessionDate, setSessionDate] = useState(today);
  const [verseProgress, setVerseProgress] = useState({});
  const [elementProgress, setElementProgress] = useState({});
  const [homeworkSelections, setHomeworkSelections] = useState({});
  const [homeworkNotes, setHomeworkNotes] = useState('');
  const [homeworkMinutes, setHomeworkMinutes] = useState('');
  const [nextSessionDate, setNextSessionDate] = useState('');
  const [nextSessionTime, setNextSessionTime] = useState('');
  const [nextSessionEndTime, setNextSessionEndTime] = useState('');
  const [minutesWorked, setMinutesWorked] = useState('');
  // Collapsible sections
  const [expanded, setExpanded] = useState({ verses: true, elements: true, homework: true });

  // Save state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Edit mode loading
  const [loadingSession, setLoadingSession] = useState(isEditMode);

  // Pill rater state: which item's rater is open (verseId or elementId)
  const [openRaterId, setOpenRaterId] = useState(null);

  // Mark remaining panel state
  const [markRemainingOpen, setMarkRemainingOpen] = useState(null); // 'reading-<id>' or 'category-<name>'
  const [markRemainingStatus, setMarkRemainingStatus] = useState('review');

  // Unsaved-changes tracking
  const [isDirty, setIsDirty] = useState(false);

  // Celebration overlay state (Torah-side mastery moment)
  const [celebrationData, setCelebrationData] = useState(null);

  // Verse status reference panel (display-only, lazy-loaded)
  const [verseStatusData, setVerseStatusData] = useState(null);
  const [loadingVerseStatus, setLoadingVerseStatus] = useState(false);
  const [verseStatusExpanded, setVerseStatusExpanded] = useState(false);

  // Cohort-scoped picker (Session 14)
  const { cohorts } = useCohorts();
  const activeCohort = cohorts.find((c) => c.is_active) || null;
  const activeCohortId = activeCohort?.id || null;

  // Cohort mismatch confirm modal
  const [mismatchStudent, setMismatchStudent] = useState(null);

  // aria-live region
  const liveRegionRef = useRef(null);

  /* ---- Derived values ---- */

  const verseCount = Object.values(verseProgress).filter((v) => v.rated).length;
  const elementCount = Object.values(elementProgress).filter((e) => e.rated).length;

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const studentName = selectedStudent
    ? `${selectedStudent.first_name} ${selectedStudent.last_name}`
    : '';
  const studentInitials = selectedStudent
    ? `${selectedStudent.first_name?.charAt(0) || ''}${selectedStudent.last_name?.charAt(0) || ''}`.toUpperCase()
    : '';

  function hasAnyProgress() {
    return verseCount > 0 || elementCount > 0;
  }

  /* ================================================================ */
  /*  Data Loading                                                     */
  /* ================================================================ */

  // ---- Load student list ----
  useEffect(() => {
    async function loadStudents() {
      setLoadingStudents(true);
      try {
        if (role === ROLES.TUTOR) {
          // M:N: Get student IDs from student_tutors, then fetch students
          const { data: assignmentRows, error: assignErr } = await supabase
            .from('student_tutors')
            .select('student_id')
            .eq('tutor_id', user.id);
          if (assignErr) throw assignErr;

          const myStudentIds = (assignmentRows || []).map((r) => r.student_id);

          if (myStudentIds.length === 0) {
            setStudents([]);
            setLoadingStudents(false);
            return;
          }

          const { data, error: err } = await supabase
            .from('students')
            .select('id, first_name, last_name, cohort_id, tutor_id, tutor:profiles!tutor_id(display_name), cohort:cohorts!cohort_id(name, is_active), guardians:student_guardians(name, is_primary)')
            .eq('status', 'active')
            .in('id', myStudentIds)
            .order('last_name');
          if (err) throw err;
          setStudents(data || []);
        } else {
          // Admin: see all active students
          const { data, error: err } = await supabase
            .from('students')
            .select('id, first_name, last_name, cohort_id, tutor_id, tutor:profiles!tutor_id(display_name), cohort:cohorts!cohort_id(name, is_active), guardians:student_guardians(name, is_primary)')
            .eq('status', 'active')
            .order('last_name');
          if (err) throw err;
          setStudents(data || []);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingStudents(false);
      }
    }
    if (user) loadStudents();
  }, [user, role]);

  // ---- Edit mode: load existing session ----
  useEffect(() => {
    if (!isEditMode || !sessionId) return;

    async function loadExistingSession() {
      setLoadingSession(true);
      setError(null);
      try {
        const { data: session, error: sessErr } = await supabase
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .single();
        if (sessErr) throw sessErr;

        const { data: existingVP, error: vpErr } = await supabase
          .from('session_verse_progress')
          .select('verse_id, status, quality')
          .eq('session_id', sessionId);
        if (vpErr) throw vpErr;

        const { data: existingEP, error: epErr } = await supabase
          .from('session_element_progress')
          .select('element_id, quality, notes')
          .eq('session_id', sessionId);
        if (epErr) throw epErr;

        const { data: existingHW, error: hwErr } = await supabase
          .from('homework_items')
          .select('*')
          .eq('session_id', sessionId);
        if (hwErr) throw hwErr;

        editDataLoaded.current = {
          verseProgress: Object.fromEntries(
            (existingVP || []).map((vp) => [vp.verse_id, { status: vp.status, quality: vp.quality }])
          ),
          elementProgress: Object.fromEntries(
            (existingEP || []).map((ep) => [ep.element_id, { quality: ep.quality, notes: ep.notes || '' }])
          ),
          homework: existingHW || [],
        };

        setSessionDate(session.session_date || today);
        setMinutesWorked(session.minutes_worked != null ? String(session.minutes_worked) : '');
        setHomeworkNotes(session.homework_notes || '');
        setHomeworkMinutes(session.homework_minutes_per_day ? String(session.homework_minutes_per_day) : '');
        setNextSessionDate(session.next_session_date || '');
        setNextSessionTime(session.next_session_time || '');
        setNextSessionEndTime(session.next_session_end_time || '');
        setSelectedStudentId(session.student_id);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingSession(false);
      }
    }

    loadExistingSession();
  }, [sessionId, isEditMode]);

  // ---- Load student detail when selected ----
  useEffect(() => {
    if (!selectedStudentId) {
      setStudentDetail(null);
      setVerseProgress({});
      setElementProgress({});
      setHomeworkSelections({});
      return;
    }

    async function loadDetail() {
      setLoadingDetail(true);
      setError(null);
      try {
        const { data: readings, error: rErr } = await supabase
          .from('readings')
          .select('*, verses(id, verse_reference, sefaria_url, sort_order)')
          .eq('student_id', selectedStudentId)
          .order('sort_order');
        if (rErr) throw rErr;

        const sortedReadings = (readings || []).map((r) => ({
          ...r,
          verses: (r.verses || []).sort((a, b) => a.sort_order - b.sort_order),
        }));

        const { data: elements, error: eErr } = await supabase
          .from('service_elements')
          .select('*')
          .eq('student_id', selectedStudentId)
          .order('sort_order');
        if (eErr) throw eErr;

        const { data: student, error: sErr } = await supabase
          .from('students')
          .select('tutor_id')
          .eq('id', selectedStudentId)
          .single();
        if (sErr) throw sErr;

        setStudentDetail({ readings: sortedReadings, elements: elements || [], tutorId: student.tutor_id });

        // Initialize progress from edit data or fresh
        const editData = editDataLoaded.current;

        const vp = {};
        sortedReadings.forEach((r) => {
          r.verses.forEach((v) => {
            const existing = editData?.verseProgress?.[v.id];
            if (existing) {
              vp[v.id] = { rated: true, status: existing.status, quality: existing.quality, readingType: r.reading_type };
            } else {
              vp[v.id] = { rated: false, status: 'new', quality: null, readingType: r.reading_type };
            }
          });
        });
        setVerseProgress(vp);

        const ep = {};
        (elements || []).forEach((el) => {
          const existing = editData?.elementProgress?.[el.id];
          if (existing) {
            ep[el.id] = { rated: true, quality: existing.quality, notes: existing.notes || '' };
          } else {
            ep[el.id] = { rated: false, quality: null, notes: '' };
          }
        });
        setElementProgress(ep);

        // Initialize homework
        const hw = {};
        sortedReadings.forEach((r) => {
          const hwMatch = editData?.homework?.some(
            (h) => h.item_type === (r.reading_type === 'torah' ? 'torah_reading' : 'haftarah_reading')
              && h.description.includes(r.portion_name)
          );
          hw[`reading-${r.id}`] = hwMatch || false;
        });
        (elements || []).forEach((el) => {
          const hwMatch = editData?.homework?.some(
            (h) => h.description.includes(el.label)
          );
          hw[`element-${el.id}`] = hwMatch || false;
        });
        setHomeworkSelections(hw);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingDetail(false);
      }
    }

    loadDetail();
  }, [selectedStudentId]);

  /* ================================================================ */
  /*  Handlers                                                         */
  /* ================================================================ */

  function toggleSection(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // ---- Pill rater toggle ----
  function toggleRater(id) {
    setOpenRaterId((prev) => (prev === id ? null : id));
    setMarkRemainingOpen(null);
  }

  // ---- Verse rating ----
  function handleVerseQualityChange(verseId, quality) {
    setVerseProgress((prev) => ({
      ...prev,
      [verseId]: { ...prev[verseId], rated: true, quality },
    }));

    // L-4: Auto-add reading to homework
    if (studentDetail) {
      const reading = studentDetail.readings.find((r) =>
        r.verses.some((v) => v.id === verseId)
      );
      if (reading) {
        setHomeworkSelections((prev) => ({
          ...prev,
          [`reading-${reading.id}`]: true,
        }));
      }
    }

    setIsDirty(true);
  }

  function handleVerseStatusChange(verseId, status) {
    setVerseProgress((prev) => ({
      ...prev,
      [verseId]: { ...prev[verseId], status },
    }));
    setIsDirty(true);
  }

  /**
   * Wrapper for verse rating from VerseProgress onRate callback.
   * Detects when a verse newly reaches Torah-side mastery (gold) and
   * fires the CelebrationMoment overlay. Debounced: if a celebration
   * is already showing, additional masteries are silently accepted.
   */
  function handleVerseRate(verseId, { quality, status }) {
    const prev = verseProgress[verseId];
    const finalQuality = quality;
    const finalStatus = status !== undefined ? status : prev?.status;

    const wasGold = prev?.quality === QUALITY.PERFECT && prev?.status === VERSE_STATUS.TORAH_SIDE;
    const isGold = finalQuality === QUALITY.PERFECT && finalStatus === VERSE_STATUS.TORAH_SIDE;

    handleVerseQualityChange(verseId, quality);
    if (status !== undefined) {
      handleVerseStatusChange(verseId, status);
    }

    // Fire celebration for newly achieved Torah-side mastery
    if (isGold && !wasGold && !celebrationData) {
      const reading = studentDetail?.readings.find((r) =>
        r.verses.some((v) => v.id === verseId)
      );
      const verse = reading?.verses.find((v) => v.id === verseId);
      const firstName = selectedStudent?.first_name || '';
      setCelebrationData({
        title: `Mazel tov, ${firstName}!`,
        subtitle: `${reading?.portion_name || ''}, ${verse?.verse_reference || ''}: Torah-side mastery. One more candle lit.`,
      });
    }
  }

  // ---- Element rating ----
  function handleElementQualityChange(elementId, quality) {
    setElementProgress((prev) => ({
      ...prev,
      [elementId]: { ...prev[elementId], rated: true, quality },
    }));

    // L-4: Auto-add element to homework
    setHomeworkSelections((prev) => ({
      ...prev,
      [`element-${elementId}`]: true,
    }));

    setIsDirty(true);
  }

  function handleElementNotesChange(elementId, notes) {
    setElementProgress((prev) => ({
      ...prev,
      [elementId]: { ...prev[elementId], notes },
    }));
    setIsDirty(true);
  }

  // ---- Mark remaining ----
  function toggleMarkRemaining(panelId) {
    setMarkRemainingOpen((prev) => (prev === panelId ? null : panelId));
    setMarkRemainingStatus('review');
    setOpenRaterId(null);
  }

  function applyMarkRemaining(readingOrCategory, quality) {
    if (readingOrCategory.startsWith('reading-')) {
      const readingId = readingOrCategory.replace('reading-', '');
      const reading = studentDetail?.readings.find((r) => r.id === readingId);
      if (!reading) return;

      // Pre-compute how many verses will newly reach Torah-side mastery
      // (must read from current state before setState, not inside the callback)
      let newGoldCount = 0;
      const willBeGold = quality === QUALITY.PERFECT && markRemainingStatus === VERSE_STATUS.TORAH_SIDE;
      if (willBeGold) {
        reading.verses.forEach((v) => {
          const vp = verseProgress[v.id];
          if (!vp?.rated) {
            const wasGold = vp?.quality === QUALITY.PERFECT && vp?.status === VERSE_STATUS.TORAH_SIDE;
            if (!wasGold) newGoldCount += 1;
          }
        });
      }

      setVerseProgress((prev) => {
        const next = { ...prev };
        reading.verses.forEach((v) => {
          if (!next[v.id]?.rated) {
            next[v.id] = { ...next[v.id], rated: true, status: markRemainingStatus, quality };
          }
        });
        return next;
      });

      // L-4: Auto-add reading to homework
      setHomeworkSelections((prev) => ({
        ...prev,
        [`reading-${readingId}`]: true,
      }));

      // Fire celebration for bulk Torah-side mastery
      if (newGoldCount > 0 && !celebrationData) {
        const firstName = selectedStudent?.first_name || '';
        const suffix = newGoldCount === 1
          ? 'One more candle lit.'
          : `${newGoldCount} more candles lit.`;
        setCelebrationData({
          title: `Mazel tov, ${firstName}!`,
          subtitle: `${reading.portion_name || ''}: Torah-side mastery. ${suffix}`,
        });
      }
    } else if (readingOrCategory.startsWith('category-')) {
      const category = readingOrCategory.replace('category-', '');
      const catElements = studentDetail?.elements.filter((el) => el.category === category) || [];

      setElementProgress((prev) => {
        const next = { ...prev };
        catElements.forEach((el) => {
          if (!next[el.id]?.rated) {
            next[el.id] = { ...next[el.id], rated: true, quality };
          }
        });
        return next;
      });

      // L-4: Auto-add elements to homework
      setHomeworkSelections((prev) => {
        const next = { ...prev };
        catElements.forEach((el) => {
          next[`element-${el.id}`] = true;
        });
        return next;
      });
    }

    setMarkRemainingOpen(null);
    setIsDirty(true);
  }

  // ---- Homework ----
  function handleHomeworkToggle(key, value) {
    setHomeworkSelections((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }

  // ---- Form field handlers (mark dirty) ----
  function handleDateChange(value) {
    setSessionDate(value);
    setIsDirty(true);
  }

  function handleNotesChange(value) {
    setHomeworkNotes(value);
    setIsDirty(true);
  }

  function handleMinutesChange(value) {
    setHomeworkMinutes(value);
    setIsDirty(true);
  }

  function handleNextDateChange(value) {
    setNextSessionDate(value);
    setIsDirty(true);
  }

  function handleNextTimeChange(value) {
    setNextSessionTime(value);
    setIsDirty(true);
  }

  function handleNextEndTimeChange(value) {
    setNextSessionEndTime(value);
    setIsDirty(true);
  }

  function handleMinutesWorkedChange(value) {
    setMinutesWorked(value);
    setIsDirty(true);
  }

  function handleStudentSelect(id) {
    setSelectedStudentId(id);
    // Reset rater and mark-remaining state
    setOpenRaterId(null);
    setMarkRemainingOpen(null);
    // Reset verse status panel
    setVerseStatusData(null);
    setVerseStatusExpanded(false);
    if (id) setIsDirty(true);
  }

  /** Called by StudentSwitcher when an out-of-cohort student is picked */
  function handleCohortMismatch(student) {
    setMismatchStudent(student);
  }

  /** Confirm: proceed with out-of-cohort student */
  function confirmMismatch() {
    if (mismatchStudent) {
      handleStudentSelect(mismatchStudent.id);
    }
    setMismatchStudent(null);
  }

  /** Cancel: dismiss the mismatch modal */
  function cancelMismatch() {
    setMismatchStudent(null);
  }

  /* ================================================================ */
  /*  Verse Status Reference Panel (lazy-loaded)                       */
  /* ================================================================ */

  /**
   * Lazily loads current verse statuses from verse_current_status view
   * when the tutor first expands the reference panel. Data is cached
   * for the duration of the form (clears on student switch or reset).
   */
  async function loadVerseStatus() {
    if (verseStatusData || loadingVerseStatus || !selectedStudentId) return;
    setLoadingVerseStatus(true);
    try {
      const { data, error: vsErr } = await supabase
        .from('verse_current_status')
        .select('verse_id, reading_id, verse_reference, sort_order, quality, status, reading_type, portion_name, last_session_date')
        .eq('student_id', selectedStudentId);
      if (vsErr) throw vsErr;

      // Group by reading, using the reading info from studentDetail
      const grouped = {};
      (studentDetail?.readings || []).forEach((r) => {
        grouped[r.id] = {
          id: r.id,
          portionName: r.portion_name,
          aliyah: r.aliyah,
          readingType: r.reading_type,
          verses: [],
        };
      });

      (data || []).forEach((vs) => {
        if (grouped[vs.reading_id]) {
          grouped[vs.reading_id].verses.push({
            id: vs.verse_id,
            ref: vs.verse_reference,
            quality: vs.quality || null,
            status: vs.status || 'new',
            readingType: vs.reading_type,
            lastSessionDate: vs.last_session_date || null,
          });
        }
      });

      // Sort verses within each reading
      const groups = Object.values(grouped)
        .filter((g) => g.verses.length > 0)
        .map((g) => ({
          ...g,
          verses: g.verses.sort((a, b) => {
            const aRow = data.find((d) => d.verse_id === a.id);
            const bRow = data.find((d) => d.verse_id === b.id);
            return (aRow?.sort_order || 0) - (bRow?.sort_order || 0);
          }),
        }));

      setVerseStatusData(groups);
    } catch (err) {
      console.error('Failed to load verse statuses:', err.message);
    } finally {
      setLoadingVerseStatus(false);
    }
  }

  function handleVerseStatusToggle() {
    const willExpand = !verseStatusExpanded;
    setVerseStatusExpanded(willExpand);
    if (willExpand && !verseStatusData) {
      loadVerseStatus();
    }
  }

  /* ================================================================ */
  /*  Save                                                             */
  /* ================================================================ */

  async function handleSave() {
    if (!selectedStudentId) {
      setError('Please select a student.');
      return;
    }
    if (!sessionDate) {
      setError('Please set a session date.');
      return;
    }
    if (!hasAnyProgress()) {
      setError('Please rate at least one verse or service element.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // sessions.tutor_id = who actually logged this session, unconditionally.
      // This is separate from tutor assignment (student_tutors) and drives
      // hours attribution in the S25 export. Never derived from assignment.
      const tutorId = user.id;
      let activeSessionId;

      if (isEditMode) {
        const { error: sessErr } = await supabase
          .from('sessions')
          .update({
            session_date: sessionDate,
            minutes_worked: minutesWorked !== '' ? parseInt(minutesWorked, 10) : null,
            next_session_date: nextSessionDate || null,
            next_session_time: nextSessionTime || null,
            next_session_end_time: nextSessionEndTime || null,
            homework_notes: homeworkNotes.trim() || null,
            homework_minutes_per_day: homeworkMinutes ? parseInt(homeworkMinutes, 10) : null,
          })
          .eq('id', sessionId);
        if (sessErr) throw sessErr;
        activeSessionId = sessionId;

        const { error: delVP } = await supabase.from('session_verse_progress').delete().eq('session_id', sessionId);
        if (delVP) throw delVP;
        const { error: delEP } = await supabase.from('session_element_progress').delete().eq('session_id', sessionId);
        if (delEP) throw delEP;
        const { error: delHW } = await supabase.from('homework_items').delete().eq('session_id', sessionId);
        if (delHW) throw delHW;
      } else {
        const { data: session, error: sessErr } = await supabase
          .from('sessions')
          .insert({
            student_id: selectedStudentId,
            tutor_id: tutorId,
            session_date: sessionDate,
            minutes_worked: minutesWorked !== '' ? parseInt(minutesWorked, 10) : null,
            next_session_date: nextSessionDate || null,
            next_session_time: nextSessionTime || null,
            next_session_end_time: nextSessionEndTime || null,
            homework_notes: homeworkNotes.trim() || null,
            homework_minutes_per_day: homeworkMinutes ? parseInt(homeworkMinutes, 10) : null,
          })
          .select()
          .single();
        if (sessErr) throw sessErr;
        activeSessionId = session.id;
      }

      // Insert verse progress (rated verses only)
      const verseRows = Object.entries(verseProgress)
        .filter(([, v]) => v.rated && v.quality)
        .map(([verseId, v]) => ({
          session_id: activeSessionId,
          verse_id: verseId,
          status: v.status,
          quality: v.quality,
        }));
      if (verseRows.length > 0) {
        const { error: vpErr } = await supabase.from('session_verse_progress').insert(verseRows);
        if (vpErr) throw vpErr;
      }

      // Insert element progress (rated elements only)
      const elementRows = Object.entries(elementProgress)
        .filter(([, e]) => e.rated && e.quality)
        .map(([elementId, e]) => ({
          session_id: activeSessionId,
          element_id: elementId,
          quality: e.quality,
          notes: e.notes.trim() || null,
        }));
      if (elementRows.length > 0) {
        const { error: epErr } = await supabase.from('session_element_progress').insert(elementRows);
        if (epErr) throw epErr;
      }

      // Insert homework items
      const hwRows = [];
      Object.entries(homeworkSelections).forEach(([key, selected]) => {
        if (!selected) return;
        if (key.startsWith('reading-')) {
          const readingId = key.replace('reading-', '');
          const reading = studentDetail.readings.find((r) => r.id === readingId);
          if (reading) {
            hwRows.push({
              session_id: activeSessionId,
              item_type: reading.reading_type === 'torah' ? 'torah_reading' : 'haftarah_reading',
              description: `Practice ${reading.portion_name}${reading.aliyah ? ' ' + reading.aliyah : ''} (${reading.reference})`,
            });
          }
        } else if (key.startsWith('element-')) {
          const elementId = key.replace('element-', '');
          const element = studentDetail.elements.find((el) => el.id === elementId);
          if (element) {
            hwRows.push({
              session_id: activeSessionId,
              item_type: element.category,
              description: `Practice ${element.label}`,
            });
          }
        }
      });
      if (hwRows.length > 0) {
        const { error: hwErr } = await supabase.from('homework_items').insert(hwRows);
        if (hwErr) throw hwErr;
      }

      // Clear dirty state before navigation/success
      setIsDirty(false);

      // Announce success via aria-live
      if (liveRegionRef.current) {
        liveRegionRef.current.textContent = isEditMode
          ? 'Session updated successfully.'
          : 'Session saved successfully.';
      }

      if (isEditMode) {
        navigate('/sessions');
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(err.message);
      if (liveRegionRef.current) {
        liveRegionRef.current.textContent = `Error saving session: ${err.message}`;
      }
    } finally {
      setSaving(false);
    }
  }

  // ---- Reset for another session ----
  function handleLogAnother() {
    setSelectedStudentId('');
    setSessionDate(today);
    setStudentDetail(null);
    setVerseProgress({});
    setElementProgress({});
    setHomeworkSelections({});
    setHomeworkNotes('');
    setHomeworkMinutes('');
    setMinutesWorked('');
    setNextSessionDate('');
    setNextSessionTime('');
    setNextSessionEndTime('');
    setError(null);
    setSuccess(false);
    setOpenRaterId(null);
    setMarkRemainingOpen(null);
    setIsDirty(false);
    setCelebrationData(null);
    setVerseStatusData(null);
    setVerseStatusExpanded(false);
  }

  /* ================================================================ */
  /*  Render helpers                                                   */
  /* ================================================================ */

  /** Returns the pill background color for a verse or element. */
  function getPillColor(progress) {
    if (!progress.rated || !progress.quality) return COLOR_GRAY;
    if (progress.quality === QUALITY.PERFECT && progress.status === 'torah_side') return COLOR_GOLD;
    return QUALITY_COLORS[progress.quality] || COLOR_GRAY;
  }

  /** Renders the "Mark N remaining as..." panel (status + quality). */
  function renderMarkRemainingPanel(panelId, isTorahReading) {
    if (markRemainingOpen !== panelId) return null;

    // For element categories, no status control
    const showStatus = panelId.startsWith('reading-');

    return (
      <div className="mark-remaining-panel inline-rater">
        {showStatus && (
          <div className="rater-status-group" role="radiogroup" aria-label="Status for remaining">
            {STATUS_OPTIONS
              .filter((s) => (s.value !== 'torah_side' && s.value !== 'torah_side_transfer') || isTorahReading)
              .map((s) => (
                <button
                  key={s.value}
                  className={`rater-status-btn${markRemainingStatus === s.value ? ' rater-status-btn-active' : ''}`}
                  onClick={() => setMarkRemainingStatus(s.value)}
                  type="button"
                  role="radio"
                  aria-checked={markRemainingStatus === s.value}
                >
                  {s.label}
                </button>
              ))}
          </div>
        )}
        <div className="rater-quality-row" role="radiogroup" aria-label="Quality for remaining">
          {QUALITY_ORDER.map((qValue) => {
            const color = QUALITY_COLORS[qValue];
            const label = QUALITY_LABELS_PRECISION[qValue];
            return (
              <button
                key={qValue}
                className="rater-quality-btn"
                style={{ borderColor: color, color: color }}
                onClick={() => applyMarkRemaining(panelId, qValue)}
                type="button"
                aria-label={`Mark remaining as ${label}`}
              >
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Render: Success screen                                           */
  /* ================================================================ */

  if (success && !isEditMode) {
    const student = students.find((s) => s.id === selectedStudentId);
    return (
      <div className="page">
        <div className="save-feedback card" role="status">
          <h2 className="save-feedback-title">Session Logged</h2>
          <p className="save-feedback-text">
            Session for {student?.first_name} {student?.last_name} on{' '}
            {formatSessionDate(sessionDate, { style: 'date' })} has been saved.
          </p>
          <div className="save-feedback-actions">
            <button className="btn btn-outline" onClick={() => navigate('/dashboard')}>
              View Student Dashboard
            </button>
            <button className="btn btn-primary" onClick={handleLogAnother}>
              Log Another Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Render: Edit mode loading                                        */
  /* ================================================================ */

  if (isEditMode && loadingSession) {
    return (
      <div className="page">
        <h1>Edit Session</h1>
        <div className="skeleton-log-session">
          <div className="skeleton skeleton-card">&nbsp;</div>
          <div className="skeleton skeleton-card">&nbsp;</div>
          <div className="skeleton skeleton-card">&nbsp;</div>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Render: Main form                                                */
  /* ================================================================ */

  const disabledReason = !selectedStudentId
    ? 'Select a student'
    : !hasAnyProgress()
    ? 'Rate at least one item'
    : '';

  return (
    <div className="page log-session-page">
      {/* Unsaved-changes guard */}
      <UnsavedChangesGuard isDirty={isDirty} />

      {/* Screen reader live region */}
      <div className="sr-only" aria-live="polite" ref={liveRegionRef} />

      {/* Sticky form header (desktop + mobile layouts) */}
      <StickyFormHeader
        students={students}
        selectedStudentId={selectedStudentId}
        onSelectStudent={handleStudentSelect}
        isEditMode={isEditMode}
        studentName={studentName}
        studentInitials={studentInitials}
        loadingStudents={loadingStudents}
        activeCohortId={activeCohortId}
        activeCohortLabel={activeCohort ? `${activeCohort.name} \u00B7 ${students.filter((s) => s.cohort_id === activeCohortId).length} students` : null}
        onCohortMismatch={handleCohortMismatch}
        sessionDate={sessionDate}
        onDateChange={handleDateChange}
        verseCount={verseCount}
        elementCount={elementCount}
        homeworkCount={Object.values(homeworkSelections).filter(Boolean).length}
        nextSessionDate={nextSessionDate}
        onSave={handleSave}
        saving={saving}
        disabled={!selectedStudentId || !hasAnyProgress()}
        disabledReason={disabledReason}
        saveLabel={isEditMode ? 'Update Session' : 'Save Session'}
      />

      {/* Cohort mismatch confirm modal */}
      {mismatchStudent && (
        <Modal
          title="Different Cohort"
          onClose={cancelMismatch}
          footer={
            <>
              <button className="btn btn-outline" onClick={cancelMismatch}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={confirmMismatch}>
                Log anyway
              </button>
            </>
          }
        >
          <p className="cohort-mismatch-body">
            {mismatchStudent.first_name} {mismatchStudent.last_name} is in{' '}
            <strong>{mismatchStudent.cohort?.name || 'a different cohort'}</strong>,
            not the active cohort. Log a session anyway?
          </p>
        </Modal>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {loadingDetail && (
        <div className="skeleton-log-session">
          <div className="skeleton skeleton-card">&nbsp;</div>
          <div className="skeleton skeleton-card">&nbsp;</div>
          <div className="skeleton skeleton-card">&nbsp;</div>
        </div>
      )}

      {studentDetail && !loadingDetail && (
        <>
          {/* ============ Session Duration ============ */}
          <div className="card session-duration-card">
            <div className="section-header">
              <h3>Session Duration</h3>
            </div>
            <div className="form-group" style={{ maxWidth: '200px', marginTop: 'var(--space-3)' }}>
              <label className="form-label" htmlFor="minutes-worked">
                Minutes worked today
              </label>
              <input
                id="minutes-worked"
                type="number"
                className="input"
                inputMode="numeric"
                min="0"
                max="480"
                placeholder="e.g. 45"
                value={minutesWorked}
                onChange={(e) => handleMinutesWorkedChange(e.target.value)}
              />
              <span className="form-hint">
                How long was today's session? Used for tutor hours reporting.
              </span>
            </div>
          </div>

          {/* ============ Current Progress (display-only reference) ============ */}
          <div className="card">
            <div
              className="section-toggle"
              onClick={handleVerseStatusToggle}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleVerseStatusToggle(); } }}
            >
              <h3>Current Progress</h3>
              <span className="section-toggle-count">reference</span>
              <span className="section-toggle-icon">{verseStatusExpanded ? '\u25B2' : '\u25BC'}</span>
            </div>

            {verseStatusExpanded && (
              <div className="session-section-body">
                {loadingVerseStatus ? (
                  <div style={{ padding: 'var(--space-4)' }}>
                    <div className="skeleton skeleton-line" />
                    <div className="skeleton skeleton-line skeleton-line-short" />
                  </div>
                ) : verseStatusData && verseStatusData.length > 0 ? (
                  <>
                    <p className="form-hint" style={{ marginBottom: 'var(--space-3)' }}>
                      Current verse progress across all readings. Tap a cell for detail. This panel is read-only.
                    </p>
                    <FillLegend role={role} className="verse-status-legend" />
                    {verseStatusData.map((group) => (
                      <div key={group.id} className="verse-status-reading">
                        <div className="rating-pills-header">
                          <span className={`rating-pills-eyebrow badge ${group.readingType === 'torah' ? 'badge-active' : 'badge-deferred'}`}>
                            {group.readingType === 'torah' ? 'Torah' : 'Haftarah'}
                          </span>
                          <strong>{group.portionName}</strong>
                          {group.aliyah && <span className="form-hint">({group.aliyah})</span>}
                        </div>
                        <VerseProgress
                          verses={group.verses}
                          mode="display"
                          role={role}
                        />
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="form-hint">No verse data available yet.</p>
                )}
              </div>
            )}
          </div>

          {/* ============ Verse Progress ============ */}
          <div className="card">
            <div
              className="section-toggle"
              onClick={() => toggleSection('verses')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection('verses'); } }}
            >
              <h3>Verse Progress</h3>
              <span className="section-toggle-count">
                {verseCount} of {Object.keys(verseProgress).length} rated
              </span>
              <span className="section-toggle-icon">{expanded.verses ? '\u25B2' : '\u25BC'}</span>
            </div>

            {expanded.verses && (
              <div className="session-section-body">
                {studentDetail.readings.length === 0 ? (
                  <p className="form-hint">No readings assigned. Add readings in the Admin page first.</p>
                ) : (
                  studentDetail.readings.map((reading) => {
                    const readingVerses = reading.verses;
                    const ratedInReading = readingVerses.filter((v) => verseProgress[v.id]?.rated).length;
                    const unratedCount = readingVerses.length - ratedInReading;
                    const panelId = `reading-${reading.id}`;

                    return (
                      <div key={reading.id} className="rating-pills-container">
                        {/* Reading header */}
                        <div className="rating-pills-header">
                          <span className={`rating-pills-eyebrow badge ${reading.reading_type === 'torah' ? 'badge-active' : 'badge-deferred'}`}>
                            {reading.reading_type === 'torah' ? 'Torah' : 'Haftarah'}
                          </span>
                          <strong>{reading.portion_name}</strong>
                          {reading.aliyah && <span className="form-hint">({reading.aliyah})</span>}
                          {readingVerses.length > 0 && (
                            <span className="rating-pills-range">
                              {formatVerseRange(readingVerses)}
                            </span>
                          )}
                          <span className="rating-pills-meta">
                            {ratedInReading} of {readingVerses.length} rated
                          </span>
                          {unratedCount > 0 && (
                            <button
                              className="mark-remaining-trigger"
                              onClick={() => toggleMarkRemaining(panelId)}
                              type="button"
                              aria-expanded={markRemainingOpen === panelId}
                            >
                              Mark {unratedCount} remaining as...
                            </button>
                          )}
                        </div>

                        {/* Mark remaining panel */}
                        {renderMarkRemainingPanel(panelId, reading.reading_type === 'torah')}

                        {/* Fill-cell verse grid (rate mode) */}
                        <VerseProgress
                          verses={readingVerses.map((verse) => {
                            const vp = verseProgress[verse.id];
                            return {
                              id: verse.id,
                              ref: verse.verse_reference,
                              quality: vp?.quality || null,
                              status: vp?.status || 'new',
                              readingType: reading.reading_type,
                            };
                          })}
                          mode="rate"
                          role="tutor"
                          onRate={(verseId, { quality, status }) => {
                            handleVerseRate(verseId, { quality, status });
                          }}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* ============ Service Elements ============ */}
          <div className="card">
            <div
              className="section-toggle"
              onClick={() => toggleSection('elements')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection('elements'); } }}
            >
              <h3>Service Elements</h3>
              <span className="section-toggle-count">
                {elementCount} of {Object.keys(elementProgress).length} rated
              </span>
              <span className="section-toggle-icon">{expanded.elements ? '\u25B2' : '\u25BC'}</span>
            </div>

            {expanded.elements && (
              <div className="session-section-body">
                {studentDetail.elements.length === 0 ? (
                  <p className="form-hint">No service elements assigned. Add elements in the Admin page first.</p>
                ) : (
                  (() => {
                    const grouped = {};
                    studentDetail.elements.forEach((el) => {
                      if (!grouped[el.category]) grouped[el.category] = [];
                      grouped[el.category].push(el);
                    });

                    return Object.entries(grouped).map(([cat, items]) => {
                      const ratedInCat = items.filter((el) => elementProgress[el.id]?.rated).length;
                      const unratedCount = items.length - ratedInCat;
                      const panelId = `category-${cat}`;
                      const openElementInCat = items.find((el) => el.id === openRaterId);
                      const catLabel = cat.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

                      return (
                        <div key={cat} className="rating-pills-container">
                          {/* Category header */}
                          <div className="rating-pills-header">
                            <span className="rating-pills-eyebrow">{catLabel}</span>
                            <span className="rating-pills-meta">
                              {ratedInCat} of {items.length} rated
                            </span>
                            {unratedCount > 0 && (
                              <button
                                className="mark-remaining-trigger"
                                onClick={() => toggleMarkRemaining(panelId)}
                                type="button"
                                aria-expanded={markRemainingOpen === panelId}
                              >
                                Mark {unratedCount} remaining as...
                              </button>
                            )}
                          </div>

                          {/* Mark remaining panel (no status for elements) */}
                          {renderMarkRemainingPanel(panelId, false)}

                          {/* Element chips */}
                          <div className="rating-pills-wrap">
                            {items.map((el) => {
                              const ep = elementProgress[el.id];
                              if (!ep) return null;
                              const color = getPillColor(ep);
                              const isOpen = openRaterId === el.id;
                              const isRated = ep.rated && ep.quality;

                              return (
                                <button
                                  key={el.id}
                                  className={[
                                    'rating-pill',
                                    isRated ? 'rating-pill-rated' : 'rating-pill-unrated',
                                    isOpen ? 'rating-pill-open' : '',
                                  ].filter(Boolean).join(' ')}
                                  style={isRated ? { backgroundColor: color, borderColor: color } : {}}
                                  onClick={() => toggleRater(el.id)}
                                  type="button"
                                  aria-label={`${el.label}${isRated ? ', rated ' + QUALITY_LABELS_ELEMENT_PRECISION[ep.quality] : ', not rated'}`}
                                  aria-pressed={isOpen}
                                >
                                  <span className="rating-pill-text">{el.label}</span>
                                  {isRated && (
                                    <svg className="rating-pill-check" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polyline points="2 6 5 9 10 3" />
                                    </svg>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {/* Inline rater for the open element in this category */}
                          {openElementInCat && (() => {
                            const ep = elementProgress[openElementInCat.id];
                            return (
                              <InlineRater
                                type="element"
                                itemRef={openElementInCat.label}
                                quality={ep.quality}
                                notes={ep.notes}
                                showNotes={isEditMode && ep.notes.length > 0}
                                onQualityChange={(q) => handleElementQualityChange(openElementInCat.id, q)}
                                onNotesChange={(n) => handleElementNotesChange(openElementInCat.id, n)}
                                onClose={() => setOpenRaterId(null)}
                              />
                            );
                          })()}
                        </div>
                      );
                    });
                  })()
                )}
              </div>
            )}
          </div>

          {/* ============ Homework Builder ============ */}
          <HomeworkBuilder
            readings={studentDetail.readings}
            elements={studentDetail.elements}
            verseProgress={verseProgress}
            elementProgress={elementProgress}
            homeworkSelections={homeworkSelections}
            onToggleHomework={handleHomeworkToggle}
            homeworkNotes={homeworkNotes}
            onNotesChange={handleNotesChange}
            homeworkMinutes={homeworkMinutes}
            onMinutesChange={handleMinutesChange}
          />

          {/* ============ Next Session ============ */}
          <div className="card next-session-v2">
            <div className="section-header">
              <h3>Next Session</h3>
              <button
                className="btn btn-outline btn-small"
                type="button"
                onClick={() => {
                  const base = sessionDate || new Date().toISOString().split('T')[0];
                  const d = new Date(base + 'T00:00:00');
                  d.setDate(d.getDate() + 7);
                  const nextDate = d.toISOString().split('T')[0];
                  setNextSessionDate(nextDate);
                  // Preserve times (carry forward existing start + end)
                  setIsDirty(true);
                }}
              >
                Same time next week
              </button>
            </div>
            <div className="form-row" style={{ marginTop: 'var(--space-3)' }}>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input
                  type="date"
                  className="input"
                  value={nextSessionDate}
                  onChange={(e) => handleNextDateChange(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Start time</label>
                <TimeSelect
                  value={nextSessionTime}
                  onChange={handleNextTimeChange}
                  ariaLabelPrefix="Start time"
                />
              </div>
              <div className="form-group">
                <label className="form-label">End time</label>
                <TimeSelect
                  value={nextSessionEndTime}
                  onChange={handleNextEndTimeChange}
                  ariaLabelPrefix="End time"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Torah-side mastery celebration overlay (portal to body) */}
      <CelebrationMoment
        open={celebrationData !== null}
        onClose={() => setCelebrationData(null)}
        title={celebrationData?.title}
        subtitle={celebrationData?.subtitle}
      />
    </div>
  );
}
