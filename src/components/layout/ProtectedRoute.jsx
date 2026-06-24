import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Wraps a route that requires authentication and (optionally) a specific role.
 *
 * Usage:
 *   <Route element={<ProtectedRoute />}> ... child routes ... </Route>
 *   <Route element={<ProtectedRoute allowedRoles={['admin', 'tutor']} />}> ... </Route>
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, role, loading } = useAuth();

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
