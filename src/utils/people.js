/**
 * People display-name utilities for MyMadrich.
 *
 * Pure functions — no side effects, no API calls.
 */

/**
 * Returns a human-readable display name for a person (typically a tutor).
 *
 * Cascade:
 *   1. display_name (the profile field)
 *   2. first_name + last_name (if both present)
 *   3. Humanized email local-part ("rachel.mirsky@…" → "Rachel Mirsky")
 *   4. fallback string (default "Unknown tutor")
 *
 * The raw email address is NEVER returned as a display label.
 *
 * @param {Object|null|undefined} person - Object with optional display_name,
 *   first_name, last_name, and email fields.
 * @param {string} [fallback='Unknown tutor'] - Returned when nothing else works.
 * @returns {string} A human-readable name, never an email address.
 */
export function tutorName(person, fallback = 'Unknown tutor') {
  if (!person) return fallback;

  // 1. Explicit display name
  if (person.display_name && person.display_name.trim()) {
    return person.display_name.trim();
  }

  // 2. First + last name
  const first = (person.first_name || '').trim();
  const last = (person.last_name || '').trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;

  // 3. Humanized email local-part (last resort before fallback)
  if (person.email && person.email.includes('@')) {
    return humanizeEmailLocal(person.email);
  }

  return fallback;
}

/**
 * Extracts the local part of an email and title-cases it.
 * "rachel.mirsky@gmail.com" → "Rachel Mirsky"
 * "rmmirsky@gmail.com"      → "Rmmirsky"
 *
 * @param {string} email
 * @returns {string}
 */
function humanizeEmailLocal(email) {
  const local = email.split('@')[0] || '';
  return local
    .split(/[._-]+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
}

// ---- Multi-tutor display utilities (M:N student_tutors) ----

/**
 * Returns a human-readable label for a student's assigned tutor list.
 *
 * Takes the student_tutors join array from the Supabase query, where each
 * entry has a nested `tutor` profile object (from the FK join). Uses
 * tutorName() internally for each tutor's display name.
 *
 * Display rules:
 *   - Zero tutors (or null/undefined): returns fallback
 *   - One tutor:  "Sarah Cohen"
 *   - Two tutors: "Sarah Cohen, David Levy"
 *   - Three+:     "Sarah Cohen, David Levy +1"
 *
 * The cap at 2 visible names keeps table cells and mobile layouts readable.
 * Callers needing the full list should iterate student_tutors directly.
 *
 * Dual-read fallback: if student_tutors is empty/missing but the legacy
 * tutor:profiles!tutor_id object is present, falls back to tutorName(tutor).
 * This handles surfaces not yet migrated to read from student_tutors.
 *
 * @param {Array|null|undefined} studentTutors - Array from
 *   student_tutors(tutor_id, tutor:profiles!tutor_id(id, display_name, email))
 * @param {Object|null|undefined} [legacyTutor] - The old tutor:profiles!tutor_id
 *   join object, used as dual-read fallback.
 * @param {string} [fallback='Unassigned'] - Returned when no tutors are assigned.
 * @returns {string}
 */
export function tutorListLabel(studentTutors, legacyTutor, fallback = 'Unassigned') {
  // Normalize: filter to entries that have a tutor profile
  const entries = (studentTutors || []).filter((st) => st.tutor);

  if (entries.length === 0) {
    // Dual-read fallback: use legacy tutor:profiles!tutor_id if present
    if (legacyTutor) {
      return tutorName(legacyTutor, fallback);
    }
    return fallback;
  }

  // Sort by created_at ascending (oldest first = most stable ordering)
  const sorted = [...entries].sort((a, b) => {
    const da = a.created_at || '';
    const db = b.created_at || '';
    return da.localeCompare(db);
  });

  const MAX_VISIBLE = 2;
  const names = sorted.slice(0, MAX_VISIBLE).map((st) => tutorName(st.tutor));
  const overflow = sorted.length - MAX_VISIBLE;

  if (overflow > 0) {
    return `${names.join(', ')} +${overflow}`;
  }

  return names.join(', ');
}

/**
 * Returns the full array of tutor profile objects from student_tutors,
 * sorted by created_at ascending (oldest first).
 *
 * Useful when a component needs the full list (e.g., the assignment
 * add/remove UI) rather than the truncated display label.
 *
 * @param {Array|null|undefined} studentTutors - Array from the join query.
 * @returns {Array<Object>} Array of tutor profile objects ({ id, display_name, email }).
 */
export function tutorListProfiles(studentTutors) {
  const entries = (studentTutors || []).filter((st) => st.tutor);
  return [...entries]
    .sort((a, b) => {
      const da = a.created_at || '';
      const db = b.created_at || '';
      return da.localeCompare(db);
    })
    .map((st) => st.tutor);
}

// ---- Mitzvah type utilities ----

/**
 * Returns a formatted mitzvah type label.
 *
 * Stored values: 'bar' | 'bat' | "b'nai" | null
 * Output:        "Bar Mitzvah" | "Bat Mitzvah" | "B\u2019nai Mitzvah"
 *
 * Null/undefined/empty returns the fallback (default "B\u2019nai Mitzvah").
 *
 * @param {string|null|undefined} type - The mitzvah_type column value.
 * @param {string} [fallback="B\u2019nai Mitzvah"] - Returned when type is empty.
 * @returns {string}
 */
export function mitzvahLabel(type, fallback = 'B\u2019nai Mitzvah') {
  if (!type) return fallback;
  const t = type.toLowerCase().trim();
  if (t === 'bar') return 'Bar Mitzvah';
  if (t === 'bat') return 'Bat Mitzvah';
  if (t === "b'nai" || t === 'bnai') return 'B\u2019nai Mitzvah';
  // Unknown value: title-case + Mitzvah
  return t.charAt(0).toUpperCase() + t.slice(1) + ' Mitzvah';
}

/**
 * Returns a possessive pronoun derived from mitzvah_type.
 *
 * 'bat' \u2192 'her', 'bar' \u2192 'his', anything else \u2192 'their'.
 *
 * Used where the codebase previously referenced a non-existent
 * `student.gender` column. The mitzvah_type is the intended source.
 *
 * @param {string|null|undefined} type - The mitzvah_type column value.
 * @returns {string} 'her' | 'his' | 'their'
 */
export function mitzvahPronoun(type) {
  if (!type) return 'their';
  const t = type.toLowerCase().trim();
  if (t === 'bat') return 'her';
  if (t === 'bar') return 'his';
  return 'their';
}
