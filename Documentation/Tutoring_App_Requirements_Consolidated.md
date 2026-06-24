# MyMadrich: Consolidated Requirements
**Working name (pending Chizuk Amuno input)**

## 1. Project Overview

MyMadrich is a responsive web application for tracking B'nai Mitzvah tutoring progress. Tutors (madrachim) log session details, administrators (the B'nai Mitzvah coordinator) monitor student readiness, and parents/students view progress and homework. The app operates on a **cohort model**, with each cohort containing approximately 30 to 50 students.

---

## 2. Users and Roles

Each user has **one role only** (no dual roles).

| Role | Count per Cohort | Access Level |
|------|-----------------|--------------|
| **Admin** (a.k.a. B'nai Mitzvah Coordinator) | 3-5 | Full read/write access to all students. Can assign readings, manage users, edit session logs, view timeline feedback. |
| **Tutor** | ~10 | Read/write access to their own students only. Can log sessions, assign homework, view timeline feedback. |
| **Student** | 30-50 | View only. Can see own dashboard, session history, and homework. |
| **Parent** | 60-100 | View only. Can see their children's dashboards. Dropdown if multiple children in program concurrently. |

---

## 3. Authentication

- **Primary:** Google Sign-In (synagogue uses Google Workspace)
- **Fallback:** Magic link (email-based, passwordless login)
- **No password storage.** The app will not manage credentials directly.

---

## 4. Core Features (MVP)

### 4.1 Session Logging (Tutor) — BUILT

Tutors input session data either during or after a lesson. Fields include:

- **Date** of session
- **Student name** (selected from tutor's assigned students)
- **Verses worked on** (selected from student's assigned verses, not freeform)
  - For each verse, specify:
    - Status: Review, New, or Learning on Torah Side
    - Quality rating (standardized scale):
      - Perfect
      - 1-2 mistakes
      - 3-5 mistakes
      - Still learning
- **Service elements worked on** (blessings, d'var torah, etc.):
  - Selected from student's assigned service elements (not freeform)
  - Default elements include:
    - Torah blessings (before and after)
    - Haftarah blessings (before and after)
      - Haftarah "after" blessings can be broken into 4 individual blessings
    - D'var Torah, and any other admin-assigned elements
  - Same quality rating scale as verses
- **Homework assignment** (hybrid format):
  - Quick-select checkboxes pre-populated from the student's assigned verses and blessings
  - Freeform "Additional notes" text field
  - Optional "minutes per day" recommendation
- **Next lesson date/time**

**Implementation notes:** Quality ratings rendered as color-coded button groups (abbreviated labels for mobile: Perfect / 1-2 / 3-5 / Learning). Verse status buttons (Review / New / Torah Side) where Torah Side only appears for Torah readings. Per-element session notes supported. Admin logging defaults tutor_id to student's assigned tutor. "Select All" checkbox per reading section and element category with indeterminate state (Session 4). Homework auto-checked when verses/elements are checked, additive only (Session 4). Query param `?student=UUID` for pre-selection from tutor landing page (Session 4).

### 4.2 Student Dashboard — BUILT

Displays progress for a selected student. Slightly different views per role:

**Assigned Readings Summary:**

- Lists all Torah and Haftarah readings the student is working on by name (e.g., "Haftarah: Isaiah 40:27-41:16")
- Each reading includes a "View on Sefaria" link
- Serves as the header/context above the progress bars

**Progress Bars (per reading assignment):**

- **Torah readings:** One horizontal bar per assigned reading, segmented by individual pasuk (verse). Each segment is color-coded:

  | Color | Meaning |
  |-------|---------|
  | Gray | Not yet started |
  | Orange | Still learning |
  | Yellow | 3-5 mistakes |
  | Green-yellow | 1-2 mistakes |
  | Green | Mastered (with trope/vowels) |
  | Gold | Mastered on Torah side (reading from scroll without markings) |

- **Haftarah readings:** Same as Torah but without the Gold state (max is Green).

**Service Elements Tracking (blessings, d'var torah, and other service responsibilities):**

- Tracked via flexible `service_elements` system (not hardcoded)
- Color-coded status dot or badge next to each element name, using the same color scheme as verses (gray, orange, yellow, green-yellow, green)
- Reflects the most recent quality rating from session logs
- Grouped by category on the dashboard. Default categories include:
  - **Blessings:** Torah blessing (before), Torah blessing (after), Haftarah blessing (before), Haftarah blessing (after #1 through #4)
  - **Service parts:** D'var Torah, and any other responsibilities assigned by admin/tutor
- Admin can add new categories and elements per student without any code changes

**Contact Info:**

- Tutor view: Shows student's guardian contact info (all guardians, primary flagged) and names
- Student/Parent view: Shows tutor contact info and name

**Additional Dashboard Sections:**

- Current homework display (from most recent session)
- Recent session history list (last 5 sessions)
- Next session date/time
- Overall mastery percentage

**Role-Specific Differences:**

- Admin: Dropdown to select any student. Can view timeline and pace feedback.
- Tutor: Dropdown limited to their own students. Can view timeline and pace feedback.
- Parent: Dropdown if multiple children in program. Auto-select if one child. View only.
- Student: Sees only own dashboard. Auto-selected. View only.

**Implementation notes:** Progress bars are pure HTML/CSS flexbox segments (not Recharts), providing better control, lighter weight, and better mobile behavior. Tap-to-reveal on segments shows verse detail below the bar (no hover-only behavior). Minimum 28px segment width with horizontal scroll on mobile for students with many verses.

### 4.3 Session History Log — BUILT

- Visible to all four roles (student, parent, tutor, admin)
- Shows past sessions in reverse chronological order with expandable detail cards
- Each session summary shows: date, tutor name, verse count, element count
- Expanded detail: verses grouped by reading with quality color dots and status badges, elements grouped by category, homework items, next session date/time
- Tutor can edit past sessions for their own students (navigates to edit mode on LogSessionPage)
- Admin can edit any session and delete sessions (with confirmation modal)
- Students and parents are view only (no edit/delete buttons shown)
- Page size selector (10/25/50) with "Load more" button
- Student selector supports query param pre-selection (from Dashboard "View all sessions" link)
- "Edited" indicator shown when a session's updated_at differs from created_at
- Data managed by `useSessions` hook with detail caching

### 4.4 Admin Setup — BUILT

**Phase 1 (complete):**

- Create/manage cohorts (name, dates, active/archive toggle)
- Add students manually (name, mitzvah date, type, tutor assignment, status, notes)
- Student detail page with four management sections:
  - **Student Info:** Editable fields with Hebcal parashah preview on date change
  - **Readings:** Hebcal integration for parashah lookup, aliyah selection with individual verse checkboxes, auto-populated verse records with Sefaria URLs
  - **Service Elements:** Default template application, add/remove elements, drag-and-drop reorder at both category and element level
  - **Guardians:** CRUD with name, relationship, email, phone, primary contact toggle
- View tutor list (read-only; tutors created via sign-in + role assignment)

**Phase 2 (complete):**

- ~~Ability to upload from a spreadsheet for mass additions~~ **BUILT (Session 3):** ImportStudentsModal supports CSV and XLSX via SheetJS. Includes cohort selector, template download, validation preview with per-row error reporting, batch creation of students + guardians + default service elements. Readings excluded from import (handled per-student via Hebcal workflow on Student Detail page).
- **Search and filter:** Admin student list includes a search bar (by name), a filter-by-tutor dropdown, Last Session Date column, and Progress % column. **BUILT (Sessions 3-4).**
- **User management:** Users tab on Admin page. View all registered users, change roles via inline dropdown, search by name or email. **BUILT (Session 4).**
- **Account linking:** Manual linking of user accounts to student or guardian records. Suggested links based on email matching between profiles and unlinked guardian records. One-click confirm. Unlink capability. **BUILT (Session 4).**
- **Invitation workflow:** Invite modal with email, intended role, optional pre-linkage. Tracks pending invitations in `pending_invitations` table. Copy-to-clipboard formatted invite message (configurable app URL via `VITE_APP_URL`). Auto-processing on sign-in via `process_pending_invitation()` SECURITY DEFINER function updates role and linkage automatically. **BUILT (Session 4).**
- **First-time setup guide:** Numbered step guide shown when zero cohorts exist, auto-dismisses on first cohort creation. **BUILT (Session 4).**
- **Contextual tooltips and page descriptions:** HelpTip component with CSS-only tooltips. Role-aware page descriptions on Dashboard and Log Session. Tab descriptions on Admin page. **BUILT (Session 4, partial coverage).**

**Future enhancements (not yet built):**
- Customize Supabase invite email template (currently using default)
- Server-side invitation flow via `inviteUserByEmail()` (requires backend)
- Custom SMTP for bulk invitation emails (Supabase free tier limits to ~4/hour)

---

## 5. Verse and Reading Data

### Sources

Two tools work together to provide reading data:

- **Hebcal npm packages** (`@hebcal/core` + `@hebcal/leyning`): Provide date-to-parashah lookup, aliyah-by-aliyah verse breakdowns, Haftarah references, and handling of edge cases (double parshiyot, special Shabbatot, holiday readings). These are JavaScript libraries that run client-side with zero external API dependency.
- **Sefaria**: Provides "View on Sefaria" deep links for each reading and verse. Links are constructed via URL pattern (`https://www.sefaria.org/{reference}`), not API calls.

### Integration Approach (Implemented)

The workflow when setting up a student:
1. Admin enters the student's B'nai Mitzvah date
2. Hebcal identifies the parashah, lists the 7 aliyot with verse ranges, and identifies the Haftarah (Ashkenazi default, Sephardi shown as alternative when different)
3. Admin selects which aliyah(s) and/or Haftarah this student is responsible for
4. Admin reviews individual verse checkboxes (all selected by default, can uncheck verses student won't read)
5. System creates reading and verse records with Sefaria URLs auto-generated
6. Verse expansion handles both same-chapter and cross-chapter ranges using a built-in verse-count-per-chapter lookup table for all Torah and prophetic books

### Phase 2

- Consider inline verse text display if users report friction from leaving the app to view on Sefaria

---

## 6. Phase 2 Features

### 6.1 Suggested Learning Timeline

- **Auto-generated** based on B'nai Mitzvah date, number of assigned verses, and lesson frequency
- **Admin-adjustable** (system suggests, admin can override milestones)
- Compares actual progress to the timeline
- **Phase 2 feedback is automated math** (pace calculations, projected completion dates), not AI/LLM-generated
- Provides feedback to tutor and admin only (not parent/student)
- Color-coded warnings
- Tutor can view the timeline with actual dates (not relative timeframes)
- **Future consideration:** AI/LLM-generated narrative feedback as a later enhancement

### 6.2 Sefaria Inline Text

- Pull verse text into the app for inline display if user feedback warrants it

### 6.3 Email Notifications

- Session summary emails to parents after each tutoring session
- Homework reminder emails to students/parents
- Progress milestone notifications (e.g., "Your child mastered the Rishon!")
- Planned provider: Brevo (already used by SimchaKit)

### 6.4 Tutoring Calendar

- Calendar view of tutoring appointments

### 6.5 Stretch/Future

- Prayer tracking
- Hebrew tutoring tracking
- Student homework "check-in" feature (enabled by structured homework data)

---

## 7. Technology Stack

Aligned with SimchaKit (Brook Creative LLC) to enable future integration and reduce learning curve.

### Core Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | Vite + React 18 | Responsive design for mobile/tablet/desktop. Build target: `esnext` (required for Hebcal Temporal polyfill). |
| **Database** | Supabase (Postgres + Row Level Security) | RLS enforces role-based access at the database level. 11 SECURITY DEFINER helper functions for safe cross-table policy lookups. |
| **Auth** | Supabase Auth (Google SSO + Magic Link) | Google SSO is a provider toggle in Supabase. Magic link available but untested. |
| **Charts/Visualization** | Pure HTML/CSS | Segmented progress bars via flexbox. Color-coded status dots. No charting library needed. |
| **Drag-and-Drop** | @dnd-kit | Touch-friendly reordering for service elements (category and element level). |
| **Verse/Reading Data** | Hebcal npm packages (`@hebcal/core` + `@hebcal/leyning`) | Date-to-parashah, aliyah breakdowns, Haftarah references. Runs locally, no API dependency. |
| **Reading Links** | Sefaria (URL construction) | "View on Sefaria" deep links. No API calls, just URL pattern. |

### Phased Hosting

Development is split into two hosting phases. The database and auth layer (Supabase) remain constant across both phases, so nothing built during the prototype is throwaway.

**Phase A: NAS Prototype (current)**

| Component | Approach |
|-----------|----------|
| **Frontend hosting** | Vite build output (`dist/`) served by the existing Express host server under `/madrich` |
| **Deploy method** | `npm run build` on NAS; Express serves static files from `dist/` with SPA fallback |
| **Database** | Supabase free tier (remote, not on NAS) |
| **Auth** | Supabase Auth (remote): Google SSO + magic link |
| **Access** | `https://brooknas.familyds.net/madrich` (HTTPS via NAS reverse proxy) |

**Phase B: Production (after Chizuk Amuno sign-off)**

| Component | Approach |
|-----------|----------|
| **Frontend hosting** | Vercel (auto-deploy via `git push`) |
| **Deploy method** | `git push` to `main` triggers Vercel auto-deploy |
| **Database** | Same Supabase project (no migration needed) |
| **Auth** | Same Supabase Auth config (update redirect URLs to production domain) |
| **Access** | Public URL on custom domain (e.g., `app.mymadrich.com`) |
| **DNS** | TBD |

**What carries over from Phase A to Phase B:** Everything except the frontend hosting. Update `base` in vite.config.js (remove `/madrich/` prefix), update Supabase redirect URLs, update Google Cloud Console authorized origins.

### Future Integration with SimchaKit

MyMadrich and SimchaKit are fully independent applications on separate Supabase projects. Integration is optional, additive, and read-only. If the link is removed or either app is unavailable, the other continues functioning with its own complete data.

**Independence principle:** Each app maintains its own copy of all shared fields. Neither app writes to the other's database. Neither app defers to the other as a "source of truth." Both are self-contained.

**Linking mechanism:** SimchaKit's `event_id` stored in MyMadrich's `students.external_links` JSONB field as a pointer.

**Schema support already in place:** `external_links` JSONB column on students table with partial GIN index. Computed views (`verse_current_status`, `element_current_status`) are API-friendly.

---

## 8. Open Items (Status)

| # | Item | Status | Resolution |
|---|------|--------|------------|
| 1 | Cohort lifecycle | Resolved | Soft-archive via `is_active`. Implemented in Admin Setup (Cohorts tab). |
| 2 | Data model design | Complete | See Tutoring_App_Data_Model.md (v2) + Session 2 updates + Session 4 pending_invitations. |
| 3 | Sefaria API feasibility | Resolved | Two-tool approach implemented: Hebcal for lookups, Sefaria for deep links. |
| 4 | Spreadsheet upload format | Complete | CSV/XLSX import via SheetJS. ImportStudentsModal built in Session 3. |
| 5 | Notification strategy | Phase 2 | Email notifications deferred pending Chizuk Amuno demo feedback. Brevo planned. |
| 6 | App naming and domain | Working name set | **MyMadrich** pending Chizuk Amuno input. |
| 7 | RLS recursion | Resolved | Cross-table inline subqueries in policies caused infinite recursion. Fixed with 9 SECURITY DEFINER helper functions. |
| 8 | Session History page | Complete | Built in Session 3. All 4 roles, expandable detail, edit/delete, page size control. |
| 9 | Mobile navigation | Complete | Bottom tab bar on mobile, slim header with initial circle. Built in Session 3. |
| 10 | Bulk student import | Complete | CSV/XLSX with validation preview. Built in Session 3. |
| 11 | Review feedback items | Complete | All 7 "Worth Building Soon" items built in Session 4. O-6 tooltips partially complete. |
| 12 | User management | Complete | Users tab with role management, account linking, suggested links. Built in Session 4. |
| 13 | Invitation workflow | Complete | pending_invitations table, invite modal, copy-to-clipboard, auto-processing on sign-in. Built in Session 4. |
| 14 | Supabase invite email template | Future | Currently using default template. Customize in Auth > Email Templates. |
| 15 | Server-side invitation flow | Future | Replace copy/paste with `inviteUserByEmail()` once app has a backend. |
