# Science Fair Judging App — Claude Code Context

> This file is the single source of truth for AI-assisted development.
> Any AI reading this file should understand the full app before making changes.
> Do not delete it.

---

## 🧭 Project Overview

A **multi-tenant SaaS judging platform** for school science fairs. Any school can self-register and run their own fair independently. Each school has isolated data, custom rubrics, and their own admin login.
Built as a single-file React component (`ScienceFairJudging.jsx`).
**Supabase is fully connected** — PostgreSQL + Realtime + Auth powers all data persistence and admin login.
**PWA-enabled** — installable on tablets/phones, works offline with local backup.

**Default Rubric:** Northeast AZ Regional Science and Engineering Fair scoring sheet (10 criteria, 42 pts max) — customizable per school via the admin Rubric tab.
**Target scale:** Flexible — supports 1–100+ judges, 1–150+ projects per school (configurable).
**Target devices:** Tablets (primary), phones, laptops, Chromebooks — fully responsive.

**v1 (single-school, legacy):**
- **Live URL:** https://qritiko.com/
- **Supabase project:** https://cjzuiimoamrggucvahjm.supabase.co
- **Do not modify** — v1 is live for Dishchiibikoh Community School events

**v2 (multi-tenant SaaS — active development):**
- **Live URL:** https://app.qritiko.com/ (school-select) → https://app.qritiko.com/s/{slug} (per-school)
- **Supabase project:** https://evrupqnhgrfltfhafeyj.supabase.co
- **Schema:** `supabase/schema-v2.sql` (applied to v2 Supabase project)
- **Vercel project:** `sciencefair-v2` (separate from v1, same GitHub repo)
- **Deploy:** Push to `main` → both Vercel projects auto-deploy from the same repo

> Last major update: 2026-09-25 — **Full architecture audit: 19 defects fixed** (see Bug Fix Log).
> Highlights: score backups/CSV exports were silently empty under the v2 JSONB schema; projects
> added after a judge signed in were invisible to them; the public results link was dead; the
> judging lock and both share tokens were unenforced. Also adds adviser + group members to the
> `projects` table for admin-entered teams — **requires running
> `supabase/migration-2026-09-project-adviser.sql`**.
>
> Previous update: 2026-06-08 — UX onboarding improvements (Phases 1–3):
> - Phase 1: `school-select` view rebuilt as a full marketing/product page — nav bar, hero with slug input, "How it works" 3-step grid, 6-feature grid, bottom CTA strip. New CSS classes: `.mkt-*`
> - Phase 2: Admin Overview tab — "Get started" setup guide card (`judges.length === 0` gate) with project checklist, one-click copy buttons for school URL and invite code. New state: `setupCopied`. New CSS classes: `.setup-*`
> - Phase 3: Judge UX clarity — landing judge card describes what's needed; judge sign-in has inline helper text under each field and improved bottom note; judge home shows a "Tap a project to start scoring" banner until first score is submitted
>
> Previous update: 2026-06-02 — completed full v2 multi-tenant migration. Phases 2, 3, 5, 7 done:
>
> - Phase 2: Full `ScienceFairJudging.jsx` rewrite — Supabase Auth login, school slug resolution, all queries scoped by `school_id`, JSONB scoring criteria, new `school-select` / `school-register` views, dynamic rubric from DB
> - Phase 3: `vercel.json` rewrite rules for `/s/:slug` → `index.html`
> - Phase 5: Admin Rubric tab — view/edit/reorder/delete criteria, save to `rubrics` table, reset to default
> - Phase 7: New Supabase v2 project, `schema-v2.sql` applied, new Vercel deployment, `app.qritiko.com` domain via Cloudflare CNAME

## 🐛 Bug Fix Log

### 2026-09-25 — Full architecture audit: 19 findings fixed

A senior-dev audit of the whole app surfaced 19 defects across data integrity, tenant
isolation, access control and scoring logic. All are fixed in this change set.
**Requires a DB migration:** `supabase/migration-2026-09-project-adviser.sql`.

**P0 — data loss / event-blocking**

1. **Score backups and both CSV exports contained no scores.**
   `saveScoreBackup()`, `exportJudgeScoresCSV()` and `downloadBackupCSV()` all read the
   **v1 flat columns** (`sc.presentation`, `sc.testable_q`, …). v2 stores scores as
   `sc.criteria.<id>` JSONB (rule 0e), so every criterion serialised as `undefined` —
   only `total` survived, because `getTotal()` reads `.criteria` correctly. Backups
   taken before this fix hold totals but no per-criterion data.
   *Fix:* new module helper `critVal(scoreOrEntry, rid)` reads `.criteria` with a
   legacy flat-field fallback. All three paths are now rubric-driven: columns come
   from the live `rubric` state instead of the hardcoded Northeast AZ 10.
   `saveScoreBackup()` now stores `criteria: {...}` **and a copy of the rubric**, so an
   old snapshot still renders correctly after a school edits its criteria.

2. **Projects added after a judge signed in were invisible to that judge forever.**
   `assignProjects()` snapshots project IDs into `judges.projects` at registration and
   `addProject()` never updated existing judges — so late entries were scored by nobody,
   and a judge who registered before data entry finished got a permanently empty list.
   *Fix:* new `syncJudgeAssignments(deptIds, projectList)` pushes the current roster to
   every judge in the affected departments. Called from `addProject()` and, for both the
   old and new department, from `updateProject()` when a project changes department.
   `assignProjects(deptId, projectList)` takes an optional roster because `projects`
   state has not flushed yet at the call site.

3. **The public results link was dead.** `shareUrl()` returned
   `${origin}?token=…` — it omitted the `/s/{slug}` path, and **nothing ever parsed
   `?token=`**. Recipients landed on the platform marketing homepage.
   *Fix:* new `urlShareToken` module constant; the token is validated in `init()`
   against a `share_links` row for this school that is neither revoked nor expired;
   `public-results` is now part of the initial-view expression (matching how
   `public-register` / `public-projects` already worked); an invalid, revoked or
   expired token renders a "Link Unavailable" card. `shareUrl()`, `projListUrl()` and
   the registration URL are all school-scoped now.

**P1 — security / access control**

4. **Project-list token was never actually checked.** `setProjListValid(!!data?.value
   && data.value !== "")` accepted *any* non-empty stored token, so `?projects=anything`
   opened the list. *Fix:* compares against `urlProjListToken`.
5. **"Lock Judging" was UI-only.** The gate lived on the project tile's `onClick`;
   `submitScore()` had no check, so a judge already inside the scoring form could still
   submit. *Fix:* `submitScore()` now rejects when `locked`, and also when the judge has
   already validated (rule 18 was likewise only enforced in the UI). Both log to IT.
6. **Cross-school session bleed.** `sf_judge_id` / `sf_judge_data` / `sf_scores_cache`
   are origin-global and every school shares one origin, so a session from school A was
   restored while visiting school B whenever B had no judges yet. *Fix:* new
   `sf_judge_slug` localStorage key, stamped at registration and compared against
   `urlSchoolSlug` in both the instant-restore and session-sync effects.
7. **Auth listener could point writes at the wrong tenant.** `onAuthStateChange`
   overwrote `currentSchool` with the logged-in admin's school while data and realtime
   stayed bound to the URL slug's school — reads from B, writes to A. *Fix:* the admin's
   school is adopted only when `school.slug === urlSchoolSlug`.
8. **`exportRegCSV()` had no `school_id` scope** — a rule 0 violation that would export
   every school's registration submissions. *Fix:* scoped, and guarded on `currentSchool`.

**P2 — logic errors**

9. **`hasTie()` compared averages across departments**, so an Elementary and a High
   School project both averaging 35.0 fired the tie alert and forced deliberation.
   *Fix:* new `rankedProjectsIn(deptId)`; ties are detected per department (plus an
   "unassigned" group). Also switched `.filter(p => p.avg)` to `p.avg !== null`.
10. **`judgeComp()` divided by zero** for a judge with no assigned projects, yielding
    `NaN%` in the Judges tab. *Fix:* returns `pct: 0` when `total === 0`, and
    `completedJudges()` now requires `total > 0` so a judge with nothing to score can
    never silently satisfy consensus.
11. **Hardcoded `/42` throughout** despite per-school custom rubrics (rule 0f).
    *Fix:* new `rubricMax()` and `projectMax(proj)` helpers (the latter honours the
    grade <5 abstract exemption) replace every hardcoded denominator.
12. **Global `maxJudges` was dead code with live plumbing** — loaded, reset and
    persisted, but registration only ever enforced `departments.max_judges`.
    *Fix:* removed `maxJudges`, `maxJudgesDraft`, `maxJudgesErr` state and
    `updateMaxJudges()`; reset no longer writes `app_settings.max_judges`.
13. **`projForm.cat` defaulted to `"Biology"`**, which is not in `REG_CATEGORIES` —
    any project added without touching the dropdown saved an orphan category.
    *Fix:* defaults to `REG_CATEGORIES[0]` at all 5 reset sites.
14. **`executeReset()` left the project-list share link live**, still serving the old
    roster. *Fix:* clears `project_list_token` in DB and state.
15. **`getAnomalies()` matched judges with `key.startsWith(j.id)`** — prefix collision
    risk. *Fix:* exact id match derived via `lastIndexOf`.

**P3 — robustness**

16. **No concurrency guard on `flushOfflineQueue()`.** *Fix:* `flushingRef` guard; the
    body moved to `runOfflineFlush(queue)` and the flag is cleared via `.finally()`.
    ⚠️ **Deliberately not `try/finally`** — see the "React Compiler bailout" note below.
17. **CSV formula injection.** Titles/notes beginning `=`, `+`, `-` or `@` executed as
    formulas in Excel. *Fix:* new `csvCell()` escaper quotes every cell and prefixes a
    dangerous leading character with an apostrophe. Used by all four CSV exports.
18. **School registration failed silently.** None of the six inserts checked `error`.
    With email confirmation enabled, `signUp()` returns a user but **no session**, so
    the RLS-protected `departments` and `rubrics` inserts were rejected — leaving a
    school with no departments, which blocks judge sign-in entirely. (Confirmed live:
    the one school registered 2026-08-15 had `app_settings` rows but zero departments
    and zero rubrics.) *Fix:* every insert checks its error; a failed `school_admins`
    link aborts with a clear message; and new `ensureSeedData(schoolId)` re-seeds
    departments + rubric on the first authenticated admin load, so a half-created
    school repairs itself.
19. **`DEFAULT_PROJECTS` dead code removed** (8 demo rows, zero references).

**⚠️ React Compiler bailout — do not reintroduce `try/finally`**

A `try/finally` block anywhere inside the `App` component makes the React Compiler bail
out, which **silently disables the `react-hooks/purity` and `react-hooks/immutability`
ESLint rules for the entire file** (41 findings disappeared from the lint report without
a single line of them being fixed). Verified by toggling the construct in isolation.
Use `.finally()` on a promise instead, as `flushOfflineQueue()` does.

**Known gaps left in place (pre-existing, not introduced here):**
`projListUrl()`, `generateProjListLink()` and `revokeProjListLink()` have no UI callers —
the `public-projects` view can only be reached if a `project_list_token` is written by
other means. `submitDelibNote()` and `reviseDecision()` are likewise defined but
unreferenced. These are flagged by ESLint `no-unused-vars` and were left alone to keep
this change set to audit fixes.

**Files changed:** `src/ScienceFairJudging.jsx`, `supabase/schema-v2.sql`,
`supabase/migration-2026-09-project-adviser.sql` (new), `CLAUDE.md`,
`AdminInstructions.md`, `JudgeInstructions.md`.

### 2026-09-25 — Feature: adviser + group members on admin-entered projects

**Problem:** adviser name and group members lived **only** in `registration_submissions`,
the table the student self-registration form writes to. The add/edit form gated those two
fields behind `editingProject && regSubmissions.find(...)`, so they never rendered for an
admin-created project; `addProject()` dropped them entirely; and `exportProjListPDF()` read
them from `regSubmissions`. For the 2026-27 workflow — **organisers register the teams, not
students** — that made adviser and team names impossible to enter and blank on the printed
project list.

**Fix:** `projects` gains `advisor_name TEXT` and `group_members JSONB` (migration
`supabase/migration-2026-09-project-adviser.sql`, which also backfills from existing
submissions). The form fields are always shown; `addProject()` and `updateProject()` write
them; the project rows, edit form and PDF export read the project columns first and fall
back to `registration_submissions` for student-registered entries.

**Migration safety:** `writeProjectRow()` detects a missing-column error (`42703` /
`PGRST204`) and transparently retries without the two new fields, logging
`PROJECT_ADVISER_COLS_MISSING`. A deployment that has not run the migration keeps working
instead of failing every project insert.

### 2026-03-30 — Fix: Judge validation concurrent overwrite (Bug #1)
**Problem:** `submitJudgeValidation` and `submitAdminValidation` were writing validations as a
merged JSON blob into a single `app_settings` row (`key = "judge_validations"` / `"admin_validation"`).
If two judges validated simultaneously, both would read the same stale local state, construct a
`next` object containing only their own entry, and race to overwrite the row — silently discarding
the other judge's validation.

**Fix:** Both functions now write directly to the `validations` table using an atomic
`UPSERT ON CONFLICT judge_id`. Each judge gets their own row; concurrent submissions can never
overwrite each other. `loadSettings()` no longer parses these keys from `app_settings`.
`executeReset()` now deletes all rows from the `validations` table instead of resetting the
stale `app_settings` keys.

**Files changed:** `src/ScienceFairJudging.jsx`
- `submitJudgeValidation`: writes to `validations` table, uses functional `setJudgeValidations` updater
- `submitAdminValidation`: writes to `validations` table with `judge_id = "admin"`
- `loadSettings()`: removed `admin_validation` / `judge_validations` parsing (handled by `loadValidations()`)
- `executeReset()`: replaced two `app_settings` upserts with `validations` table delete

**Note:** The `validations` table, its RLS policies, and the realtime subscription were already
correct and required no changes. The read path (`loadValidations`) and the "Revise my validation"
delete flow were already pointed at the `validations` table.

### 2026-03-30 — Fix: Offline queue items lost during flush (Bug #2)
**Problem:** `flushOfflineQueue` read the queue snapshot at the start, then awaited each Supabase
upsert. If `submitScore` ran during the flush (adding a new item to localStorage), the flush would
finish and write back only its `remaining` (failed) items, overwriting and silently discarding
the newly added entry.

**Fix:** After the upsert loop, re-read localStorage to capture any items added during the flush.
Filter to keep only items that either (a) failed and need a retry, or (b) were not in the original
batch (added after the flush started). Items that succeeded are dropped. Uses two `Set`s —
`flushedKeys` (all attempted) and `failedKeys` (those that errored) — to classify each item in
the post-flush localStorage state.

**Files changed:** `src/ScienceFairJudging.jsx`
- `flushOfflineQueue`: replaced `remaining[]` accumulator pattern with key-set tracking +
  post-loop localStorage re-read and merge. No changes to `submitScore` or the queue write path.

---

## 📖 User Guides

For end-user instructions, see:
- **[JudgeInstructions.md](./JudgeInstructions.md)** — Complete guide for judges (how to register, score, validate)
- **[AdminInstructions.md](./AdminInstructions.md)** — Complete guide for administrators (setup, project mgmt, deliberation, results sharing)

---

## 📁 File Structure

```
/
├── src/
│   ├── ScienceFairJudging.jsx   ← Entire app (single file, ~4700+ lines) — v2 multi-tenant
│   ├── supabaseClient.js        ← Supabase client init (reads from .env)
│   └── main.jsx                 ← React root + PWA service worker registration
├── supabase/
│   ├── schema.sql               ← v1 DB schema (applied to cjzuiimoamrggucvahjm — DO NOT TOUCH)
│   └── schema-v2.sql            ← v2 multi-tenant schema (applied to evrupqnhgrfltfhafeyj)
├── public/
│   ├── favicon.svg
│   ├── logo.png                 ← School logo (also used as PWA icon)
│   └── icons.svg
├── index.html                   ← PWA meta tags (apple-touch-icon, theme-color, manifest)
├── vite.config.js               ← Vite + vite-plugin-pwa config
├── vercel.json                  ← Rewrites /s/:slug → index.html for SPA routing
├── .env                         ← Local only, gitignored — holds Supabase credentials
├── .env.example                 ← Template for .env (v2: only SUPABASE_URL + ANON_KEY needed)
├── .npmrc                       ← legacy-peer-deps=true (needed for vite-plugin-pwa on Vite 8)
├── CLAUDE.md                    ← AI development context (this file)
├── JudgeInstructions.md         ← User guide for judges
└── AdminInstructions.md         ← User guide for administrators
```

All CSS lives inside a `const CSS = \`...\`` template literal injected via `<style>{CSS}</style>`.
There are no separate `.css` files, no Tailwind, no CSS modules.

---

## 🏗️ Architecture

### Single-file React component
- **One default export:** `App()` in `ScienceFairJudging.jsx`
- **No routing library** — view switching via a `view` state string
- **No external state management** — plain `useState` throughout
- **Supabase realtime** subscriptions keep all clients in sync live (school-scoped channel)

### v2 School Resolution (on mount)
1. `urlSchoolSlug` reads `window.location.pathname.split("/s/")[1]` at module load
2. If no slug → initial view is `"school-select"` (platform homepage)
3. If slug present → `schoolLoading = true`, fetch `schools` row by slug (anon, public columns only)
4. School found → `setCurrentSchool(data)`, load all data for that school, subscribe to realtime
5. School not found → show "School Not Found" error screen
6. `vercel.json` rewrites `/s/:slug` → `index.html` so the SPA handles the path at runtime

### v2 Auth Flow
- `supabase.auth.onAuthStateChange` listener set up on mount
- Admin logs in via `handleAdminLogin()` → `supabase.auth.signInWithPassword({ email, password })`
- On auth success → load `school_admins` to find `school_id` → reload `schools` row with full fields including `admin_pin`
- On logout → `handleAdminLogout()` → `supabase.auth.signOut()`, strip `admin_pin` from `currentSchool`
- Admin sidebar shows school name + Sign Out button when `session` is non-null

### AnimatedBackdrop (canvas animation)
- **Currently DISABLED.** The render path is hardcoded to `const backdrop = null;` — the component is defined but never mounted (switched off for input latency on tablets). The notes below apply only if it is re-enabled.
- Runs a `requestAnimationFrame` loop **capped at ~30fps** (`if (timestamp - lastFrame < 33) return`) to avoid burning CPU
- Max **36 atoms** (down from 72) — the O(n²) bond-drawing loop runs on the main thread; more atoms = direct UI lag
- **Do not raise these limits** — higher atom counts or uncapped FPS caused measurable input lag on tablets

### View system
The app renders different screens based on `const [view, setView] = useState("landing")`.

| `view` value | Screen |
|---|---|
| `"school-select"` | Platform homepage — enter slug or register a new school (shown when no `/s/` slug in URL) |
| `"school-register"` | School sign-up form — creates auth user, school row, seeds settings/departments/rubric |
| `"landing"` | Per-school landing — Judge / Admin buttons (shown at `/s/:slug`) |
| `"judge-register"` | Judge sign-in (name + invite code from `currentSchool.invite_code`) |
| `"judge-home"` | Judge's project list + progress + validation |
| `"judge-scoring"` | Scoring form for one project |
| `"admin-login"` | Admin email + password gate (Supabase Auth) |
| `"admin-home"` | Full admin dashboard (tabbed) |
| `"public-results"` | Public results page — reached via a valid `?token=` share link, the landing "LIVE RESULTS" card, or the admin preview button |
| `"public-register"` | Student self-registration form — entered via `?register=<token>` (initial view only) |
| `"public-projects"` | Public project list — entered via `?projects=<token>` (initial view only). ⚠️ No admin UI currently generates this token |

### Admin dashboard tabs
Controlled by `const [adminTab, setAdminTab] = useState("overview")`.

| `adminTab` value | Content |
|---|---|
| `"overview"` | Stats, completion bar, leaderboard |
| `"judges"` | Per-judge progress table |
| `"projects"` | Project management — add/edit/remove/lock projects + per-project rubric breakdown |
| `"activity"` | Human-readable activity log |
| `"alerts"` | Anomaly detection + system status |
| `"deliberation"` | **Validation & Deliberation workflow** (see section below) |
| `"share"` | Generate/revoke public results link — **locked until results finalized** |
| `"export"` | Per-judge CSV export + score backups |
| `"registration"` | Student registration links + submissions |
| `"rubric"` | View/edit school's scoring rubric — criteria, max pts, steps; save to `rubrics` table |
| `"itlogs"` | IT diagnostic terminal (PIN-gated via `currentSchool.admin_pin`) |

---

## 🔐 Security & Access Control

### v2 Credentials (per-school, stored in Supabase DB)
| Access | Credential |
|---|---|
| Judge sign-in name | `Judge1` through `Judge[N]` — N is `maxJudges` (default 15, configurable per school) |
| Judge invite code | `schools.invite_code` — set at school registration, changeable by admin |
| Admin dashboard | Supabase Auth email + password — set at school registration via `school-register` view |
| IT Logs tab | `schools.admin_pin` — 4-digit PIN stored in DB, default `0000` at registration |
| Reset All Data | `schools.admin_pin` — same PIN, separate modal |
| Registration email | `RESEND_API_KEY` + `EMAIL_FROM` env vars (server-side, Vercel only) |

> **v2 has NO `VITE_INVITE_CODE`, `VITE_ADMIN_PASS`, or `VITE_IT_PIN` env vars.**
> All credentials live in the `schools` table. Admin login uses Supabase Auth (`supabase.auth.signInWithPassword`).
> `admin_pin` is only returned after the admin authenticates — the public anon slug query returns only `id, name, slug, invite_code`.
> `RESEND_API_KEY` and `EMAIL_FROM` are server-side only (used by `/api/send-registration-email.js`) — do NOT prefix with `VITE_`.

### Security model
- **Judges are identified by number** — they sign in as `Judge1`–`Judge[N]` where N equals `maxJudges`. The alias IS their username.
- **Max judges is configurable** — admin sets this before judging begins (stored in `app_settings` as `max_judges`). Once first judge registers, it locks to prevent mid-event changes. Resets to 15 when data is reset.
- **Every judge scores every project** — `assignProjects()` returns all project IDs (not a subset). This ensures comprehensive scoring and robust averages.
- **Duplicate prevention** — if a judge name is already registered, a second registration attempt is blocked client-side.
- **Admin-controlled judge transfer** — if a judge's device fails, transfer to a new device is only allowed after admin approval in the Judges tab (PIN-gated via custom modal — not `window.prompt`).
- **Project locking** — admin can lock individual projects to prevent editing or removal. Locked projects show a lock badge in the UI.
- **IT Logs tab** is PIN-gated (`itUnlocked` state). Wrong PIN logs `IT_ACCESS_DENIED`.
- **Reset modal** requires `schools.admin_pin` (per-school, from the DB). Wrong PIN logs `RESET_PIN_FAILED`.
- **Activity log is NEVER cleared on reset** — preserved for security audit. This is intentional.
- **Judging can be locked** by admin (`locked` state) — blocks all judge score submissions.
- **Public results page never shows judge names** — score + project data only.

### Admin login protection
- **Rate-limited:** 5 failed attempts triggers a 30-second lockout
- Each failed attempt is logged to IT logs (`ADMIN_LOGIN_FAILED`)
- Lockout state is in-memory only (resets on page reload)

### Judge sign-in flow
1. Judge enters their name (`Judge1`–`Judge[N]`), selects their **department**, and enters the invite code (from `schools.invite_code`)
2. App validates:
   - Name is in valid range (based on configured `maxJudges`)
  - If name is already active, transfer is allowed only when admin pre-approves transfer for that judge
   - Invite code matches
3. Judge is inserted into Supabase `judges` table with:
   - Random unique `id`
   - Name as `alias`
   - **All project IDs** (every project gets scored by every judge)
   - Current `joinedAt` timestamp
4. Session is saved to `localStorage` (`sf_judge_id` + `sf_judge_data`) for persistence across browser restarts
5. If transfer is admin-approved, existing judge session is restored on the new device and the approval is consumed (one-time use)

---

## 📊 Data Model

### Departments (`departments` state, synced from Supabase `departments` table)
```js
{ id, name, max_judges, ord }
// id: UUID (PK from Supabase)
// name: "Elementary" | "Middle School" | "High School" (or custom)
// max_judges: per-department judge cap (default 5)
// ord: display order integer
```
`DEFAULT_DEPARTMENTS` is a fallback constant used before Supabase loads. `loadDepartments()` auto-seeds 3 default rows if the table is empty on first run. Admin can adjust `max_judges` per department before any judge in that department registers (locks after first registration in that dept).

### Projects (dynamic — `projects` state, synced from Supabase `projects` table)
```js
{ id, num, title, cat, grade, locked, department_id, advisor_name, group_members }
// id: "p_abc123" for admin-added projects (legacy rows may use "p1", "p2", …)
// num: display number e.g. "001"
// cat values: "Biology", "Physics", "Computer Sci.", "Chemistry", "Earth Science", "Engineering", "Math", "Environmental Sci."
// locked: boolean — locked projects cannot be edited or removed by admin
// department_id: UUID FK to departments table (null = unassigned/legacy)
```
`DEFAULT_PROJECTS` is a seed array used as fallback if the Supabase `projects` table is empty. On init, projects are loaded from Supabase; if the table has rows, those replace the defaults. Admin can add/edit/remove/lock projects dynamically via the Projects tab. Admin assigns a department when adding/editing a project.

### Judges (stored in `judges` state, synced from Supabase `judges` table)
```js
{ id, alias, projects: [pid, ...], joinedAt, department_id }
// alias = judge's chosen name e.g. "Judge3"
// projects: array of project IDs for this judge's department (all projects in that dept)
// department_id: UUID FK to departments table — set at registration
// UNIQUE(department_id, alias) — same alias can exist across different departments
```

### Scores (stored in `scores` state as flat key-value object, synced from Supabase `scores` table)
```js
// Key format: `${judgeId}_${projectId}`  e.g. "abc123_p1"
// Value:
{
  presentation, testable_q, background, hypothesis,
  variables, materials, data, analysis, conclusion, abstract,
  notes, time
}
// All rubric values are numbers (discrete — see RUBRIC steps). Notes is a string. Time is a timestamp.
```

### Rubric (`RUBRIC` constant array — 10 criteria, **42 pts max total**)

Based on the **Northeast AZ Regional Science and Engineering Fair Judge's Scoring Sheet**.
Each criterion has a `steps` array of the only allowed values (discrete, not a slider).

```js
{ id, label, desc, max, steps }
```

| id | label | max | steps |
|---|---|---|---|
| `presentation` | Presentation | 6 | [0, 2, 4, 6] |
| `testable_q` | Testable Question | 3 | [0, 1, 2, 3] |
| `background` | Background Research | 3 | [0, 1, 2, 3] |
| `hypothesis` | Hypothesis | 3 | [0, 1, 2, 3] |
| `variables` | Variables | 3 | [0, 1, 2, 3] |
| `materials` | Materials & Procedure | 3 | [0, 1, 2, 3] |
| `data` | Data | 6 | [0, 2, 4, 6] |
| `analysis` | Analysis | 6 | [0, 2, 4, 6] |
| `conclusion` | Conclusion | 3 | [0, 1, 2, 3] |
| `abstract` | Abstract | 6 | [0, 2, 4, 6] |

**Scoring guide:** 0 = not present · 1/2 = partial · 2/4 = complete · 3/6 = exceptional
**Total max = 42 points.**

The scoring UI renders **discrete tap buttons** for each criterion (not sliders). The `steps` array defines which buttons to show.

### Activity log (`log` state — Supabase `activity_log` table)
```js
[{ time: timestamp, msg: "Human readable string" }, ...]
// NEVER clear this on reset. Preserved for security review.
```

### IT diagnostic logs (`itLogs` state — Supabase `it_logs` table)
```js
[{ id, ts, level, module, event, detail, payload }, ...]
// level:  "ERROR" | "WARN" | "INFO" | "DEBUG"
// module: "AUTH" | "JUDGE" | "SCORE" | "ADMIN" | "SHARE" | "DB" | "SYSTEM"
```

### Judge validations (`judgeValidations` state — Supabase `validations` table)
```js
// Key: judgeId, Value:
{ approved: boolean, comment: string, validatedAt: timestamp }
// Persisted: upsert to validations(judge_id, approved, comment, validated_at)
// Loaded on init via loadValidations(); subscribed via app-realtime channel
// judge_id = 'admin' stores the admin's own validation entry
```

### Admin validation (`adminValidation` state — Supabase `validations` table, judge_id = 'admin')
```js
{ approved: boolean, comment: string, validatedAt: timestamp } | null
// Persisted same as judgeValidations — uses judge_id = 'admin'
```

### Deliberation notes (`deliberationNotes` state — Supabase `deliberation_notes` table)
```js
// Key: `${judgeId}_${projectId}`, Value:
{ comment, recommendation, flagged, submittedAt }
// recommendation: one of RECOMMENDATIONS array values
```

### Final decisions (`finalDecisions` state — Supabase `final_decisions` table)
```js
// Key: projectId, Value:
{ award, adminNotes, finalized: boolean, finalizedAt: timestamp | null }
// award: one of AWARD_OPTIONS array values
```

---

## 🔄 Validation & Deliberation Workflow

This is a **4-step finalization workflow** in the admin "Validation & Deliberation" tab (`adminTab === "deliberation"`).

### Overview
Results are **auto-computed** by the system (`projAvg`, `rankedProjects`). No human input is needed to generate rankings. The workflow is about validating those computed results before making them public.

### Step-by-step

**1. Judges validate (judge-home view)**
- Shown to a judge only after they complete all their assigned scoring.
- The judge sees a read-only ranked list of their assigned projects with computed averages.
- Two actions: **"Approve Results"** (sets `judgeValidations[judgeId].approved = true`) or **"Flag a Concern"** (opens an optional comment field, sets `approved = false`).
- Judge can revise their validation until admin finalizes (revision deletes their row from `validations` table).
- **Judges cannot re-score after validating** — the `proj-item` click handler is gated on `!judgeValidations[judge.id]`; cursor becomes `not-allowed` when validated.
- **Deliberation notes form** — when `deliberationOpen === true`, a 💬 Deliberation Notes section appears below the validation section showing a per-project form (recommendation dropdown, comment textarea, flag checkbox). Uses `delibDrafts` state keyed by `pid`. Submits to `deliberation_notes` table via upsert.

**2. Admin validates (Validation tab)**
- Admin reviews the `judgeValidations` table — shows each completed judge's status (Approved / Concern / Pending).
- Admin also validates themselves using "Approve Results" or "Flag a Concern".
- `adminValidation` state holds the admin's validation entry.

**3. Consensus check (automatic)**
- `consensusReached()` returns `true` when:
  - All completed judges (`judgeComp(j).pct === 100`) have `approved === true`
  - Admin has `approved === true`
- If consensus → green banner "Consensus reached" appears.

**4. Deliberation (conditional)**
- Deliberation is **only triggered** when:
  - **Tie detected** — `hasTie()` detects two or more projects with the same avg score → amber alert with "Open Deliberation" button appears automatically.
  - **Admin manually opens it** — "Open Manually" button always available.
- `deliberationOpen` (boolean) + `deliberationReason` (`"tie" | "manual" | null`) track state — persisted to `app_settings.deliberation_open`.
- While open, admin sees per-project cards showing:
  - **Per-judge score breakdown** — each judge's total (e.g. `Judge3 ░░░░░░░░ 35/42`) with a progress bar
  - **Judge scoring notes** — the optional `notes` field from scoring shown inline under each judge's bar (italic, left-bordered), only if the judge wrote one
  - **Deliberation notes** — recommendation pill + flagged status from `deliberation_notes` table
  - Admin assigns final awards (`finalDecisions`) per project
- Admin closes deliberation when done.
- If **all reviewers reached consensus and no tie exists**, the admin can finalize without ever opening deliberation.

**5. Finalize Results**
- The "Finalize Results" button is enabled when:
  - `adminValidation?.approved === true` AND
  - `deliberationOpen === false`
- Clicking it sets `resultsFinalized = true` and upserts `results_finalized: "true"` to `app_settings`.
- This **unlocks the Share tab** — the "Generate Live Results Link" button is disabled until `resultsFinalized`.
- `resultsFinalized` is loaded from `app_settings` on init — survives page refreshes.

### Key state variables for this workflow
```js
judgeValidations   // { [judgeId]: { approved, comment, validatedAt } } — persisted to validations table
adminValidation    // { approved, comment, validatedAt } | null — persisted as judge_id='admin'
resultsFinalized   // boolean — gates the Share tab; persisted to app_settings.results_finalized
deliberationOpen   // boolean — persisted to app_settings.deliberation_open
deliberationReason // "tie" | "manual" | null
valComment         // string — draft comment for validate/flag forms
showValForm        // boolean — shows the comment textarea

// Admin login protection
adminLoginAttempts // number — failed login counter (in-memory)
adminLockoutUntil  // number | null — timestamp when lockout expires (in-memory)

// Transfer PIN modal
showTransferPinModal // boolean — shows the custom transfer PIN entry modal
transferPinAlias     // string — judge alias being transferred
transferPin          // string — PIN draft input
transferPinErr       // string — error message in transfer modal

// Project deletion modal
showDeleteConfirm  // boolean — shows the delete confirmation modal
deleteProjectId    // string | null — project ID pending deletion

// Activity log filter
activityFilter     // string — keyword filter for the Activity Log tab

// Deliberation draft state (judge-home)
delibDrafts        // { [pid]: { comment, rec, flagged } } — per-project draft state for deliberation notes form
                   // Pre-populated from existing deliberationNotes when judge revisits a project
delibReportCopied  // boolean — copy feedback for deliberation summary

// Project management state (admin Projects tab)
showAddProject     // boolean — show add project modal
editingProject     // string | null — project ID being edited
projForm           // { title, cat, grade, num, department_id, advisor_name, group_members } — form fields for add/edit; advisor_name + group_members only editable when editing a project that has a registration_submissions row

// Department state
departments        // [{ id, name, max_judges, ord }] — synced from departments table
regDept            // string — selected department ID on judge-register view
deptMaxDrafts      // { [deptId]: string } — per-dept max judges draft input values

// Registration state (admin Registration tab + public-register view)
regLinks           // [{ id, token, active, expires_at, created_at }] — loaded on Registration tab open
regSubmissions     // summary rows from registration_submissions (display columns only)
deleteRegSub       // { id, reg_number, student_name } | null — submission pending delete modal
regForm            // full registration form fields including emailConfirm for double-entry validation
regFormErr         // string — validation error shown on registration form
regSubmitting      // boolean — submission in progress
regSuccess         // { regNumber, projectTitle, category } | null — shown on success screen
regTokenData       // registration_links row | null — validated token from URL param
regTokenChecked    // boolean — true once token validation has completed
```

### Key functions
```js
completedJudges()   // judges where judgeComp(j).pct === 100
hasTie()            // true if any two adjacent ranked projects share the same avg
consensusReached()  // true if all completedJudges approved + adminValidation.approved
valProgress()       // { total, approved, flagged, pending } for completed judges
submitJudgeValidation(approved)  // judge submits their validation
submitAdminValidation(approved)  // admin submits their validation
openDeliberation(reason)         // sets deliberationOpen=true, logs reason
closeDeliberation()              // sets deliberationOpen=false
finalizeResults()                // sets resultsFinalized=true, unlocks Share tab
```

---

## 💾 Offline & PWA Support

### PWA
- Configured via `vite-plugin-pwa` in `vite.config.js`
- Generates `sw.js` (service worker) and `manifest.webmanifest` at build time
- App shell (JS, CSS, HTML, fonts) is precached — loads without internet after first visit

### localStorage keys
| Key | Content |
|---|---|
| `sf_judge_id` | Judge's Supabase row ID |
| `sf_judge_data` | Full judge object (JSON) for offline session restore |
| `sf_scores_cache` | This judge's scores (JSON) for offline access |
| `sf_offline_queue` | Array of score payloads pending sync to Supabase |
| `sf_last_sync_at` | Timestamp of last successful sync to Supabase |
| `sf_judge_slug` | School slug the cached session belongs to — prevents a session from school A being restored at school B (all schools share one origin) |

### Offline flow
1. On mount, app instantly restores judge session + scores from `localStorage` (before Supabase loads)
2. After Supabase loads, session is verified — if judge was reset by admin, cache is cleared and judge is sent to landing
3. If Supabase is unreachable, cached session and scores remain active
4. Scores submitted offline are queued in `sf_offline_queue` and auto-synced when `window.online` fires
5. Judges see sync-state UI: pending-local warning, Sync Now button (when online), and last successful sync timestamp
6. 8-second timeout prevents infinite loading if Supabase is unreachable and there's no cache

---

## 🔗 Share Live Results Feature

The Share tab is **locked** (`resultsFinalized` must be `true`) before a link can be generated.

State variables:
```js
shareToken      // random token string e.g. "A3BF-9KX2-P7QR-W1TZ"
shareEnabled    // boolean
shareExpiry     // "1h" | "24h" | "7d" | "never"
shareCreated    // timestamp when link was generated
shareShowRubric // boolean — whether rubric breakdown shows on public page
shareTitle      // string — page heading on public results
resultsFinalized // boolean — must be true before generateLink() is enabled
```

`isLinkLive()` returns `true` only if `shareEnabled && shareToken && not expired`.

The public results page (`view === "public-results"`) shows:
- Podium (top 3 projects) — reordered visually as 2nd, 1st, 3rd
- Full ranked table with optional rubric breakdown chips
- **Award badges** on podium cards and table rows when `finalDecisions[pid]?.finalized` and award is not "No Award"/"Pending"
- **Judge names are never shown on the public page**

---

## 🎨 Design System

### Fonts (loaded from Google Fonts — also cached by service worker)
| Variable | Font | Usage |
|---|---|---|
| `--ff-d` | Merriweather 400/700/900 | Headings, titles |
| `--ff-b` | Source Sans 3 300–700 | Body text, UI labels |
| `--ff-m` | DM Mono 400/500 | Codes, IDs, timestamps, pills |

### Color palette (CSS variables — light theme)
```css
--bg:       #ffffff   /* page background */
--s1:       #f8fafc   /* card background */
--s2:       #f1f5f9   /* hover / secondary */
--bd:       #e2e8f0   /* borders */
--navy:     #1e3a5f   /* primary brand color */
--navy-l:   #2d5a8e   /* lighter navy (hover) */
--text:     #1e293b   /* primary text */
--dim:      #64748b   /* muted / secondary text */
--green:    #059669
--green-l:  #d1fae5
--red:      #dc2626
--red-l:    #fee2e2
--amber:    #d97706
--amber-l:  #fef3c7
--blue:     #2563eb
--blue-l:   #dbeafe
--purple:   #7c3aed
--purple-l: #ede9fe
--r:        12px      /* border-radius */
```

### Key CSS classes
- `.card` — white card with border and shadow
- `.btn` — navy primary button (full width by default)
- `.btn.sec` — secondary/ghost button
- `.btn.danger` — red destructive button
- `.btn.amber` — amber action button
- `.btn.purple` — purple action button
- `.btn.sm` — auto-width small button
- `.lbl` — monospace uppercase label above inputs
- `.badge` — inline pill: `.bg` (green) `.ba` (amber) `.br` (red) `.bb` (blue) `.bp` (purple)
- `.pbar` + `.pfill` — progress bar track + fill
- `.rub-steps` — flex container for discrete score buttons
- `.rub-step-btn` — individual score option button; `.selected` = active choice
- `.val-status-pill` — inline status pill: `.approved` (green) `.concern` (amber) `.pending` (gray)
- `.val-stat-pill` — summary count pill: `.green` `.red` `.dim`
- `.val-consensus-card` — consensus status card; `.reached` = green background
- `.val-tie-alert` — amber alert card for tie detection
- `.val-finalized-banner` — green banner when results are finalized
- `.offline-banner` — amber warning bar shown in judge views when offline
- `.locked-banner` — red warning bar when admin has locked judging
- `.it-term` — dark terminal-style container for IT logs
- `.pin-gate` — PIN entry screen (centered, full height)
- `.modal-overlay` + `.modal-box` — full-screen modal with blur backdrop
- `.delib-section` — deliberation container on judge-home
- `.delib-proj` — per-project card in judge deliberation view
- `.delib-rec-select` — styled recommendation dropdown
- `.delib-flag-wrap` — flag checkbox + label combo
- `.delib-submitted` — green confirmation badge for submitted notes
- `.delib-comment-card` — judge comment card in admin deliberation view
- `.delib-rec-pill` — recommendation pill (4 color variants: `.award`/`.strong`/`.good`/`.needs`)
- `.delib-flag-badge` — amber flag indicator
- `.delib-discuss` — red "discussion needed" badge
- `.delib-phase-toggle` — admin deliberation open/close toggle control
- `.delib-finalized` — green finalized decision row
- `.award-badge` — award display pill (variants: `.gold`/`.silver`/`.bronze`/`.hm`/`.best`/`.none`)
- `.proj-mgmt-header` — project management section header with add button
- `.proj-mgmt-table` — project list table in admin
- `.proj-act-btn` — small action button (edit/delete/lock) in project rows
- `.proj-form-overlay` + `.proj-form-card` — add/edit project modal
- `.proj-form-grid` — form layout grid for project fields
- `.proj-lock-badge` — lock/unlock status badge on projects

---

## ⚙️ Key Helper Functions

```js
// Scoring
getTotal(scoreObj)          // Sum all rubric scores → number (reads scoreObj.criteria)
rubricMax()                 // Total points available under the ACTIVE rubric — use instead of hardcoding 42
projectMax(proj)            // Points available for one project (excludes abstract when grade < 5)
critVal(scoreOrEntry, rid)  // Module helper — reads a criterion from .criteria, falling back to legacy flat fields
csvCell(v)                  // Module helper — quotes a CSV cell and neutralises =/+/-/@ formula injection
projAvg(pid)                // Average total score across all judges for a project → "xx.x" | null
rubAvg(pid, rid)            // Average of one rubric criterion for a project → "xx.x" | null
rankedProjects()            // All projects sorted by avg score descending (cross-department — rarely what you want)
rankedProjectsIn(deptId)    // Projects ranked WITHIN one department (pass null for unassigned). Use this for ties, results and exports
judgeComp(judge)            // { done, total, pct } completion stats for a judge
hasScored(pid)              // Boolean — has the current judge scored this project?
totalScored()               // Count of all score entries
possible()                  // Max possible scores (judges × their assigned projects)
draftTotal()                // Sum of draftSc entries (in-progress scoring)
allMoved()                  // Boolean — have all rubric criteria been set in draftSc?

// Validation & deliberation
completedJudges()           // Array of judges where pct === 100
hasTie()                    // Boolean — any two adjacent ranked projects share the same avg?
consensusReached()          // Boolean — all completedJudges approved + admin approved
valProgress()               // { total, approved, flagged, pending } for completed judges
submitJudgeValidation(bool) // Judge approves or flags results
submitAdminValidation(bool) // Admin approves or flags results
openDeliberation(reason)    // Opens deliberation ("tie" | "manual") — persists to app_settings
closeDeliberation()         // Closes deliberation — persists to app_settings
finalizeResults()           // Sets resultsFinalized=true, persists to app_settings, unlocks Share tab
loadValidations()           // Load all rows from validations table into judgeValidations + adminValidation
exportResultsCSV()          // Generate and download a CSV of ranked projects + awards (Share tab)
exportRegCSV()              // Fetch all registration_submissions fields and download as dated CSV (Registration tab)

// Registration management
loadRegLinks()              // Load all registration_links rows into regLinks state
loadRegSubmissions()        // Load summary columns from registration_submissions into regSubmissions state
generateRegLink()           // Insert a new active token into registration_links
generateRegNum(div,cat,projNum) // Return "{DivCode}-{CatCode}-{projNum}" string (synchronous)
deleteRegSubmission(sub)    // Delete a registration_submissions row; updates local state + activity log

// Deliberation helpers
getDelibNotesForProject(pid) // Array of { judgeAlias, comment, recommendation, flagged }
getRecBreakdown(pid)         // { [rec]: count } for all RECOMMENDATIONS
getFlagCount(pid)            // Number of flagged notes for a project
recPillClass(rec)            // CSS class for recommendation pill (award/strong/good/needs)
awardBadgeClass(award)       // CSS class for award badge (gold/silver/bronze/hm/best/none)
awardEmoji(award)            // Emoji for award (🥇/🥈/🥉/🏅/⭐/"")

// Project management
nextProjectNum()             // Next available project number (max + 1, zero-padded to 3 digits)
addProject()                 // Insert new project to Supabase + local state, logs to both
updateProject(pid)           // Update project fields (blocked if locked), logs to both
removeProject(pid)           // Cascading delete: scores, delib notes, final decisions, judge refs, project
toggleProjectLock(pid)       // Toggle locked boolean on a project

// Admin / shared
getAnomalies()              // Array of outlier objects where deviation > 8pts from group avg
isLinkLive()                // Boolean — is the public share link active and not expired?
addLog(msg)                 // Append to human activity log + Supabase activity_log
addItLog(level, module, event, detail, payload)  // Append structured IT log entry
assignProjects(deptId, projectList?)  // ALL project IDs in that dept (every judge in a dept scores every project in it). Pass projectList when `projects` state has not flushed yet
syncJudgeAssignments(deptIds, projectList?)  // Push the current roster to every judge in the given department(s) — MUST be called after any project add / department change, or the project is invisible to already-registered judges
ensureSeedData(schoolId)    // Re-seed departments + rubric if the signup flow could not (runs on first authenticated admin load)
writeProjectRow(mode, row, pid)  // Insert/update a project, transparently retrying without advisor_name/group_members if the migration has not been run
loadDepartments()           // Load/seed departments table; auto-seeds 3 defaults if empty on first run
updateDeptMaxJudges(deptId, newMax)  // Update max_judges for a department (blocked if would be < current count)
flushOfflineQueue()         // Sync any locally-queued scores to Supabase
allowJudgeTransfer(alias)   // Admin approves one-time judge transfer for 10 minutes — uses custom PIN modal, not window.prompt
confirmTransfer()           // Confirms the PIN in transfer modal and executes transfer
buildDelibReport()          // Generate formatted deliberation summary string for copy
buildSnapshot()             // Generate current system state snapshot string
executeReset()              // Reset all data EXCEPT activity log, projects and departments — requires schools.admin_pin

// Deliberation actions
submitDelibNote(pid)         // Upsert judge's deliberation note to Supabase, logs to both
handleToggleDeliberation()   // Toggle deliberation_open in app_settings, logs to both
saveFinalDecision(pid, award, adminNotes)  // Upsert final decision, set finalized=true
reviseDecision(pid)          // Set finalized=false on a decision, logs revision
```

---

## 🗄️ Active Backend (Supabase)

Supabase is **fully integrated and live**. Schema is applied at `supabase/schema.sql`.

### Tables
| Table | Purpose |
|---|---|
| `departments` | Department definitions (id UUID PK, name UNIQUE, max_judges INT, ord INT) — seeded with Elementary/Middle School/High School on first run |
| `projects` | Dynamic project list (id, num, title, cat, grade, locked, department_id FK→departments, created_at) |
| `judges` | Registered judges (id, alias, projects JSON, department_id FK→departments, joined_at); UNIQUE(department_id, alias) |
| `scores` | One row per judge+project pair; UNIQUE(judge_id, project_id) |
| `activity_log` | Human-readable audit trail — never deleted |
| `it_logs` | Structured diagnostic events |
| `share_links` | Public results tokens with expiry + revoked_at |
| `app_settings` | Key/value: `locked`, `deliberation_open`, `max_judges` (default 15), `results_finalized`, `judge_transfer_allowances` |
| `deliberation_notes` | Judge comments/recommendations per project (used during deliberation) |
| `final_decisions` | Admin award decisions per project |
| `validations` | Judge + admin validation entries — `judge_id` is judge UUID or `'admin'` |
| `score_backups` | Admin-saved score snapshots — full JSONB of all judge+project scores at a point in time |
| `registration_links` | Admin-generated registration tokens (active/inactive, optional expiry) |
| `registration_submissions` | Full form submissions — one per student; linked to `projects` via `project_id` |

### Realtime
All tables are subscribed via a single `supabase.channel("app-realtime")` — changes propagate live across all open tabs/devices.

**Optimized handlers (do NOT revert to full table refetches):**
- `scores`, `judges`, `deliberation_notes`, `final_decisions`, `validations` — on INSERT/UPDATE, state is updated directly from `payload.new` without re-fetching the table. Full `loadX()` refetch only fires on DELETE events (reset/project removal).
- `activity_log`, `it_logs` — INSERT-only listeners prepend the new row to state from `payload.new`. These tables are append-only so only INSERT is subscribed.
- `projects`, `share_links`, `app_settings` — still use full `loadX()` since they change rarely (admin-only actions) and correctness matters more than speed.

This prevents the cascade of 3+ full Supabase queries + component re-renders that previously fired on every single score submission.

### RLS
Row Level Security is enabled on all tables with open anon policies (public read/write). Full per-judge enforcement requires Supabase Auth (not yet implemented).

---

## 🚫 Critical Rules — Do NOT Break These

0. **Every Supabase query must be scoped by `school_id`.** All loaders accept a `sid` param (`sid || currentSchool?.id`). All inserts include `school_id: currentSchool.id`. All updates/deletes include `.eq("school_id", ...)`. This is the core multi-tenant isolation guarantee — missing a scope leaks data across schools.
0a. **`app_settings` PK is `(school_id, key)`.** All upserts must include `school_id`. Never use `.eq("key", x)` alone — always chain `.eq("school_id", currentSchool.id).eq("key", x)`.
0b. **`validations` conflict is `(school_id, judge_id)`.** Upsert must specify `onConflict: "school_id,judge_id"`.
0c. **`final_decisions` conflict is `(school_id, project_id)`.** Upsert must specify `onConflict: "school_id,project_id"`.
0d. **Admin login is Supabase Auth** — `supabase.auth.signInWithPassword({ email, password })`. There is no `VITE_ADMIN_PASS`. Never revert to env-var password comparison.
0e. **Scoring criteria are JSONB** — `scores.criteria = { [criterion_id]: value }`. There are no fixed columns (presentation, testable_q, etc.) in v2. `getTotal(s)` reads `s.criteria`, `rubAvg` reads `s.criteria?.[rid]`, `submitScore` sends `{ criteria: {...draftSc} }`.
0f. **`rubric` state is dynamic** — loaded from `rubrics` table per school. Never hardcode `RUBRIC` constant references in scoring logic. Use `rubric` (the state variable) everywhere. `DEFAULT_RUBRIC` is only a fallback/seed value.

1. **Never clear the activity log (`log` state) on reset.** Preserved for security purposes. `executeReset()` resets: judges, scores, locked, share*, deliberationNotes, finalDecisions, validations table rows, resultsFinalized (`app_settings`), deliberationOpen, maxJudges. It does NOT clear projects or the activity log.
2. **Judge names must never appear on the public results page.** The `view === "public-results"` page is visible without login — keep it score + project data only.
3. **IT Logs tab, Reset modal, and Judge Transfer approval all use `schools.admin_pin`.** They share the same per-school PIN (fetched only after admin auth) but have separate flows/states. There is no `VITE_IT_PIN` in v2.
4. **All CSS is inline** in the `CSS` template literal. Do not create external `.css` files.
5. **No routing library.** All navigation uses `setView(...)`. Do not introduce React Router.
6. **The score key format is `${judgeId}_${projectId}`** — used throughout for lookups. Do not change it.
7. **Rubric has 10 criteria summing to 42 pts max.** See rubric table above. Do NOT revert to the old 6-criteria/100-pt rubric. Each criterion uses discrete `steps` values — do not replace with continuous sliders.
8. **Judge names are configurable.** `JUDGE_NAMES` pre-generates Judge1–Judge100. The enforced limit is **`departments.max_judges`, per department** — a judge registering in Elementary must be Judge1–Judge{Elementary.max_judges}. Do not hardcode judge limits.
9. **Max judges is per-department and event-locked.** Admin sets each department's cap on the Overview tab via `updateDeptMaxJudges()`; it locks once the first judge registers **in that department** (others stay editable). Stored in `departments.max_judges`. ⚠️ The old global `app_settings.max_judges` / `maxJudges` state was **removed 2026-09-25** — it was never enforced. Do not reintroduce it.
10. **Every judge scores every project.** `assignProjects()` returns ALL project IDs, not a subset. This ensures:
    - Each project gets comprehensive scoring (N judges × 1 project = N scores per project)
    - Robust averages (not dependent on random assignment)
    - Fair evaluation (no "easier" or "harder" project subsets for different judges)
    - Do NOT revert to seed-based per-judge project assignment
11. **Share tab is gated by `resultsFinalized`.** The "Generate Live Results Link" button must remain disabled until `resultsFinalized === true`. Do not remove this gate.
12. **Deliberation is conditional.** It must NOT auto-open on every session — only on tie detection or admin manual trigger. If all reviewers reached consensus, finalization proceeds without deliberation.
13. **Locked projects cannot be edited or removed.** The `locked` boolean on the `projects` table (and local state) must be checked before any update or delete operation. Only `toggleProjectLock()` can change the lock state.
14. **Removing a project must cascade-delete all related data.** When `removeProject(pid)` runs, it must delete: scores with that `project_id`, deliberation notes with that `project_id`, final decisions for that project, and remove the project ID from all judge assignment arrays. No orphaned records.
15. **Projects are NOT cleared on reset.** Projects are configuration data, not session data. `executeReset()` clears judges, scores, deliberation data, share links, and settings (including max_judges) — but never the projects table.
15a. **Departments are NOT cleared on reset.** Like projects, departments are event configuration. `executeReset()` does not touch the `departments` table. Department max_judges and names persist across resets. Per-dept judge counts return to 0 after reset (judges table cleared), so max_judges becomes editable again for each department.
16. **`REG_CATEGORIES` constant defines allowed project categories** (used in both the registration form and the admin add/edit project form): `["Life Science","Earth and Space Science","Physical Science","Engineering and Technology"]`. The old `CATEGORIES` constant (`["Biology","Physics",...]`) is no longer used for dropdowns — do not revert to it.
17. **Never use `window.prompt` or `window.confirm`.** Both are blocked in PWA/standalone mode on iOS and Android. Use the custom modal pattern (`modal-overlay` / `modal-box`) instead. The judge transfer flow and project deletion flow both already use custom modals.
18. **Judges cannot re-score after validating.** The `proj-item` click handler checks `!judgeValidations[judge.id]` — validated judges see projects as non-clickable (cursor: not-allowed). Do not remove this gate.
19. **`submitDelibNote` is gated on `deliberationOpen`.** It returns early if deliberation is closed. Do not allow judges to submit deliberation notes outside an active deliberation session.
20. **Leaderboard always separates scored vs unscored projects.** `rankedProjects()` returns all projects, but the Overview leaderboard renders scored (avg !== null) first, then a divider row, then unscored projects at 50% opacity. Do not mix them.

21. **Any project change must re-sync judge assignments.** `judges.projects` is a snapshot taken at registration. `addProject()` and a department change in `updateProject()` MUST call `syncJudgeAssignments()`, otherwise the project is invisible to every judge who already signed in. `removeProject()` does its own removal pass.
22. **Never hardcode the max score.** Use `rubricMax()` (whole rubric) or `projectMax(proj)` (respects the grade <5 abstract exemption). Rubrics are per-school and editable, so a literal `42` is always a bug.
23. **Score reads go through `.criteria`.** v2 stores `scores.criteria` as JSONB. Use `getTotal()` / `critVal()` — never `score.presentation` and friends, which are v1 columns that no longer exist. This silently broke backups and CSV exports for months.
24. **Ranking and tie detection are per-department.** Use `rankedProjectsIn(deptId)`. Projects in different departments do not compete, so a cross-department tie is meaningless and will force spurious deliberation.
25. **Enforce gates in the handler, not just the UI.** `locked` and "judge already validated" are checked inside `submitScore()`, not only on the project tile's `onClick`. RLS is permissive on `scores`, so the handler is the real gate.
26. **All four share/registration URLs must include `/s/{slug}`.** `shareUrl()`, `projListUrl()` and the registration URL build from `${origin}/s/${currentSchool.slug}`. A bare origin lands on the platform homepage and the link appears broken.
27. **Never use `try/finally` inside the `App` component.** It makes the React Compiler bail out, which silently disables the `react-hooks/purity` and `react-hooks/immutability` lint rules for the whole file (41 findings vanished when this was introduced accidentally). Use `.finally()` on a promise — see `flushOfflineQueue()`.
28. **Every CSV cell goes through `csvCell()`.** It quotes the value and neutralises leading `=`, `+`, `-`, `@` so a project title cannot execute as a spreadsheet formula.

---

## 💡 Common Edit Patterns

**Adding a new rubric criterion:**
1. Add entry to `RUBRIC` array with `{ id, label, desc, max, steps }`
2. Ensure all `max` values still sum to the intended total (currently 42)
3. Update `SEED_SCORES` to include the new key
4. Add the new column to `supabase/schema.sql` scores table and run migration

**Changing the scoring UI per criterion:**
- The UI renders `.rub-step-btn` buttons from `r.steps` array
- To change allowed values for a criterion, edit the `steps` array in `RUBRIC`
- Do not re-introduce `<input type="range">` — the discrete button design is intentional

**Adding a new admin tab:**
1. Add `{ id, ico, label }` to `navItems` array inside the admin dashboard render
2. Add `{adminTab === "yourid" && <> ... </>}` block inside `.adm-main`

**Adding a new IT log event:**
Call `addItLog(level, module, event, detail, payload)` anywhere in the code.

**Changing credentials:**
All credentials are per-school rows in the database — v2 has no credential env vars:
- Judge invite code: `schools.invite_code` (admin can change it)
- Admin login: Supabase Auth email + password (set at school registration)
- IT/Reset/Transfer PIN: `schools.admin_pin` (4 digits, defaults to `0000` — change it before an event)

**Adding more judges (beyond 15):**
Admin configures max judges via the UI on the Overview tab before judging begins. `JUDGE_NAMES` is now `Array.from({ length: 100 }, (_, i) => \`Judge${i + 1}\`)` — 100 slots pre-generated. `maxJudges` state (loaded from `app_settings`) is the actual enforced limit. Set it to any value up to 100 via the UI; no code changes needed.

**Adding a new view/screen:**
1. Add a new `if (view === "yourview") return (...)` block
2. Navigate to it with `setView("yourview")`

**Deploying:**
Push to `main` branch on GitHub — Vercel auto-deploys. No manual steps needed.

**Adding a project (admin UI):**
Admin clicks "+ Add Project" in the Projects tab → fills in title, category, grade → project is inserted into Supabase `projects` table with an auto-generated ID (`p_` + random) and the next available number (zero-padded). Realtime syncs to all clients.

**Removing a project (admin UI):**
Admin clicks the delete button on an unlocked project → `removeProject(pid)` performs cascading cleanup:
1. Deletes all scores where `project_id = pid`
2. Deletes all deliberation notes where `project_id = pid`
3. Deletes the final decision for that project
4. Removes `pid` from each judge's `projects` array in Supabase
5. Deletes the project row itself
6. Updates all local state accordingly

**Locking/unlocking a project:**
Admin clicks the lock toggle → `toggleProjectLock(pid)` flips the `locked` boolean in both Supabase and local state. Locked projects show a lock badge and cannot be edited or deleted.

**Changing project categories:**
Edit the `CATEGORIES` constant array. This affects the category dropdown in the add/edit project form.

**Exporting results to CSV:**
Call `exportResultsCSV()` from the Share tab (visible only when `resultsFinalized`). Generates a CSV with columns: Rank, Project #, Title, Category, Grade, Avg Score, Reviews, Award. Downloaded via `URL.createObjectURL`.

**Exporting registration submissions to CSV:**
Call `exportRegCSV()` from the Registration tab (Export CSV button, disabled when no submissions). Does a full `select("*")` on `registration_submissions` and downloads all 25 fields as `registrations_YYYY-MM-DD.csv`. Button is disabled when `regSubmissions.length === 0`.

---

## Rules (project-init)
- Check Obsidian project note before starting work: `C:\Users\Cerus\OneDrive\Documents\Obsidian Vault\projects\sciencefair-judging-app.md`
- Update Session Log at end of each session
- Run `/graphify .` after major refactors
- Use `py -m graphify` not `graphify` directly (Windows PATH issue)

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
