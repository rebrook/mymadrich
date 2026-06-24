# MyMadrich: Data Model (v2)

## Overview

This document defines the Supabase (Postgres) database schema for MyMadrich. The schema is designed around three principles:

1. **Flexibility:** Where requirements may evolve (service elements, guardian structures, homework types), the schema uses open text fields and rows-as-configuration rather than rigid enums. Where requirements are stable and the frontend depends on type distinctions (reading types, quality ratings), the schema uses Postgres enums for type safety.

2. **Scalability:** At 30 to 50 students per cohort, this is a small-scale application. The schema is optimized for query clarity and developer maintainability over raw performance. Indexes target the specific access patterns required by each role's dashboard. Computed views keep the frontend simple. If data volume grows significantly (multiple concurrent cohorts over many years), the views can be converted to materialized views with no schema changes.

3. **Security by default:** Row Level Security (RLS) is enforced at the database level, not the application level. Every table has explicit policies per role. This means even a frontend bug or API misconfiguration cannot leak data across role boundaries.

---

## Architecture Layers

The schema is organized into four layers:

| Layer | Tables | Purpose |
|-------|--------|---------|
| **Identity** | profiles, cohorts, students, student_guardians, pending_invitations | Who everyone is, how they relate, and invitation tracking |
| **Curriculum** | readings, verses, service_elements | What each student is responsible for |
| **Activity** | sessions, session_verse_progress, session_element_progress, homework_items | What happens in each lesson |
| **Views** | verse_current_status, element_current_status | Computed "current state" for dashboards |

---

## Enum Types

These are Postgres `CREATE TYPE` enums used where the value set is stable and the frontend rendering logic depends on the distinction.

```sql
CREATE TYPE user_role AS ENUM ('admin', 'tutor', 'student', 'parent');
CREATE TYPE reading_type AS ENUM ('torah', 'haftarah');
CREATE TYPE verse_status AS ENUM ('review', 'new', 'torah_side');
CREATE TYPE quality_rating AS ENUM ('perfect', 'minor_mistakes', 'moderate_mistakes', 'still_learning');
```

**Why enums here but not everywhere:** These four types are tightly coupled to frontend rendering logic (progress bar colors, Gold state, role-based views). Adding a new value requires a code change anyway, so the enum constraint protects against data entry errors at no flexibility cost. In contrast, `service_elements.category`, `student_guardians.relationship`, and `homework_items.item_type` use plain text because admins should be able to create new categories, relationship labels, and homework types without a schema migration.

### Quality Rating to Dashboard Color Mapping

| quality_rating | Color | Display Label |
|---------------|-------|---------------|
| (no entry exists) | Gray | Not yet started |
| `still_learning` | Orange | Still learning |
| `moderate_mistakes` | Yellow | 3-5 mistakes |
| `minor_mistakes` | Green-yellow | 1-2 mistakes |
| `perfect` | Green | Mastered (trope/vowels) |
| `perfect` + `torah_side` | Gold | Torah-side mastery (Torah readings only) |

---

## Layer 1: Identity

### profiles

Extends Supabase `auth.users`. One row per authenticated user, auto-created on first sign-in via a database trigger.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, references auth.users(id) ON DELETE CASCADE | Matches Supabase auth user ID |
| `email` | text | NOT NULL, UNIQUE | From auth provider |
| `display_name` | text | NOT NULL | Full name for display |
| `role` | user_role | NOT NULL | One of: admin, tutor, student, parent |
| `phone` | text | NULLABLE | Optional contact number |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | Auto-updated via trigger |

**Design notes:**
- `ON DELETE CASCADE` from auth.users ensures that if Supabase auth deletes a user, the profile is cleaned up automatically.
- `email` has a UNIQUE constraint because it serves as the human-readable identifier across the app (tutor lookups during spreadsheet import, guardian account matching).

### cohorts

Groups students by program year or cycle.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `name` | text | NOT NULL, UNIQUE | e.g., "2026-2027" |
| `start_date` | date | NULLABLE | Program start |
| `end_date` | date | NULLABLE | Program end |
| `is_active` | boolean | NOT NULL, DEFAULT true | Only active cohorts shown by default |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Design notes:**
- `is_active` enables soft-archiving of past cohorts without deleting data. Historical session data remains queryable for reporting or reference.
- `name` is UNIQUE to prevent accidental duplicate cohort creation.

### students

The central entity. Represents a student profile, which may or may not have a linked user account.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `user_id` | uuid | NULLABLE, UNIQUE, FK -> profiles(id) ON DELETE SET NULL | Null if student has no login yet |
| `cohort_id` | uuid | NOT NULL, FK -> cohorts(id) ON DELETE RESTRICT | Cannot delete a cohort with students |
| `tutor_id` | uuid | NOT NULL, FK -> profiles(id) ON DELETE RESTRICT | Cannot delete a tutor with students |
| `first_name` | text | NOT NULL | |
| `last_name` | text | NOT NULL | |
| `mitzvah_date` | date | NOT NULL | The B'nai Mitzvah date |
| `mitzvah_type` | text | NULLABLE | "bar", "bat", or "b'nai" (text, not enum, for flexibility) |
| `status` | text | NOT NULL, DEFAULT 'active' | Student lifecycle state: "active", "completed", "deferred", "withdrawn" |
| `external_links` | jsonb | DEFAULT '{}' | Optional cross-system references (e.g., SimchaKit event_id). Pointer only, not a data mirror. |
| `notes` | text | NULLABLE | Admin/tutor internal notes |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | Auto-updated via trigger |

**Design notes:**
- `user_id` is NULLABLE because admin creates student profiles via spreadsheet import before students are invited to create accounts. The UNIQUE constraint ensures a user account cannot be linked to multiple student profiles.
- `ON DELETE RESTRICT` on `cohort_id` and `tutor_id` prevents accidental data loss. To delete a tutor, their students must first be reassigned. To delete a cohort, its students must first be moved or removed.
- `ON DELETE SET NULL` on `user_id` means if a user account is deleted, the student profile persists (with login access removed), preserving all historical session data.
- Parent/guardian contact info has been moved to `student_guardians` (see below) to support multiple guardians per student.
- `status` is plain text (not enum) for flexibility. Common values are:
  - `active` : Currently in the program, receiving tutoring
  - `completed` : B'nai Mitzvah is done, all data preserved as read-only
  - `deferred` : Postponed or on hold (e.g., B'nai Mitzvah date pushed back)
  - `withdrawn` : Dropped out of the program
- `external_links` is a JSONB field for optional cross-system references. Currently used for SimchaKit integration:
  ```json
  {"simchakit_event_id": "abc-123", "simchakit_url": "https://simchakit.com/event/abc-123"}
  ```
  This field stores only linking keys and convenience URLs, never copies of external data. Each app maintains its own complete data independently. A partial GIN index enables efficient lookups by event_id while excluding empty records.

### Cohort Lifecycle

When a cohort ends, the following happens:

1. Admin sets `cohorts.is_active = false` for the completed cohort.
2. Admin updates individual students to `status = 'completed'` (or bulk-updates all students in the cohort).
3. All historical data (sessions, progress, homework) is preserved permanently.

**Access after cohort archival:**

| Role | Active Cohort Students | Archived Cohort Students |
|------|----------------------|------------------------|
| **Admin** | Full read/write | Full read/write (can still make corrections) |
| **Tutor** | Full read/write | Read-only (toggle to view past students) |
| **Student** | Read-only (as always) | Read-only (access preserved indefinitely) |
| **Parent/Guardian** | Read-only (as always) | Read-only (access preserved indefinitely) |

**Read-only enforcement on archived data** is handled at two levels:
- **Database (RLS):** INSERT and UPDATE policies on sessions, session_verse_progress, session_element_progress, and homework_items check that the student's cohort `is_active = true` before allowing writes. Admins are exempt.
- **Frontend:** Edit controls (log session, edit session) are hidden when viewing archived students.

**Edge cases:**
- A student whose B'nai Mitzvah is delayed can be marked `status = 'deferred'` while their cohort mates are `completed`, or moved to the next cohort by updating `cohort_id`.
- A tutor continues into the next cohort with new students. Their profile persists across cohorts; only the student assignments change.
- If time-based access revocation is needed later, a `access_expires_at` date column can be added to `students` and checked in RLS policies. No structural schema changes required.

### student_guardians

Stores guardian contact info AND optionally links to a user account for login access. Replaces both the old parent fields on `students` and the old `student_parents` table.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `student_id` | uuid | NOT NULL, FK -> students(id) ON DELETE CASCADE | |
| `user_id` | uuid | NULLABLE, FK -> profiles(id) ON DELETE SET NULL | Links to guardian's login, if they have one |
| `name` | text | NOT NULL | Display name |
| `relationship` | text | NOT NULL, DEFAULT 'Parent' | e.g., "Mother", "Father", "Guardian", "Stepparent" |
| `email` | text | NULLABLE | Contact email |
| `phone` | text | NULLABLE | Contact phone |
| `is_primary` | boolean | NOT NULL, DEFAULT false | Primary contact for dashboard display |
| `sort_order` | integer | NOT NULL, DEFAULT 0 | Display ordering |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Unique constraint:** `(student_id, user_id)` WHERE `user_id IS NOT NULL` to prevent linking the same guardian account to the same student twice.

**Design notes:**
- `relationship` is plain text (not enum) because family structures vary and we should not constrain what labels people use.
- A guardian record can exist purely for contact info (user_id = NULL) or also serve as a login linkage (user_id populated). This means the admin can enter "Mom: Jane Smith, 410-555-1234" during setup, and later when Jane creates an account, the admin links her user_id to that existing guardian record.
- `ON DELETE CASCADE` from students: if a student is removed, their guardian records are cleaned up.
- `ON DELETE SET NULL` from profiles: if a guardian's user account is deleted, the contact info remains on file.
- `is_primary` marks which guardian shows first on dashboards and in contact lists.

### pending_invitations

Tracks user invitations created by admin. When an invited user signs in, the `process_pending_invitation()` function auto-applies their role and account linkage.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `email` | text | NOT NULL | Email of the invited user |
| `intended_role` | user_role | NOT NULL, DEFAULT 'parent' | Role to assign when user signs in |
| `student_id` | uuid | NULLABLE, FK -> students(id) ON DELETE CASCADE | Pre-link to student record (for student role) |
| `guardian_id` | uuid | NULLABLE, FK -> student_guardians(id) ON DELETE CASCADE | Pre-link to guardian record (for parent role) |
| `invited_by` | uuid | NOT NULL, FK -> profiles(id) | Admin who created the invitation |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `accepted_at` | timestamptz | NULLABLE | Set when invitation is processed on sign-in |

**Design notes:**
- Invitations are created by the admin via the Users tab. The admin shares a formatted invite message (copied to clipboard) with the user via email or text.
- When an invited user signs in, the frontend calls `process_pending_invitation()`, a `SECURITY DEFINER` function that matches the authenticated user's email to a pending invitation and auto-applies the intended role and linkage.
- `ON DELETE CASCADE` on student_id and guardian_id: if the linked student or guardian record is deleted, the invitation is cleaned up.
- RLS: admin-only CRUD. The auto-processing function bypasses RLS via SECURITY DEFINER.
- **Future enhancement:** Replace the copy/paste invitation flow with server-side `inviteUserByEmail()` once the app has a backend (Vercel API routes or Supabase Edge Functions). Customize the Supabase invite email template in Auth > Email Templates.

---

## Layer 2: Curriculum

### readings

A Torah or Haftarah reading assigned to a student. A student may have multiple readings (e.g., one Torah aliyah and one Haftarah, or multiple Torah aliyot).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `student_id` | uuid | NOT NULL, FK -> students(id) ON DELETE CASCADE | |
| `reading_type` | reading_type | NOT NULL | torah or haftarah |
| `portion_name` | text | NOT NULL | e.g., "Lech Lecha" |
| `aliyah` | text | NULLABLE | e.g., "Rishon", "Shlishi" (Torah only) |
| `reference` | text | NOT NULL | e.g., "Genesis 12:1-12:13" |
| `sefaria_url` | text | NULLABLE | Direct link to reading on Sefaria |
| `sort_order` | integer | NOT NULL, DEFAULT 0 | Display ordering on dashboard |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Design notes:**
- `reading_type` is a Postgres enum because the frontend renders Torah and Haftarah differently (Gold state applies only to Torah). Adding a new reading type (e.g., Megillah) is a one-line `ALTER TYPE ADD VALUE` plus a frontend update to define its rendering behavior.
- `ON DELETE CASCADE` from students: removing a student cleans up all their readings and (via cascade from readings to verses) all verse data.

### verses

Individual p'sukim within a reading. Each verse is one segment in the progress bar.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `reading_id` | uuid | NOT NULL, FK -> readings(id) ON DELETE CASCADE | |
| `verse_reference` | text | NOT NULL | e.g., "Genesis 12:1" |
| `sefaria_url` | text | NULLABLE | Direct link to verse on Sefaria |
| `sort_order` | integer | NOT NULL | Order within the progress bar (1, 2, 3...) |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Unique constraint:** `(reading_id, sort_order)` to prevent duplicate ordering within a reading.

**Unique constraint:** `(reading_id, verse_reference)` to prevent the same verse being assigned twice to the same reading.

### service_elements

Flexible, catch-all table for anything a student is responsible for beyond multi-verse readings. Blessings, d'var torah, prayers, leading a service section, or any future trackable item.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `student_id` | uuid | NOT NULL, FK -> students(id) ON DELETE CASCADE | |
| `category` | text | NOT NULL | Grouping label for dashboard display: "blessings", "service_parts", "prayers", etc. |
| `label` | text | NOT NULL | Display name: "Torah blessing (before)", "D'var Torah", etc. |
| `notes` | text | NULLABLE | Optional description, instructions, or reference material |
| `sort_order` | integer | NOT NULL, DEFAULT 0 | Display order within category |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Unique constraint:** `(student_id, category, label)` to prevent duplicate elements for the same student.

**Design notes:**
- `category` and `label` are both plain text, not enums. This is intentional: the admin can create any category or label without a schema migration. Common categories like "blessings" and "service_parts" will be established by convention and seeded during initial setup, but nothing prevents adding "prayers" or "songs" later.
- The dashboard groups elements by `category` and sorts within each group by `sort_order`.
- For a typical student, this table would contain rows like:

| category | label | sort_order |
|----------|-------|------------|
| blessings | Torah blessing (before) | 1 |
| blessings | Torah blessing (after) | 2 |
| blessings | Haftarah blessing (before) | 3 |
| blessings | Haftarah blessing (after #1) | 4 |
| blessings | Haftarah blessing (after #2) | 5 |
| blessings | Haftarah blessing (after #3) | 6 |
| blessings | Haftarah blessing (after #4) | 7 |
| service_parts | D'var Torah | 1 |

- When the admin sets up a new student (or imports via spreadsheet), a default set of service_elements can be auto-created based on a template. The admin can then add, remove, or rename elements per student as needed.

---

## Layer 3: Activity

### sessions

A single tutoring session record.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `student_id` | uuid | NOT NULL, FK -> students(id) ON DELETE CASCADE | |
| `tutor_id` | uuid | NOT NULL, FK -> profiles(id) ON DELETE RESTRICT | Tutor who logged this session |
| `session_date` | date | NOT NULL | When the session took place |
| `next_session_date` | date | NULLABLE | Scheduled next session |
| `next_session_time` | time | NULLABLE | Scheduled next session time |
| `homework_notes` | text | NULLABLE | Freeform additional homework notes |
| `homework_minutes_per_day` | integer | NULLABLE | Recommended daily practice (minutes) |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | Auto-updated via trigger |

**Design notes:**
- `ON DELETE RESTRICT` on `tutor_id`: sessions are historical records. If a tutor leaves, their session logs should remain and the tutor profile must be preserved (or sessions reassigned) before the tutor account can be removed.
- `session_date` is a date (not timestamptz) because sessions are logged by day, not by exact time.
- `next_session_time` is stored as `time` rather than combined into a `timestamptz` because the UI displays date and time separately, and `<input type="time">` returns a time value.

### session_verse_progress

Per-verse progress logged in a specific session. One row per verse worked on in that session.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `session_id` | uuid | NOT NULL, FK -> sessions(id) ON DELETE CASCADE | |
| `verse_id` | uuid | NOT NULL, FK -> verses(id) ON DELETE CASCADE | |
| `status` | verse_status | NOT NULL | review, new, or torah_side |
| `quality` | quality_rating | NOT NULL | perfect, minor_mistakes, moderate_mistakes, still_learning |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Unique constraint:** `(session_id, verse_id)` to prevent logging the same verse twice in one session.

**Design notes:**
- Every session entry for a verse is preserved (not overwritten). This creates a full history of how a student progressed on each verse over time, which is essential for the Phase 2 pace/timeline calculations.
- The `verse_current_status` view (Layer 4) computes the "latest" state for dashboard rendering.

### session_element_progress

Per-element progress logged in a specific session. Tracks blessings, d'var torah, and any other service_elements.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `session_id` | uuid | NOT NULL, FK -> sessions(id) ON DELETE CASCADE | |
| `element_id` | uuid | NOT NULL, FK -> service_elements(id) ON DELETE CASCADE | |
| `quality` | quality_rating | NOT NULL | Same scale as verses |
| `notes` | text | NULLABLE | Optional session-specific notes for this element |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Unique constraint:** `(session_id, element_id)` to prevent logging the same element twice in one session.

**Design notes:**
- Uses the same `quality_rating` enum as verse progress for consistency. The dashboard renders the same color scheme for both.
- `notes` field allows the tutor to add element-specific observations (e.g., "Needs to work on pronunciation of the final blessing").

### homework_items

Structured homework assignments tied to a session.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `session_id` | uuid | NOT NULL, FK -> sessions(id) ON DELETE CASCADE | |
| `item_type` | text | NOT NULL | Category: "review_verses", "torah_blessings", "haftarah_blessings", "torah_reading", etc. |
| `description` | text | NOT NULL | e.g., "Review Genesis 12:1-12:3" |
| `completed` | boolean | NOT NULL, DEFAULT false | For future homework check-in feature |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Design notes:**
- `item_type` is plain text (not enum) so tutors can create new homework categories as needed without schema changes (e.g., "listen_to_recording", "watch_video", "practice_dvar_torah").

---

## Layer 4: Computed Views

Postgres views that power the dashboard by computing the "current state" from historical session data. The frontend queries these views directly via Supabase.

### verse_current_status

Returns the most recent quality and status for each assigned verse. Powers the segmented progress bar.

```sql
CREATE OR REPLACE VIEW verse_current_status AS
SELECT DISTINCT ON (v.id)
  v.id AS verse_id,
  v.reading_id,
  v.verse_reference,
  v.sort_order,
  r.student_id,
  r.reading_type,
  r.portion_name,
  svp.status,
  svp.quality,
  s.session_date AS last_session_date
FROM verses v
JOIN readings r ON r.id = v.reading_id
LEFT JOIN session_verse_progress svp ON svp.verse_id = v.id
LEFT JOIN sessions s ON s.id = svp.session_id
ORDER BY v.id, s.session_date DESC NULLS LAST, svp.created_at DESC NULLS LAST;
```

**Frontend color logic (applied in React, not in SQL):**

```
if (no row for this verse)          -> Gray
if (quality == 'still_learning')    -> Orange
if (quality == 'moderate_mistakes') -> Yellow
if (quality == 'minor_mistakes')    -> Green-yellow
if (quality == 'perfect' AND status != 'torah_side') -> Green
if (quality == 'perfect' AND status == 'torah_side' AND reading_type == 'torah') -> Gold
```

### element_current_status

Returns the most recent quality for each service element per student. Powers the status dots for blessings, d'var torah, and other elements.

```sql
CREATE OR REPLACE VIEW element_current_status AS
SELECT DISTINCT ON (se.id)
  se.id AS element_id,
  se.student_id,
  se.category,
  se.label,
  se.sort_order,
  sep.quality,
  sep.notes AS session_notes,
  s.session_date AS last_session_date
FROM service_elements se
LEFT JOIN session_element_progress sep ON sep.element_id = se.id
LEFT JOIN sessions s ON s.id = sep.session_id
ORDER BY se.id, s.session_date DESC NULLS LAST, sep.created_at DESC NULLS LAST;
```

### Performance Note

Both views use `DISTINCT ON` which is efficient for small datasets (hundreds of rows). If the dataset grows to tens of thousands of session records over many years:
- Convert to **materialized views** with `CREATE MATERIALIZED VIEW ... AS ...`
- Add a trigger or cron job to refresh after each session is logged: `REFRESH MATERIALIZED VIEW CONCURRENTLY`
- Add unique indexes on the materialized views for `CONCURRENTLY` to work
- No frontend code changes required; only the view definition and a refresh mechanism change

---

## Row Level Security (RLS)

All tables have RLS enabled. Policies use `auth.uid()` to identify the current user.

### Helper Functions

```sql
-- Returns the current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Returns student IDs the current user can access
CREATE OR REPLACE FUNCTION get_accessible_student_ids()
RETURNS SETOF uuid AS $$
  SELECT id FROM public.students WHERE tutor_id = auth.uid()
  UNION
  SELECT id FROM public.students WHERE user_id = auth.uid()
  UNION
  SELECT student_id FROM public.student_guardians WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;
```

**Why helper functions:** Centralizing access logic in `SECURITY DEFINER` functions means RLS policies are short, readable, and consistent. If the access model changes (e.g., adding a "co-tutor" concept), the function is updated in one place rather than across dozens of policies.

**Critical best practice:** All `SECURITY DEFINER` functions must use schema-qualified table references (e.g., `public.profiles` instead of `profiles`) and include `SET search_path = public`. Without this, auth triggers can fail because the search path in the auth context does not include the `public` schema.

### Policy Summary

| Table | Admin | Tutor (active cohort) | Tutor (archived cohort) | Student | Parent/Guardian |
|-------|-------|----------------------|------------------------|---------|-----------------|
| **profiles** | Full CRUD | Read all | Read all | Read all | Read all |
| **cohorts** | Full CRUD | Read all | Read all | Read (is_active = true) | Read (is_active = true) |
| **students** | Full CRUD | Read/Update own | Read-only own | Read self | Read linked children |
| **student_guardians** | Full CRUD | Read own students' | Read own students' | Read own | Read own + co-guardians |
| **readings** | Full CRUD | CRUD own students' | Read-only | Read own | Read linked children's |
| **verses** | Full CRUD | CRUD own students' | Read-only | Read own | Read linked children's |
| **service_elements** | Full CRUD | CRUD own students' | Read-only | Read own | Read linked children's |
| **sessions** | Full CRUD | CRUD own students' | Read-only | Read own | Read linked children's |
| **session_verse_progress** | Full CRUD | CRUD own students' | Read-only | Read own | Read linked children's |
| **session_element_progress** | Full CRUD | CRUD own students' | Read-only | Read own | Read linked children's |
| **homework_items** | Full CRUD | CRUD own students' | Read-only | Read own | Read linked children's |
| **pending_invitations** | Full CRUD | No access | No access | No access | No access |

### Example Policies (students table)

```sql
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Admin: unrestricted access
CREATE POLICY admin_all ON students
  FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Tutor: read own students (both active and archived cohorts)
CREATE POLICY tutor_select ON students
  FOR SELECT
  USING (get_user_role() = 'tutor' AND tutor_id = auth.uid());

-- Tutor: update own students (active cohorts only)
CREATE POLICY tutor_update ON students
  FOR UPDATE
  USING (
    get_user_role() = 'tutor'
    AND tutor_id = auth.uid()
    AND cohort_id IN (SELECT id FROM cohorts WHERE is_active = true)
  )
  WITH CHECK (
    get_user_role() = 'tutor'
    AND tutor_id = auth.uid()
    AND cohort_id IN (SELECT id FROM cohorts WHERE is_active = true)
  );

-- Student: read own record only
CREATE POLICY student_select ON students
  FOR SELECT
  USING (get_user_role() = 'student' AND user_id = auth.uid());

-- Parent/Guardian: read linked children only
CREATE POLICY guardian_select ON students
  FOR SELECT
  USING (
    get_user_role() = 'parent'
    AND id IN (
      SELECT student_id FROM student_guardians
      WHERE user_id = auth.uid()
    )
  );
```

### RLS on Views

Supabase views inherit the RLS of their underlying tables when created with `security_invoker = true` (Postgres 15+). This means the `verse_current_status` and `element_current_status` views automatically respect the same access rules as their source tables.

```sql
CREATE VIEW verse_current_status
WITH (security_invoker = true) AS ...
```

---

## Indexes

Indexes target the specific query patterns required by each user role's dashboard and session logging workflow.

| Table | Index | Access Pattern |
|-------|-------|----------------|
| profiles | `(email)` | UNIQUE (already via constraint). Tutor lookup during import. |
| students | `(tutor_id)` | Tutor dashboard: "show me my students" |
| students | `(cohort_id)` | Admin dashboard: "show me this cohort's students" |
| students | `(user_id)` WHERE NOT NULL | Student login: "which student profile is mine?" |
| students | `(mitzvah_date)` | Timeline calculations: sort/filter by upcoming dates |
| students | `USING gin (external_links)` WHERE != '{}' | Integration API: lookup by SimchaKit event_id |
| student_guardians | `(student_id)` | Dashboard: "show me this student's guardians" |
| student_guardians | `(user_id)` WHERE NOT NULL | Parent login: "which students can I see?" |
| readings | `(student_id, sort_order)` | Dashboard: "get this student's readings in order" |
| verses | `(reading_id, sort_order)` | Progress bar: "get this reading's verses in order" |
| service_elements | `(student_id, category, sort_order)` | Dashboard: "get this student's elements grouped by category" |
| sessions | `(student_id, session_date DESC)` | Session history: "most recent sessions first" |
| session_verse_progress | `(verse_id, created_at DESC)` | Current status view: "latest rating for this verse" |
| session_verse_progress | `(session_id)` | Session detail: "all verse progress for this session" |
| session_element_progress | `(element_id, created_at DESC)` | Current status view: "latest rating for this element" |
| session_element_progress | `(session_id)` | Session detail: "all element progress for this session" |
| homework_items | `(session_id)` | Session detail: "homework for this session" |
| pending_invitations | `(email)` | Sign-in: "is there a pending invitation for this email?" |

---

## Database Triggers

| Trigger | Fires On | Purpose |
|---------|----------|---------|
| `on_auth_user_created` | INSERT on auth.users | Auto-creates a profiles row on first sign-in (role must be set by admin afterward, or defaulted) |
| `set_updated_at` | UPDATE on profiles, students, sessions | Auto-sets `updated_at = now()` |

**Important:** The `handle_new_user` trigger function must use `public.profiles` (schema-qualified) and `SET search_path = public`. Auth triggers run in a context where the `public` schema is not on the default search path. Without explicit qualification, the INSERT will fail with "Database error saving new user."

### Callable Functions

| Function | Called By | Purpose |
|----------|-----------|---------|
| `process_pending_invitation()` | Frontend (AuthContext) via `supabase.rpc()` after sign-in | Checks for pending invitations matching the authenticated user's email. If found: updates profile role, links student/guardian record, marks invitation accepted. `SECURITY DEFINER` to bypass RLS for role updates. |

---

## API Access Grants

Because "Automatically expose new tables" was disabled during Supabase project setup, all tables require explicit grants for the Supabase REST API (used by the frontend) to access them. These grants are included in the migration script:

```sql
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
```

Default privileges ensure future tables also receive grants automatically:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
```

**Note:** These grants allow the API to reach the tables, but RLS policies still control exactly what each user can see and do. The grants open the door; RLS is the bouncer.

### New User Onboarding Flow

1. Admin creates student records (and optionally guardian records) via spreadsheet import or manual entry.
2. Admin invites users by email. User signs in via Google SSO or magic link.
3. `on_auth_user_created` trigger creates a profiles row with a default role (e.g., `student`).
4. Admin reviews new profiles and assigns/confirms the correct role.
5. For guardians: admin links the new profiles.id to the existing student_guardians.user_id.

**Alternative:** Admin pre-creates profiles rows with the correct role and email before the user signs in. The trigger checks for an existing row before inserting.

---

## Cascade Behavior Summary

Understanding what happens when records are deleted:

| Parent Deleted | Child Table | Behavior | Rationale |
|----------------|-------------|----------|-----------|
| auth.users | profiles | CASCADE | Auth cleanup |
| profiles | students.user_id | SET NULL | Student profile survives; login access removed |
| profiles | student_guardians.user_id | SET NULL | Contact info survives; login access removed |
| profiles | sessions.tutor_id | RESTRICT | Cannot delete tutor with session history |
| profiles | students.tutor_id | RESTRICT | Cannot delete tutor with assigned students |
| cohorts | students | RESTRICT | Cannot delete cohort with students |
| students | readings, service_elements, sessions, student_guardians | CASCADE | Full cleanup when student removed |
| readings | verses | CASCADE | Verses belong to the reading |
| sessions | session_verse_progress, session_element_progress, homework_items | CASCADE | Session detail cleaned up with session |
| verses | session_verse_progress | CASCADE | Progress data cleaned up with verse |
| service_elements | session_element_progress | CASCADE | Progress data cleaned up with element |
| students | pending_invitations.student_id | CASCADE | Invitation cleaned up with student |
| student_guardians | pending_invitations.guardian_id | CASCADE | Invitation cleaned up with guardian |

---

## Spreadsheet Import (Admin)

For bulk student setup, the admin uploads a CSV or XLSX with these columns:

| Column | Required | Maps To |
|--------|----------|---------|
| `student_first_name` | Yes | students.first_name |
| `student_last_name` | Yes | students.last_name |
| `mitzvah_date` | Yes | students.mitzvah_date |
| `mitzvah_type` | No | students.mitzvah_type |
| `guardian_1_name` | No | student_guardians row #1 |
| `guardian_1_relationship` | No | student_guardians row #1 |
| `guardian_1_email` | No | student_guardians row #1 |
| `guardian_1_phone` | No | student_guardians row #1 |
| `guardian_2_name` | No | student_guardians row #2 |
| `guardian_2_relationship` | No | student_guardians row #2 |
| `guardian_2_email` | No | student_guardians row #2 |
| `guardian_2_phone` | No | student_guardians row #2 |
| `tutor_email` | Yes | Looked up in profiles to get tutor_id |
| `torah_portion` | No | Creates readings row (type = torah) |
| `torah_reference` | No | Creates readings row with reference |
| `haftarah_portion` | No | Creates readings row (type = haftarah) |
| `haftarah_reference` | No | Creates readings row with reference |

**Post-import steps (manual):**
1. Individual verses within each reading are added by the admin/tutor through the UI, since verse assignments vary per student.
2. Service elements (blessings, d'var torah, etc.) are auto-created from a configurable template, then customized per student as needed.

---

## Evolution Path

Notes on how the schema accommodates anticipated future changes:

| Future Feature | Schema Impact |
|----------------|---------------|
| **New reading types** (e.g., Megillah) | `ALTER TYPE reading_type ADD VALUE 'megillah'` + frontend rendering logic |
| **New service element categories** | Zero schema change. Admin adds rows with new `category` text value. |
| **Homework check-in (student)** | `homework_items.completed` field already exists. Add RLS policy for student UPDATE on this column. |
| **Timeline/pace calculations** | Query `session_verse_progress` history grouped by week. No new tables needed. |
| **AI narrative feedback** | Add a `timeline_feedback` table or compute on-the-fly via API route. No core schema changes. |
| **Prayer tracking** | Add rows to `service_elements` with `category = 'prayers'`. Zero schema change. |
| **Co-tutor / substitute tutor** | Add a `student_tutors` junction table and update `get_accessible_student_ids()`. Core schema intact. |
| **Time-based access revocation** | Add `access_expires_at` date column to `students`. RLS checks this date. No structural changes. |
| **SimchaKit integration** | `external_links` JSONB on students already in schema. Build a read-only API endpoint (Supabase Edge Function or Vercel API route) that accepts a SimchaKit event_id and returns progress summary. Each app remains fully independent; integration is optional read-only enrichment. |
| **Materialized views** | Replace `CREATE VIEW` with `CREATE MATERIALIZED VIEW` + refresh trigger. No frontend changes. |
