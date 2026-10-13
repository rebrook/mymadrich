import { supabase } from '../lib/supabase';

/**
 * Looking people up by the roles they HOLD.
 *
 * A person's profile has one "primary" role, but they can hold several (an
 * administrator who also tutors, for example). Anything that lists "all the
 * tutors" must ask which people hold the tutor role, not which people have
 * tutor as their primary role, or the administrator who tutors is missed.
 * For a person with a single role the result is the same as before.
 */

/**
 * Ids of everyone who holds `role`, whatever else they also hold.
 *
 * @param {string} role - 'admin' | 'tutor' | 'parent' | 'student'
 * @param {object} [client] - Supabase client (defaults to the app's; injectable for tests)
 * @returns {Promise<string[]>}
 */
export async function fetchProfileIdsWithRole(role, client = supabase) {
  const { data, error } = await client
    .from('profile_roles')
    .select('profile_id')
    .eq('role', role);
  if (error) throw error;
  return Array.from(new Set((data || []).map((r) => r.profile_id)));
}

/**
 * The roles each of the given people holds.
 *
 * @param {string[]} profileIds
 * @param {object} [client]
 * @returns {Promise<Object<string, string[]>>} map of profile id to roles
 */
export async function fetchRolesByProfile(profileIds, client = supabase) {
  const byProfile = {};
  if (!profileIds || profileIds.length === 0) return byProfile;

  const { data, error } = await client
    .from('profile_roles')
    .select('profile_id, role')
    .in('profile_id', profileIds);
  if (error) throw error;

  (data || []).forEach((r) => {
    if (!byProfile[r.profile_id]) byProfile[r.profile_id] = [];
    byProfile[r.profile_id].push(r.role);
  });
  return byProfile;
}
