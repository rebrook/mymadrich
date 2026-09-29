import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Hook for fetching and managing session history.
 *
 * Provides:
 * - Paginated session list with verse/element counts
 * - Optional date-range filtering (server-side via .gte/.lte)
 * - Optional all-students mode (drops student_id filter, joins student name)
 * - On-demand detail loading for expanded sessions (with caching)
 * - Session deletion (admin only, enforced at page level)
 * - Configurable page size with "load more" support
 *
 * @param {object} opts
 * @param {string|null} opts.studentId - UUID of the selected student (ignored in allStudents mode)
 * @param {string|null} opts.dateFrom - ISO date string for range start (inclusive), or null
 * @param {string|null} opts.dateTo - ISO date string for range end (inclusive), or null
 * @param {boolean} opts.allStudents - When true, fetch across all students (RLS scopes by role)
 * @param {number} opts.initialPageSize - Initial number of sessions to display (default 10)
 * @returns {object} sessions, controls, detail data, loading/error state
 */
export function useSessions({
  studentId = null,
  dateFrom = null,
  dateTo = null,
  allStudents = false,
  initialPageSize = 10,
} = {}) {
  const [sessions, setSessions] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Detail cache: { [sessionId]: { readingGroups, elementGroups, homework } }
  const detailCache = useRef({});
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Track current student + mode to clear cache on switch
  const prevStudentId = useRef(studentId);
  const prevAllStudents = useRef(allStudents);

  // ---- Shared filter builder ----

  /**
   * Apply the current filter set (studentId, dateFrom, dateTo, allStudents)
   * to a Supabase query builder. Used by both count and data queries
   * to guarantee they stay in lockstep.
   */
  function applyFilters(query) {
    // Student scope: in single-student mode, filter by studentId
    if (!allStudents && studentId) {
      query = query.eq('student_id', studentId);
    }
    // Date range (server-side)
    if (dateFrom) {
      query = query.gte('session_date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('session_date', dateTo);
    }
    return query;
  }

  // ---- Fetch session list ----

  const fetchSessions = useCallback(async (limit) => {
    // In single-student mode, require a studentId
    if (!allStudents && !studentId) {
      setSessions([]);
      setTotalCount(0);
      return;
    }

    const fetchLimit = limit || pageSize;
    setLoading(true);
    setError(null);

    try {
      // Get total count for "has more" logic — same filters as data query
      let countQuery = supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true });
      countQuery = applyFilters(countQuery);

      const { count, error: countErr } = await countQuery;
      if (countErr) throw countErr;
      setTotalCount(count || 0);

      // Build select columns — in all-students mode, join student name
      const selectCols = allStudents
        ? `
          id,
          student_id,
          session_date,
          minutes_worked,
          next_session_date,
          next_session_time,
          next_session_end_time,
          homework_notes,
          lesson_notes,
          homework_minutes_per_day,
          created_at,
          updated_at,
          tutor:profiles!tutor_id(id, display_name),
          student:students!student_id(id, first_name, last_name, mitzvah_date),
          session_verse_progress(count),
          session_element_progress(count)
        `
        : `
          id,
          session_date,
          minutes_worked,
          next_session_date,
          next_session_time,
          next_session_end_time,
          homework_notes,
          lesson_notes,
          homework_minutes_per_day,
          created_at,
          updated_at,
          tutor:profiles!tutor_id(id, display_name),
          session_verse_progress(count),
          session_element_progress(count)
        `;

      let dataQuery = supabase
        .from('sessions')
        .select(selectCols);
      dataQuery = applyFilters(dataQuery);
      dataQuery = dataQuery
        .order('session_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(fetchLimit);

      const { data, error: fetchErr } = await dataQuery;
      if (fetchErr) throw fetchErr;

      // Normalize count fields from Supabase's nested array format
      const normalized = (data || []).map((s) => ({
        ...s,
        verseCount: s.session_verse_progress?.[0]?.count ?? 0,
        elementCount: s.session_element_progress?.[0]?.count ?? 0,
        // Flatten student name for easy rendering in all-students mode
        studentName: s.student
          ? `${s.student.first_name} ${s.student.last_name}`
          : null,
        mitzvahDate: s.student?.mitzvah_date || null,
      }));

      setSessions(normalized);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, pageSize, dateFrom, dateTo, allStudents]);

  // Re-fetch when any filter dimension changes
  useEffect(() => {
    // Clear cache and expanded state when student or mode changes
    if (prevStudentId.current !== studentId || prevAllStudents.current !== allStudents) {
      detailCache.current = {};
      setExpandedId(null);
      setDetail(null);
      prevStudentId.current = studentId;
      prevAllStudents.current = allStudents;
    }

    fetchSessions();
  }, [fetchSessions]);

  // ---- Page size control ----

  function changePageSize(newSize) {
    setPageSize(newSize);
    // fetchSessions will re-run via useEffect since pageSize is a dependency
  }

  // ---- Load more ----

  async function loadMore() {
    if (!allStudents && !studentId) return;

    const currentCount = sessions.length;
    const newLimit = currentCount + pageSize;
    await fetchSessions(newLimit);
  }

  const hasMore = sessions.length < totalCount;

  // ---- Fetch detail for a single session (on expand) ----

  const fetchDetail = useCallback(async (sessionId) => {
    if (!sessionId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }

    // Toggle collapse if already expanded
    if (expandedId === sessionId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }

    setExpandedId(sessionId);

    // Check cache first
    if (detailCache.current[sessionId]) {
      setDetail(detailCache.current[sessionId]);
      return;
    }

    setLoadingDetail(true);

    try {
      // Verse progress with reading context
      const { data: verseProgress, error: vpErr } = await supabase
        .from('session_verse_progress')
        .select(`
          id,
          status,
          quality,
          verse:verses!verse_id(
            id,
            verse_reference,
            sort_order,
            reading:readings!reading_id(
              id,
              portion_name,
              aliyah,
              reading_type,
              sort_order
            )
          )
        `)
        .eq('session_id', sessionId);
      if (vpErr) throw vpErr;

      // Element progress with element context
      const { data: elementProgress, error: epErr } = await supabase
        .from('session_element_progress')
        .select(`
          id,
          quality,
          notes,
          element:service_elements!element_id(
            id,
            label,
            category,
            sort_order
          )
        `)
        .eq('session_id', sessionId);
      if (epErr) throw epErr;

      // Homework items
      const { data: homework, error: hwErr } = await supabase
        .from('homework_items')
        .select('*')
        .eq('session_id', sessionId);
      if (hwErr) throw hwErr;

      // Group verse progress by reading
      const readingMap = {};
      (verseProgress || []).forEach((vp) => {
        if (!vp.verse?.reading) return;
        const r = vp.verse.reading;
        if (!readingMap[r.id]) {
          readingMap[r.id] = {
            id: r.id,
            portionName: r.portion_name,
            aliyah: r.aliyah,
            readingType: r.reading_type,
            sortOrder: r.sort_order,
            verses: [],
          };
        }
        readingMap[r.id].verses.push({
          id: vp.id,
          verseReference: vp.verse.verse_reference,
          sortOrder: vp.verse.sort_order,
          status: vp.status,
          quality: vp.quality,
        });
      });

      // Sort readings by sort_order, verses within each reading by sort_order
      const readingGroups = Object.values(readingMap)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((rg) => ({
          ...rg,
          verses: rg.verses.sort((a, b) => a.sortOrder - b.sortOrder),
        }));

      // Group element progress by category
      const categoryMap = {};
      (elementProgress || []).forEach((ep) => {
        if (!ep.element) return;
        const cat = ep.element.category;
        if (!categoryMap[cat]) categoryMap[cat] = [];
        categoryMap[cat].push({
          id: ep.id,
          label: ep.element.label,
          sortOrder: ep.element.sort_order,
          quality: ep.quality,
          notes: ep.notes,
        });
      });

      // Sort elements within each category
      Object.values(categoryMap).forEach((arr) =>
        arr.sort((a, b) => a.sortOrder - b.sortOrder)
      );

      const detailData = {
        readingGroups,
        elementGroups: categoryMap,
        homework: homework || [],
      };

      // Cache and set
      detailCache.current[sessionId] = detailData;
      setDetail(detailData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDetail(false);
    }
  }, [expandedId]);

  // ---- Delete a session ----

  async function deleteSession(sessionId) {
    try {
      // Cascade handles child records (verse_progress, element_progress, homework_items)
      const { error: delErr } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId);
      if (delErr) throw delErr;

      // Clear from cache
      delete detailCache.current[sessionId];

      // If the deleted session was expanded, collapse
      if (expandedId === sessionId) {
        setExpandedId(null);
        setDetail(null);
      }

      // Re-fetch list
      await fetchSessions();
    } catch (err) {
      setError(err.message);
      throw err; // Re-throw so the page can show confirmation feedback
    }
  }

  return {
    // Session list
    sessions,
    totalCount,
    hasMore,
    loading,
    error,

    // Page size controls
    pageSize,
    changePageSize,
    loadMore,

    // Detail (expanded session)
    expandedId,
    detail,
    loadingDetail,
    fetchDetail,

    // Mutations
    deleteSession,

    // Manual refresh
    refetch: fetchSessions,
  };
}
