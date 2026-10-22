# Qritiko — Science Fair Judging App · Claude Code Context

> Single source of truth for AI-assisted development. Read it before changing anything.
> Do not delete it. When code and this file disagree, the code wins — then fix this file.
>
> Last reviewed: 2026-10-21 (Phase 3: award groups + the Awards tab; the PreK & SPED form — ribbons, shared places; minimum to place back to 0; Phase 2: the judging schedule — rounds, times, booths, printouts; Phase 1: the 2026-27 forms, drafts, safety concerns; plan to the 2026-12-11 fair — see Live status and Change History).

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
| Tests | `npm test` — mocked scan API + mocked registration email + real-Postgres (PGlite) migration/RLS/Storage-policy suite (271 checks). Run after any `supabase/*.sql` or `api/` change |
| Browser tests | `npm run test:e2e` — real app in Edge with Supabase + scan API faked (`scripts/e2e/mock.mjs`): school sign-up, admin, scanner, judge, Setup tab, public registration, phone/tablet widths, multi-judge judging (`judging.e2e.mjs`), the 2026-27 forms + drafts + safety (`rubrics-2627.e2e.mjs`), the judging schedule (`schedule.e2e.mjs`), the PreK & SPED form (`prek-sped.e2e.mjs`), awards (`awards.e2e.mjs`). Start the dev server first (see the file header). 526 checks across 24 files |
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
| `migration-2026-10m-ratelimit-regnum-project-moves.sql` | **Three correctness fixes (2026-10-06 review)**: `register_judge()` now RETURNS `{"error":"Invalid invite code"}` instead of raising, so the 5-attempt lockout finally records anything (a RAISE rolled the counter back with the transaction — see rule 66); `submit_registration()` numbers from MAX not COUNT, plus a guarded UNIQUE index on `(school_id, reg_number)` (⚠️ **partial fix** — deleting the HIGHEST submission still frees its number; see Known gaps); new `projects_guard_department_move` trigger — a **scored** project may not move to a department with a different rubric or scoring mode | **Yes for the app build** — `handleRegister()` reads `data.error`. An older build still refuses the wrong code, it just shows the generic "Registration failed" text. ⚠️ SUPERSEDES `register_judge()` (10k) and `submit_registration()` (10b) — re-run 10m after either |
| `migration-2026-10n-unique-project-numbers.sql` | **UNIQUE `(school_id, projects.num)`** — two admins adding a project at once no longer share a number. Guarded: if duplicates already exist it RAISEs a WARNING and skips the index (renumber, re-run) | No — either order. Old app: a clash shows the raw DB error instead of a silent duplicate. New app without it: as before |
| `migration-2026-10o-score-feedback.sql` | **`scores.feedback`** JSONB `{strength, next_step}` (CHECK: an object) + **`scores.safety_concern`** BOOLEAN — the 2026-27 elementary form's two comment boxes and its safety question. Existing row policies cover them; `scores` is already in realtime | No — **additive**, either order. New app without it: `upsertScore()` retries without the two columns and folds them into `notes` (IT log `SCORE_FEEDBACK_COLS_MISSING`) — nothing lost, but the Alerts safety card cannot appear. **Run before judging day** |
| `migration-2026-10p-judging-schedule.sql` | **Judging schedule**: `judge_schedule` (school, judge_number, round_no, project_id — public read, RPC-only writes, FK → projects ON DELETE CASCADE, a judge visits a project once and has one project per round); `app_settings.judging_schedule` (the slots: rounds with times + breaks); **`_judge_projects()` redefined** — while a schedule has rows a judge's list is their visits in round order; **`set_judge_schedule()`** (validates, refuses to drop an already-SCORED visit, derives the judge grid through `set_judge_roster()`) / **`clear_judge_schedule()`** | No — **additive**, either order: with no rows every function behaves as before. New app without it: the schedule card says the migration is needed. ⚠️ SUPERSEDES `_judge_projects()` (10k) — re-run 10p after 10k |
| `migration-2026-10k-judge-roster-and-panels.sql` | **Judge roster grid + N judges per project**: `judge_roster` (number ↔ department, public read, RPC-only writes), `judge_labels` (admin-only private names), `departments.judges_per_project`, `project_judges` (stored panel assignments); `register_judge()` / `set_judge_roster()` / `set_judges_per_project()` / `assign_panels(fill\|rebuild\|rebalance)` / `sync_judge_projects()`; `set_judge_numbers()` kept as a ranges→roster wrapper for cached apps; new departments still get a default block (now also in the roster) | **Yes — run it, then deploy the matching app.** The previous app keeps working (its range editor saves through the wrapper) but cannot show the grid or panels. ⚠️ Supersedes register_judge (10h), set_judge_numbers / set_judge_max / the numbering trigger (10i), departments_guard_judging (10j) — re-run 10k after any of those |
| `migration-2026-10l-school-branding.sql` | **Per-school logo + fair poster**: `school_branding` (paths + poster description; public read, writes only via **`set_school_branding()`**), Storage bucket **`school-branding`** (public read, 2 MB, WebP/PNG/JPEG) + `storage.objects` policies (admin of THAT school, own folder, app-generated names, no overwrite), `can_manage_branding_object()`; seeds `builtin:dishchiibikoh` for the one school whose id **and** slug match | **No** — either order. Without it Dishchii'bikoh keeps its bundled logo, everyone else gets the monogram, and Setup says the migration is needed. ⚠️ Its storage part needs the Supabase SQL editor (`storage` schema); it is skipped on a database without one |
| `migration-2026-10j-department-rubrics.sql` | **Each department picks its rubric**: `departments.rubric_id` (NULL = the school default = `rubrics.is_active`); one default per school (unique partial index, duplicates resolved to the newest); guard trigger — a department's rubric / comment-only setting cannot change once it has scores, and only its own school's rubrics; delete guard — the default and any rubric in use cannot be deleted; **`set_default_rubric()`** | No — old app keeps using the default for every department |
| `migration-2026-10i-judge-max.sql` | **Maximum judge number**: `app_settings.judge_max` (default 15, clamped 1–90 by `judge_max()`), backfilled to clamp(highest number in use, 15, 90); **`set_judge_max()`**; `set_judge_numbers()` refuses ranges past it; new departments are numbered only if they fit | No. ⚠️ Supersedes `set_judge_numbers()` (10h) and the numbering trigger (10g) — re-run 10i after re-running either |
| `migration-2026-10h-shared-judges.sql` | **Departments can share judges** (opt-in): `judges.department_ids` (backfilled `[department_id]`), `register_judge()` covers every department whose range holds the number, `set_judge_numbers()` accepts overlaps, re-syncs signed-in judges and refuses to take a department away from one | No. ⚠️ Re-running **10g** after this re-creates the older functions — always re-run 10h after 10g |
| `migration-2026-10g-school-judge-numbers.sql` | **One judge list per school** (default): `departments.judge_from` / `judge_to`, numbering trigger + backfill, `app_settings.judge_numbering`, new **`register_judge()`**, **`set_judge_numbers()`**, **`remove_judge()`** | No — new app without it keeps per-department numbering; old app with it still works (the number overrides the department it sends). Run it, then set the counts in Setup |
| `migration-2026-10f-scoring-modes.sql` | **`departments.scoring_mode`** (`scored` \| `feedback`) + **`scores.commendation`**; plus Phase 3 columns `departments.locked`, `finalized_at`, `award_grouping` (reserved, nothing reads them yet) | No — **additive only**, every default reproduces current behaviour. Without it the app treats every department as `scored` and logs `SCORING_MODE_COLS_MISSING` when you try to switch one |

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
│   ├── send-registration-email.js ← Vercel function: registration confirmation via Resend (looks up the school's name + logo itself)
│   └── scan-form.js             ← Vercel function: reads participation forms with Gemini (admin-only)
├── scripts/
│   ├── scan-form.test.mjs       ← mocked tests for api/scan-form.js (free, offline)
│   ├── db-migrations.test.mjs   ← schema + all migrations on real Postgres (PGlite): RLS, RPCs
│   ├── e2e/                     ← browser tests (playwright-core + mocked backend); screenshots in e2e/out/ (gitignored)
│   │                              scan · judge-reg · signup · setup (departments/categories) · alerts (event health + IT-log diagnostics) · judging (2 judges, ties, deliberation, awards, transfer, reset) · rubrics-2627 (the 2026-27 forms, drafts, safety) · schedule (judging schedule) · prek-sped (ribbons, shared places) · awards (award groups, Awards tab) · lifecycle
│   ├── registration-email.test.mjs ← mocked tests for the email: only the school's OWN branding, HTML escaping
│   └── scan-form-smoke.mjs      ← real-Gemini smoke test for form scanning (needs GEMINI_API_KEY)
├── supabase/
│   ├── schema-v2.sql            ← v2 multi-tenant base schema
│   ├── migration-2026-09*.sql   ← see Migrations table above
│   ├── registration-migration.sql ← historical
│   └── schema.sql               ← v1 schema — historical, do not apply
├── public/                      ← favicon.svg + icons/ (the Qritiko mark: favicon, PWA, apple-touch — never a school's logo),
│                                  branding/dishchiibikoh-logo.png (one school's bundled logo, see 🎨), icons.svg (unused Vite leftover)
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
1. **Default — one judge list for the whole school.** Each judge NUMBER is ticked into the
   departments it covers in the `judge_roster` grid (Setup → Judges, 2026-10k; before that,
   `departments.judge_from`–`judge_to` ranges, which are still kept in step for old apps). The judge
   types only a number + the invite code; `normJudgeAlias()` turns "7"/"judge 07" into `Judge7`
   and the screen shows the department from `deptForJudgeNum()`. A number exists once per school.
   **Legacy** (`app_settings.judge_numbering = 'department'`, or migration 2026-10g not run):
   the judge picks a department and `Judge1`–`Judge{max_judges}` restart in each one.
2. `handleRegister()` calls the `register_judge(school_id, department_id, alias, invite_code)`
   RPC. **All checks are server-side:** invite code (rate-limited), the number → department
   lookup (school mode ignores the department the client sends), duplicate number, department
   capacity (legacy mode), and the one-time admin-approved device transfer.
3. The server fills `judges.projects`: every project of their departments, or only their assigned
   ones (`project_judges`) in a department with `judges_per_project` set (2026-10k).
4. Session is saved to `localStorage` (`sf_judge_id`, `sf_judge_data`, `sf_judge_slug`).

### Views (`view` state)

| `view` | Screen |
|---|---|
| `school-select` | Platform marketing homepage — enter a slug or register a school |
| `school-register` | School sign-up — auth user, school row (PIN hashed by trigger), settings, departments, rubric |
| `landing` | Per-school landing — Judge / Admin cards (+ "LIVE RESULTS" card while a share link is live) |
| `judge-register` | Judge sign-in (department + alias + invite code) |
| `judge-home` | Judge's project list, progress, validation, deliberation notes. **With a judging schedule** (2026-10p): the morning in round order (R#, time, code, booth; breaks; "free") and a NEXT card |
| `judge-scoring` | Scoring form for one project |
| `admin-login` | Admin email + password |
| `admin-home` | Admin dashboard (tabbed) |
| `public-results` | Public results — via valid `?token=`, the landing card, or admin preview |
| `public-register` | Student self-registration — via `?register=<token>` (initial view only) |
| `public-projects` | Public project list — via `?projects=<token>` (initial view only). ⚠️ No UI generates this token |

### Admin tabs (`adminTab` state)

| `adminTab` | Content |
|---|---|
| `overview` | Stats, per-department leaderboards, "Get started" card (checklist only until the first judge registers; school URL + invite code **always** — it becomes "Judge sign-in details"), Change PIN card, Lock Judging, a summary card linking to Setup |
| `setup` | **Departments** (add / rename / reorder / delete / max judges / presets), the **judge grid** (+ **Suggested setup**, rule 73), the **📅 Judging schedule** (import / review / booth numbers / printouts, rule 77), **project categories** (add / rename / reorder / delete / restore defaults), project codes, **Minimum score to place** (rule 72), **School year** and **School branding** (logo + poster, see 🎨). Departments and categories are per-school data — see rule 14 |
| `judges` | Per-judge progress grouped by department; Allow Transfer (PIN); Panels card — or, with a judging schedule, "not signed in yet" + the stand-in advice (no Rebalance) |
| `projects` | Add/edit/remove/lock projects, **📷 Scan forms** (AI form reader), rubric breakdown, project-list PDF |
| `registration` | Student registration links + submissions, registration CSV |
| `activity` | Human-readable activity log with keyword filter |
| `alerts` | **Event health** (2026-10-07): this screen's real connection state, errors in the last hour, scores stuck on devices, coverage (no department / no judge / short panels), progress per department, idle judges, outliers grouped per project with every judge's total; a red **safety-concern** card (2026-10o) and projects **not in the judging schedule** (2026-10p). `eventHealth()` + `getOutlierGroups()` |
| `deliberation` | Validation & deliberation workflow, final awards (listed per award group), finalize |
| `awards` | **Awards** (Phase 3, 2026-10-21): one card per award group with the computed 1st–3rd, Confirm / Confirm all ready groups (one batched `final_decisions` upsert), Clear, status chips (tie, unscored, changed since confirmed, decided by hand), attention groups first + count in the nav; 🖨 awards list + Awards CSV (with names — admin only). Read-only once finalized |
| `share` | Public results link — **locked until results are finalized**; results CSV |
| `export` | Per-judge CSV + score backups |
| `rubric` | Edit criteria / max / steps / order; save to `rubrics`; reset to default |
| `itlogs` | IT diagnostic terminal + Reset All Data (PIN-gated). Level + time-window filters (`itRange`), build stamp, report hides the share token. **No clear button** — the log is permanent |
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
| Registration email | `RESEND_API_KEY`, `EMAIL_FROM` (Vercel server env only — never `VITE_`); reuses `VITE_SUPABASE_URL` / `_ANON_KEY` to look up the school's name + logo | `api/send-registration-email.js` |
| Form scanning (Gemini) | `GEMINI_API_KEY` (Vercel server env only, **paid** key), caller's Supabase session | `api/scan-form.js` — checks `school_admins` before calling Gemini |

### Server-side functions (migration 2026-09b unless noted)

| Function | Caller | Purpose |
|---|---|---|
| `register_judge(school, dept, alias, code)` | anon | The **only** way to create a judge row. Rewritten in 2026-10g: in school mode the number decides the department. **A wrong invite code is RETURNED as `{"error": …}`, not raised** (2026-10m, rule 66) — every other rejection still raises |
| `set_judge_roster(school, roster)` | admin | Save the whole judge grid `[{number, department_ids}]` (2026-10k). Numbers ≤ `judge_max`; a signed-in judge may gain departments, never lose one; re-fills panels and re-syncs every judge |
| `set_judges_per_project(school, dept, n)` | admin | N judges per project for one department (NULL = everyone scores all). Refused once the department has scores |
| `assign_panels(school, dept, mode)` | admin | `fill` / `rebuild` / `rebalance` (only judges who signed in keep unscored work). Never removes a scored assignment. Returns `{judges_per_project, seats, short}` |
| `sync_judge_projects(school, dept_ids)` | admin | After project changes: give judges to projects that have none (never tops up) and re-sync all judges |
| `set_judge_numbers(school, ranges)` | admin | **Legacy wrapper** (2026-10k) for cached old apps: converts From–To ranges to a roster and calls `set_judge_roster()` |
| `remove_judge(school, judge_id)` | admin | Remove ONE judge + their scores, notes and validation in one transaction (2026-10g). Returns `{alias, scores}`. App gates it behind the Admin PIN |
| `judge_numbering_mode(school)` | anon/auth | `'school'` unless `app_settings.judge_numbering = 'department'` |
| `verify_school_pin(school, pin)` | anon/auth | Returns boolean; 5 failures → 5-minute lockout per school |
| `set_school_pin(school, pin)` | admin | Change PIN (min 4 chars); re-hashed server-side |
| `school_invite_code(school)` | admin | Read own invite code |
| `set_school_invite_code(school, code)` | admin | Change invite code (⚠️ no UI calls it yet) |
| `registration_count(school)` | anon | Count only (hardening migration). No longer used by the app since 2026-10b |
| `create_school(user_id, name, slug, invite_code, pin, rubric)` | anon/auth | **The only way to create a school** (2026-10c). Creates school + owner link + 3 settings + 3 departments + rubric in one transaction. Owner must be the caller (signed in) or an account < 24 h old with no school (email-confirm path). Slug, name, invite code and PIN validated server-side |
| `submit_registration(token, form)` | anon | **The only way a public registration gets in** (2026-10b). Validates the link token, then creates project + `project_private` + submission in one transaction, numbering under a per-school advisory lock. Errors raised as `P0001` are written for the student |
| `set_school_branding(school, kind, path, alt)` | admin | **The only way to change branding** (2026-10l). `kind` = `logo` \| `poster` (path NULL = remove) \| `poster_alt`. Path must be `<that school id>/<kind>-<random>.(webp\|png\|jpg)` AND already in `storage.objects`; a poster needs a 3–250 char description. Returns the row + `old_path` (the app then deletes that file through the Storage API) |
| `can_manage_branding_object(name)` | storage policies | True only for an app-generated name in the caller's own school folder (2026-10l) |
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
| `school_branding` | SELECT open (public pages); INSERT/UPDATE/DELETE revoked + policies `false` — `set_school_branding()` only (2026-10l) |
| `storage.objects` (bucket `school-branding`) | Public bucket: files readable **by URL** only (no anon SELECT policy → no listing). INSERT / SELECT / DELETE for `authenticated` only where `can_manage_branding_object(name)`; **no UPDATE policy** (never overwrite — new name per upload) |
| `activity_log`, `it_logs` | INSERT open; SELECT admin-only |
| `score_backups` | Admin-only |

### Open risks — next security work

- **Judges are anonymous.** Anyone holding the invite code can register and then write
  *another* judge's scores: policies prove *a* valid judge exists, not *which* judge is
  calling. Fix: per-judge identity (Supabase anonymous auth, `user_id` on the judges row).
- **`scores`, `final_decisions` and `validations` are anon-SELECTable** (`USING (true)`, base schema),
  so the Share tab's "locked until finalized" gate is cosmetic against the API: anyone with the anon
  key can read live standings mid-event. Confirmed 2026-10-06. Fix belongs with per-judge identity —
  move public results behind a `verify_share_token()` RPC and close the base-table reads.
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
- Judges sign in by number. **Default:** one list for the whole school — each number belongs to one department and one person. **Legacy mode** (`judge_numbering = 'department'`): `Judge1`–`JudgeN` restart per department and the same alias may exist in several.
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
| `rubrics` | Per-school rubric **library** (2026-10j) — name, `criteria` JSONB array, `is_active` = **the school default** (exactly one). Departments point at one via `departments.rubric_id` |
| `departments` | name, `code`, `max_judges`, `ord`, **`scoring_mode`**, **`award_grouping`** (`department` \| `category`, read since Phase 3 — who competes for places), **`rubric_id`** (2026-10j; NULL = default rubric), **`judge_from` / `judge_to`** (2026-10g — this department's judge numbers; a trigger numbers new rows after the school's last number) — seeded from `DEPT_PRESETS[0]`, fully admin-editable. `code` (2026-10e) is reserved for registration numbers; `locked` / `finalized_at` / `award_grouping` (2026-10f) were reserved for Phase 3: `award_grouping` is read since 2026-10-21; `code`, `locked`, `finalized_at` are still unread |
| `categories` | Per-school project categories: name, `code`, `ord` (2026-10e). UNIQUE(school_id, name). **No FK from `projects`** — `projects.cat` is a free-text snapshot, so deleting a category never alters a project |
| `projects` | num, title, cat, grade, locked, department_id, room, description, motivation — **public, no names**. `num` UNIQUE per school (2026-10n; exact text, so "7" ≠ "007") |
| `project_private` | PK `(project_id, school_id)`, FK → projects **ON DELETE CASCADE**: advisor_name, group_members (JSONB), updated_at — **admin-only** |
| `judge_roster` | (school_id, judge_number, department_id) — which departments each judge NUMBER covers (2026-10k). Replaces departments.judge_from/judge_to as the source of truth (those are kept in step for old apps). Public read, writes only via `set_judge_roster()` |
| `judge_labels` | (school_id, judge_number, label) — **admin-only** private names behind numbers; anon has no privileges |
| `judge_schedule` | (school_id, judge_number, round_no, project_id) — one row per visit (2026-10p). While it has rows it is the ONLY source of who judges what; the slots (times, breaks) live in `app_settings.judging_schedule`. Public read, writes only via `set_judge_schedule()` / `clear_judge_schedule()` |
| `project_judges` | (school_id, project_id, judge_number) — panel assignments for departments with `judges_per_project` set. Stored, never recomputed on the fly; scored assignments are never removed |
| `judges` | alias, `projects` (JSON array of pids), department_id (FIRST department), **`department_ids`** (every department covered — 2026-10h), joined_at. UNIQUE(department_id, alias) |
| `scores` | One row per judge+project; `criteria` JSONB, notes, `submitted_at`, **`commendation`** (feedback departments only — `criteria` is `{}` there), **`feedback`** `{strength, next_step}` + **`safety_concern`** (2026-10o, elementary form). UNIQUE(judge_id, project_id). **There is NO total column** — every total is computed from `criteria` + the current rubric (`getTotal`), which is why rubric edits change past totals |
| `validations` | Judge/admin validation; `judge_id = 'admin'` for the admin. Conflict `(school_id, judge_id)` |
| `deliberation_notes` | Judge recommendation/comment/flag per project |
| `final_decisions` | Admin award per project. Conflict `(school_id, project_id)` |
| `app_settings` | Key/value, PK `(school_id, key)`: `locked`, `deliberation_open`, `results_finalized`, `judge_transfer_allowances`, `project_list_token`, `judge_numbering` (`school` default when absent \| `department`), `judge_sharing`, `judge_max`, **`project_code_format`** (default `{DEPT}-{CAT}-{NUM}`), **`school_year`** (`2026-2027`; empty/missing = automatic — August starts a new year), **`min_place_pct`** (0–99; `0`/absent = off — the minimum share of a project's own maximum needed to take 1st/2nd/3rd, rule 72), **`judging_schedule`** (JSON slots `[{kind:"round",no,label,start,end} | {kind:"break",label,start,end}]`, 2026-10p) |
| `share_links` | Public results tokens, expiry, `revoked_at` |
| `score_backups` | Admin snapshots — scores **and a copy of the rubric** |
| `registration_links` | Student registration tokens |
| `registration_submissions` | Full student form submissions (PII) |
| `activity_log` | Human audit trail — never deleted |
| `it_logs` | Structured diagnostics |
| `security_attempts` | Failure counters for PIN / invite-code rate limiting |
| `school_branding` | PK school_id (→ schools ON DELETE CASCADE): `logo_path`, `poster_path`, `poster_alt`, updated_at (2026-10l). Paths are Storage object names, or `builtin:dishchiibikoh` (seeded for that school only) |

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
branding     // { schoolId, logoPath, posterPath, posterAlt, missing } — schoolId = whose paths these are
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
| `dishchiibikoh-20` | The detailed judging form: **20 items rated 1–5**, grouped by an optional `section` field (Project Title 5 · Scientific Inquiry 4 · Data and Conclusion 4 · Presentation 5 · Further Research 2) = 100 pts, floor 20. `section` is display-only (headings in the scoring form) |
| `cibecue-100` | 5 weighted sections rated 1–5, **100 pts**: Project Title 15 · Scientific Inquiry 25 · Data and Conclusion 20 · Presentation 20 · Further Research 20. **No zero step — the floor is 20/100.** No `abstract` criterion |
| `isef-ms-hs-2627` | **THE 2026-27 middle/high form** (final, from the organiser 2026-10-21): **20 items rated 1–5**, ids `hs_*`, five `section`s — Project Overview & Purpose 3 · Scientific Inquiry & Method 5 · Data & Conclusion 4 · Presentation & Defense 4 · Research, Collaboration & Compliance 4 = **15/25/20/20/20 = 100**, floor 20. **Numbers only** (no `stepLabels`; the scale is in `settings.guide`). "Abstract & Background" is `hs_abstract_bg`, NOT `abstract` (that id carries the grade-<5 exemption) |
| `elementary-2627` | **THE 2026-27 elementary form**: **8 items rated 1–5** (= 40), ids `el_*`. The paper's "committee use: total × 2.5" is **built into the steps** — `steps [2.5, 5, 7.5, 10, 12.5]`, `max 12.5`, `stepLabels ["1".."5"]` — so every total, average, ranking, the 60% minimum and the outlier check are out of **100** with no downstream code knowing. `settings`: `factor 2.5` (display: "Ratings 32 / 40 × 2.5 = 80 / 100"), `feedback: "strength_next"`, `safety: true` |
| `prek-sped-2627` | **THE 2026-27 PreK & SPED Recognition Rubric** (from the organiser 2026-10-21; replaces *Comments only* for PreK + SPED): **4 criteria rated 1–5** (whole numbers) = **20**, ids `ps_*`, floor 4. `settings`: `guide`, `commentsLabel`, **`ties: "share"`** (rule 78) and **`ribbons`** `[{min:17,Gold Star Scientist},{min:13,Silver Star},{min:0,Bright Star}]` — every child gets one, derived from the average, never stored |

Applying a preset goes through `requestSaveRubric()`, so the impact warning + backup offer
still fire when scores exist. Presets are starting points; every criterion stays editable.

**Rubric-level settings (2026-10-21) come from the PRESET, not a column.** `rubricSettings(criteria)`
returns the `settings` of the preset whose criteria match (`sameCriteria`: same ids, order, maxima) —
the scale `guide`, `commentsLabel`/`commentsHint`, the × `factor`, `feedback: "strength_next"`, `safety`.
No migration, and a renamed or copied rubric keeps them; changing an id or a max turns them off (it is
no longer that form). A hand-written rubric therefore cannot have the Strength/Next/safety boxes — a
deliberate limit until a school needs it (then: a `rubrics.settings` column, rule 68-style fallback).

**2026-10-21: the 2026-27 middle/high form ends the disagreement below.** Its section totals are simply
item count × 5 (3/5/4/4/4 items → 15/25/20/20/20), so the item-by-item form and the summary weights now
agree. Use `isef-ms-hs-2627` for 6-8 and 9-12, `elementary-2627` for K-5. The paragraph below is history.

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
**Minimum score to place (optional, rule 72).** `app_settings.min_place_pct` — when set, a project
must average at least that share of **its own** `projectMax()` to take 1st/2nd/3rd. It changes who gets
a medal, never a score, a ranking position or a total: below-minimum projects still appear in every list
with their real average, and the medals pass to the next projects that do qualify. Off by default.

5. **Finalize** — allowed when `finalizeBlocker()` returns "": admin approved, deliberation closed,
   and **no judge has an open concern** (`openConcerns()`, 2026-10-07). A judge who has not validated
   does NOT block it, so a volunteer who leaves early can never stop the results; the admin can
   **Clear concern** (`clearJudgeConcern()` deletes that validation row → Pending, logged
   `JUDGE_CONCERN_CLEARED`). Checked on the button AND in `finalizeResults()` (rule 18). Sets
   `app_settings.results_finalized = "true"`, which **unlocks the Share tab**.

---

## 💾 Offline & PWA

- `vite-plugin-pwa` precaches the app shell (JS, CSS, HTML, fonts).
- On mount the judge session and scores restore instantly from `localStorage`, then are
  verified against Supabase (a judge removed by reset is sent back to landing). "Removed" needs a
  SUCCESSFUL judges read (`judgesLoadedRef`): an empty list from a failed read keeps the session,
  an empty list from a working read (after Reset All Data) signs the device out.
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
| `sf_score_drafts` | Unsubmitted scoring taps per `${judgeId}_${projectId}` (2026-10-21, rule 75). Deleted on submit / queue; never synced, never counted |
| `sf_it_outbox` | IT-log entries this device could not write (offline / failed request), ≤ 50; sent by `flushItOutbox()` with their original time (`ctx.delayed`) |

---

## 🔗 Share Live Results

- Share tab is locked until `resultsFinalized`. Options: title, show rubric breakdown, expiry (`1h`/`24h`/`7d`/`never`).
- URL: `https://qritiko.com/s/{slug}?token=…`. `init()` validates the token against a
  `share_links` row for this school that is not revoked or expired; otherwise "Link Unavailable".
- `isLinkLive()` = `shareEnabled && shareToken && !expired`. While live, a "● LIVE RESULTS" card shows on the school landing page.
- Public page: results **split by department**, podium (2nd-1st-3rd), ranked table, award badges
  for finalized decisions, optional rubric chips. **Never judge names.**

---

## 🎨 School branding (logo + fair poster) — added 2026-10-06

| Piece | Where |
|---|---|
| Admin UI | Setup tab → `#branding` card: preview before saving, Replace, Remove (inline confirm), poster description |
| Storage | Public bucket `school-branding`, object names `<school id>/(logo\|poster)-<20 hex>.(webp\|png\|jpg)`, `cacheControl` 1 year |
| Row | `school_branding` via `set_school_branding()` (see Security) |
| Display | `brandingUrl()` → `<SchoolLogo>` (88 px landing, 64–72 px registration/results/project list) and `<BrandPoster>` |
| Offline | workbox `runtimeCaching` CacheFirst for `/storage/v1/object/public/school-branding/` (safe: names never reused) |
| Email | `api/send-registration-email.js` → `loadSchoolBranding(schoolId)` reads `schools` + `school_branding` with the anon key |

**Save order** (`saveBrandDraft`): upload new file → RPC → on RPC error delete the upload → on success
delete `old_path` (best effort, WARN on failure). Logs: `BRANDING_UPDATED`, `BRANDING_REMOVED`,
`BRANDING_SAVE_FAILED`, `BRANDING_OLD_FILE_NOT_REMOVED`, `BRANDING_TABLE_MISSING` — sizes and kinds only.

**Poster placement:** landing — after `.role-grid`, `max-height: min(75vh, 760px)`; registration form —
after the heading, `min(45vh, 420px)`; public results — after the hero, `min(45vh, 440px)`.

**The bundled logo:** `LEGACY_LOGOS` (JSX **and** `api/send-registration-email.js` — keep both in step) maps
the Dishchii'bikoh school id → `{ slug, path: "builtin:dishchiibikoh", src }`. Used only when the row says
that path (or the table is missing) and both id and slug match. Removing it in Setup is permanent.

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
- Projects: `.proj-mgmt-header`, `.proj-mgmt-table`, `.proj-act-btn`, `.proj-form` (the Add/Edit form — inline at the top of the tab, NOT an overlay; `projFormRef` scrolls it into view), `.proj-form-grid`, `.proj-lock-badge`
- Banners/modals: `.offline-banner`, `.locked-banner`, `.modal-overlay`/`.modal-box`, `.pin-gate`, `.it-term`
- Onboarding: `.mkt-*` (homepage), `.setup-guide*` / `.setup-check*` / `.setup-share*` (admin "Get started" card)
- Setup tab: `.setup-rows`, `.setup-row`, `.setup-ord`, `.setup-main`, `.setup-name`, `.setup-meta`, `.setup-acts`, `.setup-maxj`, `.setup-edit`, `.setup-code-in`, `.setup-add`, `.setup-presets`, `.setup-preset-grid`, `.setup-preset`, `.setup-mode`
- Comment-only departments: `.fb-banner`, `.fb-chips`, `.fb-chip` (`.selected`)

---

## ⚙️ Key Functions

```js
// Scoring math
getTotal(score, proj)        // sum of score.criteria under THAT PROJECT's rubric (2026-10j) — always pass proj
projRubric(proj), rubricFor(deptId), rubricRowFor(deptId), defaultRubricRow(), deptsUsingRubric(id)
deptHasScores(deptId)        // score keys end with `_${projectId}` — never cut a key at "_" (rule 60)
loadRubrics(sid), createRubric(), renameRubric(), deleteRubric(), makeDefaultRubric(), updateDeptJudging(id, rubricId|"feedback")
critVal(scoreOrEntry, rid)   // module helper: one criterion from .criteria (legacy flat-field fallback)
projectMax(proj)             // max for ONE project (drops abstract when grade < 5) — use this
                             // for anything shown next to a single project's score
stepLabel(r, v, i)           // module helper: a criterion's rating word for step i, or null
                             // when stepLabels is absent/desynced (then show the number)
ANOMALY_PCT                  // 0.19 — outlier threshold as a fraction of projectMax(p)
projAvg(pid) / rubAvg(pid, rid)  // averages → "xx.x" | null
rankedProjectsIn(deptId)     // ranking WITHIN a department (null = unassigned) — use this
rankedProjects()             // cross-department ranking; already excludes feedback departments
scoredProjects()             // projects that carry a score — every leaderboard/tie/anomaly scan
participantsIn(deptId)       // a feedback department's projects + their commendations, by number
deptMode(id) / isFeedbackDept(id) / isFeedbackProject(proj)
updateDeptScoringMode(deptId, 'scored'|'feedback')   // refuses once that department has scores
minPlacePts(proj), placesEligible(proj), placesOf(rankedList), minPlaceText()
                             // "minimum score to place" (rule 72). placesEligible() is the ONLY
                             // test for "may this project take a medal"; placesOf() → Map(id → place
                             // index 0–2) is the ONLY place medals are decided (replaced placeWinners()
                             // 2026-10-21). Off (0) → everything qualifies.
awardGroups()                // Phase 3 (rule 79): [{key, deptId, deptName, cat|null, label, projects(ranked)}] —
                             // one per department, or per category where award_grouping = "category"
confirmedPlaces(projs), groupPlaces(projs), deptPlaces(deptId)   // confirmed awards win over computed places
groupTie(g), tieGroups(), hasTie(), groupStatus(g)   // medal-deciding ties per group; Awards-tab state
confirmAwardGroups(groups, "confirm"|"clear"), updateDeptAwardGrouping(id, v)
awardsListRows(), printAwardsList(), exportAwardsCSV()   // ceremony list — names, admin only
tiesShare(proj), ribbonOf(proj)   // PreK & SPED form (rule 78): tied averages share a place; the ribbon
ribbonFor(settings, avg)     // module: the ribbon band for an average, or null when the rubric has none
saveMinPlacePct()            // app_settings.min_place_pct, upsert + error check (rule 55)
judgeComp(judge)             // { done, total, pct } — pct 0 when total 0
hasScored(pid), totalScored(), possible(), draftTotal(), allMoved()
getAnomalies()               // outliers > 8 pts from the project average

// Validation & deliberation
completedJudges()            // judges at 100% with total > 0
openConcerns(), finalizeBlocker()   // judges with approved=false; why Finalize is unavailable ("" = allowed)
clearJudgeConcern(judge)     // admin: delete that judge's validation row (back to Pending) — checks rows came back (rule 54)
hasTie()                     // per-department tie detection
consensusReached(), valProgress()
submitJudgeValidation(ok), submitAdminValidation(ok)
openDeliberation(reason), closeDeliberation()
saveFinalDecision(pid, award, notes), finalizeResults()
getDelibNotesForProject(pid), getRecBreakdown(pid), getFlagCount(pid)
recPillClass(rec), awardBadgeClass(award), awardEmoji(award), buildDelibReport()

// Judges & projects
handleRegister()             // calls register_judge RPC
schoolNumbering()            // true when judge_numbering is 'school' AND departments carry ranges
deptForJudgeNum(n), deptsForJudgeNum(n), deptNames(ids), judgeRangeText(d), deptJudgeCount(d)
loadRoster(sid), loadProjectJudges(sid), loadJudgeLabels(sid)   // 2026-10k
rosterInUse(), deptNumbers(d), sharedWith(d), topJudgeNumber(), compressNums(nums)
rosterView(), toggleRosterCell(n, deptId), rosterLoad(n, map), saveRoster()   // Setup → Judges grid
setDeptJudgesPerProject(deptId, n), runPanels(deptId, "rebuild"|"rebalance"), panelInfo(d)
// NOTE: never name a helper use*() — React treats it as a hook (useRoster() broke rules-of-hooks)
suggestRoster(nJudges, panel), applySuggestion(sug)   // Setup → Judges "Suggested setup" (rule 73)
                             // Pure arithmetic, NO AI. One scored department per judge, sized by
                             // project count: every department gets its floor (= panel), then each
                             // spare judge goes to the department that is BUSIEST per judge.
                             // applySuggestion() fills rosterDraft only — never saves (rule 73).
MIN_PER_PROJECT, judgeTimeText(n)   // module: 6 min/project, the "About" hints only. Never scoring.
judgeMax(), saveJudgeMax()   // maximum judge number (2026-10i); judgeMax() falls back like the backfill
judgeDeptIds(j)              // module helper — EVERY department a judge covers; never use j.department_id alone
setJudgeNumberingMode(mode)  // app_settings.judge_numbering
confirmRemoveJudge()         // PIN → remove_judge RPC → reload scores/validations/notes
dbToDept(r), normJudgeAlias(raw), judgeNumOf(alias)   // module helpers — dbToDept is the ONLY row→state mapper
syncJudgeAssignments(deptIds, list?)   // push the current roster to judges in those departments
createProject(data, base?)   // shared insert path (Add Project + scanner) → { error, nextProjects, proj }
                             // on a number clash (2026-10n) re-picks from the SERVER's list and retries
                             // once — only when the number was not typed (blank, or data.numAuto)
DUP_PROJECT_NUM(err)         // 23505 on projects_school_num_uniq — never any other unique clash
addProject(), updateProject(pid), removeProject(pid), toggleProjectLock(pid)
writeProjectRow(mode, row, pid)        // public columns only; drops 2026-10 columns if that migration is missing
writeProjectPrivate(pid, adviser, members)  // names → project_private (falls back to legacy columns pre-2026-10b)
nextProjectNum(list?), exportProjListPDF(), exportProjectsCSV()
importFile(file), importIssues(row), importDeptId(row), runImport(), closeImport()   // Projects CSV import
parseCsv(text), uncsvCell(v), parseMembersText(s), projectsFromCsv(text)            // module helpers (import)
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
submitScore()                // enforces judging lock + already-validated gate; one submit at a time
                             // (scoreSavingRef) — two taps wrote two audit entries
MISSING_FN(err)              // module helper: "this RPC does not exist here", as opposed to any other
                             // failure. Gates compatibility fallbacks — see rule 68
flushOfflineQueue()          // guarded; body in runOfflineFlush(queue)
upsertScore(payload)         // the ONLY score write (submit + offline flush) — 2026-10o fallback, rule 76
startScoring(pid), editDraft(patch), discardDraft()   // scoring screen; every edit → sf_score_drafts (rule 75)
readDrafts(), writeDraft(key, draft|null), DRAFTS_KEY // module helpers

// Judging schedule (2026-10p, rule 77)
parseScheduleCsv(text), SCHED_FREE   // module: the organiser's grid → { slots, rows:[{number, cells:[{round, code}]}], error }
loadSchedule(sid), scheduleActive(), scheduleFor(n), scheduleRounds(), roundTime(no), unscheduledProjects()
importScheduleFile(file) → schedDraft (review, nothing saved) → saveSchedule() (set_judge_schedule RPC) · clearSchedule()
importBoothFile(file)        // booth template ("Booth #" + "Project code") → projects.room; skips locked (rule 12)
printJudgeSheets(), printBoothSheet(), schedPrintWindow()   // no names, no scores
rubricSettings(criteria)     // module: the matching preset's settings (guide, factor, feedback, safety) or {}
ratingOf(settings, v)        // module: points → the rating the judge tapped (v / factor); display only
queuedScoresFor(sid)         // module helper: this device's unsynced scores for one school as score-map
                             // entries. loadScores() overlays them — the queued value always wins

// Admin / security
verifyAdminPin(pin)          // verify_school_pin RPC → boolean
changeAdminPin()             // set_school_pin RPC
loadInviteCode(sid)          // school_invite_code RPC → inviteCode state
allowJudgeTransfer(alias) / confirmTransfer()   // PIN modal, one-time ~10 min allowance
executeReset()               // PIN-gated; see rule 15
ensureSeedData(schoolId)     // re-seeds departments, rubric, baseline app_settings on first admin load
requestSaveRubric(criteria) → saveRubric(criteria)   // impact check + confirm; save reports failure
addLog(msg), addItLog(level, module, event, detail, payload, sid?)
                             // stamps payload.ctx = { build, session, role, judgeId, alias, online, app }
                             // (logCtxRef, kept current by an effect); a failed insert goes to sf_it_outbox
flushItOutbox()              // sends sf_it_outbox (on online / after load / Sync Now)
noteLoadError(table, error, sid)   // LOAD_FAILED once per table+code per page load; skips offline,
                             // unrun migrations and admin-only tables refusing a non-admin
eventHealth(), getOutlierGroups()  // Alerts tab; getAnomalies() is now derived from getOutlierGroups()
itLogsInView(), IT_RANGES, IT_LOG_LOAD_MAX   // IT Logs filters; the tab loads the newest 1,000
APP_BUILD, SESSION_ID, isStandaloneApp()     // module: build stamp (vite.config.js define __APP_BUILD__), page-load id
MISSING_COL(err), MISSING_TABLE(err)         // module level since 2026-10-07 (loaders use them)
                             // pass sid from the mount effect / window listeners — they see the
                             // first render, where currentSchool is still null (entry would not be saved)
buildSnapshot()

// School year — app_settings.school_year ("" = automatic). Never hardcode "SY 20xx-20xx".
schoolYearFor(date), AUTO_SCHOOL_YEAR, cleanSchoolYear(v), validateSchoolYear(v)   // module helpers
saveSchoolYear()             // upsert + error check (rule 55); syText / defaultResultsTitle are derived in App
// shareTitle "" = defaultResultsTitle; generateLink() stores the resolved title on the share_links row

// School branding (2026-10l) — see 🎨
brandingUrl(path)            // public URL ONLY for the school on screen (own folder / its own builtin) else null
loadBranding(sid), pickBrandFile(kind, file), saveBrandDraft(), removeBrand(kind), savePosterAlt()
prepareBrandImage(file, kind), decodeBrandImage(file), schoolInitials(name)   // module helpers
<SchoolLogo src name size pending/>, <BrandPoster src alt maxH/>                // module components

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
- `departments`, `categories`, `projects`, `project_private`, `share_links`, `app_settings`, `school_branding` — full `loadX(sid)` (rare admin changes).
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
5. **The rubric is dynamic AND per department (2026-10j).** There is no single "the rubric": use **`projRubric(proj)`** / **`rubricFor(deptId)`** for anything about a project (scoring form, totals, maxima, breakdowns, CSV values) and pass the project to **`getTotal(score, proj)`** — without it the DEFAULT rubric is used and a department on another rubric totals 0. The Rubric tab works on `viewRubricRow()`. Previously: use the `rubric` state everywhere; `DEFAULT_RUBRIC` is only a seed/fallback, and `RUBRIC_PRESETS` are starting points. **Never assume a rubric has 42 points, an `abstract` criterion, a `0` step, or any particular criterion id** — the Cibecue preset has none of those. Guard with `r.id === "abstract"`-style checks that no-op, never with "the rubric always has N criteria".
6. **Never hardcode the max score, or anything derived from it.** Use **`projectMax(proj)` for anything about one project** (`rubricMax()` was removed 2026-10-07 — its last caller was the old Alerts tab) — they differ whenever a criterion is exempt (grade < 5 skips `abstract`: 36, not 42). A literal `42` is a bug, and so was `getAnomalies()`'s hardcoded "> 8 points", which is ~19% of 42 but only 8% of 100 — it would have flagged nearly every judge on the Cibecue rubric. It is now `projectMax(p) * ANOMALY_PCT`. Six per-project displays showed `/rubricMax()` and were fixed 2026-10-06 (public podium + results rows, deliberation header and per-judge bars, `buildDelibReport()`).
7. **Score key format is `${judgeId}_${projectId}`.** Do not change it.
8. **Ranking and tie detection are per department.** Use `rankedProjectsIn(deptId)`; cross-department ties are meaningless.

**Judges & projects**
9. **A judge's list is `judges.projects`, filled by the SERVER** (2026-10k). By default every judge scores every project in their departments; a department with `judges_per_project = N` gives each project N judges from its roster (`project_judges`). Never compute a judge's projects in the browser from department membership alone — call `sync_judge_projects()` (via `syncJudgeAssignments()`), which fills panels for NEW projects only (it must never top up short projects: after a Rebalance that would hand work back to absent judges) and re-syncs every judge. Scored assignments are never removed by rebuild/rebalance/roster saves.
10. **Any project change re-syncs judge assignments.** `judges.projects` is a snapshot, so `addProject()` and a department change in `updateProject()` must call `syncJudgeAssignments()`. `removeProject()` does its own removal.
11. **Judge numbers are one list per school by default (2026-10g).** Since 2026-10k a department's seats are its rows in `judge_roster`, saved only through `set_judge_roster()` (which also keeps the legacy `judge_from`/`judge_to`/`max_judges` in step); never write the roster or range columns directly, and never let the client decide a judge's department in school mode — `register_judge()` derives it from the number. Build department rows with `dbToDept()` or the ranges silently disappear. In **legacy mode** `max_judges` is per department and locks once that department's first judge registers. The old global `maxJudges` / `app_settings.max_judges` was removed 2026-09-25 — do not reintroduce it. `JUDGE_NAMES` pre-generates Judge1–Judge100.
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
    - **How to check:** `npx eslint src/ScienceFairJudging.jsx -f json` and count findings per rule. The healthy baseline is **28 `react-hooks/purity` + 5 `react-hooks/immutability`** (27 → 26 on 2026-10-06 when the save-then-update rewrite merged two `Date.now()` lines; 26 → 28 on 2026-10-21 when `runOfflineFlush()` started calling `upsertScore()` and the compiler began REPORTING its two existing `Date.now()` lines — more of the file analysed, the opposite of a bailout; verified by diffing the findings by source line). If those two drop to zero you have caused a bailout — a plain error count is not enough to notice, so compare per-rule before every commit that touches `App`.
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

**Scoring modes**
59. **A `feedback` department must never reach anything that ranks or compares numbers.** Its
    scores have `criteria: {}`, so `getTotal()` returns 0 — include one in a leaderboard and every
    project in it ranks last at 0; include one in `hasTie()` and they all "tie", so the deliberation
    alert never switches off. Filter with **`scoredProjects()`** (projects) or
    `d.scoring_mode !== "feedback"` (departments), and render participants with
    `participantsIn(deptId)` — ordered by project number, never by score. Public results show those
    departments with no rank, no denominator and no medal: the whole point is that nobody is ranked.

60. **Never parse a score key by splitting on "_".** Keys are `${judgeId}_${projectId}` and both ids
    contain underscores (`j_ab12_p_cd34`). Match with `key.endsWith(`_${p.id}`)` (see `deptHasScores()`,
    `projAvg()`). Two checks did `k.slice(k.lastIndexOf("_") + 1)` → `"cd34"`, matched nothing, and the
    "department already has scores" guard never fired on screen (2026-10f → 2026-10-06).
61. **A department's rubric or comment-only mode may not change once it has scores** — enforced by the
    `departments_guard_judging` trigger (2026-10j) and in `updateDeptJudging()`. Editing a rubric's
    criteria is different: it is allowed, behind `requestSaveRubric()`'s impact warning, and changes
    every department that uses it.

**Branding (2026-10l)**
62. **A school's pages show only that school's branding.** Resolve every image through `brandingUrl()` — it
    refuses paths outside `<currentSchool.id>/` and `builtin:` logos the school does not own (id AND slug).
    No logo → `<SchoolLogo>` monogram. Never hardcode a school's logo, name or email domain anywhere a
    different school can see it (that is how the wildcat ended up on every school, 2026-06 → 2026-10).
63. **The favicon / PWA icon / apple-touch-icon are the Qritiko mark.** One origin serves every school
    (rule 33), so the installed-app icon can never be a school's logo.
64. **Branding files are immutable.** Each upload gets a new random name (so the CDN, browser and the
    service worker's CacheFirst rule can cache forever); the old file is deleted *after* the row points at
    the new one; if the row update fails the new upload is deleted. Delete files through the Storage API,
    never `DELETE FROM storage.objects` (orphans the stored object). Uploads are shrunk + re-encoded in the
    browser (`prepareBrandImage`): never upload the picked file as-is, never accept SVG.
65. **The poster never goes on judges' screens** and always sits below the primary controls; posters are
    sized with max-width + max-height only (never a fixed width/height, never cropped).

**Diagnostics (2026-10-07)**
69. **Every IT-log entry goes through `addItLog()`** so it carries `ctx` (build, session, role, judge, online,
    installed app) and survives being offline (outbox). Never insert into `it_logs` directly. Payloads hold
    counts, ids and error codes — never names, emails or form text.
70. **Log a condition, not a symptom that every device has.** `REALTIME_DOWN` is written only after 30 s of
    downtime while the page is visible (`RT_GRACE_MS`); before that every phone locking its screen wrote one and
    they buried real problems. Anything new that can fire on every device follows the same rule.
71. **Time on the Alerts board comes from `nowTick`** (a 30 s interval while an admin is signed in), never
    `Date.now()` during render — that is a purity finding (rule 37).

72. **"Minimum score to place" is a PERCENT of `projectMax(proj)`, never a point value.** Departments
    can be on different rubrics (42 and 100 points) and a project below grade 5 skips `abstract` (36, not
    42), so a stored "50 points" would mean "unreachable" on one rubric and "half" on another. Every
    medal decision goes through **`placesEligible(proj)`** and the medal list through **`placesOf()`** —
    do not re-derive "top three" with `slice(0, 3)` anywhere else, or the podium and the ranked table
    will disagree about who won. The rule withholds a MEDAL only: it never hides a project, changes a
    score, or renumbers the ranking. It also gates `hasTie()` (a tie below the line cannot decide a medal,
    and before this the amber deliberation alert would never switch off for one). It governs 1st/2nd/3rd
    only — Honorable Mention and Best in Category stay the admin's to give — and in the Validation tab it
    **warns, never blocks**: a refusal with no override on event day is worse than a clear note.

73. **The judge-setup suggestion is arithmetic, not AI, and it never saves by itself.**
    `projects × scores ÷ judges` is exact, so `suggestRoster()` is instant, free, works offline and
    cannot invent a number the organiser would act on. Do not route it through Gemini. Two rules it
    encodes, both learned the hard way: (a) **one scored department per judge** — `judges_per_project`
    balances WITHIN a department and is blind ACROSS them, so a judge in three departments collects
    three shares (the live 2026-27 roster had one judge on 58 projects and another on 19); it also
    stops anyone switching between two rubrics mid-session. (b) Spare judges go to the department
    that is **busiest per judge**, not in proportion to project count — on 8/31/19 projects with 15
    judges, proportional gives 4/6/5 (loads 6…15.5) where busiest-first gives 3/7/5 (loads 8…13.3).
    `applySuggestion()` writes `rosterDraft` and stops; the admin presses **Save judges**. It also
    unions in each signed-in judge's current departments, because `set_judge_roster()` refuses to take
    one away. `MIN_PER_PROJECT` (6) drives the "About" time hints only — nothing in scoring reads it.

**Scoring forms & drafts (2026-10-21)**
74. **A scale factor lives in the STEPS, never in the maths.** The elementary form's × 2.5 is
    `steps [2.5 … 12.5]`, so `getTotal`, `projectMax`, rankings, `placesEligible`, outliers and every
    export stay rubric-agnostic (rule 5). `settings.factor` is DISPLAY-only (`ratingOf()`: the rating
    on the button, "4 / 5" per item, the "Ratings 32 / 40 × 2.5" working, the CSV "Ratings" columns).
    Steps and Max Points may be decimals: `parseSteps()` and the Max Points box use `parseFloat`
    (`parseInt` turned 7.5 into 7, so merely opening and saving the elementary rubric fired the impact
    warning and would have rewritten every elementary score). Never reintroduce `parseInt` there.
75. **A draft is never a score.** `sf_score_drafts` holds a judge's unsubmitted taps per
    `${judgeId}_${projectId}`, written by `editDraft()` on every edit and restored by `startScoring()`
    (the draft wins over the saved score — it is always newer). It is deleted the moment `submitScore()`
    succeeds OR queues, never synced, never counted, and wiped with the session when a reset removes the
    judge. Every input on the scoring screen must go through `editDraft()`, not a bare setter — a field
    that bypasses it silently drops out of the draft. `writeDraft()` stamps `ts` at module level so no
    `Date.now()` runs inside `App` (rule 37).
76. **Write scores only through `upsertScore()`** (submit AND offline flush). It retries a row that
    names the 2026-10o columns WITHOUT them on `MISSING_COL` only (rule 68), folding the comments and a
    "⚠ SAFETY / RULE CONCERN" line into `notes` — otherwise one unmigrated database would leave every
    elementary score stuck in the offline queue forever. The safety flag is logged as a flag
    (`SAFETY_CONCERN_RAISED`, only when newly raised), never with the comment text (rule 69).

**Judging schedule (2026-10p)**
77. **While `judge_schedule` has rows it is the ONLY source of who judges what.** The server fills
    `judges.projects` from it in round order (`_judge_projects`), so nothing in the browser may compute
    a scheduled judge's list. Everything that reassigns work is OFF meanwhile — the grid's ticks and
    "judges per project" (read-only; `set_judge_schedule()` derives the grid itself), **Rebalance** (it
    knows nothing about rounds and could give one judge two projects in one round), the **Suggested
    setup** (Apply would fight the schedule) and the panel-short coverage warning. An absent judge is
    covered by a stand-in using THAT judge's number. Codes in the file are matched with `projectCode()`
    — the same code the judge and the printouts show — never by number alone. A re-import that drops a
    visit already scored is refused by the server (same promise as panels: scored work never moves).
    A project not in the schedule is scored by nobody — `eventHealth().notScheduled` puts it on Alerts.

**Places & ribbons (2026-10-21)**
78. **Tied places are shared ONLY on a rubric whose preset says `ties: "share"`** (the PreK & SPED form).
    There `placesOf()` gives the places to the three highest DIFFERENT averages — the sheet's "highest /
    second highest / third highest total score" — so 18, 18, 15 is 1st, 1st, 2nd, and `hasTie()` skips the
    department (nothing to deliberate). Every other rubric keeps one project per place and the tie alert.
    Places are per DEPARTMENT, as everywhere (PreK with two projects has no 3rd). Ribbons come from
    `settings.ribbons` through `ribbonOf()` — derived from the average on display (leaderboard, public
    results, results CSV), never stored, and bands are minimums (16.5 is Silver; Gold starts at 17). Like
    rule 74, both are PRESET settings: editing the form's ids or maxima turns them off.

79. **Places come from AWARD GROUPS, and confirmed awards win** (Phase 3). `awardGroups()` is the only
    definition of who competes for 1st–3rd: a department, or each category in it (`award_grouping`). The
    podium, ranked table, leaderboard, results CSV, awards list and `hasTie()` all go through it — never
    rank a department as a whole when it awards per category. A group shows the places the admin CONFIRMED
    (`final_decisions` 1st/2nd/3rd, `groupPlaces()`) once it has any, else `placesOf()`; that is how a tie
    decided in deliberation reaches the podium. Confirming writes ONE batched upsert and never touches
    Honorable Mention / Best in Category; a project that lost its place goes back to Pending. A tie counts
    only where it decides a place (1st–3rd, or 3rd/4th) and only until the group is decided. The awards
    list carries names (project_private) and is admin-only, never published.

**SQL that must survive its own rejection**
66. **A `RAISE` throws away everything the function wrote, including the rate-limit counter.**
    PostgREST runs each RPC in one transaction, so `note_auth_failure()` followed by `RAISE` records
    nothing at all — `register_judge()` claimed a 5-attempt invite-code lockout that had never once
    counted a failure (found 2026-10-06; `verify_school_pin()` was always right because it RETURNS
    false). Anything that must persist on a rejected call has to be **returned**, never raised.
    `register_judge()` therefore answers a wrong code with `{"error": …}` and `handleRegister()`
    checks `data.error` as well as `error`.
67. **A scored project may not move to a differently-judged department** — `projects_guard_department_move`
    (2026-10m). Moving between departments with the same rubric and mode stays allowed on purpose:
    refiling a misplaced project mid-event is legitimate, reinterpreting its scores under another
    rubric (or hiding them in a comments-only department) is not. This is rule 61's sibling: 61 stops
    the DEPARTMENT changing under the scores, 67 stops the PROJECT moving out from under them.

68. **A compatibility fallback may only run when the capability is genuinely absent.**
    `syncJudgeAssignments()` fell back to the browser sync on ANY error from `sync_judge_projects()`,
    and that fallback hands every judge every project in the department — so a single transient 503
    silently undid a "3 judges per project" panel while `project_judges` still held the real one.
    Gate every such fallback on `MISSING_FN()` / `MISSING_TABLE()` / `MISSING_COL()` and let a
    transient failure fail loudly instead. Found in review 2026-10-06.

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

**More judges:** Setup → Judges → tick more numbers into that department → Save judges (allowed after judges signed in; unticking a signed-in judge's department is refused). Raise Maximum judges first if the grid is too short. Legacy mode: raise Max Judges before that department's first judge registers.

**A judge signed in by mistake:** Judges tab → Remove (Admin PIN) → `remove_judge()`. No Reset needed.

**Adding a project:** Projects tab → "+ Add Project" (department, title, category, number, teacher, room, students with grades, description, motivation). `addProject()` → `createProject()` inserts and syncs judge assignments.

**Adding projects from paper forms:** Projects tab → "📷 Scan forms" — see "📷 Form scanning".

**Changing a school's project categories or departments:** admin **Setup tab** — no code, no schema change, no deploy. Each school's list is its own. Only edit `DEFAULT_CATEGORIES` / `DEPT_PRESETS` to change what a *brand-new* school starts with (existing schools keep theirs).

**Changing what the scanner reads:** add the field to `buildSchema()` (+ `required`), the prompt, `normaliseForm()`, `scanCardFromForm()`, `emptyScanData()`, the card UI, and — if it is saved — a migration + `createProject()` / `writeProjectRow()`'s optional-column list. Then run the smoke script.

**Redefining an RPC in a newer migration** (e.g. `register_judge()` in 09b → 10g → 10h): every older file
still contains the older body, so re-running an older migration silently downgrades the function. Add a
⚠️ note to the older file's header and keep `scripts/db-migrations.test.mjs` re-running the newer file after
any standalone re-run of the older one.

**DB changes:** write a new `supabase/migration-YYYY-MM-*.sql`, keep it re-runnable, add it to the
Migrations table above, and say in the commit whether it is coupled to the app build.

---

## 🐛 Change History (condensed)

Full detail is in the git log for each commit.

**2026-10-21 — Overview "Judges 0/47" → "Judges signed in 0/15"** (no migration). The organiser asked what
0/47 meant: the card added up every department's legacy `max_judges` — one per department TICK — so 15
judges, several covering two to four departments under the schedule, read 47. New `judgeSeats()`: distinct
judge numbers in school mode (roster, else the ranges); the old sum only in legacy per-department
numbering. Label now says "Judges signed in". Help gained that answer plus "where is Places per
category" (an open tab keeps the previous build until reloaded). judge-panels.e2e +1 check (judge 1 in two
departments → 0/5, not 0/15), mutation-tested (old formula → fails).

**2026-10-21 — Phase 3: award groups + the Awards tab** (no migration — `departments.award_grouping`
came with 2026-10f; rule 79).
- **Setup → Places: per department / per category** for each scored department.
- **`awardGroups()`** feeds every medal: public results (a per-category department is shown split into its
  categories), Overview leaderboard ("places per category" badge), results CSV (new **Award group**
  column, Rank restarts per group), the deliberation list (labelled + ranked per group — it used to rank
  across departments, "Rank 4" meant nothing) and the tie alert, which now names the group and the place.
- **Ties**: only medal-deciding ones (1st–3rd, or 3rd/4th) raise the alert — before, a tie in 9th place
  kept deliberation "recommended" all day — and a decided group never does.
- **🏅 Awards tab**: computed top 3 per group, **Confirm all ready groups** in one batched upsert (~70
  awards one by one was the roadmap's event-day worry), Re-confirm when scores changed, Clear, attention
  groups first + count in the nav, read-only after Finalize. Confirmed places override the computed order
  on the public page.
- **Awards list** (print + CSV) with student and teacher names, groups not confirmed marked — admin only.
- Caught by lint: `groupTie()` first used a `for` loop whose `filter` callback closed over `i` → the React
  Compiler bailed out of App and purity/immutability fell 28/5 → 0/0 (rule 37). Bisected by cutting each
  new function and re-linting; rewritten with `findIndex`. A `Date.now()` in the printout → `nowTick`.
Tests: new `scripts/e2e/awards.e2e.mjs` (28: the Setup choice, per-category medals on the leaderboard,
Elementary still one group, the tie alert naming group + place, one card per group with empty departments
skipped, attention first, nav count, failed save changes nothing, Confirm all = ONE write of six places and
nothing for 4th, changed-since-confirmed + Re-confirm, Clear → Pending, a tie decided in deliberation turns
the alert off and shows "Decided by hand", print + CSV with names, public page split per category and
following the decided tie, no names in public, results CSV groups, read-only after finalize).
**Mutation-tested**: grouping ignored → 7 fail (then the run times out); confirmed awards ignored → 2 fail.
Browser 497 → 525 across 24 files; lint 28/5; build clean.

**2026-10-21 — The PreK & SPED Recognition Rubric; ribbons; shared places** (no migration; rule 78).
The organiser sent the final PreK & SPED sheet: 4 criteria 1–5 = 20, every child a ribbon (17–20 Gold Star ·
13–16 Silver Star · 4–12 Bright Star Scientist), 1st/2nd/3rd to the three highest totals, **ties share the
place**. Decisions: places per department (PreK, 2 projects, gets a 1st and a 2nd), PreK + SPED are now
ranked publicly, and the minimum to place goes back to **0% for everyone**.
- New preset `prek-sped-2627` (Data Model → Rubric presets). Each criterion's `desc` carries the sheet's
  5 / 3–4 / 1–2 descriptors; `settings.guide` the "adult help never lowers a score" line and the tips.
- `placesOf()` replaces `placeWinners()`: one Map of medals used by the public podium + ranked table, the
  Overview leaderboard (which now shows 🥇🥈🥉 for every scored department) and the results CSV. On a
  `ties: "share"` rubric places go by distinct averages; `hasTie()` skips it.
- Ribbons on the leaderboard, the public results ("Every child earns a ribbon" badge per department) and
  the results CSV, which gained **Place** and **Ribbon** columns.
- Help: new section "PreK & SPED: ribbons and shared places"; the 2026-27 forms / presets / min-place
  answers updated for 0%. Guides updated.
Tests: new `scripts/e2e/prek-sped.e2e.mjs` (16: comment-only → the form in Setup, 4 × 1–5 = 20, the
judge's guidance and descriptors, stored ratings, a PreK tie opening NO deliberation, 18/18/16.5/15/12 →
🥇🥇🥈🥉— on the leaderboard / podium / ranked table, ribbons incl. 16.5 = Silver, a default-rubric tie
still one 🥇 + one 🥈 with the alert, public page, CSV Place/Ribbon). **Mutation-tested**: shared ties off
→ 5 fail; ribbons off → 3 fail. Browser 481 → 497 across 23 files; lint 28/5; build clean.

**2026-10-21 — The judge grid under a schedule says so** (no migration). The organiser asked why the grid still read
"Every judge scores all" and could not be edited. The lock is rule 77 (by design); the greyed select showed the
department's stored setting, which does NOT apply under a schedule. Each department column now reads
**📅 Set by the schedule** instead, the locked ticks carry a tooltip, and Help has "Why is the judge grid greyed out?".
schedule.e2e +1 check (and the removal check now asserts the setting comes back).

**2026-10-21 — Fix: the judge grid showed 6 hours per judge under the schedule** (no migration).
Reported by the organiser right after importing the real schedule: every judge read ~58–61 projects /
~6 h in Setup → Judges, while each really has 12 visits (Judge 15: 11) — verified live: 179 visits, 12
per judge. Display only: `rosterLoad()` still counted "every project of every ticked department", and
the schedule ticks each judge into every department they visit at least once (Judge 1: PreK + K-5 +
6-8 + 9-12 = 60). The judges' real lists always came from the schedule. Now `rosterLoad()` returns
`scheduleFor(n).length` while a schedule exists (rule 77). schedule.e2e +1 check (Judge 1: 3 visits
across two departments holding 4 projects → "3" / "18 min"), **mutation-tested** (fix removed → it reads
4). My Phase 2 tests had checked the lists and the lock, not these two columns.

**2026-10-21 — Phase 2: the judging schedule** (migration `2026-10p`, **not** coupled; rule 77).
The organiser's timed schedule (15 judges × 12 rounds of 7 min, 8:30–10:15, two breaks, a wrap-up;
3 visits per scored project, 1 per PreK / SPED) could not be expressed: the app only knew "every judge
scores the department" or app-chosen panels, with no rounds or times.
- **Import** (Setup → 📅 Judging schedule): the organiser's own Excel grid saved as CSV —
  `parseScheduleCsv()` finds the "Judge" header row, reads `R1 8:30–8:37` / `BREAK …` / `WRAP-UP …`
  columns (line breaks inside cells, any dash), ignores title rows, the legend and "COMMON BREAK" filler;
  "—" = free. **Review before saving**: unknown code / a judge twice on a project / a number above
  Maximum judges BLOCK; a project nobody visits and two judges at one booth in one round WARN; visits per
  project are summarised. Save → `set_judge_schedule()`.
- **Server** (`judge_schedule` + `_judge_projects()` redefined): each judge's list = their visits in
  round order; the judge grid is derived from it (sign-in still shows the departments); a re-import may
  not drop an already-scored visit. `clear_judge_schedule()` hands lists back to the grid.
- **Judge's tablet**: the morning in order (R#, time, code, booth, title; breaks; "free"), a **NEXT**
  card that advances after each submit. Unscheduled assignments are never hidden ("Other projects").
- **Admin**: grid + "judges per project" read-only, Suggested setup hidden, Rebalance replaced on the
  Judges tab by "not signed in yet: Judge 4, 9 · use a stand-in with that number"; Alerts lists projects
  not in the schedule; **booth numbers** imported from the booth template into `projects.room` (locked
  projects skipped); **printouts**: judge sheets (one page each, tick boxes) and booth visit times — no
  names, no scores.
- **Verified against the real file**: the organiser's `Judges Schedule.csv` imported through the UI
  against a copy of the 63 live projects (public fields only): 15 judges, 12 rounds, 179 visits,
  58 × 3 + 5 × 1, every code matched, no booth double-booked.
Also: the two CSV readers had a literal U+FEFF inside a regex (`no-irregular-whitespace`) — parseCsv()
already strips the BOM, so the duplicate strip was removed.
Tests: DB 252 → 271 (19: RLS/RPC-only writes, every refusal — other school's project, two projects in a
round, a project twice, above the maximum, a refused save writes nothing — slots stored, grid derived,
sign-in gets the list IN ROUND ORDER across departments, a number with no visits is not on the list,
dropping a scored visit refused, a re-import re-syncs a signed-in judge's order, project delete cascades,
anon can read, clear restores the grid's lists, and re-running 10k then 10p restores the schedule body).
New `scripts/e2e/schedule.e2e.mjs` (17). **Mutation-tested**: the judge screen ignoring the schedule → 2
fail; unknown codes not blocking → 1; the grid not locked → 1. Lint 28/5, build clean.

**2026-10-21 — The 2026-27 evaluation forms; drafts; safety concerns** (migration `2026-10o`, **not**
coupled). Phase 1 of the plan for the fair on **2026-12-11** (Phase 2 = the judging schedule, Phase 3 =
per-category awards — see the roadmap). The organiser supplied the final forms:
1. **Two presets** (Data Model → Rubric presets): `isef-ms-hs-2627` (20 items 1–5, five sections =
   15/25/20/20/20 — which finally reconciles the old summary-vs-detailed disagreement) and
   `elementary-2627` (8 items 1–5 = 40, × 2.5 = 100 built into the steps, rule 74). Numbers only, by the
   committee's choice; each form's scale is shown above the items (`settings.guide`). Assigned per
   department from Setup's "Add from a preset" like the others.
2. **Elementary comments + safety question**: Strength / Next step boxes and "Safety / rule concern?
   No / Yes" → `scores.feedback` + `scores.safety_concern` (2026-10o). A Yes puts a red card at the top of
   **Alerts** (project, judge, comments; clears when re-submitted with No), an activity-log line and a
   `SAFETY_CONCERN_RAISED` IT entry (flag only). Shown in the deliberation breakdown, the judge-scores CSV
   (Strength / Next step / Safety concern, plus Ratings / Ratings out of for the × 2.5 form) and backups.
3. **Drafts** (rule 75): every tap is kept on the device until submit — leaving the screen, a refresh or
   a restart lost a half-scored project before (with 7-minute rounds and 20 items that was a real risk).
   "✎ Draft — not submitted" in the list, a restore note, Discard draft.
4. **The judge's home screen showed the 42-point "Scoring Guide"** (0 = not present … 3 or 6 =
   exceptional) to every judge on every rubric — removed; each form now shows its own scale.
5. **The project code is emphasised** (list badge + large badge on the scoring card) — judges find
   booths by code. The scoring header lost its "PROJECT " prefix (project-codes test updated).
6. **Rubric editor kept whole numbers only**: `parseSteps()` and Max Points used `parseInt`, so opening
   and saving the elementary rubric turned 7.5 into 7 and fired the "this changes N scores" warning.
   Now `parseFloat`, halves allowed.
7. `upsertScore()` (rule 76) — the only score write; retries without the 2026-10o columns on
   `MISSING_COL`, folding them into notes, so an unmigrated database never strands elementary scores.
Also: CLAUDE.md said `scores` has a `total` column — it never had; corrected.
Tests: DB 247 → 252 (feedback + safety through the existing judge policies, 7.5-point steps stored exactly,
re-submit with No clears it, a made-up judge still refused, feedback must be an object, every older score
reads the defaults). New `scripts/e2e/rubrics-2627.e2e.mjs` (27: presets via Setup, both forms total 100,
section weights, no `abstract` id, the 42-pt guide gone, the code badge, buttons 1–5 with points, "4 / 5",
draft survives Back AND a reload, the × 2.5 working, stored values/feedback/safety, draft cleared, activity
+ IT log without comment text, Discard draft, 20 items in 5 sections, numbers only, 60/100 at all-3s, a
middle/high score keeps its old shape, the Alerts card, the deliberation breakdown, the CSV, the unmigrated
fallback, the editor keeping halves). **Mutation-tested**: drafts off → 3 fail; fallback off → 2 fail;
`parseInt` back → 1 fails (the first version of that check did NOT catch it — it auto-confirmed the
impact warning; rewritten so an untouched rubric must save with no warning). rubric-presets-setup now adds
the two new presets before asserting the library is complete. Lint 28/5 (see rule 37), build clean.

**2026-10-21 — "Nothing happens when I press Edit" on a project** (no migration).
Reported by the organiser while applying entry-sheet corrections to project #046 of 63. The
Add/Edit form renders at the **top** of the Projects tab, so pressing Edit on a project far down
the list opened it **6,184 px above the viewport** (measured) — the button looked dead. Nothing was
broken: the form was open, just off screen.
- `projFormRef` + an effect on `[showAddProject, editingProject]` → `scrollIntoView({ block: "center" })`
  so Save Changes is visible too. `.adm-main` is its own scroll container; scrollIntoView handles it.
- The heading now names the project — **"Edit Project #046 — Local Cactus BioScaffold"**. "Edit
  Project" alone is ambiguous on a 63-project list once the card has scrolled away.
- Chose scrolling over turning the form into a modal: the list below has to stay readable for
  checking numbers, and one form serves both Add and Edit.
⚠️ **The Design System section listed `.proj-form-overlay` / `.proj-form-card`, which have never
existed in the CSS** — the form is the plain inline `.proj-form`. Corrected above.
Tests: new `scripts/e2e/proj-edit.e2e.mjs` (6 checks on a deliberately 40-project fixture — the bug
cannot appear on a short list: the form comes on screen, the heading names the project, it carries
THAT project's values, the edit still saves and touches only that row, Add Project is on screen and
not labelled as an edit). **Mutation-tested** — with the scroll removed the first check fails with
`top -6184`. Browser 429 → 435 across 20 files; lint 26/5; build clean.

**2026-10-21 — Suggested judge setup + per-judge time in the grid** (no migration, rule 73).
Reading the live roster showed why this was needed: with every department on "every judge scores
all", Judge12 was carrying **58 projects (~5.8 h)** and Judge10 **19** — and turning on panels alone
only narrowed it to 21 vs 8, because `judges_per_project` balances inside a department and is blind
across them. Six judges were also ticked into both the 20-item and the 5-section rubric.
- **Setup → Judges → 💡 Suggested setup**: enter judges coming + scores per project; it prints the
  split per department, projects per judge, time per judge and the totals, with an explanation of
  why. **Apply to the grid** ticks the boxes and saves nothing — the admin reviews, then Save judges.
  Refuses rather than fudges when there are fewer judges than `panel × scored departments`.
- **Grid gained an "About" column** — each judge's rough hours beside their project count.
- On the real fixture (15 judges, 3 scores) it reproduces the hand-made plan exactly: K-5 3 · 6-8 7 ·
  9-12 5, everyone on 11–13 projects (~1¼ h), 189 reviews instead of 524.
- **No Gemini call** — see rule 73 for why, and for the two allocation rules it encodes.
**Caught while doing it:** adding the About column broke `judge-panels` and `shared-judges`, which
read that row with `td.last()`. The cells now carry `.roster-load` / `.roster-time` and all three
suites read them by class — never by column position again.
Tests: new `scripts/e2e/judge-suggest.e2e.mjs` (15 checks: the split for 15 judges, K-5 needing no
panel, the summary's range and time, comment-only departments riding along, the explanation naming
the reason, the shortfall refusal, Apply not saving, Save storing exactly the suggestion, every
scored department reaching the panel size, all numbers used, the grid's load+time). **Mutation-tested:**
disabling the busiest-first levelling fails 6 of the 15. Honest gap: the "Apply writes nothing" check
is a real assertion but no mutation makes it fail — calling `saveRoster()` inside `applySuggestion()`
reads `rosterView()` before React flushes, so it saves the old roster; the "grid is dirty" check is
what catches a premature save. Browser 414 → 429 across 19 files; DB 247; lint 26/5; build clean.

**2026-10-20 — Minimum score to place** (no migration — `app_settings` is key/value).
The organiser asked whether a project scoring below 50 could be kept off 3rd place. It could not:
`rankedProjects()` sorted by average with no floor and the podium was `scored.slice(0, 3)`, so the
lowest score in a department took bronze whatever it was. On the 100-point rubric the floor is 20
(no zero step), so that is not a theoretical case.
- New Setup card **Minimum score to place** → `app_settings.min_place_pct` (0–99, **0 = off**, which
  is exactly the old behaviour). Stored as a percent of `projectMax(proj)`, never points (rule 72);
  the card prints what it works out to for each rubric in use ("60% (60 of 100)").
- Below the minimum: no podium slot, no medal in the ranked table — **the project is still listed**
  with its real average and review count, and the medals pass to the next qualifying projects rather
  than being left empty. Exactly on the line places (`>=`).
- `hasTie()` now ignores ties that cannot decide a medal, so the amber alert switches off properly.
- Admin leaderboard marks "no place"; the judge's validation list marks "below N%" so a judge does
  not report the missing medal as a bug; Validation **warns but never blocks** a place award.
- Deliberately NOT a database constraint: scores stay exactly as judged, and the rule can be turned
  off mid-event with no data change.
Tests: new `scripts/e2e/min-place.e2e.mjs` (16 checks: off by default, the Setup card saves and
explains itself, the medal moves to the next qualifier, exactly-on-the-line places, the project stays
listed with its score, the leaderboard marker, the deliberation warning naming score and threshold,
the warning not blocking Save, no warning for a qualifying project, and 0 restoring every medal).
**Mutation-tested** — 4 of the 16 fail with `placesEligible()` forced true. Browser 393 → 409 across
18 files; DB suite unchanged at 247; lint unchanged (26/5); build clean.
**2026-10-21:** the fair settled on **60%**; the docs and `ADMIN_HELP` examples now use it (60 of 100 on
both 100-point rubrics = a straight "Good", and the exact midpoint of the achievable 20–100 range).
The suite gained 5 checks that raise the setting 50 → 60 and prove the LINE MOVES (Edge Ecology at 21.0
loses the silver it held at 50%) — 2 of them fail if the threshold is hardcoded to 50. 409 → 414.
⚠️ It is a per-school SETTING, not a constant: `min_place_pct` was still unset on the live project as of
2026-10-21, so the rule was OFF there until an admin typed 60 into Setup.
**Later on 2026-10-21 the organiser went back to 0% for everyone** ("the top three always place") when the
PreK & SPED form arrived; Help and both guides now say 0. The feature and its tests are unchanged.

**2026-10-08 — Guides + Help refreshed; event-day backup plan; live project corrections** (no migration).
1. **AdminInstructions.md / JudgeInstructions.md / `ADMIN_HELP`** were checked against the code and
   corrected where they still described the pre-10g/10k app: judges "selecting their department",
   per-department max judges, "Avg (out of 42)", Elementary/Middle/High as the departments, Lock
   Judging "on the Overview tab" (it is the sidebar), the "Deliberation" tab (the sidebar says
   **Validation**), the Judges-tab columns, "Submit & Next" / "Validate Results" (real labels:
   **Submit Score →** and the **📋 Validate Computed Results** section), and what Reset keeps.
2. **Event-day backup plan** (AdminInstructions "Event-day backup plan" + two new Data-safety FAQs):
   day before / halfway / after Lock / after Finalize. Key point now stated plainly: **💾 Save Score
   Backup is stored in the same database** — only the downloaded CSVs survive losing it, and scores
   cannot be imported back (the CSV is the record for awarding by hand).
3. **Live data, Dishchii'bikoh:** the organiser's revised entry sheet changed 8 of the 63 projects
   (name spellings, two titles, two descriptions, one category, one teacher, one student moved
   #050 → #053, one removed from #058). Applied with a one-off SQL-editor script (all-or-nothing,
   matched on number + old title, refused locked projects, one activity-log row) — **kept outside
   the repo** (student names). Tested on PGlite with the real migrations first, then verified live
   with anonymous reads: all 63 projects match the sheet, no department changed. Why not the CSV
   import: it only ever CREATES (duplicates matched by title), so it would have added 5 junk
   projects from the sheet's department heading rows and duplicated the two retitled projects.
`ADMIN_HELP_UPDATED` → 2026-10-08. Lint unchanged (26/5), build clean.

**2026-10-07 — Judging scenario tests; three fixes** (no migration). A new browser test,
`scripts/e2e/judging.e2e.mjs` (36 checks), covers what the lifecycle test does not: two judges →
averages and per-department ranking, a double-tapped Submit Score (one save, one log row), a concern,
a tie → deliberation → judge notes (incl. a failed save) → admin awards → finalize → award badges on
the public page with no names / notes, a scored project re-graded below 5 (36.0, never 42/36), device
transfer (refused without approval, wrong PIN, one-time allowance, same judge row), sessions isolated
per school, removed / reset judges' devices. It found three bugs:
1. **After Reset All Data, every judge's device stayed signed in** as a judge that no longer existed.
   The session check read "zero judges" as "server unreachable" and kept the session, so new scores
   would be refused and pile up in the offline queue (which also blocks Sign Out). Now only a FAILED
   judges read keeps the session (`judgesLoadedRef`).
2. **Allow Transfer showed "Approved (active)" after a failed save** (rule 55) and logged the approval;
   the judge was then refused on the new device. `saveTransferAllowances()` returns the error;
   `confirmTransfer()` keeps the PIN box open with "NOT approved" and logs `JUDGE_TRANSFER_SAVE_FAILED`.
3. **Results could be finalized over a judge's concern** while the screen said judges "must approve".
   A concern now blocks Finalize (button + handler); a judge who has not validated does not. New
   **Clear concern** button for the admin so a concern from a judge who has left can never lock the
   event. Screen text, Help and both guides updated.
The e2e mock's `register_judge` now mirrors the server's transfer rule (an existing alias needs an
unexpired allowance, which is consumed). `scan.e2e`'s project_private check now waits (it failed on a
cold dev server). The three bug checks fail against the previous code. Lint unchanged (26/5).

**2026-10-07 — Alerts becomes an event-health board; IT logs explain themselves** (no migration).
Checked against the live it_logs: 22 of the 30 newest WARN/ERROR rows were REALTIME_DOWN from phones
locking their screens. Fixed on screen and in the log:
1. **Fake status:** System Status always said "Database ● Operational". Now the real state of this
   screen's live connection (`realtime` state from the channel callback) and internet.
2. **Fake clear:** "Clear All IT Logs" emptied only the screen (a refresh brought them back) yet logged
   LOGS_CLEARED. Removed — the log is permanent; the tab says so and how many it loaded (newest 1,000).
3. **No build:** reports said "App Version: 1.0.0". `vite.config.js` now defines `__APP_BUILD__`
   (commit·build time); every entry's `payload.ctx` carries build, session (per page load), role,
   judge, online, installed-app.
4. **Noise:** REALTIME_DOWN only after 30 s down while visible, once per outage, with `downForSec`; a
   socket that never connects counts too. Also fixed: under Strict Mode (dev) the first mount's
   `resolveSchool().then()` opened a channel after cleanup, which was never closed.
5. **Silent loads:** every loader now reports errors through `noteLoadError()` → LOAD_FAILED (table +
   code, once per page load). Not for offline, unrun migrations, or admin-only tables refusing visitors.
   `loadShare()` no longer treats a failed read as "no link".
6. **Offline entries were lost:** a log write that fails goes to `sf_it_outbox` and is sent later
   with its original time — so SCORE_QUEUED from an offline tablet now reaches the admin.
Event-health board: connection, errors in the last hour (→ IT Logs), scores stuck on a device (from
`queueLength`, now on SCORE_QUEUED / SCORE_SUBMITTED / OFFLINE_SYNC_FAILED / OFFLINE_QUEUE_FLUSHED),
coverage (no department / no judge signed in / short panels), progress per department, idle judges
(20 min), outliers per project with every judge's total and a two-judge note. IT Logs: time window
(1 h / 2 h / 24 h / all) applied to the view and the copied report; report header has school URL,
build, session, live-connection state; share token hidden in report and snapshot.
`rubricMax()` removed (unused). `MISSING_COL` / `MISSING_TABLE` moved to module level.
Tests: new `scripts/e2e/alerts.e2e.mjs` (19: every board section, IT Logs build / no clear / window /
report / ctx, LOAD_FAILED once and never for admin-only tables as a visitor, a join-refusing realtime
server is not logged for 15 s and is logged once after 30 s, one entry per outage per device);
lifecycle +1 (offline SCORE_QUEUED arrives via the outbox, `ctx.delayed`). The mock gained
`store.failReads`. Grace and outbox mutation-tested. Lint unchanged (26/5).

**2026-10-07 — Queued scores survive a refresh; project numbers unique per school** (migration
`2026-10n`, **not** coupled). Two Known-gaps items from the second review:
1. **A refresh hid a judge's unsynced scores.** `loadScores()` replaced state with the server's rows,
   so with a score still in `sf_offline_queue` the judge saw "2/3 scored" and an empty form — and
   would score it again. It now overlays `queuedScoresFor(schoolId)`; the queued value wins because
   it is what the next flush will write. Also: a submit that SUCCEEDS now removes any older queued
   copy of the same score (it was left behind, so it would have been shown over the newer score
   after a refresh, and a later flush could upload it over the newer value).
2. **Two admins adding a project at once got the same number.** New guarded UNIQUE index
   `projects_school_num_uniq` on `(school_id, num)`. `createProject()` treats a clash on a number it
   picked itself (blank, or the form's pre-fill left alone — `projAutoNumRef` / `data.numAuto`) by
   re-reading the numbers from the server and retrying once (`PROJECT_NUM_TAKEN` WARN); a typed number,
   an edit onto a taken number, or a second clash shows "Project number N is already used by another
   project". `submit_registration()` was already MAX + 1 under a per-school lock, so it is unaffected.
Tests: DB 241 → 247 (refused insert and edit, other school / "1" vs "001" allowed, registration still
gets the next number, existing duplicate → migration warns and skips, renumber → re-run creates it; the
10m fixture moved off number 001, which a registration in that school already held). Browser: lifecycle
+3 (refresh keeps the queued score counted and its values; a successful re-score retires the stale
copy), import +3 (another admin took the pre-filled number → next free one; typed taken number refused;
edit onto a taken number refused). The mock now enforces the index. All new browser checks
**mutation-tested** (they fail with the fix disabled). Lint unchanged (26/5).

**2026-10-06 — Five pre-event fixes from the second review** (no migration).
All five are app-only, so rollback is a redeploy.
1. **`executeReset()` claimed success after failed deletes.** Twelve requests went out in one
   `Promise.all` with every result discarded, and the modal said "All data has been cleared" either
   way — an organiser could believe the old judges and scores were gone while they were still live.
   It now counts the failures, keeps the modal open with "NOTHING is guaranteed cleared", reloads the
   real state and logs `FULL_RESET_FAILED`. Deletes are idempotent, so pressing it again is safe.
2. **Two taps on Add Project made two projects with the same number** (no in-flight guard, and
   `nextProjectNum()` reads the browser's list). Both Add Project and Save Changes now take a
   synchronous ref guard and the button disables itself and reads "Saving…". A failed add also shows
   its error instead of returning in silence. ⚠️ Two admins racing can still collide — see Known gaps.
3. **A scored project's grade could be changed into an impossible total.** `projectMax()` drops
   `abstract` below grade 5 but `getTotal()` still counted the stored value, so a grade-6 project
   re-graded to 4 showed 42.0 / 36 and ranked on a number it could not reach. `getTotal()` now applies
   the SAME exemption — one definition of "does this criterion apply", used by both. Chosen over a
   database guard on purpose: it makes the data self-consistent instead of blocking a legitimate
   correction, and the scoring form never collects `abstract` below grade 5 anyway.
4. **A transient `sync_judge_projects()` failure destroyed panels** (rule 68). Any error dropped into
   the browser fallback, which gives every judge every project in the department. It now falls back
   only on `MISSING_FN()` (a database still on pre-10k) and otherwise stops, leaves panels alone and
   says so.
5. **Two taps on Submit Score** sent two upserts and wrote two `SCORE_SUBMITTED` entries. Guarded; the
   button reads "Saving…". The score row was always correct (unique judge+project).
Tests: browser 328 → 332 — a failed reset must not claim success, and two rapid Add Project clicks must
create exactly one project with one number. Both **mutation-tested**: they fail against the pre-fix
code. DB suite unchanged at 241, lint unchanged (26/5), `npm run build` clean.

**2026-10-06 — Review fixes: invite lockout, reg numbers, project moves, two UI truth bugs**
(migration `2026-10m`, **coupled** for part 1). An external review of the whole app produced 13
findings; all 13 were real. Four were already documented here as accepted or parked risks (judge
identity, anon-readable results, the unauthenticated email endpoint, its hardcoded school year).
These five were fixed:
1. **The invite-code lockout had never worked** (rule 66). `register_judge()` wrote the failure
   counter and then raised, and the raise rolled the counter back — `security_attempts` stayed
   empty across any number of wrong codes, while CLAUDE.md and JudgeInstructions.md both promised
   "5 wrong attempts lock sign-in for 5 minutes". It now returns the rejection instead.
2. **Registration numbers were reused after a deletion** — `COUNT(*) + 1` meant deleting submission
   001 handed `JHS-LS-002` to two students. Now `MAX + 1`, plus a UNIQUE index on
   `(school_id, reg_number)` that **v1 had and the v2 rewrite dropped**. The index is created only
   when no duplicates exist, so the migration can never abort on live data.
   ⚠️ **This is a partial fix and the comment in the SQL overstates it.** `MAX()` sees surviving rows,
   not numbers ever issued, so deleting the *highest* submission still frees its number for the next
   student (verified 2026-10-06). No duplicate row can exist any more — the index sees to that — but a
   receipt already printed can come to mean a different student. The real fix is a persistent
   per-school counter that never decreases.
3. **A scored project could be moved to a department judged differently** (rule 67) — nothing
   guarded it in the app or the database; `departments_guard_judging` only covers the departments
   table. Its scores would then be totalled against another rubric, or hidden in a comments-only
   department.
4. **Project edits reported success after a failed save** — `updateProject()` discarded the results
   of BOTH writes, logged `PROJECT_UPDATED` and closed the editor (rule 55; `createProject()` had
   always checked). It now shows "Not saved — …", keeps the draft, reloads the real rows and logs
   `PROJECT_UPDATE_FAILED` with which half was written.
5. **Realtime score events erased commendations** — the handler rebuilt the entry inline and left
   `commendation` out, so a comment-only review vanished from the Participants table and the
   reopened form until reload. It now uses `scoresToMap([row])`, the same mapper as the loader.
Also: removed a duplicate `fontSize` key in the rubric editor (the second always won).
**Not fixed, by decision:** per-judge identity and anon-readable `scores` / `final_decisions` need
one design change together (see Open risks); the offline-queue races and the unpaginated reads are
recorded under Known gaps; the email endpoint stays parked.
Tests: DB 241 checks (13 new, including that the lockout now locks, that a correct code is refused
while locked, that an unscored project still moves, that a same-rubric move still works, and that
deleting the scores unblocks it). The two existing "wrong invite code" DB checks and the judge-reg
E2E assertion were rewritten for the returned-error contract; the E2E mock mirrors it. Browser
suite 325 → 328: a new `import.e2e.mjs` check proves a rejected project edit shows "Not saved",
keeps the draft and writes nothing (mutation-tested — it fails with the fix disabled). Lint
baseline unchanged (26 purity / 5 immutability); `npm run build` clean.

**2026-10-06 — Per-school branding: logo + fair poster** (migration `2026-10l`, **not** coupled).
Every school's pages showed Dishchii'bikoh's wildcat (`public/logo.png`, 5000 px / 5 MB) and the text
"Dishchiibikoh Community School": landing page, registration form (3 states + email placeholders), public
project list footer, project-list printout, the confirmation email, and the favicon / PWA / iOS icon.
- **Setup → School branding**: upload / preview / replace / remove a logo and an optional poster (with a
  required description). Images are shrunk + re-encoded in the browser (logo 512 px, poster 1600 px; WebP,
  PNG/JPEG fallback), uploaded to Supabase Storage under `<school id>/`, then `set_school_branding()`.
- Shown on: landing (poster **below** the role cards), registration (3 states), public results, public
  project list, project-list printout, deliberation report header (name), confirmation email (server looks
  the school up itself). Never on judge screens. No logo → initials monogram.
- The wildcat is kept **for Dishchii'bikoh only** (`public/branding/dishchiibikoh-logo.png`, 512 px / 116 KB),
  via a `builtin:` path seeded for the school whose id AND slug match. Platform icons are a new Qritiko mark
  (`public/icons/`, `favicon.svg` — it was still Vite's default lightning bolt). Precache 5.9 MB → 0.95 MB.
- Homepage nav says **Qritiko**; page title is the school's name on its pages.
- **Also fixed:** the confirmation email inserted student-typed fields into HTML unescaped.
- **School year is per school** (Setup → School year, `app_settings.school_year`, no migration): replaces the
  hardcoded "SY 2025-2026" on the registration form (heading + success message), the dashboard subtitle and
  the public-results default title / footer / landing card. Empty = automatic from the calendar (August starts
  a new year). Existing share links keep the title stored with them.
Tests: DB 228 (33 new: RLS, RPC path rules incl. another school's folder / builtin / kind mismatch / never
uploaded, storage policies incl. `../`, `.svg`, nested paths, listing; seed needs id+slug; removal permanent;
cascade); new `scripts/registration-email.test.mjs` (9); new `scripts/e2e/branding.e2e.mjs` (60: isolation,
upload/replace/remove, failed upload + failed save leave no orphan, refused files, poster description, every
public page, printout, judges never see the poster, 6 viewports × 3 pages with overflow / aspect-ratio /
overlap checks, school year: automatic default, refused input, failed save, SY prefix stripped, registration
form, back to automatic). Mock gained Storage (multipart upload, public GET, remove).

**2026-10-06 — Judge roster grid + "N judges per project" panels** (migration `2026-10k`, **coupled**).
Ranges could not express every sharing pattern (A+B share #1, B+C #2, A+C #3) and every judge scored every
project — 6-8 (31 projects) meant ~3 h per judge. Now:
- **Setup → Judges grid**: tick departments per judge number (any pattern), optional admin-only names,
  per-row workload, warnings for departments with no / too few judges. Replaces the counts and the
  From–To sharing editors (and `app_settings.judge_sharing`, now unused).
- **Judges per project** per department (`set_judges_per_project`): balanced least-loaded assignment
  stored in `project_judges`; judges see only their assignments; **Judges tab → Panels** card shows
  coverage / no-shows and **Rebalance** (moves unscored work from judges who never signed in).
- Server owns judges' lists (`_resync_judges`); the browser sync is a pre-10k fallback.
Bugs caught by the new tests before shipping: (1) PL/pgSQL loop variable `r` shadowed a table alias `r`
("record r has no field judge_number"); (2) `schoolNumbering()` turned on when the roster TABLE merely
existed, hiding the department picker for schools without numbers; (3) after a Rebalance, a late project's
automatic fill topped up every short project — handing work back to absent judges (fill is now
new-projects-only); (4) CSV import re-synced judges once per project (63 round-trips) — now once per batch;
(5) a helper named `useRoster()` was treated as a React hook.
Tests: DB 195 (30 new); new `scripts/e2e/judge-panels.e2e.mjs` 11; judge-numbers / shared-judges E2E
rewritten for the grid (25 / 13); real 63-project import re-verified (21 s, 6-8 panels all 3 judges).
**Run on the live project 2026-10-06** and verified with anonymous requests: roster backfilled from the
ranges (25 rows), `judge_labels` denied to anon, roster INSERT refused by RLS, the four admin RPCs answer
"Not authorised", `_fill_panels` not executable.

**2026-10-06 — Judge numbers could never be saved on Supabase (pg-safeupdate)** (re-run 2026-10i).
`set_judge_numbers()` cleared its temp tables with `DELETE FROM _jn;` / `_jj;`. Supabase API sessions load
**pg-safeupdate**, which rejects any DELETE/UPDATE without WHERE — so every save failed in production with
"DELETE requires a WHERE clause". PGlite does not load the extension, so the DB suite passed. Fixed in
10g/10h/10i (drop + recreate `pg_temp._jn` instead) and guarded: the DB suite now scans every migration
statement and fails on any DELETE/UPDATE without a WHERE clause. **Rule: never write a bare DELETE/UPDATE
in SQL that runs through the API — not even on a temp table.**

**2026-10-06 — Rubric presets in the Setup department dropdown (UX fix)** (no migration).
The dropdown listed only the school's rubric LIBRARY, so a fresh school saw one rubric and the organiser
concluded the 100-point presets had been removed (they were reachable only via Rubric tab → New rubric).
It now has three groups — Your rubrics · **Add from a preset** (presets not yet in the library, matched
by `sameCriteria()` so a renamed copy still counts) · Not scored. Picking a preset inserts it into
`rubrics` and assigns it in one step (`updateDeptJudging("preset:<id>")`); the scored-department lock is
checked BEFORE the insert so a refusal never leaves a stray rubric; a name clash gets " (2)".
Tests: new `scripts/e2e/rubric-presets-setup.e2e.mjs` 9 checks. 256 browser checks total.

**2026-10-06 — PreK grades kept; scoring header shows the department** (no migration).
Found while preparing the real 63-project import: `normGrade("PreK")` returned `""` (only digits and "K"
were understood), so every PreK project/student lost its grade. Now "PreK"/"Pre-K" → `PreK`, and
`highestGrade()` orders PreK < K < 1…12. The judge's scoring header showed the legacy `getDivision()`
band (grade 4 → "3-4", PreK → "K-2"), contradicting the real department — it now shows the department
name; `getDivision()` is removed. Import E2E +1 check (PreK project + per-student grades).
**The real project list** (63 projects, 151 students) was converted from the organiser's PDF into an
import CSV kept OUTSIDE the repo (student names; the repo is public) and verified through the real
import UI on the mock before handing over.

**2026-10-06 — Department preset "PreK · K-5 · 6-8 · 9-12 · SPED"** (no migration).
Fifth entry in `DEPT_PRESETS` (`bands-k5-sped`), appended so `DEPT_PRESETS[0]` still seeds new schools.
Codes PK · K5 · G68 · G912 · SPED; the shared names keep the other presets' codes, so on top of a
grade-band school it adds only K-5 (presets match by name and never delete). Label avoids the text
"Grade bands + SPED" (matched by name in tests). New departments follow the existing rules: judge numbers
only if they fit under `judge_max` (2026-10i), the default rubric until one is picked (2026-10j).
Tests: setup E2E +2 checks.

**2026-10-06 — Project codes ("PK-LS-001")** (no migration).
Every project has a code built from `app_settings.project_code_format` (default `{DEPT}-{CAT}-{NUM}`)
+ `departments.code` + `categories.code` + `projects.num` — **derived by `projectCode(p)`, never stored**,
so renaming a code or changing the format can never leave stale codes behind. Admin edits the format in
Setup → Project codes (`{DEPT} {CAT} {NUM} {GRADE}`; `validateCodeFormat()` requires `{NUM}`, known tokens,
safe characters); live preview, duplicate-code warning. A missing part collapses its separator
(`LS-007` for an unassigned project). Shown on the judge list, scoring header, admin lists, deliberation,
public results/projects, the project-list PDF, and a **Code** column in the projects, results and
judge-score CSVs (outside `IMPORT_COLS`, so the import contract is unchanged — verified by the import
round-trip test). `{YEAR}` was left out on purpose: `Date` during render is a purity finding (rule 37).
**Also fixed:** the results CSV gained an "Out of" header in 2026-10j without the row value, shifting
every later column by one.
Tests: new `scripts/e2e/project-codes.e2e.mjs` 11 checks. 244 browser checks total.

**2026-10-06 — Each department picks its rubric; rubric library** (migration `2026-10j`, not coupled).
Setup → each department's dropdown lists every rubric in the school's library plus **Comments only**;
judges get the rubric of each project's department. Rubric tab is a library: ＋ New rubric (blank /
preset / copy), rename, ★ make default (`set_default_rubric()`), delete (refused for the default or a
rubric in use). Third preset added: the **detailed 20-item form** (the Cibecue sheet's items rated
individually), with section headings in the scoring form.
- Every scoring path now takes the project: `getTotal(score, proj)`, `projectMax`, `draftTotal`,
  `allMoved`, `hasZeroScore`, the scoring form, the Projects-tab breakdown, public rubric chips.
  Exports: judge-scores and backup CSVs list every criterion of every rubric in use plus Rubric /
  Out of columns; backups store every rubric and the department→rubric map; projects/results CSVs
  got Out of (+ Rubric) instead of a single "of N" header.
- **"Judges still see the old rubric"** — two causes: (1) the live school had only ever saved the
  42-point rubric (nothing to sync to); (2) nothing listened for rubric changes, so an open judge
  screen kept the old one until reload — `rubrics` now has a realtime handler.
- **Bug found:** the "department already has scores" check parsed score keys at the last `_`, which
  never matches (rule 60) — so the comment-only switch (2026-10f) was never actually guarded on screen.
  Fixed, and now also enforced by a trigger.
- Latent race: first sign-in can run `ensureSeedData()` twice; before 10j both runs could insert a
  default rubric. The unique default index now rejects the second.
Tests: DB 164 (17 new: one default, own-school rubric only, scored-department lock incl. comment-only,
same-rubric re-save allowed, rename allowed, delete guards, default switching + its guard, anon can read
rubric_id, school delete still cascades); new `scripts/e2e/rubrics.e2e.mjs` 18 checks.

**2026-10-06 — Maximum judge number (default 15, up to 90)** (migration `2026-10i`, not coupled).
Numbers could run to 999 and the 10g backfill gave the live school Judge 1–90. Setup → Judge numbers
now has **Maximum judges** (default 15, ≤ 90), enforced by `set_judge_numbers()` and the new-department
trigger; `set_judge_max()` refuses to go below a number in use. Existing schools are backfilled to the
size they use, so nothing breaks. Also: the judge home shows **"👤 Judge15 · PreK"** — a device stays
signed in (by design), and a report of "Judge 25 was put in PreK" turned out to be a device still
signed in as Judge15 (reproduced; the server assigned 25 to K-2 correctly). Tests: DB 147 (12 new),
judge-numbers E2E 26.

**2026-10-06 — Departments can share judges (option)** (migration `2026-10h`, not coupled).
A small fair (15 judges, six departments) needs one judge to cover several departments. Setup →
Judge numbers now has two modes: **"Each department has its own judges"** (default — counts, no
overlap) and **"Departments can share judges"** (From–To per department, overlaps allowed;
`app_settings.judge_sharing`). A judge covers every department whose range holds their number.
- **Whole departments only, by design:** every project in a department is scored by the same panel,
  or averages stop being comparable. A per-judge checkbox grid was rejected for that reason.
- Server rules: a signed-in judge may gain departments, never lose one (they were told where to sit);
  every save re-syncs `department_ids`, `department_id` and `projects` for all signed-in judges.
- App: `judgeDeptIds()` everywhere a judge's department mattered — `syncJudgeAssignments()`
  (late projects now reach shared judges), Judges tab (listed under each department), department
  delete guard, Setup counts. Judge home groups projects by department; the validation list ranks
  per department (was one cross-department list); exports label each score with the PROJECT's
  department. Setup shows **Who judges what** with projects per judge.
- **Fixed while there:** (1) a signed-in judge's own project list never refreshed after load (the
  sync effect ran on `[loading]` only) — late projects needed a page refresh; it now follows the
  live judges list. (2) A reviewed comment-only project showed "✓ 0pts" — now "✓ Reviewed".
  (3) `syncJudgeAssignments()` ignored write errors — now logs `JUDGE_ASSIGNMENTS_SYNC_FAILED`.
- **Rule 37 caught a bailout:** `judgeCoverage()` first extended the last group in place
  (`last.to = n`) — purity/immutability dropped 26/5 → 0/0. Rewritten without mutation; found by
  removing suspects one at a time and re-counting (`scratchpad` bisect).
Tests: DB 135 checks (9 new: overlap, multi-department registration, gain/lose rules, refused save
changes nothing, shrink around unused numbers, shared removal, real pre-10h backfill); new
`scripts/e2e/shared-judges.e2e.mjs` 14 checks. Not covered: live (realtime) refresh of a judge's
open screen — the mock has no realtime; covered by reload.

**2026-10-06 — Projects CSV import (restore / copy to a new school).** No migration.
Projects → **⬆ Import projects (CSV)** reads the file ⬇ Download Projects CSV writes, so a backup can
finally be restored. Review table first (nothing saved until Import): duplicates (by title, against the
school and within the file) start unticked; unknown department names are mapped once via a dropdown;
unknown categories are kept as written; a taken number gets the next free one. Saves go through
`createProject(data, base)` one by one with the list threaded (rule 43) — names land in
`project_private`, judges are re-synced. Reads RFC 4180 (quotes, embedded newlines), `;` delimiters and
Windows-1252 as well as UTF-8, strips the `'` that `csvCell()` adds to formula-looking cells, and refuses
`.xlsx` with Save-As-CSV instructions (the npm SheetJS build is outdated and has known CVEs — do not add it).
Locked / Reviews / Avg Score are never imported. Logs `PROJECTS_IMPORTED` with counts only.
**The export columns are now an import contract** — renaming a heading in `exportProjectsCSV()` must keep
it matching `IMPORT_COLS`, and `membersText()`'s `Name (Gr N)` format must stay parseable by `parseMembersText()`.
Tests: new `scripts/e2e/import.e2e.mjs` — 15 checks: real download → import round trip into a school with a
renamed department (quotes, commas, newlines, `=` titles, accents, per-student grades), failure + retry,
re-import duplicates, Excel `;`/Windows-1252, `.xlsx` and header errors. 194 browser checks total.

**2026-10-06 — One judge list for the whole school (default)** (migration `2026-10g`, not coupled).
Judge numbers restarted in every department, so six departments × 15 = 90 open seats for ~15 judges,
"Judge1" named up to six people (the live school had two: PreK and K-2), and a judge who tapped the
wrong department could only be fixed with Reset All Data.
- Each department owns a range of numbers; the number decides the department. Judges type only the
  number and see their department confirmed before entering. Numbers are unique per school.
- Setup → **Judge numbers** card: counts per department → contiguous ranges → `set_judge_numbers()`,
  which refuses overlaps and refuses to strand a signed-in judge. A mode switch keeps the old
  per-department numbering available.
- Judges tab → **Remove** (Admin PIN) → `remove_judge()`: one judge + their scores/notes/validation,
  atomic. Logged as `JUDGE_REMOVED`; the dialog states how many scores will be deleted (rule 57).
- Overview "Judge sign-in details" lists the numbers per department.
- New departments get numbers from a DB trigger, so create_school / seed / + Add / presets needed no change.
Tests: DB suite 126 checks (22 new: numbering, backfill, re-run safety, lookup, duplicates incl.
"Judge03", off-list numbers, admin-only RPCs, overlap + stranding refusals, removal, legacy mode);
new `scripts/e2e/judge-numbers.e2e.mjs` — 19 browser checks. Lint baseline unchanged (26/5).

**2026-10-06 — IT log: no more false successes + new diagnostics.** No migration.
1. **Seven handlers logged success for saves that failed** and updated the screen first:
   judge/admin validation, final award, finalize, reopen, open/close deliberation, and the judge's
   deliberation note. They now save first, show a red "NOT saved" message on failure, change nothing
   on screen, and log `VALIDATION_SAVE_FAILED`, `ADMIN_VALIDATION_FAILED`, `DECISION_SAVE_FAILED`,
   `FINALIZE_FAILED`, `REOPEN_FAILED`, `DELIBERATION_OPEN_FAILED` / `_CLOSE_FAILED`, `DELIB_NOTE_FAILED` (rule 55).
   Reopen now also logs `RESULTS_REOPENED` (it logged nothing before).
2. **`OFFLINE_SYNC_FAILED`** — a score the server kept rejecting retried forever with no log; only
   successes were recorded. `SCORE_QUEUED` now says `reason: offline | server_error`.
3. **`REALTIME_DOWN` / `REALTIME_RECONNECTED`** from the channel's `.subscribe()` status callback.
4. **`CLIENT_ERROR`** — `window` `error` + `unhandledrejection` listeners; de-duped per message, ≤20 per session.
5. **`INIT_TIMEOUT` / `LOAD_FAILED`** in `init()`. Note: loaders that get an *error response* (rather
   than throwing) are still not logged individually.
Also: the invite code vanished from the admin UI once the first judge registered (the whole
"Get started" card was gated on `judges.length === 0`, and it is the only place the code is shown)
— the share box now always renders. And five PIN inputs used `.replace(/D/g,"")` (rule 51 again:
stripped the letter D, not non-digits) — now `/\D/g`.
`addItLog` takes an optional `sid` — the mount effect and listeners close over the first render,
where `currentSchool` is null, so their entries were never saved without it.
Tests: mock gains `store.failWrites = [table]`; lifecycle E2E +4 checks (sync rejected, validation
failure, finalize failure, CLIENT_ERROR). 159 browser checks total.

**2026-10-06 — Phase 2: comment-only departments** (migration `2026-10f`, **not** coupled).
PreK and K-2 are not scored at the 2026-27 fair. `departments.scoring_mode = 'feedback'` makes a
department comment-only: the judge gets a commendation picker (`COMMENDATIONS`, or their own
wording) and an optional comment instead of the rubric, no total is shown, and `scores.criteria`
is written as `{}` with the text in the new `scores.commendation` column.
- **Deliberately a department flag, not a zero-point rubric** — `rubricMax()` would be 0 and
  ranking, the progress percentage and consensus all divide by it.
- Excluded from everything numeric (rule 59): `rankedProjects()`, `hasTie()`, `getAnomalies()`.
  Without this every unscored project would rank last at 0 **and they would all "tie" at 0, so the
  deliberation alert would never switch off.**
- Admin Overview shows a **Participants** table (commendations, review count) instead of a
  leaderboard; public results list them under "Everyone is a winner" with no rank, no denominator
  and no medal.
- Switching the mode is **refused once that department has scores** — the old scores would stop
  counting but stay in the database.
- The migration also adds the Phase 3 columns (`locked`, `finalized_at`, `award_grouping`) so the
  organiser makes one trip to the SQL editor, not two. Nothing reads them yet.
Tests: DB suite 104 checks; new `scripts/e2e/feedback.e2e.mjs` — 17 browser checks covering the
Setup toggle, the judge form, free-text commendations, and that the department never appears in a
leaderboard, an outlier alert, a tie or a podium. 155 browser checks total.

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

---

## 📍 Live status / where we left off (2026-10-21)

Read this first when resuming on another machine.

**THE FAIR IS 2026-12-11.** Plan agreed 2026-10-21: Phase 1 (forms, drafts, safety — done), Phase 2
(**judging schedule** — done, see Change History; run **2026-10p** on the live project, then import the
organiser's `Judges Schedule.csv` + the booth numbers), Phase 3 = **awards by department (default) +
an optional per-department "award by category"** — **DONE 2026-10-21** (Awards tab, see Change History; still open from the
roadmap: per-department lock/finalize),
optional printed comment sheets for students (setting, off by default; no scores, no judge names).
Dry run late November; code freeze **2026-12-01**.

**Decisions 2026-10-21:** elementary results out of 100 (× 2.5, shown); numbers only on both forms;
the Life Science category was **renamed to "Life, Health & Behavior"** to match the MS/HS form
(**reversed later the same day** — it had been left alone because a rename strands the existing projects;
see "Category renamed" below for how it was actually done); one form per judge,
averaged. The organiser's schedule PDF was checked cell by cell against the live data: all 179 visits
are real codes, 3 per scored project / 1 per PreK & SPED, no judge twice on a project, no two judges at
one booth in a round, no student in two projects. A booth template (`booth-template-2026-27.csv`, titles
only) is on the work PC Desktop — booth numbers TBD (no map yet).

**Done on the live project 2026-10-21 (verified with anonymous reads):** 2026-10o and **2026-10p** run (judge_schedule
readable, anon writes refused by RLS, both schedule RPCs answer "Not authorised" to anon); K-5 = Elementary form,
6-8 + 9-12 = Middle & High School form, PreK + SPED comments only; minimum to place = 60.
**Superseded later the same day:** PreK + SPED move to the **PreK & SPED Recognition** form and the minimum to
place goes back to **0** — both are the organiser's Setup changes (see Still to do).

**Category renamed 2026-10-21, verified with anonymous reads:** `Life Science` → **`Life, Health & Behavior`**
(Setup rename, **code kept as `LS`**) **plus a one-off SQL `UPDATE` of the 16 projects that held the old text**
(007 009 012 013 035 041 042 043 044 045 046 049 052 054 055 057 — K-5 4 · 6-8 5 · 9-12 7). Verified after:
63 projects, **0 on stale category text, 0 blank**, all six categories match, and every project still renders
the **same `CAT` code** as before, so the schedule and booth printouts did not need reprinting. The rename
alone is NOT enough — the app does not cascade it (Known gaps); an admin-only `UPDATE` is required, and the
anon key cannot do it (it answers `200` with 0 rows — rule 54).

**Done 2026-10-21, verified with anonymous reads:** PreK + SPED → **PreK & SPED Recognition (2026-27)** (scoring_mode
`scored`, 4 × 1–5 = 20, ids/order/maxima identical to the preset, so ribbons + shared places apply); minimum to
place = **0**; `judge_max` = 15. No judges, no scores yet.

**Still to do before the dry run:** import the organiser's `Judges Schedule.csv` (Setup → 📅 Judging schedule) and
the booth numbers when the map exists; print the judge sheets; ~~Maximum judges 15~~ (done — `judge_max` = 15 verified 2026-10-21);
**#053 → Edit → Save** (a 2026-10-08 SQL fix left its grade blank — the app stores the derived grade
at save time, so the database really holds ''); #062 has no students (noted, organiser's call); judges
sign in at the briefing, not at 8:30 (5 wrong invite codes lock the whole school for 5 minutes); the
14-min wrap-up is tight (noted).

**Re-read live on 2026-10-08 (anonymous reads):**
- **Projects:** 63, matching the organiser's revised "Approved Entry Forms" sheet (8 corrections
  applied 2026-10-08, see Change History). **#062** (VEX robot) still has **no student names**.
- **Judge grid:** set to numbers **1–15** (34 roster rows — some judges cover several departments).
  `judge_max` was **90** → lowered to 15 on 2026-10-21 (verified, roster = numbers 1–15).
- **Branding:** logo and poster uploaded (real Storage paths, not `builtin:`) — the upload path works.
- **No judges signed in, no scores** — every judging setting can still be changed.
- **All five departments are `scored` and use the default rubric.** That rubric is named
  "Default (Northeast AZ Regional)" but holds the **detailed 20-item form** (sections 25/20/20/25/10),
  NOT the 15/25/20/20/20 Cibecue weights recorded below as confirmed. The organiser said on
  2026-10-08 the rubric "might change later — leave it for now". **Raise it again before judging
  day** (it locks once a department has scores); also whether PreK is comments-only.
- 6-8 still has `judges_per_project` unset (every 6-8 judge would score all 31).

The bullets below are the 2026-10-06 snapshot; the to-do items 1 and 3 are done (see above).

- **All SQL migrations through `2026-10m` have been run on the live project** (10m applied 2026-10-06,
  with the matching app build deployed in `4c72c8c`)
- **`2026-10n` (unique project numbers) was run on the live project 2026-10-07 and verified:**
  `projects_school_num_uniq` exists in `pg_indexes`, and the duplicate check
  (`SELECT school_id, num, count(*) FROM projects GROUP BY 1, 2 HAVING count(*) > 1`) returned no rows.
- Migrations through `2026-10l` (10k and 10l verified with
  anonymous probes: RLS refusals, bucket public, anon upload refused, anon cannot list).
- **Dishchii'bikoh live data:** 63 projects imported (PreK 2 · K-5 8 · 6-8 31 · 9-12 19 · SPED 3); the
  energy category is renamed "Energy, Sustainable Forms & Design" (ESD). Logo = `builtin:dishchiibikoh`.
- **Not done yet — the organiser's to-do:**
  1. **Setup → Judges grid:** still the backfilled ranges (PreK 1–5, K-5 6–10, 6-8 11–15, 9-12 16–20,
     SPED 21–25; `judge_max` = 90). Tick the real 15 judges, untick 16–25, Save, then lower Maximum judges
     to 15. **Do it before any judge signs in** (a signed-in judge can gain a department, never lose one).
  2. **6-8 → "3 judges per project"** (31 projects); then check Judges tab → Panels shows 3 per project.
  3. **First real branding upload** (poster or logo) by the admin — the only path not yet exercised against
     real Supabase Storage. If it fails, read the exact "NOT saved — …" text.
  4. School year: automatic shows SY 2026-2027; set it in Setup → School year only if that is wrong.
- **Parked:** registration email API (see "Future work" below). Untracked files `.codex/`, `AGENTS.md`,
  `ARCHITECTURE_SCALE_REVIEW.md`, `CLAUDE_ARCHITECTURE_REVIEW_PROMPT.md` exist only on the work PC and are
  deliberately not committed (the review files describe security weaknesses; the repo is public).
- **The real project CSV** (`qritiko-projects-2026-10-06.csv`, student names) is on the work PC Desktop only —
  never commit it.

## 🗺️ Agreed roadmap (2026-10-06)

The 2026-27 fair is being restructured: departments become **PreK · K-2 · 3-5 · 6-8 · 9-12 · SPED**,
PreK and K-2 stop being scored, the rubric becomes the 100-point Cibecue sheet, and awards are
given **per category within a department**. ~60 projects (6-8 has 20), 15–16 judges.

**Phase 1 — done** (2026-10-06): per-school categories, Setup tab, department CRUD + presets.

**Phase 2 — DONE** (2026-10-06, migration 2026-10f). `departments.scoring_mode` = `scored` | `feedback`. In `feedback`
mode a judge sees a comment box and a commendation instead of the rubric; the department is
excluded from ranking, ties, anomalies and the leaderboard, and everyone receives a participation
award. **It must be a department flag, not a zero-point rubric** — `rubricMax()` would be 0 and
ranking, progress % and consensus all divide by it.

**Phase 3 — awards + per-department completion.**
- `departments.award_grouping` = `category` | `department`, **per department** (6-8 has ~3 projects
  per category and can award by category; a department with 8 projects spread over 6 categories
  would be handing out uncontested 1st places).
- An awards screen that **confirms the computed ranking** instead of asking the admin to type it:
  groups collapsed by department → category, top 3 pre-filled, one "Confirm group" button, one
  "Confirm all clean groups", and groups needing attention floated up with a reason chip. ~70
  awards through the current per-project dropdown is not usable on event day. Writes must be a
  single batched upsert, not 70 sequential calls.
- Per-group tie detection (`hasTie()` is currently one global boolean that would never switch off
  once awards are grouped by category) with a tiebreak suggestion.
- **`departments.locked` + `departments.finalized_at`** — agreed 2026-10-06. Today `locked` and
  `results_finalized` are single school-wide `app_settings` keys, so **PreK winners cannot be
  announced while 9-12 is still deliberating**. Each department should finish, lock and publish on
  its own clock; the share link shows only finalized departments. Keep the existing school-wide
  buttons as "all departments" shortcuts. Consensus stays advisory and school-wide — just *display*
  it grouped by department.
- An **awards list export** (print/CSV, grouped by department and category). Certificates were
  explicitly not wanted.

**Phase 4 — judge auto-assignment.** Builds on the 2026-10g judge list (the number → department map
already exists; auto-assignment would hand out the next free number). `app_settings.judge_assignment` = `auto` | `choose`. Auto
assigns the judge a department **and** a number from the invite code alone. **Randomise departments,
never projects:** every project in a department must share one judge panel or the scores are not
comparable, and with 2–3 scores per project a harsh judge you happened to draw moves a winner more
than quality does. Balance on **projects per judge, not headcount** (6-8 has a third of all
projects), and guarantee coverage — pure random can leave a department with zero judges, which is
discovered on event day. Keep manual number entry for device-transfer recovery.

### Separate track — database redundancy (agreed 2026-10-06, after the fair work)

**There is currently no way to restore this database.** Supabase's free tier has no point-in-time
recovery, the migrations are additive but not reversible, and the only real backups are what an
admin manually presses: `score_backups` snapshots and the CSV exports. Code rollback is easy
(Vercel Instant Rollback); data rollback does not exist.

Worth noting what segmentation does and does not buy: splitting the workflow per department helps
**event-day flexibility**, not fault tolerance. If Supabase is down or paused, every department
goes down together. The actual resilience in the app is the **offline queue** — judges keep scoring
through a network failure and sync afterwards.

**Interim (2026-10-08):** the manual event-day plan is documented for admins (AdminInstructions →
"Event-day backup plan", Help → Data safety): downloaded CSVs at fixed points, paper score sheets as a
fallback. It protects the event, not the platform.

Options to evaluate (not yet decided): Supabase Pro + PITR; a scheduled `pg_dump` to storage the
school controls; or a nightly export job. Whatever is chosen must keep
`registration_submissions` (student + guardian PII) out of the repo and off shared drives.

### Future work — registration email API (parked 2026-10-06 by the organiser; do it when asked)
`api/send-registration-email.js` — the organiser said "not needed for now". When asked what is next for it:
1. **School year:** it still prints "SY 2025-2026" (header + footer). Look up `app_settings.school_year`
   server-side in `loadSchoolBranding()` (fallback = the same calendar rule as `schoolYearFor()`), never
   from the request body.
2. **Unauthenticated:** anyone can POST it and send an email with arbitrary text to any address — now with a
   real school's name/logo. Gate it: have `submit_registration()` return a one-time email token (or check
   the `reg_number` exists for that school and was created in the last few minutes) and verify it here.
3. **Rate limit** per school / recipient (Resend quota, abuse).
4. **PII in logs:** the app's `REG_EMAIL_FAILED` IT-log entry stores the student's email address — log the
   reg number only.
Already done (2026-10-06): school name + logo looked up server-side, all typed values HTML-escaped,
`scripts/registration-email.test.mjs`.

### Future work — AI help assistant (parked 2026-10-08 by the organiser: "when we are really done")
A Gemini "Ask a question" box. **No training** — send the help text (`ADMIN_HELP`, AdminInstructions.md,
JudgeInstructions.md) with each question and answer only from it ("ask your organiser" otherwise),
showing the section used. Admins first (top of Help & FAQ, admin-only endpoint like `api/scan-form.js`,
same paid key). Judges later ("? Help" on the project list, never the scoring screen, judge guide only)
— needs a server check that the caller is a signed-in judge of that school plus per-judge / per-school
daily caps, because judges have no auth and a public endpoint spends the school's Gemini credit. Never
send student names or scores; log counts, not question text. Its answers are only as good as the help
text — keep rule 56.

### Known gaps (not yet fixed)

- **NEXT is the first UNSCORED visit, not the clock** (2026-10p). A judge who skips a round still sees the
  skipped project as NEXT; nothing reads the time of day (rules 37 / 71: no `Date.now()` in render). The
  times on screen and on the printouts are the plan, not a timer.
- **Printouts and codes can go stale.** A judge sheet shows codes and booths as they were when printed;
  changing a department / category code, a project number or a booth afterwards changes the screen but not
  the paper. Settle codes and booths before printing.
- **Removing a schedule leaves the judge grid as the schedule set it** (each number ticked into the
  departments of its visits) — lists then follow that grid. Re-tick the grid by hand if that is not wanted.

- **Renaming a category does not update its projects** (2026-10-21). `projects.cat` is a text snapshot,
  so after a rename the old projects keep the old name, show "(old category)" when edited, and would form
  a separate group once awards go per category. Their code survives only by luck (`autoCode` of the old
  name). Fix with the per-category awards: rename = update the category AND its projects in one RPC.
  ⚠️ **Hit for real on 2026-10-21** (Life Science → Life, Health & Behavior) and cleared with a one-off
  SQL `UPDATE` of the 16 rows — the live data is clean, the code gap is not fixed. Two consequences a
  rename leaves behind even after the UPDATE: an **exported Projects CSV still holds the old text** and the
  importer keeps unknown categories *as written*, so restoring an old backup reintroduces it; and the
  **form scanner blanks** anything that is not an exact match to a live category, so a paper form printed
  with the old name scans with no category. Also: the delete warning counts `p.cat === cat.name`, so
  between the rename and the UPDATE it reports "0 projects use it" while projects still reference it.
- **The judge's tablet shows the running total while scoring.** The 2026-27 MS/HS form says scores are
  not shared with students during booth visits; a student at the booth can read the screen. A "hide the
  total until submitted" option was offered, not requested.
- **Rubric-level settings exist only for the presets** (rule 74 / `rubricSettings`) — a hand-built rubric
  cannot get the guide, the × factor or the elementary comment boxes.

- **Registration numbers break past 999.** `submit_registration()` (10b, 10m) formats with
  `lpad(n::text, 3, '0')`, and Postgres `lpad` TRUNCATES: the 1000th registration in a school gets
  `…-100`, which the 10m unique index then refuses. Irrelevant at this fair's size. Fix: pad only
  when shorter (`CASE WHEN length(x) < 3 THEN lpad(x,3,'0') ELSE x END`), same for `v_pnum`.
- **The CSV import cannot update existing projects** — it only creates, matching duplicates by title
  (2026-10-08). A corrected sheet therefore needs hand edits (or SQL). Sheets in the organiser's own
  layout also import badly: department heading rows become projects, newline-separated names become
  one student, "Research Question/Purpose" is not a recognised heading, and there is no Department column.

**From the second external review (2026-10-06). All verified in the code; two fixed 2026-10-07 (struck through).**
- **A lost response on a branding save deletes the file the row points at.** `saveBrandDraft()` removes
  the uploaded object whenever the RPC returns an error, including when the server committed first and
  only the reply was lost → a broken logo. Re-read the row before deleting anything.
- ~~**A refresh hides a queued-but-unsynced review from the judge.**~~ **Fixed 2026-10-07:**
  `loadScores()` overlays `queuedScoresFor(schoolId)` on the server's rows.
- ~~**Two admins can pick the same project number.**~~ **Fixed 2026-10-07 (migration 2026-10n):** a
  guarded UNIQUE `(school_id, num)` index refuses the clash; `createProject()` re-picks a number it chose
  itself from the server's list and retries once, and reports a typed one. Numbers are still *chosen*
  in the browser — the index makes a clash loud, not impossible. ⚠️ If the live database already holds
  a duplicate the migration warns and skips the index; renumber, then re-run it.
- **Not verified here, reported and plausible:** `submit_registration()` has no idempotency key (a
  retried form creates a second project), it checks grade/division/category for presence rather than
  validity, and the two API handlers do not type-check input or time-box their upstream calls.
- **By design, worth revisiting:** results CAN be finalized while a judge has scored nothing or has
  not validated — only an open CONCERN blocks Finalize (since 2026-10-07). If full coverage is
  wanted, the gate needs coverage checks, not a doc change.
- Locking judging while a judge's scoring screen is open is enforced in `submitScore()` but has no
  browser test: the e2e mock has no realtime, so the lock cannot reach an open screen there.
- **The offline queue can lose or resurrect a revision** (2026-10-06 review, partly fixed 2026-10-07).
  Fixed: a later submit that SUCCEEDS now removes the older queued copy (it was left in place, so a
  flush could overwrite the newer server value — and since 2026-10-07 it would also have been shown
  over it after a refresh). Still open: `runOfflineFlush()` drops entries by `judge_id_project_id`, so a
  re-score queued *during* a flush is deleted without being uploaded, and a flush that already read
  the old copy can still upload it after a newer success. Narrow windows; the fix is a per-revision id
  acknowledged individually.
- **No query paginates.** `loadScores` and `loadLog` fetch with no `.range()` (since 2026-10-07 a failed
  read is at least logged as LOAD_FAILED; `loadItLogs` asks for the newest 1,000 and IT Logs says when it
  hits that), so anything past Supabase's "Max rows" (Settings → API, default 1,000) is silently
  missing. Not a risk for this fair (~190 scores with 3 judges per project in 6-8), but `activity_log`
  WILL cross 1,000 and the Activity tab then stops being the full trail it claims to be.
- `projListUrl()`, `generateProjListLink()`, `revokeProjListLink()` have no UI callers, so `public-projects` is unreachable in practice.
- `submitDelibNote()` and `reviseDecision()` are defined but unreferenced (ESLint `no-unused-vars`).
- No UI for `set_school_invite_code()`.
- The `SEED_SCORES` constant is unused. (`CATEGORIES` was removed 2026-10-06.)
- **Registration receipt numbers (`reg_prefix`) still use `DIV_CODES`**, not the project-code format —
  a registered student's receipt says e.g. `JHS-LS-004` while the project's code (no department yet)
  reads `LS-…`. Unify when registration sets `department_id` (below).
- **`DIVISIONS` / `DIV_CODES` still duplicate what `departments` now holds** (`getDivision()` was removed 2026-10-06) —
  three disagreeing grade-band schemes (the registration form's divisions, its `reg_prefix` codes,
  and a display-only label). `departments.code` exists for this; unifying them is the next piece of
  Phase 1, and it also lets `submit_registration()` set a project's `department_id`.
- **`submit_registration()` creates projects with no `department_id`**, so a student-registered
  project is in no judge's list until an admin assigns it by hand. Fixed by the unification above.
- The public registration form has no automated browser test; its server side is covered by
  `npm test` (real-Postgres RPC/RLS). The scanner UI has `scripts/e2e/scan.e2e.mjs`.
- `submit_registration()` is gated only by the registration token: anyone holding an active link
  can submit repeatedly. Deactivate the link when registration closes.
- Branding storage cleanup is best-effort: a replaced file whose delete failed (IT log
  `BRANDING_OLD_FILE_NOT_REMOVED`) and the files of a deleted school stay in the bucket (never shown).
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
