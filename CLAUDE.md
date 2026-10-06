# Qritiko — Science Fair Judging App · Claude Code Context

> Single source of truth for AI-assisted development. Read it before changing anything.
> Do not delete it. When code and this file disagree, the code wins — then fix this file.
>
> Last reviewed: 2026-10-06 (per-school categories + Setup tab; see Change History).

---

## 🧭 Project Overview

A **multi-tenant SaaS judging platform** for school science fairs. Any school self-registers
and runs its own fair with isolated data, its own rubric and its own admin login.

- **Frontend:** one React component, [src/ScienceFairJudging.jsx](src/ScienceFairJudging.jsx) (~5,900 lines)
- **Backend:** Supabase — PostgreSQL + Realtime + Auth
- **PWA:** installable on tablets/phones; judges can score offline and sync later
- **Default rubric:** Northeast AZ Regional Science and Engineering Fair sheet (10 criteria, 42 pts) — editable per school
- **Scale:** 1–100 judges per department, 150+ projects per school
- **Devices:** tablets (primary), phones, laptops, Chromebooks

### Environments

| Thing | Value |
|---|---|
| Live URL | https://qritiko.com/ (platform homepage) → https://qritiko.com/s/{slug} (a school's fair) |
| Redirects | `www.qritiko.com` and `app.qritiko.com` → 308 to `qritiko.com` (apex is canonical since 2026-09-30) |
| DNS | Cloudflare, all records **DNS only** (grey cloud). Apex `A qritiko.com → 76.76.21.21`; `www` → CNAME `cname.vercel-dns.com`; `app` → CNAME `0a80f066a911951b.vercel-dns-017.com` |
| Supabase | https://evrupqnhgrfltfhafeyj.supabase.co |
| Vercel | `sciencefair-v2` — the **only** Vercel project |
| Deploy | Push to `main` → auto-deploys. No manual steps |
| Base schema | [supabase/schema-v2.sql](supabase/schema-v2.sql) (**base only**) + every migration below, in order |
| Tests | `npm test` — mocked scan API + real-Postgres (PGlite) migration/RLS suite. Run after any `supabase/*.sql` or `api/` change |
| Browser tests | `npm run test:e2e` — real app in Edge with Supabase + scan API faked (`scripts/e2e/mock.mjs`): school sign-up, admin, scanner, judge, Setup tab, public registration, phone/tablet widths. Start the dev server first (see the file header). 122 checks across 5 files |
| Server env vars | `GEMINI_API_KEY` (paid key), optional `GEMINI_MODEL`, `RESEND_API_KEY`, `EMAIL_FROM` — Vercel only, never `VITE_` |

⚠️ **Apex outage, 2026-10-01:** the apex A record pointed at `216.198.79.1`, which answered
HTTP but **refused HTTPS**, so `https://qritiko.com` was down for everyone while `www`/`app`
still redirected into it. Fixed by changing the record to `76.76.21.21`. After any DNS change,
verify with `curl -sI https://qritiko.com/` — a working port 80 proves nothing.

⚠️ **Exactly one hostname may serve the app.** `localStorage` is per-origin: a judge who
signs in on one hostname and opens another looks signed out, and anything in
`sf_offline_queue` is stranded on the first origin — silent score loss. Never promote a
second domain to "Production" in Vercel; make it a redirect. `sciencefair-v2.vercel.app`
always serves and cannot be redirected — never share it.

### Migrations (run in this order on the v2 project)

| File | Adds | Coupled to app code? |
|---|---|---|
| `migration-2026-09-project-adviser.sql` | `projects.advisor_name`, `projects.group_members` + backfill | No — app retries without the columns if missing |
| `migration-2026-09-security-hardening.sql` | RLS lockdown, `registration_count()` | **Yes** |
| `migration-2026-09b-pin-and-judge-auth.sql` | bcrypt PIN, `security_attempts`, `register_judge()`, PIN/invite RPCs, judge-scoped write policies | **Yes — deploy together with the app build** |
| `migration-2026-10-project-details.sql` | `projects.room`, `description`, `motivation` | No — app drops the columns and logs `PROJECT_DETAIL_COLS_MISSING`, **but those fields are then silently not saved** |
| `migration-2026-10b-private-members-and-registration.sql` | Moves adviser + student names to admin-only **`project_private`** (drops `projects.advisor_name` / `group_members`); adds 12 missing `registration_submissions` columns; **`submit_registration()`** RPC; closes direct anon INSERT on submissions | **Yes — run it, then deploy the matching app immediately.** Old app + new SQL saves projects without names |
| `migration-2026-10c-secure-school-signup.sql` | **`create_school()`** RPC; closes direct INSERT on `schools` and `school_admins` (anyone could make themselves admin of any school) | **Yes** — the sign-up form calls `create_school()`. Run before anyone registers a school |
| `migration-2026-10d-judge-revise-validation.sql` | Judges may delete their own validation until results are finalized (never the admin's) | No — without it "Revise my validation" shows an error instead of unlocking |
| `migration-2026-10e-categories-and-department-codes.sql` | **`categories`** table (per-school project categories) + seeds the six for every existing school; **`departments.code`** | No — **additive only**. Old app ignores both; new app falls back to `DEFAULT_CATEGORIES` and logs `CATEGORIES_TABLE_MISSING`. Safe to run in either order |

`registration-migration.sql` and `schema.sql` are historical (the latter is the v1 schema).

### v1 — retired 2026-09-25

v1 (Supabase `cjzuiimoamrggucvahjm`) is gone. Both Vercel projects built from `main`, so
the June 2026 v2 rewrite silently replaced v1's frontend too and it served 404s for ~4
months. The data is archived **outside the repo** at `D:\Desktop\sciencefair-v1-archive\`
because `registration_submissions` holds student and guardian PII — never commit it.
The v1 Vercel project was deleted 2026-09-30. **Do not resurrect v1.**

---

## 📁 File Structure

```
/
├── src/
│   ├── ScienceFairJudging.jsx   ← Entire app (single file)
│   ├── supabaseClient.js        ← Supabase client init (reads .env)
│   └── main.jsx                 ← React root + PWA service-worker registration
├── api/
│   ├── send-registration-email.js ← Vercel function: registration confirmation via Resend
│   └── scan-form.js             ← Vercel function: reads participation forms with Gemini (admin-only)
├── scripts/
│   ├── scan-form.test.mjs       ← mocked tests for api/scan-form.js (free, offline)
│   ├── db-migrations.test.mjs   ← schema + all migrations on real Postgres (PGlite): RLS, RPCs
│   ├── e2e/                     ← browser tests (playwright-core + mocked backend); screenshots in e2e/out/ (gitignored)
│   │                              scan · judge-reg · signup · setup (departments/categories) · lifecycle
│   └── scan-form-smoke.mjs      ← real-Gemini smoke test for form scanning (needs GEMINI_API_KEY)
├── supabase/
│   ├── schema-v2.sql            ← v2 multi-tenant base schema
│   ├── migration-2026-09*.sql   ← see Migrations table above
│   ├── registration-migration.sql ← historical
│   └── schema.sql               ← v1 schema — historical, do not apply
├── public/                      ← favicon.svg, logo.png (also PWA icon), icons.svg
├── graphify-out/                ← knowledge graph (GRAPH_REPORT.md, graph.json)
├── index.html                   ← PWA meta tags
├── vite.config.js               ← Vite + vite-plugin-pwa
├── vercel.json                  ← rewrites /s/:slug(/*) → index.html
├── .env / .env.example          ← VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY only
├── .npmrc                       ← legacy-peer-deps=true (vite-plugin-pwa on Vite 8)
├── CLAUDE.md                    ← this file
├── AdminInstructions.md         ← end-user guide for admins
├── JudgeInstructions.md         ← end-user guide for judges
└── QA_ASSESSMENT.md             ← 2026-03 QA review, all items closed (historical)
```

All CSS lives in one `const CSS = \`...\`` template literal injected via `<style>`. No `.css`
files, no Tailwind, no CSS modules.

---

## 🏗️ Architecture

- **One default export:** `App()`. **No router** — screens switch on a `view` string.
  **No state library** — plain `useState`.
- **Realtime:** one channel per school, `supabase.channel(\`school-${sid}\`)`, every
  listener filtered by `school_id`.

### School resolution (on mount)
1. `urlSchoolSlug` is read from `window.location.pathname` (`/s/{slug}`) at module load.
2. No slug → view `"school-select"` (platform homepage).
3. Slug → fetch `schools` by slug, selecting **only `id, name, slug`** (the only columns anon may read).
4. Found → `setCurrentSchool`, load all school data, subscribe to realtime. Not found → "School Not Found".
5. URL params read at module load: `?token=` (public results), `?register=` (student form), `?projects=` (public project list).

### Auth flow (admin)
- `handleAdminLogin()` → `supabase.auth.signInWithPassword({ email, password })`. 5 failures → 30 s lockout (in-memory), each logged as `ADMIN_LOGIN_FAILED`.
- `onAuthStateChange` → look up `school_admins.school_id` → load `schools` (`id, name, slug`).
  The admin's school is adopted **only if its slug matches the URL slug**, otherwise reads
  would hit school B while writes hit school A.
- After sign-in it also runs `ensureSeedData()`, `loadLog()`, `loadItLogs()`,
  `loadScoreBackups()` and `loadInviteCode()` — those tables are admin-read-only, so the
  anonymous `init()` load returned nothing.
- **`ensureSeedData()` is the only place that seeds** departments, categories, the rubric and
  baseline `app_settings`. Loaders never seed: RLS makes those inserts admin-only, so an inline
  seed in a loader silently failed for every judge and visitor. If a table is empty the app keeps
  its `DEFAULT_*` fallback (with `id: null`) so the UI still renders.
- The admin PIN and invite code are **never** loaded into `currentSchool`. Use
  `verifyAdminPin(pin)` / `changeAdminPin()` and `loadInviteCode()` (`school_invite_code` RPC).
- `handleAdminLogout()` → `supabase.auth.signOut()`.

### Judge sign-in flow
1. Judge picks a **department**, enters an alias (`Judge1`–`Judge{dept.max_judges}`) and the invite code.
2. `handleRegister()` calls the `register_judge(school_id, department_id, alias, invite_code)`
   RPC. **All checks are server-side:** invite code (rate-limited), alias range, department
   capacity, duplicate alias, and the one-time admin-approved device transfer.
3. The judge row is assigned every project in their department (`judges.projects`).
4. Session is saved to `localStorage` (`sf_judge_id`, `sf_judge_data`, `sf_judge_slug`).

### Views (`view` state)

| `view` | Screen |
|---|---|
| `school-select` | Platform marketing homepage — enter a slug or register a school |
| `school-register` | School sign-up — auth user, school row (PIN hashed by trigger), settings, departments, rubric |
| `landing` | Per-school landing — Judge / Admin cards (+ "LIVE RESULTS" card while a share link is live) |
| `judge-register` | Judge sign-in (department + alias + invite code) |
| `judge-home` | Judge's project list, progress, validation, deliberation notes |
| `judge-scoring` | Scoring form for one project |
| `admin-login` | Admin email + password |
| `admin-home` | Admin dashboard (tabbed) |
| `public-results` | Public results — via valid `?token=`, the landing card, or admin preview |
| `public-register` | Student self-registration — via `?register=<token>` (initial view only) |
| `public-projects` | Public project list — via `?projects=<token>` (initial view only). ⚠️ No UI generates this token |

### Admin tabs (`adminTab` state)

| `adminTab` | Content |
|---|---|
| `overview` | Stats, per-department leaderboards, "Get started" card (invite code, school URL), Change PIN card, Lock Judging, a summary card linking to Setup |
| `setup` | **Departments** (add / rename / reorder / delete / max judges / presets) and **project categories** (add / rename / reorder / delete / restore defaults). Both are per-school data — see rule 14 |
| `judges` | Per-judge progress grouped by department; Allow Transfer (PIN) |
| `projects` | Add/edit/remove/lock projects, **📷 Scan forms** (AI form reader), rubric breakdown, project-list PDF |
| `registration` | Student registration links + submissions, registration CSV |
| `activity` | Human-readable activity log with keyword filter |
| `alerts` | Anomaly detection (>8 pt deviation) + system status |
| `deliberation` | Validation & deliberation workflow, final awards, finalize |
| `share` | Public results link — **locked until results are finalized**; results CSV |
| `export` | Per-judge CSV + score backups |
| `rubric` | Edit criteria / max / steps / order; save to `rubrics`; reset to default |
| `itlogs` | IT diagnostic terminal + Reset All Data (PIN-gated) |
| `help` | **Help & FAQ** — how the system works, before-event checklist, do's / don'ts, data safety, scanning, judges, troubleshooting. Content = `ADMIN_HELP` constant (top of the JSX) |

### AnimatedBackdrop
**Disabled** — the render path is hardcoded to `const backdrop = null;` for tablet input
latency. If ever re-enabled: keep the ~30 fps cap and ≤36 atoms (O(n²) bond loop on the main thread).

---

## 🔐 Security & Access Control

**The anon key is public** (it ships in the JS bundle). RLS and SECURITY DEFINER functions are
the only real controls. "The UI does not expose it" is never a control.

### Credentials (all per-school, in the DB — v2 has no credential env vars)

| Access | Credential | Enforced by |
|---|---|---|
| Admin dashboard | Supabase Auth email + password (set at school sign-up) | Supabase Auth |
| Judge sign-in | Alias + `schools.invite_code` | `register_judge()` — invite code never sent to anon clients |
| IT Logs, Reset All Data, judge transfer | `schools.admin_pin` — **bcrypt hash**, 4–8 digits chosen at sign-up | `verify_school_pin()` |
| Registration email | `RESEND_API_KEY`, `EMAIL_FROM` (Vercel server env only — never `VITE_`) | `api/send-registration-email.js` |
| Form scanning (Gemini) | `GEMINI_API_KEY` (Vercel server env only, **paid** key), caller's Supabase session | `api/scan-form.js` — checks `school_admins` before calling Gemini |

### Server-side functions (migration 2026-09b unless noted)

| Function | Caller | Purpose |
|---|---|---|
| `register_judge(school, dept, alias, code)` | anon | The **only** way to create a judge row |
| `verify_school_pin(school, pin)` | anon/auth | Returns boolean; 5 failures → 5-minute lockout per school |
| `set_school_pin(school, pin)` | admin | Change PIN (min 4 chars); re-hashed server-side |
| `school_invite_code(school)` | admin | Read own invite code |
| `set_school_invite_code(school, code)` | admin | Change invite code (⚠️ no UI calls it yet) |
| `registration_count(school)` | anon | Count only (hardening migration). No longer used by the app since 2026-10b |
| `create_school(user_id, name, slug, invite_code, pin, rubric)` | anon/auth | **The only way to create a school** (2026-10c). Creates school + owner link + 3 settings + 3 departments + rubric in one transaction. Owner must be the caller (signed in) or an account < 24 h old with no school (email-confirm path). Slug, name, invite code and PIN validated server-side |
| `submit_registration(token, form)` | anon | **The only way a public registration gets in** (2026-10b). Validates the link token, then creates project + `project_private` + submission in one transaction, numbering under a per-school advisory lock. Errors raised as `P0001` are written for the student |
| `is_school_admin(school)` | policies | Admin check used throughout RLS (base schema) |
| `hash_admin_pin()` trigger | — | Hashes `admin_pin` on INSERT/UPDATE; leaves existing bcrypt values alone |

Rate limiting uses the `security_attempts` table (`note_auth_failure`, `assert_not_locked`).

### RLS summary

| Table | Policy |
|---|---|
| `schools` | anon/auth may SELECT only `id, name, slug, created_at`. `admin_pin` and `invite_code` are granted to nobody. UPDATE admin-only. **INSERT closed** — `create_school()` only |
| `school_admins` | **INSERT `WITH CHECK (false)`** — rows are created only by `create_school()`. Was `WITH CHECK (true)` until 2026-10c |
| `judges` | INSERT `WITH CHECK (false)` (RPC only); UPDATE admin-only |
| `scores`, `deliberation_notes` | INSERT/UPDATE require the `judge_id` to exist in `judges` for that school |
| `validations` | Same, or `judge_id = 'admin'` written by a school admin. DELETE: admin, or a judge for their own (non-admin) row while `results_finalized` is not `true` (2026-10d) |
| `app_settings` | Read open (judges need `locked`, `deliberation_open`, transfer allowances); **write admin-only** |
| `registration_submissions` | INSERT `WITH CHECK (false)` — only via `submit_registration()`; SELECT/UPDATE admin-only (student PII) |
| `projects` | SELECT open (judges + public pages need titles/room/description). **Must never hold names** — see rule 45 |
| `categories` | SELECT open (the public registration form and judge views render the list without a session); INSERT/UPDATE/DELETE `is_school_admin(school_id)`. No personal data, so an open read is fine |
| `project_private` | Adviser + student names. All operations `is_school_admin(school_id)`; anon has **no privileges at all**. Realtime enforces the same RLS |
| `activity_log`, `it_logs` | INSERT open; SELECT admin-only |
| `score_backups` | Admin-only |

### Open risks — next security work

- **Judges are anonymous.** Anyone holding the invite code can register and then write
  *another* judge's scores: policies prove *a* valid judge exists, not *which* judge is
  calling. Fix: per-judge identity (Supabase anonymous auth, `user_id` on the judges row).
- **`share_links` and `registration_links` are anon-SELECTable** so visitors can validate
  their own token — tokens are enumerable, so links are "unlisted", not secret. Same for
  `app_settings.project_list_token`. Fix: `verify_*_token` SECURITY DEFINER RPCs.
- **The judging lock is not in RLS — on purpose** (see rule 30). It is enforced in `submitScore()`.
- ~~Anyone could make themselves admin of any school~~ — **fixed 2026-10-05 (migration 2026-10c)**.
  `school_admins_insert` was `WITH CHECK (true)` from the base schema and never tightened: any
  free Supabase account could insert `(school_id = victim, user_id = self)`. Verified live by a
  no-write probe (the insert got as far as the FK check). Now `create_school()` only.
- ~~Student names on projects were publicly readable~~ — **fixed 2026-10-05 (migration 2026-10b)**.
  `projects?select=group_members` returned names to anyone with the anon key. Names now live in
  `project_private`. A column-level REVOKE was rejected on purpose: Supabase Realtime sends whole
  rows to anyone passing RLS and ignores column privileges, so it would still leak.

### Other access rules
- Judges sign in by number (`Judge1`–`JudgeN`); N is per department. Same alias may exist in different departments.
- Device transfer: admin clicks **Allow Transfer** (PIN modal) → one-time allowance valid ~10 minutes, consumed by `register_judge()`.
- **Activity log is never cleared** — it is the security audit trail.
- Public results never show judge names.

---

## 📊 Data Model

### Tables (`schema-v2.sql` + migrations — every table has `school_id`)

| Table | Purpose |
|---|---|
| `schools` | id, name, slug, invite_code, admin_pin (bcrypt) |
| `school_admins` | Links a Supabase Auth user to a school |
| `rubrics` | Per-school rubric — `criteria` JSONB array, `is_active` |
| `departments` | name, `code`, `max_judges`, `ord` — seeded from `DEPT_PRESETS[0]`, fully admin-editable. `code` (2026-10e) is reserved for registration numbers; nothing reads it yet |
| `categories` | Per-school project categories: name, `code`, `ord` (2026-10e). UNIQUE(school_id, name). **No FK from `projects`** — `projects.cat` is a free-text snapshot, so deleting a category never alters a project |
| `projects` | num, title, cat, grade, locked, department_id, room, description, motivation — **public, no names** |
| `project_private` | PK `(project_id, school_id)`, FK → projects **ON DELETE CASCADE**: advisor_name, group_members (JSONB), updated_at — **admin-only** |
| `judges` | alias, `projects` (JSON array of pids), department_id, joined_at. UNIQUE(department_id, alias) |
| `scores` | One row per judge+project; `criteria` JSONB, notes, total. UNIQUE(judge_id, project_id) |
| `validations` | Judge/admin validation; `judge_id = 'admin'` for the admin. Conflict `(school_id, judge_id)` |
| `deliberation_notes` | Judge recommendation/comment/flag per project |
| `final_decisions` | Admin award per project. Conflict `(school_id, project_id)` |
| `app_settings` | Key/value, PK `(school_id, key)`: `locked`, `deliberation_open`, `results_finalized`, `judge_transfer_allowances`, `project_list_token` |
| `share_links` | Public results tokens, expiry, `revoked_at` |
| `score_backups` | Admin snapshots — scores **and a copy of the rubric** |
| `registration_links` | Student registration tokens |
| `registration_submissions` | Full student form submissions (PII) |
| `activity_log` | Human audit trail — never deleted |
| `it_logs` | Structured diagnostics |
| `security_attempts` | Failure counters for PIN / invite-code rate limiting |

⚠️ **`group_members` comes in three shapes — always read it through `normMembers(raw)`:**

| Where | Type | Shape |
|---|---|---|
| `project_private.group_members` (2026-10+) | JSONB | `[{"name":"Juan","grade":"8"}]` — what the app writes now |
| `project_private.group_members` (backfilled 2026-09 rows) | JSONB | `["Juan","Maria"]` — still valid, never rewritten |
| `registration_submissions.group_members` | **TEXT** | `"Juan, Maria"` — write names joined with `", "`, never an array |

`normMembers()` returns `[{ name, grade }]` for all three; `membersText()` formats them for display
(`"Juan (Gr 8), Maria"`); `highestGrade()` picks the group's top grade. `loadProjects()` merges
`project_private` into each project (admins only — for everyone else that query returns nothing)
and normalises, so `projects` state always holds the object shape. Before 2026-10b it falls back
to the old `projects.advisor_name` / `group_members` columns; `writeProjectPrivate()` does the same
on write and logs `PROJECT_PRIVATE_TABLE_MISSING`.

**Project grade** = what the admin typed, or (if blank) the **highest student grade**. It drives
the grade < 5 abstract exemption, so a mixed group is judged at its oldest member's level.

### Client state shapes

```js
departments  // [{ id, name, code, max_judges, ord }] — fallback DEFAULT_DEPARTMENTS (ids null) until loaded
categories   // [{ id, name, code, ord }]             — fallback DEFAULT_CATEGORIES   (ids null) until loaded
             // catNames() is the ONLY way to build a category dropdown (rule 14)
projects     // [{ id, num, title, cat, grade, locked, department_id, advisor_name,
             //    group_members: [{ name, grade }], room, description, motivation }]
             // id "p_xxxxxx" (admin-added); `cat` is free TEXT holding the category NAME at save
             // time — a snapshot, not a reference. Renaming or deleting a category never changes it,
             // so older rows may hold a name no longer in `categories` (shown as "(old category)").
projForm     // blankProjForm(num) → { title, cat, grade, num, department_id, advisor_name,
             //    members: [{ name, grade }], room, description, motivation }
scanCards    // form-scanner review cards, memory only — see "📷 Form scanning"
judges       // [{ id, alias, projects: [pid…], joinedAt, department_id }]
scores       // { [`${judgeId}_${projectId}`]: { criteria: { [criterionId]: number }, notes, time } }
rubric       // [{ id, label, desc, max, steps: [..] }] — from `rubrics`, fallback DEFAULT_RUBRIC
judgeValidations   // { [judgeId]: { approved, comment, validatedAt } }
adminValidation    // { approved, comment, validatedAt } | null
deliberationNotes  // { [`${judgeId}_${projectId}`]: { comment, recommendation, flagged, submittedAt } }
finalDecisions     // { [projectId]: { award, adminNotes, finalized, finalizedAt } }
log                // [{ time, msg }]
itLogs             // [{ id, ts, level: ERROR|WARN|INFO|DEBUG, module: AUTH|JUDGE|SCORE|ADMIN|SHARE|DB|SYSTEM, event, detail, payload }]
```

### Default rubric (`DEFAULT_RUBRIC` — 10 criteria, 42 pts)

| id | label | max | steps |
|---|---|---|---|
| `presentation` | Presentation | 6 | 0,2,4,6 |
| `testable_q` | Testable Question | 3 | 0,1,2,3 |
| `background` | Background Research | 3 | 0,1,2,3 |
| `hypothesis` | Hypothesis | 3 | 0,1,2,3 |
| `variables` | Variables | 3 | 0,1,2,3 |
| `materials` | Materials & Procedure | 3 | 0,1,2,3 |
| `data` | Quantitative & Qualitative Data | 6 | 0,2,4,6 |
| `analysis` | Analysis | 6 | 0,2,4,6 |
| `conclusion` | Conclusion | 3 | 0,1,2,3 |
| `abstract` | Abstract | 6 | 0,2,4,6 |

Scoring guide: 0 = not present · 1/2 = partial · 2/4 = complete · 3/6 = exceptional.
**Grades below 5 skip `abstract`** (scored out of 36 under the default rubric) — `projectMax(proj)` handles this.
Scoring UI is discrete tap buttons (`.rub-step-btn`), never sliders.

### Rubric presets (`RUBRIC_PRESETS`, admin Rubric tab)

| Preset | Shape |
|---|---|
| `northeast-az` | `DEFAULT_RUBRIC` — 10 criteria, 0–6 each, 42 pts. Has an `abstract` criterion, allows 0 |
| `cibecue-100` | 5 weighted sections rated 1–5, **100 pts**: Project Title 15 · Scientific Inquiry 25 · Data and Conclusion 20 · Presentation 20 · Further Research 20. **No zero step — the floor is 20/100.** No `abstract` criterion |

Applying a preset goes through `requestSaveRubric()`, so the impact warning + backup offer
still fire when scores exist. Presets are starting points; every criterion stays editable.

**The two source documents disagree; 15/25/20/20/20 is the correct one — confirmed by the
organiser 2026-10-06. Do not "fix" it.** The detailed Dishchii'bikoh form has 20 sub-items at
1–5, which would imply sections of 25/20/20/25/10; the summary sheet says 15/25/20/20/20 and
that is what the fair uses. The preset therefore takes the **summary sheet's weights** and folds
the 20 sub-items into each section's `desc`, so judges read all of them but rate once per section.
A consequence worth knowing: Further Research (2 sub-items) is worth more than Project Title
(5 sub-items). That is intended. Only revisit this if the committee asks for per-item scoring,
which would mean changing the section totals to 25/20/20/25/10.

**`stepLabels` (optional, display-only).** A 1–5 rating scaled into differently-weighted sections
gives a different number for the *same* rating per section ("Good" is 9 in a 15-pt section, 15 in a
25-pt section), so judges would be doing arithmetic. When a criterion has exactly one label per
step the buttons show the word with the points underneath. Nothing in the scoring maths reads it;
`stepLabel()` falls back to the raw number whenever the counts desync, and the rubric editor drops
the labels outright if an admin changes the steps.

**Rubrics with no `abstract` criterion and no `0` step degrade correctly** — `projectMax()`,
`allMoved()`, `draftTotal()` and the scoring form all key the exemption on `r.id === "abstract"`,
and `hasZeroScore()` can never fire when no step is 0. Verified by `scripts/e2e/rubric100.e2e.mjs`.

---

## 🔄 Validation & Deliberation Workflow

Rankings are auto-computed (`projAvg`, `rankedProjectsIn`). The workflow validates them before publishing.

1. **Judges validate** (judge-home) — shown after a judge scores 100%. Read-only ranked list
   → **Approve Results** or **Flag a Concern** (+ comment). Revisable until finalized
   (revision deletes their `validations` row). After validating a judge can no longer re-score.
2. **Admin validates** (Deliberation tab) — sees each completed judge's status
   (Approved / Concern / Pending) and approves or flags themselves.
3. **Consensus** — `consensusReached()`: every completed judge approved **and** admin approved.
4. **Deliberation (conditional)** — opens only on a **per-department tie** (`hasTie()` → amber
   alert) or a manual "Open Manually". Admin sees per-judge score bars, judges' scoring notes,
   deliberation notes (recommendation pill, flags) and assigns final awards. Judges get a
   💬 notes form (`delibDrafts`) while `deliberationOpen`. Persisted in `app_settings.deliberation_open`.
5. **Finalize** — enabled when `adminValidation?.approved && !deliberationOpen`. Sets
   `app_settings.results_finalized = "true"`, which **unlocks the Share tab**.

---

## 💾 Offline & PWA

- `vite-plugin-pwa` precaches the app shell (JS, CSS, HTML, fonts).
- On mount the judge session and scores restore instantly from `localStorage`, then are
  verified against Supabase (a judge removed by reset is sent back to landing).
- Offline scores queue in `sf_offline_queue` and flush on `online` / "Sync Now".
  `flushOfflineQueue()` has a concurrency guard and re-reads the queue after the loop so
  items added mid-flush are never lost.
- 8-second timeout prevents infinite loading when Supabase is unreachable and nothing is cached.

| localStorage key | Content |
|---|---|
| `sf_judge_id` | Judge row id |
| `sf_judge_data` | Judge object (JSON) |
| `sf_judge_slug` | School slug the session belongs to — blocks cross-school session bleed (all schools share one origin) |
| `sf_scores_cache` | This judge's scores |
| `sf_offline_queue` | Score payloads pending sync |
| `sf_last_sync_at` | Last successful sync timestamp |

---

## 🔗 Share Live Results

- Share tab is locked until `resultsFinalized`. Options: title, show rubric breakdown, expiry (`1h`/`24h`/`7d`/`never`).
- URL: `https://qritiko.com/s/{slug}?token=…`. `init()` validates the token against a
  `share_links` row for this school that is not revoked or expired; otherwise "Link Unavailable".
- `isLinkLive()` = `shareEnabled && shareToken && !expired`. While live, a "● LIVE RESULTS" card shows on the school landing page.
- Public page: results **split by department**, podium (2nd-1st-3rd), ranked table, award badges
  for finalized decisions, optional rubric chips. **Never judge names.**

---

## 📷 Form scanning (participation forms → projects) — added 2026-10-05

Admins photograph or scan the paper **Student Participation Form**; Google Gemini reads it; the
admin reviews/corrects each result on an editable card; only then is a project created. Built for
the Dishchii'bikoh 2026-27 form but the prompt asks for *fields*, not a fixed layout, so similar
forms from other schools work too.

### Flow
```
Projects tab → "📷 Scan forms"
  → pick photos/PDFs (multiple) or "Take photo" (tablet camera)
  → browser: scanPayload() shrinks photos to ≤2000px JPEG (PDF/HEIC sent as-is, ≤3.2 MB)
  → POST /api/scan-form  { schoolId, mimeType, data(base64) } + admin's Supabase JWT   (3 files in parallel)
  → server: verify JWT → verify school_admins row → load department names → Gemini generateContent
  → server: normaliseForm() → { forms: [...] }   (one entry per form; a PDF/photo may hold several)
  → browser: one review card per form (scanCards state, memory only)
  → admin edits → "✓ Save project" / "Save all ready" → createProject() → same path as Add Project
```

### Files & functions
| Piece | Where |
|---|---|
| Server endpoint | `api/scan-form.js` — `handler`, `callGemini`, `normaliseForm`, `buildSchema`, `buildPrompt` |
| Timeout | `vercel.json` → `functions["api/scan-form.js"].maxDuration = 60`; Gemini call aborts at 50 s |
| Client logic | `scanPayload`, `scanOne`, `scanAddFiles`, `scanCardFromForm`, `scanProblems`, `scanDuplicate`, `saveScanCard`, `saveAllScanCards`, `closeScanner`, `renderScanCard` |
| Shared save path | `createProject(data, baseProjects)` — also used by Add Project |
| Tests | `node scripts/scan-form.test.mjs` — mocked, free: auth, validation, request shape, error mapping |
| Smoke test | `scripts/scan-form-smoke.mjs` — real Gemini call with a sample form |

### Settings (Vercel → sciencefair-v2 → Settings → Environment Variables)
| Var | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | **Paid / billing-enabled** key from Google AI Studio. Free-tier inputs may be used by Google to improve products — not acceptable for students' names |
| `GEMINI_MODEL` | no | Default `gemini-3.8-flash` (stable, checked 2026-10-05). Cheaper: `gemini-3.5-flash-lite` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | already set | Reused server-side for the admin check |

After changing an env var you must **redeploy** (Vercel → Deployments → ⋯ → Redeploy) — running
functions keep the old value.

### What the card checks
- **Amber field** = Gemini said `low` / `unreadable`. Editing the field clears it (`conf` → `"edited"`).
- **Blocks saving:** no title · no department · category not one of the six (incl. *Not sure yet*) · no student.
- **Warns (Save becomes "Save anyway", excluded from Save all):** possible duplicate (same title, or
  same team: ≥2 shared names / same single student — vs existing projects and other cards) ·
  page is not a participation form.
- **Info:** "groups of three" ticked but 2 names, etc. · AI notes (crossed-out text, two boxes ticked).
- Failed read → **Retry** or **Enter manually** (blank card beside the photo).

### Category mapping
`api/scan-form.js` reads **this school's own `categories` rows** on every request (alongside its
departments) and builds the Gemini enum from them: that school's categories + `"Not sure yet"` +
`"None"`. Anything else comes back blank for the admin to pick.

There is **no list to keep in sync** any more — that was the old failure mode, where the JSX's
`REG_CATEGORIES` and a hand-copied `CATEGORIES` in the API could drift and silently blank the
category on every scan. The API's `DEFAULT_CATEGORIES` is a pure fallback, used only when the
`categories` table is empty or migration 2026-10e has not been run.

### Privacy (do not weaken)
- Photos exist only in the admin's browser memory (object URLs, revoked on close) and in the single
  request to Gemini. Not stored in Supabase, not logged.
- `generateContent` is stateless; the request also sends `store:false` (retried without it if the API
  ever rejects the field). **Do not switch to the Interactions API** — it stores requests by default.
- Server logs and `it_logs` (`FORM_SCANNED`, `FORM_SCAN_FAILED`) hold counts, MIME type, model and
  error codes — never names, titles or text.
- The endpoint is admin-only: a public endpoint would let anyone spend the school's Gemini credit.

### Gemini 3.x gotchas (checked 2026-10-05)
- Do **not** send `temperature`, `topP`, `topK`, `candidateCount` — Gemini 3+ rejects them.
- Structured output: `generationConfig.responseMimeType = "application/json"` + `responseSchema`
  (OpenAPI subset, uppercase types, `enum` on strings).
- Gemini 2.5 models are restricted to existing users since 2026-09-18 — don't fall back to them.

### Troubleshooting
| Card / log says | Cause | Fix |
|---|---|---|
| "Form scanning is not set up yet" (`NOT_CONFIGURED`) | `GEMINI_API_KEY` missing | Add it in Vercel, redeploy |
| "Gemini API key was rejected" (`KEY`) | Key wrong, revoked, or API not enabled | New key in AI Studio, update Vercel, redeploy |
| "Gemini model … was not found" (`MODEL`) | `GEMINI_MODEL` typo or model retired | Check https://ai.google.dev/gemini-api/docs/models, fix env var |
| "AI rate limit reached" (`RATE_LIMIT`) | Too many requests per minute | Wait; scan fewer at once; raise quota in Google Cloud |
| "Your admin session has expired" (`AUTH`) | JWT expired / signed out | Sign out and in again |
| "You are not an admin of this school" (`FORBIDDEN`) | Viewing school B while signed in as school A's admin | Open your own school's URL |
| "File is too large" / 413 | > 3.2 MB PDF, or photo the browser couldn't shrink | Split the PDF; export photo as JPEG |
| "Too many forms in one file" (`UNREADABLE`, MAX_TOKENS) | Huge multi-page PDF | Split into ≤ 10 pages |
| "The AI took too long" (`TIMEOUT`) | Slow model / big PDF | Retry; split PDF |
| "The AI refused this file" (`BLOCKED`) | Safety filter | Enter manually |
| Every scan has empty category | The form's categories don't match this school's list in Setup | Fix the list in Setup → Project Categories (the API reads it live; nothing to sync) |
| Saved project has no room/description | `migration-2026-10-project-details.sql` not run (IT log `PROJECT_DETAIL_COLS_MISSING`) | Run the migration, re-edit those projects |
| IT log `PROJECT_PRIVATE_TABLE_MISSING` | 2026-10b not run — names were saved on the **public** `projects` row | Run 2026-10b (it moves them) |
| IT log `PROJECT_PRIVATE_WRITE_FAILED` / "Could not save" on a card | Names could not be written; the project was rolled back | Check the admin is signed in on their own school's URL; retry |
| Student registration: "Submission failed" + IT log `REG_SUBMIT_FAILED` | 2026-10b not run (`submit_registration` missing) | Run 2026-10b |
| Scanned 404 on `/api/scan-form` locally | `vite dev` doesn't run Vercel functions | Test on a Vercel preview, or use the smoke script |

Verify a change end-to-end: `node scripts/scan-form-smoke.mjs <sample.jpg>` (prints the normalised
cards), then scan the same form in the app.

---

## 🎨 Design System

**Fonts:** `--ff-d` Merriweather (headings) · `--ff-b` Source Sans 3 (body/UI) · `--ff-m` DM Mono (codes, IDs, pills)

**Colors (light theme):** `--bg #ffffff` · `--s1 #f8fafc` (cards) · `--s2 #f1f5f9` (hover) ·
`--bd #e2e8f0` · `--navy #1e3a5f` (brand) · `--navy-l #2d5a8e` · `--text #1e293b` · `--dim #64748b` ·
`--green #059669/--green-l #d1fae5` · `--red #dc2626/--red-l #fee2e2` · `--amber #d97706/--amber-l #fef3c7` ·
`--blue #2563eb/--blue-l #dbeafe` · `--purple #7c3aed/--purple-l #ede9fe` · `--r 12px`

**Key classes:**
- Layout/basics: `.card`, `.btn` (+ `.sec` `.danger` `.amber` `.purple` `.sm`), `.lbl`, `.badge` (`.bg` `.ba` `.br` `.bb` `.bp`), `.pbar`/`.pfill`
- Scoring: `.rub-steps` (wraps — labelled steps overflowed a phone card otherwise), `.rub-step-btn` (`.selected`, `.labelled` + `.rub-step-lab` / `.rub-step-pts`)
- Validation: `.val-status-pill` (`.approved` `.concern` `.pending`), `.val-stat-pill`, `.val-consensus-card` (`.reached`), `.val-tie-alert`, `.val-finalized-banner`
- Deliberation: `.delib-section`, `.delib-proj`, `.delib-rec-select`, `.delib-flag-wrap`, `.delib-submitted`, `.delib-comment-card`, `.delib-rec-pill` (`.award` `.strong` `.good` `.needs`), `.delib-flag-badge`, `.delib-discuss`, `.delib-phase-toggle`, `.delib-finalized`, `.award-badge` (`.gold` `.silver` `.bronze` `.hm` `.best` `.none`)
- Projects: `.proj-mgmt-header`, `.proj-mgmt-table`, `.proj-act-btn`, `.proj-form-overlay`/`.proj-form-card`, `.proj-form-grid`, `.proj-lock-badge`
- Banners/modals: `.offline-banner`, `.locked-banner`, `.modal-overlay`/`.modal-box`, `.pin-gate`, `.it-term`
- Onboarding: `.mkt-*` (homepage), `.setup-guide*` / `.setup-check*` / `.setup-share*` (admin "Get started" card)
- Setup tab: `.setup-rows`, `.setup-row`, `.setup-ord`, `.setup-main`, `.setup-name`, `.setup-meta`, `.setup-acts`, `.setup-maxj`, `.setup-edit`, `.setup-code-in`, `.setup-add`, `.setup-presets`, `.setup-preset-grid`, `.setup-preset`

---

## ⚙️ Key Functions

```js
// Scoring math
getTotal(score)              // sum of score.criteria
critVal(scoreOrEntry, rid)   // module helper: one criterion from .criteria (legacy flat-field fallback)
rubricMax()                  // max points under the active rubric — never hardcode 42
projectMax(proj)             // max for ONE project (drops abstract when grade < 5) — use this
                             // for anything shown next to a single project's score
stepLabel(r, v, i)           // module helper: a criterion's rating word for step i, or null
                             // when stepLabels is absent/desynced (then show the number)
ANOMALY_PCT                  // 0.19 — outlier threshold as a fraction of projectMax(p)
projAvg(pid) / rubAvg(pid, rid)  // averages → "xx.x" | null
rankedProjectsIn(deptId)     // ranking WITHIN a department (null = unassigned) — use this
rankedProjects()             // cross-department ranking — rarely what you want
judgeComp(judge)             // { done, total, pct } — pct 0 when total 0
hasScored(pid), totalScored(), possible(), draftTotal(), allMoved()
getAnomalies()               // outliers > 8 pts from the project average

// Validation & deliberation
completedJudges()            // judges at 100% with total > 0
hasTie()                     // per-department tie detection
consensusReached(), valProgress()
submitJudgeValidation(ok), submitAdminValidation(ok)
openDeliberation(reason), closeDeliberation()
saveFinalDecision(pid, award, notes), finalizeResults()
getDelibNotesForProject(pid), getRecBreakdown(pid), getFlagCount(pid)
recPillClass(rec), awardBadgeClass(award), awardEmoji(award), buildDelibReport()

// Judges & projects
handleRegister()             // calls register_judge RPC
assignProjects(deptId, list?)          // every project id in that department
syncJudgeAssignments(deptIds, list?)   // push the current roster to judges in those departments
createProject(data, base?)   // shared insert path (Add Project + scanner) → { error, nextProjects, proj }
addProject(), updateProject(pid), removeProject(pid), toggleProjectLock(pid)
writeProjectRow(mode, row, pid)        // public columns only; drops 2026-10 columns if that migration is missing
writeProjectPrivate(pid, adviser, members)  // names → project_private (falls back to legacy columns pre-2026-10b)
nextProjectNum(list?), exportProjListPDF(), exportProjectsCSV()
normMembers(raw), membersText(raw), highestGrade(members), normGrade(g)  // module helpers
blankProjForm(num?, defaultCat?), escHtml(v)  // module helpers — escHtml for any hand-built HTML (print windows)

// Setup tab — departments & categories (both per-school rows; see rule 14)
catNames()                   // the school's category names, in order. Hoisted `function` on purpose:
                             // the projForm useState initializer calls it before its definition
autoCode(name)               // derives a short code ("Life Science" → "LS") when the admin leaves it blank
loadDepartments(sid), loadCategories(sid)     // load only — they never seed (see ensureSeedData)
updateDeptMaxJudges(deptId, max)
addDepartment(name, code), saveDepartment(id), moveDepartment(id, ±1)
requestDeleteDepartment(id) → deleteDepartment(id)   // request() holds the guardrail, see rule 14a
applyDeptPreset(presetId)    // DEPT_PRESETS — only ADDS what is missing, never deletes
addCategory(name, code), saveCategory(id), moveCategory(id, ±1)
requestDeleteCategory(id) → deleteCategory(id)       // warns if projects use it; deletion is safe
restoreDefaultCategories()   // adds back any missing DEFAULT_CATEGORIES; keeps the school's own
submitScore()                // enforces judging lock + already-validated gate
flushOfflineQueue()          // guarded; body in runOfflineFlush(queue)

// Admin / security
verifyAdminPin(pin)          // verify_school_pin RPC → boolean
changeAdminPin()             // set_school_pin RPC
loadInviteCode(sid)          // school_invite_code RPC → inviteCode state
allowJudgeTransfer(alias) / confirmTransfer()   // PIN modal, one-time ~10 min allowance
executeReset()               // PIN-gated; see rule 15
ensureSeedData(schoolId)     // re-seeds departments, rubric, baseline app_settings on first admin load
requestSaveRubric(criteria) → saveRubric(criteria)   // impact check + confirm; save reports failure
addLog(msg), addItLog(level, module, event, detail, payload)
buildSnapshot()

// Exports & sharing (every cell through csvCell())
csvCell(v)                   // module helper: quotes + neutralises leading = + - @
exportResultsCSV(), exportJudgeScoresCSV(), downloadBackupCSV(), exportRegCSV()
saveScoreBackup()            // stores criteria + a copy of the rubric
shareUrl(), projListUrl(), isLinkLive()

// Registration
loadRegLinks(), loadRegSubmissions(), generateRegLink(), deleteRegSubmission(sub)
generateRegNum(div, cat, projNum)   // "{DivCode}-{CatCode}-{NNN}"
```

### Realtime handlers (do not revert to full refetches)
- `scores`, `judges`, `deliberation_notes`, `final_decisions`, `validations` — INSERT/UPDATE
  patch state from `payload.new`; full reload only on DELETE.
- `activity_log`, `it_logs` — INSERT-only, prepend `payload.new`.
- `departments`, `categories`, `projects`, `project_private`, `share_links`, `app_settings` — full `loadX(sid)` (rare admin changes).
- ⚠️ **Always wrap loaders: `() => loadProjects(sid)`.** Passing `loadProjects` directly hands it the
  realtime payload as `sid`; it then queried `school_id = "[object Object]"`, so projects/departments
  never refreshed live from the v2 rewrite until 2026-10-05.

---

## 🚫 Critical Rules — Do NOT Break These

**Multi-tenancy & data shape**
1. **Every Supabase query is scoped by `school_id`.** Loaders take `sid` (`sid || currentSchool?.id`); inserts include `school_id`; updates/deletes chain `.eq("school_id", …)`. A missing scope leaks data across schools.
2. **`app_settings` PK is `(school_id, key)`.** Upserts include `school_id`; never `.eq("key", x)` alone.
3. **Upsert conflicts:** `validations` → `onConflict: "school_id,judge_id"`; `final_decisions` → `"school_id,project_id"`.
4. **Scores are JSONB.** `scores.criteria = { [criterionId]: value }`. Read through `getTotal()` / `critVal()` — never `score.presentation` etc. (v1 columns that no longer exist; this silently emptied backups and CSVs for months).
5. **The rubric is dynamic.** Use the `rubric` state everywhere; `DEFAULT_RUBRIC` is only a seed/fallback, and `RUBRIC_PRESETS` are starting points. **Never assume a rubric has 42 points, an `abstract` criterion, a `0` step, or any particular criterion id** — the Cibecue preset has none of those. Guard with `r.id === "abstract"`-style checks that no-op, never with "the rubric always has N criteria".
6. **Never hardcode the max score, or anything derived from it.** Use `rubricMax()` for "the whole rubric" and **`projectMax(proj)` for anything about one project** — they differ whenever a criterion is exempt (grade < 5 skips `abstract`: 36, not 42). A literal `42` is a bug, and so was `getAnomalies()`'s hardcoded "> 8 points", which is ~19% of 42 but only 8% of 100 — it would have flagged nearly every judge on the Cibecue rubric. It is now `projectMax(p) * ANOMALY_PCT`. Six per-project displays showed `/rubricMax()` and were fixed 2026-10-06 (public podium + results rows, deliberation header and per-judge bars, `buildDelibReport()`).
7. **Score key format is `${judgeId}_${projectId}`.** Do not change it.
8. **Ranking and tie detection are per department.** Use `rankedProjectsIn(deptId)`; cross-department ties are meaningless.

**Judges & projects**
9. **Every judge scores every project in their department.** No per-judge subsets.
10. **Any project change re-syncs judge assignments.** `judges.projects` is a snapshot, so `addProject()` and a department change in `updateProject()` must call `syncJudgeAssignments()`. `removeProject()` does its own removal.
11. **`max_judges` is per department and locks** once that department's first judge registers. The old global `maxJudges` / `app_settings.max_judges` was removed 2026-09-25 — do not reintroduce it. `JUDGE_NAMES` pre-generates Judge1–Judge100.
12. **Locked projects cannot be edited or removed.** Only `toggleProjectLock()` changes the lock.
13. **Removing a project cascades:** its scores, deliberation notes, final decision and every judge's assignment entry. No orphans.
14. **Departments AND categories are per-school data, not constants** (changed 2026-10-06, migration 2026-10e). Build every category dropdown from `catNames()` and every department dropdown from the `departments` state — never from a module constant. `DEFAULT_CATEGORIES` / `DEPT_PRESETS` are **only** fallbacks-and-seeds: they are what a school starts with, never the set that exists. The old `REG_CATEGORIES`, `CAT_CODES` and the dead `CATEGORIES` constant are gone; do not reintroduce them. `api/scan-form.js` loads the school's categories per request (its `DEFAULT_CATEGORIES` is a fallback only), so there is no longer a list to keep in sync. "Not sure yet" is never a category.
14a. **A department may not be deleted while judges or projects point at it.** `judges.department_id` and `projects.department_id` are `ON DELETE SET NULL`, so Postgres would *accept* the delete and silently unassign everything — an unassigned project is scored by nobody. The guard lives in `requestDeleteDepartment()`; keep it there. Deleting a **category** is safe by contrast (`projects.cat` is free text with no FK) — projects keep their label and the edit form shows it as "(old category)".
15. **`executeReset()` clears** judges, scores, validations, deliberation notes, final decisions, share link, project-list token, judge transfer allowances, `locked`, `deliberation_open`, `results_finalized`. **It never clears** projects, departments, registration data or the activity log.

**Workflow gates**
16. **Never clear the activity log.** It is the security audit trail.
17. **Judges cannot re-score after validating** — gated in the UI *and* in `submitScore()`.
18. **Enforce gates in the handler, not just the UI.** `locked` and "already validated" live inside `submitScore()`.
19. **`submitDelibNote` returns early unless `deliberationOpen`.**
20. **Deliberation is conditional** — only on a tie or manual open, never automatically each session.
21. **Share tab stays gated on `resultsFinalized`.**
22. **Judge names never appear on `public-results`.**
23. **Leaderboards render scored projects first, a divider, then unscored at 50% opacity.**

**Security**
24. **Never compare a credential in the browser.** Use `verifyAdminPin()` / `register_judge()`. Any `x === currentSchool.something` credential check means a secret was shipped to the client.
25. **Admin PIN is a bcrypt hash — keep it one-way.** The app only ever asks "is this the PIN?". Do not store anything decryptable.
26. **Admin login is Supabase Auth.** Never revert to an env-var password.
27. **Judge rows are created by `register_judge()` only.** Do not loosen the `judges` INSERT policy; fix the function.
28. **Column privileges need the table grant gone first.** Supabase grants anon/authenticated a table-level SELECT on everything in `public`, and Postgres privileges are additive, so `REVOKE SELECT (col)` alone is a silent no-op. `REVOKE SELECT ON tbl` then `GRANT SELECT (safe, cols)`, and **verify with a real anonymous `curl`** — "Success" in the SQL editor only means it parsed.
29. **Select explicit columns from `schools`** (`id, name, slug`). `select()` means `*`, which anon is not allowed to read.
30. **Do not enforce the judging lock in RLS.** Offline judges sync after the fact; a `locked` check in the scores policy would silently destroy legitimately-scored work.
31. **Every CSV cell goes through `csvCell()`** (formula-injection guard).

**URLs & hosting**
32. **App URLs include `/s/{slug}`.** `shareUrl()`, `projListUrl()` and the registration URL build from `${window.location.origin}/s/${currentSchool.slug}`. A bare origin lands on the homepage.
33. **Exactly one hostname serves the app** (see Environments). URLs inherit `window.location.origin`; the redirects keep it single-valued.

**Code style**
34. **All CSS is inline** in the `CSS` template literal.
35. **No routing library.** Navigate with `setView(...)`.
36. **Never use `window.prompt` / `window.confirm`** — blocked in PWA standalone mode on iOS/Android. Use the `modal-overlay` / `modal-box` pattern.
37. **Never write anything that makes the React Compiler bail out of `App`.** A bailout silently disables `react-hooks/purity` and `react-hooks/immutability` **for the entire file** — the findings do not move or change, they vanish, so the lint report looks *better* when you have just broken it. Two confirmed triggers:
    - `try/finally` inside `App` — use `.finally()` on a promise instead (see `flushOfflineQueue()`).
    - **Mutating a closed-over variable inside a callback**, e.g. `let ord = …; list.map(x => ({ …, ord: ord++ }))`. Use the index: `list.map((x, i) => ({ …, ord: base + i }))`. (Found 2026-10-06 while adding the Setup tab.)
    - **How to check:** `npx eslint src/ScienceFairJudging.jsx -f json` and count findings per rule. The healthy baseline is **27 `react-hooks/purity` + 5 `react-hooks/immutability`**. If those two drop to zero you have caused a bailout — a plain error count is not enough to notice, so compare per-rule before every commit that touches `App`.
38. **Discrete score buttons only** — never `<input type="range">`.

**Form scanning**
39. **Read members only through `normMembers()`.** Three shapes exist (see Data Model). Writing `group_members` as anything but `[{name, grade}]` to `project_private`, or anything but a `", "`-joined string to `registration_submissions`, is a bug.
40. **`/api/scan-form` stays admin-only** (JWT + `school_admins` check *before* any Gemini call). Never add an anonymous path.
41. **Never store or log form images or their text.** Logs get counts and error codes only. Do not use the Gemini Interactions API (stores by default) or the Files API.
42. **Nothing scanned reaches the DB without an admin pressing Save.** Do not add auto-save, and keep "Save all" excluding cards with problems or warnings.
43. **Batch saves must thread the project list** through `createProject(data, base)`; using `projects` state in a loop gives every project the same number.
44. **Gemini 3+: no `temperature` / `topP` / `topK` / `candidateCount`.** The request fails.

**Data privacy**
45. **No personal data on publicly readable tables.** `projects`, `departments`, `judges`, `rubrics`, `share_links`, `registration_links` and `app_settings` are anon-readable. Student/adviser names go in `project_private` (admin-only); student contact details stay in `registration_submissions`. Use a separate admin-only table, not a column REVOKE — Realtime ignores column privileges.
46. **Public writes go through SECURITY DEFINER RPCs** (`register_judge`, `submit_registration`) that validate a token or code. Never open an anon INSERT policy to make a form work.
47. **Run `npm test` after any `supabase/*.sql` change.** It applies the base schema + every migration twice on real Postgres and checks RLS as anon / non-admin / admin.

50. **Only `create_school()` creates schools or admin links.** Never re-open INSERT on `schools` / `school_admins`; to add a second admin, write an RPC that requires an existing admin of that school.
51. **Regex literals need their backslashes.** `/^d{4,8}$/` (missing `\`) rejected every numeric PIN and blocked all school sign-ups for 10 days. Prefer a test that exercises the happy path of every form.
52. **Inputs need `type="text"`.** The base input styles are keyed on `input[type=text]`; an input without a type renders as a tiny unstyled browser box.

53. **Admin PINs are 4–8 digits.** Never cap a PIN box at 4 or auto-submit at a fixed length; check on Enter / a button (`submitResetPin`, `submitItPin`, `confirmTransfer`).
54. **A DELETE/UPDATE that RLS filters out is not an error.** Postgres reports 0 rows as success. When the UI depends on it, chain `.select()` and check that rows came back (see "Revise my validation").
55. **Only show a saved state after the save succeeded** (judging lock: upsert, check `error`, then `setLocked`).

**Keeping users informed**
56. **Every user-visible change updates the help in the SAME commit:** the `ADMIN_HELP` constant (bump `ADMIN_HELP_UPDATED`), `AdminInstructions.md`, and `JudgeInstructions.md` if judges are affected. A feature, a new rule, a changed button label, a new limit or a new failure message all count. Admins rely on the in-app Help tab — a stale answer there is a bug.
57. **Never delete data a user can't get back without saying so first.** Judge sign-out must not clear `sf_offline_queue` (it did until 2026-10-05); deleting a scored project, Reset and rubric changes all warn first.
58. **Rubric changes go through `requestSaveRubric()`** — it validates, and when scores exist and criteria / points change it shows the impact (removed / added / changed) and offers a backup before `saveRubric()`. `saveRubric()` reports failure (`rubricErr`) and keeps the editor open.

**Supabase client pitfalls (both shipped as real bugs)**
48. **Every Supabase query must be awaited, returned, inside `Promise.all`, or end in `.then()`.** A supabase-js query builder is lazy — a bare `supabase.from(x).insert(y);` statement sends **nothing**. This silently disabled the activity log, the IT log and "Revise my validation" for all of v2.
49. **Never `await` a Supabase call inside `onAuthStateChange`.** supabase-js holds its auth lock while notifying listeners; an awaited query waits for that lock → deadlock. It made Sign Out hang forever. Defer with `setTimeout(() => …, 0)` (see `onAuthChanged`).

---

## 💡 Common Edit Patterns

**Changing a school's rubric:** admin Rubric tab — edit label/desc/max/steps, reorder, delete,
save (writes `rubrics.criteria`) or reset to default. No code or schema change needed.

**Changing the default rubric for new schools:** edit `DEFAULT_RUBRIC`. Existing schools keep theirs.

**Adding an admin tab:** add `{ id, ico, label }` to `navItems` in the admin render, then a
`{adminTab === "yourid" && <>…</>}` block inside `.adm-main`.

**Adding a view:** add an `if (view === "yourview") return (…)` block; navigate with `setView`.

**Adding an IT log event:** `addItLog(level, module, event, detail, payload)`.

**Credentials:** admin password → Supabase Auth; admin PIN → Overview tab Change PIN card;
invite code → `set_school_invite_code()` RPC (no UI yet). Never via env vars.

**More judges:** raise a department's Max Judges on the Overview tab before its first judge registers (up to 100).

**Adding a project:** Projects tab → "+ Add Project" (department, title, category, number, teacher, room, students with grades, description, motivation). `addProject()` → `createProject()` inserts and syncs judge assignments.

**Adding projects from paper forms:** Projects tab → "📷 Scan forms" — see "📷 Form scanning".

**Changing a school's project categories or departments:** admin **Setup tab** — no code, no schema change, no deploy. Each school's list is its own. Only edit `DEFAULT_CATEGORIES` / `DEPT_PRESETS` to change what a *brand-new* school starts with (existing schools keep theirs).

**Changing what the scanner reads:** add the field to `buildSchema()` (+ `required`), the prompt, `normaliseForm()`, `scanCardFromForm()`, `emptyScanData()`, the card UI, and — if it is saved — a migration + `createProject()` / `writeProjectRow()`'s optional-column list. Then run the smoke script.

**DB changes:** write a new `supabase/migration-YYYY-MM-*.sql`, keep it re-runnable, add it to the
Migrations table above, and say in the commit whether it is coupled to the app build.

---

## 🐛 Change History (condensed)

Full detail is in the git log for each commit.

**2026-10-06 — 100-point rubric preset + stress test (7 bugs found and fixed).**
No migration. Adds `RUBRIC_PRESETS` and the Cibecue / ISEF-style 100-point rubric (see Data
Model). Stress-testing it against the 42-point assumptions the app grew up with surfaced seven
defects, five of them pre-existing:
1. **`getAnomalies()` hardcoded "> 8 points"** — ≈19% of 42 but only 8% of 100, so the Alerts tab
   would have flagged ordinary disagreement on every project. Now `projectMax(p) * ANOMALY_PCT`.
2. **Six per-project displays used `rubricMax()` instead of `projectMax(p)`** (public podium and
   results rows, deliberation header, per-judge score bars, `buildDelibReport()`). Pre-existing:
   a grade-4 project under the 42-pt rubric is out of 36, and all of these showed "/42". The
   per-judge progress bar also computed its fill against the wrong denominator.
3. **The rubric editor capped Max Points at 20**, silently making the 25-point Scientific Inquiry
   section impossible to enter by hand. Now 100.
4. **Changing a criterion's max force-injected a `0` step**, which would have let judges score
   below the floor of a no-zero rubric. It now keeps the steps that still fit and adds the max.
5. **Five labelled step buttons overflowed the card at 390px** — "Excellent" was off-screen, so a
   judge on a phone could not award it. `.rub-steps` now wraps and `.labelled` uses a flex basis.
6. The "Allowed Step Values" hint claimed steps "must include 0 and max"; `parseSteps()` requires
   neither.
7. The Alerts message still read "Deviation > 8 pts" after the threshold became relative.
Also: `stepLabels` (display-only rating words) so a judge taps "Very Good", not "12" — the same
rating is a different number in each weighted section.
Tests: new `scripts/e2e/rubric100.e2e.mjs` — 16 checks covering preset apply, the 20/60/100 score
floor-mid-ceiling, the no-zero rule not misfiring, phone overflow, the relative anomaly threshold,
leaderboard averages, and that score backups carry per-criterion values plus a rubric copy.
138 browser checks total.

**2026-10-06 — Per-school categories + Setup tab** (migration `2026-10e`, **not** coupled).
Phase 1 of the departments/awards redesign. Everything here is additive: run the SQL and the
old build keeps working, deploy the new build without the SQL and it falls back to its built-in
lists. Rollback is a redeploy.
1. **Categories were a platform-wide constant.** `REG_CATEGORIES` lived in the JSX and
   `api/scan-form.js` kept a hand-synced copy, so a robotics fair could not change its categories
   without a code deploy — the opposite of multi-tenant. They are now rows in a new per-school
   `categories` table, edited in the UI. The scan API loads the school's list per request, so the
   two lists can no longer drift (that drift silently blanked every scanned category).
2. **New ⚙️ Setup admin tab** — departments and categories: add, rename, reorder, delete, set
   max judges, and four department presets (school levels · PreK–12 bands · bands + SPED · single
   pool). Presets only *add*, so they can never destroy an existing setup. The judge-slots editor
   moved here from Overview, which now shows a summary card linking across.
3. **Department delete guardrail** (rule 14a). The FKs are `ON DELETE SET NULL`, so Postgres
   would have accepted the delete and quietly unassigned every judge and project.
4. **Seeding collapsed.** Departments were hardcoded in four places (`DEFAULT_DEPARTMENTS`, the
   `loadDepartments` fallback, `ensureSeedData`, and `create_school()` in SQL). Loaders no longer
   seed at all — that inline insert could only ever succeed for an admin and silently failed for
   every judge and visitor. `ensureSeedData()` is now the single seeding path and also seeds
   categories, which `create_school()` (older than the table) does not create.
5. Removed the dead `CATEGORIES` constant (the pre-2026-10 Biology/Physics list).
6. **Found while testing: `ord++` inside a `.map()` callback bails the React Compiler**, silently
   dropping all 32 purity/immutability lint findings — the same trap as `try/finally`. Rule 37 now
   covers it and says how to detect it.
Tests: DB suite 96 checks (16 new: seeding, re-run safety, RLS as anon / non-admin / cross-school
admin, non-destructive delete); scan-form gains per-school-category, custom-category and
missing-table cases; new `scripts/e2e/setup.e2e.mjs` — 18 browser checks. 122 browser checks total.

**2026-10-05 — Data-safety pass + in-app Help & FAQ.**
1. **Judge Sign Out deleted unsynced scores** (`sf_offline_queue`) — now blocked while scores are only on
   the device; its `window.confirm` (blocked in installed mode) became an inline step.
2. **Rubric:** saves now report failure ("Rubric NOT saved", editor stays open); the misleading "won't
   retroactively update" warning replaced by an accurate one; changing criteria/points with scores present
   asks to confirm, lists the impact and offers a score backup; Reset to Default no longer uses
   `window.confirm`; `alert()` validation replaced by inline errors.
3. **Projects → ⬇ Download Projects CSV** (adviser, students + grades, room, answers, avg) — the admin's own copy.
4. **Help & FAQ admin tab** driven by `ADMIN_HELP` (rule 56). Lifecycle E2E now 40 checks.

**2026-10-05 — Email confirmation landed on localhost.** Supabase Auth's *Site URL* was still the
default `http://localhost:3000`, so the first real school's confirmation link opened a dead page (the email
*was* confirmed). Sign-up now passes `emailRedirectTo: /s/{slug}`; the landing "I'm an Admin" card goes
straight to the dashboard when already signed in as this school's admin (`adminHere`).
**Supabase dashboard settings required:** Authentication → URL Configuration → Site URL `https://qritiko.com`,
Redirect URLs `https://qritiko.com/**`. Built-in Supabase email is rate-limited and often lands in spam —
configure custom SMTP (Resend) before onboarding more schools.

**2026-10-05 — Scoring / lifecycle pass** (migration `2026-10d`, not coupled).
1. **PIN boxes stopped at 4 digits** (Reset, IT Logs, judge transfer) and auto-checked at 4 — any school
   with a 5–8 digit PIN could never reset, open IT Logs or approve a transfer. Now Enter / button.
2. **"Revise my validation" still did nothing** — `validations` DELETE was admin-only, so the judge's
   delete matched 0 rows "successfully". New policy (2026-10d) + the app checks rows were deleted.
3. **Judging lock could show "Locked" when the save failed** (UPDATE, errors ignored) — now upsert +
   error check + "Lock failed — retry" label.
4. An empty / malformed rubric row (the column defaults to `[]`) gave judges an empty scoring form or
   crashed the app — `loadRubric` now falls back to `DEFAULT_RUBRIC`.
Tests: DB suite 80 checks (full lifecycle per role); new `scripts/e2e/lifecycle.e2e.mjs` 32 checks —
scoring, abstract + zero rules, edit, offline queue → auto-sync, validate/revise, lock, leaderboard,
finalize, share link → public results (no names), CSV export, IT Logs + Reset with a 6-digit PIN.

**2026-10-05 — Pre-launch regression pass** (migration `2026-10c`, coupled).
1. **Admin-hijack hole closed** — see Open risks. School sign-up rebuilt on `create_school()`.
2. **School sign-up was impossible since 2026-09-25** — the PIN check `/^d{4,8}$/` lacked a backslash.
3. Sign-up checks the URL before creating the login, and a retry reuses the login from a failed
   attempt (otherwise "User already registered" stranded the user). Email-confirm case now shows a
   proper success card instead of a red error. Auto URL capped at 50 chars.
4. Sign-up page on phones: School Name / URL inputs were unstyled and the URL row overflowed.
5. Change-PIN now enforces the same 4–8 digit, non-trivial rule as sign-up.
Tests: 53 DB checks (incl. hole proven before / closed after), 64 browser checks incl. sign-up.

**2026-10-05 — Stress test: 4 shipped bugs fixed** (browser E2E + network inspection).
1. **Activity log + IT logs were never saved** (rule 48) — inserts had no `await`/`.then()`. The "permanent
   audit trail" lived only in each browser's memory. Now written, with ids so the realtime echo is de-duplicated.
2. **Sign Out hung forever** (rule 49) — awaited queries inside `onAuthStateChange` deadlocked supabase-js.
   Sign-out now also clears admin-only state (invite code, registrations, backups, IT unlock).
3. **"Revise my validation" never deleted the row** (rule 48) — after a reload the judge was still validated and locked out.
4. Scanner UI: broken-image thumbnails for HEIC/other files, Retry offered for unfixable errors, squashed
   two-column fields on phones, small photo that scrolled away — photo is now 240px and sticky beside the fields.

**2026-10-05 — Student names private + registration fixed** (migration `2026-10b`, coupled).
Names moved from public `projects` to admin-only `project_private` (they were readable by anyone).
Public registration rebuilt on `submit_registration()` — it had never worked under RLS, and the
live table was missing 12 columns. Realtime `projects`/`departments` refresh fixed (payload was being
passed as `sid`). New `npm test`, incl. a 31-check PGlite migration/RLS suite.

**2026-10-05 — Participation-form scanning (Gemini)** (`eeeca9f`, `2843338`, `12522c6`).
Categories switched to the form's six; per-student grades (`group_members` → `[{name, grade}]`);
new `room` / `description` / `motivation` (migration `2026-10-project-details`); admin-only
`/api/scan-form`; review-queue UI; judges see room + description. Project-list PDF now escapes text.
Requires: migration + `GEMINI_API_KEY` in Vercel. See "📷 Form scanning".

**2026-10-01 — Apex HTTPS outage fixed.** Cloudflare A record `216.198.79.1` → `76.76.21.21` (see Environments).
CLAUDE.md cleaned up; all RLS/RPC claims re-verified with live anonymous requests.

**2026-09-30 — Canonical domain** (`484c1bd`). Apex `qritiko.com` became the primary URL;
`www.`/`app.` redirect. v1 Vercel project deleted.

**2026-09-25 — Hashed PIN + server-side judge registration** (`aa36425`, hotfix `0be50d0`).
Migration `2026-09b`. The earlier `REVOKE SELECT (admin_pin)` had been a silent no-op (rule 28):
`?select=admin_pin` still returned `"0000"`. Now: bcrypt PIN via trigger, `verify_school_pin`
with lockout, sign-up collects a 4–8 digit PIN (rejects 0000/1111/1234-style), `register_judge`
replaces client-side registration, invite code no longer sent to anon, judge-scoped write
policies. Schools created before this got PIN `0000`, which was publicly readable — they must change it.

**2026-09-25 — RLS hardening + v1 retirement** (`9e23d74`). Migration `security-hardening`.
`app_settings` writes, registration PII and log reads became admin-only; `registration_count()`
RPC added; public form fails loudly rather than guessing a reg number; admin-only tables
refetched on sign-in.

**2026-09-25 — Adviser + group members on projects** (`3889ba1`, fix `8a48916`). For the 2026-27
workflow where organisers enter teams. Migration `project-adviser`; `writeProjectRow()` tolerates
its absence. See the `group_members` type split above.

**2026-09-25 — Architecture audit, 19 defects** (`3889ba1`):
- P0: backups/CSVs read v1 flat columns and held no per-criterion scores; late projects invisible to signed-in judges (`syncJudgeAssignments`); public results link dead (no `/s/{slug}`, `?token=` never parsed).
- P1: project-list token accepted any value; Lock Judging and the validated gate were UI-only; cross-school session bleed (`sf_judge_slug`); auth listener could adopt the wrong school; `exportRegCSV()` unscoped.
- P2: cross-department ties; `judgeComp` divide-by-zero; hardcoded `/42`; dead global `maxJudges`; `projForm.cat` defaulted to a non-category; reset left the project-list link live; anomaly prefix-match.
- P3: offline flush concurrency; CSV formula injection; school sign-up ignored insert errors (now `ensureSeedData()` self-repairs); `DEFAULT_PROJECTS` removed.

**2026-07-19** — docs typo fix (Supabase ref).
**2026-06-08** — UX onboarding: marketing homepage (`.mkt-*`), admin "Get started" card (`.setup-*`), judge helper text.
**2026-06-02** — v2 multi-tenant rewrite: Supabase Auth, slug resolution, `school_id` scoping, JSONB criteria, Rubric tab, new Supabase + Vercel project.
**2026-03-30** — validations moved to per-row upserts (concurrent overwrite fix); offline queue no longer drops items added mid-flush.
**2026-03** — QA review, 18 items closed (see `QA_ASSESSMENT.md`).

### Known gaps (not yet fixed)
- `projListUrl()`, `generateProjListLink()`, `revokeProjListLink()` have no UI callers, so `public-projects` is unreachable in practice.
- `submitDelibNote()` and `reviseDecision()` are defined but unreferenced (ESLint `no-unused-vars`).
- No UI for `set_school_invite_code()`.
- The `SEED_SCORES` constant is unused. (`CATEGORIES` was removed 2026-10-06.)
- **`DIVISIONS` / `DIV_CODES` / `getDivision()` still duplicate what `departments` now holds** —
  three disagreeing grade-band schemes (the registration form's divisions, its `reg_prefix` codes,
  and a display-only label). `departments.code` exists for this; unifying them is the next piece of
  Phase 1, and it also lets `submit_registration()` set a project's `department_id`.
- **`submit_registration()` creates projects with no `department_id`**, so a student-registered
  project is in no judge's list until an admin assigns it by hand. Fixed by the unification above.
- The public registration form has no automated browser test; its server side is covered by
  `npm test` (real-Postgres RPC/RLS). The scanner UI has `scripts/e2e/scan.e2e.mjs`.
- `submit_registration()` is gated only by the registration token: anyone holding an active link
  can submit repeatedly. Deactivate the link when registration closes.
- The public registration page and some headers show hardcoded **Dishchiibikoh Community School**
  branding (logo + name) for every school — not multi-tenant. Cosmetic, but wrong for other schools.
- A real-Gemini scan through the deployed `/api/scan-form` needs an admin session, so it is verified
  by an admin scanning one form after each deploy (the smoke script tests Gemini directly).
- Judge identity — see "Open risks".

---

## 📖 User Guides

- **[JudgeInstructions.md](./JudgeInstructions.md)** — registering, scoring, validating
- **[AdminInstructions.md](./AdminInstructions.md)** — setup, projects, deliberation, sharing, pre-event checklist

Update both whenever a change affects what judges or admins see.

---

## Rules (project-init)
- Check the Obsidian project note before starting work: `C:\Users\Cerus\OneDrive\Documents\Obsidian Vault\projects\sciencefair-judging-app.md` (exists only on the Cerus machine — skip if absent)
- Update its Session Log at the end of each session
- Run `/graphify .` after major refactors
- Use `py -m graphify` not `graphify` directly (Windows PATH issue)

## graphify

This project has a graphify knowledge graph at graphify-out/.

- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
