import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { openInviteEmail } from '../../utils/mailto';
import Modal from '../ui/Modal';

const RELATIONSHIP_OPTIONS = ['Mother', 'Father', 'Parent', 'Guardian', 'Stepparent', 'Grandparent'];

/**
 * Guardian CRUD for a single student's detail page.
 *
 * Props:
 *   guardians        - array of guardian objects from useStudent
 *   onCreateGuardian - async fn(payload) to insert a guardian record
 *   onUpdateGuardian - async fn(id, updates) to update a guardian record
 *   onDeleteGuardian - async fn(id) to delete a guardian record
 *   studentName      - student's display name (for invite messaging)
 *
 * The "Invite" button per guardian creates a pending_invitations row
 * with intended_role='parent' and guardian_id set, then auto-opens
 * the admin's mail client. On first sign-in with that email, the
 * process_pending_invitation RPC claims the account, sets role=parent,
 * and links user_id on the student_guardians record.
 */
export default function GuardiansSection({
  guardians,
  onCreateGuardian,
  onUpdateGuardian,
  onDeleteGuardian,
  studentName,
}) {
  const { user: currentUser } = useAuth();

  const [showForm, setShowForm] = useState(false);
  const [editingGuardian, setEditingGuardian] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Invite state
  const [inviting, setInviting] = useState(null); // guardian id being invited
  const [inviteError, setInviteError] = useState(null);

  // Track which guardians have pending invitations (fetched on mount)
  const [pendingInvites, setPendingInvites] = useState({});

  const [form, setForm] = useState({
    name: '',
    relationship: 'Parent',
    email: '',
    phone: '',
    is_primary: false,
  });

  // Fetch pending invitation status for guardians with emails
  useEffect(() => {
    async function loadPendingStatus() {
      const guardianIds = guardians.filter((g) => g.email).map((g) => g.id);
      if (guardianIds.length === 0) return;

      try {
        const { data } = await supabase
          .from('pending_invitations')
          .select('guardian_id')
          .in('guardian_id', guardianIds)
          .is('accepted_at', null);

        const map = {};
        (data || []).forEach((inv) => {
          map[inv.guardian_id] = true;
        });
        setPendingInvites(map);
      } catch (err) {
        // Non-critical; invite buttons will show without status
      }
    }
    loadPendingStatus();
  }, [guardians]);

  function resetForm() {
    setForm({ name: '', relationship: 'Parent', email: '', phone: '', is_primary: false });
    setEditingGuardian(null);
    setShowForm(false);
    setError(null);
  }

  function handleEdit(g) {
    setEditingGuardian(g);
    setForm({
      name: g.name || '',
      relationship: g.relationship || 'Parent',
      email: g.email || '',
      phone: g.phone || '',
      is_primary: g.is_primary || false,
    });
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        relationship: form.relationship,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        is_primary: form.is_primary,
        sort_order: editingGuardian
          ? editingGuardian.sort_order
          : guardians.length + 1,
      };

      if (editingGuardian) {
        await onUpdateGuardian(editingGuardian.id, payload);
      } else {
        await onCreateGuardian(payload);
      }
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setError(null);
    try {
      await onDeleteGuardian(id);
      setDeletingId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleTogglePrimary(g) {
    try {
      await onUpdateGuardian(g.id, { is_primary: !g.is_primary });
    } catch (err) {
      setError(err.message);
    }
  }

  // ---- Invite Guardian ----

  async function handleInvite(guardian) {
    if (!guardian.email) return;

    setInviting(guardian.id);
    setInviteError(null);
    try {
      // Check for existing pending invitation for this guardian
      const { data: existing } = await supabase
        .from('pending_invitations')
        .select('id')
        .eq('guardian_id', guardian.id)
        .is('accepted_at', null)
        .limit(1);

      if (existing && existing.length > 0) {
        // Already invited; just resend the email
        openInviteEmail({
          recipientEmail: guardian.email,
          recipientName: guardian.name,
          role: 'parent',
        });
        return;
      }

      // Check for existing pending invitation for this email (might be linked to a different guardian)
      const { data: emailExisting } = await supabase
        .from('pending_invitations')
        .select('id')
        .eq('email', guardian.email.toLowerCase())
        .eq('intended_role', 'parent')
        .is('accepted_at', null)
        .limit(1);

      if (emailExisting && emailExisting.length > 0) {
        // Email already has a pending invite; just resend
        openInviteEmail({
          recipientEmail: guardian.email,
          recipientName: guardian.name,
          role: 'parent',
        });
        setPendingInvites((prev) => ({ ...prev, [guardian.id]: true }));
        return;
      }

      // Create the pending invitation
      const { error: err } = await supabase
        .from('pending_invitations')
        .insert({
          email: guardian.email.toLowerCase(),
          intended_role: 'parent',
          display_name: guardian.name,
          phone: guardian.phone || null,
          guardian_id: guardian.id,
          invited_by: currentUser.id,
        });
      if (err) throw err;

      // Mark as invited in local state
      setPendingInvites((prev) => ({ ...prev, [guardian.id]: true }));

      // Auto-open mailto
      openInviteEmail({
        recipientEmail: guardian.email,
        recipientName: guardian.name,
        role: 'parent',
      });
    } catch (err) {
      setInviteError(`Failed to invite ${guardian.name}: ${err.message}`);
    } finally {
      setInviting(null);
    }
  }

  function getInviteStatus(guardian) {
    if (guardian.user_id) return 'linked';
    if (pendingInvites[guardian.id]) return 'invited';
    if (guardian.email) return 'can_invite';
    return 'no_email';
  }

  const formFooter = (
    <>
      <button className="btn btn-outline" onClick={resetForm}>Cancel</button>
      <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
        {saving ? 'Saving...' : editingGuardian ? 'Save Changes' : 'Add Guardian'}
      </button>
    </>
  );

  return (
    <div className="card">
      <div className="section-header">
        <h3>Guardians</h3>
        <button className="btn btn-primary btn-small" onClick={() => setShowForm(true)}>
          Add Guardian
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 'var(--space-3)' }}>{error}</div>}
      {inviteError && <div className="alert alert-error" style={{ marginTop: 'var(--space-3)' }}>{inviteError}</div>}

      {guardians.length === 0 ? (
        <div className="empty-state">
          <p>No guardians added yet. Add at least one parent or guardian contact.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          {guardians.map((g) => {
            const status = getInviteStatus(g);
            return (
              <div key={g.id} className="guardian-card">
                <div className="guardian-card-info">
                  <div className="guardian-card-name">
                    <strong>{g.name}</strong>
                    <span className="form-hint">({g.relationship})</span>
                    {g.is_primary && <span className="badge badge-active">Primary</span>}
                    {status === 'linked' && <span className="badge badge-completed">Linked</span>}
                    {status === 'invited' && <span className="badge badge-deferred">Invited</span>}
                  </div>
                  <div className="guardian-card-contact">
                    {g.email && <span>{g.email}</span>}
                    {g.email && g.phone && <span className="form-hint">&middot;</span>}
                    {g.phone && <span>{g.phone}</span>}
                  </div>
                </div>
                <div className="action-buttons">
                  {status === 'can_invite' && (
                    <button
                      className="btn btn-small btn-primary"
                      onClick={() => handleInvite(g)}
                      disabled={inviting === g.id}
                    >
                      {inviting === g.id ? 'Inviting...' : 'Invite'}
                    </button>
                  )}
                  {status === 'invited' && (
                    <button
                      className="btn btn-small btn-outline"
                      onClick={() => handleInvite(g)}
                      disabled={inviting === g.id}
                    >
                      Resend
                    </button>
                  )}
                  <button className="btn btn-small btn-outline" onClick={() => handleTogglePrimary(g)}>
                    {g.is_primary ? 'Unset Primary' : 'Set Primary'}
                  </button>
                  <button className="btn btn-small btn-outline" onClick={() => handleEdit(g)}>
                    Edit
                  </button>
                  <button className="btn btn-small btn-danger-outline" onClick={() => setDeletingId(g.id)}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <Modal
          title="Remove Guardian"
          onClose={() => setDeletingId(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setDeletingId(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ backgroundColor: 'var(--color-error)' }} onClick={() => handleDelete(deletingId)}>
                Remove Guardian
              </button>
            </>
          }
        >
          <p>This will remove the guardian's contact information. This cannot be undone.</p>
        </Modal>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <Modal
          title={editingGuardian ? 'Edit Guardian' : 'Add Guardian'}
          onClose={resetForm}
          footer={formFooter}
        >
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Relationship</label>
              <select
                className="input"
                value={form.relationship}
                onChange={(e) => setForm({ ...form, relationship: e.target.value })}
              >
                {RELATIONSHIP_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input
                type="tel"
                className="input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.is_primary}
              onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
            />
            <span>Primary contact</span>
          </label>
        </Modal>
      )}
    </div>
  );
}
