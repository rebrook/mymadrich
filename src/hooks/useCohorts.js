import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Hook for cohort CRUD operations.
 *
 * Returns:
 *   cohorts      - array of cohort objects, each with a studentCount property
 *   loading      - boolean
 *   error        - string or null
 *   refetch      - function to reload cohorts
 *   createCohort - async function(data) to insert a new cohort
 *   updateCohort - async function(id, updates) to update a cohort
 */
export function useCohorts() {
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCohorts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('cohorts')
        .select('*, students(count)')
        .order('created_at', { ascending: false });

      if (err) throw err;

      // Flatten the nested count: students is [{ count: N }]
      const formatted = (data || []).map(c => ({
        ...c,
        studentCount: c.students?.[0]?.count ?? 0,
      }));

      setCohorts(formatted);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCohorts();
  }, [fetchCohorts]);

  async function createCohort({ name, start_date, end_date }) {
    const payload = { name: name.trim() };
    if (start_date) payload.start_date = start_date;
    if (end_date) payload.end_date = end_date;

    const { error: err } = await supabase.from('cohorts').insert(payload);
    if (err) throw err;
    await fetchCohorts();
  }

  async function updateCohort(id, updates) {
    const { error: err } = await supabase
      .from('cohorts')
      .update(updates)
      .eq('id', id);
    if (err) throw err;
    await fetchCohorts();
  }

  return { cohorts, loading, error, refetch: fetchCohorts, createCohort, updateCohort };
}
