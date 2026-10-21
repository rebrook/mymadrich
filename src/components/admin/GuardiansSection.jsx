import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { openInviteEmail } from '../../utils/mailto';
import { resolveGuardian } from '../../utils/people';
import { fetchAccounts, findAccountByEmail, describeRoles } from '../../utils/existingAccounts';
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

  // People who already have an account (so a guardian whose email has one is linked, not invited)
  const [accounts, setAccounts] = useState([]);
  const [linkTarget, setLinkTarget] = useState(null); // { guardian, account } awaiting confirmation
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState(null);
  const [notice, setNotice] = useState('');

  const [form, setForm] = useState({
    name: '',
    relationship: 'Parent',
    email: '',
    phone: '',
    is_primary: false,
  });
  // When the email typed in the Add form belongs to an existing account, offer to link to it
  const [linkOnAdd, setLinkOnAdd] = useState(true);

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

  // Load everyone with an account; reloaded whenever the guardians change (for example after a link)
  useEffect(() => {
    let cancelled = false;
    fetchAccounts()
      .then((list) => { if (!cancelled) setAccounts(list); })
      .catch(() => { /* non-critical: the Invite button is simply offered as before */ });
    return () => { cancelled = true; };
  }, [guardians]);

  function resetForm() {
    setForm({ name: '', relationship: 'Parent', email: '', phone: '', is_primary: false });
    setLinkOnAdd(true);
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
    const editingLinked = Boolean(editingGuardian && editingGuardian.user_id);
    if (!editingLinked && !form.name.trim()) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let payload;
      if (editingLinked) {
        // Name, email, and phone belong to the linked account (edited in Users). Only what
        // belongs to the relationship is saved here, so account details are never copied in.
        payload = {
          relationship: form.relationship,
          is_primary: form.is_primary,
          sort_order: editingGuardian.sort_order,
        };
      } else {
        payload = {
          name: form.name.trim(),
          relationship: form.relationship,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          is_primary: form.is_primary,
          sort_order: editingGuardian
            ? editingGuardian.sort_order
            : guardians.length + 1,
        };
      }

      if (editingGuardian) {
        await onUpdateGuardian(editingGuardian.id, payload);
      } else {
        // A new guardian whose email already has an account can be linked in the same step
        const match = linkOnAdd ? findAccountByEmail(accounts, form.email) : null;
        if (match) {
          if (!match.roles.includes('parent')) {
            const { error: roleErr } = await supabase.rpc('grant_role', {
              p_profile_id: match.id,
              p_role: 'parent',
            });
            if (roleErr) throw roleErr;
          }
          payload.user_id = match.id;
        }
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

  // ---- Link a guardian record to an account that already exists ----

  function openLinkAccount(guardian) {
    const account = findAccountByEmail(accounts, guardian.email);
    if (!account) return;
    setLinkTarget({ guardian, account });
    setLinkError(null);
  }

  function closeLinkAccount() {
    setLinkTarget(null);
    setLinkError(null);
  }

  async function handleLinkAccount() {
    if (!linkTarget) return;
    const { guardian, account } = linkTarget;
    setLinking(true);
    setLinkError(null);
    try {
      if (!account.roles.includes('parent')) {
        const { error: err } = await supabase.rpc('grant_role', {
          p_profile_id: account.id,
          p_role: 'parent',
        });
        if (err) throw err;
      }
      await onUpdateGuardian(guardian.id, { user_id: account.id });

      // An invitation that is still open for this guardian is no longer needed
      await supabase
        .from('pending_invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('guardian_id', guardian.id)
        .is('accepted_at', null);

      closeLinkAccount();
      setNotice('');
      setTimeout(
        () => setNotice(`${guardian.name} is now linked to ${account.display_name || account.email}.`),
        50
      );
    } catch (err) {
      setLinkError(err.message);
    } finally {
      setLinking(false);
    }
  }

  function getInviteStatus(guardian) {
    if (guardian.user_id) return 'linked';
    if (guardian.email && findAccountByEmail(accounts, guardian.email)) return 'can_link';
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
      <div role="status" aria-live="polite">
        {notice && <div className="alert alert-success" style={{ marginTop: 'var(--space-3)' }}>{notice}</div>}
      </div>

      {guardians.length === 0 ? (
        <div className="empty-state">
          <p>No guardians added yet. Add at least one parent or guardian contact.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          {guardians.map((g) => {
            const status = getInviteStatus(g);
            // One person, one set of details: a linked guardian shows their account's details
            const person = resolveGuardian(g);
            return (
              <div key={g.id} className="guardian-card">
                <div className="guardian-card-info">
                  <div className="guardian-card-name">
                    <strong>{person.name}</strong>
                    <span className="form-hint">({person.relationship})</span>
                    {g.is_primary && <span className="badge badge-active">Primary</span>}
                    {status === 'linked' && <span className="badge badge-completed">Linked</span>}
                    {status === 'invited' && <span className="badge badge-deferred">Invited</span>}
                  </div>
                  <div className="guardian-card-contact">
                    {person.email && <span>{person.email}</span>}
                    {person.email && person.phone && <span className="form-hint">&middot;</span>}
                    {person.phone && <span>{person.phone}</span>}
                  </div>
                  {person.isLinked && (
                    <div className="form-hint">
                      These details come from their account. To change them, use Edit on the Users tab.
                    </div>
                  )}
                </div>
                <div className="action-buttons">
                  {status === 'can_link' && (
                    <button
                      className="btn btn-small btn-primary"
                      onClick={() => openLinkAccount(g)}
                      aria-label={`Link ${g.name} to their existing account`}
                    >
                      Link account
                    </button>
                  )}
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

      {/* Link to an existing account */}
      {linkTarget && (
        <Modal
          title="Link Account"
          onClose={closeLinkAccount}
          footer={
            <>
              <button className="btn btn-outline" onClick={closeLinkAccount}>Cancel</button>
              <button className="btn btn-primary" onClick={handleLinkAccount} disabled={linking}>
                {linking
                  ? 'Linking...'
                  : linkTarget.account.roles.includes('parent') ? 'Link Account' : 'Add Role and Link'}
              </button>
            </>
          }
        >
          {linkError && <div className="alert alert-error">{linkError}</div>}
          <p style={{ margin: 0 }}>
            <strong>{linkTarget.account.display_name || linkTarget.account.email} already has an account.</strong>
          </p>
          <p className="form-hint" style={{ margin: 'var(--space-1) 0 var(--space-3)' }}>
            Current roles: {describeRoles(linkTarget.account.roles)}
          </p>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            {linkTarget.account.roles.includes('parent')
              ? `Link ${linkTarget.guardian.name}'s guardian record to this account?`
              : `Link ${linkTarget.guardian.name}'s guardian record to this account and add the Parent role to it?`}
            {' '}No email is sent. They keep every role they already hold.
          </p>
        </Modal>
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

          {editingGuardian && editingGuardian.user_id ? (
            /* A linked guardian: the account holds their name, email, and phone */
            <div className="form-group">
              {(() => {
                const person = resolveGuardian(editingGuardian);
                return (
                  <>
                    <p style={{ margin: 0 }}><strong>{person.name}</strong></p>
                    <p className="form-hint" style={{ margin: 'var(--space-1) 0 0' }}>
                      {[person.email, person.phone].filter(Boolean).join(' \u00B7 ') || 'No contact details on the account'}
                    </p>
                    <p className="form-hint" style={{ margin: 'var(--space-2) 0 0' }}>
                      This person has an account, so their name, email, and phone come from it. To change
                      them, use Edit on the Users tab. You can change the relationship and primary
                      contact here.
                    </p>
                  </>
                );
              })()}
            </div>
          ) : (
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
          )}

          {/* Linked guardian: only the relationship is editable here */}
          {editingGuardian && editingGuardian.user_id && (
            <div className="form-group">
              <label className="form-label" htmlFor="guardian-relationship">Relationship</label>
              <select
                id="guardian-relationship"
                className="input"
                value={form.relationship}
                onChange={(e) => setForm({ ...form, relationship: e.target.value })}
              >
                {RELATIONSHIP_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}

          {!(editingGuardian && editingGuardian.user_id) && (
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
          )}

          {/* New guardian whose email already belongs to an account: offer one-step linking */}
          {!editingGuardian && findAccountByEmail(accounts, form.email) && (() => {
            const match = findAccountByEmail(accounts, form.email);
            return (
              <div className="alert alert-success" role="status">
                <p style={{ margin: 0 }}>
                  <strong>{match.display_name || match.email} already has an account with this email.</strong>
                </p>
                <label className="checkbox-row" style={{ marginTop: 'var(--space-2)' }}>
                  <input
                    type="checkbox"
                    checked={linkOnAdd}
                    onChange={(e) => setLinkOnAdd(e.target.checked)}
                  />
                  <span>
                    Link this guardian to that account
                    {match.roles.includes('parent') ? '' : ' (this also gives them the Parent role)'}
                  </span>
                </label>
                <p className="form-hint" style={{ margin: 'var(--space-1) 0 0' }}>
                  Linking means there is one person with one set of details, and no second copy to
                  keep up to date. No email is sent.
                </p>
              </div>
            );
          })()}

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
