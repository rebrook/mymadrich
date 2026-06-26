import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchTutors, fetchPendingTutorAssignments } from '../../hooks/useStudents';
import { getParashahForDate } from '../../utils/hebcal';
import { mitzvahLabel, tutorName, tutorListLabel } from '../../utils/people';
import HelpTip from '../ui/HelpTip';

const STATUS_OPTIONS = ['active', 'completed', 'deferred', 'withdrawn', 'archived'];
const MITZVAH_TYPE_OPTIONS = ['bar', 'bat', "b'nai"];
const SCHOOL_OPTIONS = ['KSDS', 'RRS', 'Other'];

export default function StudentInfoSection({ student, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [tutors, setTutors] = useState([]);
  const [parasha, setParasha] = useState(null);

  // M:N tutor assignment state (editing mode)
  // Each entry: { id, source } where source is 'profile' or 'pending'
  const [assignedTutors, setAssignedTutors] = useState([]);
  const [addTutorId, setAddTutorId] = useState('');
  const [tutorSaving, setTutorSaving] = useState(false);

  // Pending tutor assignments loaded from the staging table
  const [pendingAssignments, setPendingAssignments] = useState([]);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    hebrew_name: '',
    mitzvah_date: '',
    mitzvah_type: '',
    status: '',
    school: '',
    notes: '',
    lessons_per_week: '',
    target_completion_date: '',
  });

  // Load tutors for dropdown (now includes pending invitations)
  useEffect(() => {
    fetchTutors().then(setTutors).catch(() => {});
  }, []);

  // Load pending tutor assignments for this student
  useEffect(() => {
    if (student?.id) {
      fetchPendingTutorAssignments(student.id)
        .then(setPendingAssignments)
        .catch(() => setPendingAssignments([]));
    }
  }, [student?.id]);

  // Initialize form + assigned tutors when student loads or changes
  useEffect(() => {
    if (student) {
      setForm({
        first_name: student.first_name || '',
        last_name: student.last_name || '',
        hebrew_name: student.hebrew_name || '',
        mitzvah_date: student.mitzvah_date || '',
        mitzvah_type: student.mitzvah_type || '',
        status: student.status || 'active',
        school: student.school || '',
        notes: student.notes || '',
        lessons_per_week: student.lessons_per_week != null ? String(student.lessons_per_week) : '',
        target_completion_date: student.target_completion_date || '',
      });

      // Build unified assigned list: profile tutors from student_tutors + pending from staging table
      const profileEntries = (student.student_tutors || [])
        .filter((st) => st.tutor_id)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
        .map((st) => ({ id: st.tutor_id, source: 'profile' }));

      const pendingEntries = pendingAssignments.map((pta) => ({
        id: pta.invitation_id,
        source: 'pending',
      }));

      setAssignedTutors([...profileEntries, ...pendingEntries]);
    }
  }, [student, pendingAssignments]);

  // Look up parashah when mitzvah_date is set
  useEffect(() => {
    if (form.mitzvah_date) {
      const result = getParashahForDate(form.mitzvah_date);
      setParasha(result);
    } else {
      setParasha(null);
    }
  }, [form.mitzvah_date]);

  // ---- Tutor assignment handlers ----
  // Routes to student_tutors (profile) or pending_tutor_assignments (pending)
  // based on the tutor's source.

  async function handleAddTutor() {
    if (!addTutorId) return;

    // Find the tutor object to determine its source
    const tutorObj = tutors.find((t) => t.id === addTutorId);
    if (!tutorObj) return;

    // Check for duplicate: same id + source already assigned
    const alreadyAssigned = assignedTutors.some(
      (at) => at.id === addTutorId && at.source === tutorObj.source
    );
    if (alreadyAssigned) return;

    setTutorSaving(true);
    setError(null);
    try {
      if (tutorObj.source === 'profile') {
        // Write to student_tutors (existing behavior)
        const { error: err } = await supabase
          .from('student_tutors')
          .insert({ student_id: student.id, tutor_id: addTutorId });
        if (err) throw err;
      } else {
        // Write to pending_tutor_assignments (staged)
        const { error: err } = await supabase
          .from('pending_tutor_assignments')
          .insert({ invitation_id: addTutorId, student_id: student.id });
        if (err) throw err;
      }

      setAssignedTutors((prev) => [...prev, { id: addTutorId, source: tutorObj.source }]);
      setAddTutorId('');

      // Refresh pending assignments to stay in sync
      if (tutorObj.source === 'pending') {
        fetchPendingTutorAssignments(student.id)
          .then(setPendingAssignments)
          .catch(() => {});
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTutorSaving(false);
    }
  }

  async function handleRemoveTutor(tutorId, source) {
    setTutorSaving(true);
    setError(null);
    try {
      if (source === 'profile') {
        // Delete from student_tutors (existing behavior)
        const { error: err } = await supabase
          .from('student_tutors')
          .delete()
          .eq('student_id', student.id)
          .eq('tutor_id', tutorId);
        if (err) throw err;
      } else {
        // Delete from pending_tutor_assignments
        const { error: err } = await supabase
          .from('pending_tutor_assignments')
          .delete()
          .eq('invitation_id', tutorId)
          .eq('student_id', student.id);
        if (err) throw err;
      }

      setAssignedTutors((prev) =>
        prev.filter((at) => !(at.id === tutorId && at.source === source))
      );

      // Refresh pending assignments to stay in sync
      if (source === 'pending') {
        fetchPendingTutorAssignments(student.id)
          .then(setPendingAssignments)
          .catch(() => {});
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTutorSaving(false);
    }
  }

  // ---- Save other student fields (tutor is handled separately above) ----

  async function handleSave() {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First and last name are required.');
      return;
    }
    if (!form.mitzvah_date) {
      setError('B\'nai Mitzvah date is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Note: tutor_id is NOT included in this update. Tutor assignment is
      // managed via student_tutors INSERT/DELETE above, and the mirror trigger
      // keeps students.tutor_id in sync automatically.
      await onUpdate({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        hebrew_name: form.hebrew_name.trim() || null,
        mitzvah_date: form.mitzvah_date,
        mitzvah_type: form.mitzvah_type || null,
        status: form.status,
        school: form.school || null,
        notes: form.notes.trim() || null,
        lessons_per_week: form.lessons_per_week ? parseInt(form.lessons_per_week, 10) : null,
        target_completion_date: form.target_completion_date || null,
      });
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    // Reset form to current student data
    if (student) {
      setForm({
        first_name: student.first_name || '',
        last_name: student.last_name || '',
        hebrew_name: student.hebrew_name || '',
        mitzvah_date: student.mitzvah_date || '',
        mitzvah_type: student.mitzvah_type || '',
        status: student.status || 'active',
        school: student.school || '',
        notes: student.notes || '',
        lessons_per_week: student.lessons_per_week != null ? String(student.lessons_per_week) : '',
        target_completion_date: student.target_completion_date || '',
      });

      // Reset assigned tutors to current state
      const profileEntries = (student.student_tutors || [])
        .filter((st) => st.tutor_id)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
        .map((st) => ({ id: st.tutor_id, source: 'profile' }));

      const pendingEntries = pendingAssignments.map((pta) => ({
        id: pta.invitation_id,
        source: 'pending',
      }));

      setAssignedTutors([...profileEntries, ...pendingEntries]);
    }
    setEditing(false);
    setError(null);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '\u2014';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  if (!student) return null;

  // Build the list of tutors available to add (not already assigned)
  // Must compare by both id AND source since the id namespace is mixed
  const availableTutors = tutors.filter(
    (t) => !assignedTutors.some((at) => at.id === t.id && at.source === t.source)
  );

  // Resolve assigned tutor details for display (both profile and pending)
  const assignedTutorProfiles = assignedTutors.map((at) => {
    if (at.source === 'profile') {
      // Try the tutors dropdown list first (has all active tutors)
      const fromList = tutors.find((t) => t.id === at.id && t.source === 'profile');
      if (fromList) return { ...fromList, source: 'profile' };
      // Fall back to the student_tutors join data
      const fromJoin = (student.student_tutors || []).find((st) => st.tutor_id === at.id);
      return { id: at.id, display_name: fromJoin?.tutor?.display_name || null, email: fromJoin?.tutor?.email || null, source: 'profile' };
    } else {
      // Pending: look up from the tutors list (which now includes pending invitations)
      const fromList = tutors.find((t) => t.id === at.id && t.source === 'pending');
      if (fromList) return { ...fromList, source: 'pending' };
      // Fall back to the pending assignments data
      const fromPta = pendingAssignments.find((pta) => pta.invitation_id === at.id);
      return {
        id: at.id,
        display_name: fromPta?.invitation?.display_name || null,
        email: fromPta?.invitation?.email || null,
        source: 'pending',
      };
    }
  });

  // ---- Read-mode tutor display helpers ----

  // For the read-mode tutor label, combine real tutors with pending ones
  const hasRealTutors = (student.student_tutors || []).length > 0;
  const hasPendingTutors = pendingAssignments.length > 0;
  const totalTutorCount = (student.student_tutors || []).length + pendingAssignments.length;

  function renderReadModeTutors() {
    if (hasRealTutors || hasPendingTutors) {
      const parts = [];

      // Real tutors first
      if (hasRealTutors) {
        parts.push(tutorListLabel(student.student_tutors, student.tutor));
      }

      // Pending tutors with (invited) label
      pendingAssignments.forEach((pta) => {
        const name = pta.invitation?.display_name || pta.invitation?.email || 'Unknown';
        parts.push(`${name} (invited)`);
      });

      return parts.join(', ');
    }

    // No tutors at all
    if (student.tutor_id) {
      return student.tutor?.display_name || '\u2014';
    }

    return <span className="badge badge-unassigned">Unassigned</span>;
  }

  return (
    <div className="card">
      <div className="section-header">
        <h3>Student Information</h3>
        {!editing && (
          <button className="btn btn-outline btn-small" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 'var(--space-3)' }}>{error}</div>}

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">First Name *</label>
              <input className="input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Last Name *</label>
              <input className="input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Hebrew Name <HelpTip text="The ceremonial name the student will be called to the Torah with (e.g. מַלְכָּה בַּת אַבְרָהָם). Displayed on the family dashboard. Leave blank if not yet known." /></label>
            <input className="input" dir="rtl" lang="he" value={form.hebrew_name} onChange={(e) => setForm({ ...form, hebrew_name: e.target.value })} placeholder="e.g. מַלְכָּה בַּת אַבְרָהָם" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">B'nai Mitzvah Date *</label>
              <input type="date" className="input" value={form.mitzvah_date} onChange={(e) => setForm({ ...form, mitzvah_date: e.target.value })} />
              {parasha && parasha.parsha && (
                <span className="form-hint" style={{ color: 'var(--color-primary)' }}>
                  Parashat {parasha.parsha}
                </span>
              )}
              {parasha && parasha.holidayNote && (
                <span className="form-hint" style={{ color: 'var(--color-orange)' }}>
                  {parasha.holidayNote}
                </span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="input" value={form.mitzvah_type} onChange={(e) => setForm({ ...form, mitzvah_type: e.target.value })}>
                <option value="">Select...</option>
                {MITZVAH_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{mitzvahLabel(t)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ---- Tutor assignment (M:N add/remove) ---- */}
          <div className="form-group">
            <label className="form-label">Tutors</label>

            {/* Assigned tutor chips (profile + pending) */}
            {assignedTutorProfiles.length > 0 ? (
              <div className="tutor-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                {assignedTutorProfiles.map((t) => (
                  <span
                    key={`${t.source}-${t.id}`}
                    className={t.source === 'pending' ? 'badge badge-pending-tutor' : 'badge badge-active'}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--space-1)',
                    }}
                  >
                    {tutorName(t)}{t.source === 'pending' ? ' (invited)' : ''}
                    <button
                      type="button"
                      onClick={() => handleRemoveTutor(t.id, t.source)}
                      disabled={tutorSaving}
                      className="tutor-chip-remove"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0 2px',
                        fontSize: 'var(--text-sm)',
                        lineHeight: 1,
                        color: 'inherit',
                        opacity: 0.7,
                      }}
                      aria-label={`Remove ${tutorName(t)}`}
                    >
                      {'\u2715'}
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="form-hint" style={{ marginBottom: 'var(--space-2)' }}>No tutors assigned.</p>
            )}

            {/* Add tutor dropdown + button */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
              <select
                className="input"
                value={addTutorId}
                onChange={(e) => setAddTutorId(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">Add a tutor...</option>
                {availableTutors.map((t) => (
                  <option key={`${t.source}-${t.id}`} value={t.id}>
                    {tutorName(t)}{t.email ? ` (${t.email})` : ''}{t.source === 'pending' ? ' \u2014 invited' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-outline btn-small"
                onClick={handleAddTutor}
                disabled={!addTutorId || tutorSaving}
              >
                Add
              </button>
            </div>
            {tutors.length === 0 && (
              <span className="form-hint">
                No tutors found. Tutors must be invited or sign in and be assigned the tutor role first.
              </span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">School</label>
              <select className="input" value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })}>
                <option value="">Select...</option>
                {SCHOOL_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Internal notes..." />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Lessons/Week Override <HelpTip text="Overrides the cohort default for how often this student meets with their tutor. Leave blank to use the cohort setting." /></label>
              <input type="number" className="input" min="1" max="7" value={form.lessons_per_week} onChange={(e) => setForm({ ...form, lessons_per_week: e.target.value })} placeholder="Use cohort default" />
              <span className="form-hint">Leave blank to use the cohort default</span>
            </div>
            <div className="form-group">
              <label className="form-label">Target Completion Date Override <HelpTip text="By default, the target completion date is calculated from the mitzvah date minus the cohort's completion buffer (the number of weeks before the ceremony when all material should be mastered). Set a date here to override that calculation." /></label>
              <input type="date" className="input" value={form.target_completion_date} onChange={(e) => setForm({ ...form, target_completion_date: e.target.value })} />
              <span className="form-hint">Leave blank to auto-calculate from mitzvah date</span>
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-outline" onClick={handleCancel}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      ) : (
        <div className="student-info-grid">
          <div>
            <span className="form-label">Name</span>
            <p>{student.first_name} {student.last_name}</p>
          </div>
          <div>
            <span className="form-label">Hebrew Name</span>
            <p>{student.hebrew_name ? <span dir="rtl" lang="he">{student.hebrew_name}</span> : '\u2014'}</p>
          </div>
          <div>
            <span className="form-label">B'nai Mitzvah Date</span>
            <p>{formatDate(student.mitzvah_date)}</p>
            {parasha && parasha.parsha && (
              <span className="form-hint" style={{ color: 'var(--color-primary)' }}>
                Parashat {parasha.parsha}
              </span>
            )}
          </div>
          <div>
            <span className="form-label">Type</span>
            <p>{student.mitzvah_type ? mitzvahLabel(student.mitzvah_type) : '\u2014'}</p>
          </div>
          <div>
            <span className="form-label">{totalTutorCount > 1 ? 'Tutors' : 'Tutor'}</span>
            <p>{renderReadModeTutors()}</p>
          </div>
          <div>
            <span className="form-label">Status</span>
            <p>{student.status?.charAt(0).toUpperCase() + student.status?.slice(1)}</p>
          </div>
          <div>
            <span className="form-label">School</span>
            <p>{student.school || '\u2014'}</p>
          </div>
          <div>
            <span className="form-label">Notes</span>
            <p>{student.notes || '\u2014'}</p>
          </div>
          {(student.lessons_per_week != null || student.target_completion_date) && (
            <>
              {student.lessons_per_week != null && (
                <div>
                  <span className="form-label">Lessons/Week Override <HelpTip text="Overrides the cohort default for how often this student meets with their tutor. Leave blank to use the cohort setting." /></span>
                  <p>{student.lessons_per_week}x per week</p>
                </div>
              )}
              {student.target_completion_date && (
                <div>
                  <span className="form-label">Target Completion Override <HelpTip text="By default, the target completion date is calculated from the mitzvah date minus the cohort's completion buffer (the number of weeks before the ceremony when all material should be mastered). Set a date here to override that calculation." /></span>
                  <p>{formatDate(student.target_completion_date)}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
