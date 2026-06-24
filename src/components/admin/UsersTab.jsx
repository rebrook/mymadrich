import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Modal from '../ui/Modal';

const ROLE_OPTIONS = ['admin', 'tutor', 'student', 'parent'];

const ROLE_LABELS = {
  admin: 'Administrator',
  tutor: 'Tutor',
  student: 'Student',
  parent: 'Parent / Guardian',
};

// App URL for invite messages: env variable with fallback
const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;

export default function UsersTab() {
  const { user: currentUser } = useAuth();

  // Data
  const [profiles, setProfiles] = useState([]);
  const [students, setStudents] = useState([]);
  const [guardians, setGuardians] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Link modal state
  const [linkProfile, setLinkProfile] = useState(null);
  const [selectedLinkTarget, setSelectedLinkTarget] = useState('');
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState(null);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'parent', student_id: '', guardian_id: '' });
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState(null);

  // Unlink confirm modal state
  const [unlinkTarget, setUnlinkTarget] = useState(null);
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState(null);

  // Copy feedback
  const [copiedId, setCopiedId] = useState(null);

  // ---- Fetch all data ----
  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, studentRes, guardianRes, inviteRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, email, display_name, role, phone, created_at, updated_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('students')
          .select('id, first_name, last_name, user_id, tutor_id, status'),
        supabase
          .from('student_guardians')
          .select('id, student_id, user_id, name, email, relationship'),
        supabase
          .from('pending_invitations')
          .select('*')
          .order('created_at', { ascending: false }),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (studentRes.error) throw studentRes.error;
      if (guardianRes.error) throw guardianRes.error;
      if (inviteRes.error) throw inviteRes.error;

      setProfiles(profileRes.data || []);
      setStudents(studentRes.data || []);
      setGuardians(guardianRes.data || []);
      setInvitations(inviteRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  // ---- Compute linkage info per profile ----
  function getLinkageInfo(profile) {
    switch (profile.role) {
      case 'tutor': {
        const assignedStudents = students.filter((s) => s.tutor_id === profile.id);
        const activeCount = assignedStudents.filter((s) => s.status === 'active' || s.status === 'deferred').length;
        if (activeCount === 0) return { text: 'No students assigned', linked: false };
        return { text: `${activeCount} student${activeCount !== 1 ? 's' : ''} assigned`, linked: true };
      }
      case 'student': {
        const student = students.find((s) => s.user_id === profile.id);
        if (!student) return { text: 'Not linked', linked: false };
        return { text: `${student.first_name} ${student.last_name}`, linked: true, studentId: student.id };
      }
      case 'parent': {
        const linkedGuardians = guardians.filter((g) => g.user_id === profile.id);
        if (linkedGuardians.length === 0) return { text: 'Not linked', linked: false };
        const studentNames = linkedGuardians.map((g) => {
          const student = students.find((s) => s.id === g.student_id);
          return student ? `${student.first_name} ${student.last_name}` : 'Unknown';
        });
        const unique = [...new Set(studentNames)];
        return { text: unique.join(', '), linked: true };
      }
      default:
        return { text: '\u2014', linked: false };
    }
  }

  // ---- Compute suggested links (guardian email matches) ----
  function getSuggestedLinks(profile) {
    if (!profile.email) return [];
    const matches = guardians.filter(
      (g) => g.email && g.email.toLowerCase() === profile.email.toLowerCase() && !g.user_id
    );
    return matches.map((g) => {
      const student = students.find((s) => s.id === g.student_id);
      return {
        guardianId: g.id,
        guardianName: g.name,
        studentName: student ? `${student.first_name} ${student.last_name}` : 'Unknown',
      };
    });
  }

  // ---- Role change ----
  async function handleRoleChange(profileId, newRole) {
    if (profileId === currentUser?.id) return;

    try {
      const { error: err } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', profileId);
      if (err) throw err;

      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, role: newRole } : p))
      );
    } catch (err) {
      setError(`Failed to update role: ${err.message}`);
    }
  }

  // ---- Link account ----
  function openLinkModal(profile) {
    setLinkProfile(profile);
    setSelectedLinkTarget('');
    setLinkError(null);
  }

  function closeLinkModal() {
    setLinkProfile(null);
    setSelectedLinkTarget('');
    setLinkError(null);
  }

  async function handleLink() {
    if (!selectedLinkTarget || !linkProfile) return;

    setLinkSaving(true);
    setLinkError(null);
    try {
      if (linkProfile.role === 'student') {
        const { error: err } = await supabase
          .from('students')
          .update({ user_id: linkProfile.id })
          .eq('id', selectedLinkTarget);
        if (err) throw err;
      } else if (linkProfile.role === 'parent') {
        const { error: err } = await supabase
          .from('student_guardians')
          .update({ user_id: linkProfile.id })
          .eq('id', selectedLinkTarget);
        if (err) throw err;
      }

      closeLinkModal();
      await fetchAll();
    } catch (err) {
      setLinkError(err.message);
    } finally {
      setLinkSaving(false);
    }
  }

  // ---- Quick-link suggestion ----
  async function handleQuickLink(profileId, guardianId) {
    try {
      const profile = profiles.find((p) => p.id === profileId);
      if (profile && profile.role !== 'parent') {
        const { error: roleErr } = await supabase
          .from('profiles')
          .update({ role: 'parent' })
          .eq('id', profileId);
        if (roleErr) throw roleErr;
      }

      const { error: err } = await supabase
        .from('student_guardians')
        .update({ user_id: profileId })
        .eq('id', guardianId);
      if (err) throw err;

      await fetchAll();
    } catch (err) {
      setError(`Failed to link: ${err.message}`);
    }
  }

  // ---- Unlink account (with confirm gate) ----

  function openUnlinkModal(profile) {
    setUnlinkTarget(profile);
    setUnlinkError(null);
  }

  function closeUnlinkModal() {
    setUnlinkTarget(null);
    setUnlinkError(null);
  }

  /**
   * Get a human-readable description of what will be unlinked for the confirm modal.
   */
  function getUnlinkDescription(profile) {
    if (profile.role === 'student') {
      const student = students.find((s) => s.user_id === profile.id);
      if (student) {
        return `This will unlink ${profile.display_name}'s sign-in account from the student record for ${student.first_name} ${student.last_name}. The student record, session history, and all mastery data will remain intact. ${profile.display_name} will no longer be able to view their dashboard until re-linked.`;
      }
      return `This will unlink ${profile.display_name}'s account.`;
    }

    if (profile.role === 'parent') {
      const linkedGuardians = guardians.filter((g) => g.user_id === profile.id);
      const studentNames = linkedGuardians.map((g) => {
        const student = students.find((s) => s.id === g.student_id);
        return student ? `${student.first_name} ${student.last_name}` : 'Unknown';
      });
      const unique = [...new Set(studentNames)];
      const childList = unique.join(', ');

      return `This will unlink ${profile.display_name}'s sign-in account from all guardian records (currently linked to: ${childList}). The guardian contact information and student records will remain intact. ${profile.display_name} will no longer be able to view any family dashboards until re-linked.`;
    }

    return `This will unlink ${profile.display_name}'s account.`;
  }

  async function handleUnlinkConfirmed() {
    if (!unlinkTarget) return;
    setUnlinking(true);
    setUnlinkError(null);
    try {
      if (unlinkTarget.role === 'student') {
        const student = students.find((s) => s.user_id === unlinkTarget.id);
        if (student) {
          const { error: err } = await supabase
            .from('students')
            .update({ user_id: null })
            .eq('id', student.id);
          if (err) throw err;
        }
      } else if (unlinkTarget.role === 'parent') {
        const linkedGuardians = guardians.filter((g) => g.user_id === unlinkTarget.id);
        for (const g of linkedGuardians) {
          const { error: err } = await supabase
            .from('student_guardians')
            .update({ user_id: null })
            .eq('id', g.id);
          if (err) throw err;
        }
      }

      closeUnlinkModal();
      await fetchAll();
    } catch (err) {
      setUnlinkError(err.message);
    } finally {
      setUnlinking(false);
    }
  }

  // ---- Invite user ----
  function openInviteModal() {
    setInviteForm({ email: '', role: 'parent', student_id: '', guardian_id: '' });
    setInviteError(null);
    setShowInviteModal(true);
  }

  function closeInviteModal() {
    setShowInviteModal(false);
    setInviteForm({ email: '', role: 'parent', student_id: '', guardian_id: '' });
    setInviteError(null);
  }

  async function handleInvite() {
    const email = inviteForm.email.trim().toLowerCase();
    if (!email) {
      setInviteError('Email is required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError('Please enter a valid email address.');
      return;
    }

    // Check for existing profile with this email
    const existingProfile = profiles.find((p) => p.email.toLowerCase() === email);
    if (existingProfile) {
      setInviteError(`A user with this email already exists (${existingProfile.display_name}).`);
      return;
    }

    // Check for duplicate pending invitation
    const existingInvite = invitations.find(
      (inv) => inv.email.toLowerCase() === email && !inv.accepted_at
    );
    if (existingInvite) {
      setInviteError('A pending invitation already exists for this email.');
      return;
    }

    setInviteSaving(true);
    setInviteError(null);
    try {
      const payload = {
        email,
        intended_role: inviteForm.role,
        invited_by: currentUser.id,
      };

      if (inviteForm.role === 'student' && inviteForm.student_id) {
        payload.student_id = inviteForm.student_id;
      }
      if (inviteForm.role === 'parent' && inviteForm.guardian_id) {
        payload.guardian_id = inviteForm.guardian_id;
      }

      const { error: err } = await supabase
        .from('pending_invitations')
        .insert(payload);
      if (err) throw err;

      closeInviteModal();
      await fetchAll();
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviteSaving(false);
    }
  }

  // ---- Cancel invitation ----
  async function handleCancelInvite(inviteId) {
    try {
      const { error: err } = await supabase
        .from('pending_invitations')
        .delete()
        .eq('id', inviteId);
      if (err) throw err;

      setInvitations((prev) => prev.filter((inv) => inv.id !== inviteId));
    } catch (err) {
      setError(`Failed to cancel invitation: ${err.message}`);
    }
  }

  // ---- Copy invite message ----
  function getInviteMessage(email) {
    return `You\u2019ve been invited to MyMadrich, the B\u2019nai Mitzvah tutoring progress tracker for Chizuk Amuno Congregation.\n\nTo get started, visit the link below and sign in with your Google account or use the magic link option to sign in with your email address:\n${APP_URL}\n\nIf you have any questions, please reach out to your B\u2019nai Mitzvah coordinator.`;
  }

  async function handleCopyMessage(inviteId, email) {
    try {
      await navigator.clipboard.writeText(getInviteMessage(email));
      setCopiedId(inviteId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      // Fallback for browsers that don't support clipboard API
      setError('Unable to copy to clipboard. Please copy the message manually.');
    }
  }

  // ---- Formatting helpers ----
  function formatDate(dateStr) {
    if (!dateStr) return '\u2014';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function getRoleBadgeClass(role) {
    const map = {
      admin: 'badge-admin',
      tutor: 'badge-active',
      student: 'badge-deferred',
      parent: 'badge-completed',
    };
    return map[role] || '';
  }

  // ---- Filter profiles ----
  const filtered = profiles.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = (p.display_name || '').toLowerCase();
    const email = (p.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  // ---- Get available targets for link modal ----
  function getLinkTargets() {
    if (!linkProfile) return [];

    if (linkProfile.role === 'student') {
      return students
        .filter((s) => !s.user_id)
        .map((s) => ({
          id: s.id,
          label: `${s.first_name} ${s.last_name}`,
        }));
    }

    if (linkProfile.role === 'parent') {
      return guardians
        .filter((g) => !g.user_id)
        .map((g) => {
          const student = students.find((s) => s.id === g.student_id);
          const studentName = student ? `${student.first_name} ${student.last_name}` : 'Unknown';
          return {
            id: g.id,
            label: `${g.name} (${g.relationship}) \u2014 ${studentName}`,
          };
        });
    }

    return [];
  }

  // ---- Invitation display helpers ----
  const pendingInvitations = invitations.filter((inv) => !inv.accepted_at);
  const acceptedInvitations = invitations.filter((inv) => inv.accepted_at);

  function getInviteLinkageLabel(inv) {
    if (inv.student_id) {
      const student = students.find((s) => s.id === inv.student_id);
      return student ? `${student.first_name} ${student.last_name}` : 'Unknown student';
    }
    if (inv.guardian_id) {
      const guardian = guardians.find((g) => g.id === inv.guardian_id);
      if (!guardian) return 'Unknown guardian';
      const student = students.find((s) => s.id === guardian.student_id);
      const studentName = student ? `${student.first_name} ${student.last_name}` : '';
      return `${guardian.name}${studentName ? ` (${studentName})` : ''}`;
    }
    return '\u2014';
  }

  // ---- Render ----

  if (loading) return <p>Loading users...</p>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const linkTargets = linkProfile ? getLinkTargets() : [];

  const linkFooter = (
    <>
      <button className="btn btn-outline" onClick={closeLinkModal}>Cancel</button>
      <button
        className="btn btn-primary"
        onClick={handleLink}
        disabled={!selectedLinkTarget || linkSaving}
      >
        {linkSaving ? 'Linking...' : 'Link Account'}
      </button>
    </>
  );

  const inviteFooter = (
    <>
      <button className="btn btn-outline" onClick={closeInviteModal}>Cancel</button>
      <button
        className="btn btn-primary"
        onClick={handleInvite}
        disabled={!inviteForm.email.trim() || inviteSaving}
      >
        {inviteSaving ? 'Creating...' : 'Create Invitation'}
      </button>
    </>
  );

  return (
    <div>
      <div className="section-header">
        <h3>Users</h3>
        <div className="action-buttons">
          <span className="form-hint">{profiles.length} registered</span>
          <button className="btn btn-primary" onClick={openInviteModal}>
            Invite User
          </button>
        </div>
      </div>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--space-4)' }}>
          <h4>Pending Invitations ({pendingInvitations.length})</h4>
          <div className="invite-list">
            {pendingInvitations.map((inv) => (
              <div key={inv.id} className="invite-row">
                <div className="invite-row-info">
                  <strong>{inv.email}</strong>
                  <div className="invite-row-meta">
                    <span className={`badge ${getRoleBadgeClass(inv.intended_role)}`}>
                      {ROLE_LABELS[inv.intended_role] || inv.intended_role}
                    </span>
                    {(inv.student_id || inv.guardian_id) && (
                      <span className="form-hint">
                        {'\u2192'} {getInviteLinkageLabel(inv)}
                      </span>
                    )}
                    <span className="form-hint">Invited {formatDate(inv.created_at)}</span>
                  </div>
                </div>
                <div className="action-buttons">
                  <button
                    className="btn btn-small btn-outline"
                    onClick={() => handleCopyMessage(inv.id, inv.email)}
                  >
                    {copiedId === inv.id ? '\u2713 Copied' : 'Copy Message'}
                  </button>
                  <button
                    className="btn btn-small btn-outline"
                    onClick={() => handleCancelInvite(inv.id)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      {profiles.length > 0 && (
        <div style={{ marginTop: 'var(--space-3)', maxWidth: '320px' }}>
          <input
            className="input"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {/* Users table */}
      {profiles.length === 0 ? (
        <div className="empty-state">
          <p>No users have signed in yet. Use "Invite User" to send invitations, then users will appear here after they sign in.</p>
          <button
            className="btn btn-primary btn-small empty-state-action"
            onClick={openInviteModal}
            type="button"
          >
            Invite User
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p>No users match your search.</p>
        </div>
      ) : (
        <table className="data-table" style={{ marginTop: 'var(--space-3)' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Linked To</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const linkage = getLinkageInfo(p);
              const suggestions = getSuggestedLinks(p);
              const isCurrentUser = p.id === currentUser?.id;
              const canLink = (p.role === 'student' || p.role === 'parent') && !linkage.linked;
              const canUnlink = (p.role === 'student' || p.role === 'parent') && linkage.linked;

              return (
                <tr key={p.id}>
                  <td data-label="Name">
                    <span style={{ fontWeight: 500 }}>
                      {p.display_name || 'Unnamed'}
                    </span>
                    {isCurrentUser && (
                      <span className="form-hint" style={{ marginLeft: 'var(--space-2)' }}>(you)</span>
                    )}
                  </td>
                  <td data-label="Email">{p.email}</td>
                  <td data-label="Role">
                    {isCurrentUser ? (
                      <span className={`badge ${getRoleBadgeClass(p.role)}`}>
                        {ROLE_LABELS[p.role] || p.role}
                      </span>
                    ) : (
                      <select
                        className="input users-role-select"
                        value={p.role}
                        onChange={(e) => handleRoleChange(p.id, e.target.value)}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td data-label="Linked To">
                    <span className={linkage.linked ? '' : 'form-hint'}>
                      {linkage.text}
                    </span>
                    {suggestions.length > 0 && (
                      <div className="users-suggestions">
                        {suggestions.map((sg) => (
                          <div key={sg.guardianId} className="users-suggestion-row">
                            <span className="form-hint">
                              Match: {sg.guardianName} ({sg.studentName})
                            </span>
                            <button
                              className="btn btn-small btn-primary"
                              onClick={() => handleQuickLink(p.id, sg.guardianId)}
                            >
                              Link
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td data-label="Joined">{formatDate(p.created_at)}</td>
                  <td data-label="Actions">
                    <div className="action-buttons">
                      {canLink && (
                        <button
                          className="btn btn-small btn-outline"
                          onClick={() => openLinkModal(p)}
                        >
                          Link
                        </button>
                      )}
                      {canUnlink && (
                        <button
                          className="btn btn-small btn-outline"
                          onClick={() => openUnlinkModal(p)}
                        >
                          Unlink
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Link Account Modal */}
      {linkProfile && (
        <Modal
          title={`Link ${linkProfile.display_name}'s Account`}
          onClose={closeLinkModal}
          footer={linkFooter}
        >
          {linkError && <div className="alert alert-error">{linkError}</div>}

          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            {linkProfile.role === 'student'
              ? 'Select which student record to connect to this account. Once linked, this user will see their own dashboard and session history.'
              : 'Select which guardian record to connect to this account. Once linked, this user will see their child\'s dashboard and session history.'
            }
          </p>

          <div className="form-group">
            <label className="form-label">
              {linkProfile.role === 'student' ? 'Student' : 'Guardian'} *
            </label>
            {linkTargets.length === 0 ? (
              <p className="form-hint">
                {linkProfile.role === 'student'
                  ? 'No unlinked student records available.'
                  : 'No unlinked guardian records available.'
                }
              </p>
            ) : (
              <select
                className="input"
                value={selectedLinkTarget}
                onChange={(e) => setSelectedLinkTarget(e.target.value)}
              >
                <option value="">Select...</option>
                {linkTargets.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            )}
          </div>
        </Modal>
      )}

      {/* Unlink Confirm Modal */}
      {unlinkTarget && (
        <Modal
          title={`Unlink ${unlinkTarget.display_name}'s Account`}
          onClose={closeUnlinkModal}
          footer={
            <>
              <button className="btn btn-outline" onClick={closeUnlinkModal}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleUnlinkConfirmed}
                disabled={unlinking}
              >
                {unlinking ? 'Unlinking...' : 'Unlink Account'}
              </button>
            </>
          }
        >
          {unlinkError && <div className="alert alert-error">{unlinkError}</div>}

          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            {getUnlinkDescription(unlinkTarget)}
          </p>
        </Modal>
      )}

      {/* Invite User Modal */}
      {showInviteModal && (
        <Modal
          title="Invite User"
          onClose={closeInviteModal}
          footer={inviteFooter}
        >
          {inviteError && <div className="alert alert-error">{inviteError}</div>}

          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Create an invitation for a new user. After creating the invitation, copy the invite message and send it to them via email or text. When they sign in, their role and account linkage will be applied automatically.
          </p>

          <div className="form-group">
            <label className="form-label">Email Address *</label>
            <input
              className="input"
              type="email"
              value={inviteForm.email}
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              placeholder="user@example.com"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Role *</label>
            <select
              className="input"
              value={inviteForm.role}
              onChange={(e) => setInviteForm({
                ...inviteForm,
                role: e.target.value,
                student_id: '',
                guardian_id: '',
              })}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          {/* Optional linkage for student role */}
          {inviteForm.role === 'student' && (
            <div className="form-group">
              <label className="form-label">Link to Student Record (optional)</label>
              <select
                className="input"
                value={inviteForm.student_id}
                onChange={(e) => setInviteForm({ ...inviteForm, student_id: e.target.value })}
              >
                <option value="">None (link later)</option>
                {students.filter((s) => !s.user_id).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Optional linkage for parent role */}
          {inviteForm.role === 'parent' && (
            <div className="form-group">
              <label className="form-label">Link to Guardian Record (optional)</label>
              <select
                className="input"
                value={inviteForm.guardian_id}
                onChange={(e) => setInviteForm({ ...inviteForm, guardian_id: e.target.value })}
              >
                <option value="">None (link later)</option>
                {guardians.filter((g) => !g.user_id).map((g) => {
                  const student = students.find((s) => s.id === g.student_id);
                  const studentName = student ? `${student.first_name} ${student.last_name}` : '';
                  return (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.relationship}){studentName ? ` \u2014 ${studentName}` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
