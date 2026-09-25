import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useStudents, fetchTutors } from '../../hooks/useStudents';
import { useCohorts } from '../../hooks/useCohorts';
import { getCurrentCohort, sortCohortsChronologically } from '../../utils/cohorts';
import { calculatePace, PACE_STATUS, getPaceRationale } from '../../utils/paceCalculations';
import { formatDateCompact } from '../../utils/datetime';
import { tutorName, tutorListLabel } from '../../utils/people';
import PaceBadge from '../ui/PaceBadge';
import Modal from '../ui/Modal';
import ImportStudentsModal from './ImportStudentsModal';

const STATUS_OPTIONS = ['active', 'completed', 'deferred', 'withdrawn', 'archived'];
const MITZVAH_TYPE_OPTIONS = ['bar', 'bat', "b'nai"];
const SCHOOL_OPTIONS = ['KSDS', 'RRS', 'Other'];

// Pace severity: lower rank = more severe (sorts first in "most severe" view)
const PACE_SEVERITY_RANK = {
  [PACE_STATUS.CRITICAL]: 0,
  [PACE_STATUS.PAST_DUE]: 0,
  [PACE_STATUS.BEHIND]: 1,
  [PACE_STATUS.NOT_STARTED]: 2,
  [PACE_STATUS.NO_VERSES]: 2,
  [PACE_STATUS.ON_TRACK]: 3,
  [PACE_STATUS.AHEAD]: 4,
  [PACE_STATUS.COMPLETED]: 5,
};

// Status lifecycle order for sorting (lower = earlier in lifecycle)
const STATUS_LIFECYCLE_ORDER = {
  active: 0,
  deferred: 1,
  completed: 2,
  withdrawn: 3,
  archived: 4,
};

// First-click direction per column (the "useful first click" rule)
const FIRST_CLICK_DIRECTION = {
  name: 'asc',
  mitzvah_date: 'asc',
  tutor: 'asc',
  last_session: 'asc',
  progress: 'asc',
  pace: 'asc',       // "asc" here means rank 0 first = most severe first
  status: 'asc',     // lifecycle order: Active first
};

function getInitials(firstName, lastName) {
  const f = (firstName || '').charAt(0).toUpperCase();
  const l = (lastName || '').charAt(0).toUpperCase();
  return f + l;
}

/**
 * Returns whether a student has any assigned tutors via the M:N join table.
 * @param {Object} student - Student object with student_tutors array
 * @returns {boolean}
 */
function hasAssignedTutors(student) {
  return student.student_tutors && student.student_tutors.length > 0;
}

/**
 * Returns the display name of the first (oldest) assigned tutor for sorting,
 * or empty string if unassigned. Uses the student_tutors join with dual-read
 * fallback to the legacy tutor object.
 * @param {Object} student - Student object
 * @returns {string}
 */
function getFirstTutorSortName(student) {
  const entries = (student.student_tutors || []).filter((st) => st.tutor);
  if (entries.length > 0) {
    const sorted = [...entries].sort((a, b) =>
      (a.created_at || '').localeCompare(b.created_at || '')
    );
    return tutorName(sorted[0].tutor, '').toLowerCase();
  }
  // Dual-read fallback
  if (student.tutor) {
    return tutorName(student.tutor, '').toLowerCase();
  }
  return '';
}

export default function StudentTab() {
  const navigate = useNavigate();
  const { cohorts } = useCohorts();

  // Default to the current cohort (active + date-aware)
  const activeCohorts = cohorts.filter((c) => c.is_active);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const { students, loading, error, createStudent, archiveStudent, restoreStudent } = useStudents(
    selectedCohortId || undefined
  );

  // Set default cohort once cohorts load
  useEffect(() => {
    if (!selectedCohortId && activeCohorts.length > 0) {
      const current = getCurrentCohort(cohorts);
      if (current) setSelectedCohortId(current.id);
    }
  }, [activeCohorts, cohorts, selectedCohortId]);

  // Tutor list for dropdown
  const [tutors, setTutors] = useState([]);
  useEffect(() => {
    fetchTutors()
      .then(setTutors)
      .catch((err) => console.error('Failed to load tutors:', err.message));
  }, []);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Success banner state (O-4)
  const [successInfo, setSuccessInfo] = useState(null);
  const successTimerRef = useRef(null);

  function showSuccessBanner(student) {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessInfo({ id: student.id, name: `${student.first_name} ${student.last_name}` });
    successTimerRef.current = setTimeout(() => setSuccessInfo(null), 10000);
  }

  function dismissSuccessBanner() {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessInfo(null);
  }

  // Search, filter, and archived toggle state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTutorId, setFilterTutorId] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Archive confirm modal state
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveConfirmChecked, setArchiveConfirmChecked] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState(null);

  // Sort state (E-1: default Name ascending)
  const [sortKey, setSortKey] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  // Enrichment data: last session date and progress % per student
  const [lastSessionMap, setLastSessionMap] = useState({});
  const [progressMap, setProgressMap] = useState({});
  const [paceMap, setPaceMap] = useState({});

  useEffect(() => {
    if (students.length === 0) {
      setLastSessionMap({});
      setProgressMap({});
      setPaceMap({});
      return;
    }

    const studentIds = students.map((s) => s.id);

    async function fetchEnrichmentData() {
      try {
        // Last session date per student
        const { data: sessionData, error: sessErr } = await supabase
          .from('sessions')
          .select('student_id, session_date')
          .in('student_id', studentIds)
          .order('session_date', { ascending: false });

        if (sessErr) throw sessErr;

        // Build maps: most recent and earliest session per student
        const sessMap = {};
        const firstSessMap = {};
        (sessionData || []).forEach((row) => {
          if (!sessMap[row.student_id]) {
            sessMap[row.student_id] = row.session_date;
          }
          // Data sorted desc, so last entry per student is the earliest
          firstSessMap[row.student_id] = row.session_date;
        });
        setLastSessionMap(sessMap);

        // Verse mastery stats per student
        const { data: verseData, error: verseErr } = await supabase
          .from('verse_current_status')
          .select('student_id, quality')
          .in('student_id', studentIds);

        if (verseErr) throw verseErr;

        // Build map: { studentId: { total, mastered } }
        const progMap = {};
        (verseData || []).forEach((row) => {
          if (!progMap[row.student_id]) {
            progMap[row.student_id] = { total: 0, mastered: 0 };
          }
          progMap[row.student_id].total += 1;
          if (row.quality === 'perfect') {
            progMap[row.student_id].mastered += 1;
          }
        });
        setProgressMap(progMap);

        // Compute pace for each student
        const pMap = {};
        students.forEach((s) => {
          const prog = progMap[s.id];
          const firstSession = firstSessMap[s.id] || null;
          const studentCohort = cohorts.find((c) => c.id === s.cohort_id) || null;

          pMap[s.id] = calculatePace({
            student: s,
            cohort: studentCohort,
            masteredVerseCount: prog?.mastered || 0,
            totalVerseCount: prog?.total || 0,
            firstSessionDate: firstSession,
          });
        });
        setPaceMap(pMap);
      } catch (err) {
        console.error('Failed to load enrichment data:', err.message);
      }
    }

    fetchEnrichmentData();
  }, [students, cohorts]);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    mitzvah_date: '',
    mitzvah_type: '',
    tutor_id: '',
    school: '',
    notes: '',
  });

  function resetForm() {
    setFormData({
      first_name: '',
      last_name: '',
      mitzvah_date: '',
      mitzvah_type: '',
      tutor_id: '',
      school: '',
      notes: '',
    });
    setShowForm(false);
    setFormError(null);
  }

  async function handleSubmit() {
    if (!formData.first_name.trim()) {
      setFormError('First name is required.');
      return;
    }
    if (!formData.last_name.trim()) {
      setFormError('Last name is required.');
      return;
    }
    if (!formData.mitzvah_date) {
      setFormError('B\'nai Mitzvah date is required.');
      return;
    }
    if (!selectedCohortId) {
      setFormError('Please select a cohort first.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const newStudent = await createStudent({
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        mitzvah_date: formData.mitzvah_date,
        mitzvah_type: formData.mitzvah_type || null,
        tutor_id: formData.tutor_id || null,
        cohort_id: selectedCohortId,
        school: formData.school || null,
        notes: formData.notes.trim() || null,
      });

      // M:N: Also insert a student_tutors row so the join table is the source of truth.
      // The student was created with tutor_id for dual-read backward compat; the
      // mirror trigger will re-set it (idempotent). On CONFLICT DO NOTHING guards
      // against any race with a future auto-insert path.
      if (newStudent && formData.tutor_id) {
        await supabase
          .from('student_tutors')
          .insert({ student_id: newStudent.id, tutor_id: formData.tutor_id })
          .throwOnError();
      }

      resetForm();
      if (newStudent) showSuccessBanner(newStudent);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ---- Archive / Restore handlers ----

  function openArchiveModal(student) {
    setArchiveTarget(student);
    setArchiveConfirmChecked(false);
    setArchiveError(null);
  }

  function closeArchiveModal() {
    setArchiveTarget(null);
    setArchiveConfirmChecked(false);
    setArchiveError(null);
  }

  async function handleArchive() {
    if (!archiveTarget || !archiveConfirmChecked) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      await archiveStudent(archiveTarget.id);
      closeArchiveModal();
    } catch (err) {
      setArchiveError(err.message);
    } finally {
      setArchiving(false);
    }
  }

  async function handleRestore(student) {
    try {
      await restoreStudent(student.id);
    } catch (err) {
      console.error('Failed to restore student:', err.message);
    }
  }

  function formatDate(dateStr) {
    return formatDateCompact(dateStr);
  }

  function isStaleSession(dateStr) {
    if (!dateStr) return false;
    const sessionDate = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    const diffDays = Math.floor((now - sessionDate) / (1000 * 60 * 60 * 24));
    return diffDays > 14;
  }

  function getStatusBadgeClass(status) {
    const map = {
      active: 'badge-active',
      completed: 'badge-completed',
      deferred: 'badge-deferred',
      withdrawn: 'badge-withdrawn',
      archived: 'badge-archived',
    };
    return map[status] || '';
  }

  // --- Sorting logic ---

  function handleSort(key) {
    if (key === sortKey) {
      // Same column: reverse direction
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      // New column: apply first-click direction
      setSortKey(key);
      setSortDirection(FIRST_CLICK_DIRECTION[key] || 'asc');
    }
  }

  function sortStudents(list) {
    return [...list].sort((a, b) => {
      let cmp = 0;

      switch (sortKey) {
        case 'name': {
          const nameA = `${a.last_name} ${a.first_name}`.toLowerCase();
          const nameB = `${b.last_name} ${b.first_name}`.toLowerCase();
          cmp = nameA.localeCompare(nameB);
          break;
        }

        case 'mitzvah_date': {
          const dateA = a.mitzvah_date || null;
          const dateB = b.mitzvah_date || null;
          // Null dates always sort to bottom
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          cmp = dateA.localeCompare(dateB);
          break;
        }

        case 'tutor': {
          const hasA = hasAssignedTutors(a);
          const hasB = hasAssignedTutors(b);
          const tutA = getFirstTutorSortName(a);
          const tutB = getFirstTutorSortName(b);
          // Unassigned (no tutors) sorts to bottom regardless of direction
          if (!hasA && !hasB) return 0;
          if (!hasA) return 1;
          if (!hasB) return -1;
          cmp = tutA.localeCompare(tutB);
          break;
        }

        case 'last_session': {
          const sessA = lastSessionMap[a.id] || null;
          const sessB = lastSessionMap[b.id] || null;
          // Null = never logged = infinitely old
          // In ascending (longest-ago first): null is "oldest", so null sorts FIRST
          // In descending (most recent first): null sorts LAST
          if (!sessA && !sessB) return 0;
          if (!sessA) return sortDirection === 'asc' ? -1 : 1;
          if (!sessB) return sortDirection === 'asc' ? 1 : -1;
          cmp = sessA.localeCompare(sessB);
          break;
        }

        case 'progress': {
          const progA = progressMap[a.id];
          const progB = progressMap[b.id];
          // Null progress (no readings) sorts to bottom regardless of direction
          if (!progA && !progB) return 0;
          if (!progA) return 1;
          if (!progB) return -1;
          const pctA = progA.total > 0 ? progA.mastered / progA.total : 0;
          const pctB = progB.total > 0 ? progB.mastered / progB.total : 0;
          cmp = pctA - pctB;
          break;
        }

        case 'pace': {
          const paceA = paceMap[a.id];
          const paceB = paceMap[b.id];
          // Null pace sorts to bottom regardless of direction
          if (!paceA && !paceB) return 0;
          if (!paceA) return 1;
          if (!paceB) return -1;
          const rankA = PACE_SEVERITY_RANK[paceA.status] ?? 99;
          const rankB = PACE_SEVERITY_RANK[paceB.status] ?? 99;
          cmp = rankA - rankB;
          break;
        }

        case 'status': {
          const orderA = STATUS_LIFECYCLE_ORDER[a.status] ?? 99;
          const orderB = STATUS_LIFECYCLE_ORDER[b.status] ?? 99;
          cmp = orderA - orderB;
          break;
        }

        default:
          break;
      }

      // Apply direction. For last_session nulls, we already handled direction
      // inside the case, so regular direction reversal applies to non-null comparisons.
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }

  function getAriaSortValue(key) {
    if (key !== sortKey) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  function renderSortArrow(key) {
    const isActive = key === sortKey;
    const arrow = isActive
      ? (sortDirection === 'asc' ? '\u25B2' : '\u25BC')
      : '\u25B2';

    return (
      <span className={`sort-arrow ${isActive ? 'sort-arrow-active' : ''}`} aria-hidden="true">
        {arrow}
      </span>
    );
  }

  // Row click handler: layered enhancement only (E-2)
  function handleRowClick(e, studentId) {
    // Don't navigate if user is selecting text
    if (window.getSelection().toString()) return;
    // Don't navigate if user clicked an interactive element inside the row
    const tag = e.target.tagName;
    if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT') return;
    if (e.target.closest('a') || e.target.closest('button')) return;
    navigate(`/admin/students/${studentId}`);
  }

  const formFooter = (
    <>
      <button className="btn btn-outline" onClick={resetForm}>
        Cancel
      </button>
      <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
        {saving ? 'Saving...' : 'Add Student'}
      </button>
    </>
  );

  // Count how many archived students are hidden
  const archivedCount = students.filter((s) => s.status === 'archived').length;

  return (
    <div>
      <div className="section-header">
        <h3>Students</h3>
        <div className="action-buttons">
          <button className="btn btn-outline" onClick={() => setShowImport(true)}>
            Import Students
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            Add Student
          </button>
        </div>
      </div>

      {/* Toolbar: cohort selector */}
      <div className="admin-toolbar">
        <select
          className="input cohort-select"
          value={selectedCohortId}
          onChange={(e) => setSelectedCohortId(e.target.value)}
          aria-label="Filter by cohort"
        >
          <option value="">All Cohorts</option>
          {sortCohortsChronologically(cohorts).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.is_active ? '' : '(archived)'}
            </option>
          ))}
        </select>
      </div>

      {/* Search and filter bar */}
      {!loading && students.length > 0 && (
        <div className="form-row" style={{ marginTop: 'var(--space-3)' }}>
          <div className="form-group">
            <input
              className="input"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="form-group">
            <select
              className="input"
              value={filterTutorId}
              onChange={(e) => setFilterTutorId(e.target.value)}
            >
              <option value="">All Tutors</option>
              <option value="unassigned">Unassigned</option>
              {tutors.map((t) => (
                <option key={t.id} value={t.id}>{tutorName(t)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <select
              className="input"
              value={filterSchool}
              onChange={(e) => setFilterSchool(e.target.value)}
            >
              <option value="">All Schools</option>
              {SCHOOL_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Archived toggle */}
      {archivedCount > 0 && (
        <label className="checkbox-row" style={{ marginTop: 'var(--space-2)' }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span>Show archived students ({archivedCount})</span>
        </label>
      )}

      {/* Success banner (O-4) */}
      {successInfo && (
        <div className="alert alert-success success-banner" style={{ marginTop: 'var(--space-3)' }}>
          <div className="success-banner-content">
            <span>{'\u2713'} <strong>{successInfo.name}</strong> added successfully.</span>
            <span
              className="student-link"
              onClick={() => {
                navigate(`/admin/students/${successInfo.id}`);
                dismissSuccessBanner();
              }}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  navigate(`/admin/students/${successInfo.id}`);
                  dismissSuccessBanner();
                }
              }}
            >
              Set Up Readings
            </span>
          </div>
          <button
            className="success-banner-dismiss"
            onClick={dismissSuccessBanner}
            aria-label="Dismiss"
          >
            {'\u2715'}
          </button>
        </div>
      )}

      {(() => {
        // Apply client-side search, tutor filter, and archived filter
        const filtered = students.filter((s) => {
          // Hide archived unless toggle is on
          if (s.status === 'archived' && !showArchived) return false;

          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const name = `${s.first_name} ${s.last_name}`.toLowerCase();
            if (!name.includes(q) && !`${s.last_name}, ${s.first_name}`.toLowerCase().includes(q)) {
              return false;
            }
          }
          if (filterTutorId) {
            if (filterTutorId === 'unassigned') {
              // M:N: unassigned = zero student_tutors rows
              if (hasAssignedTutors(s)) return false;
            } else {
              // M:N: match if the selected tutor is ANY of the assigned tutors
              const assignedIds = (s.student_tutors || []).map((st) => st.tutor_id);
              if (!assignedIds.includes(filterTutorId)) return false;
            }
          }
          if (filterSchool) {
            if (s.school !== filterSchool) return false;
          }
          return true;
        });

        if (loading) return (
          <div className="skeleton-roster">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton-roster-row">
                <span className="skeleton skeleton-avatar" style={{ width: '36px', height: '36px' }}>&nbsp;</span>
                <span className="skeleton skeleton-line" style={{ flex: 1, height: '14px' }}>&nbsp;</span>
                <span className="skeleton skeleton-line-short" style={{ width: '80px', height: '14px' }}>&nbsp;</span>
              </div>
            ))}
          </div>
        );
        if (error) return <div className="alert alert-error">{error}</div>;
        if (students.length === 0) return (
          <div className="empty-state">
            <p>
              {selectedCohortId
                ? 'No students in this cohort yet. Add your first student to get started.'
                : 'No students found. Select a cohort or add a new student.'}
            </p>
            <button
              className="btn btn-primary btn-small empty-state-action"
              onClick={() => setShowForm(true)}
              type="button"
            >
              Add Student
            </button>
          </div>
        );
        if (filtered.length === 0) return (
          <div className="empty-state">
            <p>No students match your search.</p>
          </div>
        );

        const sorted = sortStudents(filtered);

        return (
          <table className="data-table table-interactive">
            <thead>
              <tr>
                <th
                  className="th-sortable"
                  onClick={() => handleSort('name')}
                  aria-sort={getAriaSortValue('name')}
                >
                  <span className="th-sort-inner">
                    Name
                    {renderSortArrow('name')}
                  </span>
                </th>
                <th
                  className="th-sortable mobile-hide"
                  onClick={() => handleSort('mitzvah_date')}
                  aria-sort={getAriaSortValue('mitzvah_date')}
                >
                  <span className="th-sort-inner">
                    B'nai Mitzvah Date
                    {renderSortArrow('mitzvah_date')}
                  </span>
                </th>
                <th
                  className="th-sortable mobile-hide"
                  onClick={() => handleSort('tutor')}
                  aria-sort={getAriaSortValue('tutor')}
                >
                  <span className="th-sort-inner">
                    Tutor
                    {renderSortArrow('tutor')}
                  </span>
                </th>
                <th
                  className="th-sortable mobile-hide"
                  onClick={() => handleSort('last_session')}
                  aria-sort={getAriaSortValue('last_session')}
                >
                  <span className="th-sort-inner">
                    Last Session
                    {renderSortArrow('last_session')}
                  </span>
                </th>
                <th
                  className="th-sortable"
                  onClick={() => handleSort('progress')}
                  aria-sort={getAriaSortValue('progress')}
                >
                  <span className="th-sort-inner">
                    Progress
                    {renderSortArrow('progress')}
                  </span>
                </th>
                <th
                  className="th-sortable"
                  onClick={() => handleSort('pace')}
                  aria-sort={getAriaSortValue('pace')}
                >
                  <span className="th-sort-inner">
                    Pace
                    {renderSortArrow('pace')}
                  </span>
                </th>
                <th
                  className="th-sortable"
                  onClick={() => handleSort('status')}
                  aria-sort={getAriaSortValue('status')}
                >
                  <span className="th-sort-inner">
                    Status
                    {renderSortArrow('status')}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr
                  key={s.id}
                  onClick={(e) => handleRowClick(e, s.id)}
                  className={s.status === 'archived' ? 'row-archived' : ''}
                >
                  <td data-label="Name">
                    <div className="student-name-cell">
                      <span className="student-avatar" aria-hidden="true">
                        {getInitials(s.first_name, s.last_name)}
                      </span>
                      <Link to={`/admin/students/${s.id}`} className="student-name-underline">
                        {s.last_name}, {s.first_name}
                      </Link>
                    </div>
                  </td>
                  <td data-label="Date" className="mobile-hide">{formatDate(s.mitzvah_date)}</td>
                  <td data-label="Tutor" className="mobile-hide">
                    {hasAssignedTutors(s) ? (
                      tutorListLabel(s.student_tutors, s.tutor)
                    ) : (
                      <span className="badge badge-unassigned">Unassigned</span>
                    )}
                  </td>
                  <td data-label="Last Session" className="mobile-hide">
                    {lastSessionMap[s.id] ? (
                      <span className={isStaleSession(lastSessionMap[s.id]) ? 'session-stale' : ''}>
                        {formatDate(lastSessionMap[s.id])}
                      </span>
                    ) : (
                      <span className="form-hint">No sessions</span>
                    )}
                  </td>
                  <td data-label="Progress">
                    {progressMap[s.id] ? (() => {
                      const pct = Math.round((progressMap[s.id].mastered / progressMap[s.id].total) * 100);
                      const pace = paceMap[s.id];
                      const targetPct = pace && pace.expectedPct != null
                        ? Math.round(pace.expectedPct * 100)
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
                  <td data-label="Pace">
                    {paceMap[s.id] ? (
                      <PaceBadge status={paceMap[s.id].status} rationale={getPaceRationale(paceMap[s.id])} />
                    ) : (
                      <span className="form-hint">{'\u2014'}</span>
                    )}
                  </td>
                  <td data-label="Status">
                    <div className="status-cell-with-action">
                      {(() => {
                        const mitzvahHasPassed = s.mitzvah_date && new Date(s.mitzvah_date + 'T00:00:00') < new Date();
                        // Display-only override: an "active" student whose date has
                        // passed reads as Complete here, without changing the real
                        // status field. Archived/deferred/withdrawn/completed are
                        // left as-is — those are deliberate coordinator decisions.
                        if (s.status === 'active' && mitzvahHasPassed) {
                          return <span className="badge badge-completed">Complete</span>;
                        }
                        return (
                          <span className={`badge ${getStatusBadgeClass(s.status)}`}>
                            {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                          </span>
                        );
                      })()}
                      {s.status === 'archived' ? (
                        <button
                          className="btn btn-small btn-outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestore(s);
                          }}
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          className="btn btn-small btn-danger-outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openArchiveModal(s);
                          }}
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })()}

      {/* Add Student Modal */}
      {showForm && (
        <Modal title="Add Student" onClose={resetForm} footer={formFooter}>
          {formError && <div className="alert alert-error">{formError}</div>}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">First Name *</label>
              <input
                className="input"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Last Name *</label>
              <input
                className="input"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">B'nai Mitzvah Date *</label>
              <input
                type="date"
                className="input"
                value={formData.mitzvah_date}
                onChange={(e) => setFormData({ ...formData, mitzvah_date: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select
                className="input"
                value={formData.mitzvah_type}
                onChange={(e) => setFormData({ ...formData, mitzvah_type: e.target.value })}
              >
                <option value="">Select...</option>
                {MITZVAH_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)} Mitzvah
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Tutor</label>
            <select
              className="input"
              value={formData.tutor_id}
              onChange={(e) => setFormData({ ...formData, tutor_id: e.target.value })}
            >
              <option value="">{'\u2014'} No tutor yet {'\u2014'}</option>
              {tutors.map((t) => (
                <option key={t.id} value={t.id}>
                  {tutorName(t)}{t.email ? ` (${t.email})` : ''}
                </option>
              ))}
            </select>
            {tutors.length === 0 && (
              <span className="form-hint">
                No tutors found. Tutors must sign in and be assigned the tutor role first.
              </span>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">School</label>
            <select
              className="input"
              value={formData.school}
              onChange={(e) => setFormData({ ...formData, school: e.target.value })}
            >
              <option value="">Select...</option>
              {SCHOOL_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea
              className="input"
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional internal notes..."
            />
          </div>
        </Modal>
      )}

      {/* Archive Confirm Modal */}
      {archiveTarget && (
        <Modal
          title="Archive Student"
          onClose={closeArchiveModal}
          footer={
            <>
              <button className="btn btn-outline" onClick={closeArchiveModal}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ backgroundColor: 'var(--color-error)' }}
                onClick={handleArchive}
                disabled={!archiveConfirmChecked || archiving}
              >
                {archiving ? 'Archiving...' : 'Archive Student'}
              </button>
            </>
          }
        >
          {archiveError && <div className="alert alert-error">{archiveError}</div>}

          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            This will archive <strong>{archiveTarget.first_name} {archiveTarget.last_name}</strong> and
            hide them from active views. Their session history, readings, verse mastery, and guardian
            records will all be preserved. You can restore them at any time.
          </p>

          <label className="checkbox-row" style={{ marginTop: 'var(--space-4)' }}>
            <input
              type="checkbox"
              checked={archiveConfirmChecked}
              onChange={(e) => setArchiveConfirmChecked(e.target.checked)}
            />
            <span>I understand this student will be archived</span>
          </label>
        </Modal>
      )}

      {showImport && (
        <ImportStudentsModal
          onClose={() => setShowImport(false)}
          onComplete={() => {
            setShowImport(false);
            navigate(0);
          }}
        />
      )}
    </div>
  );
}
