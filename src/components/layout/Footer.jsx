/**
 * Footer — two-tier, centered, reusable across login and app shell.
 *
 * Props:
 *   context  "app" (default) | "login"
 *
 *   app:   full footer with purple emblem, Chizuk Amuno, all legal links,
 *          Supabase, version + build hash.
 *   login: compact footer (no emblem, no Chizuk Amuno, no Supabase,
 *          no version/build — those live in the brand panel already).
 */
import emblemPurple from '../../assets/chizuk-emblem-purple.png';

const version = import.meta.env.VITE_APP_VERSION || '0.0.0';
const buildHash = import.meta.env.VITE_GIT_SHA || 'dev';

export default function Footer({ context = 'app' }) {
  if (context === 'login') return <LoginFooter />;
  return <AppFooter />;
}


/* ---- App shell: full two-tier footer ---- */

function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer-row app-footer-brand">
        <img
          className="app-footer-emblem"
          src={emblemPurple}
          alt=""
          aria-hidden="true"
          draggable="false"
        />
        <span>Designed &amp; Built by <strong>Brook Creative LLC</strong></span>
        <Sep />
        <span>
          A program of{' '}
          <a
            href="https://www.chizukamuno.org/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <strong>Chizuk Amuno</strong>
          </a>{' '}
          Congregation &amp; Schools
        </span>
        <Sep />
        <a href="#">Privacy</a>
        <Sep />
        <a href="#">Terms</a>
        <Sep />
        <a href="mailto:rebrook@me.com">Support</a>
      </div>
      <div className="app-footer-row app-footer-maker">
        <span>Powered by Claude</span>
        <Sep />
        <span>Supabase</span>
        <Sep />
        <a href="#">about.mymadrich.com</a>
        <Sep />
        <span>Ryan (<a href="mailto:rebrook@me.com">rebrook@me.com</a>)</span>
        <Sep />
        <span className="app-footer-build">
          v{version} &middot; build {buildHash}
        </span>
      </div>
    </footer>
  );
}


/* ---- Login: compact footer ---- */

function LoginFooter() {
  return (
    <footer className="app-footer app-footer-login">
      <div className="app-footer-row app-footer-brand">
        <span>Designed &amp; Built by <strong>Brook Creative LLC</strong></span>
        <Sep />
        <a href="#">Privacy</a>
        <Sep />
        <a href="#">Terms</a>
      </div>
      <div className="app-footer-row app-footer-maker">
        <span>Powered by Claude</span>
        <Sep />
        <a href="#">about.mymadrich.com</a>
        <Sep />
        <span>Ryan (<a href="mailto:rebrook@me.com">rebrook@me.com</a>)</span>
      </div>
    </footer>
  );
}


/* ---- Middot separator ---- */

function Sep() {
  return <span className="app-footer-sep" aria-hidden="true">&middot;</span>;
}
