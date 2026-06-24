import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { ROLE_LABELS } from '../../utils/constants';
import emblemGold from '../../assets/chizuk-emblem-gold.png';

/**
 * Desktop sidebar navigation — elevated direction.
 *
 * Visible at >= 1024px; hidden below via CSS.
 * 64px icon rail at 1024–1279px; 232px with labels at >= 1280px.
 *
 * Deep --color-primary-dark rail with:
 *   - Gold Chizuk emblem + "MyMadrich" wordmark (Frank Ruhl Libre)
 *   - Nav links: idle lavender, hover white wash, active white + gold left bar
 *   - User footer divided by a hairline, with sign-out flyout
 *   - Faint gold corner ring (CSS ::after, decorative)
 */
export default function SidebarNav({ navItems, profile, role, signOut }) {
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const flyoutRef = useRef(null);
  const triggerRef = useRef(null);

  const initial = profile?.display_name?.charAt(0)?.toUpperCase() || '?';

  // Close flyout on outside click
  const handleOutsideClick = useCallback((e) => {
    if (
      flyoutRef.current &&
      !flyoutRef.current.contains(e.target) &&
      triggerRef.current &&
      !triggerRef.current.contains(e.target)
    ) {
      setFlyoutOpen(false);
    }
  }, []);

  // Close flyout on Escape
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && flyoutOpen) {
      setFlyoutOpen(false);
      triggerRef.current?.focus();
    }
  }, [flyoutOpen]);

  useEffect(() => {
    if (flyoutOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [flyoutOpen, handleOutsideClick, handleKeyDown]);

  function handleSignOut() {
    setFlyoutOpen(false);
    signOut();
  }

  return (
    <aside className="sidebar-nav" aria-label="Main navigation">
      {/* Logo: gold emblem + wordmark */}
      <div className="sidebar-logo">
        <img
          className="sidebar-logo-emblem"
          src={emblemGold}
          alt=""
          draggable="false"
        />
        <span className="sidebar-logo-wordmark">MyMadrich</span>
      </div>

      {/* Nav items */}
      <nav className="sidebar-nav-items">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end || false}
            className={({ isActive }) =>
              `sidebar-nav-link${isActive ? ' sidebar-nav-link-active' : ''}`
            }
            aria-label={item.label}
          >
            <span className="sidebar-nav-link-icon">{item.icon}</span>
            <span className="sidebar-nav-link-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User footer with sign-out flyout */}
      <div className="sidebar-user">
        <button
          ref={triggerRef}
          className="sidebar-user-trigger"
          onClick={() => setFlyoutOpen((prev) => !prev)}
          aria-expanded={flyoutOpen}
          aria-haspopup="true"
          aria-label={`${profile?.display_name}, ${ROLE_LABELS[role]}. Account menu`}
        >
          <span className="sidebar-user-initial">{initial}</span>
          <span className="sidebar-user-info">
            <span className="sidebar-user-name">{profile?.display_name}</span>
            <span className="sidebar-user-role">{ROLE_LABELS[role]}</span>
          </span>
        </button>

        {flyoutOpen && (
          <div className="sidebar-flyout" ref={flyoutRef} role="menu">
            <button
              className="sidebar-flyout-btn"
              onClick={handleSignOut}
              role="menuitem"
            >
              <SignOutIcon />
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function SignOutIcon() {
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
