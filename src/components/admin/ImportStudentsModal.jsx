import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import Modal from '../ui/Modal';

const TEMPLATE_COLUMNS = [
  'first_name', 'last_name', 'mitzvah_date', 'mitzvah_type',
  'tutor_email', 'school', 'status', 'notes',
  'guardian1_name', 'guardian1_relationship', 'guardian1_email', 'guardian1_phone',
  'guardian2_name', 'guardian2_relationship', 'guardian2_email', 'guardian2_phone',
];

const REQUIRED_FIELDS = ['first_name', 'last_name', 'mitzvah_date'];

const VALID_STATUSES = ['active', 'completed', 'deferred', 'withdrawn', 'archived'];
const VALID_TYPES = ['bar', 'bat', "b'nai", ''];
const VALID_SCHOOLS = ['KSDS', 'RRS', 'Other', ''];

/**
 * Multi-step import modal for bulk student creation.
 *
 * Steps: upload → preview → importing → complete
 *
 * Props:
 *   onClose    - called when modal is dismissed
 *   onComplete - called after successful import (triggers list refresh)
 */
export default function ImportStudentsModal({ onClose, onComplete }) {
  const fileInputRef = useRef(null);

  // Step state
  const [step, setStep] = useState('upload');

  // Reference data
  const [cohorts, setCohorts] = useState([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [tutors, setTutors] = useState([]);
  const [existingStudents, setExistingStudents] = useState([]);
  const [loadingRef, setLoadingRef] = useState(true);

  // Parsed data
  const [rows, setRows] = useState([]);       // raw parsed objects
  const [validated, setValidated] = useState([]); // { ...row, _valid, _errors, _tutorId }
  const [dragActive, setDragActive] = useState(false);

  // Import results
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importResults, setImportResults] = useState({ created: 0, failed: 0, errors: [] });

  const [error, setError] = useState(null);

  // ---- Load reference data ----
  useEffect(() => {
    async function load() {
      try {
        const { data: c } = await supabase
          .from('cohorts')
          .select('id, name, is_active')
          .order('name');
        setCohorts(c || []);
        const active = (c || []).filter((co) => co.is_active);
        if (active.length === 1) setSelectedCohortId(active[0].id);

        const { data: t } = await supabase
          .from('profiles')
          .select('id, email, display_name')
          .eq('role', 'tutor')
          .eq('is_active', true);
        setTutors(t || []);
      } catch (err) {
        setError('Failed to load reference data: ' + err.message);
      } finally {
        setLoadingRef(false);
      }
    }
    load();
  }, []);

  // Load existing students when cohort changes (for duplicate detection)
  useEffect(() => {
    if (!selectedCohortId) {
      setExistingStudents([]);
      return;
    }
    async function loadExisting() {
      const { data } = await supabase
        .from('students')
        .select('first_name, last_name, mitzvah_date')
        .eq('cohort_id', selectedCohortId);
      setExistingStudents(data || []);
    }
    loadExisting();
  }, [selectedCohortId]);

  // ---- Template download ----
  function handleDownloadTemplate() {
    const example = [
      'Sarah', 'Cohen', '2027-01-16', 'bat',
      'david.levy@example.com', 'KSDS', 'active', '',
      'Rachel Cohen', 'Mother', 'rachel@example.com', '410-555-0100',
      '', '', '', '',
    ];
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS, example]);

    // Set column widths for readability
    ws['!cols'] = TEMPLATE_COLUMNS.map((col) => ({
      wch: Math.max(col.length, 16),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'mymadrich_student_import_template.xlsx');
  }

  // ---- File handling ----
  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave() {
    setDragActive(false);
  }

  async function processFile(file) {
    setError(null);

    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(ext)) {
      setError('Please upload a CSV or Excel file (.csv, .xlsx, .xls).');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!data || data.length === 0) {
        setError('The file appears to be empty or has no data rows.');
        return;
      }

      // Normalize column headers (trim, lowercase)
      const normalized = data.map((row) => {
        const clean = {};
        Object.entries(row).forEach(([key, val]) => {
          clean[key.trim().toLowerCase()] = typeof val === 'string' ? val.trim() : String(val);
        });
        return clean;
      });

      // Check for required columns
      const headers = Object.keys(normalized[0]);
      const missingRequired = REQUIRED_FIELDS.filter((f) => !headers.includes(f));
      if (missingRequired.length > 0) {
        setError(`Missing required columns: ${missingRequired.join(', ')}`);
        return;
      }

      setRows(normalized);
      validateRows(normalized);
      setStep('preview');
    } catch (err) {
      setError('Failed to parse file: ' + err.message);
    }
  }

  // ---- Validation ----
  function validateRows(parsedRows) {
    const results = parsedRows.map((row, idx) => {
      const errors = [];

      // Required fields
      REQUIRED_FIELDS.forEach((field) => {
        if (!row[field]) errors.push(`Missing ${field}`);
      });

      // Date format
      if (row.mitzvah_date) {
        const d = new Date(row.mitzvah_date + 'T00:00:00');
        if (isNaN(d.getTime())) errors.push('Invalid date format (use YYYY-MM-DD)');
      }

      // Tutor lookup
      let tutorId = null;
      if (row.tutor_email) {
        const match = tutors.find(
          (t) => t.email.toLowerCase() === row.tutor_email.toLowerCase()
        );
        if (match) {
          tutorId = match.id;
        } else {
          errors.push(`Tutor not found: ${row.tutor_email}`);
        }
      }

      // Status validation
      if (row.status && !VALID_STATUSES.includes(row.status.toLowerCase())) {
        errors.push(`Invalid status: ${row.status}`);
      }

      // Type validation
      if (row.mitzvah_type && !VALID_TYPES.includes(row.mitzvah_type.toLowerCase())) {
        errors.push(`Invalid type: ${row.mitzvah_type}`);
      }

      // School validation
      if (row.school && !VALID_SCHOOLS.includes(row.school)) {
        errors.push(`Invalid school: ${row.school} (use KSDS, RRS, or Other)`);
      }

      // Duplicate check
      if (row.first_name && row.last_name && row.mitzvah_date) {
        const isDuplicate = existingStudents.some(
          (s) =>
            s.first_name.toLowerCase() === row.first_name.toLowerCase() &&
            s.last_name.toLowerCase() === row.last_name.toLowerCase() &&
            s.mitzvah_date === row.mitzvah_date
        );
        if (isDuplicate) errors.push('Student already exists in this cohort');
      }

      return {
        ...row,
        _rowNum: idx + 2, // +2: 1-indexed + header row
        _valid: errors.length === 0,
        _errors: errors,
        _tutorId: tutorId,
        _included: errors.length === 0, // auto-exclude invalid rows
      };
    });

    setValidated(results);
  }

  function toggleRowIncluded(idx) {
    setValidated((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, _included: !r._included } : r))
    );
  }

  // ---- Import ----
  async function handleImport() {
    const toImport = validated.filter((r) => r._included && r._valid);
    if (toImport.length === 0) return;

    setStep('importing');
    setImportProgress({ done: 0, total: toImport.length });

    let created = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < toImport.length; i++) {
      const row = toImport[i];
      try {
        // 1. Create student
        const { data: student, error: sErr } = await supabase
          .from('students')
          .insert({
            cohort_id: selectedCohortId,
            tutor_id: row._tutorId || null,
            first_name: row.first_name,
            last_name: row.last_name,
            mitzvah_date: row.mitzvah_date,
            mitzvah_type: row.mitzvah_type?.toLowerCase() || null,
            school: row.school || null,
            status: row.status?.toLowerCase() || 'active',
            notes: row.notes || null,
          })
          .select('id')
          .single();
        if (sErr) throw sErr;

        // 2. M:N tutor assignment: insert student_tutors row if tutor was matched.
        // The student was also created with tutor_id for dual-read backward compat;
        // the mirror trigger keeps them in sync.
        if (row._tutorId) {
          const { error: stErr } = await supabase
            .from('student_tutors')
            .insert({ student_id: student.id, tutor_id: row._tutorId });
          if (stErr) throw stErr;
        }

        // 3. Create guardians
        const guardians = [];
        if (row.guardian1_name) {
          guardians.push({
            student_id: student.id,
            name: row.guardian1_name,
            relationship: row.guardian1_relationship || 'Parent',
            email: row.guardian1_email || null,
            phone: row.guardian1_phone || null,
            is_primary: true,
            sort_order: 0,
          });
        }
        if (row.guardian2_name) {
          guardians.push({
            student_id: student.id,
            name: row.guardian2_name,
            relationship: row.guardian2_relationship || 'Parent',
            email: row.guardian2_email || null,
            phone: row.guardian2_phone || null,
            is_primary: false,
            sort_order: 1,
          });
        }
        if (guardians.length > 0) {
          const { error: gErr } = await supabase
            .from('student_guardians')
            .insert(guardians);
          if (gErr) throw gErr;
        }

        // 4. Apply default service elements
        const { error: eErr } = await supabase.rpc(
          'create_default_service_elements',
          { p_student_id: student.id }
        );
        if (eErr) throw eErr;

        created++;
      } catch (err) {
        failed++;
        errors.push(`Row ${row._rowNum} (${row.first_name} ${row.last_name}): ${err.message}`);
      }

      setImportProgress({ done: i + 1, total: toImport.length });
    }

    setImportResults({ created, failed, errors });
    setStep('complete');
  }

  // ---- Counts for UI ----
  const validCount = validated.filter((r) => r._valid).length;
  const invalidCount = validated.filter((r) => !r._valid).length;
  const includedCount = validated.filter((r) => r._included && r._valid).length;

  // ---- Render per step ----
  function renderUploadStep() {
    return (
      <>
        <div className="form-group">
          <label className="form-label">Target Cohort *</label>
          {loadingRef ? (
            <p className="form-hint">Loading...</p>
          ) : (
            <select
              className="input"
              value={selectedCohortId}
              onChange={(e) => setSelectedCohortId(e.target.value)}
            >
              <option value="">Select a cohort...</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.is_active ? '' : ' (archived)'}
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-outline btn-small"
            onClick={handleDownloadTemplate}
            type="button"
          >
            Download Template
          </button>
        </div>

        <div
          className={`import-dropzone ${dragActive ? 'import-dropzone-active' : ''} ${!selectedCohortId ? 'import-dropzone-disabled' : ''}`}
          onDrop={selectedCohortId ? handleDrop : undefined}
          onDragOver={selectedCohortId ? handleDragOver : undefined}
          onDragLeave={handleDragLeave}
          onClick={() => selectedCohortId && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={!selectedCohortId}
          />
          <p className="import-dropzone-text">
            {!selectedCohortId
              ? 'Select a cohort above first'
              : 'Drop a CSV or Excel file here, or click to browse'}
          </p>
          <p className="form-hint">.csv, .xlsx, or .xls</p>
        </div>
      </>
    );
  }

  function renderPreviewStep() {
    return (
      <>
        <div className="import-summary">
          <span className="import-summary-stat import-summary-valid">
            {validCount} valid
          </span>
          {invalidCount > 0 && (
            <span className="import-summary-stat import-summary-invalid">
              {invalidCount} invalid
            </span>
          )}
          <span className="form-hint">
            {includedCount} will be imported
          </span>
        </div>

        <div className="import-preview-list">
          {validated.map((row, idx) => (
            <div
              key={idx}
              className={`import-preview-row ${row._valid ? '' : 'import-preview-row-invalid'}`}
            >
              <div className="import-preview-row-header">
                {row._valid && (
                  <label className="verse-progress-check">
                    <input
                      type="checkbox"
                      checked={row._included}
                      onChange={() => toggleRowIncluded(idx)}
                    />
                  </label>
                )}
                <span className="import-preview-row-status">
                  {row._valid ? '\u2713' : '\u2717'}
                </span>
                <strong>
                  {row.first_name} {row.last_name}
                </strong>
                <span className="form-hint">
                  {row.mitzvah_date} &middot; {row.tutor_email || 'No tutor'}
                </span>
              </div>
              {row._errors.length > 0 && (
                <div className="import-preview-errors">
                  {row._errors.map((e, i) => (
                    <span key={i} className="import-preview-error">{e}</span>
                  ))}
                </div>
              )}
              {row._valid && (row.guardian1_name || row.guardian2_name) && (
                <div className="form-hint" style={{ paddingLeft: '26px' }}>
                  Guardians: {[row.guardian1_name, row.guardian2_name].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </>
    );
  }

  function renderImportingStep() {
    const pct = importProgress.total > 0
      ? Math.round((importProgress.done / importProgress.total) * 100)
      : 0;
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
        <p>Importing students... {importProgress.done} of {importProgress.total}</p>
        <div className="import-progress-bar">
          <div
            className="import-progress-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  function renderCompleteStep() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ color: 'var(--color-success)' }}>Import Complete</h3>
          <p style={{ marginTop: 'var(--space-2)' }}>
            {importResults.created} student{importResults.created !== 1 ? 's' : ''} created
            {importResults.failed > 0 && (
              <>, {importResults.failed} failed</>
            )}
          </p>
        </div>

        {importResults.errors.length > 0 && (
          <div className="alert alert-error">
            {importResults.errors.map((e, i) => (
              <p key={i} style={{ fontSize: 'var(--text-sm)' }}>{e}</p>
            ))}
          </div>
        )}

        <p className="form-hint" style={{ textAlign: 'center' }}>
          Readings can be assigned per student on the Student Detail page.
          Default service elements (blessings + D'var Torah) have been applied to each student.
        </p>
      </div>
    );
  }

  // ---- Modal title and footer per step ----
  const titles = {
    upload: 'Import Students',
    preview: 'Review Import',
    importing: 'Importing...',
    complete: 'Import Complete',
  };

  function getFooter() {
    switch (step) {
      case 'upload':
        return (
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        );
      case 'preview':
        return (
          <>
            <button className="btn btn-outline" onClick={() => { setStep('upload'); setRows([]); setValidated([]); }}>
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={includedCount === 0}
            >
              Import {includedCount} Student{includedCount !== 1 ? 's' : ''}
            </button>
          </>
        );
      case 'importing':
        return null; // No footer during import
      case 'complete':
        return (
          <button className="btn btn-primary" onClick={onComplete}>
            Done
          </button>
        );
      default:
        return null;
    }
  }

  return (
    <Modal
      title={titles[step]}
      onClose={step === 'importing' ? () => {} : onClose}
      footer={getFooter()}
    >
      {error && <div className="alert alert-error">{error}</div>}

      {step === 'upload' && renderUploadStep()}
      {step === 'preview' && renderPreviewStep()}
      {step === 'importing' && renderImportingStep()}
      {step === 'complete' && renderCompleteStep()}
    </Modal>
  );
}
