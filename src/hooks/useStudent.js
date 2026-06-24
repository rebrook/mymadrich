import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Hook for a single student's full detail including all related data.
 *
 * @param {string} studentId - UUID of the student
 * @returns {object} student data, related records, CRUD functions, loading/error state
 */
export function useStudent(studentId) {
  const [student, setStudent] = useState(null);
  const [readings, setReadings] = useState([]);
  const [elements, setElements] = useState([]);
  const [guardians, setGuardians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ---- Fetch all data ----

  const fetchAll = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError(null);
    try {
      // Student with tutor(s) and cohort
      const { data: s, error: sErr } = await supabase
        .from('students')
        .select(`
          *,
          tutor:profiles!tutor_id(id, display_name, email),
          cohort:cohorts!cohort_id(id, name, is_active, coordinator_name, start_date, completion_buffer_weeks, default_lessons_per_week),
          student_tutors(tutor_id, created_at, tutor:profiles!tutor_id(id, display_name, email))
        `)
        .eq('id', studentId)
        .single();
      if (sErr) throw sErr;
      setStudent(s);

      // Readings with nested verses (include override columns)
      const { data: r, error: rErr } = await supabase
        .from('readings')
        .select('*, verses(id, verse_reference, sefaria_url, sort_order)')
        .eq('student_id', studentId)
        .order('sort_order');
      if (rErr) throw rErr;

      // Sort verses within each reading
      const sortedReadings = (r || []).map((reading) => ({
        ...reading,
        verses: (reading.verses || []).sort((a, b) => a.sort_order - b.sort_order),
      }));
      setReadings(sortedReadings);

      // Service elements
      const { data: e, error: eErr } = await supabase
        .from('service_elements')
        .select('*')
        .eq('student_id', studentId)
        .order('category')
        .order('sort_order');
      if (eErr) throw eErr;
      setElements(e || []);

      // Guardians
      const { data: g, error: gErr } = await supabase
        .from('student_guardians')
        .select('*')
        .eq('student_id', studentId)
        .order('sort_order');
      if (gErr) throw gErr;
      setGuardians(g || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ---- Student mutations ----

  async function updateStudent(updates) {
    const { error: err } = await supabase
      .from('students')
      .update(updates)
      .eq('id', studentId);
    if (err) throw err;
    await fetchAll();
  }

  // ---- Reading mutations ----

  async function createReading(readingData, versesData) {
    // Insert the reading
    const { data: reading, error: rErr } = await supabase
      .from('readings')
      .insert({ ...readingData, student_id: studentId })
      .select()
      .single();
    if (rErr) throw rErr;

    // Insert all verses for this reading
    if (versesData && versesData.length > 0) {
      const verseRows = versesData.map((v, i) => ({
        reading_id: reading.id,
        verse_reference: v.reference,
        sefaria_url: v.sefariaUrl || null,
        sort_order: i + 1,
      }));
      const { error: vErr } = await supabase.from('verses').insert(verseRows);
      if (vErr) throw vErr;
    }

    await fetchAll();
    return reading;
  }

  async function deleteReading(readingId) {
    const { error: err } = await supabase
      .from('readings')
      .delete()
      .eq('id', readingId);
    if (err) throw err;
    await fetchAll();
  }

  /**
   * Update a reading's reference and delta its verses via RPC.
   * Admin-only. Preserves verse IDs (and mastery progress) for
   * verses whose reference hasn't changed.
   *
   * @param {string} readingId - UUID of the reading
   * @param {string} reference - New reference string
   * @param {string} sefariaUrl - New Sefaria URL
   * @param {string} readingNotes - Required reason for the override
   * @param {Array<{reference, sefariaUrl}>} newVerses - New verse list
   * @returns {object} { updated, verses_kept, verses_added, verses_removed }
   */
  async function updateReadingOverride(readingId, reference, sefariaUrl, readingNotes, newVerses) {
    const versesPayload = newVerses.map((v, i) => ({
      verse_reference: v.reference,
      sefaria_url: v.sefariaUrl || null,
      sort_order: i + 1,
    }));

    const { data, error: err } = await supabase.rpc('update_reading_with_verse_delta', {
      p_reading_id: readingId,
      p_reference: reference,
      p_sefaria_url: sefariaUrl,
      p_reading_notes: readingNotes,
      p_new_verses: versesPayload,
    });
    if (err) throw err;
    await fetchAll();
    return data;
  }

  /**
   * Revert a reading override. Admin-only.
   * Clears the override flag and audit fields but does not
   * change the reading's reference or verses.
   *
   * @param {string} readingId - UUID of the reading
   */
  async function revertReadingOverride(readingId) {
    const { error: err } = await supabase.rpc('revert_reading_override', {
      p_reading_id: readingId,
    });
    if (err) throw err;
    await fetchAll();
  }

  /**
   * Check which verses in a reading have recorded mastery progress.
   * Used by the UI to warn admins before removing verses with progress.
   *
   * @param {string} readingId - UUID of the reading
   * @returns {Array<{verse_id, verse_reference, quality, last_session_date}>}
   */
  async function checkVersesWithProgress(readingId) {
    const { data, error: err } = await supabase.rpc('check_verses_with_progress', {
      p_reading_id: readingId,
    });
    if (err) throw err;
    return data || [];
  }

  // ---- Service element mutations ----

  async function createElement(elementData) {
    const { error: err } = await supabase
      .from('service_elements')
      .insert({ ...elementData, student_id: studentId });
    if (err) throw err;
    await fetchAll();
  }

  async function deleteElement(elementId) {
    const { error: err } = await supabase
      .from('service_elements')
      .delete()
      .eq('id', elementId);
    if (err) throw err;
    await fetchAll();
  }

  async function updateElement(elementId, updates) {
    const { error: err } = await supabase
      .from('service_elements')
      .update(updates)
      .eq('id', elementId);
    if (err) throw err;
  }

  async function reorderElements(reorderedItems) {
    // Batch update sort_order for a list of { id, sort_order } objects
    for (const item of reorderedItems) {
      const { error: err } = await supabase
        .from('service_elements')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id);
      if (err) throw err;
    }
    await fetchAll();
  }

  async function applyDefaultElements() {
    const { error: err } = await supabase.rpc('create_default_service_elements', {
      p_student_id: studentId,
    });
    if (err) throw err;
    await fetchAll();
  }

  // ---- Guardian mutations ----

  async function createGuardian(guardianData) {
    const { error: err } = await supabase
      .from('student_guardians')
      .insert({ ...guardianData, student_id: studentId });
    if (err) throw err;
    await fetchAll();
  }

  async function updateGuardian(guardianId, updates) {
    const { error: err } = await supabase
      .from('student_guardians')
      .update(updates)
      .eq('id', guardianId);
    if (err) throw err;
    await fetchAll();
  }

  async function deleteGuardian(guardianId) {
    const { error: err } = await supabase
      .from('student_guardians')
      .delete()
      .eq('id', guardianId);
    if (err) throw err;
    await fetchAll();
  }

  return {
    student,
    readings,
    elements,
    guardians,
    loading,
    error,
    refetch: fetchAll,
    updateStudent,
    createReading,
    deleteReading,
    updateReadingOverride,
    revertReadingOverride,
    checkVersesWithProgress,
    createElement,
    deleteElement,
    updateElement,
    reorderElements,
    applyDefaultElements,
    createGuardian,
    updateGuardian,
    deleteGuardian,
  };
}
