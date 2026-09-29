import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  ROLES,
  QUALITY_COLORS,
  COLOR_GOLD,
  COLOR_GOLD_HALF,
  COLOR_GRAY,
  getQualityLabels,
  QUALITY_LABEL_NOT_STARTED,
  QUALITY_LABEL_TORAH_TRANSFER,
  QUALITY_LABEL_TORAH_MASTERY,
} from '../utils/constants';
import { useSessions } from '../hooks/useSessions';
import usePageTitle from '../hooks/usePageTitle';
import { formatDateCompact, formatSessionTime, formatSessionTimeRange } from '../utils/datetime';
import { tutorName } from '../utils/people';
import Modal from '../components/ui/Modal';
import StudentSwitcher from '../components/ui/StudentSwitcher';
import { SessionListSkeleton } from '../components/ui/SkeletonBlock';

// ---- localStorage persistence key ----
const FILTER_STORAGE_KEY = 'mymadrich:session-history-filters';

/** Read persisted filter state from localStorage, with safe fallback. */
function loadPersistedFilters() {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validate shape
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        dateFrom: parsed.dateFrom || '',
        dateTo: parsed.dateTo || '',
        allStudents: parsed.allStudents === true,
        activePreset: parsed.activePreset || null,
      };
    }
  } catch {
    // Corrupted storage; ignore
  }
  return null;
}

/** Write filter state to localStorage. */
function persistFilters({ dateFrom, dateTo, allStudents, activePreset }) {
  try {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ dateFrom, dateTo, allStudents, activePreset })
    );
  } catch {
    // Storage full or unavailable; non-critical
  }
}

// ---- Color and label helpers (role-aware per Decision 3) ----

function getVerseColor(quality, status, readingType) {
  if (!quality) return COLOR_GRAY;
  if (quality === 'perfect' && status === 'torah_side' && readingType === 'torah') {
    return COLOR_GOLD;
  }
  if (quality === 'perfect' && status === 'torah_side_transfer' && readingType === 'torah') {
    return COLOR_GOLD_HALF;
  }
  return QUALITY_COLORS[quality] || COLOR_GRAY;
}

function getVerseLabel(quality, status, readingType, labels) {
  if (!quality) return QUALITY_LABEL_NOT_STARTED;
  if (quality === 'perfect' && status === 'torah_side' && readingType === 'torah') {
    return QUALITY_LABEL_TORAH_MASTERY;
  }
  if (quality === 'perfect' && status === 'torah_side_transfer' && readingType === 'torah') {
    return QUALITY_LABEL_TORAH_TRANSFER;
  }
  return labels[quality] || quality;
}

function getElementColor(quality) {
  if (!quality) return COLOR_GRAY;
  return QUALITY_COLORS[quality] || COLOR_GRAY;
}

function getElementLabel(quality, labels) {
  if (!quality) return QUALITY_LABEL_NOT_STARTED;
  return labels[quality] || quality;
}

/** Map quality key to a CSS class for tinted row backgrounds. */
function getQualityRowClass(quality, status, readingType) {
  if (!quality) return 'session-detail-row-neutral';
  if (quality === 'perfect' && status === 'torah_side' && readingType === 'torah') {
    return 'session-detail-row-torah';
  }
  if (quality === 'perfect' && status === 'torah_side_transfer' && readingType === 'torah') {
    return 'session-detail-row-transfer';
  }
  switch (quality) {
    case 'perfect': return 'session-detail-row-mastered';
    case 'minor_mistakes': return 'session-detail-row-nearly';
    case 'moderate_mistakes': return 'session-detail-row-getting';
    case 'still_learning': return 'session-detail-row-learning';
    default: return 'session-detail-row-neutral';
  }
}

function getElementRowClass(quality) {
  if (!quality) return 'session-detail-row-neutral';
  switch (quality) {
    case 'perfect': return 'session-detail-row-mastered';
    case 'minor_mistakes': return 'session-detail-row-nearly';
    case 'moderate_mistakes': return 'session-detail-row-getting';
    case 'still_learning': return 'session-detail-row-learning';
    default: return 'session-detail-row-neutral';
  }
}

function getStatusLabel(status) {
  if (!status) return '';
  const labels = {
    review: 'Review',
    new: 'New',
    torah_side_transfer: 'Transferring',
    torah_side: 'Torah Side',
  };
  return labels[status] || status;
}

function formatDate(dateStr) {
  return formatDateCompact(dateStr);
}

function formatCategory(cat) {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

// ---- Date preset helpers ----

/** Returns YYYY-MM-DD for the first of the current month. */
function thisMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Returns YYYY-MM-DD for 30 days ago. */
function last30DaysStart() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

/** Returns YYYY-MM-DD for 7 days ago. */
function last7DaysStart() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

/** Returns today as YYYY-MM-DD. */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ---- Page size options ----
const PAGE_SIZE_OPTIONS = [10, 25, 50];

// ---- Main Component ----

export default function SessionHistoryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, role } = useAuth();
  usePageTitle('Session History');

  // Student list
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(searchParams.get('student') || '');
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [studentError, setStudentError] = useState(null);

  // ---- Filter state (persisted to localStorage) ----
  const persisted = useMemo(() => loadPersistedFilters(), []);
  // An explicit ?student= deep link (e.g. clicking a session from a student's
  // profile) starts with a clean slate. A leftover date range or preset from
  // an earlier visit would hide sessions outside that range, including the
  // one the link points at.
  const hasStudentDeepLink = Boolean(searchParams.get('student'));
  const [dateFrom, setDateFrom] = useState(hasStudentDeepLink ? '' : (persisted?.dateFrom || ''));
  const [dateTo, setDateTo] = useState(hasStudentDeepLink ? '' : (persisted?.dateTo || ''));
  const [allStudents, setAllStudents] = useState(() => {
    // An explicit ?student= deep link should always win over a remembered
    // "All Students" preference — otherwise a link meant to show one
    // student's history silently shows everyone's instead.
    if (searchParams.get('student')) return false;
    return persisted?.allStudents || false;
  });
  const [activePreset, setActivePreset] = useState(hasStudentDeepLink ? null : (persisted?.activePreset || null));
  const [rangeError, setRangeError] = useState(null);

  // Cohort start date for the selected student (for "Cohort to date" preset)
  const [cohortStartDate, setCohortStartDate] = useState(null);

  // Persist filter changes
  useEffect(() => {
    persistFilters({ dateFrom, dateTo, allStudents, activePreset });
  }, [dateFrom, dateTo, allStudents, activePreset]);

  // Validate date range: guard against inverted range
  useEffect(() => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setRangeError('The "From" date is after the "To" date. Dates have been swapped.');
      // Auto-swap
      const swapFrom = dateTo;
      const swapTo = dateFrom;
      setDateFrom(swapFrom);
      setDateTo(swapTo);
    } else {
      setRangeError(null);
    }
  }, [dateFrom, dateTo]);

  // ---- Determine effective filter values for the hook ----
  // Only pass studentId to hook in single-student mode
  const hookStudentId = allStudents ? null : selectedStudentId;

  // Session data from hook
  const {
    sessions,
    totalCount,
    hasMore,
    loading,
    error,
    pageSize,
    changePageSize,
    loadMore,
    expandedId,
    detail,
    loadingDetail,
    fetchDetail,
    deleteSession,
  } = useSessions({
    studentId: hookStudentId,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    allStudents,
  });

  // ---- Deep-link: auto-expand + scroll to a specific session (?session=) ----
  const sessionParam = searchParams.get('session');
  const sessionScrollHandled = useRef(false);

  useEffect(() => {
    if (!sessionParam || sessionScrollHandled.current || loading) return;
    const target = sessions.find((s) => s.id === sessionParam);
    if (!target) return;

    sessionScrollHandled.current = true;
    fetchDetail(sessionParam);

    // Wait a tick for the expanded detail to render before scrolling to it
    requestAnimationFrame(() => {
      document
        .getElementById(`session-card-${sessionParam}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [sessionParam, sessions, loading, fetchDetail]);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Overflow menu (three-dot) for session actions
  const [overflowMenuId, setOverflowMenuId] = useState(null);
  const overflowTriggerRef = useRef(null);
  const overflowWrapperRef = useRef(null);

  // Role-aware quality labels (Decision 3)
  // Verse labels use "Learned with Trope"; element labels use "Learned"
  const qualityLabels = getQualityLabels(role, 'verse');
  const elementLabels = getQualityLabels(role, 'element');

  // ---- Load student list (RLS filters by role) ----
  useEffect(() => {
    async function loadStudents() {
      setLoadingStudents(true);
      setStudentError(null);
      try {
        const { data, error: err } = await supabase
          .from('students')
          .select('id, first_name, last_name, tutor_id, mitzvah_date, tutor:profiles!tutor_id(display_name), cohort:cohorts!cohort_id(id, start_date), student_guardians(name, is_primary)')
          .in('status', ['active', 'deferred', 'completed'])
          .order('last_name');
        if (err) throw err;

        setStudents(data || []);

        // Auto-select for students and parents with one child
        if (data && data.length === 1 && (role === ROLES.STUDENT || role === ROLES.PARENT)) {
          setSelectedStudentId(data[0].id);
        }

        // Tutor default: pre-select the student from their most recently logged session.
        // Only when nothing is already selected (no ?student= param, no single-child auto-select).
        if (
          role === ROLES.TUTOR &&
          !searchParams.get('student') &&
          data && data.length > 0
        ) {
          try {
            const { data: recentSess } = await supabase
              .from('sessions')
              .select('student_id')
              .eq('tutor_id', user.id)
              .order('created_at', { ascending: false })
              .limit(1);
            if (recentSess && recentSess.length > 0) {
              const lastStudentId = recentSess[0].student_id;
              // Only set if this student is in the loaded list
              if (data.some((s) => s.id === lastStudentId)) {
                setSelectedStudentId(lastStudentId);
              }
            }
          } catch {
            // Non-critical: tutor just sees the empty picker prompt
          }
        }
      } catch (err) {
        setStudentError(err.message);
      } finally {
        setLoadingStudents(false);
      }
    }
    if (user) loadStudents();
  }, [user, role]);

  // ---- Extract cohort start date for selected student ----
  useEffect(() => {
    if (!selectedStudentId || allStudents) {
      setCohortStartDate(null);
      return;
    }
    const student = students.find((s) => s.id === selectedStudentId);
    const start = student?.cohort?.start_date || null;
    setCohortStartDate(start);
  }, [selectedStudentId, students, allStudents]);

  // ---- Selected student object (single-student mode; used for Bimah date display) ----
  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  // ---- Determine UI visibility ----
  const isStaff = role === ROLES.ADMIN || role === ROLES.TUTOR;
  const showSelector = isStaff || students.length > 1;
  const canEdit = isStaff;
  const canDelete = role === ROLES.ADMIN;

  // Whether we need a student selected (single-student mode) and have none
  const needsStudentSelection = !allStudents && !selectedStudentId && !loadingStudents && students.length > 0 && showSelector;

  // Whether the hook should be "active" (has enough input to fetch)
  const hookIsActive = allStudents || !!selectedStudentId;

  // Prepare students for StudentSwitcher (transform guardians)
  const switcherStudents = students.map((s) => ({
    ...s,
    guardians: (s.student_guardians || []).map((g) => ({
      first_name: g.name,
      last_name: '',
      is_primary: g.is_primary,
    })),
  }));

  // ---- Filter handlers ----

  function handlePreset(preset) {
    setActivePreset(preset);
    switch (preset) {
      case 'this-week':
        setDateFrom(last7DaysStart());
        setDateTo(todayStr());
        break;
      case 'this-month':
        setDateFrom(thisMonthStart());
        setDateTo(todayStr());
        break;
      case 'last-30':
        setDateFrom(last30DaysStart());
        setDateTo(todayStr());
        break;
      case 'cohort':
        if (cohortStartDate) {
          setDateFrom(cohortStartDate);
          setDateTo(todayStr());
        }
        break;
      case 'all-time':
        setDateFrom('');
        setDateTo('');
        break;
      default:
        break;
    }
  }

  function handleDateFromChange(val) {
    setDateFrom(val);
    setActivePreset(null); // Manual edit clears preset highlight
  }

  function handleDateToChange(val) {
    setDateTo(val);
    setActivePreset(null);
  }

  function handleClearFilters() {
    setDateFrom('');
    setDateTo('');
    setActivePreset(null);
  }

  function handleToggleAllStudents() {
    const next = !allStudents;
    setAllStudents(next);
    // When entering all-students mode, clear the "cohort" preset since it's single-student only
    if (next && activePreset === 'cohort') {
      setActivePreset('all-time');
      setDateFrom('');
      setDateTo('');
    }
  }

  // Are any date filters active?
  const hasDateFilter = !!dateFrom || !!dateTo;

  // ---- Overflow menu handlers ----
  function toggleOverflowMenu(sessionId, e) {
    e.stopPropagation();
    if (overflowMenuId === sessionId) {
      setOverflowMenuId(null);
    } else {
      overflowTriggerRef.current = e.currentTarget;
      setOverflowMenuId(sessionId);
    }
  }

  // Close overflow menu on outside click (checks the whole trigger+menu
  // wrapper, not just the trigger button — otherwise a mousedown on a
  // menu item like "Delete session" gets treated as an outside click,
  // closing the menu before the click can register on that item)
  const handleOverflowOutsideClick = useCallback((e) => {
    if (overflowWrapperRef.current && overflowWrapperRef.current.contains(e.target)) return;
    setOverflowMenuId(null);
  }, []);

  useEffect(() => {
    if (overflowMenuId) {
      document.addEventListener('mousedown', handleOverflowOutsideClick);
      return () => document.removeEventListener('mousedown', handleOverflowOutsideClick);
    }
  }, [overflowMenuId, handleOverflowOutsideClick]);

  // Close overflow menu on Escape
  useEffect(() => {
    if (!overflowMenuId) return;
    function handleEsc(e) {
      if (e.key === 'Escape') {
        setOverflowMenuId(null);
        if (overflowTriggerRef.current) {
          overflowTriggerRef.current.focus();
        }
      }
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [overflowMenuId]);

  // ---- Delete handler ----
  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSession(deleteTarget);
      setDeleteTarget(null);
    } catch {
      // Error is stored in hook state; modal stays open for feedback
    } finally {
      setDeleting(false);
    }
  }

  // ---- Build empty-state message ----
  function buildEmptyMessage() {
    if (hasDateFilter) {
      const fromLabel = dateFrom ? formatDate(dateFrom) : 'the beginning';
      const toLabel = dateTo ? formatDate(dateTo) : 'today';
      if (allStudents) {
        return `No sessions found between ${fromLabel} and ${toLabel}.`;
      }
      return `No sessions found between ${fromLabel} and ${toLabel} for this student.`;
    }
    if (allStudents) {
      return 'No sessions have been logged yet.';
    }
    if (canEdit) {
      return 'No sessions logged yet.';
    }
    return 'Sessions will appear here after the first lesson. Each one tracks progress, verse by verse.';
  }

  // ---- Render ----
  const displayError = studentError || error;

  return (
    <div className="page content-form">
      <h1>Session History</h1>

      {displayError && <div className="alert alert-error">{displayError}</div>}
      {rangeError && <div className="alert alert-warning">{rangeError}</div>}

      {/* ---- Top controls: Student switcher + All Students toggle ---- */}
      {showSelector && (
        <div className="session-history-utility-row">
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
            <>
              {!allStudents && (
                <StudentSwitcher
                  students={switcherStudents}
                  selectedStudentId={selectedStudentId || null}
                  onSelect={(id) => setSelectedStudentId(id)}
                  placeholder="Switch student"
                />
              )}
              {!allStudents && selectedStudentId && (
                searchParams.get('from') === 'dashboard' ? (
                  <Link
                    to={`/dashboard?student=${selectedStudentId}`}
                    className="btn btn-small btn-outline"
                  >
                    {'\u2190'} Back to profile
                  </Link>
                ) : isStaff ? (
                  <Link
                    to={`/dashboard?student=${selectedStudentId}`}
                    className="btn btn-small btn-outline"
                  >
                    View profile
                  </Link>
                ) : null
              )}
              {isStaff && (
                <button
                  className={`btn btn-small ${allStudents ? 'btn-primary' : 'btn-outline'}`}
                  onClick={handleToggleAllStudents}
                  type="button"
                  aria-pressed={allStudents}
                >
                  <AllStudentsIcon />
                  All Students
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ---- Date range filter bar (visible when staff or when a student is selected) ---- */}
      {(isStaff || selectedStudentId) && !loadingStudents && students.length > 0 && (
        <div className="session-filter-bar">
          <div className="session-filter-dates">
            <div className="session-filter-field">
              <label className="form-hint" htmlFor="filter-from">From</label>
              <input
                id="filter-from"
                type="date"
                className="input session-filter-input"
                value={dateFrom}
                onChange={(e) => handleDateFromChange(e.target.value)}
              />
            </div>
            <div className="session-filter-field">
              <label className="form-hint" htmlFor="filter-to">To</label>
              <input
                id="filter-to"
                type="date"
                className="input session-filter-input"
                value={dateTo}
                onChange={(e) => handleDateToChange(e.target.value)}
              />
            </div>
            {hasDateFilter && (
              <button
                className="btn btn-small btn-outline session-filter-clear"
                onClick={handleClearFilters}
                type="button"
              >
                Clear
              </button>
            )}
          </div>
          <div className="session-filter-presets">
            <button
              className={`session-filter-preset ${activePreset === 'this-week' ? 'session-filter-preset-active' : ''}`}
              onClick={() => handlePreset('this-week')}
              type="button"
            >
              This week
            </button>
            <button
              className={`session-filter-preset ${activePreset === 'this-month' ? 'session-filter-preset-active' : ''}`}
              onClick={() => handlePreset('this-month')}
              type="button"
            >
              This month
            </button>
            <button
              className={`session-filter-preset ${activePreset === 'last-30' ? 'session-filter-preset-active' : ''}`}
              onClick={() => handlePreset('last-30')}
              type="button"
            >
              Last 30 days
            </button>
            {/* Cohort to date: only in single-student mode with a known cohort start */}
            {!allStudents && cohortStartDate && (
              <button
                className={`session-filter-preset ${activePreset === 'cohort' ? 'session-filter-preset-active' : ''}`}
                onClick={() => handlePreset('cohort')}
                type="button"
              >
                Cohort to date
              </button>
            )}
            <button
              className={`session-filter-preset ${activePreset === 'all-time' ? 'session-filter-preset-active' : ''}`}
              onClick={() => handlePreset('all-time')}
              type="button"
            >
              All time
            </button>
          </div>
        </div>
      )}

      {/* No student selected prompt (only in single-student mode) */}
      {needsStudentSelection && (
        <div className="card">
          <div className="empty-state">
            <p>Select a student above to view their session history.</p>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {loading && hookIsActive && <SessionListSkeleton />}

      {/* Session list */}
      {!loading && hookIsActive && (
        <>
          {sessions.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <p>{buildEmptyMessage()}</p>
                {!hasDateFilter && !allStudents && canEdit && selectedStudentId && (
                  <button
                    className="btn btn-primary btn-small empty-state-action"
                    onClick={() => navigate(`/sessions/new?student=${selectedStudentId}`)}
                    type="button"
                  >
                    Log Session
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Controls bar: count + page size */}
              <div className="session-history-controls">
                <span className="session-history-count">
                  Showing {sessions.length} of {totalCount} session{totalCount !== 1 ? 's' : ''}
                </span>
                <div className="session-history-page-size">
                  <label className="form-hint" htmlFor="page-size-select">Show</label>
                  <select
                    id="page-size-select"
                    className="input session-history-page-size-select"
                    value={pageSize}
                    onChange={(e) => changePageSize(Number(e.target.value))}
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Session cards */}
              <div className="session-history-list">
                {sessions.map((session) => {
                  const isExpanded = expandedId === session.id;
                  const bimahDate = allStudents ? session.mitzvahDate : selectedStudent?.mitzvah_date;
                  const profileStudentId = allStudents ? session.student_id : selectedStudentId;

                  return (
                    <div
                      key={session.id}
                      id={`session-card-${session.id}`}
                      className={`session-history-card ${isExpanded ? 'session-history-card-expanded' : ''}`}
                    >
                      {/* Summary row (always visible, clickable) */}
                      <div
                        className="session-history-summary"
                        onClick={() => fetchDetail(session.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fetchDetail(session.id); }}
                        aria-expanded={isExpanded}
                      >
                        <div className="session-history-summary-left">
                          <span className="session-history-date">
                            {formatDate(session.session_date)}
                          </span>
                          <span className="session-history-tutor form-hint">
                            {/* In all-students mode, show student name before tutor — clickable for staff */}
                            {allStudents && session.studentName && (
                              isStaff ? (
                                <Link
                                  to={`/dashboard?student=${profileStudentId}`}
                                  className="session-history-student-name student-name-link"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {session.studentName}
                                </Link>
                              ) : (
                                <span className="session-history-student-name">{session.studentName}</span>
                              )
                            )}
                            {tutorName(session.tutor)}
                            {bimahDate && (
                              <span className="session-history-bimah"> · Bimah: {formatDate(bimahDate)}</span>
                            )}
                            {session.updated_at && session.created_at &&
                              session.updated_at.slice(0, 16) !== session.created_at.slice(0, 16) && (
                              <span className="session-history-edited"> · Edited {formatDate(session.updated_at?.split('T')[0])}</span>
                            )}
                          </span>
                        </div>
                        <div className="session-history-summary-right">
                          <div className="session-history-stats">
                            {session.minutes_worked != null && (
                              <span className="session-history-stat">
                                {session.minutes_worked} min
                              </span>
                            )}
                            {session.verseCount > 0 && (
                              <span className="session-history-stat">
                                {session.verseCount} verse{session.verseCount !== 1 ? 's' : ''}
                              </span>
                            )}
                            {session.elementCount > 0 && (
                              <span className="session-history-stat">
                                {session.elementCount} element{session.elementCount !== 1 ? 's' : ''}
                              </span>
                            )}
                            {session.verseCount === 0 && session.elementCount === 0 && (
                              <span className="session-history-stat form-hint">No progress logged</span>
                            )}
                          </div>
                          <span className={`session-history-chevron ${isExpanded ? 'session-history-chevron-open' : ''}`} aria-hidden="true">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 6 8 10 12 6" /></svg>
                          </span>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="session-history-detail">
                          {/* Detail header: pencil (edit) + overflow (delete) icons */}
                          {(canEdit || canDelete) && (
                            <div className="session-detail-header">
                              <div className="session-detail-header-left">
                                <span className="session-detail-header-date">{formatDate(session.session_date)}</span>
                                {allStudents && session.studentName && (
                                  <span className="session-detail-header-student">{session.studentName}</span>
                                )}
                                <span className="session-detail-header-tutor">{tutorName(session.tutor)}</span>
                                {bimahDate && (
                                  <span className="session-detail-header-bimah">Bimah: {formatDate(bimahDate)}</span>
                                )}
                                {session.updated_at && session.created_at &&
                                  session.updated_at.slice(0, 16) !== session.created_at.slice(0, 16) && (
                                  <span className="session-history-edited">Edited</span>
                                )}
                              </div>
                              <div className="session-detail-header-actions">
                                {canEdit && (
                                  <button
                                    className="session-detail-icon-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/sessions/${session.id}/edit`);
                                    }}
                                    aria-label="Edit session"
                                    title="Edit session"
                                    type="button"
                                  >
                                    <PencilIcon />
                                  </button>
                                )}
                                {canDelete && (
                                  <div
                                    className="session-overflow-wrapper"
                                    ref={overflowMenuId === session.id ? overflowWrapperRef : undefined}
                                  >
                                    <button
                                      className="session-detail-icon-btn"
                                      onClick={(e) => toggleOverflowMenu(session.id, e)}
                                      aria-label="Session actions"
                                      aria-haspopup="true"
                                      aria-expanded={overflowMenuId === session.id}
                                      type="button"
                                    >
                                      <OverflowIcon />
                                    </button>
                                    {overflowMenuId === session.id && (
                                      <div className="session-overflow-menu" role="menu">
                                        <button
                                          className="session-overflow-item session-overflow-item-destructive"
                                          role="menuitem"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOverflowMenuId(null);
                                            setDeleteTarget(session.id);
                                          }}
                                        >
                                          Delete session
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {loadingDetail ? (
                            <div style={{ padding: 'var(--space-4)' }}>
                              <div className="skeleton skeleton-line" />
                              <div className="skeleton skeleton-line skeleton-line-short" />
                              <div className="skeleton skeleton-line skeleton-line-xs" />
                            </div>
                          ) : detail ? (
                            <>
                              {/* Verses worked */}
                              {detail.readingGroups.length > 0 && (
                                <div className="session-detail-group">
                                  <h4>Verses Worked</h4>
                                  {detail.readingGroups.map((rg) => (
                                    <div key={rg.id} className="session-detail-reading">
                                      <div className="session-detail-reading-header">
                                        <span className={`badge ${rg.readingType === 'torah' ? 'badge-active' : 'badge-deferred'}`}>
                                          {rg.readingType === 'torah' ? 'Torah' : 'Haftarah'}
                                        </span>
                                        <strong>{rg.portionName}</strong>
                                        {rg.aliyah && <span className="form-hint">({rg.aliyah})</span>}
                                      </div>
                                      <div className="session-detail-verse-list">
                                        {rg.verses.map((v) => (
                                          <div key={v.id} className={`session-detail-row ${getQualityRowClass(v.quality, v.status, rg.readingType)}`}>
                                            <span className="session-detail-ref">{v.verseReference}</span>
                                            <div className="session-detail-rating">
                                              <span
                                                className="status-dot"
                                                style={{ backgroundColor: getVerseColor(v.quality, v.status, rg.readingType) }}
                                              />
                                              <span className="session-detail-quality-label">
                                                {getVerseLabel(v.quality, v.status, rg.readingType, qualityLabels)}
                                              </span>
                                              {v.status && (
                                                <span className="session-detail-status-badge">
                                                  {getStatusLabel(v.status)}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Elements worked */}
                              {Object.keys(detail.elementGroups).length > 0 && (
                                <div className="session-detail-group">
                                  <h4>Service Elements</h4>
                                  {Object.entries(detail.elementGroups).map(([cat, items]) => (
                                    <div key={cat} className="session-detail-element-category">
                                      <span className="session-detail-category-label">{formatCategory(cat)}</span>
                                      <div className="session-detail-element-list">
                                        {items.map((el) => (
                                          <div key={el.id} className={`session-detail-row ${getElementRowClass(el.quality)}`}>
                                            <span className="session-detail-ref">{el.label}</span>
                                            <div className="session-detail-rating">
                                              <span
                                                className="status-dot"
                                                style={{ backgroundColor: getElementColor(el.quality) }}
                                              />
                                              <span className="session-detail-quality-label">
                                                {getElementLabel(el.quality, elementLabels)}
                                              </span>
                                            </div>
                                            {el.notes && (
                                              <span className="session-detail-note">{el.notes}</span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Homework */}
                              {(detail.homework.length > 0 || session.homework_notes) && (
                                <div className="session-detail-group">
                                  <h4>Homework Assigned</h4>
                                  {detail.homework.length > 0 && (
                                    <ul className="dash-homework-list">
                                      {detail.homework.map((hw) => (
                                        <li key={hw.id}>{hw.description}</li>
                                      ))}
                                    </ul>
                                  )}
                                  {session.homework_notes && (
                                    <p className="dash-homework-notes">{session.homework_notes}</p>
                                  )}
                                  {session.homework_minutes_per_day && (
                                    <p className="form-hint">
                                      Recommended: {session.homework_minutes_per_day} minutes per day
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Session duration */}
                              {session.minutes_worked != null && (
                                <div className="session-detail-group">
                                  <h4>Session Duration</h4>
                                  <p>{session.minutes_worked} minutes</p>
                                </div>
                              )}

                              {/* Next session info */}
                              {session.next_session_date && (
                                <div className="session-detail-group">
                                  <h4>Next Session</h4>
                                  <p>
                                    {formatDate(session.next_session_date)}
                                    {session.next_session_time && (
                                      session.next_session_end_time
                                        ? ` at ${formatSessionTimeRange(session.next_session_time, session.next_session_end_time)}`
                                        : ` at ${formatSessionTime(session.next_session_time)}`
                                    )}
                                  </p>
                                </div>
                              )}

                              {/* Nothing logged in this session */}
                              {detail.readingGroups.length === 0 &&
                                Object.keys(detail.elementGroups).length === 0 &&
                                detail.homework.length === 0 &&
                                !session.homework_notes && (
                                <p className="form-hint">No detail recorded for this session.</p>
                              )}
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="session-history-load-more">
                  <button
                    className="btn btn-outline"
                    onClick={loadMore}
                    disabled={loading}
                  >
                    {loading ? 'Loading...' : `Load more sessions`}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <Modal
          title="Delete Session"
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button
                className="btn btn-outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmDelete}
                disabled={deleting}
                style={{ backgroundColor: 'var(--color-error)', borderColor: 'var(--color-error)' }}
              >
                {deleting ? 'Deleting...' : 'Delete Session'}
              </button>
            </>
          }
        >
          <p>
            Are you sure you want to delete this session? This will permanently remove all
            verse progress, element progress, and homework data recorded in this session.
            This action cannot be undone.
          </p>
        </Modal>
      )}
    </div>
  );
}

// ---- Icons ----

function AllStudentsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ marginRight: '4px', verticalAlign: 'text-bottom' }}
    >
      <circle cx="5" cy="5" r="2.5" />
      <circle cx="11" cy="5" r="2.5" />
      <path d="M1 14c0-2.2 1.8-4 4-4s4 1.8 4 4" />
      <path d="M9 14c0-2.2 1.8-4 4-4s4 1.8 4 4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
    </svg>
  );
}

function OverflowIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
    </svg>
  );
}
