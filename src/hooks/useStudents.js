import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Hook for student list operations.
 *
 * Params:
 *   cohortId - optional UUID string; when set, filters students to this cohort
 *
 * Returns:
 *   students      - array of student objects with nested tutor and cohort names
 *   loading       - boolean
 *   error         - string or null
 *   refetch       - function to reload students
 *   createStudent - async function(data) to insert a new student
 *   updateStudent - async function(id, updates) to update a student
 *   deleteStudent - async function(id) to delete a student
 *   archiveStudent - async function(id) to soft-archive a student via RPC
 *   restoreStudent - async function(id) to restore an archived student via RPC
 */
export function useStudents(cohortId) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('students')
        .select(`
          *,
          tutor:profiles!tutor_id ( display_name, email ),
          cohort:cohorts!cohort_id ( name, is_active ),
          student_tutors ( tutor_id, created_at, tutor:profiles!tutor_id ( id, display_name, email ) )
        `)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true });

      if (cohortId) {
        query = query.eq('cohort_id', cohortId);
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setStudents(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  async function createStudent(studentData) {
    const { data, error: err } = await supabase
      .from('students')
      .insert(studentData)
      .select()
      .single();
    if (err) throw err;
    await fetchStudents();
    return data;
  }

  async function updateStudent(id, updates) {
    const { error: err } = await supabase
      .from('students')
      .update(updates)
      .eq('id', id);
    if (err) throw err;
    await fetchStudents();
  }

  async function deleteStudent(id) {
    const { error: err } = await supabase
      .from('students')
      .delete()
      .eq('id', id);
    if (err) throw err;
    await fetchStudents();
  }

  /**
   * Archive a student via the admin-only RPC function.
   * Sets status = 'archived'; preserves all data.
   *
   * @param {string} id - Student UUID
   */
  async function archiveStudent(id) {
    const { error: err } = await supabase.rpc('archive_student', {
      p_student_id: id,
    });
    if (err) throw err;
    await fetchStudents();
  }

  /**
   * Restore an archived student back to active via the admin-only RPC function.
   *
   * @param {string} id - Student UUID
   */
  async function restoreStudent(id) {
    const { error: err } = await supabase.rpc('restore_student', {
      p_student_id: id,
    });
    if (err) throw err;
    await fetchStudents();
  }

  /**
   * Apply the same update to multiple students in one round-trip.
   * Uses .in('id', ids) so RLS still applies per-row.
   *
   * @param {string[]} ids - Array of student UUIDs to update.
   * @param {Object} updates - Column values to set (same for all).
   * @throws {Error} If the Supabase update fails.
   */
  async function batchUpdate(ids, updates) {
    if (!ids || ids.length === 0) return;
    const { error: err } = await supabase
      .from('students')
      .update(updates)
      .in('id', ids);
    if (err) throw err;
    await fetchStudents();
  }

  return {
    students,
    loading,
    error,
    refetch: fetchStudents,
    createStudent,
    updateStudent,
    deleteStudent,
    archiveStudent,
    restoreStudent,
    batchUpdate,
  };
}

/**
 * Fetch all tutors for the assignment picker.
 *
 * Returns a unified list of:
 *   1. Profile tutors (role='tutor', already signed in) — source: 'profile'
 *   2. Pending tutor invitations (not yet signed in) — source: 'pending'
 *
 * Deduplication: if the same email exists as both a profile and a pending
 * invitation, the profile row wins and the pending row is excluded.
 *
 * Each returned object has:
 *   { id, display_name, email, is_active, source }
 *
 * For profile tutors, `id` is profiles.id.
 * For pending tutors, `id` is pending_invitations.id (the invitation UUID).
 * The caller MUST carry `source` alongside `id` so that add/remove handlers
 * write to the correct table (student_tutors vs pending_tutor_assignments).
 *
 * @param {Object} [options]
 * @param {boolean} [options.includeInactive=false] - When true, returns
 *   deactivated tutors as well (for admin filter views). By default only
 *   active tutors are returned.
 */
export async function fetchTutors({ includeInactive = false } = {}) {
  // 1. Profile tutors (existing behavior)
  let profileQuery = supabase
    .from('profiles')
    .select('id, display_name, email, is_active')
    .eq('role', 'tutor')
    .order('display_name');

  if (!includeInactive) {
    profileQuery = profileQuery.eq('is_active', true);
  }

  const { data: profileTutors, error: profileErr } = await profileQuery;
  if (profileErr) throw profileErr;

  // Tag each profile tutor with source
  const profiles = (profileTutors || []).map((t) => ({
    ...t,
    source: 'profile',
  }));

  // 2. Pending tutor invitations (not yet signed in)
  const { data: pendingInvitations, error: pendingErr } = await supabase
    .from('pending_invitations')
    .select('id, display_name, email')
    .eq('intended_role', 'tutor')
    .is('accepted_at', null)
    .order('display_name');

  if (pendingErr) throw pendingErr;

  // Build a set of lowercase emails from profile tutors for dedup
  const profileEmails = new Set(
    profiles.map((t) => (t.email || '').toLowerCase()).filter(Boolean)
  );

  // Tag each pending invitation with source, excluding duplicates
  const pending = (pendingInvitations || [])
    .filter((inv) => !profileEmails.has((inv.email || '').toLowerCase()))
    .map((inv) => ({
      id: inv.id,
      display_name: inv.display_name || null,
      email: inv.email,
      is_active: true, // conceptually active (invitation is live)
      source: 'pending',
    }));

  // 3. Return unified list: profiles first, then pending
  return [...profiles, ...pending];
}

/**
 * Fetch pending tutor assignments for a specific student.
 * Returns invitation details for each staged assignment.
 *
 * @param {string} studentId - Student UUID
 * @returns {Array} Array of { id, invitation_id, student_id, created_at,
 *   invitation: { id, display_name, email } }
 */
export async function fetchPendingTutorAssignments(studentId) {
  const { data, error } = await supabase
    .from('pending_tutor_assignments')
    .select(`
      id,
      invitation_id,
      student_id,
      created_at,
      invitation:pending_invitations!invitation_id (
        id, display_name, email
      )
    `)
    .eq('student_id', studentId)
    .order('created_at');

  if (error) throw error;
  return data || [];
}
