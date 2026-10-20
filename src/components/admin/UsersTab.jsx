import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Modal from '../ui/Modal';
import { sortRoles, ROLE_ORDER } from '../../utils/roles';
import { planRoleChanges, defaultPrimary } from '../../utils/roleChanges';
import { findAccountByEmail, describeRoles } from '../../utils/existingAccounts';

const ROLE_OPTIONS = ['admin', 'tutor', 'student', 'parent'];

const ROLE_LABELS = {
  admin: 'Administrator',
  tutor: 'Tutor',
  student: 'Student',
  parent: 'Parent / Guardian',
};

const ROLE_HELP = {
  admin: 'Full access to every screen and setting',
  tutor: 'Can be assigned students and log sessions',
  parent: 'Sees the progress of the children linked to them',
  student: 'Sees their own progress',
};

// App URL for invite messages: env variable with fallback
const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;

export default function UsersTab() {
  const { user: currentUser, refreshProfile } = useAuth();

  // Data
  const [profiles, setProfiles] = useState([]);
  const [students, setStudents] = useState([]);
  const [guardians, setGuardians] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [rolesByProfile, setRolesByProfile] = useState({}); // profile id -> roles they hold
  const [studentTutors, setStudentTutors] = useState([]); // every student-tutor assignment
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
  const [inviteExisting, setInviteExisting] = useState(null); // an existing account that matches the invited email

  // Unlink confirm modal state
  const [unlinkTarget, setUnlinkTarget] = useState(null);
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState(null);

  // Copy feedback
  const [copiedId, setCopiedId] = useState(null);

  // Inactive accounts: hidden unless this is ticked (mirrors the Tutors tab toggle)
  const [showInactive, setShowInactive] = useState(false);

  // Deactivate confirm modal state
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateConfirmChecked, setDeactivateConfirmChecked] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState(null);

  // Reactivate failure (shown above the table; the page-level error would replace the whole tab)
  const [reactivateError, setReactivateError] = useState(null);

  // Manage roles dialog state
  const [manageId, setManageId] = useState(null); // person being edited
  const [manageWanted, setManageWanted] = useState([]); // roles ticked in the dialog
  const [managePrimary, setManagePrimary] = useState(null); // "opens as" choice
  const [manageSaving, setManageSaving] = useState(false);
  const [manageError, setManageError] = useState(null);
  const [roleNotice, setRoleNotice] = useState(''); // confirmation, read aloud to screen readers

  // ---- Fetch all data ----
  async function fetchAll({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [profileRes, studentRes, guardianRes, inviteRes, roleRes, assignRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, email, display_name, role, phone, created_at, updated_at, is_active')
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
        supabase.from('profile_roles').select('profile_id, role'),
        supabase.from('student_tutors').select('student_id, tutor_id'),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (studentRes.error) throw studentRes.error;
      if (guardianRes.error) throw guardianRes.error;
      if (inviteRes.error) throw inviteRes.error;
      if (roleRes.error) throw roleRes.error;
      if (assignRes.error) throw assignRes.error;

      setProfiles(profileRes.data || []);
      setStudents(studentRes.data || []);
      setGuardians(guardianRes.data || []);
      setInvitations(inviteRes.data || []);
      const byProfile = {};
      (roleRes.data || []).forEach((r) => {
        if (!byProfile[r.profile_id]) byProfile[r.profile_id] = [];
        byProfile[r.profile_id].push(r.role);
      });
      setRolesByProfile(byProfile);
      setStudentTutors(assignRes.data || []);
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
  function getLinkageInfo(profile, role = profile.role) {
    switch (role) {
      case 'tutor': {
        // Every student assigned to this tutor counts (tutors are equal; not only those they were assigned first)
        const assignedIds = new Set(studentTutors.filter((a) => a.tutor_id === profile.id).map((a) => a.student_id));
        const activeCount = students.filter((s) => assignedIds.has(s.id) && (s.status === 'active' || s.status === 'deferred')).length;
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

  // ---- Roles a person holds (their primary role if the lookup has nothing) ----
  function getProfileRoles(profile) {
    const held = rolesByProfile[profile.id];
    return sortRoles(held && held.length > 0 ? held : [profile.role]);
  }

  // Active or deferred students assigned to a person (explains why a tutor role cannot be removed yet)
  function countActiveAssignments(profileId) {
    const assignedIds = new Set(studentTutors.filter((a) => a.tutor_id === profileId).map((a) => a.student_id));
    return students.filter((s) => assignedIds.has(s.id) && (s.status === 'active' || s.status === 'deferred')).length;
  }

  // ---- Manage roles ----
  function openManageRoles(profile) {
    setManageId(profile.id);
    setManageWanted(getProfileRoles(profile));
    setManagePrimary(profile.role);
    setManageError(null);
  }

  function closeManageRoles() {
    setManageId(null);
    setManageWanted([]);
    setManagePrimary(null);
    setManageError(null);
  }

  function toggleManageRole(role) {
    const next = manageWanted.includes(role)
      ? manageWanted.filter((r) => r !== role)
      : sortRoles([...manageWanted, role]);
    setManageWanted(next);
    setManagePrimary(defaultPrimary(next, managePrimary));
  }

  async function handleSaveRoles() {
    const target = profiles.find((p) => p.id === manageId);
    if (!target) return;

    const steps = planRoleChanges({
      held: getProfileRoles(target),
      wanted: manageWanted,
      primary: target.role,
      wantedPrimary: managePrimary,
    });
    if (steps.length === 0) {
      closeManageRoles();
      return;
    }

    setManageSaving(true);
    setManageError(null);
    const name = target.display_name || target.email;
    const isSelf = target.id === currentUser?.id;
    let completed = 0;
    try {
      for (const step of steps) {
        const { error: err } = await supabase.rpc(step.rpc, {
          p_profile_id: target.id,
          p_role: step.role,
        });
        if (err) throw err;
        completed += 1;
      }
      closeManageRoles();
      setRoleNotice('');
      setTimeout(() => setRoleNotice(`Roles updated for ${name}.`), 50);
      await fetchAll({ silent: true });
      if (isSelf && refreshProfile) await refreshProfile();
    } catch (err) {
      // Earlier steps were saved. Reload so the dialog shows the real state, and say what happened.
      setManageError(
        completed > 0
          ? `${completed} of ${steps.length} changes were saved before one stopped: ${err.message}`
          : err.message
      );
      await fetchAll({ silent: true });
      if (isSelf && completed > 0 && refreshProfile) await refreshProfile();
    } finally {
      setManageSaving(false);
    }
  }

  // ---- Link account ----
  // `kind` is the record to link: 'student' or 'parent' (a guardian record). The dialog reads it as `role`.
  function openLinkModal(profile, kind = profile.role) {
    setLinkProfile({ ...profile, role: kind });
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
      // Add the parent role (keeping any role they already hold, such as administrator)
      const held = rolesByProfile[profileId] || [];
      if (!held.includes('parent')) {
        const { error: roleErr } = await supabase.rpc('grant_role', {
          p_profile_id: profileId,
          p_role: 'parent',
        });
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

  // ---- Deactivate / Reactivate account (soft: nothing is deleted) ----

  function openDeactivateModal(profile) {
    setDeactivateTarget(profile);
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
      const { error: err } = await supabase.rpc('deactivate_user', {
        p_profile_id: deactivateTarget.id,
      });
      if (err) throw err;
      closeDeactivateModal();
      await fetchAll({ silent: true });
    } catch (err) {
      setDeactivateError(err.message);
    } finally {
      setDeactivating(false);
    }
  }

  async function handleReactivate(profile) {
    setReactivateError(null);
    try {
      const { error: err } = await supabase.rpc('activate_user', {
        p_profile_id: profile.id,
      });
      if (err) throw err;
      await fetchAll({ silent: true });
    } catch (err) {
      setReactivateError(`Could not reactivate ${profile.display_name || profile.email}: ${err.message}`);
    }
  }

  // ---- Unlink account (with confirm gate) ----

  function openUnlinkModal(profile, kind = profile.role) {
    setUnlinkTarget({ ...profile, role: kind });
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
    setInviteExisting(null);
    setShowInviteModal(true);
  }

  function closeInviteModal() {
    setShowInviteModal(false);
    setInviteForm({ email: '', role: 'parent', student_id: '', guardian_id: '' });
    setInviteError(null);
    setInviteExisting(null);
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

    // An email that already has an account: offer to add the role to that account instead of inviting
    const existingAccount = findAccountByEmail(
      profiles.map((p) => ({ ...p, roles: getProfileRoles(p) })),
      email
    );
    if (existingAccount) {
      setInviteError(null);
      setInviteExisting(existingAccount);
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
  // ---- Add the role to an account that already exists (instead of inviting) ----
  async function handleAddRoleInstead() {
    if (!inviteExisting) return;
    const account = profiles.find((p) => p.id === inviteExisting.id) || inviteExisting;
    const role = inviteForm.role;
    setInviteSaving(true);
    setInviteError(null);
    try {
      if (!getProfileRoles(account).includes(role)) {
        const { error: err } = await supabase.rpc('grant_role', {
          p_profile_id: account.id,
          p_role: role,
        });
        if (err) throw err;
      }

      // The invitation would have linked a record when they signed in; do it now
      if (role === 'parent' && inviteForm.guardian_id) {
        const guardian = guardians.find((g) => g.id === inviteForm.guardian_id);
        if (guardian && !guardian.user_id) {
          const { error: err } = await supabase
            .from('student_guardians')
            .update({ user_id: account.id })
            .eq('id', guardian.id);
          if (err) throw err;
        }
      }
      if (role === 'student' && inviteForm.student_id) {
        const student = students.find((s) => s.id === inviteForm.student_id);
        if (student && !student.user_id) {
          const { error: err } = await supabase
            .from('students')
            .update({ user_id: account.id })
            .eq('id', student.id);
          if (err) throw err;
        }
      }

      const name = account.display_name || account.email;
      closeInviteModal();
      setRoleNotice('');
      setTimeout(() => setRoleNotice(`${name} now holds the ${ROLE_LABELS[role]} role.`), 50);
      await fetchAll({ silent: true });
      if (account.id === currentUser?.id && refreshProfile) await refreshProfile();
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviteSaving(false);
    }
  }

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
  const inactiveCount = profiles.filter((p) => p.is_active === false).length;

  // Deactivate dialog: a tutor with active students must have them reassigned first
  const deactivateStudentCount = deactivateTarget && getProfileRoles(deactivateTarget).includes('tutor')
    ? countActiveAssignments(deactivateTarget.id)
    : 0;
  const filtered = profiles.filter((p) => {
    if (p.is_active === false && !showInactive) return false;
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

  // ---- Manage roles dialog (derived values) ----
  const manageTarget = manageId ? profiles.find((p) => p.id === manageId) : null;
  const manageHeld = manageTarget ? getProfileRoles(manageTarget) : [];
  const manageName = manageTarget ? (manageTarget.display_name || manageTarget.email) : '';
  const manageIsSelf = manageTarget ? manageTarget.id === currentUser?.id : false;
  const manageActiveStudents = manageTarget ? countActiveAssignments(manageTarget.id) : 0;
  const manageBlockedByStudents =
    manageHeld.includes('tutor') && !manageWanted.includes('tutor') && manageActiveStudents > 0;
  const manageSteps = manageTarget
    ? planRoleChanges({
        held: manageHeld,
        wanted: manageWanted,
        primary: manageTarget.role,
        wantedPrimary: managePrimary,
      })
    : [];
  const manageCanSave =
    Boolean(manageTarget) && manageWanted.length > 0 && manageSteps.length > 0 && !manageBlockedByStudents && !manageSaving;

  const manageFooter = (
    <>
      <button className="btn btn-outline" onClick={closeManageRoles}>Cancel</button>
      <button className="btn btn-primary" onClick={handleSaveRoles} disabled={!manageCanSave}>
        {manageSaving ? 'Saving...' : 'Save Roles'}
      </button>
    </>
  );

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

  // ---- Invite dialog: when the email already has an account ----
  const invAccount = inviteExisting ? (profiles.find((p) => p.id === inviteExisting.id) || inviteExisting) : null;
  const invHeld = invAccount ? getProfileRoles(invAccount) : [];
  const invRole = inviteForm.role;
  const invAlreadyHolds = invHeld.includes(invRole);
  // The record the invitation would have linked, if one was chosen and is still unlinked
  const invRecord =
    invRole === 'parent' && inviteForm.guardian_id
      ? guardians.find((g) => g.id === inviteForm.guardian_id)
      : invRole === 'student' && inviteForm.student_id
        ? students.find((s) => s.id === inviteForm.student_id)
        : null;
  const invLinkable = Boolean(invRecord && !invRecord.user_id);
  const invNothingToDo = invAlreadyHolds && !invLinkable;

  const inviteFooter = inviteExisting ? (
    <>
      <button className="btn btn-outline" onClick={() => setInviteExisting(null)}>Back</button>
      <button
        className="btn btn-primary"
        onClick={handleAddRoleInstead}
        disabled={inviteSaving || invNothingToDo}
      >
        {inviteSaving
          ? 'Adding...'
          : invLinkable
            ? (invAlreadyHolds ? 'Link Record' : 'Add Role and Link')
            : 'Add Role'}
      </button>
    </>
  ) : (
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

      <div role="status" aria-live="polite">
        {roleNotice && <div className="alert alert-success">{roleNotice}</div>}
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

      {inactiveCount > 0 && (
        <label className="checkbox-row" style={{ marginTop: 'var(--space-2)' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          <span>Show inactive accounts ({inactiveCount})</span>
        </label>
      )}

      {reactivateError && (
        <div className="alert alert-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
          {reactivateError}
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
        <div className="data-table-wrap" tabIndex={0} role="region" aria-label="Users table, scrollable" style={{ marginTop: 'var(--space-3)' }}>
        <table className="data-table">
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
              const roles = getProfileRoles(p);
              const multiRole = roles.length > 1;
              const suggestions = getSuggestedLinks(p);
              const isCurrentUser = p.id === currentUser?.id;
              // Records this person can be linked to, by the roles they hold
              const linkKinds = ['student', 'parent'].filter((k) => roles.includes(k));
              const linkableKinds = linkKinds.filter((k) => !getLinkageInfo(p, k).linked);
              const unlinkableKinds = linkKinds.filter((k) => getLinkageInfo(p, k).linked);
              const linkLines = roles
                .filter((r) => r !== 'admin')
                .map((r) => ({ role: r, ...getLinkageInfo(p, r) }));
              const isInactive = p.is_active === false;
              // Anyone but you. The database also refuses the last active administrator
              // and a tutor who still has active students, with a plain message.
              const canDeactivate = !isInactive && !isCurrentUser;

              return (
                <tr key={p.id}>
                  <td data-label="Name">
                    <span style={{ fontWeight: 500 }}>
                      {p.display_name || 'Unnamed'}
                    </span>
                    {isCurrentUser && (
                      <span className="form-hint" style={{ marginLeft: 'var(--space-2)' }}>(you)</span>
                    )}
                    {isInactive && (
                      <span className="badge badge-archived" style={{ marginLeft: 'var(--space-2)' }}>Inactive</span>
                    )}
                  </td>
                  <td data-label="Email">{p.email}</td>
                  <td data-label="Role">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                      {roles.map((r) => (
                        <span key={r} className={`badge ${getRoleBadgeClass(r)}`}>
                          {ROLE_LABELS[r] || r}
                        </span>
                      ))}
                    </div>
                    {multiRole && (
                      <div className="form-hint">Opens as {ROLE_LABELS[p.role] || p.role}</div>
                    )}
                  </td>
                  <td data-label="Linked To">
                    {linkLines.length === 0 && <span className="form-hint">{'\u2014'}</span>}
                    {linkLines.length === 1 && !multiRole && (
                      <span className={linkLines[0].linked ? '' : 'form-hint'}>{linkLines[0].text}</span>
                    )}
                    {multiRole && linkLines.map((line) => (
                      <div key={line.role}>
                        <span className="form-hint">{ROLE_LABELS[line.role]}: </span>
                        <span className={line.linked ? '' : 'form-hint'}>{line.text}</span>
                      </div>
                    ))}
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
                      <button
                        className="btn btn-small btn-outline"
                        onClick={() => openManageRoles(p)}
                        aria-label={`Manage roles for ${p.display_name || p.email}`}
                      >
                        Manage roles
                      </button>
                      {linkableKinds.map((k) => (
                        <button
                          key={`link-${k}`}
                          className="btn btn-small btn-outline"
                          onClick={() => openLinkModal(p, k)}
                        >
                          {multiRole ? (k === 'student' ? 'Link student' : 'Link guardian') : 'Link'}
                        </button>
                      ))}
                      {unlinkableKinds.map((k) => (
                        <button
                          key={`unlink-${k}`}
                          className="btn btn-small btn-outline"
                          onClick={() => openUnlinkModal(p, k)}
                        >
                          {multiRole ? (k === 'student' ? 'Unlink student' : 'Unlink guardian') : 'Unlink'}
                        </button>
                      ))}
                      {canDeactivate && (
                        <button
                          className="btn btn-small btn-danger-outline"
                          onClick={() => openDeactivateModal(p)}
                          aria-label={`Deactivate ${p.display_name || p.email}`}
                        >
                          Deactivate
                        </button>
                      )}
                      {isInactive && (
                        <button
                          className="btn btn-small btn-outline"
                          onClick={() => handleReactivate(p)}
                          aria-label={`Reactivate ${p.display_name || p.email}`}
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      {/* Manage Roles Modal */}
      {manageTarget && (
        <Modal
          title={`Manage Roles: ${manageName}`}
          onClose={closeManageRoles}
          footer={manageFooter}
        >
          {manageError && <div className="alert alert-error">{manageError}</div>}

          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Choose every role {manageName} should hold. Changes apply when you save.
          </p>

          <fieldset style={{ border: 'none', padding: 0, margin: 'var(--space-3) 0 0' }}>
            <legend className="sr-only">Roles</legend>
            {ROLE_ORDER.map((r) => {
              const lockedAdmin = r === 'admin' && manageIsSelf && manageHeld.includes('admin');
              return (
                <label
                  key={r}
                  className="checkbox-row"
                  style={{ alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}
                >
                  <input
                    type="checkbox"
                    checked={manageWanted.includes(r)}
                    disabled={lockedAdmin || manageSaving}
                    onChange={() => toggleManageRole(r)}
                  />
                  <span>
                    <strong>{ROLE_LABELS[r]}</strong>
                    <span className="form-hint" style={{ display: 'block' }}>
                      {lockedAdmin ? 'You cannot remove your own administrator role.' : ROLE_HELP[r]}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          {manageWanted.length === 0 && (
            <div className="alert alert-error">Choose at least one role.</div>
          )}

          {manageBlockedByStudents && (
            <div className="alert alert-error">
              {manageName} still has {manageActiveStudents} active or deferred
              student{manageActiveStudents !== 1 ? 's' : ''}. Reassign
              {manageActiveStudents !== 1 ? ' them' : ' the student'} first, then remove the tutor role.
            </div>
          )}

          {manageWanted.length > 1 && (
            <fieldset style={{ border: 'none', padding: 0, margin: 'var(--space-4) 0 0' }}>
              <legend className="form-label">Opens as</legend>
              <span className="form-hint" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
                Their default view. They can switch from the account menu at any time.
              </span>
              {manageWanted.map((r) => (
                <label key={r} className="checkbox-row">
                  <input
                    type="radio"
                    name="manage-primary-role"
                    value={r}
                    checked={managePrimary === r}
                    disabled={manageSaving}
                    onChange={() => setManagePrimary(r)}
                  />
                  <span>{ROLE_LABELS[r]}</span>
                </label>
              ))}
            </fieldset>
          )}

          {((manageWanted.includes('parent') && !manageHeld.includes('parent')) ||
            (manageWanted.includes('student') && !manageHeld.includes('student'))) && (
            <p className="form-hint" style={{ marginTop: 'var(--space-3)' }}>
              After saving, use Link on this row to connect {manageName} to their guardian or student record.
            </p>
          )}
        </Modal>
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

      {/* Deactivate Confirm Modal */}
      {deactivateTarget && (
        <Modal
          title="Deactivate Account"
          onClose={closeDeactivateModal}
          footer={
            <>
              <button className="btn btn-outline" onClick={closeDeactivateModal}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ backgroundColor: 'var(--color-error)' }}
                onClick={handleDeactivate}
                disabled={!deactivateConfirmChecked || deactivating || deactivateStudentCount > 0}
              >
                {deactivating ? 'Deactivating...' : 'Deactivate Account'}
              </button>
            </>
          }
        >
          {deactivateError && <div className="alert alert-error">{deactivateError}</div>}

          {deactivateStudentCount > 0 && (
            <div className="alert alert-error">
              {deactivateTarget.display_name || deactivateTarget.email} is a tutor for {deactivateStudentCount} active
              student{deactivateStudentCount !== 1 ? 's' : ''}. Reassign them before deactivating this account.
            </div>
          )}

          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            This will deactivate <strong>{deactivateTarget.display_name || deactivateTarget.email}</strong>
            {deactivateTarget.display_name ? ` (${deactivateTarget.email})` : ''}. They will be signed out
            and will not be able to sign in. The account is hidden from this list.
          </p>

          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
            Nothing is deleted: their sessions, notes, and assignments stay attributed to them. You can
            reactivate the account at any time using &ldquo;Show inactive accounts&rdquo;, and it comes
            back with the same roles.
          </p>

          <label className="checkbox-row" style={{ marginTop: 'var(--space-4)' }}>
            <input
              type="checkbox"
              checked={deactivateConfirmChecked}
              onChange={(e) => setDeactivateConfirmChecked(e.target.checked)}
            />
            <span>I understand this account will be deactivated</span>
          </label>
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

          {inviteExisting && (
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
                <strong>{invAccount.display_name || invAccount.email} already has an account.</strong>
              </p>
              <p className="form-hint" style={{ margin: 'var(--space-1) 0 var(--space-3)' }}>
                Current roles: {describeRoles(invHeld)}
              </p>
              {invNothingToDo ? (
                <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                  They already hold the {ROLE_LABELS[invRole]} role
                  {invRecord ? ', and the record you chose is already linked' : ''}. There is nothing to add.
                  Change the role above, or go back and use a different email.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                  {invAlreadyHolds
                    ? `Link the ${invRole === 'parent' ? 'guardian' : 'student'} record you chose to their account?`
                    : `Add the ${ROLE_LABELS[invRole]} role to their account instead of sending an invitation?`}
                  {' '}No email is sent.
                  {invLinkable && !invAlreadyHolds
                    ? ` The ${invRole === 'parent' ? 'guardian' : 'student'} record you chose will be linked to them.`
                    : ''}
                </p>
              )}
            </div>
          )}

          {!inviteExisting && (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Create an invitation for a new user. After creating the invitation, copy the invite message and send it to them via email or text. When they sign in, their role and account linkage will be applied automatically.
          </p>
          )}

          <div className="form-group">
            <label className="form-label">Email Address *</label>
            <input
              className="input"
              type="email"
              value={inviteForm.email}
              onChange={(e) => {
                setInviteForm({ ...inviteForm, email: e.target.value });
                setInviteExisting(null);
              }}
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
