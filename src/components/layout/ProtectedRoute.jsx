import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABELS } from '../../utils/constants';
import { ROLE_ORDER } from '../../utils/roles';

/** How long to wait for `role` to arrive after `loading` clears before
 *  treating profile sync as failed (ms). */
const ROLE_SYNC_GRACE_PERIOD = 8_000;

/**
 * Wraps a route that requires authentication and (optionally) a specific role.
 *
 * Usage:
 *   <Route element={<ProtectedRoute />}> ... child routes ... </Route>
 *   <Route element={<ProtectedRoute allowedRoles={['admin', 'tutor']} />}> ... </Route>
 *
 * `role` is the person's active view. If they hold an allowed role but are
 * currently viewing as another, they get an offer to switch instead of a dead end.
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, profile, role, roles, switchRole, loading, signOut } = useAuth();
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

  // A deactivated account. The real lock is on the sign-in itself; this screen covers a
  // session that was already open when the account was deactivated.
  if (profile?.is_active === false) {
    return (
      <div className="auth-error-screen">
        <div className="auth-error-card">
          <h2 className="auth-error-title">Your account is inactive</h2>
          <p className="auth-error-message">
            Please contact the B&rsquo;nai Mitzvah coordinator to restore your access.
          </p>
          <div className="auth-error-actions">
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

  // Authenticated but this view isn't allowed here
  if (allowedRoles && !allowedRoles.includes(role)) {
    // The person may hold an allowed role in another view: offer to switch.
    const offered = ROLE_ORDER.find((r) => allowedRoles.includes(r) && roles.includes(r));
    if (offered) {
      return (
        <SwitchViewPrompt
          currentRole={role}
          offeredRole={offered}
          onSwitch={() => switchRole(offered)}
        />
      );
    }
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}

function SwitchViewPrompt({ currentRole, offeredRole, onSwitch }) {
  const navigate = useNavigate();

  return (
    <div className="auth-error-screen">
      <div className="auth-error-card">
        <h2 className="auth-error-title">Switch view to open this page</h2>
        <p className="auth-error-message">
          You are viewing as {ROLE_LABELS[currentRole]}. This page is available in
          the {ROLE_LABELS[offeredRole]} view.
        </p>
        <div className="auth-error-actions">
          <button type="button" className="auth-error-retry" onClick={onSwitch}>
            Switch to {ROLE_LABELS[offeredRole]} view
          </button>
          <button
            type="button"
            className="auth-error-signout"
            onClick={() => navigate('/dashboard')}
          >
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
