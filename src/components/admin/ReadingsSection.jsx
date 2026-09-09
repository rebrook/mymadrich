import { useState, useMemo } from 'react';
import Modal from '../ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../utils/constants';
import {
  getParashahForDate,
  resolveReadingsForDate,
  parseTriennialAliyot,
  getTriennialCycleYear,
  parseAliyot,
  parseHaftarah,
  expandVerseRange,
  buildReferenceString,
  buildSefariaUrl,
  parseHaftarahReference,
  parseHaftarahSegments,
  expandHaftarahVerses,
  BOOK_NAMES,
} from '../../utils/hebcal';

// ============================================================
// Occasion labels for reading picker and display
// ============================================================

const OCCASION_LABELS = {
  shabbat: 'Shabbat',
  holiday: 'Holiday',
  weekday: 'Weekday',
  custom: 'Custom',
};

// ============================================================
// Ref validation helpers
// ============================================================

const REF_PATTERN = /^(\d+):(\d+)$/;

/**
 * Parse a chapter:verse string into numbers.
 * @returns {{ chapter, verse } | null}
 */
function parseRef(ref) {
  const m = ref.match(REF_PATTERN);
  if (!m) return null;
  return { chapter: parseInt(m[1], 10), verse: parseInt(m[2], 10) };
}

/**
 * Validate a verse reference pair against the selected book.
 * Returns an error message string, or null if valid.
 */
function validateRefs(book, beginRef, endRef) {
  if (!book) return 'Please select a book.';
  if (!beginRef || !endRef) return 'Please enter both begin and end references.';

  const start = parseRef(beginRef);
  const end = parseRef(endRef);
  if (!start) return 'Begin reference must be in chapter:verse format (e.g. 1:1).';
  if (!end) return 'End reference must be in chapter:verse format (e.g. 1:7).';

  // Compare: end must be >= begin
  if (end.chapter < start.chapter) {
    return 'End chapter cannot be before begin chapter.';
  }
  if (end.chapter === start.chapter && end.verse < start.verse) {
    return 'End verse cannot be before begin verse in the same chapter.';
  }

  return null;
}

// ============================================================
// Shared field group: Book select + Begin/End refs + verse count
// Used by AdjustReadingModal and CustomReadingModal
// ============================================================

/**
 * Renders the book dropdown, begin/end reference inputs, and verse
 * count preview. Stateless: all values and setters come from the parent.
 *
 * @param {object} props
 * @param {string} props.book - Current book value
 * @param {function} props.onBookChange - Setter for book
 * @param {string} props.beginRef - Current begin ref value
 * @param {function} props.onBeginRefChange - Setter for beginRef
 * @param {string} props.endRef - Current end ref value
 * @param {function} props.onEndRefChange - Setter for endRef
 * @param {number} props.verseCount - Number of verses in the current range
 */
function ReadingFieldGroup({ book, onBookChange, beginRef, onBeginRefChange, endRef, onEndRefChange, verseCount }) {
  return (
    <>
      <div className="form-group">
        <label className="form-label">Book</label>
        <select
          className="input"
          value={book}
          onChange={(e) => onBookChange(e.target.value)}
        >
          <option value="">Select a book...</option>
          {BOOK_NAMES.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Begin</label>
          <input
            type="text"
            className="input"
            value={beginRef}
            onChange={(e) => onBeginRefChange(e.target.value)}
            placeholder="e.g. 8:15"
          />
        </div>
        <div className="form-group">
          <label className="form-label">End</label>
          <input
            type="text"
            className="input"
            value={endRef}
            onChange={(e) => onEndRefChange(e.target.value)}
            placeholder="e.g. 9:7"
          />
        </div>
      </div>

      {verseCount > 0 && (
        <p className="form-hint">
          {verseCount} verse{verseCount !== 1 ? 's' : ''} in the range
        </p>
      )}
    </>
  );
}

// ============================================================
// Main component
// ============================================================

export default function ReadingsSection({
  student,
  readings,
  onCreateReading,
  onDeleteReading,
  onUpdateReadingOverride,
  onRevertReadingOverride,
  onCheckVersesWithProgress,
}) {
  const { role } = useAuth();
  const isAdmin = role === ROLES.ADMIN;

  const [showAddFlow, setShowAddFlow] = useState(false);
  const [showCustomFlow, setShowCustomFlow] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [adjustingReading, setAdjustingReading] = useState(null);
  const [revertingId, setRevertingId] = useState(null);
  const [error, setError] = useState(null);
  const [expandedReading, setExpandedReading] = useState(null);

  // Hebcal lookup for the Shabbat add-reading flow (triennial path)
  const hebcalData = useMemo(() => {
    if (!student?.mitzvah_date) return null;
    return getParashahForDate(student.mitzvah_date);
  }, [student?.mitzvah_date]);

  // Date-based leyning resolution for all occasions (Commit 3a)
  const resolvedData = useMemo(() => {
    if (!student?.mitzvah_date) return null;
    return resolveReadingsForDate(student.mitzvah_date);
  }, [student?.mitzvah_date]);

  function toggleExpanded(readingId) {
    setExpandedReading(expandedReading === readingId ? null : readingId);
  }

  async function handleDelete(readingId) {
    setError(null);
    try {
      await onDeleteReading(readingId);
      setDeletingId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRevert(readingId) {
    setError(null);
    try {
      await onRevertReadingOverride(readingId);
      setRevertingId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="section-header">
        <h3>Readings &amp; Verses</h3>
        <button className="btn btn-primary btn-small" onClick={() => setShowAddFlow(true)}>
          Add Reading
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 'var(--space-3)' }}>{error}</div>}

      {readings.length === 0 ? (
        <div className="empty-state">
          <p>No readings assigned yet. Click "Add Reading" to look up this student's parashah.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          {readings.map((r) => (
            <div key={r.id} className="reading-card">
              <div
                className="reading-card-header"
                role="button"
                tabIndex={0}
                aria-expanded={expandedReading === r.id}
                onClick={() => toggleExpanded(r.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(r.id); } }}
              >
                <div className="reading-card-info">
                  <span className={`badge ${r.reading_type === 'torah' ? 'badge-active' : 'badge-deferred'}`}>
                    {r.reading_type === 'torah' ? 'Torah' : 'Haftarah'}
                  </span>
                  <strong>{r.portion_name}</strong>
                  {r.aliyah && <span className="form-hint">({r.aliyah})</span>}
                  <span className="form-hint">{r.reference}</span>
                </div>
                <div className="reading-card-actions">
                  {r.sefaria_url && (
                    <a
                      href={r.sefaria_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-small btn-outline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Sefaria
                    </a>
                  )}
                  {isAdmin && (
                    <button
                      className="btn btn-small btn-outline"
                      onClick={(e) => { e.stopPropagation(); setAdjustingReading(r); }}
                    >
                      Adjust
                    </button>
                  )}
                  <button
                    className="btn btn-small btn-danger-outline"
                    onClick={(e) => { e.stopPropagation(); setDeletingId(r.id); }}
                  >
                    Remove
                  </button>
                  <span className="reading-expand-icon">
                    {expandedReading === r.id ? '\u25B2' : '\u25BC'}
                  </span>
                </div>
              </div>

              {/* Override indicator (admin-only, calm) */}
              {isAdmin && r.is_override && (
                <div className="reading-override-note" style={{
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'var(--color-surface-warm, #faf8f5)',
                  borderTop: '1px solid var(--color-border, #e5e0da)',
                  fontSize: 'var(--font-size-sm, 0.85rem)',
                  color: 'var(--color-text-muted, #6b6b6b)',
                }}>
                  <span>Adjusted from the standard triennial reading</span>
                  {r.reading_notes && (
                    <span> — {r.reading_notes}</span>
                  )}
                  <button
                    className="btn btn-small btn-outline"
                    style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--font-size-sm, 0.85rem)' }}
                    onClick={(e) => { e.stopPropagation(); setRevertingId(r.id); }}
                  >
                    Revert to standard
                  </button>
                </div>
              )}

              {expandedReading === r.id && (
                <div className="reading-verses">
                  {r.verses.length === 0 ? (
                    <p className="form-hint">No individual verses recorded.</p>
                  ) : (
                    <div className="verse-list">
                      {r.verses.map((v) => (
                        <div key={v.id} className="verse-item">
                          <span>{v.verse_reference}</span>
                          {v.sefaria_url && (
                            <a href={v.sefaria_url} target="_blank" rel="noopener noreferrer" className="form-hint">
                              View
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <Modal
          title="Remove Reading"
          onClose={() => setDeletingId(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setDeletingId(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ backgroundColor: 'var(--color-error)' }} onClick={() => handleDelete(deletingId)}>
                Remove Reading
              </button>
            </>
          }
        >
          <p>This will remove the reading and all its verse progress data. This cannot be undone.</p>
        </Modal>
      )}

      {/* Revert confirmation */}
      {revertingId && (
        <Modal
          title="Revert to Standard Reading"
          onClose={() => setRevertingId(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setRevertingId(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleRevert(revertingId)}>
                Revert Override
              </button>
            </>
          }
        >
          <p>
            This will clear the override flag and notes. The current verse references and
            any recorded progress will remain unchanged. To reassign from the standard
            triennial reading, remove this reading and add it again.
          </p>
        </Modal>
      )}

      {/* Adjust Reading flow (admin-only) */}
      {adjustingReading && (
        <AdjustReadingModal
          reading={adjustingReading}
          onSave={async (reference, sefariaUrl, readingNotes, newVerses) => {
            setError(null);
            try {
              await onUpdateReadingOverride(
                adjustingReading.id,
                reference,
                sefariaUrl,
                readingNotes,
                newVerses
              );
              setAdjustingReading(null);
            } catch (err) {
              setError(err.message);
            }
          }}
          onCheckProgress={onCheckVersesWithProgress}
          onClose={() => setAdjustingReading(null)}
        />
      )}

      {/* Add Reading flow (occasion-aware) */}
      {showAddFlow && (
        <AddReadingModal
          hebcalData={hebcalData}
          resolvedData={resolvedData}
          student={student}
          existingReadings={readings}
          onAdd={async (readingData, verses) => {
            setError(null);
            try {
              await onCreateReading(readingData, verses);
              setShowAddFlow(false);
            } catch (err) {
              setError(err.message);
            }
          }}
          onOpenCustom={() => { setShowAddFlow(false); setShowCustomFlow(true); }}
          onClose={() => setShowAddFlow(false)}
        />
      )}

      {/* Custom Reading flow (manual entry for non-leyning dates) */}
      {showCustomFlow && (
        <CustomReadingModal
          student={student}
          existingReadings={readings}
          onAdd={async (readingData, verses) => {
            setError(null);
            try {
              await onCreateReading(readingData, verses);
              setShowCustomFlow(false);
            } catch (err) {
              setError(err.message);
            }
          }}
          onClose={() => setShowCustomFlow(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// AdjustReadingModal (unchanged from Commit 2)
// Now uses shared ReadingFieldGroup for book/ref inputs.
// ============================================================

/**
 * Modal for adjusting an existing reading's verse boundaries.
 * Admin-only. Pre-fills from the current reading, lets the admin
 * edit the reference range, shows a mastery-loss warning, and
 * requires a note explaining the adjustment.
 */
function AdjustReadingModal({ reading, onSave, onCheckProgress, onClose }) {
  // Parse current reference into book / beginRef / endRef
  const parsed = useMemo(() => {
    if (!reading?.reference) return null;
    const match = reading.reference.match(/^(.+?)\s+(\d+:\d+)-(\d+:?\d*)$/);
    if (!match) return null;
    let endRef = match[3];
    if (!endRef.includes(':')) {
      const startChap = match[2].split(':')[0];
      endRef = `${startChap}:${endRef}`;
    }
    return { book: match[1], beginRef: match[2], endRef };
  }, [reading?.reference]);

  const [book, setBook] = useState(parsed?.book || '');
  const [beginRef, setBeginRef] = useState(parsed?.beginRef || '');
  const [endRef, setEndRef] = useState(parsed?.endRef || '');
  const [readingNotes, setReadingNotes] = useState(reading?.reading_notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [progressWarning, setProgressWarning] = useState(null);
  const [checkedProgress, setCheckedProgress] = useState(false);

  const hasNotes = readingNotes.trim().length > 0;

  // Compute new verses from the edited range
  const newVerses = useMemo(() => {
    if (!book || !beginRef || !endRef) return [];
    try {
      return expandVerseRange(book, beginRef, endRef);
    } catch {
      return [];
    }
  }, [book, beginRef, endRef]);

  // Check for mastery progress on verses that would be removed
  async function checkProgress() {
    if (!onCheckProgress) {
      setCheckedProgress(true);
      return;
    }
    try {
      const versesWithProgress = await onCheckProgress(reading.id);
      if (versesWithProgress.length > 0) {
        // Find which verses with progress would be removed
        const newRefs = new Set(newVerses.map((v) => v.reference));
        const lostProgress = versesWithProgress.filter(
          (vp) => !newRefs.has(vp.verse_reference)
        );
        if (lostProgress.length > 0) {
          setProgressWarning(lostProgress);
        } else {
          setProgressWarning(null);
        }
      } else {
        setProgressWarning(null);
      }
      setCheckedProgress(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSave() {
    if (!hasNotes) {
      setError('Please provide a reason for this adjustment.');
      return;
    }
    if (newVerses.length === 0) {
      setError('The adjusted range produces no verses. Please check the book and references.');
      return;
    }

    // Check progress before first save attempt
    if (!checkedProgress) {
      await checkProgress();
      return; // User reviews the warning, then clicks Save/Confirm again
    }

    setSaving(true);
    setError(null);
    try {
      const ref = buildReferenceString(book, beginRef, endRef);
      const url = buildSefariaUrl(book, beginRef, endRef);
      await onSave(ref, url, readingNotes, newVerses);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Build a readable title for the modal
  const modalTitle = reading.aliyah
    ? `Adjust Reading: ${reading.aliyah}`
    : `Adjust Reading: ${reading.reading_type === 'haftarah' ? 'Haftarah' : 'Torah'}`;

  const saveDisabled = saving || !hasNotes;

  return (
    <Modal
      title={modalTitle}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saveDisabled}>
            {saving ? 'Saving...' : checkedProgress ? 'Confirm Adjustment' : 'Save Adjustment'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}

      <p className="form-hint">
        Adjust the verse boundaries for this reading. A reason is required.
        Verses that match the current set will keep their progress data.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
        <ReadingFieldGroup
          book={book}
          onBookChange={(v) => { setBook(v); setCheckedProgress(false); }}
          beginRef={beginRef}
          onBeginRefChange={(v) => { setBeginRef(v); setCheckedProgress(false); }}
          endRef={endRef}
          onEndRefChange={(v) => { setEndRef(v); setCheckedProgress(false); }}
          verseCount={newVerses.length}
        />

        <div className="form-group">
          <label className="form-label">
            Reason for adjustment <span style={{ color: 'var(--color-error)' }}>*</span>
          </label>
          <textarea
            className="input"
            value={readingNotes}
            onChange={(e) => setReadingNotes(e.target.value)}
            placeholder="e.g. Family requested extended maftir for the service"
            rows={3}
          />
        </div>

        {/* Mastery-loss warning */}
        {progressWarning && progressWarning.length > 0 && (
          <div className="alert alert-error">
            <strong>{progressWarning.length} verse{progressWarning.length !== 1 ? 's' : ''} being
            removed {progressWarning.length !== 1 ? 'have' : 'has'} recorded progress.</strong>
            <span> This progress will be lost. Click "Confirm Adjustment" to proceed.</span>
            <ul style={{ marginTop: 'var(--space-2)', paddingLeft: 'var(--space-4)' }}>
              {progressWarning.map((vp) => (
                <li key={vp.verse_id}>
                  {vp.verse_reference} ({vp.quality})
                </li>
              ))}
            </ul>
          </div>
        )}

        {checkedProgress && !progressWarning && (
          <p className="form-hint" style={{ color: 'var(--color-success, #2d7a3a)' }}>
            No recorded progress will be lost by this adjustment.
          </p>
        )}
      </div>
    </Modal>
  );
}

// ============================================================
// CustomReadingModal (new in Commit 3b)
// Manual entry for dates with no Hebcal reading (e.g. Sunday bimah).
// Uses shared ReadingFieldGroup; routes through createReading with
// occasion: 'custom'.
// ============================================================

/**
 * Modal for manually creating a reading when Hebcal has no leyning
 * for the student's mitzvah date.
 *
 * The coordinator provides: portion name (free text), reading type
 * (torah/haftarah), book (constrained select), begin/end refs.
 * Flows through the same createReading + verse-expansion path as
 * the normal flow, so verses, mastery tracking, Road to the Bimah,
 * and the Adjust/override flow all work identically.
 */
function CustomReadingModal({ student, existingReadings, onAdd, onClose }) {
  const [step, setStep] = useState('fields'); // 'fields' | 'verses'
  const [portionName, setPortionName] = useState('');
  const [readingType, setReadingType] = useState('torah');
  const [book, setBook] = useState('');
  const [beginRef, setBeginRef] = useState('');
  const [endRef, setEndRef] = useState('');
  const [verseSelections, setVerseSelections] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Compute verses from the current range
  const computedVerses = useMemo(() => {
    if (!book || !beginRef || !endRef) return [];
    try {
      return expandVerseRange(book, beginRef, endRef);
    } catch {
      return [];
    }
  }, [book, beginRef, endRef]);

  function proceedToVerses() {
    // Validate required fields
    if (!portionName.trim()) {
      setError('Please enter a portion name (e.g. the reading assignment from the rabbi).');
      return;
    }

    // Validate refs
    const refError = validateRefs(book, beginRef, endRef);
    if (refError) {
      setError(refError);
      return;
    }

    if (computedVerses.length === 0) {
      setError('The entered range produces no verses. Please check the book and references.');
      return;
    }

    setError(null);
    setVerseSelections(computedVerses.map((v) => ({ ...v, selected: true })));
    setStep('verses');
  }

  function toggleVerse(index) {
    setVerseSelections((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], selected: !updated[index].selected };
      return updated;
    });
  }

  async function handleSave() {
    const selectedVerses = verseSelections.filter((v) => v.selected);
    if (selectedVerses.length === 0) {
      setError('Please select at least one verse.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const readingData = {
        reading_type: readingType,
        portion_name: portionName.trim(),
        portion_name_hebrew: null,
        aliyah: null,
        reference: buildReferenceString(book, beginRef, endRef),
        sefaria_url: buildSefariaUrl(book, beginRef, endRef),
        sort_order: existingReadings.length + 1,
        occasion: 'custom',
      };

      await onAdd(readingData, selectedVerses);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Step 1: Enter reading details
  if (step === 'fields') {
    return (
      <Modal
        title="Add Custom Reading"
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={proceedToVerses}>
              Next: Select Verses
            </button>
          </>
        }
      >
        {error && <div className="alert alert-error">{error}</div>}

        <p className="form-hint">
          Manually enter the reading details as assigned by the rabbi.
          This reading will be tracked like any other.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
          <div className="form-group">
            <label className="form-label">
              Portion name <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <input
              type="text"
              className="input"
              value={portionName}
              onChange={(e) => setPortionName(e.target.value)}
              placeholder="e.g. Special Maftir, Rosh Chodesh reading"
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Reading type <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <select
              className="input"
              value={readingType}
              onChange={(e) => setReadingType(e.target.value)}
            >
              <option value="torah">Torah</option>
              <option value="haftarah">Haftarah</option>
            </select>
          </div>

          <ReadingFieldGroup
            book={book}
            onBookChange={setBook}
            beginRef={beginRef}
            onBeginRefChange={setBeginRef}
            endRef={endRef}
            onEndRefChange={setEndRef}
            verseCount={computedVerses.length}
          />
        </div>
      </Modal>
    );
  }

  // Step 2: Select individual verses
  return (
    <Modal
      title="Select Verses"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={() => setStep('fields')}>Back</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Reading'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}

      <p className="form-hint">
        All verses are selected by default. Uncheck any verses the student will not be reading.
      </p>

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h4>
          {readingType === 'torah' ? 'Torah' : 'Haftarah'}{' '}
          <span className="form-hint">{book} {beginRef}-{endRef}</span>
        </h4>
        <div className="verse-checkbox-grid">
          {verseSelections.map((v, i) => (
            <label key={i} className="checkbox-row">
              <input
                type="checkbox"
                checked={v.selected}
                onChange={() => toggleVerse(i)}
              />
              <span>{v.reference}</span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// AddReadingModal (occasion-aware, Commit 3b)
// ============================================================

/**
 * Modal for the add-reading Hebcal flow.
 *
 * Occasion-aware: routes between four cases based on what
 * resolveReadingsForDate returns for the student's mitzvah_date.
 *
 * Case 1 (95%): Regular Shabbat parashah -> triennial aliyot + standard haftarah
 * Case 2: Holiday or weekday -> full kriyah aliyot from parseAliyot()
 * Case 3: No readings (date has no leyning) -> message + "Add Custom Reading" button
 * Case 4: Multiple readings on one date -> picker step before aliyot
 *
 * The chosen reading's occasion tag flows through to the readings.occasion
 * column via onAdd (createReading in useStudent.js).
 */
function AddReadingModal({ hebcalData, resolvedData, student, existingReadings, onAdd, onOpenCustom, onClose }) {
  // Determine readings from resolved data
  const resolvedReadings = resolvedData?.readings || [];
  const needsPicker = resolvedReadings.length > 1;

  // Steps: 'pick' (Case 4 multi-reading picker) -> 'select' (aliyot) -> 'verses'
  const [step, setStep] = useState(needsPicker ? 'pick' : 'select');
  const [chosenReading, setChosenReading] = useState(null);
  const [selectedAliyot, setSelectedAliyot] = useState({});
  const [selectedHaftarah, setSelectedHaftarah] = useState(false);
  const [verseSelections, setVerseSelections] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Determine the occasion: auto-select when there's exactly one reading, or use the picked one
  const activeReading = chosenReading
    || (resolvedReadings.length === 1 ? resolvedReadings[0] : null);

  const occasion = activeReading?.occasion || null;

  // ------------------------------------------------------------------
  // Shabbat path: triennial aliyot + standard haftarah (unchanged logic)
  // ------------------------------------------------------------------
  const shabbatAliyot = useMemo(() => {
    if (occasion !== 'shabbat') return [];
    return hebcalData?.event ? parseTriennialAliyot(hebcalData.event) : [];
  }, [occasion, hebcalData?.event]);

  const cycleYear = useMemo(() => {
    if (occasion !== 'shabbat') return null;
    return hebcalData?.event ? getTriennialCycleYear(hebcalData.event) : null;
  }, [occasion, hebcalData?.event]);

  const shabbatHaftarah = useMemo(() => {
    if (occasion !== 'shabbat') return { ashkenazi: null, sephardi: null };
    return hebcalData?.leyning ? parseHaftarah(hebcalData.leyning) : { ashkenazi: null };
  }, [occasion, hebcalData?.leyning]);

  // ------------------------------------------------------------------
  // Holiday / weekday path: full kriyah aliyot from the resolved reading
  // ------------------------------------------------------------------
  const nonShabbatAliyot = useMemo(() => {
    if (!activeReading || occasion === 'shabbat') return [];
    // parseAliyot reads .weekday or .fullkriyah, whichever is present
    return parseAliyot(activeReading);
  }, [activeReading, occasion]);

  const nonShabbatHaftara = useMemo(() => {
    if (!activeReading || occasion === 'shabbat') return null;
    if (!activeReading.haftara) return null;
    return activeReading.haftara;
  }, [activeReading, occasion]);

  // ------------------------------------------------------------------
  // Unified aliyot and haftarah for the current occasion
  // ------------------------------------------------------------------
  const aliyot = occasion === 'shabbat' ? shabbatAliyot : nonShabbatAliyot;
  const haftaraRef = occasion === 'shabbat' ? shabbatHaftarah.ashkenazi : nonShabbatHaftara;
  const sephHaftaraRef = occasion === 'shabbat' ? shabbatHaftarah.sephardi : null;

  // Portion name and Hebrew from the active reading
  const portionName = activeReading?.name || hebcalData?.parsha || '';
  const portionNameHebrew = activeReading?.nameHebrew || hebcalData?.parshaHebrew || null;

  // Check which aliyot are already assigned
  const assignedAliyot = new Set(
    existingReadings.filter((r) => r.reading_type === 'torah').map((r) => r.aliyah)
  );
  const hasHaftarah = existingReadings.some((r) => r.reading_type === 'haftarah');

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  function handlePickReading(reading) {
    setChosenReading(reading);
    setStep('select');
    setSelectedAliyot({});
    setSelectedHaftarah(false);
    setError(null);
  }

  function toggleAliyah(num) {
    setSelectedAliyot((prev) => ({ ...prev, [num]: !prev[num] }));
  }

  function proceedToVerses() {
    if (!Object.values(selectedAliyot).some(Boolean) && !selectedHaftarah) {
      setError('Please select at least one reading.');
      return;
    }
    setError(null);

    // Build verse selections for each selected reading
    const selections = {};

    Object.entries(selectedAliyot).forEach(([num, isSelected]) => {
      if (!isSelected) return;
      const aliyah = aliyot.find((a) => a.number === num);
      if (!aliyah) return;

      const verses = expandVerseRange(aliyah.book, aliyah.beginRef, aliyah.endRef);
      selections[`torah-${num}`] = {
        type: 'torah',
        aliyahNumber: num,
        aliyahName: aliyah.name,
        book: aliyah.book,
        beginRef: aliyah.beginRef,
        endRef: aliyah.endRef,
        verses: verses.map((v) => ({ ...v, selected: true })),
      };
    });

    if (selectedHaftarah && haftaraRef) {
      const segments = parseHaftarahSegments(haftaraRef);
      if (segments.length > 0) {
        const verses = segments.flatMap((seg) =>
          expandVerseRange(seg.book, seg.beginRef, seg.endRef)
        );
        // Use first segment's book/beginRef and last segment's endRef
        // for the reading-level reference stored in the DB.
        const first = segments[0];
        const last = segments[segments.length - 1];
        selections['haftarah'] = {
          type: 'haftarah',
          aliyahNumber: null,
          aliyahName: null,
          book: first.book,
          beginRef: first.beginRef,
          endRef: last.endRef,
          // For multi-segment Haftarot, preserve the first segment's
          // endRef so the Sefaria URL links to a valid single-book range.
          firstSegEndRef: segments.length > 1 ? first.endRef : null,
          // For multi-segment Haftarot, store the full raw ref string
          // so the reading.reference column preserves the original.
          rawRef: segments.length > 1 || first.book !== last.book ? haftaraRef : null,
          verses: verses.map((v) => ({ ...v, selected: true })),
        };
      }
    }

    setVerseSelections(selections);
    setStep('verses');
  }

  function toggleVerse(readingKey, verseIndex) {
    setVerseSelections((prev) => {
      const updated = { ...prev };
      const reading = { ...updated[readingKey] };
      const verses = [...reading.verses];
      verses[verseIndex] = { ...verses[verseIndex], selected: !verses[verseIndex].selected };
      reading.verses = verses;
      updated[readingKey] = reading;
      return updated;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      for (const [key, sel] of Object.entries(verseSelections)) {
        const selectedVerses = sel.verses.filter((v) => v.selected);
        if (selectedVerses.length === 0) continue;

        const readingData = {
          reading_type: sel.type,
          portion_name: portionName,
          portion_name_hebrew: portionNameHebrew,
          aliyah: sel.aliyahName || null,
          reference: sel.rawRef || buildReferenceString(sel.book, sel.beginRef, sel.endRef),
          sefaria_url: sel.rawRef
            ? buildSefariaUrl(sel.book, sel.beginRef, sel.firstSegEndRef || sel.endRef)
            : buildSefariaUrl(sel.book, sel.beginRef, sel.endRef),
          sort_order: existingReadings.length + Object.keys(verseSelections).indexOf(key) + 1,
          occasion: occasion || 'shabbat',
        };

        await onAdd(readingData, selectedVerses);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------------------------
  // Gate: no mitzvah date
  // ------------------------------------------------------------------
  if (!resolvedData && !hebcalData) {
    return (
      <Modal title="Add Reading" onClose={onClose}>
        <p>No mitzvah date set for this student. Please set a date in the Student Information section first.</p>
      </Modal>
    );
  }

  // ------------------------------------------------------------------
  // Gate: error from Hebcal
  // ------------------------------------------------------------------
  if (resolvedData?.error) {
    return (
      <Modal title="Add Reading" onClose={onClose}>
        <div className="alert alert-error">{resolvedData.error}</div>
      </Modal>
    );
  }

  // ------------------------------------------------------------------
  // Case 3: No readings on this date (no leyning scheduled)
  // Reachable for Sunday/Tuesday/Wednesday/Friday non-holidays.
  // Offers manual custom reading entry.
  // ------------------------------------------------------------------
  if (resolvedReadings.length === 0) {
    const dateDisplay = student?.mitzvah_date || 'this date';
    return (
      <Modal
        title="Add Reading"
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={onOpenCustom}>
              Add Custom Reading
            </button>
          </>
        }
      >
        <p>
          No Torah reading is scheduled for {dateDisplay}.
          B'nai Mitzvah dates typically fall on Shabbat, a Monday or Thursday
          with weekday Torah reading, or a holiday with its own leyning.
        </p>
        <p className="form-hint" style={{ marginTop: 'var(--space-3)' }}>
          If the service date is correct and the rabbi has assigned a custom
          reading, use "Add Custom Reading" to enter it manually.
          Otherwise, confirm the date in the Student Information section.
        </p>
      </Modal>
    );
  }

  // ------------------------------------------------------------------
  // Case 4: Multiple readings on one date (picker step)
  // ------------------------------------------------------------------
  if (step === 'pick') {
    return (
      <Modal
        title="Add Reading: Choose Reading"
        onClose={onClose}
        footer={
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        }
      >
        <p className="form-hint">
          This date has multiple Torah readings. Select which reading applies to this student.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
          {resolvedReadings.map((r) => (
            <button
              key={r.index}
              className="btn btn-outline"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: 'var(--space-3)',
                textAlign: 'left',
                gap: 'var(--space-1)',
              }}
              onClick={() => handlePickReading(r)}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span className={`badge ${r.occasion === 'shabbat' ? 'badge-active' : 'badge-deferred'}`}>
                  {OCCASION_LABELS[r.occasion] || r.occasion}
                </span>
                <strong>{r.name}</strong>
                {r.nameHebrew && (
                  <span className="form-hint" style={{ fontFamily: 'var(--font-display, serif)' }}>
                    {r.nameHebrew}
                  </span>
                )}
              </span>
              {r.summary && (
                <span className="form-hint">{r.summary}</span>
              )}
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  // ------------------------------------------------------------------
  // Gate: no active reading resolved (shouldn't happen, but defensive)
  // ------------------------------------------------------------------
  if (!activeReading && !hebcalData?.parsha) {
    return (
      <Modal title="Add Reading" onClose={onClose}>
        <p>{hebcalData?.holidayNote || 'No parashah found for this date.'}</p>
      </Modal>
    );
  }

  // ------------------------------------------------------------------
  // Build the modal title based on occasion
  // ------------------------------------------------------------------
  let modalTitle = 'Add Reading';
  if (occasion === 'shabbat') {
    modalTitle = `Add Reading: Parashat ${portionName}`;
  } else if (occasion === 'holiday') {
    modalTitle = `Add Reading: ${portionName}`;
  } else if (occasion === 'weekday') {
    modalTitle = `Add Reading: ${portionName} (weekday)`;
  }

  // ------------------------------------------------------------------
  // Step 1: Select aliyot and haftarah
  // ------------------------------------------------------------------
  if (step === 'select') {
    return (
      <Modal
        title={modalTitle}
        onClose={onClose}
        footer={
          <>
            {resolvedReadings.length > 1 && (
              <button className="btn btn-outline" onClick={() => { setStep('pick'); setChosenReading(null); }}>
                Back
              </button>
            )}
            {resolvedReadings.length <= 1 && (
              <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            )}
            <button className="btn btn-primary" onClick={proceedToVerses}>
              Next: Select Verses
            </button>
          </>
        }
      >
        {error && <div className="alert alert-error">{error}</div>}

        <p className="form-hint">
          Select which reading(s) this student is responsible for. Already assigned readings are disabled.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <h4 style={{ marginTop: 'var(--space-2)' }}>
            Torah Aliyot
            {occasion === 'shabbat' && cycleYear && (
              <span className="form-hint" style={{ fontWeight: 'normal', marginLeft: 'var(--space-2)' }}>
                Triennial Year {cycleYear}
              </span>
            )}
            {occasion === 'holiday' && (
              <span className="form-hint" style={{ fontWeight: 'normal', marginLeft: 'var(--space-2)' }}>
                Holiday reading
              </span>
            )}
            {occasion === 'weekday' && (
              <span className="form-hint" style={{ fontWeight: 'normal', marginLeft: 'var(--space-2)' }}>
                Weekday reading (3 aliyot)
              </span>
            )}
          </h4>
          {aliyot.map((a) => {
            const alreadyAssigned = assignedAliyot.has(a.name);
            return (
              <label key={a.number} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={!!selectedAliyot[a.number]}
                  disabled={alreadyAssigned}
                  onChange={() => toggleAliyah(a.number)}
                />
                <span className={alreadyAssigned ? 'form-hint' : ''}>
                  <strong>{a.name}</strong>{' '}
                  <span className="form-hint">
                    {a.book} {a.beginRef}-{a.endRef} ({a.verseCount} verses)
                  </span>
                  {alreadyAssigned && <span className="form-hint"> (already assigned)</span>}
                </span>
              </label>
            );
          })}

          {haftaraRef && (
            <>
              <h4 style={{ marginTop: 'var(--space-3)' }}>Haftarah</h4>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selectedHaftarah}
                  disabled={hasHaftarah}
                  onChange={() => setSelectedHaftarah(!selectedHaftarah)}
                />
                <span className={hasHaftarah ? 'form-hint' : ''}>
                  <strong>Haftarah</strong>{' '}
                  <span className="form-hint">{haftaraRef}</span>
                  {hasHaftarah && <span className="form-hint"> (already assigned)</span>}
                  {sephHaftaraRef && (
                    <span className="form-hint"> (Sephardi: {sephHaftaraRef})</span>
                  )}
                </span>
              </label>
            </>
          )}
        </div>
      </Modal>
    );
  }

  // ------------------------------------------------------------------
  // Step 2: Select individual verses
  // ------------------------------------------------------------------
  return (
    <Modal
      title="Select Verses"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={() => setStep('select')}>Back</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Readings'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}

      <p className="form-hint">
        All verses are selected by default. Uncheck any verses the student will not be reading.
      </p>

      {Object.entries(verseSelections).map(([key, sel]) => (
        <div key={key} style={{ marginBottom: 'var(--space-4)' }}>
          <h4>
            {sel.type === 'torah' ? `${sel.aliyahName} (Torah)` : 'Haftarah'}{' '}
            <span className="form-hint">
              {sel.rawRef || `${sel.book} ${sel.beginRef}-${sel.endRef}`}
            </span>
          </h4>
          <div className="verse-checkbox-grid">
            {sel.verses.map((v, i) => (
              <label key={i} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={v.selected}
                  onChange={() => toggleVerse(key, i)}
                />
                <span>{v.reference}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  );
}
