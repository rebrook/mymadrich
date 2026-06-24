import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';

/**
 * Branded error boundary page (v2 Session H).
 *
 * Registered as errorElement on the data router's root route so it
 * catches all unhandled render errors, including those that occur
 * before AuthProvider mounts. Imports nothing from context.
 */
export default function ErrorPage() {
  const error = useRouteError();

  // Build a human-readable status line for route-level errors (404, etc.)
  let heading = 'Something went wrong';
  let message = 'An unexpected error occurred. You can try reloading the page or returning to the dashboard.';

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      heading = 'Page not found';
      message = 'The page you were looking for doesn\u2019t exist. It may have been moved or removed.';
    } else {
      heading = `Error ${error.status}`;
    }
  }

  // Technical detail string (collapsed, never shown by default)
  const technicalDetail = error?.stack
    || error?.data
    || error?.message
    || (typeof error === 'string' ? error : null);

  return (
    <div className="error-page">
      <div className="error-page-card card">
        <span className="error-page-brand" aria-hidden="true">MyMadrich</span>
        <h1 className="error-page-heading">{heading}</h1>
        <p className="error-page-message">{message}</p>
        <div className="error-page-actions">
          <Link to="/dashboard" className="btn btn-primary">Back to Dashboard</Link>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
        {technicalDetail && (
          <details className="error-page-details">
            <summary>Technical details</summary>
            <pre className="error-page-pre">{technicalDetail}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
