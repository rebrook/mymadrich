import { useState } from 'react';
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

const TAB_DESCRIPTIONS = {
  students: 'Manage student records, assign tutors, and track cohort membership.',
  cohorts: 'Group students by program year. Archive past cohorts to preserve their data.',
  tutors: 'Tutors appear here after they sign in. Assign the tutor role in the Users tab.',
  users: 'Manage sign-in accounts, assign roles, and link users to student or guardian records.',
};

export default function AdminPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('students');
  const { cohorts, loading: loadingCohorts } = useCohorts();
  usePageTitle('Admin Setup');

  return (
    <div className="page">
      <h1>Admin Setup</h1>

      {/* State-driven setup checklist (v2 Section 14.1) */}
      {!loadingCohorts && user && (
        <SetupChecklist
          cohorts={cohorts}
          onSwitchTab={setActiveTab}
          userId={user.id}
        />
      )}

      <div className="tab-bar" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tab ${activeTab === tab.key ? 'tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`panel-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="page-description" style={{ marginTop: 'var(--space-1)' }}>
        {TAB_DESCRIPTIONS[activeTab]}
      </p>

      <div role="tabpanel" id={`panel-${activeTab}`}>
        {activeTab === 'students' && <StudentTab />}
        {activeTab === 'cohorts' && <CohortTab />}
        {activeTab === 'tutors' && <TutorTab />}
        {activeTab === 'users' && <UsersTab />}
      </div>
    </div>
  );
}
