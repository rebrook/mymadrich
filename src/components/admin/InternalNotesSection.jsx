import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../utils/constants';
import { formatSessionDate } from '../../utils/datetime';

/**
 * Internal Notes — standing, per-student notes for madrachim/coordinator.
 * Never shown to parent/student views (enforced by RLS + the
 * isAdminOrTutor gate in StudentDetailPage.jsx).
 *
 * - Newest-first list, author + timestamp per entry.
 * - "(edited)" tag shown when a note has been edited.
 * - Edit control: author only. Delete control: author or admin.
 * - Delete requires an inline "Are you sure?" confirmation before it fires.
 */
export default function InternalNotesSection({ notes, loading, error, onAddNote, onEditNote, onDeleteNote }) {
  const { user, role } = useAuth();
  const isAdmin = role === ROLES.ADMIN;

  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function handleAdd() {
    const text = draft.trim();
    if (!text) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onAddNote(text);
      setDraft('');
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(n) {
    setEditingId(n.id);
    setEditDraft(n.note);
    setConfirmingDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft('');
  }

  async function handleSaveEdit(noteId) {
    const text = editDraft.trim();
    if (!text) return;

    setEditSubmitting(true);
    try {
      await onEditNote(noteId, text);
      setEditingId(null);
      setEditDraft('');
    } catch (err) {
      // Surface inline; keep the edit open so the user can retry.
      setSubmitError(err.message);
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleConfirmDelete(noteId) {
    setDeleting(true);
    try {
      await onDeleteNote(noteId);
      setConfirmingDeleteId(null);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="card internal-notes">
      <div className="section-header">
        <h3>Internal Notes</h3>
        <span className="internal-notes-hint">Visible to madrachim and coordinator only</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {submitError && <div className="alert alert-error">{submitError}</div>}

      {loading ? (
        <p className="form-hint">Loading notes\u2026</p>
      ) : notes.length === 0 ? (
        <p className="form-hint">No internal notes yet.</p>
      ) : (
        <ul className="internal-notes-list">
          {notes.map((n) => {
            const isAuthor = n.author_id === user?.id;
            const canDelete = isAuthor || isAdmin;
            const isEditing = editingId === n.id;
            const isConfirmingDelete = confirmingDeleteId === n.id;

            return (
              <li key={n.id} className="internal-note">
                <div className="internal-note-meta">
                  <span className="internal-note-author">{n.profiles?.display_name || 'Unknown'}</span>
                  <span className="internal-note-dot">{'\u00B7'}</span>
                  <span className="internal-note-date">{formatSessionDate(n.created_at)}</span>
                  {n.updated_at && <span className="internal-note-edited">(edited)</span>}
                </div>

                {isEditing ? (
                  <div className="internal-note-edit">
                    <textarea
                      className="input internal-notes-textarea"
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={3}
                    />
                    <div className="internal-note-edit-actions">
                      <button
                        type="button"
                        className="btn btn-outline btn-small"
                        onClick={cancelEdit}
                        disabled={editSubmitting}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-small"
                        onClick={() => handleSaveEdit(n.id)}
                        disabled={editSubmitting || !editDraft.trim()}
                      >
                        {editSubmitting ? 'Saving\u2026' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="internal-note-text">{n.note}</p>
                    <div className="internal-note-actions">
                      {isAuthor && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-small"
                          onClick={() => startEdit(n)}
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && !isConfirmingDelete && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-small internal-note-delete-trigger"
                          onClick={() => setConfirmingDeleteId(n.id)}
                        >
                          Delete
                        </button>
                      )}
                      {canDelete && isConfirmingDelete && (
                        <span className="internal-note-confirm">
                          Delete this note?
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            onClick={() => setConfirmingDeleteId(null)}
                            disabled={deleting}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger-outline btn-small"
                            onClick={() => handleConfirmDelete(n.id)}
                            disabled={deleting}
                          >
                            {deleting ? 'Deleting\u2026' : 'Yes, delete'}
                          </button>
                        </span>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="internal-notes-composer">
        <textarea
          className="input internal-notes-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note (not shown to families)"
          rows={3}
          disabled={submitting}
        />
        <button
          type="button"
          className="btn btn-primary btn-small"
          onClick={handleAdd}
          disabled={submitting || !draft.trim()}
        >
          {submitting ? 'Adding\u2026' : 'Add Note'}
        </button>
      </div>
    </section>
  );
}
