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
 * Fetch all profiles with role = 'tutor'.
 * Used for populating the tutor assignment dropdown.
 *
 * @param {Object} [options]
 * @param {boolean} [options.includeInactive=false] - When true, returns
 *   deactivated tutors as well (for admin filter views). By default only
 *   active tutors are returned.
 */
export async function fetchTutors({ includeInactive = false } = {}) {
  let query = supabase
    .from('profiles')
    .select('id, display_name, email, is_active')
    .eq('role', 'tutor')
    .order('display_name');

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
