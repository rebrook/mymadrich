import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Hook for standing internal notes on a single student.
 *
 * Visible to admin + tutor only (enforced by RLS on internal_notes).
 * Writes go through SECURITY DEFINER RPCs so author/admin permission
 * checks live server-side, not in the client.
 *
 * @param {string} studentId
 */
export function useInternalNotes(studentId) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchNotes = useCallback(async () => {
    if (!studentId) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchErr } = await supabase
        .from('internal_notes')
        .select('id, note, created_at, updated_at, author_id, profiles(display_name)')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      if (fetchErr) throw fetchErr;

      setNotes(data || []);
    } catch (err) {
      console.error('useInternalNotes error:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  /**
   * Add a new note.
   * @param {string} noteText
   */
  const addNote = useCallback(async (noteText) => {
    if (!studentId) return;

    try {
      const { error: rpcErr } = await supabase.rpc('add_internal_note', {
        p_student_id: studentId,
        p_note: noteText,
      });
      if (rpcErr) throw rpcErr;

      await fetchNotes();
    } catch (err) {
      console.error('addNote error:', err.message);
      throw err;
    }
  }, [studentId, fetchNotes]);

  /**
   * Edit an existing note. Server-side RPC rejects if the caller
   * isn't the original author.
   * @param {string} noteId
   * @param {string} noteText
   */
  const editNote = useCallback(async (noteId, noteText) => {
    try {
      const { error: rpcErr } = await supabase.rpc('update_internal_note', {
        p_note_id: noteId,
        p_note: noteText,
      });
      if (rpcErr) throw rpcErr;

      await fetchNotes();
    } catch (err) {
      console.error('editNote error:', err.message);
      throw err;
    }
  }, [fetchNotes]);

  /**
   * Soft-delete a note. Server-side RPC allows the original author
   * or an admin; rejects everyone else.
   * @param {string} noteId
   */
  const deleteNote = useCallback(async (noteId) => {
    try {
      const { error: rpcErr } = await supabase.rpc('delete_internal_note', {
        p_note_id: noteId,
      });
      if (rpcErr) throw rpcErr;

      await fetchNotes();
    } catch (err) {
      console.error('deleteNote error:', err.message);
      throw err;
    }
  }, [fetchNotes]);

  return {
    notes,
    loading,
    error,
    addNote,
    editNote,
    deleteNote,
    refetch: fetchNotes,
  };
}
