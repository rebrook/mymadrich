import { ROLES } from './constants';

/**
 * Role helpers for people who hold more than one role (for example an admin
 * who is also a parent). Pure functions, no side effects.
 *
 * "Granted roles" are what the person holds. The "active role" is the view
 * they are using right now. The rest of the app reads the active role as
 * `role` from useAuth(), so existing role checks keep working unchanged.
 */

/** Roles from highest to lowest privilege. Used for sorting and as the last-resort fallback. */
export const ROLE_ORDER = [ROLES.ADMIN, ROLES.TUTOR, ROLES.PARENT, ROLES.STUDENT];

/** Unique, known roles only, highest privilege first. */
export function sortRoles(roles) {
  const wanted = new Set(roles || []);
  return ROLE_ORDER.filter((r) => wanted.has(r));
}

/** localStorage key for the person's last-used view. Scoped by user so accounts never share it. */
export function activeRoleKey(userId) {
  return `mymadrich:active_role:${userId}`;
}

/**
 * Decides which view to use. In order of preference:
 *   1. the view already in use this session (if the person still holds it)
 *   2. the view they used last time (if they still hold it)
 *   3. their primary role (the role on their profile)
 *   4. their highest-privilege granted role
 * A stored value the person does not actually hold (stale, or edited by hand) is ignored.
 */
export function resolveActiveRole({ roles, current, stored, primary }) {
  const granted = sortRoles(roles);
  if (current && granted.includes(current)) return current;
  if (stored && granted.includes(stored)) return stored;
  if (primary && granted.includes(primary)) return primary;
  return granted[0] || null;
}
