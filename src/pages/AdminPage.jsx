import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCohorts } from '../hooks/useCohorts';
import usePageTitle from '../hooks/usePageTitle';
import SetupChecklist from '../components/admin/SetupChecklist';
import CohortTab from '../components/admin/CohortTab';
import StudentTab from '../components/admin/StudentTab';
import TutorTab from '../components/admin/TutorTab';
import UsersTab from '../components/admin/UsersTab';

const TABS = [
  { key: 'students', label: 'Students' },
  { key: 'cohorts', label: 'Cohorts' },
  { key: 'tutors', label: 'Tutors' },
  { key: 'users', label: 'Users' },
];

const TAB_KEYS = TABS.map((t) => t.key);

const TAB_DESCRIPTIONS = {
  students: 'Manage student records, assign tutors, and track cohort membership.',
  cohorts: 'Group students by program year. Archive past cohorts to preserve their data.',
  tutors: 'Everyone who holds the tutor role appears here, including administrators who also tutor. Give someone the tutor role in the Users tab.',
  users: 'Manage sign-in accounts, give people one or more roles, and link them to student or guardian records.',
};

export default function AdminPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabRefs = useRef({});
  const { cohorts, loading: loadingCohorts } = useCohorts();
  usePageTitle('Admin Setup');

  // The selected tab lives in the web address (?tab=users), so refresh, Back, and shared links
  // return to it. An unknown value falls back to Students.
  const requestedTab = searchParams.get('tab');
  const activeTab = TAB_KEYS.includes(requestedTab) ? requestedTab : 'students';

  function selectTab(key) {
    if (!TAB_KEYS.includes(key)) return;
    const next = new URLSearchParams(searchParams);
    if (key === 'students') next.delete('tab');
    else next.set('tab', key);
    // replace: switching tabs should not pile up history entries
    setSearchParams(next, { replace: true });
  }

  // Keyboard support for the tab list (arrow keys, Home, End), as screen readers announce it.
  // Only the selected tab is in the Tab order; the arrows move between tabs.
  function handleTabKeyDown(e) {
    const i = TAB_KEYS.indexOf(activeTab);
    let nextIndex = null;
    if (e.key === 'ArrowRight') nextIndex = (i + 1) % TAB_KEYS.length;
    else if (e.key === 'ArrowLeft') nextIndex = (i - 1 + TAB_KEYS.length) % TAB_KEYS.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = TAB_KEYS.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    const key = TAB_KEYS[nextIndex];
    selectTab(key);
    const el = tabRefs.current[key];
    if (el) el.focus();
  }

  return (
    <div className="page">
      <h1>Admin Setup</h1>

      {/* State-driven setup checklist (v2 Section 14.1) */}
      {!loadingCohorts && user && (
        <SetupChecklist
          cohorts={cohorts}
          onSwitchTab={selectTab}
          userId={user.id}
        />
      )}

      <div
        className="tab-bar"
        role="tablist"
        aria-label="Admin sections"
        onKeyDown={handleTabKeyDown}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              ref={(el) => { tabRefs.current[tab.key] = el; }}
              id={`tab-${tab.key}`}
              type="button"
              className={`tab ${isActive ? 'tab-active' : ''}`}
              onClick={() => selectTab(tab.key)}
              role="tab"
              aria-selected={isActive}
              aria-controls={isActive ? 'admin-tabpanel' : undefined}
              tabIndex={isActive ? 0 : -1}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <p className="page-description" style={{ marginTop: 'var(--space-1)' }}>
        {TAB_DESCRIPTIONS[activeTab]}
      </p>

      <div role="tabpanel" id="admin-tabpanel" aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'students' && <StudentTab />}
        {activeTab === 'cohorts' && <CohortTab />}
        {activeTab === 'tutors' && <TutorTab />}
        {activeTab === 'users' && <UsersTab />}
      </div>
    </div>
  );
}
