import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { openInviteEmail } from '../../utils/mailto';
import { fetchProfileIdsWithRole, fetchRolesByProfile } from '../../utils/roleQueries';
import { fetchAccounts, findAccountByEmail, describeRoles } from '../../utils/existingAccounts';
import { ROLE_LABELS } from '../../utils/constants';
import Modal from '../ui/Modal';

/**
 * Admin Tutor CRUD tab.
 *
 * Data model:
 *   - Claimed tutors: profiles row with role='tutor' + is_active flag.
 *   - Pre-claim tutors: pending_invitations row with intended_role='tutor'
 *     and accepted_at IS NULL. These show as "Invited" in the roster.
 *
 * CRUD:
 *   Create  — "Add Tutor" (single) or "Add Multiple" (multi-row form).
 *             Inserts pending_invitations + auto-opens mailto.
 *   Read    — merged list of claimed profiles + pending invitations.
 *   Resend  — re-opens the pre-filled invitation email for a pending tutor
 *             (no database change; the admin sends it from their mail app).
 *   Update  — edit name/phone (claimed) or name/email/phone (pre-claim).
 *   Delete  — deactivate (soft-delete via is_active); blocked while assigned.
 *
 * M:N migration (S32): student counts now query student_tutors join table
 * instead of students.tutor_id. A tutor assigned to 3 students via the
 * join table shows "3" regardless of which student's tutor_id mirror
 * points to them.
 */
export default function TutorTab() {
  const { user: currentUser } = useAuth();

  const [tutors, setTutors] = useState([]);        // merged claimed + pending
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Include inactive toggle (mirrors cohort archived filter)
  const [showInactive, setShowInactive] = useState(false);

  // Add Tutor modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addRows, setAddRows] = useState([{ name: '', email: '', phone: '' }]);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState(null);
  const [addExisting, setAddExisting] = useState([]); // rows whose email already has an account, awaiting confirmation

  // Edit modal
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);

  // Deactivate confirm modal
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateConfirmChecked, setDeactivateConfirmChecked] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState(null);

  // Remove tutor role (for people who also hold other roles, such as an administrator who tutors)
  const [removeRoleTarget, setRemoveRoleTarget] = useState(null);
  const [removingRole, setRemovingRole] = useState(false);
  const [removeRoleError, setRemoveRoleError] = useState(null);

  // Cancel invitation confirm
  const [cancelTarget, setCancelTarget] = useState(null);

  // Confirmation note after reopening an invitation email (read aloud to screen readers)
  const [resendNotice, setResendNotice] = useState('');

  useEffect(() => {
    fetchTutors();
  }, []);

  // ---- Data fetch: merge profiles + pending invitations ----

  async function fetchTutors() {
    setLoading(true);
    setError(null);
    try {
      // 1. Claimed tutors: everyone who HOLDS the tutor role, whatever else they also hold
      //    (an administrator who tutors appears here too)
      const tutorIds = await fetchProfileIdsWithRole('tutor');
      let profiles = [];
      if (tutorIds.length > 0) {
        const { data: profileRows, error: profileErr } = await supabase
          .from('profiles')
          .select('id, display_name, email, phone, is_active')
          .in('id', tutorIds)
          .order('display_name');
        if (profileErr) throw profileErr;
        profiles = profileRows || [];
      }
      const rolesByProfile = await fetchRolesByProfile(tutorIds);

      // 2. Pending tutor invitations (not yet claimed)
      const { data: pending, error: pendErr } = await supabase
        .from('pending_invitations')
        .select('id, email, display_name, phone, created_at')
        .eq('intended_role', 'tutor')
        .is('accepted_at', null)
        .order('created_at', { ascending: false });
      if (pendErr) throw pendErr;

      // 3. Student counts per tutor via M:N join table (active/deferred only)
      const { data: assignments, error: assignErr } = await supabase
        .from('student_tutors')
        .select('tutor_id, student:students!student_id(status)')
        .filter('student.status', 'in', '("active","deferred")');
      if (assignErr) throw assignErr;

      // 4. Session counts per tutor (unchanged — sessions.tutor_id = who logged)
      const { data: sessions, error: sessionErr } = await supabase
        .from('sessions')
        .select('tutor_id');
      if (sessionErr) throw sessionErr;

      const studentCountMap = {};
      (assignments || []).forEach((a) => {
        // Filter out rows where the student join returned null
        // (student was deleted or status didn't match)
        if (a.student) {
          studentCountMap[a.tutor_id] = (studentCountMap[a.tutor_id] || 0) + 1;
        }
      });

      const sessionCountMap = {};
      (sessions || []).forEach((s) => {
        sessionCountMap[s.tutor_id] = (sessionCountMap[s.tutor_id] || 0) + 1;
      });

      // Build merged list: claimed first, then pending
      const claimedEmails = new Set((profiles || []).map((p) => p.email?.toLowerCase()));

      const claimed = (profiles || []).map((p) => ({
        _type: 'claimed',
        _key: p.id,
        id: p.id,
        display_name: p.display_name,
        email: p.email,
        phone: p.phone,
        is_active: p.is_active,
        studentCount: studentCountMap[p.id] || 0,
        sessionCount: sessionCountMap[p.id] || 0,
        // Roles held besides tutor (an empty list for someone who only tutors)
        otherRoles: (rolesByProfile[p.id] || []).filter((r) => r !== 'tutor'),
      }));

      // Filter out pending invitations whose email already has a claimed profile
      // (this handles the race where someone signs in between invite and page load)
      const pendingRows = (pending || [])
        .filter((inv) => !claimedEmails.has(inv.email?.toLowerCase()))
        .map((inv) => ({
          _type: 'pending',
          _key: `inv-${inv.id}`,
          id: inv.id,
          display_name: inv.display_name || null,
          email: inv.email,
          phone: inv.phone || null,
          is_active: true,
          studentCount: 0,
          sessionCount: 0,
          created_at: inv.created_at,
        }));

      setTutors([...claimed, ...pendingRows]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ---- Add Tutor (single + multi-row) ----

  function openAddModal() {
    setAddRows([{ name: '', email: '', phone: '' }]);
    setAddError(null);
    setShowAddModal(true);
  }

  function closeAddModal() {
    setShowAddModal(false);
    setAddRows([{ name: '', email: '', phone: '' }]);
    setAddError(null);
    setAddExisting([]);
  }

  function updateAddRow(idx, field, value) {
    setAddRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  }

  function addAnotherRow() {
    setAddRows((prev) => [...prev, { name: '', email: '', phone: '' }]);
  }

  function removeAddRow(idx) {
    setAddRows((prev) => prev.filter((_, i) => i !== idx));
  }

  // `confirmed` is true once the administrator has seen which people already have accounts
  async function handleAddTutors(confirmed = false) {
    // Validate: at least one row with name + email
    const validRows = addRows.filter((r) => r.name.trim() && r.email.trim());
    if (validRows.length === 0) {
      setAddError('At least one tutor needs a name and email.');
      return;
    }

    // Check for duplicate emails within the batch
    const emails = validRows.map((r) => r.email.trim().toLowerCase());
    const dupes = emails.filter((e, i) => emails.indexOf(e) !== i);
    if (dupes.length > 0) {
      setAddError(`Duplicate email in batch: ${dupes[0]}`);
      return;
    }

    // Check for existing profiles or pending invitations with these emails
    const existingEmails = tutors.map((t) => t.email?.toLowerCase()).filter(Boolean);
    const conflicts = validRows.filter((r) =>
      existingEmails.includes(r.email.trim().toLowerCase())
    );
    if (conflicts.length > 0) {
      setAddError(`Email already exists: ${conflicts[0].email}`);
      return;
    }

    setAddSaving(true);
    setAddError(null);
    try {
      // Anyone who already has an account gets the tutor role directly (after the administrator
      // confirms); everyone else is invited by email as before.
      const accounts = await fetchAccounts();
      const matches = validRows.map((r) => ({ row: r, account: findAccountByEmail(accounts, r.email) }));
      const existing = matches.filter((m) => m.account);
      const fresh = matches.filter((m) => !m.account).map((m) => m.row);

      if (existing.length > 0 && !confirmed) {
        setAddExisting(existing);
        return;
      }

      const granted = [];
      for (const m of existing) {
        if (m.account.roles.includes('tutor')) continue;
        const { error: roleErr } = await supabase.rpc('grant_role', {
          p_profile_id: m.account.id,
          p_role: 'tutor',
        });
        if (roleErr) {
          throw new Error(
            `Could not add the tutor role for ${m.account.display_name || m.account.email}: ${roleErr.message}`
          );
        }
        granted.push(m.account.display_name || m.account.email);
      }

      if (fresh.length > 0) {
        const inserts = fresh.map((r) => ({
          email: r.email.trim().toLowerCase(),
          intended_role: 'tutor',
          display_name: r.name.trim(),
          phone: r.phone.trim() || null,
          invited_by: currentUser.id,
        }));

        const { error: err } = await supabase
          .from('pending_invitations')
          .insert(inserts);
        if (err) throw err;
      }

      closeAddModal();
      await fetchTutors();

      // Confirmation (read aloud) for people who got the role directly
      if (granted.length > 0) {
        setResendNotice('');
        setTimeout(() => setResendNotice(`Tutor role added for ${granted.join(', ')}.`), 50);
      }

      // Auto-open mailto for each newly invited tutor
      fresh.forEach((r) => {
        openInviteEmail({
          recipientEmail: r.email.trim(),
          recipientName: r.name.trim(),
          role: 'tutor',
        });
      });
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddSaving(false);
    }
  }

  // ---- Edit Tutor ----

  function openEditModal(tutor) {
    setEditTarget(tutor);
    setEditForm({
      name: tutor.display_name || '',
      email: tutor.email || '',
      phone: tutor.phone || '',
    });
    setEditError(null);
  }

  function closeEditModal() {
    setEditTarget(null);
    setEditForm({ name: '', email: '', phone: '' });
    setEditError(null);
  }

  async function handleEditSave() {
    if (!editForm.name.trim()) {
      setEditError('Name is required.');
      return;
    }
    if (editTarget._type === 'pending' && !editForm.email.trim()) {
      setEditError('Email is required.');
      return;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      if (editTarget._type === 'claimed') {
        const { error: err } = await supabase
          .from('profiles')
          .update({
            display_name: editForm.name.trim(),
            phone: editForm.phone.trim() || null,
          })
          .eq('id', editTarget.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from('pending_invitations')
          .update({
            display_name: editForm.name.trim(),
            email: editForm.email.trim().toLowerCase(),
            phone: editForm.phone.trim() || null,
          })
          .eq('id', editTarget.id);
        if (err) throw err;
      }

      closeEditModal();
      await fetchTutors();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  // ---- Deactivate / Activate ----

  function openDeactivateModal(tutor) {
    setDeactivateTarget(tutor);
    setDeactivateConfirmChecked(false);
    setDeactivateError(null);
  }

  function closeDeactivateModal() {
    setDeactivateTarget(null);
    setDeactivateConfirmChecked(false);
    setDeactivateError(null);
  }

  async function handleDeactivate() {
    if (!deactivateTarget || !deactivateConfirmChecked) return;
    setDeactivating(true);
    setDeactivateError(null);
    try {
      const { error: err } = await supabase.rpc('deactivate_tutor', {
        p_tutor_id: deactivateTarget.id,
      });
      if (err) throw err;
      closeDeactivateModal();
      await fetchTutors();
    } catch (err) {
      setDeactivateError(err.message);
    } finally {
      setDeactivating(false);
    }
  }

  async function handleActivate(tutor) {
    try {
      const { error: err } = await supabase.rpc('activate_tutor', {
        p_tutor_id: tutor.id,
      });
      if (err) throw err;
      await fetchTutors();
    } catch (err) {
      console.error('Failed to activate tutor:', err.message);
    }
  }

  // ---- Remove tutor role (people who also hold other roles) ----

  function openRemoveRoleModal(tutor) {
    setRemoveRoleTarget(tutor);
    setRemoveRoleError(null);
  }

  function closeRemoveRoleModal() {
    setRemoveRoleTarget(null);
    setRemoveRoleError(null);
  }

  async function handleRemoveRole() {
    if (!removeRoleTarget) return;
    setRemovingRole(true);
    setRemoveRoleError(null);
    try {
      const { error: err } = await supabase.rpc('revoke_role', {
        p_profile_id: removeRoleTarget.id,
        p_role: 'tutor',
      });
      if (err) throw err;
      closeRemoveRoleModal();
      await fetchTutors();
    } catch (err) {
      // The database explains why in plain language (for example, active students must be reassigned first)
      setRemoveRoleError(err.message);
    } finally {
      setRemovingRole(false);
    }
  }

  // ---- Cancel Invitation ----

  async function handleCancelInvitation() {
    if (!cancelTarget) return;
    try {
      const { error: err } = await supabase
        .from('pending_invitations')
        .delete()
        .eq('id', cancelTarget.id);
      if (err) throw err;
      setCancelTarget(null);
      await fetchTutors();
    } catch (err) {
      console.error('Failed to cancel invitation:', err.message);
    }
  }

  // ---- Resend Invitation ----

  // Invitations are emails the admin sends from their own mail app, so this
  // reopens the same pre-filled message. The app cannot tell whether it was
  // actually sent, so the note says "opened", never "sent".
  function handleResendInvitation(tutor) {
    openInviteEmail({
      recipientEmail: tutor.email,
      recipientName: tutor.display_name || '',
      role: 'tutor',
    });
    const who = tutor.display_name || tutor.email;
    setResendNotice('');
    setTimeout(() => {
      setResendNotice(`Invitation email opened for ${who}. Send it from your mail app.`);
    }, 50);
  }

  // ---- Display helpers ----

  function getStatusBadge(tutor) {
    if (tutor._type === 'pending') {
      return <span className="badge badge-pending">Invited</span>;
    }
    if (!tutor.is_active) {
      return <span className="badge badge-archived">Inactive</span>;
    }
    return <span className="badge badge-active">Active</span>;
  }

  function renderActions(tutor) {
    if (tutor._type === 'pending') {
      return (
        <div className="action-buttons">
          <button className="btn btn-small btn-outline" onClick={() => openEditModal(tutor)}>
            Edit
          </button>
          <button
            className="btn btn-small btn-outline"
            type="button"
            onClick={() => handleResendInvitation(tutor)}
            aria-label={`Resend invitation to ${tutor.display_name || tutor.email}`}
          >
            Resend
          </button>
          <button
            className="btn btn-small btn-danger-outline"
            onClick={() => setCancelTarget(tutor)}
          >
            Cancel
          </button>
        </div>
      );
    }

    return (
      <div className="action-buttons">
        <button className="btn btn-small btn-outline" onClick={() => openEditModal(tutor)}>
          Edit
        </button>
        {tutor.is_active && tutor.otherRoles && tutor.otherRoles.length > 0 ? (
          // Deactivating would lock them out of their other roles, so the action is to remove the tutor role
          <button
            className="btn btn-small btn-danger-outline"
            onClick={() => openRemoveRoleModal(tutor)}
          >
            Remove tutor role
          </button>
        ) : tutor.is_active ? (
          <button
            className="btn btn-small btn-danger-outline"
            onClick={() => openDeactivateModal(tutor)}
          >
            Deactivate
          </button>
        ) : (
          <button
            className="btn btn-small btn-outline"
            onClick={() => handleActivate(tutor)}
          >
            Activate
          </button>
        )}
      </div>
    );
  }

  // Filter: show inactive toggle
  const displayedTutors = showInactive
    ? tutors
    : tutors.filter((t) => t.is_active !== false);

  const inactiveCount = tutors.filter((t) => t._type === 'claimed' && !t.is_active).length;

  const addValidCount = addRows.filter((r) => r.name.trim() && r.email.trim()).length;
  const addFreshCount = Math.max(addValidCount - addExisting.length, 0);

  const addFooter = addExisting.length > 0 ? (
    <>
      <button className="btn btn-outline" onClick={() => setAddExisting([])}>Back</button>
      <button className="btn btn-primary" onClick={() => handleAddTutors(true)} disabled={addSaving}>
        {addSaving ? 'Adding...' : addFreshCount > 0 ? 'Add Role and Send Invitations' : 'Add Tutor Role'}
      </button>
    </>
  ) : (
    <>
      <button className="btn btn-outline" onClick={closeAddModal}>Cancel</button>
      <button className="btn btn-primary" onClick={() => handleAddTutors(false)} disabled={addSaving}>
        {addSaving ? 'Sending...' : `Invite ${addValidCount || ''} Tutor${addValidCount === 1 ? '' : 's'}`}
      </button>
    </>
  );

  const editFooter = (
    <>
      <button className="btn btn-outline" onClick={closeEditModal}>Cancel</button>
      <button className="btn btn-primary" onClick={handleEditSave} disabled={editSaving}>
        {editSaving ? 'Saving...' : 'Save Changes'}
      </button>
    </>
  );

  return (
    <div>
      <div className="section-header">
        <h3>Tutors</h3>
        <div className="action-buttons">
          <button className="btn btn-primary" onClick={openAddModal}>
            Add Tutor
          </button>
        </div>
      </div>

      {inactiveCount > 0 && (
        <label className="checkbox-row" style={{ marginTop: 'var(--space-2)' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          <span>Show inactive tutors ({inactiveCount})</span>
        </label>
      )}

      {loading && <p className="form-hint">Loading tutors...</p>}
      {error && <div className="alert alert-error">{error}</div>}

      <div role="status" aria-live="polite">
        {resendNotice && <div className="alert alert-success">{resendNotice}</div>}
      </div>

      {!loading && displayedTutors.length === 0 && (
        <div className="empty-state">
          <p>No tutors yet. Add your first tutor to get started.</p>
        </div>
      )}

      {!loading && displayedTutors.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Active Students</th>
              <th>Sessions Logged</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedTutors.map((t) => (
              <tr
                key={t._key}
                className={
                  t._type === 'pending' ? 'row-pending'
                  : t.is_active === false ? 'row-archived'
                  : ''
                }
              >
                <td data-label="Name">
                  {t.display_name || '\u2014'}
                  {t.otherRoles && t.otherRoles.length > 0 && (
                    <div className="form-hint">
                      Also {t.otherRoles.map((r) => ROLE_LABELS[r] || r).join(', ')}
                    </div>
                  )}
                </td>
                <td data-label="Email">{t.email}</td>
                <td data-label="Phone">{t.phone || '\u2014'}</td>
                <td data-label="Students">
                  {t._type === 'pending' ? '\u2014' : t.studentCount}
                </td>
                <td data-label="Sessions">
                  {t._type === 'pending' ? '\u2014' : t.sessionCount}
                </td>
                <td data-label="Status">{getStatusBadge(t)}</td>
                <td data-label="Actions">{renderActions(t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add Tutor Modal (multi-row) */}
      {showAddModal && (
        <Modal title="Add Tutor" onClose={closeAddModal} footer={addFooter}>
          {addError && <div className="alert alert-error">{addError}</div>}

          {addExisting.length > 0 && (
            <div
              style={{
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-inset)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                marginBottom: 'var(--space-4)',
              }}
            >
              <p style={{ margin: 0 }}>
                <strong>
                  {addExisting.length === 1 ? 'This person already has an account' : `${addExisting.length} people already have accounts`}.
                </strong>{' '}
                They get the tutor role right away, with no email, and keep every role they hold:
              </p>
              <ul style={{ margin: 'var(--space-2) 0 0', paddingLeft: 'var(--space-5)' }}>
                {addExisting.map((m) => (
                  <li key={m.account.id}>
                    {m.account.display_name || m.account.email}{' '}
                    <span className="form-hint">
                      ({describeRoles(m.account.roles)}
                      {m.account.roles.includes('tutor') ? '; already a tutor, nothing to add' : ''})
                    </span>
                  </li>
                ))}
              </ul>
              {addFreshCount > 0 && (
                <p style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-sm)' }}>
                  The other {addFreshCount === 1 ? 'tutor is' : `${addFreshCount} tutors are`} invited by email as usual.
                </p>
              )}
            </div>
          )}

          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Each tutor will receive an email invitation. They will appear on this page
            as "Invited" until they sign in.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            {addRows.map((row, idx) => (
              <div key={idx} className="form-row" style={{ alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 2 }}>
                  {idx === 0 && <label className="form-label">Name *</label>}
                  <input
                    className="input"
                    placeholder="Full name"
                    value={row.name}
                    onChange={(e) => updateAddRow(idx, 'name', e.target.value)}
                    autoFocus={idx === 0}
                  />
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  {idx === 0 && <label className="form-label">Email *</label>}
                  <input
                    type="email"
                    className="input"
                    placeholder="Email address"
                    value={row.email}
                    onChange={(e) => updateAddRow(idx, 'email', e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  {idx === 0 && <label className="form-label">Phone</label>}
                  <input
                    type="tel"
                    className="input"
                    placeholder="Phone"
                    value={row.phone}
                    onChange={(e) => updateAddRow(idx, 'phone', e.target.value)}
                  />
                </div>
                {addRows.length > 1 && (
                  <button
                    className="btn btn-small btn-outline"
                    onClick={() => removeAddRow(idx)}
                    title="Remove row"
                    style={{ marginBottom: '2px' }}
                  >
                    {'\u2715'}
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            className="btn btn-small btn-outline"
            onClick={addAnotherRow}
            style={{ marginTop: 'var(--space-3)' }}
          >
            + Add another
          </button>
        </Modal>
      )}

      {/* Edit Tutor Modal */}
      {editTarget && (
        <Modal title="Edit Tutor" onClose={closeEditModal} footer={editFooter}>
          {editError && <div className="alert alert-error">{editError}</div>}

          <div className="form-group">
            <label className="form-label">Name *</label>
            <input
              className="input"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Email
              {editTarget._type === 'claimed' && (
                <span className="form-hint" style={{ marginLeft: 'var(--space-2)' }}>
                  (cannot change after sign-in)
                </span>
              )}
            </label>
            <input
              type="email"
              className="input"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              disabled={editTarget._type === 'claimed'}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Phone</label>
            <input
              type="tel"
              className="input"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
            />
          </div>
        </Modal>
      )}

      {/* Cancel Invitation Confirm */}
      {cancelTarget && (
        <Modal
          title="Cancel Invitation"
          onClose={() => setCancelTarget(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setCancelTarget(null)}>Keep</button>
              <button
                className="btn btn-primary"
                style={{ backgroundColor: 'var(--color-error)' }}
                onClick={handleCancelInvitation}
              >
                Cancel Invitation
              </button>
            </>
          }
        >
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            This will remove the pending invitation for <strong>{cancelTarget.display_name || cancelTarget.email}</strong>.
            They will no longer be able to claim a tutor account with this email.
          </p>
        </Modal>
      )}

      {/* Deactivate Confirm Modal */}
      {deactivateTarget && (
        <Modal
          title="Deactivate Tutor"
          onClose={closeDeactivateModal}
          footer={
            <>
              <button className="btn btn-outline" onClick={closeDeactivateModal}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ backgroundColor: 'var(--color-error)' }}
                onClick={handleDeactivate}
                disabled={!deactivateConfirmChecked || deactivating}
              >
                {deactivating ? 'Deactivating...' : 'Deactivate Tutor'}
              </button>
            </>
          }
        >
          {deactivateError && <div className="alert alert-error">{deactivateError}</div>}

          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            This will deactivate <strong>{deactivateTarget.display_name}</strong>. They will be
            signed out and will not be able to sign in. They will no longer appear in tutor
            assignment dropdowns or on the active tutors list.
          </p>

          {deactivateTarget.sessionCount > 0 && (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
              This tutor has logged <strong>{deactivateTarget.sessionCount} session{deactivateTarget.sessionCount !== 1 ? 's' : ''}</strong>.
              Session history and attribution will be preserved.
            </p>
          )}

          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
            You can reactivate them at any time.
          </p>

          <label className="checkbox-row" style={{ marginTop: 'var(--space-4)' }}>
            <input
              type="checkbox"
              checked={deactivateConfirmChecked}
              onChange={(e) => setDeactivateConfirmChecked(e.target.checked)}
            />
            <span>I understand this tutor will be deactivated</span>
          </label>
        </Modal>
      )}

      {/* Remove tutor role (someone who also holds other roles) */}
      {removeRoleTarget && (
        <Modal
          title="Remove Tutor Role"
          onClose={closeRemoveRoleModal}
          footer={
            <>
              <button className="btn btn-outline" onClick={closeRemoveRoleModal}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ backgroundColor: 'var(--color-error)' }}
                onClick={handleRemoveRole}
                disabled={removingRole || removeRoleTarget.studentCount > 0}
              >
                {removingRole ? 'Removing...' : 'Remove Tutor Role'}
              </button>
            </>
          }
        >
          {removeRoleError && <div className="alert alert-error">{removeRoleError}</div>}

          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            <strong>{removeRoleTarget.display_name}</strong> will stop being a tutor and will no
            longer appear in tutor assignment dropdowns. They keep their other
            role{removeRoleTarget.otherRoles.length !== 1 ? 's' : ''} (
            {removeRoleTarget.otherRoles.map((r) => ROLE_LABELS[r] || r).join(', ')}).
          </p>

          {removeRoleTarget.sessionCount > 0 && (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
              Their <strong>{removeRoleTarget.sessionCount} logged session{removeRoleTarget.sessionCount !== 1 ? 's' : ''}</strong> stay
              in Session History, attributed to them.
            </p>
          )}

          {removeRoleTarget.studentCount > 0 && (
            <div className="alert alert-error" style={{ marginTop: 'var(--space-3)' }}>
              {removeRoleTarget.display_name} still has {removeRoleTarget.studentCount} active or
              deferred student{removeRoleTarget.studentCount !== 1 ? 's' : ''}. Reassign
              {removeRoleTarget.studentCount !== 1 ? ' them' : ' the student'} first, then remove the role.
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
