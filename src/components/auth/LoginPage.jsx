import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import emblemGold from '../../assets/chizuk-emblem-gold.png';
import emblemCream from '../../assets/chizuk-emblem-cream.png';
import Footer from '../layout/Footer';
import { COORDINATOR } from '../../utils/contact';

// main.jsx keeps an auth error from the web address here, because the router drops the address
// before this page loads (a refused or locked account comes back to the site root with an error).
const AUTH_ERROR_KEY = 'mymadrich:auth_error';

/**
 * Turn a raw sign-in error into a notice a family can act on.
 *   - A locked (deactivated) account says so.
 *   - A sign-up with no invitation (our own database message) says there is no account.
 *   - Anything else from the sign-in form is shown as it is; anything else that comes back
 *     through the web address gets a plain fallback instead of technical text.
 * The wording lives here, not in the database, so the coordinator's name can be a real email link.
 */
function classifyAuthError(raw, { fromRedirect = false } = {}) {
  const text = String(raw || '');
  if (/banned/i.test(text)) return { kind: 'inactive' };
  if (/no mymadrich account|invitation/i.test(text)) return { kind: 'no-account' };
  return fromRedirect ? { kind: 'redirect-fallback' } : { kind: 'text', text };
}

function CoordinatorLink() {
  return <a href={`mailto:${COORDINATOR.email}`}>{COORDINATOR.name}</a>;
}

/** The words shown for a classified sign-in problem. */
function AuthNotice({ notice }) {
  switch (notice.kind) {
    case 'inactive':
      return (
        <>Your account is inactive. Please contact <CoordinatorLink /> to restore your access.</>
      );
    case 'no-account':
      return (
        <>
          There is currently no MyMadrich account associated with this email. If you were invited
          under a different email address, sign out and try that one, or reach out to{' '}
          <CoordinatorLink /> to update your login information.
        </>
      );
    case 'redirect-fallback':
      return (
        <>
          We couldn&rsquo;t sign you in with that account. If you were invited, please use the email
          address your invitation was sent to. Otherwise, reach out to <CoordinatorLink />.
        </>
      );
    default:
      return notice.text;
  }
}

export default function LoginPage() {
  const { user, loading, signInWithGoogle, signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  usePageTitle('Sign In');

  // Show an error that came back through the web address (see main.jsx)
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(AUTH_ERROR_KEY);
      if (!stored) return;
      sessionStorage.removeItem(AUTH_ERROR_KEY);
      const { description } = JSON.parse(stored);
      setError(classifyAuthError(description, { fromRedirect: true }));
    } catch {
      // Storage unavailable: the page simply shows no extra detail
    }
  }, []);

  // Already logged in — redirect
  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleGoogleSignIn() {
    setError(null);
    await signInWithGoogle();
  }

  async function handleMagicLink(e) {
    e.preventDefault();
    if (!email.trim()) return;

    setError(null);
    setSubmitting(true);
    try {
      await signInWithMagicLink(email.trim());
      setMagicLinkSent(true);
    } catch (err) {
      setError(classifyAuthError(err.message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      {/* ---- Full brand panel: visible at >= 720px ---- */}
      <div className="login-brand-panel" aria-hidden="true">
        <div className="login-brand-inner">
          <img
            className="login-brand-emblem"
            src={emblemGold}
            alt=""
            draggable="false"
          />
          <div className="login-brand-title">MyMadrich</div>
          <div className="login-brand-hebrew">{'\u05DE\u05B7\u05D3\u05B0\u05E8\u05B4\u05D9\u05DA'}</div>
          <p className="login-brand-copy">
            Tracking the journey to the bimah, one verse, one
            blessing, one milestone at a time.
          </p>
        </div>
        <div className="login-brand-footer">
          <img src={emblemCream} alt="" draggable="false" />
          <span>
            A program of<br />
            <strong>Chizuk Amuno</strong> Congregation &amp; Schools
          </span>
        </div>
      </div>

      {/* ---- Compact brand band: visible at < 720px ---- */}
      <div className="login-brand-band" aria-hidden="true">
        <img
          className="login-brand-band-emblem"
          src={emblemGold}
          alt=""
          draggable="false"
        />
        <div className="login-brand-band-title">MyMadrich</div>
        <div className="login-brand-band-hebrew">{'\u05DE\u05B7\u05D3\u05B0\u05E8\u05B4\u05D9\u05DA'}</div>
        <p className="login-brand-band-copy">
          Tracking the journey to the bimah, one verse, one blessing,
          one milestone at a time.
        </p>
      </div>

      {/* ---- Auth panel ---- */}
      <div className="login-auth-panel">
        <div className="login-card">
          <h1 className="login-title">Sign in</h1>
          <p className="login-subtitle">
            Welcome back. Continue the journey to the bimah.
          </p>

          {error && (
            <div className="alert alert-error" role="alert">
              <AuthNotice notice={error} />
            </div>
          )}

          {magicLinkSent ? (
            <div className="alert alert-success" role="status">
              Check your email for a sign-in link. You can close this tab.
            </div>
          ) : (
            <>
              <button
                onClick={handleGoogleSignIn}
                className="btn-google"
                type="button"
              >
                <GoogleIcon />
                Sign in with Google
              </button>

              <div className="login-divider">
                <span>or</span>
              </div>

              <form onSubmit={handleMagicLink} className="magic-link-form">
                <label htmlFor="email" className="sr-only">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="input"
                  autoComplete="email"
                />
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Sending\u2026' : 'Send magic link'}
                </button>
              </form>
            </>
          )}

          <Footer context="login" />
        </div>
      </div>
    </div>
  );
}


/* ---- Google "G" logo ---- */

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"
        fill="#4285F4"
      />
      <path
        d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"
        fill="#34A853"
      />
      <path
        d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"
        fill="#FBBC05"
      />
      <path
        d="M8.98 3.58c1.16 0 2.23.4 3.06 1.2l2.37-2.37A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.9z"
        fill="#EA4335"
      />
    </svg>
  );
}
