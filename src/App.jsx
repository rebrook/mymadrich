import { createBrowserRouter, RouterProvider, Outlet, Navigate, useMatches, ScrollRestoration } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AppShell from './components/layout/AppShell';
import LoginPage from './components/auth/LoginPage';
import Dashboard from './pages/Dashboard';
import AdminPage from './pages/AdminPage';
import StudentDetailPage from './pages/StudentDetailPage';
import LogSessionPage from './pages/LogSessionPage';
import SessionHistoryPage from './pages/SessionHistoryPage';
import RoadToBimah from './pages/RoadToBimah';
import CohortCalendar from './pages/CohortCalendar';
import TutorMyWeek from './pages/TutorMyWeek';
import ErrorPage from './components/layout/ErrorPage';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfUse from './pages/TermsOfUse';
import About from './pages/About';
import { ROLES } from './utils/constants';
import './benchmarks.css';
import './legal.css';
import './about.css';

/**
 * Root layout: provides AuthContext and route-level page titles.
 *
 * Page titles are driven by route handle.title (data router pattern).
 * This fires reliably on every route change, unlike useEffect-based
 * hooks in child components which can have timing issues with
 * createBrowserRouter transitions. Individual pages can still override
 * via usePageTitle for dynamic titles (e.g., student names).
 */
function RootLayout() {
  const matches = useMatches();
  const deepestTitle = [...matches].reverse().find((m) => m.handle?.title)?.handle?.title;

  useEffect(() => {
    if (deepestTitle) {
      document.title = `${deepestTitle} - MyMadrich`;
    }
  }, [deepestTitle]);

  return (
    <AuthProvider>
      <Outlet />
      {/* New pages open at the top; Back/Forward restores the previous
          scroll position. Without this, a SPA keeps the old page's scroll
          offset, so a link clicked from a scrolled page opens far down. */}
      <ScrollRestoration />
    </AuthProvider>
  );
}

const router = createBrowserRouter(
  [
    {
      element: <RootLayout />,
      errorElement: <ErrorPage />,
      children: [
        /* Public routes */
        { path: '/login', element: <LoginPage />, handle: { title: 'Login' } },
        { path: '/privacy', element: <PrivacyPolicy />, handle: { title: 'Privacy Policy' } },
        { path: '/terms', element: <TermsOfUse />, handle: { title: 'Terms of Use' } },
        { path: '/about', element: <About />, handle: { title: 'About' } },

        /* Protected routes (any authenticated user) */
        {
          element: (
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          ),
          children: [
            { path: '/dashboard', element: <Dashboard />, handle: { title: 'Dashboard' } },

            /* Road to the Bimah: ceremonial timeline (family-focused, any role) */
            { path: '/road-to-the-bimah', element: <RoadToBimah />, handle: { title: 'Road to the Bimah' } },

            /* Session History: all authenticated roles */
            { path: '/sessions', element: <SessionHistoryPage />, handle: { title: 'Session History' } },

            /* My Week: tutor lesson-planning cockpit */
            {
              path: '/my-week',
              handle: { title: 'My Week' },
              element: (
                <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.TUTOR]}>
                  <TutorMyWeek />
                </ProtectedRoute>
              ),
            },

            /* Log new session: Tutor and Admin only */
            {
              path: '/sessions/new',
              handle: { title: 'Log Session' },
              element: (
                <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.TUTOR]}>
                  <LogSessionPage />
                </ProtectedRoute>
              ),
            },

            /* Edit existing session: Tutor and Admin only */
            {
              path: '/sessions/:sessionId/edit',
              handle: { title: 'Edit Session' },
              element: (
                <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.TUTOR]}>
                  <LogSessionPage />
                </ProtectedRoute>
              ),
            },

            /* Admin-only routes */
            {
              path: '/admin',
              handle: { title: 'Admin Setup' },
              element: (
                <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
                  <AdminPage />
                </ProtectedRoute>
              ),
            },
            {
              path: '/admin/students/:studentId',
              handle: { title: 'Student Detail' },
              element: (
                <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
                  <StudentDetailPage />
                </ProtectedRoute>
              ),
            },
            {
              path: '/admin/calendar',
              handle: { title: 'Cohort Calendar' },
              element: (
                <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
                  <CohortCalendar />
                </ProtectedRoute>
              ),
            },
          ],
        },

        /* Unauthorized page */
        {
          path: '/unauthorized',
          handle: { title: 'Access Denied' },
          element: (
            <div className="page">
              <h2>Access Denied</h2>
              <p>You do not have permission to view this page.</p>
            </div>
          ),
        },

        /* Default redirect */
        { path: '*', element: <Navigate to="/dashboard" replace /> },
      ],
    },
  ],
  { basename: '/' }
);

export default function App() {
  return <RouterProvider router={router} />;
}
