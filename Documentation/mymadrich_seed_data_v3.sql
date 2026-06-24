-- ============================================================================
-- MyMadrich Demo Seed Data (v3 — Sydney + parent + tutor accounts)
-- ============================================================================
-- Run in Supabase SQL Editor. Clears ALL app data (preserving Ryan's three
-- auth.users rows), then inserts demo data + real Sydney/parent/tutor records.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: CLEAR ALL EXISTING DATA
-- ============================================================================

DELETE FROM public.homework_items;
DELETE FROM public.session_element_progress;
DELETE FROM public.session_verse_progress;
DELETE FROM public.sessions;
DELETE FROM public.service_elements;
DELETE FROM public.verses;
DELETE FROM public.readings;
DELETE FROM public.pending_invitations;
DELETE FROM public.student_guardians;
DELETE FROM public.students;
DELETE FROM public.cohorts;
DELETE FROM public.profiles WHERE id NOT IN (
  'c56255a6-8f80-438e-81c2-d260a8410d52',
  'dd94445f-6c03-4e09-a96b-da267c11dab4',
  '2781d8d8-079d-483a-afd3-7f955fbf8eda'
);
DELETE FROM auth.users WHERE id NOT IN (
  'c56255a6-8f80-438e-81c2-d260a8410d52',
  'dd94445f-6c03-4e09-a96b-da267c11dab4',
  '2781d8d8-079d-483a-afd3-7f955fbf8eda'
);


-- ============================================================================
-- PART 2: AUTH USERS (demo tutors only; Ryan's two accounts already exist)
-- ============================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  is_sso_user, is_anonymous
) VALUES
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-4000-a000-000000000001',
   'authenticated', 'authenticated', 'sarah.goldstein@example.com', NULL,
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"name":"Sarah Goldstein","email":"sarah.goldstein@example.com"}'::jsonb,
   false, false),
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-4000-a000-000000000002',
   'authenticated', 'authenticated', 'david.katz@example.com', NULL,
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"name":"David Katz","email":"david.katz@example.com"}'::jsonb,
   false, false),
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-4000-a000-000000000003',
   'authenticated', 'authenticated', 'rachel.mirsky@example.com', NULL,
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"name":"Rachel Mirsky","email":"rachel.mirsky@example.com"}'::jsonb,
   false, false)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- PART 3: PROFILES
-- ============================================================================

-- Ryan admin
INSERT INTO public.profiles (id, email, display_name, role)
VALUES ('c56255a6-8f80-438e-81c2-d260a8410d52', 'rebrook@gmail.com', 'Ryan Brook', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin', display_name = 'Ryan Brook';

-- Ryan parent
INSERT INTO public.profiles (id, email, display_name, role)
VALUES ('dd94445f-6c03-4e09-a96b-da267c11dab4', 'rebrook@me.com', 'Ryan Brook', 'parent')
ON CONFLICT (id) DO UPDATE SET role = 'parent', display_name = 'Ryan Brook';

-- Ryan tutor
INSERT INTO public.profiles (id, email, display_name, role)
VALUES ('2781d8d8-079d-483a-afd3-7f955fbf8eda', 'rebrook@mac.com', 'Ryan Brook', 'tutor')
ON CONFLICT (id) DO UPDATE SET role = 'tutor', display_name = 'Ryan Brook';

-- Tutors
INSERT INTO public.profiles (id, email, display_name, role) VALUES
  ('00000000-0000-4000-a000-000000000001', 'sarah.goldstein@example.com', 'Sarah Goldstein', 'tutor'),
  ('00000000-0000-4000-a000-000000000002', 'david.katz@example.com',      'David Katz',      'tutor'),
  ('00000000-0000-4000-a000-000000000003', 'rachel.mirsky@example.com',   'Rachel Mirsky',   'tutor')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;


-- ============================================================================
-- PART 4: COHORTS
-- ============================================================================

INSERT INTO public.cohorts (id, name, start_date, end_date, is_active, default_lessons_per_week, completion_buffer_weeks, coordinator_name) VALUES
  ('00000000-0000-4000-b000-000000000001', 'B''nai Mitzvah 2026-2027', '2026-09-01', '2027-08-31', true,  1, 4, 'Cantor Michelle Stern'),
  ('00000000-0000-4000-b000-000000000002', 'B''nai Mitzvah 2025-2026', '2025-09-01', '2026-08-31', true,  1, 4, 'Cantor Michelle Stern'),
  ('00000000-0000-4000-b000-000000000003', 'B''nai Mitzvah 2024-2025', '2024-09-01', '2025-08-31', false, 1, 4, 'Cantor David Finkel');


-- ============================================================================
-- PART 5: STUDENTS
-- ============================================================================

INSERT INTO public.students (
  id, cohort_id, tutor_id, first_name, last_name,
  mitzvah_date, mitzvah_type, hebrew_name, status, lessons_per_week, notes
) VALUES
  -- ═══ SYDNEY BROOK (real student) ═══
  ('d608e410-ed32-4623-aa91-8069ae8ad415',
   '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003',
   'Sydney', 'Brook', '2026-10-17', 'bat', 'חַיָּה לֵאָה',
   'active', 1, 'Reading full Parashat Noach. Strong reader, very dedicated.'),

  -- ═══ Demo students ═══
  ('00000000-0000-4000-c000-000000000001',
   '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001',
   'Ethan', 'Abrams', '2026-10-17', 'Bar Mitzvah', 'אֵיתָן בֶּן דָּוִד',
   'active', 1, 'Strong reader. Practices regularly at home.'),
  ('00000000-0000-4000-c000-000000000002',
   '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001',
   'Maya', 'Cohen', '2026-11-21', 'Bat Mitzvah', 'מַיָּה בַּת יוֹנָתָן',
   'active', 1, 'Doing well on Haftarah. Torah trope needs more work.'),
  ('00000000-0000-4000-c000-000000000003',
   '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002',
   'Noah', 'Friedman', '2027-01-16', 'Bar Mitzvah', 'נֹחַ בֶּן אַבְרָהָם',
   'active', 1, NULL),
  ('00000000-0000-4000-c000-000000000004',
   '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002',
   'Lily', 'Shapiro', '2027-03-13', 'Bat Mitzvah', 'לִילִי בַּת מִיכָאֵל',
   'active', 1, 'Just getting started. Very enthusiastic.'),
  ('00000000-0000-4000-c000-000000000005',
   '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003',
   'Jacob', 'Weiss', '2027-05-08', 'Bar Mitzvah', 'יַעֲקֹב בֶּן שְׁמוּאֵל',
   'active', 1, NULL),
  ('00000000-0000-4000-c000-000000000006',
   '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003',
   'Sophie', 'Rosen', '2027-06-19', 'Bat Mitzvah', 'שׁוֹשַׁנָּה בַּת אֲרִיאֵל',
   'active', 1, NULL),
  ('00000000-0000-4000-c000-000000000007',
   '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001',
   'Ben', 'Schwartz', '2025-10-25', 'Bar Mitzvah', 'בִּנְיָמִין בֶּן יוֹסֵף',
   'completed', 1, 'Completed successfully. Great ceremony.'),
  ('00000000-0000-4000-c000-000000000008',
   '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000002',
   'Ava', 'Rubin', '2025-12-13', 'Bat Mitzvah', 'אָוָה בַּת רָפָאֵל',
   'completed', 1, 'Excellent Haftarah chanting.'),
  ('00000000-0000-4000-c000-000000000009',
   '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001',
   'Sam', 'Greenberg', '2026-02-07', 'Bar Mitzvah', 'שְׁמוּאֵל בֶּן נָתָן',
   'completed', 1, NULL),
  ('00000000-0000-4000-c000-000000000010',
   '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000003',
   'Hannah', 'Levine', '2026-07-18', 'Bat Mitzvah', 'חַנָּה בַּת עָמוֹס',
   'active', 1, 'On track. Needs polish on Torah blessings.'),
  ('00000000-0000-4000-c000-000000000011',
   '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000002',
   'Daniel', 'Kessler', '2026-08-15', 'Bar Mitzvah', 'דָּנִיֵּאל בֶּן אֵלִיָּהוּ',
   'active', 1, 'Started late but making good progress.'),
  ('00000000-0000-4000-c000-000000000012',
   '00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000001',
   'Zoe', 'Bernstein', '2024-11-09', 'Bat Mitzvah', 'זוֹהָרָה בַּת גִּדְעוֹן',
   'completed', 1, NULL),
  ('00000000-0000-4000-c000-000000000013',
   '00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000002',
   'Max', 'Goldberg', '2025-03-08', 'Bar Mitzvah', 'מַקְס בֶּן חַיִּים',
   'completed', 1, NULL),
  ('00000000-0000-4000-c000-000000000014',
   '00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000003',
   'Ella', 'Marcus', '2025-06-07', 'Bat Mitzvah', 'אֵלָּה בַּת אָדָם',
   'completed', 1, 'Beautiful D''var Torah.'),

  -- ═══ Ryan-tutor students ═══
  ('20000000-0000-4000-c000-000000000001',
   '00000000-0000-4000-b000-000000000001', '2781d8d8-079d-483a-afd3-7f955fbf8eda',
   'Ari', 'Bloom', '2027-01-24', 'bar', 'אֲרִי בֶּן יוֹסֵף',
   'active', 1, 'Enthusiastic reader. Picks up trope quickly.'),
  ('20000000-0000-4000-c000-000000000002',
   '00000000-0000-4000-b000-000000000001', '2781d8d8-079d-483a-afd3-7f955fbf8eda',
   'Talia', 'Silver', '2027-02-28', 'bat', 'טַלְיָה בַּת שָׂרָה',
   'active', 1, 'Musical background helps with melody. Needs more work on Hebrew reading.'),
  ('20000000-0000-4000-c000-000000000003',
   '00000000-0000-4000-b000-000000000001', '2781d8d8-079d-483a-afd3-7f955fbf8eda',
   'Josh', 'Epstein', '2027-04-04', 'bar', 'יְהוֹשֻׁעַ בֶּן אַהֲרֹן',
   'active', 1, 'Just getting started. Great attitude.');


-- ============================================================================
-- PART 6: STUDENT GUARDIANS
-- ============================================================================

INSERT INTO public.student_guardians (
  id, student_id, user_id, name, relationship, email, phone, is_primary, sort_order
) VALUES
  -- ═══ Sydney — Ryan (linked to parent account) ═══
  ('be4929e4-30ac-4f41-93a2-40596e880346', 'd608e410-ed32-4623-aa91-8069ae8ad415',
   'dd94445f-6c03-4e09-a96b-da267c11dab4',
   'Ryan Brook', 'Father', 'rebrook@me.com', '410-555-1500', true, 0),

  -- ═══ Demo guardians ═══
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-c000-000000000001',
   NULL, 'David Abrams', 'Father', 'david.abrams@example.com', '410-555-0101', true, 0),
  ('00000000-0000-4000-9000-000000000002', '00000000-0000-4000-c000-000000000001',
   NULL, 'Jessica Abrams', 'Mother', 'jessica.abrams@example.com', '410-555-0102', false, 1),
  ('00000000-0000-4000-9000-000000000003', '00000000-0000-4000-c000-000000000002',
   NULL, 'Rebecca Cohen', 'Mother', 'rebecca.cohen@example.com', '410-555-0201', true, 0),
  ('00000000-0000-4000-9000-000000000004', '00000000-0000-4000-c000-000000000002',
   NULL, 'Michael Cohen', 'Father', 'michael.cohen@example.com', '410-555-0202', false, 1),
  ('00000000-0000-4000-9000-000000000005', '00000000-0000-4000-c000-000000000003',
   NULL, 'Jennifer Friedman', 'Mother', 'jennifer.friedman@example.com', '410-555-0301', true, 0),
  ('00000000-0000-4000-9000-000000000006', '00000000-0000-4000-c000-000000000004',
   NULL, 'Mark Shapiro', 'Father', 'mark.shapiro@example.com', '410-555-0401', true, 0),
  ('00000000-0000-4000-9000-000000000007', '00000000-0000-4000-c000-000000000004',
   NULL, 'Lisa Shapiro', 'Mother', 'lisa.shapiro@example.com', '410-555-0402', false, 1),
  ('00000000-0000-4000-9000-000000000008', '00000000-0000-4000-c000-000000000005',
   NULL, 'Deborah Weiss', 'Mother', 'deborah.weiss@example.com', '410-555-0501', true, 0),
  ('00000000-0000-4000-9000-000000000009', '00000000-0000-4000-c000-000000000005',
   NULL, 'Aaron Weiss', 'Father', 'aaron.weiss@example.com', '410-555-0502', false, 1),
  ('00000000-0000-4000-9000-000000000010', '00000000-0000-4000-c000-000000000006',
   NULL, 'Karen Rosen', 'Mother', 'karen.rosen@example.com', '410-555-0601', true, 0),
  ('00000000-0000-4000-9000-000000000011', '00000000-0000-4000-c000-000000000007',
   NULL, 'Amy Schwartz', 'Mother', 'amy.schwartz@example.com', '410-555-0701', true, 0),
  ('00000000-0000-4000-9000-000000000012', '00000000-0000-4000-c000-000000000007',
   NULL, 'Eric Schwartz', 'Father', 'eric.schwartz@example.com', '410-555-0702', false, 1),
  ('00000000-0000-4000-9000-000000000013', '00000000-0000-4000-c000-000000000008',
   NULL, 'Laura Rubin', 'Mother', 'laura.rubin@example.com', '410-555-0801', true, 0),
  ('00000000-0000-4000-9000-000000000014', '00000000-0000-4000-c000-000000000009',
   NULL, 'Judith Greenberg', 'Mother', 'judith.greenberg@example.com', '410-555-0901', true, 0),
  ('00000000-0000-4000-9000-000000000015', '00000000-0000-4000-c000-000000000009',
   NULL, 'Howard Greenberg', 'Father', 'howard.greenberg@example.com', '410-555-0902', false, 1),
  ('00000000-0000-4000-9000-000000000016', '00000000-0000-4000-c000-000000000010',
   NULL, 'Miriam Levine', 'Mother', 'miriam.levine@example.com', '410-555-1001', true, 0),
  ('00000000-0000-4000-9000-000000000017', '00000000-0000-4000-c000-000000000011',
   NULL, 'Steven Kessler', 'Father', 'steven.kessler@example.com', '410-555-1101', true, 0),
  ('00000000-0000-4000-9000-000000000018', '00000000-0000-4000-c000-000000000011',
   NULL, 'Rachel Kessler', 'Mother', 'rachel.kessler@example.com', '410-555-1102', false, 1),
  ('00000000-0000-4000-9000-000000000019', '00000000-0000-4000-c000-000000000012',
   NULL, 'Naomi Bernstein', 'Mother', 'naomi.bernstein@example.com', '410-555-1201', true, 0),
  ('00000000-0000-4000-9000-000000000020', '00000000-0000-4000-c000-000000000013',
   NULL, 'Robert Goldberg', 'Father', 'robert.goldberg@example.com', '410-555-1301', true, 0),
  ('00000000-0000-4000-9000-000000000021', '00000000-0000-4000-c000-000000000014',
   NULL, 'Allison Marcus', 'Mother', 'allison.marcus@example.com', '410-555-1401', true, 0),
  ('00000000-0000-4000-9000-000000000022', '00000000-0000-4000-c000-000000000014',
   NULL, 'Adam Marcus', 'Father', 'adam.marcus@example.com', '410-555-1402', false, 1),

  -- ═══ Ryan-tutor student guardians ═══
  ('20000000-0000-4000-9000-000000000001', '20000000-0000-4000-c000-000000000001',
   NULL, 'Michael Bloom', 'Father', 'michael.bloom@example.com', '410-555-2001', true, 0),
  ('20000000-0000-4000-9000-000000000002', '20000000-0000-4000-c000-000000000001',
   NULL, 'Sara Bloom', 'Mother', 'sara.bloom@example.com', '410-555-2002', false, 1),
  ('20000000-0000-4000-9000-000000000003', '20000000-0000-4000-c000-000000000002',
   NULL, 'Rachel Silver', 'Mother', 'rachel.silver@example.com', '410-555-2003', true, 0),
  ('20000000-0000-4000-9000-000000000004', '20000000-0000-4000-c000-000000000002',
   NULL, 'Jason Silver', 'Father', 'jason.silver@example.com', '410-555-2004', false, 1),
  ('20000000-0000-4000-9000-000000000005', '20000000-0000-4000-c000-000000000003',
   NULL, 'Beth Epstein', 'Mother', 'beth.epstein@example.com', '410-555-2005', true, 0);


-- ============================================================================
-- PART 7: READINGS
-- ============================================================================

INSERT INTO public.readings (
  id, student_id, reading_type, portion_name, portion_name_hebrew,
  aliyah, reference, sefaria_url, sort_order
) VALUES
  -- ═══ SYDNEY BROOK — Full Parashat Noach ═══
  ('5b349bed-b5cd-418f-8109-b6f61b905447', 'd608e410-ed32-4623-aa91-8069ae8ad415',
   'torah', 'Noach', 'נֹחַ', 'Chamishi', 'Genesis 9:8-9:17',
   'https://www.sefaria.org/Genesis.9.8-17?lang=bi', 1),
  ('62fd06f0-68bc-4e4a-a451-1228906a5f14', 'd608e410-ed32-4623-aa91-8069ae8ad415',
   'torah', 'Noach', 'נֹחַ', 'Shishi', 'Genesis 9:18-10:32',
   'https://www.sefaria.org/Genesis.9.18-10.32?lang=bi', 2),
  ('b837c8a7-4d3c-4084-ad54-61e8a227d894', 'd608e410-ed32-4623-aa91-8069ae8ad415',
   'torah', 'Noach', 'נֹחַ', 'Shvi''i', 'Genesis 11:1-11:32',
   'https://www.sefaria.org/Genesis.11.1-32?lang=bi', 3),
  ('028b32e3-4d7d-4e9d-8123-bf6d50fc214c', 'd608e410-ed32-4623-aa91-8069ae8ad415',
   'torah', 'Noach', 'נֹחַ', 'Maftir', 'Genesis 11:29-11:32',
   'https://www.sefaria.org/Genesis.11.29-32?lang=bi', 4),
  ('cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'd608e410-ed32-4623-aa91-8069ae8ad415',
   'haftarah', 'Noach', 'נֹחַ', NULL, 'Isaiah 54:1-55:5',
   'https://www.sefaria.org/Isaiah.54.1-55.5?lang=bi', 5),

  -- ═══ Demo students' readings (same as v1) ═══
  ('00000000-0000-4000-d001-000000000001', '00000000-0000-4000-c000-000000000001',
   'torah', 'Noach', 'נֹחַ', 'Maftir', 'Genesis 8:15-8:19',
   'https://www.sefaria.org/Genesis.8.15-19?lang=bi', 0),
  ('00000000-0000-4000-d001-000000000002', '00000000-0000-4000-c000-000000000001',
   'haftarah', 'Noach', 'נֹחַ', NULL, 'Isaiah 54:1-54:5',
   'https://www.sefaria.org/Isaiah.54.1-5?lang=bi', 1),
  ('00000000-0000-4000-d002-000000000001', '00000000-0000-4000-c000-000000000002',
   'torah', 'Chayei Sarah', 'חַיֵּי שָׂרָה', 'Maftir', 'Genesis 25:1-25:6',
   'https://www.sefaria.org/Genesis.25.1-6?lang=bi', 0),
  ('00000000-0000-4000-d002-000000000002', '00000000-0000-4000-c000-000000000002',
   'haftarah', 'Chayei Sarah', 'חַיֵּי שָׂרָה', NULL, 'I Kings 1:1-1:5',
   'https://www.sefaria.org/I_Kings.1.1-5?lang=bi', 1),
  ('00000000-0000-4000-d003-000000000001', '00000000-0000-4000-c000-000000000003',
   'torah', 'Shemot', 'שְׁמוֹת', 'Maftir', 'Exodus 6:2-6:7',
   'https://www.sefaria.org/Exodus.6.2-7?lang=bi', 0),
  ('00000000-0000-4000-d003-000000000002', '00000000-0000-4000-c000-000000000003',
   'haftarah', 'Shemot', 'שְׁמוֹת', NULL, 'Isaiah 27:6-27:11',
   'https://www.sefaria.org/Isaiah.27.6-11?lang=bi', 1),
  ('00000000-0000-4000-d004-000000000001', '00000000-0000-4000-c000-000000000004',
   'torah', 'Ki Tisa', 'כִּי תִשָּׂא', 'Maftir', 'Exodus 34:27-34:32',
   'https://www.sefaria.org/Exodus.34.27-32?lang=bi', 0),
  ('00000000-0000-4000-d004-000000000002', '00000000-0000-4000-c000-000000000004',
   'haftarah', 'Ki Tisa', 'כִּי תִשָּׂא', NULL, 'I Kings 18:20-18:25',
   'https://www.sefaria.org/I_Kings.18.20-25?lang=bi', 1),
  ('00000000-0000-4000-d005-000000000001', '00000000-0000-4000-c000-000000000005',
   'torah', 'Emor', 'אֱמוֹר', 'Maftir', 'Leviticus 24:10-24:14',
   'https://www.sefaria.org/Leviticus.24.10-14?lang=bi', 0),
  ('00000000-0000-4000-d005-000000000002', '00000000-0000-4000-c000-000000000005',
   'haftarah', 'Emor', 'אֱמוֹר', NULL, 'Ezekiel 44:15-44:20',
   'https://www.sefaria.org/Ezekiel.44.15-20?lang=bi', 1),
  ('00000000-0000-4000-d006-000000000001', '00000000-0000-4000-c000-000000000006',
   'torah', 'Shelach', 'שְׁלַח', 'Maftir', 'Numbers 15:37-15:41',
   'https://www.sefaria.org/Numbers.15.37-41?lang=bi', 0),
  ('00000000-0000-4000-d006-000000000002', '00000000-0000-4000-c000-000000000006',
   'haftarah', 'Shelach', 'שְׁלַח', NULL, 'Joshua 2:1-2:6',
   'https://www.sefaria.org/Joshua.2.1-6?lang=bi', 1),
  ('00000000-0000-4000-d007-000000000001', '00000000-0000-4000-c000-000000000007',
   'torah', 'Bereshit', 'בְּרֵאשִׁית', 'Maftir', 'Genesis 2:1-2:5',
   'https://www.sefaria.org/Genesis.2.1-5?lang=bi', 0),
  ('00000000-0000-4000-d007-000000000002', '00000000-0000-4000-c000-000000000007',
   'haftarah', 'Bereshit', 'בְּרֵאשִׁית', NULL, 'Isaiah 42:5-42:10',
   'https://www.sefaria.org/Isaiah.42.5-10?lang=bi', 1),
  ('00000000-0000-4000-d008-000000000001', '00000000-0000-4000-c000-000000000008',
   'torah', 'Vayishlach', 'וַיִּשְׁלַח', 'Maftir', 'Genesis 36:1-36:5',
   'https://www.sefaria.org/Genesis.36.1-5?lang=bi', 0),
  ('00000000-0000-4000-d008-000000000002', '00000000-0000-4000-c000-000000000008',
   'haftarah', 'Vayishlach', 'וַיִּשְׁלַח', NULL, 'Obadiah 1:1-1:6',
   'https://www.sefaria.org/Obadiah.1.1-6?lang=bi', 1),
  ('00000000-0000-4000-d009-000000000001', '00000000-0000-4000-c000-000000000009',
   'torah', 'Beshalach', 'בְּשַׁלַּח', 'Maftir', 'Exodus 17:8-17:13',
   'https://www.sefaria.org/Exodus.17.8-13?lang=bi', 0),
  ('00000000-0000-4000-d009-000000000002', '00000000-0000-4000-c000-000000000009',
   'haftarah', 'Beshalach', 'בְּשַׁלַּח', NULL, 'Judges 4:4-4:9',
   'https://www.sefaria.org/Judges.4.4-9?lang=bi', 1),
  ('00000000-0000-4000-d010-000000000001', '00000000-0000-4000-c000-000000000010',
   'torah', 'Balak', 'בָּלָק', 'Maftir', 'Numbers 25:1-25:5',
   'https://www.sefaria.org/Numbers.25.1-5?lang=bi', 0),
  ('00000000-0000-4000-d010-000000000002', '00000000-0000-4000-c000-000000000010',
   'haftarah', 'Balak', 'בָּלָק', NULL, 'Micah 5:6-5:10',
   'https://www.sefaria.org/Micah.5.6-10?lang=bi', 1),
  ('00000000-0000-4000-d011-000000000001', '00000000-0000-4000-c000-000000000011',
   'torah', 'Eikev', 'עֵקֶב', 'Maftir', 'Deuteronomy 11:22-11:25',
   'https://www.sefaria.org/Deuteronomy.11.22-25?lang=bi', 0),
  ('00000000-0000-4000-d011-000000000002', '00000000-0000-4000-c000-000000000011',
   'haftarah', 'Eikev', 'עֵקֶב', NULL, 'Isaiah 49:14-49:18',
   'https://www.sefaria.org/Isaiah.49.14-18?lang=bi', 1),
  ('00000000-0000-4000-d012-000000000001', '00000000-0000-4000-c000-000000000012',
   'torah', 'Lech Lecha', 'לֶךְ לְךָ', 'Maftir', 'Genesis 17:22-17:27',
   'https://www.sefaria.org/Genesis.17.22-27?lang=bi', 0),
  ('00000000-0000-4000-d012-000000000002', '00000000-0000-4000-c000-000000000012',
   'haftarah', 'Lech Lecha', 'לֶךְ לְךָ', NULL, 'Isaiah 40:25-40:30',
   'https://www.sefaria.org/Isaiah.40.25-30?lang=bi', 1),
  ('00000000-0000-4000-d013-000000000001', '00000000-0000-4000-c000-000000000013',
   'torah', 'Vayikra', 'וַיִּקְרָא', 'Maftir', 'Leviticus 5:14-5:19',
   'https://www.sefaria.org/Leviticus.5.14-19?lang=bi', 0),
  ('00000000-0000-4000-d013-000000000002', '00000000-0000-4000-c000-000000000013',
   'haftarah', 'Vayikra', 'וַיִּקְרָא', NULL, 'Isaiah 43:21-43:25',
   'https://www.sefaria.org/Isaiah.43.21-25?lang=bi', 1),
  ('00000000-0000-4000-d014-000000000001', '00000000-0000-4000-c000-000000000014',
   'torah', 'Naso', 'נָשׂא', 'Maftir', 'Numbers 7:84-7:89',
   'https://www.sefaria.org/Numbers.7.84-89?lang=bi', 0),
  ('00000000-0000-4000-d014-000000000002', '00000000-0000-4000-c000-000000000014',
   'haftarah', 'Naso', 'נָשׂא', NULL, 'Judges 13:2-13:7',
   'https://www.sefaria.org/Judges.13.2-7?lang=bi', 1),

  -- ═══ Ryan-tutor student readings ═══
  -- Ari — Parashat Vayeira
  ('20000000-0000-4000-d001-000000000001', '20000000-0000-4000-c000-000000000001',
   'torah', 'Vayeira', 'וַיֵּרָא', 'Maftir', 'Genesis 22:20-22:24',
   'https://www.sefaria.org/Genesis.22.20-24?lang=bi', 0),
  ('20000000-0000-4000-d001-000000000002', '20000000-0000-4000-c000-000000000001',
   'haftarah', 'Vayeira', 'וַיֵּרָא', NULL, 'II Kings 4:1-4:7',
   'https://www.sefaria.org/II_Kings.4.1-7?lang=bi', 1),
  -- Talia — Parashat Toldot
  ('20000000-0000-4000-d002-000000000001', '20000000-0000-4000-c000-000000000002',
   'torah', 'Toldot', 'תּוֹלְדוֹת', 'Maftir', 'Genesis 28:5-28:9',
   'https://www.sefaria.org/Genesis.28.5-9?lang=bi', 0),
  ('20000000-0000-4000-d002-000000000002', '20000000-0000-4000-c000-000000000002',
   'haftarah', 'Toldot', 'תּוֹלְדוֹת', NULL, 'Malachi 1:1-1:5',
   'https://www.sefaria.org/Malachi.1.1-5?lang=bi', 1),
  -- Josh — Parashat Miketz
  ('20000000-0000-4000-d003-000000000001', '20000000-0000-4000-c000-000000000003',
   'torah', 'Miketz', 'מִקֵּץ', 'Maftir', 'Genesis 44:14-44:17',
   'https://www.sefaria.org/Genesis.44.14-17?lang=bi', 0),
  ('20000000-0000-4000-d003-000000000002', '20000000-0000-4000-c000-000000000003',
   'haftarah', 'Miketz', 'מִקֵּץ', NULL, 'I Kings 3:15-3:21',
   'https://www.sefaria.org/I_Kings.3.15-21?lang=bi', 1);


-- ============================================================================
-- PART 8: VERSES
-- ============================================================================

INSERT INTO public.verses (id, reading_id, verse_reference, sefaria_url, sort_order) VALUES
  -- ═══════════════════════════════════════════════════════════════════════
  -- SYDNEY — Chamishi: Genesis 9:8-9:17 (10 verses)
  -- ═══════════════════════════════════════════════════════════════════════
  ('61e4e1b6-81ae-42cd-bdc6-de13e50f5010', '5b349bed-b5cd-418f-8109-b6f61b905447', 'Genesis 9:8',  'https://www.sefaria.org/Genesis.9.8?lang=bi',  1),
  ('071b1e46-ae52-4c7c-a285-4c2e32742de9', '5b349bed-b5cd-418f-8109-b6f61b905447', 'Genesis 9:9',  'https://www.sefaria.org/Genesis.9.9?lang=bi',  2),
  ('e9192f98-d619-409c-a9fa-63ebbeb53e7b', '5b349bed-b5cd-418f-8109-b6f61b905447', 'Genesis 9:10', 'https://www.sefaria.org/Genesis.9.10?lang=bi', 3),
  ('3c886074-cd58-4147-afc6-fc1dc73b7a37', '5b349bed-b5cd-418f-8109-b6f61b905447', 'Genesis 9:11', 'https://www.sefaria.org/Genesis.9.11?lang=bi', 4),
  ('c8933c63-5476-4ed2-8c74-81fabcad5e1e', '5b349bed-b5cd-418f-8109-b6f61b905447', 'Genesis 9:12', 'https://www.sefaria.org/Genesis.9.12?lang=bi', 5),
  ('54ea939a-e357-4476-a049-f7adb3d95f5b', '5b349bed-b5cd-418f-8109-b6f61b905447', 'Genesis 9:13', 'https://www.sefaria.org/Genesis.9.13?lang=bi', 6),
  ('00782ca1-2a2e-4119-ac7c-6be62e9a0b51', '5b349bed-b5cd-418f-8109-b6f61b905447', 'Genesis 9:14', 'https://www.sefaria.org/Genesis.9.14?lang=bi', 7),
  ('d7a68008-e065-4f3e-a51b-8752dccb64c0', '5b349bed-b5cd-418f-8109-b6f61b905447', 'Genesis 9:15', 'https://www.sefaria.org/Genesis.9.15?lang=bi', 8),
  ('bc04e34f-e83a-4eb5-b205-106d36902571', '5b349bed-b5cd-418f-8109-b6f61b905447', 'Genesis 9:16', 'https://www.sefaria.org/Genesis.9.16?lang=bi', 9),
  ('4b94ea30-a09e-4dcb-9864-2bf516e8e165', '5b349bed-b5cd-418f-8109-b6f61b905447', 'Genesis 9:17', 'https://www.sefaria.org/Genesis.9.17?lang=bi', 10),

  -- ═══════════════════════════════════════════════════════════════════════
  -- SYDNEY — Shishi: Genesis 9:18-10:32 (44 verses)
  -- ═══════════════════════════════════════════════════════════════════════
  ('a6e2f0f9-33f8-4f39-b621-1e96997ff52a', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 9:18',  'https://www.sefaria.org/Genesis.9.18?lang=bi',  1),
  ('af3b72c2-28f6-4761-a92f-094fb21b9e8e', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 9:19',  'https://www.sefaria.org/Genesis.9.19?lang=bi',  2),
  ('6f74dfb0-9996-4eed-ac73-9f18643574a9', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 9:20',  'https://www.sefaria.org/Genesis.9.20?lang=bi',  3),
  ('733b7a23-7cd7-4830-8da8-3af6f4804b6c', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 9:21',  'https://www.sefaria.org/Genesis.9.21?lang=bi',  4),
  ('3e11fe62-c4b9-49af-b75e-b2a39c06e7e8', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 9:22',  'https://www.sefaria.org/Genesis.9.22?lang=bi',  5),
  ('edc507ab-e70c-4bfe-8f50-fc26d17a85a7', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 9:23',  'https://www.sefaria.org/Genesis.9.23?lang=bi',  6),
  ('6a79f9cc-805a-4177-baed-4522e5e922d2', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 9:24',  'https://www.sefaria.org/Genesis.9.24?lang=bi',  7),
  ('8ed11087-e05d-4bb3-87ab-51bdf99db367', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 9:25',  'https://www.sefaria.org/Genesis.9.25?lang=bi',  8),
  ('78e1771e-72cb-44c1-9e28-76e80841c35b', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 9:26',  'https://www.sefaria.org/Genesis.9.26?lang=bi',  9),
  ('9165aa49-598c-47d3-9beb-0283580d5783', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 9:27',  'https://www.sefaria.org/Genesis.9.27?lang=bi',  10),
  ('a869bfbd-9f60-42fc-9b79-32e657602137', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 9:28',  'https://www.sefaria.org/Genesis.9.28?lang=bi',  11),
  ('9aa0b955-78ee-48af-9b0c-b729a6da2563', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 9:29',  'https://www.sefaria.org/Genesis.9.29?lang=bi',  12),
  ('dd732ee2-43e5-43df-923a-cff5d46b93c3', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:1',  'https://www.sefaria.org/Genesis.10.1?lang=bi',  13),
  ('bf850c86-b2b5-4ee2-bce7-9eb826079ecc', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:2',  'https://www.sefaria.org/Genesis.10.2?lang=bi',  14),
  ('a9085120-72da-4632-9107-d0607d844cb5', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:3',  'https://www.sefaria.org/Genesis.10.3?lang=bi',  15),
  ('899c658b-c7ec-4a8d-ac98-9bd500b13fe8', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:4',  'https://www.sefaria.org/Genesis.10.4?lang=bi',  16),
  ('9fbfa642-4c4e-4f87-965f-d0067a661e18', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:5',  'https://www.sefaria.org/Genesis.10.5?lang=bi',  17),
  ('1dc08aa8-68a8-4d6c-937f-919a0df31cb2', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:6',  'https://www.sefaria.org/Genesis.10.6?lang=bi',  18),
  ('bd6e1492-849c-48d7-9793-cbd1b326b3ac', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:7',  'https://www.sefaria.org/Genesis.10.7?lang=bi',  19),
  ('9dce37de-41b4-4fc9-a971-0faca1278581', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:8',  'https://www.sefaria.org/Genesis.10.8?lang=bi',  20),
  ('10a4dff6-3273-4a37-b754-521b1cbbb8cc', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:9',  'https://www.sefaria.org/Genesis.10.9?lang=bi',  21),
  ('6f91d35d-b0a1-48bd-a65f-dc9303530163', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:10', 'https://www.sefaria.org/Genesis.10.10?lang=bi', 22),
  ('bca9b5a7-d85f-4b24-8a59-cbc961cdc873', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:11', 'https://www.sefaria.org/Genesis.10.11?lang=bi', 23),
  ('5c1ed286-1666-400c-acc6-98ea7f1b6fa8', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:12', 'https://www.sefaria.org/Genesis.10.12?lang=bi', 24),
  ('7d233bc0-49a3-4a1d-b873-ee6f6f03eae7', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:13', 'https://www.sefaria.org/Genesis.10.13?lang=bi', 25),
  ('220da562-26a4-4250-bcf9-7fc6708a2876', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:14', 'https://www.sefaria.org/Genesis.10.14?lang=bi', 26),
  ('e8b37cd4-51bf-447b-9610-b8cabe28b277', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:15', 'https://www.sefaria.org/Genesis.10.15?lang=bi', 27),
  ('c12b8ff3-5ec3-492e-a033-33a19457351e', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:16', 'https://www.sefaria.org/Genesis.10.16?lang=bi', 28),
  ('4b6e7067-c0a2-4228-bdc2-ce630e2b454c', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:17', 'https://www.sefaria.org/Genesis.10.17?lang=bi', 29),
  ('9c3a2ea7-a2c4-4dde-80cf-d0325bf5c677', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:18', 'https://www.sefaria.org/Genesis.10.18?lang=bi', 30),
  ('1af54890-fb99-403e-83e3-a10045269e2d', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:19', 'https://www.sefaria.org/Genesis.10.19?lang=bi', 31),
  ('4b646cbf-0a6b-438d-abed-14368a420675', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:20', 'https://www.sefaria.org/Genesis.10.20?lang=bi', 32),
  ('8fe36859-71f7-4fb3-9973-de7430b4cad4', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:21', 'https://www.sefaria.org/Genesis.10.21?lang=bi', 33),
  ('ac252ad3-97a7-4952-aeda-b5c7c6ca6300', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:22', 'https://www.sefaria.org/Genesis.10.22?lang=bi', 34),
  ('f713d77f-0118-41c4-aef0-aacabd1aa2ac', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:23', 'https://www.sefaria.org/Genesis.10.23?lang=bi', 35),
  ('db5e8478-1650-41d0-be89-5c676f459320', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:24', 'https://www.sefaria.org/Genesis.10.24?lang=bi', 36),
  ('4da3d980-7820-4668-bf60-99cc8a1f2bb3', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:25', 'https://www.sefaria.org/Genesis.10.25?lang=bi', 37),
  ('d173b379-da8d-4582-a4c2-ccf61c8438f7', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:26', 'https://www.sefaria.org/Genesis.10.26?lang=bi', 38),
  ('ca0e0527-ec20-4fd6-89cb-2b875db2ef63', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:27', 'https://www.sefaria.org/Genesis.10.27?lang=bi', 39),
  ('b975503d-426d-44f1-a208-2d490810faef', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:28', 'https://www.sefaria.org/Genesis.10.28?lang=bi', 40),
  ('cf88f95c-b29c-4852-9f11-3bd23f50175c', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:29', 'https://www.sefaria.org/Genesis.10.29?lang=bi', 41),
  ('ee40d33b-daa4-42f2-926b-05c860797309', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:30', 'https://www.sefaria.org/Genesis.10.30?lang=bi', 42),
  ('b62aebee-21c9-453f-a973-80233da0fa5c', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:31', 'https://www.sefaria.org/Genesis.10.31?lang=bi', 43),
  ('bc64e99c-a8dd-497d-8ce3-046b03ed5afd', '62fd06f0-68bc-4e4a-a451-1228906a5f14', 'Genesis 10:32', 'https://www.sefaria.org/Genesis.10.32?lang=bi', 44),

  -- ═══════════════════════════════════════════════════════════════════════
  -- SYDNEY — Shvi'i: Genesis 11:1-11:32 (32 verses)
  -- ═══════════════════════════════════════════════════════════════════════
  ('ee0c2b92-6b1d-45da-916c-801f150bcc38', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:1',  'https://www.sefaria.org/Genesis.11.1?lang=bi',  1),
  ('cc7912fe-99a1-4fa3-a147-ceec0d52f152', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:2',  'https://www.sefaria.org/Genesis.11.2?lang=bi',  2),
  ('fb9e8223-bfc4-4b63-8713-6e547c47a8a7', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:3',  'https://www.sefaria.org/Genesis.11.3?lang=bi',  3),
  ('0ff26770-6cd9-4f82-97d4-d768c27b125f', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:4',  'https://www.sefaria.org/Genesis.11.4?lang=bi',  4),
  ('5bd61f2f-2d55-476a-8e92-e8e0a8452d09', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:5',  'https://www.sefaria.org/Genesis.11.5?lang=bi',  5),
  ('ad3cdb34-9371-44a0-9de9-edc64d0c2a7f', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:6',  'https://www.sefaria.org/Genesis.11.6?lang=bi',  6),
  ('f0afb9bc-cb16-442e-99a1-bee4af3df741', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:7',  'https://www.sefaria.org/Genesis.11.7?lang=bi',  7),
  ('a3d7bb2b-b141-4baf-af60-80d945bd5df5', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:8',  'https://www.sefaria.org/Genesis.11.8?lang=bi',  8),
  ('baad5566-6d1f-4687-845d-1b4855467f78', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:9',  'https://www.sefaria.org/Genesis.11.9?lang=bi',  9),
  ('1aa3b78a-55c1-4d0b-aa7c-a67968b72183', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:10', 'https://www.sefaria.org/Genesis.11.10?lang=bi', 10),
  ('92be3f2f-eb05-4714-bcea-12a42679c4d2', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:11', 'https://www.sefaria.org/Genesis.11.11?lang=bi', 11),
  ('3dbb153d-ebce-42e3-9a91-f5ec48cb243e', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:12', 'https://www.sefaria.org/Genesis.11.12?lang=bi', 12),
  ('a409f41f-d6ab-446a-9b7d-78deb2688c54', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:13', 'https://www.sefaria.org/Genesis.11.13?lang=bi', 13),
  ('c230c9dd-079b-4095-a454-6161793accb4', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:14', 'https://www.sefaria.org/Genesis.11.14?lang=bi', 14),
  ('ca8d920c-1c5a-436c-af78-01c4ad4f7e8f', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:15', 'https://www.sefaria.org/Genesis.11.15?lang=bi', 15),
  ('130afca5-e7f9-416f-8e51-8fc415cf4da2', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:16', 'https://www.sefaria.org/Genesis.11.16?lang=bi', 16),
  ('20a63aab-5c2d-41b4-abf0-74957ad1137b', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:17', 'https://www.sefaria.org/Genesis.11.17?lang=bi', 17),
  ('65a6d7ab-0b3d-4cd6-8717-29dcc039b499', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:18', 'https://www.sefaria.org/Genesis.11.18?lang=bi', 18),
  ('5d35886d-57dd-4aa0-9e8e-39785acb6f13', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:19', 'https://www.sefaria.org/Genesis.11.19?lang=bi', 19),
  ('a2f438fa-b291-4efa-bcad-a1e813c0e2fe', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:20', 'https://www.sefaria.org/Genesis.11.20?lang=bi', 20),
  ('067e5262-1f1f-42e1-bac1-6df9a3bba53a', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:21', 'https://www.sefaria.org/Genesis.11.21?lang=bi', 21),
  ('bb312edd-b458-4c95-b616-999c07b33a28', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:22', 'https://www.sefaria.org/Genesis.11.22?lang=bi', 22),
  ('1ffc4aa5-e494-4db6-8957-b490266a4200', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:23', 'https://www.sefaria.org/Genesis.11.23?lang=bi', 23),
  ('efc86c10-ead5-40f8-9ef5-bd1b5dd5ceec', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:24', 'https://www.sefaria.org/Genesis.11.24?lang=bi', 24),
  ('3b047484-7949-4d0f-9aad-2fcdc568943d', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:25', 'https://www.sefaria.org/Genesis.11.25?lang=bi', 25),
  ('3484bcb3-fd43-4875-8b5d-cdc7b15b4b98', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:26', 'https://www.sefaria.org/Genesis.11.26?lang=bi', 26),
  ('6cb5a4a6-d05c-4ecc-b6ad-92d17bd7c959', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:27', 'https://www.sefaria.org/Genesis.11.27?lang=bi', 27),
  ('69012bce-ea36-4590-8f32-82fa1333c823', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:28', 'https://www.sefaria.org/Genesis.11.28?lang=bi', 28),
  ('f20ee0cb-a835-4779-90d1-f81598f4599d', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:29', 'https://www.sefaria.org/Genesis.11.29?lang=bi', 29),
  ('fd3ecfcc-62a1-4e27-833f-9c96b97e9c3d', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:30', 'https://www.sefaria.org/Genesis.11.30?lang=bi', 30),
  ('86273109-290a-445a-ab2f-1dcce5fbe50f', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:31', 'https://www.sefaria.org/Genesis.11.31?lang=bi', 31),
  ('dc09fb58-cfcd-4da6-bbbe-d2ab44f7153e', 'b837c8a7-4d3c-4084-ad54-61e8a227d894', 'Genesis 11:32', 'https://www.sefaria.org/Genesis.11.32?lang=bi', 32),

  -- ═══════════════════════════════════════════════════════════════════════
  -- SYDNEY — Maftir: Genesis 11:29-11:32 (4 verses)
  -- ═══════════════════════════════════════════════════════════════════════
  ('98913c5f-3b8a-4f4a-bf77-dee285889f17', '028b32e3-4d7d-4e9d-8123-bf6d50fc214c', 'Genesis 11:29', 'https://www.sefaria.org/Genesis.11.29?lang=bi', 1),
  ('65179220-3c29-4c9c-b39a-e3cf2ef54da5', '028b32e3-4d7d-4e9d-8123-bf6d50fc214c', 'Genesis 11:30', 'https://www.sefaria.org/Genesis.11.30?lang=bi', 2),
  ('417ca704-6056-4acc-974a-650d90fa9f97', '028b32e3-4d7d-4e9d-8123-bf6d50fc214c', 'Genesis 11:31', 'https://www.sefaria.org/Genesis.11.31?lang=bi', 3),
  ('0cba24da-fff0-4aaf-8a4a-cddc0fbce206', '028b32e3-4d7d-4e9d-8123-bf6d50fc214c', 'Genesis 11:32', 'https://www.sefaria.org/Genesis.11.32?lang=bi', 4),

  -- ═══════════════════════════════════════════════════════════════════════
  -- SYDNEY — Haftarah: Isaiah 54:1-55:5 (22 verses)
  -- ═══════════════════════════════════════════════════════════════════════
  ('e2e211dd-5521-421b-b005-0655ac540a58', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:1',  'https://www.sefaria.org/Isaiah.54.1?lang=bi',  1),
  ('69a4497f-026a-4d15-aeb0-a15bc923d816', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:2',  'https://www.sefaria.org/Isaiah.54.2?lang=bi',  2),
  ('2768d1e7-d4f1-4104-bb16-7675c74064ea', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:3',  'https://www.sefaria.org/Isaiah.54.3?lang=bi',  3),
  ('9e963126-0611-46f7-a3c9-1803d1e38af9', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:4',  'https://www.sefaria.org/Isaiah.54.4?lang=bi',  4),
  ('ad7f5300-e98a-4ba4-a172-608f9aebe568', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:5',  'https://www.sefaria.org/Isaiah.54.5?lang=bi',  5),
  ('a28dae02-abee-4fdc-aa1b-5e695d7060ea', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:6',  'https://www.sefaria.org/Isaiah.54.6?lang=bi',  6),
  ('300eea80-b18d-4018-b1ce-dd5c0e3499e2', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:7',  'https://www.sefaria.org/Isaiah.54.7?lang=bi',  7),
  ('b8d4fd50-240a-49ae-9038-a8526ed32290', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:8',  'https://www.sefaria.org/Isaiah.54.8?lang=bi',  8),
  ('241d2918-5967-4f0f-b30e-6bd601a6b511', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:9',  'https://www.sefaria.org/Isaiah.54.9?lang=bi',  9),
  ('3ecd619e-73dd-44b4-beb3-2dca7f8b3643', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:10', 'https://www.sefaria.org/Isaiah.54.10?lang=bi', 10),
  ('26d37c92-fd7b-4ee0-8565-b17c74c4fa35', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:11', 'https://www.sefaria.org/Isaiah.54.11?lang=bi', 11),
  ('06903869-783a-43f5-b20d-27cf91d3f58d', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:12', 'https://www.sefaria.org/Isaiah.54.12?lang=bi', 12),
  ('c28d6136-9af6-44fc-bc6b-8a83522b7894', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:13', 'https://www.sefaria.org/Isaiah.54.13?lang=bi', 13),
  ('22859ca6-9c77-425f-8d3a-831a99db846b', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:14', 'https://www.sefaria.org/Isaiah.54.14?lang=bi', 14),
  ('5fdd5cec-deee-47c1-950a-908fa9bee19f', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:15', 'https://www.sefaria.org/Isaiah.54.15?lang=bi', 15),
  ('205bb28e-97c4-4981-a867-3370ae6991ad', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:16', 'https://www.sefaria.org/Isaiah.54.16?lang=bi', 16),
  ('89d25286-aa10-468c-ad79-991f8c92e161', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 54:17', 'https://www.sefaria.org/Isaiah.54.17?lang=bi', 17),
  ('f6b51a7d-3a20-4652-960c-80e111fc4607', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 55:1',  'https://www.sefaria.org/Isaiah.55.1?lang=bi',  18),
  ('b5eb9501-e6f4-4ec5-a682-c90ff93a4096', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 55:2',  'https://www.sefaria.org/Isaiah.55.2?lang=bi',  19),
  ('6cfa7fc2-1452-457d-a828-d688981d8a4c', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 55:3',  'https://www.sefaria.org/Isaiah.55.3?lang=bi',  20),
  ('e89068fa-7f07-4211-8113-bbfceae3ac25', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 55:4',  'https://www.sefaria.org/Isaiah.55.4?lang=bi',  21),
  ('bb37860b-325e-4fc0-b691-88a174e3d30a', 'cf20a21b-40c7-44d1-b6e5-c1cf82024229', 'Isaiah 55:5',  'https://www.sefaria.org/Isaiah.55.5?lang=bi',  22),

  -- ═══════════════════════════════════════════════════════════════════════
  -- DEMO STUDENT VERSES (same as v1, abbreviated IDs for readability)
  -- ═══════════════════════════════════════════════════════════════════════
  -- Ethan Torah: Genesis 8:15-8:19
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d001-000000000001', 'Genesis 8:15', 'https://www.sefaria.org/Genesis.8.15?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-d001-000000000001', 'Genesis 8:16', 'https://www.sefaria.org/Genesis.8.16?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-d001-000000000001', 'Genesis 8:17', 'https://www.sefaria.org/Genesis.8.17?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000004', '00000000-0000-4000-d001-000000000001', 'Genesis 8:18', 'https://www.sefaria.org/Genesis.8.18?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-d001-000000000001', 'Genesis 8:19', 'https://www.sefaria.org/Genesis.8.19?lang=bi', 4),
  -- Ethan Haftarah: Isaiah 54:1-54:5
  ('00000000-0000-4000-e000-000000000006', '00000000-0000-4000-d001-000000000002', 'Isaiah 54:1', 'https://www.sefaria.org/Isaiah.54.1?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000007', '00000000-0000-4000-d001-000000000002', 'Isaiah 54:2', 'https://www.sefaria.org/Isaiah.54.2?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000008', '00000000-0000-4000-d001-000000000002', 'Isaiah 54:3', 'https://www.sefaria.org/Isaiah.54.3?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000009', '00000000-0000-4000-d001-000000000002', 'Isaiah 54:4', 'https://www.sefaria.org/Isaiah.54.4?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000010', '00000000-0000-4000-d001-000000000002', 'Isaiah 54:5', 'https://www.sefaria.org/Isaiah.54.5?lang=bi', 4),
  -- Maya Torah: Genesis 25:1-25:6
  ('00000000-0000-4000-e000-000000000011', '00000000-0000-4000-d002-000000000001', 'Genesis 25:1', 'https://www.sefaria.org/Genesis.25.1?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000012', '00000000-0000-4000-d002-000000000001', 'Genesis 25:2', 'https://www.sefaria.org/Genesis.25.2?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000013', '00000000-0000-4000-d002-000000000001', 'Genesis 25:3', 'https://www.sefaria.org/Genesis.25.3?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000014', '00000000-0000-4000-d002-000000000001', 'Genesis 25:4', 'https://www.sefaria.org/Genesis.25.4?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000015', '00000000-0000-4000-d002-000000000001', 'Genesis 25:5', 'https://www.sefaria.org/Genesis.25.5?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000016', '00000000-0000-4000-d002-000000000001', 'Genesis 25:6', 'https://www.sefaria.org/Genesis.25.6?lang=bi', 5),
  -- Maya Haftarah: I Kings 1:1-1:5
  ('00000000-0000-4000-e000-000000000017', '00000000-0000-4000-d002-000000000002', 'I Kings 1:1', 'https://www.sefaria.org/I_Kings.1.1?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000018', '00000000-0000-4000-d002-000000000002', 'I Kings 1:2', 'https://www.sefaria.org/I_Kings.1.2?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000019', '00000000-0000-4000-d002-000000000002', 'I Kings 1:3', 'https://www.sefaria.org/I_Kings.1.3?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000020', '00000000-0000-4000-d002-000000000002', 'I Kings 1:4', 'https://www.sefaria.org/I_Kings.1.4?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000021', '00000000-0000-4000-d002-000000000002', 'I Kings 1:5', 'https://www.sefaria.org/I_Kings.1.5?lang=bi', 4),
  -- Noah Torah+Haft, Lily Torah+Haft, Jacob Torah+Haft, Sophie Torah+Haft (minimal for brevity)
  ('00000000-0000-4000-e000-000000000022', '00000000-0000-4000-d003-000000000001', 'Exodus 6:2', 'https://www.sefaria.org/Exodus.6.2?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000023', '00000000-0000-4000-d003-000000000001', 'Exodus 6:3', 'https://www.sefaria.org/Exodus.6.3?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000024', '00000000-0000-4000-d003-000000000001', 'Exodus 6:4', 'https://www.sefaria.org/Exodus.6.4?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000025', '00000000-0000-4000-d003-000000000001', 'Exodus 6:5', 'https://www.sefaria.org/Exodus.6.5?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000026', '00000000-0000-4000-d003-000000000001', 'Exodus 6:6', 'https://www.sefaria.org/Exodus.6.6?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000027', '00000000-0000-4000-d003-000000000001', 'Exodus 6:7', 'https://www.sefaria.org/Exodus.6.7?lang=bi', 5),
  ('00000000-0000-4000-e000-000000000028', '00000000-0000-4000-d003-000000000002', 'Isaiah 27:6', 'https://www.sefaria.org/Isaiah.27.6?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000029', '00000000-0000-4000-d003-000000000002', 'Isaiah 27:7', 'https://www.sefaria.org/Isaiah.27.7?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000030', '00000000-0000-4000-d003-000000000002', 'Isaiah 27:8', 'https://www.sefaria.org/Isaiah.27.8?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000031', '00000000-0000-4000-d003-000000000002', 'Isaiah 27:9', 'https://www.sefaria.org/Isaiah.27.9?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000032', '00000000-0000-4000-d003-000000000002', 'Isaiah 27:10', 'https://www.sefaria.org/Isaiah.27.10?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000033', '00000000-0000-4000-d003-000000000002', 'Isaiah 27:11', 'https://www.sefaria.org/Isaiah.27.11?lang=bi', 5),
  ('00000000-0000-4000-e000-000000000034', '00000000-0000-4000-d004-000000000001', 'Exodus 34:27', 'https://www.sefaria.org/Exodus.34.27?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000035', '00000000-0000-4000-d004-000000000001', 'Exodus 34:28', 'https://www.sefaria.org/Exodus.34.28?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000036', '00000000-0000-4000-d004-000000000001', 'Exodus 34:29', 'https://www.sefaria.org/Exodus.34.29?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000037', '00000000-0000-4000-d004-000000000001', 'Exodus 34:30', 'https://www.sefaria.org/Exodus.34.30?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000038', '00000000-0000-4000-d004-000000000001', 'Exodus 34:31', 'https://www.sefaria.org/Exodus.34.31?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000039', '00000000-0000-4000-d004-000000000001', 'Exodus 34:32', 'https://www.sefaria.org/Exodus.34.32?lang=bi', 5),
  ('00000000-0000-4000-e000-000000000040', '00000000-0000-4000-d004-000000000002', 'I Kings 18:20', 'https://www.sefaria.org/I_Kings.18.20?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000041', '00000000-0000-4000-d004-000000000002', 'I Kings 18:21', 'https://www.sefaria.org/I_Kings.18.21?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000042', '00000000-0000-4000-d004-000000000002', 'I Kings 18:22', 'https://www.sefaria.org/I_Kings.18.22?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000043', '00000000-0000-4000-d004-000000000002', 'I Kings 18:23', 'https://www.sefaria.org/I_Kings.18.23?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000044', '00000000-0000-4000-d004-000000000002', 'I Kings 18:24', 'https://www.sefaria.org/I_Kings.18.24?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000045', '00000000-0000-4000-d004-000000000002', 'I Kings 18:25', 'https://www.sefaria.org/I_Kings.18.25?lang=bi', 5),
  ('00000000-0000-4000-e000-000000000046', '00000000-0000-4000-d005-000000000001', 'Leviticus 24:10', 'https://www.sefaria.org/Leviticus.24.10?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000047', '00000000-0000-4000-d005-000000000001', 'Leviticus 24:11', 'https://www.sefaria.org/Leviticus.24.11?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000048', '00000000-0000-4000-d005-000000000001', 'Leviticus 24:12', 'https://www.sefaria.org/Leviticus.24.12?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000049', '00000000-0000-4000-d005-000000000001', 'Leviticus 24:13', 'https://www.sefaria.org/Leviticus.24.13?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000050', '00000000-0000-4000-d005-000000000001', 'Leviticus 24:14', 'https://www.sefaria.org/Leviticus.24.14?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000051', '00000000-0000-4000-d005-000000000002', 'Ezekiel 44:15', 'https://www.sefaria.org/Ezekiel.44.15?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000052', '00000000-0000-4000-d005-000000000002', 'Ezekiel 44:16', 'https://www.sefaria.org/Ezekiel.44.16?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000053', '00000000-0000-4000-d005-000000000002', 'Ezekiel 44:17', 'https://www.sefaria.org/Ezekiel.44.17?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000054', '00000000-0000-4000-d005-000000000002', 'Ezekiel 44:18', 'https://www.sefaria.org/Ezekiel.44.18?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000055', '00000000-0000-4000-d005-000000000002', 'Ezekiel 44:19', 'https://www.sefaria.org/Ezekiel.44.19?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000056', '00000000-0000-4000-d005-000000000002', 'Ezekiel 44:20', 'https://www.sefaria.org/Ezekiel.44.20?lang=bi', 5),
  ('00000000-0000-4000-e000-000000000057', '00000000-0000-4000-d006-000000000001', 'Numbers 15:37', 'https://www.sefaria.org/Numbers.15.37?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000058', '00000000-0000-4000-d006-000000000001', 'Numbers 15:38', 'https://www.sefaria.org/Numbers.15.38?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000059', '00000000-0000-4000-d006-000000000001', 'Numbers 15:39', 'https://www.sefaria.org/Numbers.15.39?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000060', '00000000-0000-4000-d006-000000000001', 'Numbers 15:40', 'https://www.sefaria.org/Numbers.15.40?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000061', '00000000-0000-4000-d006-000000000001', 'Numbers 15:41', 'https://www.sefaria.org/Numbers.15.41?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000062', '00000000-0000-4000-d006-000000000002', 'Joshua 2:1', 'https://www.sefaria.org/Joshua.2.1?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000063', '00000000-0000-4000-d006-000000000002', 'Joshua 2:2', 'https://www.sefaria.org/Joshua.2.2?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000064', '00000000-0000-4000-d006-000000000002', 'Joshua 2:3', 'https://www.sefaria.org/Joshua.2.3?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000065', '00000000-0000-4000-d006-000000000002', 'Joshua 2:4', 'https://www.sefaria.org/Joshua.2.4?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000066', '00000000-0000-4000-d006-000000000002', 'Joshua 2:5', 'https://www.sefaria.org/Joshua.2.5?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000067', '00000000-0000-4000-d006-000000000002', 'Joshua 2:6', 'https://www.sefaria.org/Joshua.2.6?lang=bi', 5),
  -- Completed students: Ben, Ava, Sam, Hannah, Daniel, Zoe, Max, Ella (5 verses each Torah+Haft)
  ('00000000-0000-4000-e000-000000000068', '00000000-0000-4000-d007-000000000001', 'Genesis 2:1', 'https://www.sefaria.org/Genesis.2.1?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000069', '00000000-0000-4000-d007-000000000001', 'Genesis 2:2', 'https://www.sefaria.org/Genesis.2.2?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000070', '00000000-0000-4000-d007-000000000001', 'Genesis 2:3', 'https://www.sefaria.org/Genesis.2.3?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000071', '00000000-0000-4000-d007-000000000001', 'Genesis 2:4', 'https://www.sefaria.org/Genesis.2.4?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000072', '00000000-0000-4000-d007-000000000001', 'Genesis 2:5', 'https://www.sefaria.org/Genesis.2.5?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000073', '00000000-0000-4000-d007-000000000002', 'Isaiah 42:5', 'https://www.sefaria.org/Isaiah.42.5?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000074', '00000000-0000-4000-d007-000000000002', 'Isaiah 42:6', 'https://www.sefaria.org/Isaiah.42.6?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000075', '00000000-0000-4000-d007-000000000002', 'Isaiah 42:7', 'https://www.sefaria.org/Isaiah.42.7?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000076', '00000000-0000-4000-d007-000000000002', 'Isaiah 42:8', 'https://www.sefaria.org/Isaiah.42.8?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000077', '00000000-0000-4000-d007-000000000002', 'Isaiah 42:9', 'https://www.sefaria.org/Isaiah.42.9?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000078', '00000000-0000-4000-d007-000000000002', 'Isaiah 42:10', 'https://www.sefaria.org/Isaiah.42.10?lang=bi', 5),
  ('00000000-0000-4000-e000-000000000079', '00000000-0000-4000-d008-000000000001', 'Genesis 36:1', 'https://www.sefaria.org/Genesis.36.1?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000080', '00000000-0000-4000-d008-000000000001', 'Genesis 36:2', 'https://www.sefaria.org/Genesis.36.2?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000081', '00000000-0000-4000-d008-000000000001', 'Genesis 36:3', 'https://www.sefaria.org/Genesis.36.3?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000082', '00000000-0000-4000-d008-000000000001', 'Genesis 36:4', 'https://www.sefaria.org/Genesis.36.4?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000083', '00000000-0000-4000-d008-000000000001', 'Genesis 36:5', 'https://www.sefaria.org/Genesis.36.5?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000084', '00000000-0000-4000-d008-000000000002', 'Obadiah 1:1', 'https://www.sefaria.org/Obadiah.1.1?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000085', '00000000-0000-4000-d008-000000000002', 'Obadiah 1:2', 'https://www.sefaria.org/Obadiah.1.2?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000086', '00000000-0000-4000-d008-000000000002', 'Obadiah 1:3', 'https://www.sefaria.org/Obadiah.1.3?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000087', '00000000-0000-4000-d008-000000000002', 'Obadiah 1:4', 'https://www.sefaria.org/Obadiah.1.4?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000088', '00000000-0000-4000-d008-000000000002', 'Obadiah 1:5', 'https://www.sefaria.org/Obadiah.1.5?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000089', '00000000-0000-4000-d008-000000000002', 'Obadiah 1:6', 'https://www.sefaria.org/Obadiah.1.6?lang=bi', 5),
  ('00000000-0000-4000-e000-000000000090', '00000000-0000-4000-d009-000000000001', 'Exodus 17:8', 'https://www.sefaria.org/Exodus.17.8?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000091', '00000000-0000-4000-d009-000000000001', 'Exodus 17:9', 'https://www.sefaria.org/Exodus.17.9?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000092', '00000000-0000-4000-d009-000000000001', 'Exodus 17:10', 'https://www.sefaria.org/Exodus.17.10?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000093', '00000000-0000-4000-d009-000000000001', 'Exodus 17:11', 'https://www.sefaria.org/Exodus.17.11?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000094', '00000000-0000-4000-d009-000000000001', 'Exodus 17:12', 'https://www.sefaria.org/Exodus.17.12?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000095', '00000000-0000-4000-d009-000000000001', 'Exodus 17:13', 'https://www.sefaria.org/Exodus.17.13?lang=bi', 5),
  ('00000000-0000-4000-e000-000000000096', '00000000-0000-4000-d009-000000000002', 'Judges 4:4', 'https://www.sefaria.org/Judges.4.4?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000097', '00000000-0000-4000-d009-000000000002', 'Judges 4:5', 'https://www.sefaria.org/Judges.4.5?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000098', '00000000-0000-4000-d009-000000000002', 'Judges 4:6', 'https://www.sefaria.org/Judges.4.6?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000099', '00000000-0000-4000-d009-000000000002', 'Judges 4:7', 'https://www.sefaria.org/Judges.4.7?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000100', '00000000-0000-4000-d009-000000000002', 'Judges 4:8', 'https://www.sefaria.org/Judges.4.8?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000101', '00000000-0000-4000-d009-000000000002', 'Judges 4:9', 'https://www.sefaria.org/Judges.4.9?lang=bi', 5),
  ('00000000-0000-4000-e000-000000000102', '00000000-0000-4000-d010-000000000001', 'Numbers 25:1', 'https://www.sefaria.org/Numbers.25.1?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000103', '00000000-0000-4000-d010-000000000001', 'Numbers 25:2', 'https://www.sefaria.org/Numbers.25.2?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000104', '00000000-0000-4000-d010-000000000001', 'Numbers 25:3', 'https://www.sefaria.org/Numbers.25.3?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000105', '00000000-0000-4000-d010-000000000001', 'Numbers 25:4', 'https://www.sefaria.org/Numbers.25.4?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000106', '00000000-0000-4000-d010-000000000001', 'Numbers 25:5', 'https://www.sefaria.org/Numbers.25.5?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000107', '00000000-0000-4000-d010-000000000002', 'Micah 5:6', 'https://www.sefaria.org/Micah.5.6?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000108', '00000000-0000-4000-d010-000000000002', 'Micah 5:7', 'https://www.sefaria.org/Micah.5.7?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000109', '00000000-0000-4000-d010-000000000002', 'Micah 5:8', 'https://www.sefaria.org/Micah.5.8?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000110', '00000000-0000-4000-d010-000000000002', 'Micah 5:9', 'https://www.sefaria.org/Micah.5.9?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000111', '00000000-0000-4000-d010-000000000002', 'Micah 5:10', 'https://www.sefaria.org/Micah.5.10?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000112', '00000000-0000-4000-d011-000000000001', 'Deuteronomy 11:22', 'https://www.sefaria.org/Deuteronomy.11.22?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000113', '00000000-0000-4000-d011-000000000001', 'Deuteronomy 11:23', 'https://www.sefaria.org/Deuteronomy.11.23?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000114', '00000000-0000-4000-d011-000000000001', 'Deuteronomy 11:24', 'https://www.sefaria.org/Deuteronomy.11.24?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000115', '00000000-0000-4000-d011-000000000001', 'Deuteronomy 11:25', 'https://www.sefaria.org/Deuteronomy.11.25?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000116', '00000000-0000-4000-d011-000000000002', 'Isaiah 49:14', 'https://www.sefaria.org/Isaiah.49.14?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000117', '00000000-0000-4000-d011-000000000002', 'Isaiah 49:15', 'https://www.sefaria.org/Isaiah.49.15?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000118', '00000000-0000-4000-d011-000000000002', 'Isaiah 49:16', 'https://www.sefaria.org/Isaiah.49.16?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000119', '00000000-0000-4000-d011-000000000002', 'Isaiah 49:17', 'https://www.sefaria.org/Isaiah.49.17?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000120', '00000000-0000-4000-d011-000000000002', 'Isaiah 49:18', 'https://www.sefaria.org/Isaiah.49.18?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000121', '00000000-0000-4000-d012-000000000001', 'Genesis 17:22', 'https://www.sefaria.org/Genesis.17.22?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000122', '00000000-0000-4000-d012-000000000001', 'Genesis 17:23', 'https://www.sefaria.org/Genesis.17.23?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000123', '00000000-0000-4000-d012-000000000001', 'Genesis 17:24', 'https://www.sefaria.org/Genesis.17.24?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000124', '00000000-0000-4000-d012-000000000001', 'Genesis 17:25', 'https://www.sefaria.org/Genesis.17.25?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000125', '00000000-0000-4000-d012-000000000001', 'Genesis 17:26', 'https://www.sefaria.org/Genesis.17.26?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000126', '00000000-0000-4000-d012-000000000001', 'Genesis 17:27', 'https://www.sefaria.org/Genesis.17.27?lang=bi', 5),
  ('00000000-0000-4000-e000-000000000127', '00000000-0000-4000-d012-000000000002', 'Isaiah 40:25', 'https://www.sefaria.org/Isaiah.40.25?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000128', '00000000-0000-4000-d012-000000000002', 'Isaiah 40:26', 'https://www.sefaria.org/Isaiah.40.26?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000129', '00000000-0000-4000-d012-000000000002', 'Isaiah 40:27', 'https://www.sefaria.org/Isaiah.40.27?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000130', '00000000-0000-4000-d012-000000000002', 'Isaiah 40:28', 'https://www.sefaria.org/Isaiah.40.28?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000131', '00000000-0000-4000-d012-000000000002', 'Isaiah 40:29', 'https://www.sefaria.org/Isaiah.40.29?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000132', '00000000-0000-4000-d012-000000000002', 'Isaiah 40:30', 'https://www.sefaria.org/Isaiah.40.30?lang=bi', 5),
  ('00000000-0000-4000-e000-000000000133', '00000000-0000-4000-d013-000000000001', 'Leviticus 5:14', 'https://www.sefaria.org/Leviticus.5.14?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000134', '00000000-0000-4000-d013-000000000001', 'Leviticus 5:15', 'https://www.sefaria.org/Leviticus.5.15?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000135', '00000000-0000-4000-d013-000000000001', 'Leviticus 5:16', 'https://www.sefaria.org/Leviticus.5.16?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000136', '00000000-0000-4000-d013-000000000001', 'Leviticus 5:17', 'https://www.sefaria.org/Leviticus.5.17?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000137', '00000000-0000-4000-d013-000000000001', 'Leviticus 5:18', 'https://www.sefaria.org/Leviticus.5.18?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000138', '00000000-0000-4000-d013-000000000001', 'Leviticus 5:19', 'https://www.sefaria.org/Leviticus.5.19?lang=bi', 5),
  ('00000000-0000-4000-e000-000000000139', '00000000-0000-4000-d013-000000000002', 'Isaiah 43:21', 'https://www.sefaria.org/Isaiah.43.21?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000140', '00000000-0000-4000-d013-000000000002', 'Isaiah 43:22', 'https://www.sefaria.org/Isaiah.43.22?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000141', '00000000-0000-4000-d013-000000000002', 'Isaiah 43:23', 'https://www.sefaria.org/Isaiah.43.23?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000142', '00000000-0000-4000-d013-000000000002', 'Isaiah 43:24', 'https://www.sefaria.org/Isaiah.43.24?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000143', '00000000-0000-4000-d013-000000000002', 'Isaiah 43:25', 'https://www.sefaria.org/Isaiah.43.25?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000144', '00000000-0000-4000-d014-000000000001', 'Numbers 7:84', 'https://www.sefaria.org/Numbers.7.84?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000145', '00000000-0000-4000-d014-000000000001', 'Numbers 7:85', 'https://www.sefaria.org/Numbers.7.85?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000146', '00000000-0000-4000-d014-000000000001', 'Numbers 7:86', 'https://www.sefaria.org/Numbers.7.86?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000147', '00000000-0000-4000-d014-000000000001', 'Numbers 7:87', 'https://www.sefaria.org/Numbers.7.87?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000148', '00000000-0000-4000-d014-000000000001', 'Numbers 7:88', 'https://www.sefaria.org/Numbers.7.88?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000149', '00000000-0000-4000-d014-000000000001', 'Numbers 7:89', 'https://www.sefaria.org/Numbers.7.89?lang=bi', 5),
  ('00000000-0000-4000-e000-000000000150', '00000000-0000-4000-d014-000000000002', 'Judges 13:2', 'https://www.sefaria.org/Judges.13.2?lang=bi', 0),
  ('00000000-0000-4000-e000-000000000151', '00000000-0000-4000-d014-000000000002', 'Judges 13:3', 'https://www.sefaria.org/Judges.13.3?lang=bi', 1),
  ('00000000-0000-4000-e000-000000000152', '00000000-0000-4000-d014-000000000002', 'Judges 13:4', 'https://www.sefaria.org/Judges.13.4?lang=bi', 2),
  ('00000000-0000-4000-e000-000000000153', '00000000-0000-4000-d014-000000000002', 'Judges 13:5', 'https://www.sefaria.org/Judges.13.5?lang=bi', 3),
  ('00000000-0000-4000-e000-000000000154', '00000000-0000-4000-d014-000000000002', 'Judges 13:6', 'https://www.sefaria.org/Judges.13.6?lang=bi', 4),
  ('00000000-0000-4000-e000-000000000155', '00000000-0000-4000-d014-000000000002', 'Judges 13:7', 'https://www.sefaria.org/Judges.13.7?lang=bi', 5),

  -- ═══════════════════════════════════════════════════════════════════════
  -- RYAN-TUTOR STUDENTS
  -- ═══════════════════════════════════════════════════════════════════════
  -- Ari Torah: Genesis 22:20-22:24 (5 verses)
  ('20000000-0000-4000-e000-000000000001', '20000000-0000-4000-d001-000000000001', 'Genesis 22:20', 'https://www.sefaria.org/Genesis.22.20?lang=bi', 1),
  ('20000000-0000-4000-e000-000000000002', '20000000-0000-4000-d001-000000000001', 'Genesis 22:21', 'https://www.sefaria.org/Genesis.22.21?lang=bi', 2),
  ('20000000-0000-4000-e000-000000000003', '20000000-0000-4000-d001-000000000001', 'Genesis 22:22', 'https://www.sefaria.org/Genesis.22.22?lang=bi', 3),
  ('20000000-0000-4000-e000-000000000004', '20000000-0000-4000-d001-000000000001', 'Genesis 22:23', 'https://www.sefaria.org/Genesis.22.23?lang=bi', 4),
  ('20000000-0000-4000-e000-000000000005', '20000000-0000-4000-d001-000000000001', 'Genesis 22:24', 'https://www.sefaria.org/Genesis.22.24?lang=bi', 5),
  -- Ari Haftarah: II Kings 4:1-4:7 (7 verses)
  ('20000000-0000-4000-e000-000000000006', '20000000-0000-4000-d001-000000000002', 'II Kings 4:1', 'https://www.sefaria.org/II_Kings.4.1?lang=bi', 1),
  ('20000000-0000-4000-e000-000000000007', '20000000-0000-4000-d001-000000000002', 'II Kings 4:2', 'https://www.sefaria.org/II_Kings.4.2?lang=bi', 2),
  ('20000000-0000-4000-e000-000000000008', '20000000-0000-4000-d001-000000000002', 'II Kings 4:3', 'https://www.sefaria.org/II_Kings.4.3?lang=bi', 3),
  ('20000000-0000-4000-e000-000000000009', '20000000-0000-4000-d001-000000000002', 'II Kings 4:4', 'https://www.sefaria.org/II_Kings.4.4?lang=bi', 4),
  ('20000000-0000-4000-e000-000000000010', '20000000-0000-4000-d001-000000000002', 'II Kings 4:5', 'https://www.sefaria.org/II_Kings.4.5?lang=bi', 5),
  ('20000000-0000-4000-e000-000000000011', '20000000-0000-4000-d001-000000000002', 'II Kings 4:6', 'https://www.sefaria.org/II_Kings.4.6?lang=bi', 6),
  ('20000000-0000-4000-e000-000000000012', '20000000-0000-4000-d001-000000000002', 'II Kings 4:7', 'https://www.sefaria.org/II_Kings.4.7?lang=bi', 7),
  -- Talia Torah: Genesis 28:5-28:9 (5 verses)
  ('20000000-0000-4000-e000-000000000013', '20000000-0000-4000-d002-000000000001', 'Genesis 28:5', 'https://www.sefaria.org/Genesis.28.5?lang=bi', 1),
  ('20000000-0000-4000-e000-000000000014', '20000000-0000-4000-d002-000000000001', 'Genesis 28:6', 'https://www.sefaria.org/Genesis.28.6?lang=bi', 2),
  ('20000000-0000-4000-e000-000000000015', '20000000-0000-4000-d002-000000000001', 'Genesis 28:7', 'https://www.sefaria.org/Genesis.28.7?lang=bi', 3),
  ('20000000-0000-4000-e000-000000000016', '20000000-0000-4000-d002-000000000001', 'Genesis 28:8', 'https://www.sefaria.org/Genesis.28.8?lang=bi', 4),
  ('20000000-0000-4000-e000-000000000017', '20000000-0000-4000-d002-000000000001', 'Genesis 28:9', 'https://www.sefaria.org/Genesis.28.9?lang=bi', 5),
  -- Talia Haftarah: Malachi 1:1-1:5 (5 verses)
  ('20000000-0000-4000-e000-000000000018', '20000000-0000-4000-d002-000000000002', 'Malachi 1:1', 'https://www.sefaria.org/Malachi.1.1?lang=bi', 1),
  ('20000000-0000-4000-e000-000000000019', '20000000-0000-4000-d002-000000000002', 'Malachi 1:2', 'https://www.sefaria.org/Malachi.1.2?lang=bi', 2),
  ('20000000-0000-4000-e000-000000000020', '20000000-0000-4000-d002-000000000002', 'Malachi 1:3', 'https://www.sefaria.org/Malachi.1.3?lang=bi', 3),
  ('20000000-0000-4000-e000-000000000021', '20000000-0000-4000-d002-000000000002', 'Malachi 1:4', 'https://www.sefaria.org/Malachi.1.4?lang=bi', 4),
  ('20000000-0000-4000-e000-000000000022', '20000000-0000-4000-d002-000000000002', 'Malachi 1:5', 'https://www.sefaria.org/Malachi.1.5?lang=bi', 5),
  -- Josh Torah: Genesis 44:14-44:17 (4 verses)
  ('20000000-0000-4000-e000-000000000023', '20000000-0000-4000-d003-000000000001', 'Genesis 44:14', 'https://www.sefaria.org/Genesis.44.14?lang=bi', 1),
  ('20000000-0000-4000-e000-000000000024', '20000000-0000-4000-d003-000000000001', 'Genesis 44:15', 'https://www.sefaria.org/Genesis.44.15?lang=bi', 2),
  ('20000000-0000-4000-e000-000000000025', '20000000-0000-4000-d003-000000000001', 'Genesis 44:16', 'https://www.sefaria.org/Genesis.44.16?lang=bi', 3),
  ('20000000-0000-4000-e000-000000000026', '20000000-0000-4000-d003-000000000001', 'Genesis 44:17', 'https://www.sefaria.org/Genesis.44.17?lang=bi', 4),
  -- Josh Haftarah: I Kings 3:15-3:21 (7 verses)
  ('20000000-0000-4000-e000-000000000027', '20000000-0000-4000-d003-000000000002', 'I Kings 3:15', 'https://www.sefaria.org/I_Kings.3.15?lang=bi', 1),
  ('20000000-0000-4000-e000-000000000028', '20000000-0000-4000-d003-000000000002', 'I Kings 3:16', 'https://www.sefaria.org/I_Kings.3.16?lang=bi', 2),
  ('20000000-0000-4000-e000-000000000029', '20000000-0000-4000-d003-000000000002', 'I Kings 3:17', 'https://www.sefaria.org/I_Kings.3.17?lang=bi', 3),
  ('20000000-0000-4000-e000-000000000030', '20000000-0000-4000-d003-000000000002', 'I Kings 3:18', 'https://www.sefaria.org/I_Kings.3.18?lang=bi', 4),
  ('20000000-0000-4000-e000-000000000031', '20000000-0000-4000-d003-000000000002', 'I Kings 3:19', 'https://www.sefaria.org/I_Kings.3.19?lang=bi', 5),
  ('20000000-0000-4000-e000-000000000032', '20000000-0000-4000-d003-000000000002', 'I Kings 3:20', 'https://www.sefaria.org/I_Kings.3.20?lang=bi', 6),
  ('20000000-0000-4000-e000-000000000033', '20000000-0000-4000-d003-000000000002', 'I Kings 3:21', 'https://www.sefaria.org/I_Kings.3.21?lang=bi', 7);


-- ============================================================================
-- PART 9: SERVICE ELEMENTS
-- ============================================================================

INSERT INTO public.service_elements (id, student_id, category, label, notes, sort_order) VALUES
  -- ═══ SYDNEY ═══
  ('2b88bb7d-2a99-4efd-bc37-6453fcf7628b', 'd608e410-ed32-4623-aa91-8069ae8ad415', 'blessings', 'Torah blessing (before)', NULL, 1),
  ('faea286a-5972-4191-9673-f41d59d13806', 'd608e410-ed32-4623-aa91-8069ae8ad415', 'blessings', 'Torah blessing (after)', NULL, 2),
  ('22b4852c-f80d-4115-b7ae-83a3572c55d0', 'd608e410-ed32-4623-aa91-8069ae8ad415', 'blessings', 'Haftarah blessing (before)', NULL, 3),
  ('4cc7e3d9-322d-4e3f-905e-98c66932d707', 'd608e410-ed32-4623-aa91-8069ae8ad415', 'blessings', 'Haftarah blessing (after #1)', NULL, 4),
  ('5a0febd6-5c7a-4692-9612-39be18e02e1f', 'd608e410-ed32-4623-aa91-8069ae8ad415', 'blessings', 'Haftarah blessing (after #2)', NULL, 5),
  ('8a736809-a5ae-4b85-bbb8-730bfa94a02c', 'd608e410-ed32-4623-aa91-8069ae8ad415', 'blessings', 'Haftarah blessing (after #3)', NULL, 6),
  ('359a3aef-7303-4f60-924d-7ad0257a15fa', 'd608e410-ed32-4623-aa91-8069ae8ad415', 'blessings', 'Haftarah blessing (after #4)', NULL, 7),
  ('9c768418-725f-49f0-9d77-5768c670885f', 'd608e410-ed32-4623-aa91-8069ae8ad415', 'service_parts', 'D''var Torah', NULL, 1),
  -- ═══ Demo students (same as v1) ═══
  ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', 'Blessings', 'Torah Blessing (Before)', NULL, 0),
  ('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-c000-000000000001', 'Blessings', 'Torah Blessing (After)', NULL, 1),
  ('00000000-0000-4000-f000-000000000003', '00000000-0000-4000-c000-000000000001', 'Blessings', 'Haftarah Blessings', NULL, 2),
  ('00000000-0000-4000-f000-000000000004', '00000000-0000-4000-c000-000000000001', 'Prayers', 'Kiddush', NULL, 3),
  ('00000000-0000-4000-f000-000000000005', '00000000-0000-4000-c000-000000000001', 'Speech', 'D''var Torah', NULL, 4),
  ('00000000-0000-4000-f000-000000000006', '00000000-0000-4000-c000-000000000002', 'Blessings', 'Torah Blessing (Before)', NULL, 0),
  ('00000000-0000-4000-f000-000000000007', '00000000-0000-4000-c000-000000000002', 'Blessings', 'Torah Blessing (After)', NULL, 1),
  ('00000000-0000-4000-f000-000000000008', '00000000-0000-4000-c000-000000000002', 'Blessings', 'Haftarah Blessings', NULL, 2),
  ('00000000-0000-4000-f000-000000000009', '00000000-0000-4000-c000-000000000002', 'Speech', 'D''var Torah', NULL, 3),
  ('00000000-0000-4000-f000-000000000010', '00000000-0000-4000-c000-000000000003', 'Blessings', 'Torah Blessing (Before)', NULL, 0),
  ('00000000-0000-4000-f000-000000000011', '00000000-0000-4000-c000-000000000003', 'Blessings', 'Torah Blessing (After)', NULL, 1),
  ('00000000-0000-4000-f000-000000000012', '00000000-0000-4000-c000-000000000003', 'Blessings', 'Haftarah Blessings', NULL, 2),
  ('00000000-0000-4000-f000-000000000013', '00000000-0000-4000-c000-000000000003', 'Prayers', 'Ein Keloheinu', NULL, 3),
  ('00000000-0000-4000-f000-000000000014', '00000000-0000-4000-c000-000000000004', 'Blessings', 'Torah Blessing (Before)', NULL, 0),
  ('00000000-0000-4000-f000-000000000015', '00000000-0000-4000-c000-000000000004', 'Blessings', 'Torah Blessing (After)', NULL, 1),
  ('00000000-0000-4000-f000-000000000016', '00000000-0000-4000-c000-000000000004', 'Blessings', 'Haftarah Blessings', NULL, 2),
  ('00000000-0000-4000-f000-000000000017', '00000000-0000-4000-c000-000000000004', 'Speech', 'D''var Torah', NULL, 3),
  ('00000000-0000-4000-f000-000000000018', '00000000-0000-4000-c000-000000000005', 'Blessings', 'Torah Blessing (Before)', NULL, 0),
  ('00000000-0000-4000-f000-000000000019', '00000000-0000-4000-c000-000000000005', 'Blessings', 'Torah Blessing (After)', NULL, 1),
  ('00000000-0000-4000-f000-000000000020', '00000000-0000-4000-c000-000000000005', 'Blessings', 'Haftarah Blessings', NULL, 2),
  ('00000000-0000-4000-f000-000000000021', '00000000-0000-4000-c000-000000000005', 'Prayers', 'Adon Olam', NULL, 3),
  ('00000000-0000-4000-f000-000000000022', '00000000-0000-4000-c000-000000000006', 'Blessings', 'Torah Blessing (Before)', NULL, 0),
  ('00000000-0000-4000-f000-000000000023', '00000000-0000-4000-c000-000000000006', 'Blessings', 'Torah Blessing (After)', NULL, 1),
  ('00000000-0000-4000-f000-000000000024', '00000000-0000-4000-c000-000000000006', 'Blessings', 'Haftarah Blessings', NULL, 2),
  ('00000000-0000-4000-f000-000000000025', '00000000-0000-4000-c000-000000000006', 'Prayers', 'Ashrei', NULL, 3),
  ('00000000-0000-4000-f000-000000000026', '00000000-0000-4000-c000-000000000006', 'Speech', 'D''var Torah', NULL, 4),
  ('00000000-0000-4000-f000-000000000027', '00000000-0000-4000-c000-000000000007', 'Blessings', 'Torah Blessing (Before)', NULL, 0),
  ('00000000-0000-4000-f000-000000000028', '00000000-0000-4000-c000-000000000007', 'Blessings', 'Torah Blessing (After)', NULL, 1),
  ('00000000-0000-4000-f000-000000000029', '00000000-0000-4000-c000-000000000007', 'Blessings', 'Haftarah Blessings', NULL, 2),
  ('00000000-0000-4000-f000-000000000030', '00000000-0000-4000-c000-000000000007', 'Speech', 'D''var Torah', NULL, 3),
  ('00000000-0000-4000-f000-000000000031', '00000000-0000-4000-c000-000000000008', 'Blessings', 'Torah Blessing (Before)', NULL, 0),
  ('00000000-0000-4000-f000-000000000032', '00000000-0000-4000-c000-000000000008', 'Blessings', 'Torah Blessing (After)', NULL, 1),
  ('00000000-0000-4000-f000-000000000033', '00000000-0000-4000-c000-000000000008', 'Blessings', 'Haftarah Blessings', NULL, 2),
  ('00000000-0000-4000-f000-000000000034', '00000000-0000-4000-c000-000000000008', 'Prayers', 'Kiddush', NULL, 3),
  ('00000000-0000-4000-f000-000000000035', '00000000-0000-4000-c000-000000000009', 'Blessings', 'Torah Blessing (Before)', NULL, 0),
  ('00000000-0000-4000-f000-000000000036', '00000000-0000-4000-c000-000000000009', 'Blessings', 'Torah Blessing (After)', NULL, 1),
  ('00000000-0000-4000-f000-000000000037', '00000000-0000-4000-c000-000000000009', 'Blessings', 'Haftarah Blessings', NULL, 2),
  ('00000000-0000-4000-f000-000000000038', '00000000-0000-4000-c000-000000000009', 'Speech', 'D''var Torah', NULL, 3),
  ('00000000-0000-4000-f000-000000000039', '00000000-0000-4000-c000-000000000010', 'Blessings', 'Torah Blessing (Before)', NULL, 0),
  ('00000000-0000-4000-f000-000000000040', '00000000-0000-4000-c000-000000000010', 'Blessings', 'Torah Blessing (After)', NULL, 1),
  ('00000000-0000-4000-f000-000000000041', '00000000-0000-4000-c000-000000000010', 'Blessings', 'Haftarah Blessings', NULL, 2),
  ('00000000-0000-4000-f000-000000000042', '00000000-0000-4000-c000-000000000010', 'Prayers', 'Adon Olam', NULL, 3),
  ('00000000-0000-4000-f000-000000000043', '00000000-0000-4000-c000-000000000010', 'Speech', 'D''var Torah', NULL, 4),
  ('00000000-0000-4000-f000-000000000044', '00000000-0000-4000-c000-000000000011', 'Blessings', 'Torah Blessing (Before)', NULL, 0),
  ('00000000-0000-4000-f000-000000000045', '00000000-0000-4000-c000-000000000011', 'Blessings', 'Torah Blessing (After)', NULL, 1),
  ('00000000-0000-4000-f000-000000000046', '00000000-0000-4000-c000-000000000011', 'Blessings', 'Haftarah Blessings', NULL, 2),
  ('00000000-0000-4000-f000-000000000047', '00000000-0000-4000-c000-000000000011', 'Prayers', 'Ein Keloheinu', NULL, 3),
  ('00000000-0000-4000-f000-000000000048', '00000000-0000-4000-c000-000000000012', 'Blessings', 'Torah Blessing (Before)', NULL, 0),
  ('00000000-0000-4000-f000-000000000049', '00000000-0000-4000-c000-000000000012', 'Blessings', 'Torah Blessing (After)', NULL, 1),
  ('00000000-0000-4000-f000-000000000050', '00000000-0000-4000-c000-000000000012', 'Blessings', 'Haftarah Blessings', NULL, 2),
  ('00000000-0000-4000-f000-000000000051', '00000000-0000-4000-c000-000000000012', 'Speech', 'D''var Torah', NULL, 3),
  ('00000000-0000-4000-f000-000000000052', '00000000-0000-4000-c000-000000000013', 'Blessings', 'Torah Blessing (Before)', NULL, 0),
  ('00000000-0000-4000-f000-000000000053', '00000000-0000-4000-c000-000000000013', 'Blessings', 'Torah Blessing (After)', NULL, 1),
  ('00000000-0000-4000-f000-000000000054', '00000000-0000-4000-c000-000000000013', 'Blessings', 'Haftarah Blessings', NULL, 2),
  ('00000000-0000-4000-f000-000000000055', '00000000-0000-4000-c000-000000000013', 'Prayers', 'Kiddush', NULL, 3),
  ('00000000-0000-4000-f000-000000000056', '00000000-0000-4000-c000-000000000014', 'Blessings', 'Torah Blessing (Before)', NULL, 0),
  ('00000000-0000-4000-f000-000000000057', '00000000-0000-4000-c000-000000000014', 'Blessings', 'Torah Blessing (After)', NULL, 1),
  ('00000000-0000-4000-f000-000000000058', '00000000-0000-4000-c000-000000000014', 'Blessings', 'Haftarah Blessings', NULL, 2),
  ('00000000-0000-4000-f000-000000000059', '00000000-0000-4000-c000-000000000014', 'Prayers', 'Ashrei', NULL, 3),
  ('00000000-0000-4000-f000-000000000060', '00000000-0000-4000-c000-000000000014', 'Speech', 'D''var Torah', NULL, 4),

  -- ═══ Ryan-tutor student service elements ═══
  -- Ari
  ('20000000-0000-4000-f000-000000000001', '20000000-0000-4000-c000-000000000001', 'blessings', 'Torah blessing (before)', NULL, 1),
  ('20000000-0000-4000-f000-000000000002', '20000000-0000-4000-c000-000000000001', 'blessings', 'Torah blessing (after)', NULL, 2),
  ('20000000-0000-4000-f000-000000000003', '20000000-0000-4000-c000-000000000001', 'blessings', 'Haftarah blessing (before)', NULL, 3),
  ('20000000-0000-4000-f000-000000000004', '20000000-0000-4000-c000-000000000001', 'blessings', 'Haftarah blessing (after)', NULL, 4),
  ('20000000-0000-4000-f000-000000000005', '20000000-0000-4000-c000-000000000001', 'service_parts', 'D''var Torah', NULL, 1),
  -- Talia
  ('20000000-0000-4000-f000-000000000006', '20000000-0000-4000-c000-000000000002', 'blessings', 'Torah blessing (before)', NULL, 1),
  ('20000000-0000-4000-f000-000000000007', '20000000-0000-4000-c000-000000000002', 'blessings', 'Torah blessing (after)', NULL, 2),
  ('20000000-0000-4000-f000-000000000008', '20000000-0000-4000-c000-000000000002', 'blessings', 'Haftarah blessing (before)', NULL, 3),
  ('20000000-0000-4000-f000-000000000009', '20000000-0000-4000-c000-000000000002', 'blessings', 'Haftarah blessing (after)', NULL, 4),
  ('20000000-0000-4000-f000-000000000010', '20000000-0000-4000-c000-000000000002', 'service_parts', 'D''var Torah', NULL, 1),
  -- Josh
  ('20000000-0000-4000-f000-000000000011', '20000000-0000-4000-c000-000000000003', 'blessings', 'Torah blessing (before)', NULL, 1),
  ('20000000-0000-4000-f000-000000000012', '20000000-0000-4000-c000-000000000003', 'blessings', 'Torah blessing (after)', NULL, 2),
  ('20000000-0000-4000-f000-000000000013', '20000000-0000-4000-c000-000000000003', 'blessings', 'Haftarah blessing (before)', NULL, 3),
  ('20000000-0000-4000-f000-000000000014', '20000000-0000-4000-c000-000000000003', 'blessings', 'Haftarah blessing (after)', NULL, 4),
  ('20000000-0000-4000-f000-000000000015', '20000000-0000-4000-c000-000000000003', 'service_parts', 'D''var Torah', NULL, 1);


-- ============================================================================
-- PART 10: SESSIONS
-- ============================================================================

INSERT INTO public.sessions (
  id, student_id, tutor_id, session_date,
  next_session_date, next_session_time,
  homework_notes, homework_minutes_per_day
) VALUES
  -- ═══ SYDNEY (5 sessions, tutor Rachel, ~4 months from Bat Mitzvah) ═══
  ('10000000-0000-4000-8000-000000000001', 'd608e410-ed32-4623-aa91-8069ae8ad415', '00000000-0000-4000-a000-000000000003',
   '2026-01-11', '2026-02-15', '16:00', 'Great first session! Started Chamishi. Practice Gen 9:8-12 with trope recording.', 15),
  ('10000000-0000-4000-8000-000000000002', 'd608e410-ed32-4623-aa91-8069ae8ad415', '00000000-0000-4000-a000-000000000003',
   '2026-02-15', '2026-03-22', '16:00', 'Chamishi sounding great. Finished all 10 verses. Started Maftir.', 15),
  ('10000000-0000-4000-8000-000000000003', 'd608e410-ed32-4623-aa91-8069ae8ad415', '00000000-0000-4000-a000-000000000003',
   '2026-03-22', '2026-04-26', '16:00', 'Chamishi nearly mastered. Maftir solid. Beginning Haftarah Isaiah 54.', 20),
  ('10000000-0000-4000-8000-000000000004', 'd608e410-ed32-4623-aa91-8069ae8ad415', '00000000-0000-4000-a000-000000000003',
   '2026-04-26', '2026-06-07', '16:00', 'Haftarah through verse 10. Started Shishi. Blessings coming along.', 20),
  ('10000000-0000-4000-8000-000000000005', 'd608e410-ed32-4623-aa91-8069ae8ad415', '00000000-0000-4000-a000-000000000003',
   '2026-06-07', '2026-07-12', '16:00', 'Strong progress across the board. Continue Haftarah and Shishi. Start D''var Torah outline.', 20),

  -- ═══ Demo students (same as v1) ═══
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001',
   '2026-01-11', '2026-02-08', '16:00', 'Practice Genesis 8:15-17 with trope recordings.', 15),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001',
   '2026-02-08', '2026-03-15', '16:00', 'Review Torah portion. Start Haftarah verses 1-2.', 15),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001',
   '2026-03-15', '2026-04-19', '16:00', 'Full Torah review. Continue Haftarah through verse 4.', 20),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001',
   '2026-04-19', '2026-06-07', '16:00', 'Polish Torah chanting. Finish all Haftarah verses.', 20),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001',
   '2026-06-07', '2026-07-12', '16:00', 'Full run-through. Start Torah-side practice.', 20),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000001',
   '2026-02-15', '2026-03-22', '15:00', 'Begin Torah portion Genesis 25:1-3.', 15),
  ('00000000-0000-4000-8000-000000000007', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000001',
   '2026-03-22', '2026-05-10', '15:00', 'Continue Torah. Start Haftarah.', 15),
  ('00000000-0000-4000-8000-000000000008', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000001',
   '2026-05-10', '2026-06-14', '15:00', 'Review all Torah verses. Haftarah verses 1-3.', 20),
  ('00000000-0000-4000-8000-000000000009', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000002',
   '2026-04-05', '2026-05-17', '14:30', 'Introduction to trope. Start Exodus 6:2-4.', 10),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000002',
   '2026-05-17', '2026-06-28', '14:30', 'Review verses 2-4. Begin verses 5-6.', 15),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000002',
   '2026-06-01', '2026-07-06', '15:30', 'First session! Learn alef-bet of trope. Listen to recordings.', 10),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000001',
   '2025-06-15', '2025-08-10', '16:00', 'Good start on Torah and Haftarah.', 15),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000001',
   '2025-10-12', NULL, NULL, 'Final review. Ready for the big day!', 20),
  ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-c000-000000000008', '00000000-0000-4000-a000-000000000002',
   '2025-08-20', '2025-10-15', '14:00', 'Strong Haftarah reader. Torah needs polish.', 15),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-c000-000000000008', '00000000-0000-4000-a000-000000000002',
   '2025-11-30', NULL, NULL, 'Everything sounds great. Confident and ready.', 20),
  ('00000000-0000-4000-8000-000000000016', '00000000-0000-4000-c000-000000000009', '00000000-0000-4000-a000-000000000001',
   '2025-09-14', '2025-11-16', '16:30', 'Working through Torah and Haftarah portions.', 15),
  ('00000000-0000-4000-8000-000000000017', '00000000-0000-4000-c000-000000000009', '00000000-0000-4000-a000-000000000001',
   '2026-01-25', NULL, NULL, 'Final session. All polished.', 20),
  ('00000000-0000-4000-8000-000000000018', '00000000-0000-4000-c000-000000000010', '00000000-0000-4000-a000-000000000003',
   '2025-10-19', '2025-12-07', '15:00', 'Starting Torah portion. Numbers 25:1-3.', 15),
  ('00000000-0000-4000-8000-000000000019', '00000000-0000-4000-c000-000000000010', '00000000-0000-4000-a000-000000000003',
   '2025-12-07', '2026-02-08', '15:00', 'Torah sounding good. Begin Haftarah.', 15),
  ('00000000-0000-4000-8000-000000000020', '00000000-0000-4000-c000-000000000010', '00000000-0000-4000-a000-000000000003',
   '2026-02-08', '2026-04-12', '15:00', 'Full review of all verses. Blessings practice.', 20),
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-c000-000000000010', '00000000-0000-4000-a000-000000000003',
   '2026-05-31', '2026-06-28', '15:00', 'Almost there! Polish run-through.', 20),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-c000-000000000011', '00000000-0000-4000-a000-000000000002',
   '2026-01-18', '2026-03-01', '14:00', 'Late start but catching up. Deuteronomy 11:22-23.', 15),
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-c000-000000000011', '00000000-0000-4000-a000-000000000002',
   '2026-03-01', '2026-05-03', '14:00', 'Torah improving. Start Haftarah.', 15),
  ('00000000-0000-4000-8000-000000000024', '00000000-0000-4000-c000-000000000011', '00000000-0000-4000-a000-000000000002',
   '2026-05-03', '2026-06-14', '14:00', 'Continue building on both portions.', 20),
  ('00000000-0000-4000-8000-000000000025', '00000000-0000-4000-c000-000000000012', '00000000-0000-4000-a000-000000000001',
   '2024-07-14', '2024-09-15', '16:00', 'Strong start.', 15),
  ('00000000-0000-4000-8000-000000000026', '00000000-0000-4000-c000-000000000012', '00000000-0000-4000-a000-000000000001',
   '2024-10-27', NULL, NULL, 'Ready to go!', 20),
  ('00000000-0000-4000-8000-000000000027', '00000000-0000-4000-c000-000000000013', '00000000-0000-4000-a000-000000000002',
   '2024-10-20', '2024-12-15', '14:00', 'Working through all portions.', 15),
  ('00000000-0000-4000-8000-000000000028', '00000000-0000-4000-c000-000000000013', '00000000-0000-4000-a000-000000000002',
   '2025-02-23', NULL, NULL, 'Final review. Great job.', 20),
  ('00000000-0000-4000-8000-000000000029', '00000000-0000-4000-c000-000000000014', '00000000-0000-4000-a000-000000000003',
   '2025-02-09', '2025-04-13', '15:00', 'Numbers and Judges portions. Good progress.', 15),
  ('00000000-0000-4000-8000-000000000030', '00000000-0000-4000-c000-000000000014', '00000000-0000-4000-a000-000000000003',
   '2025-05-25', NULL, NULL, 'Final session. Beautiful reading.', 20),

  -- ═══ Ryan-tutor sessions ═══
  -- Ari (3 sessions)
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-c000-000000000001', '2781d8d8-079d-483a-afd3-7f955fbf8eda',
   '2026-03-15', '2026-04-19', '16:30',
   'Great first session. Ari picked up the trope for Gen 22:20-22 right away. Practice with recording daily.', 15),
  ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-c000-000000000001', '2781d8d8-079d-483a-afd3-7f955fbf8eda',
   '2026-04-19', '2026-05-31', '16:30',
   'Torah portion sounding solid. Started Haftarah. Keep up the daily practice routine.', 15),
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-c000-000000000001', '2781d8d8-079d-483a-afd3-7f955fbf8eda',
   '2026-05-31', '2026-07-12', '16:30',
   'Torah nearly mastered. Haftarah coming along well. Started Torah blessings.', 20),
  -- Talia (2 sessions)
  ('20000000-0000-4000-8000-000000000004', '20000000-0000-4000-c000-000000000002', '2781d8d8-079d-483a-afd3-7f955fbf8eda',
   '2026-04-12', '2026-05-24', '15:00',
   'Talia has a great ear for the melody from her music background. Hebrew reading needs practice. Focus on Gen 28:5-7 this month.', 15),
  ('20000000-0000-4000-8000-000000000005', '20000000-0000-4000-c000-000000000002', '2781d8d8-079d-483a-afd3-7f955fbf8eda',
   '2026-05-24', '2026-07-05', '15:00',
   'Good improvement on Hebrew fluency. Finished all Torah verses. Starting Haftarah next session.', 15),
  -- Josh (1 session)
  ('20000000-0000-4000-8000-000000000006', '20000000-0000-4000-c000-000000000003', '2781d8d8-079d-483a-afd3-7f955fbf8eda',
   '2026-06-01', '2026-07-13', '14:00',
   'Intro session. Went over trope basics and listened to Gen 44:14-15. Great attitude, excited to learn.', 10);


-- ============================================================================
-- PART 11: SESSION VERSE PROGRESS
-- ============================================================================

INSERT INTO public.session_verse_progress (session_id, verse_id, status, quality) VALUES
  -- ═══════════════════════════════════════════════════════════════════
  -- SYDNEY — Session 1 (Jan 11): Chamishi v1-v5, new/learning
  -- ═══════════════════════════════════════════════════════════════════
  ('10000000-0000-4000-8000-000000000001', '61e4e1b6-81ae-42cd-bdc6-de13e50f5010', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000001', '071b1e46-ae52-4c7c-a285-4c2e32742de9', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000001', 'e9192f98-d619-409c-a9fa-63ebbeb53e7b', 'new', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000001', '3c886074-cd58-4147-afc6-fc1dc73b7a37', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000001', 'c8933c63-5476-4ed2-8c74-81fabcad5e1e', 'new', 'still_learning'),

  -- Sydney Session 2 (Feb 15): Chamishi all 10 improving, Maftir started
  ('10000000-0000-4000-8000-000000000002', '61e4e1b6-81ae-42cd-bdc6-de13e50f5010', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000002', '071b1e46-ae52-4c7c-a285-4c2e32742de9', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000002', 'e9192f98-d619-409c-a9fa-63ebbeb53e7b', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000002', '3c886074-cd58-4147-afc6-fc1dc73b7a37', 'review', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000002', 'c8933c63-5476-4ed2-8c74-81fabcad5e1e', 'review', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000002', '54ea939a-e357-4476-a049-f7adb3d95f5b', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000002', '00782ca1-2a2e-4119-ac7c-6be62e9a0b51', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000002', 'd7a68008-e065-4f3e-a51b-8752dccb64c0', 'new', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000002', 'bc04e34f-e83a-4eb5-b205-106d36902571', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000002', '4b94ea30-a09e-4dcb-9864-2bf516e8e165', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000002', '98913c5f-3b8a-4f4a-bf77-dee285889f17', 'new', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000002', '65179220-3c29-4c9c-b39a-e3cf2ef54da5', 'new', 'still_learning'),

  -- Sydney Session 3 (Mar 22): Chamishi near-perfect, Maftir solid, Haftarah started
  ('10000000-0000-4000-8000-000000000003', '61e4e1b6-81ae-42cd-bdc6-de13e50f5010', 'review', 'perfect'),
  ('10000000-0000-4000-8000-000000000003', '071b1e46-ae52-4c7c-a285-4c2e32742de9', 'review', 'perfect'),
  ('10000000-0000-4000-8000-000000000003', 'e9192f98-d619-409c-a9fa-63ebbeb53e7b', 'review', 'perfect'),
  ('10000000-0000-4000-8000-000000000003', '3c886074-cd58-4147-afc6-fc1dc73b7a37', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000003', 'c8933c63-5476-4ed2-8c74-81fabcad5e1e', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000003', '54ea939a-e357-4476-a049-f7adb3d95f5b', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000003', '00782ca1-2a2e-4119-ac7c-6be62e9a0b51', 'review', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000003', 'd7a68008-e065-4f3e-a51b-8752dccb64c0', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000003', 'bc04e34f-e83a-4eb5-b205-106d36902571', 'review', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000003', '4b94ea30-a09e-4dcb-9864-2bf516e8e165', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000003', '98913c5f-3b8a-4f4a-bf77-dee285889f17', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000003', '65179220-3c29-4c9c-b39a-e3cf2ef54da5', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000003', '417ca704-6056-4acc-974a-650d90fa9f97', 'review', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000003', '0cba24da-fff0-4aaf-8a4a-cddc0fbce206', 'review', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000003', 'e2e211dd-5521-421b-b005-0655ac540a58', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000003', '69a4497f-026a-4d15-aeb0-a15bc923d816', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000003', '2768d1e7-d4f1-4104-bb16-7675c74064ea', 'new', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000003', '9e963126-0611-46f7-a3c9-1803d1e38af9', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000003', 'ad7f5300-e98a-4ba4-a172-608f9aebe568', 'new', 'still_learning'),

  -- Sydney Session 4 (Apr 26): Chamishi mastered, Haftarah through v10, Shishi started
  ('10000000-0000-4000-8000-000000000004', '61e4e1b6-81ae-42cd-bdc6-de13e50f5010', 'torah_side', 'perfect'),
  ('10000000-0000-4000-8000-000000000004', '071b1e46-ae52-4c7c-a285-4c2e32742de9', 'torah_side', 'perfect'),
  ('10000000-0000-4000-8000-000000000004', 'e9192f98-d619-409c-a9fa-63ebbeb53e7b', 'torah_side', 'perfect'),
  ('10000000-0000-4000-8000-000000000004', '3c886074-cd58-4147-afc6-fc1dc73b7a37', 'torah_side', 'perfect'),
  ('10000000-0000-4000-8000-000000000004', 'c8933c63-5476-4ed2-8c74-81fabcad5e1e', 'torah_side', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000004', '54ea939a-e357-4476-a049-f7adb3d95f5b', 'torah_side', 'perfect'),
  ('10000000-0000-4000-8000-000000000004', '00782ca1-2a2e-4119-ac7c-6be62e9a0b51', 'torah_side', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000004', 'd7a68008-e065-4f3e-a51b-8752dccb64c0', 'torah_side', 'perfect'),
  ('10000000-0000-4000-8000-000000000004', 'bc04e34f-e83a-4eb5-b205-106d36902571', 'torah_side', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000004', '4b94ea30-a09e-4dcb-9864-2bf516e8e165', 'torah_side', 'perfect'),
  ('10000000-0000-4000-8000-000000000004', '98913c5f-3b8a-4f4a-bf77-dee285889f17', 'torah_side', 'perfect'),
  ('10000000-0000-4000-8000-000000000004', '65179220-3c29-4c9c-b39a-e3cf2ef54da5', 'torah_side', 'perfect'),
  ('10000000-0000-4000-8000-000000000004', '417ca704-6056-4acc-974a-650d90fa9f97', 'torah_side', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000004', '0cba24da-fff0-4aaf-8a4a-cddc0fbce206', 'torah_side', 'perfect'),
  ('10000000-0000-4000-8000-000000000004', 'e2e211dd-5521-421b-b005-0655ac540a58', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000004', '69a4497f-026a-4d15-aeb0-a15bc923d816', 'review', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000004', '2768d1e7-d4f1-4104-bb16-7675c74064ea', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000004', '9e963126-0611-46f7-a3c9-1803d1e38af9', 'review', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000004', 'ad7f5300-e98a-4ba4-a172-608f9aebe568', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000004', 'a28dae02-abee-4fdc-aa1b-5e695d7060ea', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000004', '300eea80-b18d-4018-b1ce-dd5c0e3499e2', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000004', 'b8d4fd50-240a-49ae-9038-a8526ed32290', 'new', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000004', '241d2918-5967-4f0f-b30e-6bd601a6b511', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000004', '3ecd619e-73dd-44b4-beb3-2dca7f8b3643', 'new', 'still_learning'),
  -- Shishi first 5 verses
  ('10000000-0000-4000-8000-000000000004', 'a6e2f0f9-33f8-4f39-b621-1e96997ff52a', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000004', 'af3b72c2-28f6-4761-a92f-094fb21b9e8e', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000004', '6f74dfb0-9996-4eed-ac73-9f18643574a9', 'new', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000004', '733b7a23-7cd7-4830-8da8-3af6f4804b6c', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000004', '3e11fe62-c4b9-49af-b75e-b2a39c06e7e8', 'new', 'still_learning'),

  -- Sydney Session 5 (Jun 7): Haftarah improving, Shishi expanding
  ('10000000-0000-4000-8000-000000000005', 'e2e211dd-5521-421b-b005-0655ac540a58', 'review', 'perfect'),
  ('10000000-0000-4000-8000-000000000005', '69a4497f-026a-4d15-aeb0-a15bc923d816', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000005', '2768d1e7-d4f1-4104-bb16-7675c74064ea', 'review', 'perfect'),
  ('10000000-0000-4000-8000-000000000005', '9e963126-0611-46f7-a3c9-1803d1e38af9', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000005', 'ad7f5300-e98a-4ba4-a172-608f9aebe568', 'review', 'perfect'),
  ('10000000-0000-4000-8000-000000000005', 'a28dae02-abee-4fdc-aa1b-5e695d7060ea', 'review', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000005', '300eea80-b18d-4018-b1ce-dd5c0e3499e2', 'review', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000005', 'b8d4fd50-240a-49ae-9038-a8526ed32290', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000005', '241d2918-5967-4f0f-b30e-6bd601a6b511', 'review', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000005', '3ecd619e-73dd-44b4-beb3-2dca7f8b3643', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000005', '26d37c92-fd7b-4ee0-8565-b17c74c4fa35', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000005', '06903869-783a-43f5-b20d-27cf91d3f58d', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000005', 'c28d6136-9af6-44fc-bc6b-8a83522b7894', 'new', 'moderate_mistakes'),
  -- Shishi continuing
  ('10000000-0000-4000-8000-000000000005', 'a6e2f0f9-33f8-4f39-b621-1e96997ff52a', 'review', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000005', 'af3b72c2-28f6-4761-a92f-094fb21b9e8e', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000005', '6f74dfb0-9996-4eed-ac73-9f18643574a9', 'review', 'minor_mistakes'),
  ('10000000-0000-4000-8000-000000000005', '733b7a23-7cd7-4830-8da8-3af6f4804b6c', 'review', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000005', '3e11fe62-c4b9-49af-b75e-b2a39c06e7e8', 'review', 'moderate_mistakes'),
  ('10000000-0000-4000-8000-000000000005', 'edc507ab-e70c-4bfe-8f50-fc26d17a85a7', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000005', '6a79f9cc-805a-4177-baed-4522e5e922d2', 'new', 'still_learning'),
  ('10000000-0000-4000-8000-000000000005', '8ed11087-e05d-4bb3-87ab-51bdf99db367', 'new', 'moderate_mistakes'),

  -- ═══ DEMO STUDENTS (same progress as v1 — abbreviated for key students) ═══
  -- Ethan sessions 1-5
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-e000-000000000001', 'new', 'still_learning'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-e000-000000000002', 'new', 'still_learning'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-e000-000000000003', 'new', 'moderate_mistakes'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-e000-000000000001', 'review', 'minor_mistakes'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-e000-000000000002', 'review', 'moderate_mistakes'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-e000-000000000003', 'review', 'minor_mistakes'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-e000-000000000004', 'new', 'still_learning'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-e000-000000000005', 'new', 'still_learning'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-e000-000000000001', 'torah_side', 'perfect'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-e000-000000000002', 'torah_side', 'perfect'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-e000-000000000003', 'torah_side', 'perfect'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-e000-000000000004', 'torah_side', 'minor_mistakes'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-e000-000000000005', 'torah_side', 'perfect'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-e000-000000000006', 'review', 'perfect'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-e000-000000000007', 'review', 'perfect'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-e000-000000000008', 'review', 'minor_mistakes'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-e000-000000000009', 'review', 'perfect'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-e000-000000000010', 'review', 'minor_mistakes'),
  -- Maya
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-e000-000000000011', 'new', 'still_learning'),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-e000-000000000012', 'new', 'still_learning'),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-e000-000000000013', 'new', 'moderate_mistakes'),
  ('00000000-0000-4000-8000-000000000008', '00000000-0000-4000-e000-000000000011', 'review', 'minor_mistakes'),
  ('00000000-0000-4000-8000-000000000008', '00000000-0000-4000-e000-000000000012', 'review', 'perfect'),
  ('00000000-0000-4000-8000-000000000008', '00000000-0000-4000-e000-000000000013', 'review', 'minor_mistakes'),
  -- Noah
  ('00000000-0000-4000-8000-000000000009', '00000000-0000-4000-e000-000000000022', 'new', 'still_learning'),
  ('00000000-0000-4000-8000-000000000009', '00000000-0000-4000-e000-000000000023', 'new', 'still_learning'),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-e000-000000000022', 'review', 'moderate_mistakes'),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-e000-000000000023', 'review', 'moderate_mistakes'),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-e000-000000000024', 'new', 'still_learning'),
  -- Lily
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-e000-000000000034', 'new', 'still_learning'),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-e000-000000000035', 'new', 'still_learning'),
  -- Ben final
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-e000-000000000068', 'torah_side', 'perfect'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-e000-000000000069', 'torah_side', 'perfect'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-e000-000000000070', 'torah_side', 'perfect'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-e000-000000000071', 'torah_side', 'perfect'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-e000-000000000072', 'torah_side', 'perfect'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-e000-000000000073', 'review', 'perfect'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-e000-000000000074', 'review', 'perfect'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-e000-000000000075', 'review', 'perfect'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-e000-000000000076', 'review', 'perfect'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-e000-000000000077', 'review', 'perfect'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-e000-000000000078', 'review', 'perfect'),
  -- Ava final
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-e000-000000000079', 'torah_side', 'perfect'),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-e000-000000000080', 'torah_side', 'perfect'),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-e000-000000000081', 'torah_side', 'perfect'),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-e000-000000000082', 'torah_side', 'perfect'),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-e000-000000000083', 'torah_side', 'perfect'),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-e000-000000000084', 'review', 'perfect'),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-e000-000000000085', 'review', 'perfect'),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-e000-000000000086', 'review', 'perfect'),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-e000-000000000087', 'review', 'perfect'),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-e000-000000000088', 'review', 'perfect'),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-e000-000000000089', 'review', 'perfect'),

  -- ═══ Ryan-tutor student verse progress ═══
  -- Ari Session 1 (Mar 15): Torah v1-3 new
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-e000-000000000001', 'new', 'moderate_mistakes'),
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-e000-000000000002', 'new', 'still_learning'),
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-e000-000000000003', 'new', 'still_learning'),
  -- Ari Session 2 (Apr 19): Torah improving, Haftarah started
  ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-e000-000000000001', 'review', 'minor_mistakes'),
  ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-e000-000000000002', 'review', 'minor_mistakes'),
  ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-e000-000000000003', 'review', 'moderate_mistakes'),
  ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-e000-000000000004', 'new', 'still_learning'),
  ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-e000-000000000005', 'new', 'still_learning'),
  ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-e000-000000000006', 'new', 'still_learning'),
  ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-e000-000000000007', 'new', 'still_learning'),
  -- Ari Session 3 (May 31): Torah nearly mastered, Haftarah growing
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-e000-000000000001', 'review', 'perfect'),
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-e000-000000000002', 'review', 'perfect'),
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-e000-000000000003', 'review', 'minor_mistakes'),
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-e000-000000000004', 'review', 'minor_mistakes'),
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-e000-000000000005', 'review', 'moderate_mistakes'),
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-e000-000000000006', 'review', 'moderate_mistakes'),
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-e000-000000000007', 'review', 'minor_mistakes'),
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-e000-000000000008', 'new', 'still_learning'),
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-e000-000000000009', 'new', 'still_learning'),
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-e000-000000000010', 'new', 'moderate_mistakes'),
  -- Talia Session 1 (Apr 12): Torah v1-3 new
  ('20000000-0000-4000-8000-000000000004', '20000000-0000-4000-e000-000000000013', 'new', 'moderate_mistakes'),
  ('20000000-0000-4000-8000-000000000004', '20000000-0000-4000-e000-000000000014', 'new', 'still_learning'),
  ('20000000-0000-4000-8000-000000000004', '20000000-0000-4000-e000-000000000015', 'new', 'still_learning'),
  -- Talia Session 2 (May 24): Torah all 5, improving
  ('20000000-0000-4000-8000-000000000005', '20000000-0000-4000-e000-000000000013', 'review', 'minor_mistakes'),
  ('20000000-0000-4000-8000-000000000005', '20000000-0000-4000-e000-000000000014', 'review', 'moderate_mistakes'),
  ('20000000-0000-4000-8000-000000000005', '20000000-0000-4000-e000-000000000015', 'review', 'moderate_mistakes'),
  ('20000000-0000-4000-8000-000000000005', '20000000-0000-4000-e000-000000000016', 'new', 'still_learning'),
  ('20000000-0000-4000-8000-000000000005', '20000000-0000-4000-e000-000000000017', 'new', 'still_learning'),
  -- Josh Session 1 (Jun 1): Torah v1-2
  ('20000000-0000-4000-8000-000000000006', '20000000-0000-4000-e000-000000000023', 'new', 'still_learning'),
  ('20000000-0000-4000-8000-000000000006', '20000000-0000-4000-e000-000000000024', 'new', 'still_learning');


-- ============================================================================
-- PART 12: SESSION ELEMENT PROGRESS
-- ============================================================================

INSERT INTO public.session_element_progress (session_id, element_id, quality, notes) VALUES
  -- ═══ SYDNEY ═══
  ('10000000-0000-4000-8000-000000000001', '2b88bb7d-2a99-4efd-bc37-6453fcf7628b', 'still_learning', 'Learning the melody'),
  ('10000000-0000-4000-8000-000000000002', '2b88bb7d-2a99-4efd-bc37-6453fcf7628b', 'moderate_mistakes', NULL),
  ('10000000-0000-4000-8000-000000000002', 'faea286a-5972-4191-9673-f41d59d13806', 'still_learning', NULL),
  ('10000000-0000-4000-8000-000000000003', '2b88bb7d-2a99-4efd-bc37-6453fcf7628b', 'perfect', NULL),
  ('10000000-0000-4000-8000-000000000003', 'faea286a-5972-4191-9673-f41d59d13806', 'minor_mistakes', NULL),
  ('10000000-0000-4000-8000-000000000003', '22b4852c-f80d-4115-b7ae-83a3572c55d0', 'still_learning', 'Started Haftarah blessings'),
  ('10000000-0000-4000-8000-000000000004', '2b88bb7d-2a99-4efd-bc37-6453fcf7628b', 'perfect', NULL),
  ('10000000-0000-4000-8000-000000000004', 'faea286a-5972-4191-9673-f41d59d13806', 'perfect', NULL),
  ('10000000-0000-4000-8000-000000000004', '22b4852c-f80d-4115-b7ae-83a3572c55d0', 'minor_mistakes', NULL),
  ('10000000-0000-4000-8000-000000000004', '4cc7e3d9-322d-4e3f-905e-98c66932d707', 'still_learning', NULL),
  ('10000000-0000-4000-8000-000000000004', '5a0febd6-5c7a-4692-9612-39be18e02e1f', 'still_learning', NULL),
  ('10000000-0000-4000-8000-000000000005', '2b88bb7d-2a99-4efd-bc37-6453fcf7628b', 'perfect', NULL),
  ('10000000-0000-4000-8000-000000000005', 'faea286a-5972-4191-9673-f41d59d13806', 'perfect', NULL),
  ('10000000-0000-4000-8000-000000000005', '22b4852c-f80d-4115-b7ae-83a3572c55d0', 'perfect', NULL),
  ('10000000-0000-4000-8000-000000000005', '4cc7e3d9-322d-4e3f-905e-98c66932d707', 'moderate_mistakes', NULL),
  ('10000000-0000-4000-8000-000000000005', '5a0febd6-5c7a-4692-9612-39be18e02e1f', 'moderate_mistakes', NULL),
  ('10000000-0000-4000-8000-000000000005', '8a736809-a5ae-4b85-bbb8-730bfa94a02c', 'still_learning', NULL),
  ('10000000-0000-4000-8000-000000000005', '9c768418-725f-49f0-9d77-5768c670885f', 'still_learning', 'Started discussing D''var Torah themes'),
  -- ═══ Demo students (key entries) ═══
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-f000-000000000001', 'perfect', NULL),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-f000-000000000002', 'perfect', NULL),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-f000-000000000003', 'perfect', NULL),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-f000-000000000004', 'minor_mistakes', NULL),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-f000-000000000027', 'perfect', NULL),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-f000-000000000028', 'perfect', NULL),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-f000-000000000029', 'perfect', NULL),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-f000-000000000030', 'perfect', NULL),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-f000-000000000031', 'perfect', NULL),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-f000-000000000032', 'perfect', NULL),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-f000-000000000033', 'perfect', NULL),
  ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-f000-000000000034', 'perfect', NULL),

  -- ═══ Ryan-tutor student element progress ═══
  -- Ari Session 2: started Torah blessings
  ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-f000-000000000001', 'still_learning', 'Introduced the melody'),
  -- Ari Session 3: blessings improving
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-f000-000000000001', 'moderate_mistakes', NULL),
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-f000-000000000002', 'still_learning', NULL),
  -- Talia Session 2: started Torah before
  ('20000000-0000-4000-8000-000000000005', '20000000-0000-4000-f000-000000000006', 'still_learning', 'Good ear for the melody');


-- ============================================================================
-- PART 13: HOMEWORK ITEMS
-- ============================================================================

INSERT INTO public.homework_items (session_id, item_type, description, completed) VALUES
  -- ═══ SYDNEY ═══
  ('10000000-0000-4000-8000-000000000001', 'practice', 'Practice Genesis 9:8-12 with trope recording daily', true),
  ('10000000-0000-4000-8000-000000000001', 'listen', 'Listen to full Chamishi recording once through', true),
  ('10000000-0000-4000-8000-000000000002', 'practice', 'Review all Chamishi verses. Start Maftir with recording.', true),
  ('10000000-0000-4000-8000-000000000002', 'practice', 'Practice Torah blessings melody', true),
  ('10000000-0000-4000-8000-000000000003', 'practice', 'Full Chamishi + Maftir run-through daily. Begin Isaiah 54:1-5.', true),
  ('10000000-0000-4000-8000-000000000003', 'listen', 'Listen to Haftarah recording twice this week', false),
  ('10000000-0000-4000-8000-000000000004', 'practice', 'Continue Haftarah daily. Start reading Shishi with trope.', false),
  ('10000000-0000-4000-8000-000000000004', 'practice', 'Practice all Haftarah blessings', false),
  ('10000000-0000-4000-8000-000000000005', 'practice', 'Full review: Chamishi + Maftir from tikkun, Haftarah + Shishi from recording', false),
  ('10000000-0000-4000-8000-000000000005', 'write', 'Begin D''var Torah outline. What does the rainbow covenant mean to you?', false),
  -- ═══ Demo students ═══
  ('00000000-0000-4000-8000-000000000001', 'practice', 'Practice Genesis 8:15-17 with trope recording 3x', true),
  ('00000000-0000-4000-8000-000000000001', 'listen', 'Listen to full Torah portion recording', true),
  ('00000000-0000-4000-8000-000000000005', 'practice', 'Practice reading from tikkun (Torah-side)', false),
  ('00000000-0000-4000-8000-000000000005', 'write', 'Continue working on D''var Torah draft', false),
  ('00000000-0000-4000-8000-000000000006', 'practice', 'Practice Genesis 25:1-3 with recording daily', false),
  ('00000000-0000-4000-8000-000000000009', 'listen', 'Listen to Shemot trope recording 3x', true),
  ('00000000-0000-4000-8000-000000000011', 'listen', 'Listen to Ki Tisa portion recording', false),
  ('00000000-0000-4000-8000-000000000011', 'practice', 'Practice trope signs with handout', false),

  -- ═══ Ryan-tutor student homework ═══
  -- Ari
  ('20000000-0000-4000-8000-000000000001', 'practice', 'Practice Genesis 22:20-22 with trope recording daily', true),
  ('20000000-0000-4000-8000-000000000001', 'listen', 'Listen to full Maftir recording once through', true),
  ('20000000-0000-4000-8000-000000000002', 'practice', 'Review all Torah verses. Start II Kings 4:1-2 with recording.', true),
  ('20000000-0000-4000-8000-000000000002', 'practice', 'Practice Torah blessings melody daily', false),
  ('20000000-0000-4000-8000-000000000003', 'practice', 'Torah: practice from tikkun. Haftarah: continue with recording through v7.', false),
  ('20000000-0000-4000-8000-000000000003', 'practice', 'Torah blessings: both before and after daily', false),
  -- Talia
  ('20000000-0000-4000-8000-000000000004', 'practice', 'Practice Genesis 28:5-7 slowly, focusing on Hebrew reading accuracy', true),
  ('20000000-0000-4000-8000-000000000004', 'listen', 'Listen to Toldot recording 3x this week', true),
  ('20000000-0000-4000-8000-000000000005', 'practice', 'Full Torah run-through daily. Start listening to Malachi recording.', false),
  ('20000000-0000-4000-8000-000000000005', 'practice', 'Practice Torah blessing (before) melody', false),
  -- Josh
  ('20000000-0000-4000-8000-000000000006', 'listen', 'Listen to Miketz Maftir recording 3x this week', false),
  ('20000000-0000-4000-8000-000000000006', 'practice', 'Practice trope signs with handout. Try reading Gen 44:14 with trope.', false);


-- ============================================================================
-- PART 14: BACKFILL completed_at FOR HOMEWORK ITEMS
-- ============================================================================

UPDATE public.homework_items
  SET completed_at = created_at
  WHERE completed = true AND completed_at IS NULL;


-- ============================================================================
-- DONE
-- ============================================================================

COMMIT;
