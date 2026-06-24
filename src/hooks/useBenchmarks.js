import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { BENCHMARK_TYPES } from '../utils/constants';

/**
 * Hook for benchmark meetings on a single student.
 *
 * Returns the meeting rows merged with the BENCHMARK_TYPES catalog
 * so callers always get the full sequence with type metadata attached.
 *
 * Admin callers get all rows (including pending).
 * Non-admin callers only see scheduled/completed (enforced by RLS).
 *
 * @param {string} studentId
 * @param {boolean} isAdmin - If true, calls ensure_benchmark_rows on first load
 */
export function useBenchmarks(studentId, isAdmin = false) {
  const [benchmarks, setBenchmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBenchmarks = useCallback(async () => {
    if (!studentId) {
      setBenchmarks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Admin: ensure all 8 rows exist (idempotent)
      if (isAdmin) {
        const { error: ensureErr } = await supabase.rpc('ensure_benchmark_rows', {
          p_student_id: studentId,
        });
        if (ensureErr) throw ensureErr;
      }

      // Fetch rows
      const { data, error: fetchErr } = await supabase
        .from('benchmark_meetings')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at');
      if (fetchErr) throw fetchErr;

      // Merge with type catalog for display metadata + canonical ordering
      const merged = BENCHMARK_TYPES.map((type) => {
        const row = (data || []).find((r) => r.meeting_type === type.key);
        return {
          ...type,
          // DB row fields (null if no row exists, e.g. non-admin without pending rows)
          id: row?.id || null,
          student_id: row?.student_id || studentId,
          scheduled_date: row?.scheduled_date || null,
          start_time: row?.start_time || null,
          end_time: row?.end_time || null,
          location: row?.location || null,
          attendees: row?.attendees || null,
          notes: row?.notes || null,
          status: row?.status || null,
          created_at: row?.created_at || null,
          updated_at: row?.updated_at || null,
        };
      });

      setBenchmarks(merged);
    } catch (err) {
      console.error('useBenchmarks error:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [studentId, isAdmin]);

  useEffect(() => {
    fetchBenchmarks();
  }, [fetchBenchmarks]);

  /**
   * Update a benchmark meeting via the admin RPC.
   * @param {Object} updates - Fields to set (meeting_type required)
   */
  const upsertBenchmark = useCallback(async (updates) => {
    if (!studentId) return;

    try {
      const { error: rpcErr } = await supabase.rpc('upsert_benchmark_meeting', {
        p_student_id: studentId,
        p_meeting_type: updates.meeting_type,
        p_scheduled_date: updates.scheduled_date || null,
        p_start_time: updates.start_time || null,
        p_end_time: updates.end_time || null,
        p_location: updates.location || null,
        p_attendees: updates.attendees || null,
        p_notes: updates.notes || null,
        p_status: updates.status || 'pending',
      });
      if (rpcErr) throw rpcErr;

      // Refetch to get updated state
      await fetchBenchmarks();
    } catch (err) {
      console.error('upsertBenchmark error:', err.message);
      throw err;
    }
  }, [studentId, fetchBenchmarks]);

  return {
    benchmarks,
    loading,
    error,
    upsertBenchmark,
    refetch: fetchBenchmarks,
  };
}
