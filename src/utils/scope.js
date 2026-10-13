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

/** Benchmark meeting statuses the family views (parent and student) may see (matches the database rule). */
export const FAMILY_BENCHMARK_STATUSES = ['scheduled', 'completed'];

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
 * Adds the benchmark visibility rule to a benchmark_meetings query. Staff views (admin, and every
 * tutor assigned to the student) see every row, pending ones included. The family views (parent and
 * student) see only scheduled and completed meetings. Any other view is treated like a family view.
 */
export function limitBenchmarksToVisible(query, role) {
  const isStaffView = role === ROLES.ADMIN || role === ROLES.TUTOR;
  return isStaffView ? query : query.in('status', FAMILY_BENCHMARK_STATUSES);
}
