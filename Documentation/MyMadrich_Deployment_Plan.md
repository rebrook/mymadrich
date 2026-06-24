# MyMadrich: NAS Deployment Plan

## Prerequisites

- NAS server running with the existing Express host server (`server.js`)
- Node.js v22+ installed on NAS
- SSH access to NAS
- Supabase project created (project URL and publishable key ready)
- HTTPS access to NAS via reverse proxy (e.g., `https://brooknas.familyds.net`)

---

## Step 1: Copy the Project to the NAS

Extract the scaffold archive to `/volume1/web/mymadrich`:

```bash
cd /volume1/web
tar -xzf mymadrich-scaffold.tar.gz
```

---

## Step 2: Create the Environment File

```bash
cd /volume1/web/mymadrich
cat > .env.local << 'EOF'
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_APP_URL=https://brooknas.familyds.net/madrich
EOF
```

**Note:** `VITE_APP_URL` is used in the invitation message text. Update it when migrating to production (e.g., `https://app.mymadrich.com`). If omitted, falls back to `window.location.origin + '/madrich'`.

---

## Step 3: Install Dependencies and Build

```bash
cd /volume1/web/mymadrich
npm install
npm run build
```

This creates the `dist/` folder containing the production-ready static files.

**Note:** If Hebcal packages fail to install with a version error, use `npm install @hebcal/core@latest @hebcal/leyning@latest` to get the correct versions, then run `npm run build`.

**Dependencies added in Session 3:** `xlsx` (SheetJS) for CSV/XLSX parsing in bulk student import. Install via `npm install xlsx` if not already in package.json.

---

## Step 4: Update server.js

Open `/volume1/web/server.js` and add the MyMadrich mount:

```js
// MyMadrich (static SPA)
app.use("/madrich", express.static(path.join(__dirname, "mymadrich", "dist")));
app.get("/madrich/*", (req, res) => {
  res.sendFile(path.join(__dirname, "mymadrich", "dist", "index.html"));
});
```

---

## Step 5: Configure Supabase Auth

### 5a: Set Redirect URLs

1. In Supabase dashboard: **Authentication > URL Configuration**
2. Set **Site URL** to: `https://brooknas.familyds.net/madrich`
3. Add to **Redirect URLs**: `https://brooknas.familyds.net/madrich`

### 5b: Configure Google OAuth

1. Google Cloud Console: Create OAuth consent screen, then OAuth 2.0 credentials
2. **Authorized JavaScript origins:** `https://brooknas.familyds.net`
3. **Authorized redirect URIs:** `https://YOUR-PROJECT-ID.supabase.co/auth/v1/callback`
4. Enable Google provider in Supabase: **Authentication > Providers > Google**, paste Client ID and Secret

---

## Step 6: Create Admin Account

1. Sign in at `https://brooknas.familyds.net/madrich` with Google
2. Promote to admin in Supabase SQL Editor:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'your-email@gmail.com';
   ```
3. Sign out and back in

---

## Step 7: Verify

| Check | How to Verify |
|-------|--------------|
| App loads | Navigate to `https://brooknas.familyds.net/madrich` |
| Google sign-in works | Complete OAuth flow |
| Admin role set | "Administrator" shows in nav after sign-out/in |
| Dashboard loads | Progress bars, status dots, contact info render |
| Log Session works | Create a session with verse/element ratings |
| Admin Setup works | Create cohorts, add students, manage readings/elements/guardians |
| SPA routing works | Direct navigation to `/madrich/admin` doesn't 404 |
| Other apps unaffected | `/draft` and `/simcha` still work |

---

## Rebuild After Code Changes

```bash
cd /volume1/web/mymadrich
npm run build
```

No server restart needed after rebuild (Express serves from `dist/` directly). Only restart if `server.js` changes.

---

## Vite Configuration

The `vite.config.js` must use `esnext` build target for Hebcal compatibility:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/madrich/',
  build: {
    target: 'esnext',
  },
});
```

---

## Troubleshooting Reference

| Issue | Cause | Fix |
|-------|-------|-----|
| `relation "profiles" does not exist` during migration | Helper functions referenced tables before they were created | Functions must be defined AFTER table creation in the migration |
| `No matching version found for @hebcal/leyning@^8.4.0` | Incorrect version pinned in package.json | Use `npm install @hebcal/core@latest @hebcal/leyning@latest` |
| `Unsupported provider: provider is not enabled` | Google provider not toggled on in Supabase | Enable at Authentication > Providers > Google and paste Client ID/Secret |
| Google sign-in redirects back to login with no user created | Missing OAuth consent screen in Google Cloud Console | Configure consent screen before creating OAuth credentials |
| `Database error saving new user` after Google OAuth | Trigger function used unqualified table name | All `SECURITY DEFINER` functions must use `public.table_name` and `SET search_path = public` |
| "Loading profile..." stuck after sign-in | Tables not exposed to Supabase REST API | Run GRANT statements for anon, authenticated, and service_role on all tables |
| Redirect URL mismatch (http vs https, port differences) | App accessed via HTTPS but Supabase configured with HTTP:3000 | All URLs must match the actual browser URL |
| `infinite recursion detected in policy for relation "students"` | RLS policies on `students` and `student_guardians` had inline subqueries referencing each other | Run `fix_rls_recursion.sql`: creates 9 SECURITY DEFINER helper functions and rewrites all non-admin policies |
| `Top-level await is not available in the configured target environment` | `@hebcal/core` Temporal polyfill uses top-level await | Set `build.target: 'esnext'` in `vite.config.js` |
| Horizontal scroll arrows on tabs or progress bars (Windows) | `overflow-x: auto` at base CSS level shows scrollbar UI even when content fits | Move all `overflow-x: auto` to mobile media queries only |
| `Could not resolve "./pages/Dashboard"` build error | File not at expected path | Verify file copied to correct directory with correct capitalization |

---

## Applied SQL Migrations

Run in the Supabase SQL Editor in this order after the initial `mymadrich_schema.sql`:

1. `mymadrich_seed_test_data.sql` - Test data (cohort, tutor, student, readings, verses, elements, guardian)
2. `update_default_elements.sql` - Updated seed function to include D'var Torah
3. `fix_rls_recursion.sql` - 9 new SECURITY DEFINER functions + rewrote all non-admin RLS policies
4. `pending_invitations_migration.sql` - Invitation tracking table, RLS policy, `process_pending_invitation()` SECURITY DEFINER function, index, grants (Session 4)

---

## Directory Structure

```
/volume1/web/
├── server.js
├── mymadrich/
│   ├── dist/
│   │   ├── index.html
│   │   └── assets/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── index.css
│   │   ├── lib/
│   │   │   └── supabase.js
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── utils/
│   │   │   ├── constants.js
│   │   │   └── hebcal.js
│   │   ├── hooks/
│   │   │   ├── useCohorts.js
│   │   │   ├── useStudents.js
│   │   │   ├── useStudent.js
│   │   │   └── useSessions.js
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.jsx
│   │   │   │   └── ProtectedRoute.jsx
│   │   │   ├── auth/
│   │   │   │   └── LoginPage.jsx
│   │   │   ├── ui/
│   │   │   │   ├── Modal.jsx
│   │   │   │   └── HelpTip.jsx
│   │   │   └── admin/
│   │   │       ├── CohortTab.jsx
│   │   │       ├── StudentTab.jsx
│   │   │       ├── TutorTab.jsx
│   │   │       ├── StudentInfoSection.jsx
│   │   │       ├── ReadingsSection.jsx
│   │   │       ├── ServiceElementsSection.jsx
│   │   │       ├── GuardiansSection.jsx
│   │   │       ├── ImportStudentsModal.jsx
│   │   │       └── UsersTab.jsx
│   │   └── pages/
│   │       ├── Dashboard.jsx
│   │       ├── AdminPage.jsx
│   │       ├── StudentDetailPage.jsx
│   │       ├── SessionHistoryPage.jsx
│   │       └── LogSessionPage.jsx
│   ├── package.json
│   ├── vite.config.js
│   ├── .env.local
│   └── .env.example
├── draftkit/
├── simchakit/
└── simchakit-site/
```
