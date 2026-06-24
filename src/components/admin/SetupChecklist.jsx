import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const COLLAPSE_KEY = 'mymadrich:admin_checklist_collapsed';
const COHORT_KEY = 'mymadrich:admin_checklist_last_cohort_id';

/**
 * Admin setup checklist (v2 Section 14.1).
 *
 * A state-driven card at the top of the Admin page showing cohort
 * setup progress. Six steps computed from live data. Replaces the
 * v1 zero-cohort first-time guide.
 *
 * Props:
 *   cohorts     - array from useCohorts()
 *   onSwitchTab - function(tabKey) to switch AdminPage tabs
 *   userId      - current admin's profile UUID
 */
export default function SetupChecklist({ cohorts, onSwitchTab, userId }) {
  const navigate = useNavigate();

  // The active cohort drives the checklist context
  const activeCohort = cohorts.find((c) => c.is_active) || null;
  const activeCohortId = activeCohort?.id || null;

  // Dismissal state (persisted on profiles table)
  const [dismissed, setDismissed] = useState(false);
  const [dismissalLoaded, setDismissalLoaded] = useState(false);

  // Collapse state (persisted in localStorage)
  const [collapsed, setCollapsed] = useState(false);

  // Checklist data
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // ---- Load dismissal state from profiles ----
  useEffect(() => {
    if (!userId || !activeCohortId) {
      setDismissalLoaded(true);
      return;
    }

    async function loadDismissal() {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('guidance_dismissed')
          .eq('id', userId)
          .single();
        if (error) throw error;

        const gd = profile?.guidance_dismissed || {};
        setDismissed(gd.admin_checklist_cohort_id === activeCohortId);
      } catch (err) {
        console.error('Failed to load checklist dismissal:', err.message);
      } finally {
        setDismissalLoaded(true);
      }
    }

    loadDismissal();
  }, [userId, activeCohortId]);

  // ---- Load and manage collapse state from localStorage ----
  useEffect(() => {
    if (!activeCohortId) return;

    const lastCohortId = localStorage.getItem(COHORT_KEY);
    if (lastCohortId && lastCohortId !== activeCohortId) {
      // New cohort detected: override collapse and re-expand
      localStorage.removeItem(COLLAPSE_KEY);
      localStorage.setItem(COHORT_KEY, activeCohortId);
      setCollapsed(false);
    } else {
      // Same cohort or first visit: respect stored collapse state
      localStorage.setItem(COHORT_KEY, activeCohortId);
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    }
  }, [activeCohortId]);

  // ---- Fetch checklist data ----
  const fetchData = useCallback(async () => {
    if (!activeCohortId) {
      setData({
        tutorCount: 0,
        pendingTutorCount: 0,
        activeStudents: [],
        noVersesCount: 0,
        noElementsCount: 0,
        familyUserCount: 0,
        pendingInviteCount: 0,
        firstNoVersesStudentId: null,
        firstNoElementsStudentId: null,
      });
      setLoading(false);
      return;
    }

    try {
      // 1. Tutor count (active only; excludes deactivated tutors)
      const { count: tutorCount, error: tutErr } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'tutor')
        .eq('is_active', true);
      if (tutErr) throw tutErr;

      // 1b. Pending tutor invitations (not yet claimed)
      const { count: pendingTutorCount, error: ptErr } = await supabase
        .from('pending_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('intended_role', 'tutor')
        .is('accepted_at', null);
      if (ptErr) throw ptErr;

      // 2. Active students in the active cohort
      const { data: activeStudents, error: stuErr } = await supabase
        .from('students')
        .select('id, first_name, last_name')
        .eq('cohort_id', activeCohortId)
        .eq('status', 'active');
      if (stuErr) throw stuErr;

      const studentIds = (activeStudents || []).map((s) => s.id);

      // 3. Readings per student (to find who has zero)
      let readingStudentIds = new Set();
      if (studentIds.length > 0) {
        const { data: readingData, error: rdErr } = await supabase
          .from('readings')
          .select('student_id')
          .in('student_id', studentIds);
        if (rdErr) throw rdErr;
        (readingData || []).forEach((r) => readingStudentIds.add(r.student_id));
      }

      const studentsWithNoVerses = studentIds.filter((id) => !readingStudentIds.has(id));

      // 4. Service elements per student (to find who has zero)
      let elementStudentIds = new Set();
      if (studentIds.length > 0) {
        const { data: elemData, error: elErr } = await supabase
          .from('service_elements')
          .select('student_id')
          .in('student_id', studentIds);
        if (elErr) throw elErr;
        (elemData || []).forEach((e) => elementStudentIds.add(e.student_id));
      }

      const studentsWithNoElements = studentIds.filter((id) => !elementStudentIds.has(id));

      // 5. Family user count (student or parent role profiles)
      const { count: familyUserCount, error: fuErr } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .in('role', ['student', 'parent']);
      if (fuErr) throw fuErr;

      // 6. Pending invitations count
      const { count: pendingInviteCount, error: piErr } = await supabase
        .from('pending_invitations')
        .select('id', { count: 'exact', head: true })
        .is('accepted_at', null);
      if (piErr) throw piErr;

      setData({
        tutorCount: tutorCount || 0,
        pendingTutorCount: pendingTutorCount || 0,
        activeStudents: activeStudents || [],
        noVersesCount: studentsWithNoVerses.length,
        noElementsCount: studentsWithNoElements.length,
        familyUserCount: familyUserCount || 0,
        pendingInviteCount: pendingInviteCount || 0,
        firstNoVersesStudentId: studentsWithNoVerses[0] || null,
        firstNoElementsStudentId: studentsWithNoElements[0] || null,
      });
    } catch (err) {
      console.error('Failed to load checklist data:', err.message);
    } finally {
      setLoading(false);
    }
  }, [activeCohortId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh on window focus (handles returning from another tab/page)
  useEffect(() => {
    function handleFocus() {
      fetchData();
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchData]);

  // ---- Compute steps ----
  function getSteps() {
    if (!data) return [];

    const hasActiveCohort = !!activeCohort;
    const studentCount = data.activeStudents.length;

    return [
      {
        id: 'cohort',
        label: 'Create a cohort',
        complete: hasActiveCohort,
        subtitle: hasActiveCohort
          ? activeCohort.name
          : 'No active cohort yet',
        action: () => onSwitchTab('cohorts'),
        actionLabel: 'Go to Cohorts',
      },
      {
        id: 'tutors',
        label: 'Add your tutors',
        complete: (data.tutorCount + data.pendingTutorCount) >= 1,
        subtitle: (data.tutorCount + data.pendingTutorCount) >= 1
          ? [
              data.tutorCount > 0 ? `${data.tutorCount} active tutor${data.tutorCount !== 1 ? 's' : ''}` : '',
              data.pendingTutorCount > 0 ? `${data.pendingTutorCount} invited` : '',
            ].filter(Boolean).join(', ')
          : 'No tutors added yet',
        action: () => onSwitchTab('tutors'),
        actionLabel: 'Go to Tutors',
      },
      {
        id: 'students',
        label: 'Add students',
        complete: studentCount > 0,
        subtitle: studentCount > 0
          ? `${studentCount} student${studentCount !== 1 ? 's' : ''} added, all assigned to tutors`
          : 'No students in the active cohort',
        action: () => onSwitchTab('students'),
        actionLabel: 'Go to Students',
      },
      {
        id: 'readings',
        label: 'Assign readings',
        complete: studentCount > 0 && data.noVersesCount === 0,
        subtitle: studentCount === 0
          ? 'Add students first'
          : data.noVersesCount === 0
            ? 'All students have readings'
            : `${data.noVersesCount} student${data.noVersesCount !== 1 ? 's' : ''} don\u2019t have readings yet`,
        action: data.firstNoVersesStudentId
          ? () => navigate(`/admin/students/${data.firstNoVersesStudentId}`)
          : () => onSwitchTab('students'),
        actionLabel: data.firstNoVersesStudentId ? 'Set up readings' : 'Go to Students',
      },
      {
        id: 'elements',
        label: 'Review service elements',
        complete: studentCount > 0 && data.noElementsCount === 0,
        subtitle: studentCount === 0
          ? 'Add students first'
          : data.noElementsCount === 0
            ? 'All students have service elements'
            : `${data.noElementsCount} student${data.noElementsCount !== 1 ? 's' : ''} don\u2019t have service elements`,
        action: data.firstNoElementsStudentId
          ? () => navigate(`/admin/students/${data.firstNoElementsStudentId}`)
          : () => onSwitchTab('students'),
        actionLabel: data.firstNoElementsStudentId ? 'Set up elements' : 'Go to Students',
      },
      {
        id: 'invitations',
        label: 'Invite students and guardians',
        complete: data.familyUserCount >= 1 || data.pendingInviteCount >= 1,
        subtitle: (data.familyUserCount >= 1 || data.pendingInviteCount >= 1)
          ? [
              data.familyUserCount > 0 ? `${data.familyUserCount} family account${data.familyUserCount !== 1 ? 's' : ''}` : '',
              data.pendingInviteCount > 0 ? `${data.pendingInviteCount} pending invitation${data.pendingInviteCount !== 1 ? 's' : ''}` : '',
            ].filter(Boolean).join(', ')
          : 'No family accounts or invitations yet',
        action: () => onSwitchTab('users'),
        actionLabel: 'Go to Users',
      },
    ];
  }

  const steps = getSteps();
  const doneCount = steps.filter((s) => s.complete).length;
  const totalSteps = steps.length;
  const allDone = doneCount === totalSteps;

  // ---- Handlers ----
  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? '1' : '');
  }

  async function handleDismiss() {
    if (!userId || !activeCohortId) return;

    try {
      // Read current guidance_dismissed, merge, write back
      const { data: profile, error: readErr } = await supabase
        .from('profiles')
        .select('guidance_dismissed')
        .eq('id', userId)
        .single();
      if (readErr) throw readErr;

      const current = profile?.guidance_dismissed || {};
      const updated = { ...current, admin_checklist_cohort_id: activeCohortId };

      const { error: writeErr } = await supabase
        .from('profiles')
        .update({ guidance_dismissed: updated })
        .eq('id', userId);
      if (writeErr) throw writeErr;

      setDismissed(true);
    } catch (err) {
      console.error('Failed to dismiss checklist:', err.message);
    }
  }

  // ---- Render guards ----
  if (!dismissalLoaded || loading) return null;
  if (dismissed) return null;

  return (
    <div className="setup-checklist card">
      <div className="setup-checklist-header" role="button" tabIndex={0}
        onClick={toggleCollapse}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse(); } }}
        aria-expanded={!collapsed}
      >
        <div className="setup-checklist-header-left">
          <h2 className="setup-checklist-title">Set up your cohort</h2>
          <span className="setup-checklist-counter">{doneCount} of {totalSteps} done</span>
        </div>
        <svg
          className={`setup-checklist-chevron ${collapsed ? '' : 'setup-checklist-chevron-open'}`}
          width="20" height="20" viewBox="0 0 20 20"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 8 10 12 14 8" />
        </svg>
      </div>

      <div className="setup-checklist-progress">
        <div
          className="setup-checklist-progress-fill"
          style={{ width: `${(doneCount / totalSteps) * 100}%` }}
        />
      </div>

      {!collapsed && (
        <>
          <ol className="setup-checklist-steps">
            {steps.map((step, i) => (
              <li
                key={step.id}
                className={`setup-checklist-step ${step.complete ? 'setup-checklist-step-complete' : 'setup-checklist-step-incomplete'}`}
              >
                <span className="setup-checklist-step-marker" aria-hidden="true">
                  {step.complete ? (
                    <CheckIcon />
                  ) : (
                    <span className="setup-checklist-step-number">{i + 1}</span>
                  )}
                </span>
                <div className="setup-checklist-step-body">
                  <span className={`setup-checklist-step-label ${step.complete ? 'setup-checklist-step-struck' : ''}`}>
                    {step.label}
                  </span>
                  <span className="setup-checklist-step-subtitle">{step.subtitle}</span>
                </div>
                {!step.complete && (
                  <button
                    className="btn btn-small btn-outline setup-checklist-step-link"
                    onClick={step.action}
                    type="button"
                  >
                    {step.actionLabel}
                  </button>
                )}
              </li>
            ))}
          </ol>

          {allDone && (
            <div className="setup-checklist-dismiss-area">
              <p className="setup-checklist-dismiss-text">Your cohort is fully configured.</p>
              <button
                className="btn btn-outline btn-small"
                onClick={handleDismiss}
                type="button"
              >
                Dismiss checklist
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---- Icons ----

function CheckIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16"
      fill="none" stroke="var(--color-green)" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}
