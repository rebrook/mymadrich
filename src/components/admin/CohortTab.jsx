import { useState } from 'react';
import { useCohorts } from '../../hooks/useCohorts';
import Modal from '../ui/Modal';

export default function CohortTab() {
  const { cohorts, loading, error, createCohort, updateCohort } = useCohorts();
  const [showForm, setShowForm] = useState(false);
  const [editingCohort, setEditingCohort] = useState(null);
  const [formData, setFormData] = useState({ name: '', start_date: '', end_date: '', default_lessons_per_week: '1', completion_buffer_weeks: '4', coordinator_name: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  function resetForm() {
    setFormData({ name: '', start_date: '', end_date: '', default_lessons_per_week: '1', completion_buffer_weeks: '4', coordinator_name: '' });
    setEditingCohort(null);
    setShowForm(false);
    setFormError(null);
  }

  function handleEdit(cohort) {
    setEditingCohort(cohort);
    setFormData({
      name: cohort.name,
      start_date: cohort.start_date || '',
      end_date: cohort.end_date || '',
      default_lessons_per_week: String(cohort.default_lessons_per_week ?? 1),
      completion_buffer_weeks: String(cohort.completion_buffer_weeks ?? 4),
      coordinator_name: cohort.coordinator_name ?? '',
    });
    setShowForm(true);
  }

  async function handleSubmit() {
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      setFormError('Cohort name is required.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: trimmedName,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        default_lessons_per_week: parseInt(formData.default_lessons_per_week, 10) || 1,
        completion_buffer_weeks: parseInt(formData.completion_buffer_weeks, 10) || 4,
        coordinator_name: formData.coordinator_name.trim() || null,
      };

      if (editingCohort) {
        await updateCohort(editingCohort.id, payload);
      } else {
        await createCohort(payload);
      }
      resetForm();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(cohort) {
    try {
      await updateCohort(cohort.id, { is_active: !cohort.is_active });
    } catch (err) {
      setFormError(err.message);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '\u2014';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  if (loading) return <p>Loading cohorts...</p>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const formFooter = (
    <>
      <button className="btn btn-outline" onClick={resetForm}>
        Cancel
      </button>
      <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
        {saving ? 'Saving...' : editingCohort ? 'Save Changes' : 'Create Cohort'}
      </button>
    </>
  );

  return (
    <div>
      <div className="section-header">
        <h3>Cohorts</h3>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          New Cohort
        </button>
      </div>

      {cohorts.length === 0 ? (
        <div className="empty-state">
          <p>No cohorts yet. Create your first cohort to get started.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Students</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr key={c.id}>
                <td data-label="Name">{c.name}</td>
                <td data-label="Start">{formatDate(c.start_date)}</td>
                <td data-label="End">{formatDate(c.end_date)}</td>
                <td data-label="Students">{c.studentCount}</td>
                <td data-label="Status">
                  <span className={`badge ${c.is_active ? 'badge-active' : 'badge-archived'}`}>
                    {c.is_active ? 'Active' : 'Archived'}
                  </span>
                </td>
                <td data-label="Actions">
                  <div className="action-buttons">
                    <button
                      className="btn btn-small btn-outline"
                      onClick={() => handleEdit(c)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-small btn-outline"
                      onClick={() => handleToggleActive(c)}
                    >
                      {c.is_active ? 'Archive' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <Modal
          title={editingCohort ? 'Edit Cohort' : 'New Cohort'}
          onClose={resetForm}
          footer={formFooter}
        >
          {formError && <div className="alert alert-error">{formError}</div>}
          <div className="form-group">
            <label className="form-label">Cohort Name *</label>
            <input
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., 2026-2027"
              autoFocus
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Start Date</label>
              <input
                type="date"
                className="input"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">End Date</label>
              <input
                type="date"
                className="input"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Expected Lessons / Week</label>
              <input
                type="number"
                className="input"
                min="1"
                max="7"
                value={formData.default_lessons_per_week}
                onChange={(e) => setFormData({ ...formData, default_lessons_per_week: e.target.value })}
              />
              <span className="form-hint">How often students typically meet with their tutor</span>
            </div>
            <div className="form-group">
              <label className="form-label">Completion Buffer (Weeks)</label>
              <input
                type="number"
                className="input"
                min="0"
                max="12"
                value={formData.completion_buffer_weeks}
                onChange={(e) => setFormData({ ...formData, completion_buffer_weeks: e.target.value })}
              />
              <span className="form-hint">Weeks before mitzvah date to target full mastery</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Coordinator Name</label>
            <input
              className="input"
              value={formData.coordinator_name}
              onChange={(e) => setFormData({ ...formData, coordinator_name: e.target.value })}
              placeholder="e.g., Rabbi Sarah Levin"
            />
            <span className="form-hint">Appears on the keepsake certificate signature line</span>
          </div>
        </Modal>
      )}
    </div>
  );
}
