import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { formatDateShort } from '../../utils/datetime';
import { tutorName } from '../../utils/people';
import { formatMasterySummary } from '../../utils/mastery';
import {
  buildNudgeTutorMailto,
  buildFamilyCheckinMailto,
  buildUpcomingReminderMailto,
  resolvePrimaryGuardianContact,
} from '../../utils/mailto';

const ALERT_TYPES = {
  critical: { label: 'Critical Pace', color: '#c53030', priority: 1, severity: true },
  behind: { label: 'Behind Pace', color: '#d96c2e', priority: 2, severity: true },
  stale: { label: 'No Session in 14+ Days', color: '#d96c2e', priority: 3, severity: false },
  no_sessions: { label: 'No Sessions Logged', color: '#d97706', priority: 4, severity: false },
  upcoming: { label: 'Mitzvah Within 4 Weeks', color: '#2563eb', priority: 5, severity: false },
  no_readings: { label: 'No Readings Assigned', color: '#d97706', priority: 6, severity: false },
};

const CHIP_CAP = 6;
const STORAGE_KEY = 'mymadrich_alerts_collapsed';

function formatDate(dateStr) {
  return formatDateShort(dateStr);
}

// ---- Alert Chip Action Menu ----

/**
 * Action menu for an alert chip. Desktop: dropdown below the chip.
 * Mobile: bottom sheet overlay with 44px touch targets.
 */
function AlertChipMenu({ alert, alertType, lastSessionMap, onClose }) {
  const menuRef = useRef(null);
  const student = alert.student;
  const studentFullName = `${student.first_name} ${student.last_name}`;

  // Focus first item on mount
  useEffect(() => {
    const first = menuRef.current?.querySelector('[role="menuitem"]');
    if (first) first.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Close on outside click (for desktop dropdown)
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    }
    // Delay to avoid catching the opening click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  // Build mailto links
  const tutorDisplayName = tutorName(student.tutor, '');
  const tutorEmail = student.tutor?.email || '';
  const guardianContact = resolvePrimaryGuardianContact(student.student_guardians || []);

  const lastSession = lastSessionMap[student.id] || null;

  const nudgeMailto = tutorEmail
    ? buildNudgeTutorMailto({
        tutorEmail,
        tutorDisplayName,
        studentFullName,
        lastSessionDate: lastSession,
      })
    : '';

  // Choose family template based on alert type
  let familyMailto = '';
  if (guardianContact) {
    if (alertType === 'upcoming') {
      familyMailto = buildUpcomingReminderMailto({
        guardianEmail: guardianContact.email,
        guardianName: guardianContact.name,
        studentFirstName: student.first_name,
        bimahDate: student.mitzvah_date,
        daysUntil: alert.daysUntil || 0,
      });
    } else {
      familyMailto = buildFamilyCheckinMailto({
        guardianEmail: guardianContact.email,
        guardianName: guardianContact.name,
        studentFirstName: student.first_name,
        bimahDate: student.mitzvah_date,
      });
    }
  }

  function handleEmailTutor() {
    if (nudgeMailto) window.open(nudgeMailto, '_self');
    onClose();
  }

  function handleEmailFamily() {
    if (familyMailto) window.open(familyMailto, '_self');
    onClose();
  }

  function handleKeyNav(e) {
    const items = menuRef.current?.querySelectorAll('[role="menuitem"]');
    if (!items) return;
    const idx = Array.from(items).indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    }
  }

  const actions = [
    {
      label: nudgeMailto ? 'Email tutor' : 'Email tutor (no email)',
      icon: '\u2709',
      onClick: handleEmailTutor,
      disabled: !nudgeMailto,
    },
    {
      label: familyMailto ? 'Email family' : 'Email family (no email)',
      icon: '\u2709',
      onClick: handleEmailFamily,
      disabled: !familyMailto,
    },
  ];

  return (
    <>
      {/* Mobile: backdrop overlay */}
      <div className="alert-menu-backdrop" onClick={onClose} />

      <div
        ref={menuRef}
        className="alert-menu"
        role="menu"
        aria-label={`Actions for ${studentFullName}`}
        onKeyDown={handleKeyNav}
      >
        <div className="alert-menu-header">
          <span className="alert-menu-student">{studentFullName}</span>
          <button
            className="alert-menu-close"
            type="button"
            onClick={onClose}
            aria-label="Close menu"
          >
            {'\u2715'}
          </button>
        </div>
        {actions.map((action) => (
          <button
            key={action.label}
            className="alert-menu-item"
            role="menuitem"
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
          >
            <span className="alert-menu-item-icon" aria-hidden="true">{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

// ---- Main AlertsPanel ----

/**
 * AlertsPanel v3 (Session 15)
 *
 * Builds on v2: adds actionable chip menus with Jump, Email Tutor,
 * Email Family actions. Existing alert computation, grouping, counts,
 * collapsed state, and "+N more" logic are all untouched.
 *
 * New prop requirement: students array must include
 *   tutor:profiles!tutor_id(display_name, email)
 *   student_guardians(name, email, is_primary)
 * for the email actions to work. If missing, email actions are disabled.
 */
export default function AlertsPanel({ students, paceMap, lastSessionMap, progressMap, onSelectStudent }) {
  // Compute alert groups (UNCHANGED from v2)
  const { alertGroups, groupKeys, totalAlerts, hasSeverity } = useMemo(() => {
    if (!students?.length) return { alertGroups: {}, groupKeys: [], totalAlerts: 0, hasSeverity: false };

    const alerts = [];
    const today = new Date();

    students.forEach((s) => {
      if (s.status !== 'active' && s.status !== 'deferred') return;

      const paceData = paceMap[s.id];
      const paceStatus = paceData?.pace?.status;
      const lastSession = lastSessionMap[s.id];
      const progress = progressMap[s.id];

      // Family-tutored students are taught off-system, so sessions and
      // progress are not logged here. Pace, staleness, and missing-work
      // alerts would always fire for them, so they are suppressed. The
      // informational "upcoming" alert is kept.
      const suppressProgressAlerts = Boolean(s.family_tutored);

      // Once the mitzvah date has passed, the event happened — treat it
      // as a celebration, not something to audit. Pace, staleness, and
      // missing-work alerts no longer apply. ("upcoming" already can't
      // fire here since it requires daysUntil > 0.)
      const mitzvahHasPassed = s.mitzvah_date && new Date(s.mitzvah_date + 'T00:00:00') < today;
      if (mitzvahHasPassed) return;

      if (paceStatus === 'critical' && !suppressProgressAlerts) {
        alerts.push({ type: 'critical', student: s, detail: paceData.pace, progress });
      }

      if (paceStatus === 'behind' && !suppressProgressAlerts) {
        alerts.push({ type: 'behind', student: s, detail: paceData.pace, progress });
      }

      if (lastSession && !suppressProgressAlerts) {
        const sessionDate = new Date(lastSession + 'T00:00:00');
        const daysSince = Math.floor((today - sessionDate) / (1000 * 60 * 60 * 24));
        if (daysSince > 14) {
          alerts.push({ type: 'stale', student: s, daysSince });
        }
      }

      if (!lastSession && progress && progress.total > 0 && !suppressProgressAlerts) {
        alerts.push({ type: 'no_sessions', student: s });
      }

      if (s.mitzvah_date) {
        const mitzvah = new Date(s.mitzvah_date + 'T00:00:00');
        const daysUntil = Math.floor((mitzvah - today) / (1000 * 60 * 60 * 24));
        if (daysUntil > 0 && daysUntil <= 28) {
          alerts.push({ type: 'upcoming', student: s, daysUntil, mitzvahDate: s.mitzvah_date });
        }
      }

      if (s.status === 'active' && (!progress || progress.total === 0) && !suppressProgressAlerts) {
        alerts.push({ type: 'no_readings', student: s });
      }
    });

    const groups = {};
    alerts.forEach((a) => {
      if (!groups[a.type]) groups[a.type] = [];
      groups[a.type].push(a);
    });

    const keys = Object.keys(groups).sort(
      (a, b) => (ALERT_TYPES[a]?.priority || 99) - (ALERT_TYPES[b]?.priority || 99)
    );

    const total = keys.reduce((sum, key) => sum + groups[key].length, 0);
    const severity = keys.some((k) => ALERT_TYPES[k]?.severity);

    return { alertGroups: groups, groupKeys: keys, totalAlerts: total, hasSeverity: severity };
  }, [students, paceMap, lastSessionMap, progressMap]);

  // Collapsed state with localStorage persistence
  const getInitialCollapsed = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) return stored === 'true';
    } catch {
      // localStorage unavailable
    }
    return !hasSeverity;
  }, [hasSeverity]);

  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // localStorage unavailable
    }
  }, [collapsed]);

  // Track expanded groups for "+N more"
  const [expandedGroups, setExpandedGroups] = useState({});

  function toggleGroupExpand(type) {
    setExpandedGroups((prev) => ({ ...prev, [type]: !prev[type] }));
  }

  // Track which chip's action menu is open: "type-studentId" or null
  const [openMenuKey, setOpenMenuKey] = useState(null);

  function handleChipClick(type, studentId) {
    const key = `${type}-${studentId}`;
    setOpenMenuKey((prev) => (prev === key ? null : key));
  }

  function closeMenu() {
    setOpenMenuKey(null);
  }

  if (totalAlerts === 0) return null;

  const accentStyle = hasSeverity
    ? { borderLeftColor: groupKeys.includes('critical') ? '#c53030' : '#d96c2e' }
    : {};

  return (
    <div
      className={`alerts-panel card ${hasSeverity ? 'alerts-panel-accent' : ''}`}
      style={accentStyle}
    >
      <button className="alerts-panel-header" type="button" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
        <div className="alerts-panel-title">
          <span className="alerts-panel-icon" aria-hidden="true">{'\u26A0'}</span>
          <h3>
            Alerts
            <span className="alerts-panel-count">{totalAlerts}</span>
          </h3>
        </div>
        <span
          className="alerts-panel-toggle"
          aria-hidden="true"
        >
          {collapsed ? '\u25B6' : '\u25BC'}
        </span>
      </button>

      {!collapsed && (
        <div className="alerts-panel-body">
          {groupKeys.map((type) => {
            const config = ALERT_TYPES[type];
            const items = alertGroups[type];
            const isExpanded = expandedGroups[type];
            const visibleItems = isExpanded ? items : items.slice(0, CHIP_CAP);
            const hiddenCount = items.length - CHIP_CAP;

            return (
              <div key={type} className="alerts-group">
                <div className="alerts-group-header">
                  <span
                    className="alerts-group-dot"
                    style={{ backgroundColor: config.color }}
                  />
                  <span className="alerts-group-label">{config.label}</span>
                  <span className="alerts-group-count">({items.length})</span>
                </div>
                <div className="alerts-group-items">
                  {visibleItems.map((alert) => {
                    const chipKey = `${type}-${alert.student.id}`;
                    const isOpen = openMenuKey === chipKey;

                    return (
                      <div key={chipKey} className="alerts-chip-wrapper">
                        <div className={`alerts-item ${isOpen ? 'alerts-item-active' : ''}`}>
                          <button
                            className="alerts-item-name-btn"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectStudent(alert.student.id);
                            }}
                          >
                            <span className="alerts-item-name">
                              {alert.student.first_name} {alert.student.last_name}
                            </span>
                            {type === 'stale' && (
                              <span className="alerts-item-detail">{alert.daysSince} days ago</span>
                            )}
                            {type === 'upcoming' && (
                              <span className="alerts-item-detail">{formatDate(alert.mitzvahDate)} ({alert.daysUntil}d)</span>
                            )}
                            {(type === 'critical' || type === 'behind') && alert.progress && alert.progress.total > 0 && (
                              <span className="alerts-item-detail">
                                {formatMasterySummary(alert.progress)}
                              </span>
                            )}
                          </button>
                          <button
                            className="alerts-item-menu-btn"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChipClick(type, alert.student.id);
                            }}
                            aria-haspopup="menu"
                            aria-expanded={isOpen}
                            aria-label={`More actions for ${alert.student.first_name} ${alert.student.last_name}`}
                          >
                            <span aria-hidden="true">{'\u22EE'}</span>
                          </button>
                        </div>

                        {isOpen && (
                          <AlertChipMenu
                            alert={alert}
                            alertType={type}
                            lastSessionMap={lastSessionMap}
                            onClose={closeMenu}
                          />
                        )}
                      </div>
                    );
                  })}
                  {!isExpanded && hiddenCount > 0 && (
                    <button
                      className="alerts-item alerts-item-more"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroupExpand(type);
                      }}
                    >
                      +{hiddenCount} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
