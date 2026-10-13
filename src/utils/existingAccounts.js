import { supabase } from '../lib/supabase';
import { sortRoles } from './roles';
import { ROLE_LABELS } from './constants';

/**
 * Finding people who already have an account, so an invitation can become
 * "add the role to their existing account" instead.
 */

/**
 * Everyone with an account, with the roles they hold (their primary role if the
 * roles lookup has nothing for them).
 *
 * @param {object} [client] - Supabase client (defaults to the app's; injectable for tests)
 * @returns {Promise<Array<{ id: string, email: string, display_name: string, role: string, roles: string[] }>>}
 */
export async function fetchAccounts(client = supabase) {
  const [profileRes, roleRes] = await Promise.all([
    client.from('profiles').select('id, email, display_name, role'),
    client.from('profile_roles').select('profile_id, role'),
  ]);
  if (profileRes.error) throw profileRes.error;
  if (roleRes.error) throw roleRes.error;

  const byProfile = {};
  (roleRes.data || []).forEach((r) => {
    if (!byProfile[r.profile_id]) byProfile[r.profile_id] = [];
    byProfile[r.profile_id].push(r.role);
  });

  return (profileRes.data || []).map((p) => ({
    ...p,
    roles: sortRoles(byProfile[p.id] && byProfile[p.id].length > 0 ? byProfile[p.id] : [p.role]),
  }));
}

/**
 * The account whose email matches (ignoring case and surrounding spaces), or null.
 *
 * @param {Array<{ email: string }>} accounts
 * @param {string} email
 */
export function findAccountByEmail(accounts, email) {
  const key = (email || '').trim().toLowerCase();
  if (!key) return null;
  return (accounts || []).find((a) => (a.email || '').trim().toLowerCase() === key) || null;
}

/** "Administrator, Tutor": roles in plain words for messages. */
export function describeRoles(roles) {
  return (roles || []).map((r) => ROLE_LABELS[r] || r).join(', ');
}
