import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/** How long to wait for `role` to arrive after `loading` clears before
 *  treating profile sync as failed (ms). */
const ROLE_SYNC_GRACE_PERIOD = 8_000;

/**
 * Wraps a route that requires authentication and (optionally) a specific role.
 *
 * Usage:
 *   <Route element={<ProtectedRoute />}> ... child routes ... </Route>
 *   <Route element={<ProtectedRoute allowedRoles={['admin', 'tutor']} />}> ... </Route>
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, role, loading, signOut } = useAuth();
  const [roleTimedOut, setRoleTimedOut] = useState(false);

  // Give a short grace period for `role` to arrive after `loading` clears
  // (AuthContext's own safety timeout can force loading=false while
  // fetchProfile is still legitimately in flight on a slow connection).
  // Only start the timer while we're actually in the "waiting on role" state.
  useEffect(() => {
    if (loading || !user || role) {
      setRoleTimedOut(false);
      return;
    }

    const timer = setTimeout(() => setRoleTimedOut(true), ROLE_SYNC_GRACE_PERIOD);
    return () => clearTimeout(timer);
  }, [loading, user, role]);

  if (loading) {
    return (
      <div className="loading-screen">
        <p>Loading&hellip;</p>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated but role not yet loaded (profile might still be syncing)
  if (!role) {
    if (roleTimedOut) {
      return (
        <div className="auth-error-screen">
          <div className="auth-error-card">
            <h2 className="auth-error-title">We couldn&rsquo;t load your profile</h2>
            <p className="auth-error-message">
              This can happen after a network hiccup. Try again, or sign out
              and back in.
            </p>
            <div className="auth-error-actions">
              <button
                type="button"
                className="auth-error-retry"
                onClick={() => window.location.reload()}
              >
                Try Again
              </button>
              <button
                type="button"
                className="auth-error-signout"
                onClick={() => signOut()}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="loading-screen">
        <p>Loading profile&hellip;</p>
      </div>
    );
  }

  // Authenticated but wrong role
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
