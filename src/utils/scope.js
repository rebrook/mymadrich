import { supabase } from '../lib/supabase';
import { ROLES } from './constants';

/**
 * Limits what each VIEW can see, for people who hold more than one role.
 *
 * The database combines everything a person may see across all their roles. An
 * admin who is also a parent can read every student, so asking the database for
 * "my students" in the parent view would return everyone. These helpers say
 * which students (and which benchmark meetings) the CURRENT view should show.
 * They mirror the database's own rules, so for a person with a single role the
 * result is exactly what they saw before.
 */

/** Benchmark meeting statuses every view except admin may see (matches the database rule). */
export const NON_ADMIN_BENCHMARK_STATUSES = ['scheduled', 'completed'];

/**
 * Returns the ids of the students the active view may see, or null for "no limit" (admin).
 *   tutor   -> students assigned to me (student_tutors), any status, like the database
 *   parent  -> students linked to me as a guardian (student_guardians)
 *   student -> my own student record
 * An unknown view sees nobody. Throws if the lookup fails (callers show their usual error).
 *
 * @param {string} role - the active view
 * @param {string} userId - the signed-in person's id
 * @param {object} [client] - Supabase client (defaults to the app's; injectable for tests)
 * @returns {Promise<string[]|null>}
 */
export async function fetchScopedStudentIds(role, userId, client = supabase) {
  if (role === ROLES.ADMIN) return null;
  if (!userId) return [];

  let query;
  let pick;
  if (role === ROLES.TUTOR) {
    query = client.from('student_tutors').select('student_id').eq('tutor_id', userId);
    pick = (row) => row.student_id;
  } else if (role === ROLES.PARENT) {
    query = client.from('student_guardians').select('student_id').eq('user_id', userId);
    pick = (row) => row.student_id;
  } else if (role === ROLES.STUDENT) {
    query = client.from('students').select('id').eq('user_id', userId);
    pick = (row) => row.id;
  } else {
    return [];
  }

  const { data, error } = await query;
  if (error) throw error;
  return Array.from(new Set((data || []).map(pick)));
}

/**
 * Adds the benchmark visibility rule to a benchmark_meetings query: every view
 * except admin sees only scheduled and completed meetings (pending ones are staff-only).
 */
export function limitBenchmarksToVisible(query, role) {
  return role === ROLES.ADMIN ? query : query.in('status', NON_ADMIN_BENCHMARK_STATUSES);
}
