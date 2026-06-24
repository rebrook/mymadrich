-- ============================================================
-- MyMadrich: Supabase Schema Migration
-- Version: 1.0
-- Run this in the Supabase SQL Editor to create the full schema.
-- ============================================================

-- ============================================================
-- 1. CUSTOM ENUM TYPES
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'tutor', 'student', 'parent');
CREATE TYPE reading_type AS ENUM ('torah', 'haftarah');
CREATE TYPE verse_status AS ENUM ('review', 'new', 'torah_side');
CREATE TYPE quality_rating AS ENUM ('perfect', 'minor_mistakes', 'moderate_mistakes', 'still_learning');


-- ============================================================
-- 2. TABLES
-- ============================================================

-- ----------------------------
-- Layer 1: Identity
-- ----------------------------

-- profiles: extends auth.users with app-specific fields
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role        user_role NOT NULL DEFAULT 'student',
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE profiles IS 'Extends auth.users with role and contact info. Auto-created on first sign-in.';

-- cohorts: groups students by program year
CREATE TABLE cohorts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  start_date  date,
  end_date    date,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE cohorts IS 'Program year groupings. is_active = false archives the cohort.';

-- students: the central entity
CREATE TABLE students (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid UNIQUE REFERENCES profiles(id) ON DELETE SET NULL,
  cohort_id     uuid NOT NULL REFERENCES cohorts(id) ON DELETE RESTRICT,
  tutor_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  first_name    text NOT NULL,
  last_name     text NOT NULL,
  mitzvah_date  date NOT NULL,
  mitzvah_type  text,
  status        text NOT NULL DEFAULT 'active',
  external_links jsonb DEFAULT '{}',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_status CHECK (status IN ('active', 'completed', 'deferred', 'withdrawn'))
);

COMMENT ON TABLE students IS 'Student profiles. user_id is nullable (student may not have a login yet).';
COMMENT ON COLUMN students.status IS 'Lifecycle state: active, completed, deferred, withdrawn.';
COMMENT ON COLUMN students.external_links IS 'Optional cross-system links. Example: {"simchakit_event_id": "abc-123", "simchakit_url": "https://..."}. Pointer only, not a data mirror.';
-- student_guardians: parents/guardians with optional login linkage
CREATE TABLE student_guardians (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  name            text NOT NULL,
  relationship    text NOT NULL DEFAULT 'Parent',
  email           text,
  phone           text,
  is_primary      boolean NOT NULL DEFAULT false,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Prevent linking the same guardian account to the same student twice
CREATE UNIQUE INDEX unique_guardian_user_per_student
  ON student_guardians (student_id, user_id) WHERE user_id IS NOT NULL;

COMMENT ON TABLE student_guardians IS 'Guardian contact info and optional login linkage. Supports multiple guardians per student.';


-- ----------------------------
-- Layer 2: Curriculum
-- ----------------------------

-- readings: Torah or Haftarah readings assigned to a student
CREATE TABLE readings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reading_type  reading_type NOT NULL,
  portion_name  text NOT NULL,
  aliyah        text,
  reference     text NOT NULL,
  sefaria_url   text,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE readings IS 'Torah/Haftarah readings assigned to a student. One row per reading.';

-- verses: individual p''sukim within a reading (progress bar segments)
CREATE TABLE verses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_id      uuid NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
  verse_reference text NOT NULL,
  sefaria_url     text,
  sort_order      integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_verse_order UNIQUE (reading_id, sort_order),
  CONSTRAINT unique_verse_ref UNIQUE (reading_id, verse_reference)
);

COMMENT ON TABLE verses IS 'Individual p''sukim within a reading. Each verse = one progress bar segment.';

-- service_elements: blessings, d''var torah, prayers, and any other service responsibility
CREATE TABLE service_elements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  category    text NOT NULL,
  label       text NOT NULL,
  notes       text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_element_per_student UNIQUE (student_id, category, label)
);

COMMENT ON TABLE service_elements IS 'Flexible catch-all for non-verse trackable items: blessings, d''var torah, prayers, etc.';
COMMENT ON COLUMN service_elements.category IS 'Grouping label for dashboard display: blessings, service_parts, prayers, etc.';


-- ----------------------------
-- Layer 3: Activity
-- ----------------------------

-- sessions: tutoring session records
CREATE TABLE sessions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id              uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  tutor_id                uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  session_date            date NOT NULL,
  next_session_date       date,
  next_session_time       time,
  homework_notes          text,
  homework_minutes_per_day integer,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE sessions IS 'One row per tutoring session.';

-- session_verse_progress: per-verse ratings logged in a session
CREATE TABLE session_verse_progress (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  verse_id    uuid NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  status      verse_status NOT NULL,
  quality     quality_rating NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_verse_per_session UNIQUE (session_id, verse_id)
);

COMMENT ON TABLE session_verse_progress IS 'Per-verse progress logged in a session. Full history preserved.';

-- session_element_progress: per-element ratings logged in a session
CREATE TABLE session_element_progress (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  element_id  uuid NOT NULL REFERENCES service_elements(id) ON DELETE CASCADE,
  quality     quality_rating NOT NULL,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_element_per_session UNIQUE (session_id, element_id)
);

COMMENT ON TABLE session_element_progress IS 'Per-element (blessings, d''var torah, etc.) progress logged in a session.';

-- homework_items: structured homework assignments per session
CREATE TABLE homework_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  item_type   text NOT NULL,
  description text NOT NULL,
  completed   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE homework_items IS 'Structured homework checkboxes. item_type is freeform text for flexibility.';


-- ============================================================
-- 3. HELPER FUNCTIONS
-- (defined after tables so that table references resolve)
-- ============================================================

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

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-create profile on new auth user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    'student'  -- default role; admin updates after signup
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================
-- 4. INDEXES
-- ============================================================

-- Identity layer
CREATE INDEX idx_students_tutor ON students (tutor_id);
CREATE INDEX idx_students_cohort ON students (cohort_id);
CREATE INDEX idx_students_user ON students (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_students_mitzvah_date ON students (mitzvah_date);
CREATE INDEX idx_students_external_links ON students USING gin (external_links) WHERE external_links != '{}';
CREATE INDEX idx_guardians_student ON student_guardians (student_id);
CREATE INDEX idx_guardians_user ON student_guardians (user_id) WHERE user_id IS NOT NULL;

-- Curriculum layer
CREATE INDEX idx_readings_student ON readings (student_id, sort_order);
CREATE INDEX idx_verses_reading ON verses (reading_id, sort_order);
CREATE INDEX idx_elements_student ON service_elements (student_id, category, sort_order);

-- Activity layer
CREATE INDEX idx_sessions_student_date ON sessions (student_id, session_date DESC);
CREATE INDEX idx_svp_verse ON session_verse_progress (verse_id, created_at DESC);
CREATE INDEX idx_svp_session ON session_verse_progress (session_id);
CREATE INDEX idx_sep_element ON session_element_progress (element_id, created_at DESC);
CREATE INDEX idx_sep_session ON session_element_progress (session_id);
CREATE INDEX idx_homework_session ON homework_items (session_id);


-- ============================================================
-- 5. TRIGGERS
-- ============================================================

-- Auto-create profile on auth signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 6. VIEWS
-- ============================================================

-- verse_current_status: latest quality/status for each assigned verse
-- Powers the segmented progress bar on the dashboard
CREATE OR REPLACE VIEW verse_current_status
WITH (security_invoker = true) AS
SELECT DISTINCT ON (v.id)
  v.id AS verse_id,
  v.reading_id,
  v.verse_reference,
  v.sort_order,
  r.student_id,
  r.reading_type,
  r.portion_name,
  r.aliyah,
  svp.status,
  svp.quality,
  s.session_date AS last_session_date
FROM verses v
JOIN readings r ON r.id = v.reading_id
LEFT JOIN session_verse_progress svp ON svp.verse_id = v.id
LEFT JOIN sessions s ON s.id = svp.session_id
ORDER BY v.id, s.session_date DESC NULLS LAST, svp.created_at DESC NULLS LAST;

COMMENT ON VIEW verse_current_status IS 'Latest quality/status per verse. Powers the dashboard progress bars.';

-- element_current_status: latest quality for each service element per student
-- Powers the status dots for blessings, d''var torah, etc.
CREATE OR REPLACE VIEW element_current_status
WITH (security_invoker = true) AS
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

COMMENT ON VIEW element_current_status IS 'Latest quality per service element. Powers the dashboard status dots.';


-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE verses ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_verse_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_element_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_items ENABLE ROW LEVEL SECURITY;

-- ----------------------------
-- profiles
-- ----------------------------
CREATE POLICY admin_all ON profiles
  FOR ALL USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY read_all_profiles ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ----------------------------
-- cohorts
-- ----------------------------
CREATE POLICY admin_all ON cohorts
  FOR ALL USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY read_active_cohorts ON cohorts
  FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = true);

-- Tutors can also read archived cohorts (for the toggle feature)
CREATE POLICY tutor_read_all_cohorts ON cohorts
  FOR SELECT USING (get_user_role() = 'tutor');

-- ----------------------------
-- students
-- ----------------------------
CREATE POLICY admin_all ON students
  FOR ALL USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Tutor: read all own students (active and archived)
CREATE POLICY tutor_select ON students
  FOR SELECT USING (
    get_user_role() = 'tutor'
    AND tutor_id = auth.uid()
  );

-- Tutor: update own students (active cohorts only)
CREATE POLICY tutor_update ON students
  FOR UPDATE USING (
    get_user_role() = 'tutor'
    AND tutor_id = auth.uid()
    AND cohort_id IN (SELECT id FROM cohorts WHERE is_active = true)
  ) WITH CHECK (
    get_user_role() = 'tutor'
    AND tutor_id = auth.uid()
    AND cohort_id IN (SELECT id FROM cohorts WHERE is_active = true)
  );

-- Student: read own record
CREATE POLICY student_select ON students
  FOR SELECT USING (
    get_user_role() = 'student'
    AND user_id = auth.uid()
  );

-- Parent/Guardian: read linked children
CREATE POLICY guardian_select ON students
  FOR SELECT USING (
    get_user_role() = 'parent'
    AND id IN (
      SELECT student_id FROM student_guardians
      WHERE user_id = auth.uid()
    )
  );

-- ----------------------------
-- student_guardians
-- ----------------------------
CREATE POLICY admin_all ON student_guardians
  FOR ALL USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY tutor_select ON student_guardians
  FOR SELECT USING (
    get_user_role() = 'tutor'
    AND student_id IN (SELECT id FROM students WHERE tutor_id = auth.uid())
  );

CREATE POLICY student_select ON student_guardians
  FOR SELECT USING (
    get_user_role() = 'student'
    AND student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

CREATE POLICY guardian_select ON student_guardians
  FOR SELECT USING (
    get_user_role() = 'parent'
    AND student_id IN (
      SELECT student_id FROM student_guardians sg
      WHERE sg.user_id = auth.uid()
    )
  );

-- ----------------------------
-- readings
-- ----------------------------
CREATE POLICY admin_all ON readings
  FOR ALL USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY tutor_select ON readings
  FOR SELECT USING (
    get_user_role() = 'tutor'
    AND student_id IN (SELECT id FROM students WHERE tutor_id = auth.uid())
  );

CREATE POLICY tutor_modify ON readings
  FOR ALL USING (
    get_user_role() = 'tutor'
    AND student_id IN (
      SELECT s.id FROM students s
      JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.tutor_id = auth.uid() AND c.is_active = true
    )
  ) WITH CHECK (
    get_user_role() = 'tutor'
    AND student_id IN (
      SELECT s.id FROM students s
      JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.tutor_id = auth.uid() AND c.is_active = true
    )
  );

CREATE POLICY student_select ON readings
  FOR SELECT USING (
    get_user_role() = 'student'
    AND student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

CREATE POLICY guardian_select ON readings
  FOR SELECT USING (
    get_user_role() = 'parent'
    AND student_id IN (
      SELECT student_id FROM student_guardians
      WHERE user_id = auth.uid()
    )
  );

-- ----------------------------
-- verses
-- ----------------------------
CREATE POLICY admin_all ON verses
  FOR ALL USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY tutor_select ON verses
  FOR SELECT USING (
    get_user_role() = 'tutor'
    AND reading_id IN (
      SELECT r.id FROM readings r
      JOIN students s ON s.id = r.student_id
      WHERE s.tutor_id = auth.uid()
    )
  );

CREATE POLICY tutor_modify ON verses
  FOR ALL USING (
    get_user_role() = 'tutor'
    AND reading_id IN (
      SELECT r.id FROM readings r
      JOIN students s ON s.id = r.student_id
      JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.tutor_id = auth.uid() AND c.is_active = true
    )
  ) WITH CHECK (
    get_user_role() = 'tutor'
    AND reading_id IN (
      SELECT r.id FROM readings r
      JOIN students s ON s.id = r.student_id
      JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.tutor_id = auth.uid() AND c.is_active = true
    )
  );

CREATE POLICY student_select ON verses
  FOR SELECT USING (
    get_user_role() = 'student'
    AND reading_id IN (
      SELECT r.id FROM readings r
      JOIN students s ON s.id = r.student_id
      WHERE s.user_id = auth.uid()
    )
  );

CREATE POLICY guardian_select ON verses
  FOR SELECT USING (
    get_user_role() = 'parent'
    AND reading_id IN (
      SELECT r.id FROM readings r
      WHERE r.student_id IN (
        SELECT student_id FROM student_guardians
        WHERE user_id = auth.uid()
      )
    )
  );

-- ----------------------------
-- service_elements
-- ----------------------------
CREATE POLICY admin_all ON service_elements
  FOR ALL USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY tutor_select ON service_elements
  FOR SELECT USING (
    get_user_role() = 'tutor'
    AND student_id IN (SELECT id FROM students WHERE tutor_id = auth.uid())
  );

CREATE POLICY tutor_modify ON service_elements
  FOR ALL USING (
    get_user_role() = 'tutor'
    AND student_id IN (
      SELECT s.id FROM students s
      JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.tutor_id = auth.uid() AND c.is_active = true
    )
  ) WITH CHECK (
    get_user_role() = 'tutor'
    AND student_id IN (
      SELECT s.id FROM students s
      JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.tutor_id = auth.uid() AND c.is_active = true
    )
  );

CREATE POLICY student_select ON service_elements
  FOR SELECT USING (
    get_user_role() = 'student'
    AND student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

CREATE POLICY guardian_select ON service_elements
  FOR SELECT USING (
    get_user_role() = 'parent'
    AND student_id IN (
      SELECT student_id FROM student_guardians
      WHERE user_id = auth.uid()
    )
  );

-- ----------------------------
-- sessions
-- ----------------------------
CREATE POLICY admin_all ON sessions
  FOR ALL USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY tutor_select ON sessions
  FOR SELECT USING (
    get_user_role() = 'tutor'
    AND student_id IN (SELECT id FROM students WHERE tutor_id = auth.uid())
  );

CREATE POLICY tutor_modify ON sessions
  FOR INSERT WITH CHECK (
    get_user_role() = 'tutor'
    AND student_id IN (
      SELECT s.id FROM students s
      JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.tutor_id = auth.uid() AND c.is_active = true
    )
  );

CREATE POLICY tutor_update ON sessions
  FOR UPDATE USING (
    get_user_role() = 'tutor'
    AND student_id IN (
      SELECT s.id FROM students s
      JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.tutor_id = auth.uid() AND c.is_active = true
    )
  ) WITH CHECK (
    get_user_role() = 'tutor'
    AND student_id IN (
      SELECT s.id FROM students s
      JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.tutor_id = auth.uid() AND c.is_active = true
    )
  );

CREATE POLICY student_select ON sessions
  FOR SELECT USING (
    get_user_role() = 'student'
    AND student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

CREATE POLICY guardian_select ON sessions
  FOR SELECT USING (
    get_user_role() = 'parent'
    AND student_id IN (
      SELECT student_id FROM student_guardians
      WHERE user_id = auth.uid()
    )
  );

-- ----------------------------
-- session_verse_progress
-- ----------------------------
CREATE POLICY admin_all ON session_verse_progress
  FOR ALL USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY tutor_select ON session_verse_progress
  FOR SELECT USING (
    get_user_role() = 'tutor'
    AND session_id IN (
      SELECT se.id FROM sessions se
      JOIN students s ON s.id = se.student_id
      WHERE s.tutor_id = auth.uid()
    )
  );

CREATE POLICY tutor_modify ON session_verse_progress
  FOR ALL USING (
    get_user_role() = 'tutor'
    AND session_id IN (
      SELECT se.id FROM sessions se
      JOIN students s ON s.id = se.student_id
      JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.tutor_id = auth.uid() AND c.is_active = true
    )
  ) WITH CHECK (
    get_user_role() = 'tutor'
    AND session_id IN (
      SELECT se.id FROM sessions se
      JOIN students s ON s.id = se.student_id
      JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.tutor_id = auth.uid() AND c.is_active = true
    )
  );

CREATE POLICY student_select ON session_verse_progress
  FOR SELECT USING (
    get_user_role() = 'student'
    AND session_id IN (
      SELECT se.id FROM sessions se
      JOIN students s ON s.id = se.student_id
      WHERE s.user_id = auth.uid()
    )
  );

CREATE POLICY guardian_select ON session_verse_progress
  FOR SELECT USING (
    get_user_role() = 'parent'
    AND session_id IN (
      SELECT se.id FROM sessions se
      WHERE se.student_id IN (
        SELECT student_id FROM student_guardians
        WHERE user_id = auth.uid()
      )
    )
  );

-- ----------------------------
-- session_element_progress
-- ----------------------------
CREATE POLICY admin_all ON session_element_progress
  FOR ALL USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY tutor_select ON session_element_progress
  FOR SELECT USING (
    get_user_role() = 'tutor'
    AND session_id IN (
      SELECT se.id FROM sessions se
      JOIN students s ON s.id = se.student_id
      WHERE s.tutor_id = auth.uid()
    )
  );

CREATE POLICY tutor_modify ON session_element_progress
  FOR ALL USING (
    get_user_role() = 'tutor'
    AND session_id IN (
      SELECT se.id FROM sessions se
      JOIN students s ON s.id = se.student_id
      JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.tutor_id = auth.uid() AND c.is_active = true
    )
  ) WITH CHECK (
    get_user_role() = 'tutor'
    AND session_id IN (
      SELECT se.id FROM sessions se
      JOIN students s ON s.id = se.student_id
      JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.tutor_id = auth.uid() AND c.is_active = true
    )
  );

CREATE POLICY student_select ON session_element_progress
  FOR SELECT USING (
    get_user_role() = 'student'
    AND session_id IN (
      SELECT se.id FROM sessions se
      JOIN students s ON s.id = se.student_id
      WHERE s.user_id = auth.uid()
    )
  );

CREATE POLICY guardian_select ON session_element_progress
  FOR SELECT USING (
    get_user_role() = 'parent'
    AND session_id IN (
      SELECT se.id FROM sessions se
      WHERE se.student_id IN (
        SELECT student_id FROM student_guardians
        WHERE user_id = auth.uid()
      )
    )
  );

-- ----------------------------
-- homework_items
-- ----------------------------
CREATE POLICY admin_all ON homework_items
  FOR ALL USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY tutor_select ON homework_items
  FOR SELECT USING (
    get_user_role() = 'tutor'
    AND session_id IN (
      SELECT se.id FROM sessions se
      JOIN students s ON s.id = se.student_id
      WHERE s.tutor_id = auth.uid()
    )
  );

CREATE POLICY tutor_modify ON homework_items
  FOR ALL USING (
    get_user_role() = 'tutor'
    AND session_id IN (
      SELECT se.id FROM sessions se
      JOIN students s ON s.id = se.student_id
      JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.tutor_id = auth.uid() AND c.is_active = true
    )
  ) WITH CHECK (
    get_user_role() = 'tutor'
    AND session_id IN (
      SELECT se.id FROM sessions se
      JOIN students s ON s.id = se.student_id
      JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.tutor_id = auth.uid() AND c.is_active = true
    )
  );

CREATE POLICY student_select ON homework_items
  FOR SELECT USING (
    get_user_role() = 'student'
    AND session_id IN (
      SELECT se.id FROM sessions se
      JOIN students s ON s.id = se.student_id
      WHERE s.user_id = auth.uid()
    )
  );

CREATE POLICY guardian_select ON homework_items
  FOR SELECT USING (
    get_user_role() = 'parent'
    AND session_id IN (
      SELECT se.id FROM sessions se
      WHERE se.student_id IN (
        SELECT student_id FROM student_guardians
        WHERE user_id = auth.uid()
      )
    )
  );


-- ============================================================
-- 8. API ACCESS GRANTS
-- ============================================================
-- Required because "Automatically expose new tables" was disabled
-- during project setup. These grants allow the Supabase REST API
-- (used by the frontend) to access the tables. RLS policies still
-- control exactly what each user can see and do.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Ensure future tables also get grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;


-- ============================================================
-- 9. SEED DATA (Default service element template)
-- ============================================================

-- This function creates default service elements for a new student.
-- Call it after inserting a student record:
--   SELECT create_default_service_elements('student-uuid-here');

CREATE OR REPLACE FUNCTION create_default_service_elements(p_student_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO public.service_elements (student_id, category, label, sort_order) VALUES
    (p_student_id, 'blessings', 'Torah blessing (before)', 1),
    (p_student_id, 'blessings', 'Torah blessing (after)', 2),
    (p_student_id, 'blessings', 'Haftarah blessing (before)', 3),
    (p_student_id, 'blessings', 'Haftarah blessing (after #1)', 4),
    (p_student_id, 'blessings', 'Haftarah blessing (after #2)', 5),
    (p_student_id, 'blessings', 'Haftarah blessing (after #3)', 6),
    (p_student_id, 'blessings', 'Haftarah blessing (after #4)', 7);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION create_default_service_elements IS 'Creates the standard 7 blessings for a new student. Admin can add/remove/rename afterward.';


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
