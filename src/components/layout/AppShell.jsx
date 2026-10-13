import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLES, ROLE_LABELS } from '../../utils/constants';
import SidebarNav from './SidebarNav';
import Footer from './Footer';

/**
 * Main application shell — elevated direction.
 *
 * Desktop >= 1024px:
 *   - Sidebar navigation (icon rail 1024–1279, full labels >= 1280)
 *   - Sticky translucent topbar with page title (Frank Ruhl Libre)
 *
 * Mobile < 1024px:
 *   - Slim mobile header (page title + avatar initial + sign out)
 *   - Fixed bottom tab navigation
 *
 * Content width containers per the design system applied per route.
 * Footer scrolls with content; on mobile it sits above the bottom tab bar.
 *
 * People who hold more than one role (for example an admin who is also a
 * parent) see a "View as" switch: in the sidebar account menu on desktop,
 * and in the header on mobile. `role` is the view in use, so everything
 * below keeps working for whichever view is active.
 */
export default function AppShell() {
  const { profile, role, roles, hasMultipleRoles, switchRole, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [viewMessage, setViewMessage] = useState('');

  const navItems = getNavItems(role);
  const initial = profile?.display_name?.charAt(0)?.toUpperCase() || '?';
  const contentWidthClass = getContentWidthClass(location.pathname);
  const { title, subtitle } = getPageMeta(location.pathname, role);

  function handleSwitchRole(nextRole) {
    if (nextRole === role) return;
    if (switchRole(nextRole)) {
      // Land on the dashboard of the new view. The page below is remounted
      // (see the key on <Outlet />) so no data from the old view lingers.
      navigate('/dashboard');
      setViewMessage('');
      setTimeout(() => setViewMessage(`Now viewing as ${ROLE_LABELS[nextRole]}.`), 50);
    }
  }

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      <div className="sr-only" role="status" aria-live="polite">{viewMessage}</div>

      {/* Desktop sidebar (hidden < 1024px via CSS) */}
      <SidebarNav
        navItems={navItems}
        profile={profile}
        role={role}
        roles={roles}
        onSwitchRole={handleSwitchRole}
        signOut={signOut}
      />

      {/* Desktop topbar (hidden < 1024px via CSS) */}
      <div className="app-content-column">
        <header className="app-topbar">
          <div className="topbar-left">
            <h1 className="topbar-title">{title}</h1>
            {subtitle && <span className="topbar-subtitle">{subtitle}</span>}
          </div>
          <div className="topbar-right">
            {hasMultipleRoles && (
              <span className="view-badge">Viewing as {ROLE_LABELS[role]}</span>
            )}
            <button onClick={signOut} className="btn-ghost" type="button">
              <SignOutSmallIcon />
              Sign out
            </button>
          </div>
        </header>

        {/* Mobile header (hidden >= 1024px via CSS) */}
        <header className="mobile-header">
          <span className="mobile-header-title">{title}</span>
          <div className="mobile-header-right">
            {hasMultipleRoles ? (
              <MobileViewMenu
                initial={initial}
                displayName={profile?.display_name}
                roles={roles}
                activeRole={role}
                onSwitch={handleSwitchRole}
              />
            ) : (
              <span
                className="mobile-header-avatar"
                aria-label={profile?.display_name}
              >
                {initial}
              </span>
            )}
            <button
              onClick={signOut}
              className="mobile-header-signout"
              type="button"
            >
              <SignOutSmallIcon />
              Sign out
            </button>
          </div>
        </header>

        <main className={`app-main ${contentWidthClass}`} id="main-content">
          {/* key={role}: switching view remounts the page so nothing from the old view lingers */}
          <Outlet key={role} />
          <Footer />
        </main>
      </div>

      {/* Mobile bottom tab bar (hidden on desktop via CSS) */}
      <nav className="bottom-nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end || false}
            className={({ isActive }) =>
              `bottom-nav-item${isActive ? ' bottom-nav-item-active' : ''}`
            }
          >
            <span className="bottom-nav-icon">{item.icon}</span>
            <span className="bottom-nav-label">{item.shortLabel || item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}


/* ==========================================================================
   Mobile "View as" menu (only rendered for people with more than one role)
   ========================================================================== */

function MobileViewMenu({ initial, displayName, roles, activeRole, onSwitch }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  // Close on outside tap or Escape; Escape returns focus to the trigger.
  // The ref covers the trigger AND the panel, so tapping an item isn't "outside".
  useEffect(() => {
    if (!open) return undefined;

    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        if (triggerRef.current) triggerRef.current.focus();
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // Move focus to the current view when the menu opens.
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const current = panelRef.current.querySelector('[aria-checked="true"]');
    if (current) current.focus();
  }, [open]);

  function handlePanelKeyDown(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = panelRef.current ? panelRef.current.querySelectorAll('[role="menuitemradio"]') : [];
    if (items.length === 0) return;
    e.preventDefault();
    const idx = Array.from(items).indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next].focus();
  }

  return (
    <div className="view-menu" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="view-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${displayName || 'Account'}. Viewing as ${ROLE_LABELS[activeRole]}. Change view`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="mobile-header-avatar" aria-hidden="true">{initial}</span>
        <span className="view-menu-current">{ROLE_LABELS[activeRole]}</span>
      </button>

      {open && (
        <div
          className="view-menu-panel"
          role="menu"
          aria-label="View as"
          ref={panelRef}
          onKeyDown={handlePanelKeyDown}
        >
          <p className="view-menu-heading" aria-hidden="true">View as</p>
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              role="menuitemradio"
              aria-checked={r === activeRole}
              className="view-menu-item"
              onClick={() => {
                setOpen(false);
                onSwitch(r);
              }}
            >
              <span className="view-menu-check" aria-hidden="true">{r === activeRole ? '\u2713' : ''}</span>
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


/* ==========================================================================
   Helpers
   ========================================================================== */

/**
 * Derive the page title and optional subtitle from the current pathname.
 * The subtitle is role-aware (e.g. admin sees "Manage" context).
 */
function getPageMeta(pathname, role) {
  if (pathname === '/dashboard') {
    return { title: 'Dashboard', subtitle: null };
  }
  if (pathname === '/sessions') {
    return { title: 'Sessions', subtitle: 'History' };
  }
  if (pathname === '/sessions/new') {
    return { title: 'Log session', subtitle: null };
  }
  if (pathname === '/my-week') {
    return { title: 'My Week', subtitle: 'Lesson planning' };
  }
  if (pathname.match(/^\/sessions\/[^/]+\/edit$/)) {
    return { title: 'Edit session', subtitle: null };
  }
  if (pathname === '/admin') {
    const sub = role === ROLES.ADMIN ? 'Manage' : null;
    return { title: 'Admin', subtitle: sub };
  }
  if (pathname.match(/^\/admin\/students\/[^/]+$/)) {
    return { title: 'Student detail', subtitle: null };
  }
  if (pathname === '/admin/calendar') {
    return { title: 'Cohort Calendar', subtitle: 'Planning' };
  }
  return { title: 'MyMadrich', subtitle: null };
}


/* ==========================================================================
   Icon components (20x20 stroke-based SVGs — bespoke set)
   ========================================================================== */

const svgProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

function IconDashboard() {
  return (
    <svg {...svgProps}>
      <rect x="2" y="2" width="7" height="7" rx="1" />
      <rect x="11" y="2" width="7" height="7" rx="1" />
      <rect x="2" y="11" width="7" height="7" rx="1" />
      <rect x="11" y="11" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconSessions() {
  return (
    <svg {...svgProps}>
      <circle cx="10" cy="10" r="8" />
      <polyline points="10,5 10,10 13.5,12.5" />
    </svg>
  );
}

function IconLogSession() {
  return (
    <svg {...svgProps}>
      <circle cx="10" cy="10" r="8" />
      <line x1="10" y1="6" x2="10" y2="14" />
      <line x1="6" y1="10" x2="14" y2="10" />
    </svg>
  );
}

function IconAdmin() {
  return (
    <svg {...svgProps}>
      <circle cx="10" cy="10" r="3" />
      <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6L16 16M4 16l1.4-1.4M14.6 5.4L16 4" />
    </svg>
  );
}

/**
 * Calendar icon — 20x20 stroke-based, matches the bespoke icon set.
 * Grid/calendar with a top bar and date dots.
 */
function IconCalendar() {
  return (
    <svg {...svgProps}>
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <line x1="3" y1="8" x2="17" y2="8" />
      <line x1="7" y1="2" x2="7" y2="5" />
      <line x1="13" y1="2" x2="13" y2="5" />
      <circle cx="7" cy="12" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="10" cy="12" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="13" cy="12" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Week icon — 20x20 stroke-based, 7-column grid row.
 * Represents the tutor's weekly lesson-planning view.
 */
function IconWeek() {
  return (
    <svg {...svgProps}>
      <rect x="2" y="4" width="16" height="12" rx="2" />
      <line x1="2" y1="8" x2="18" y2="8" />
      <line x1="7" y1="2" x2="7" y2="5" />
      <line x1="13" y1="2" x2="13" y2="5" />
      <line x1="6.3" y1="8" x2="6.3" y2="16" />
      <line x1="10" y1="8" x2="10" y2="16" />
      <line x1="13.7" y1="8" x2="13.7" y2="16" />
    </svg>
  );
}

function SignOutSmallIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 14H3.33A1.33 1.33 0 0 1 2 12.67V3.33A1.33 1.33 0 0 1 3.33 2H6" />
      <polyline points="10.67 11.33 14 8 10.67 4.67" />
      <line x1="14" y1="8" x2="6" y2="8" />
    </svg>
  );
}


/**
 * Build nav items for the current role.
 * Each item: { to, label, shortLabel?, icon, end? }
 */
function getNavItems(role) {
  const items = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      shortLabel: 'Home',
      icon: <IconDashboard />,
    },
  ];

  items.push({
    to: '/sessions',
    label: 'Sessions',
    icon: <IconSessions />,
    end: true,
  });

  if (role === ROLES.TUTOR || role === ROLES.ADMIN) {
    items.push({
      to: '/my-week',
      label: 'My Week',
      icon: <IconWeek />,
    });
  }

  if (role === ROLES.TUTOR || role === ROLES.ADMIN) {
    items.push({
      to: '/sessions/new',
      label: 'Log Session',
      shortLabel: 'Log',
      icon: <IconLogSession />,
    });
  }

  if (role === ROLES.ADMIN) {
    items.push({
      to: '/admin',
      label: 'Admin',
      icon: <IconAdmin />,
      end: true,
    });
    items.push({
      to: '/admin/calendar',
      label: 'Calendar',
      icon: <IconCalendar />,
    });
  }

  return items;
}


/**
 * Map pathname to content width container class.
 *   Dashboard:      1080px (content-dashboard)
 *   Form:           760px  (content-form) — Log Session, Edit Session
 *   Table:          1200px (content-table) — Admin tabs, Session History
 *   StudentDetail:  1080px (content-dashboard)
 *   Calendar:       1080px (content-dashboard) — Cohort Calendar
 *   Fallback:       1080px (content-dashboard)
 */
function getContentWidthClass(pathname) {
  if (pathname === '/dashboard') return 'content-dashboard';
  if (pathname === '/sessions') return 'content-table';
  if (pathname === '/my-week') return 'content-dashboard';
  if (pathname === '/sessions/new') return 'content-form';
  if (pathname.match(/^\/sessions\/[^/]+\/edit$/)) return 'content-form';
  if (pathname === '/admin') return 'content-table';
  if (pathname.match(/^\/admin\/students\/[^/]+$/)) return 'content-dashboard';
  if (pathname === '/admin/calendar') return 'content-dashboard';
  return 'content-dashboard';
}
