# Science Fair Judging App — Claude Code Context

> This file is the single source of truth for AI-assisted development.
> Any AI reading this file should understand the full app before making changes.
> Do not delete it.

---

## 🧭 Project Overview

A **secure, digital judging platform** for school science fairs at Dishchiibikoh Community School.
Built as a single-file React component (`ScienceFairJudging.jsx`).
**Supabase is fully connected** — PostgreSQL + Realtime powers all data persistence.
**PWA-enabled** — installable on tablets/phones, works offline with local backup.

**Rubric:** Northeast AZ Regional Science and Engineering Fair scoring sheet (10 criteria, 42 pts max).
**Target scale:** Up to 15 judges, 50–150 projects.
**Target devices:** Tablets (primary), phones, laptops, Chromebooks — fully responsive.
**Live URL:** https://sciencefair-judging-app.vercel.app/
**Supabase project:** https://cjzuiimoamrggucvahjm.supabase.co

---

## 📁 File Structure

```
/
├── src/
│   ├── ScienceFairJudging.jsx   ← Entire app (single file, ~1800+ lines)
│   ├── supabaseClient.js        ← Supabase client init (reads from .env)
│   └── main.jsx                 ← React root + PWA service worker registration
├── supabase/
│   └── schema.sql               ← Full DB schema (already applied to Supabase)
├── public/
│   ├── favicon.svg
│   ├── logo.png                 ← School logo (also used as PWA icon)
│   └── icons.svg
├── index.html                   ← PWA meta tags (apple-touch-icon, theme-color, manifest)
├── vite.config.js               ← Vite + vite-plugin-pwa config
├── .env                         ← Local only, gitignored — holds Supabase credentials
├── .env.example                 ← Template for .env
├── .npmrc                       ← legacy-peer-deps=true (needed for vite-plugin-pwa on Vite 8)
└── CLAUDE.md                    ← This file
```

All CSS lives inside a `const CSS = \`...\`` template literal injected via `<style>{CSS}</style>`.
There are no separate `.css` files, no Tailwind, no CSS modules.

---

## 🏗️ Architecture

### Single-file React component
- **One default export:** `App()` in `ScienceFairJudging.jsx`
- **No routing library** — view switching via a `view` state string
- **No external state management** — plain `useState` throughout
- **Supabase realtime** subscriptions keep all clients in sync live

### View system
The app renders different screens based on `const [view, setView] = useState("landing")`.

| `view` value | Screen |
|---|---|
| `"landing"` | Landing page — choose Judge or Admin |
| `"judge-register"` | Judge sign-in (name + invite code) |
| `"judge-home"` | Judge's project list + progress + validation |
| `"judge-scoring"` | Scoring form for one project |
| `"admin-login"` | Admin password gate |
| `"admin-home"` | Full admin dashboard (tabbed) |
| `"public-results"` | Public results page (no login needed) |

### Admin dashboard tabs
Controlled by `const [adminTab, setAdminTab] = useState("overview")`.

| `adminTab` value | Content |
|---|---|
| `"overview"` | Stats, completion bar, leaderboard |
| `"judges"` | Per-judge progress table |
| `"projects"` | Per-project rubric breakdown |
| `"activity"` | Human-readable activity log |
| `"alerts"` | Anomaly detection + system status |
| `"deliberation"` | **Validation & Deliberation workflow** (see section below) |
| `"share"` | Generate/revoke public results link — **locked until results finalized** |
| `"itlogs"` | IT diagnostic terminal (PIN-gated) |

---

## 🔐 Security & Access Control

### Credentials
| Access | Credential |
|---|---|
| Judge sign-in name | `Judge1` through `Judge15` |
| Judge invite code | `FAIR2026` |
| Admin dashboard | Password: `SFadmin2026` |
| IT Logs tab | PIN: `1680` |
| Reset All Data | PIN: `1680` (same PIN, separate modal) |

### Security model
- **Judges are identified by number** — they sign in as `Judge1`–`Judge15`. The alias IS their username.
- **Duplicate prevention** — if a judge name is already registered, a second registration attempt is blocked client-side.
- **Project assignment is deterministic** — `assignProjects(seed)` uses the judge number as the seed (Judge1 → seed 0, Judge2 → seed 1, etc.) so Judge1 always gets the same 4 projects.
- **Judges only see their assigned projects** — 4 projects per judge.
- **IT Logs tab** is PIN-gated (`itUnlocked` state). Wrong PIN logs `IT_ACCESS_DENIED`.
- **Reset modal** requires PIN `1680`. Wrong PIN logs `RESET_PIN_FAILED`.
- **Activity log is NEVER cleared on reset** — preserved for security audit. This is intentional.
- **Judging can be locked** by admin (`locked` state) — blocks all judge score submissions.
- **Public results page never shows judge names** — score + project data only.

### Judge sign-in flow
1. Judge enters their name (`Judge1`–`Judge15`) and invite code `FAIR2026`
2. App validates name is in `JUDGE_NAMES` array and not already taken
3. Judge is inserted into Supabase `judges` table with a random `id`, their name as `alias`, and assigned projects
4. Session is saved to `localStorage` (`sf_judge_id` + `sf_judge_data`) for persistence across browser restarts

---

## 📊 Data Model

### Projects (`PROJECTS` constant array)
```js
{ id, num, title, cat, grade }
// cat values: "Biology", "Physics", "Computer Sci.", "Chemistry", "Earth Science"
```

### Judges (stored in `judges` state, synced from Supabase `judges` table)
```js
{ id, alias, projects: [pid, ...], joinedAt }
// alias = judge's chosen name e.g. "Judge3"
// projects: array of 4 project IDs assigned to this judge
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

### Judge validations (`judgeValidations` state — in-memory, not yet in Supabase)
```js
// Key: judgeId, Value:
{ approved: boolean, comment: string, validatedAt: timestamp }
```

### Admin validation (`adminValidation` state — in-memory)
```js
{ approved: boolean, comment: string, validatedAt: timestamp } | null
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
- Judge can revise their validation until admin finalizes.

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
- `deliberationOpen` (boolean) + `deliberationReason` (`"tie" | "manual" | null`) track state.
- While open, admin can view judge notes per project and assign awards (`finalDecisions`).
- Admin closes deliberation when done.
- If **all reviewers reached consensus and no tie exists**, the admin can finalize without ever opening deliberation.

**5. Finalize Results**
- The "Finalize Results" button is enabled when:
  - `adminValidation?.approved === true` AND
  - `deliberationOpen === false`
- Clicking it sets `resultsFinalized = true`.
- This **unlocks the Share tab** — the "Generate Live Results Link" button is disabled until `resultsFinalized`.

### Key state variables for this workflow
```js
judgeValidations   // { [judgeId]: { approved, comment, validatedAt } }
adminValidation    // { approved, comment, validatedAt } | null
resultsFinalized   // boolean — gates the Share tab
deliberationOpen   // boolean
deliberationReason // "tie" | "manual" | null
valComment         // string — draft comment for validate/flag forms
showValForm        // boolean — shows the comment textarea
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

### Offline flow
1. On mount, app instantly restores judge session + scores from `localStorage` (before Supabase loads)
2. After Supabase loads, session is verified — if judge was reset by admin, cache is cleared and judge is sent to landing
3. If Supabase is unreachable, cached session and scores remain active
4. Scores submitted offline are queued in `sf_offline_queue` and auto-synced when `window.online` fires
5. 8-second timeout prevents infinite loading if Supabase is unreachable and there's no cache

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

---

## ⚙️ Key Helper Functions

```js
// Scoring
getTotal(scoreObj)          // Sum all rubric scores → number (max 42)
projAvg(pid)                // Average total score across all judges for a project → "xx.x" | null
rubAvg(pid, rid)            // Average of one rubric criterion for a project → "xx.x" | null
rankedProjects()            // All projects sorted by avg score descending
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
openDeliberation(reason)    // Opens deliberation ("tie" | "manual")
closeDeliberation()         // Closes deliberation
finalizeResults()           // Sets resultsFinalized=true, unlocks Share tab

// Deliberation helpers
getDelibNotesForProject(pid) // Array of { judgeAlias, comment, recommendation, flagged }
getRecBreakdown(pid)         // { [rec]: count } for all RECOMMENDATIONS
getFlagCount(pid)            // Number of flagged notes for a project

// Admin / shared
getAnomalies()              // Array of outlier objects where deviation > 8pts from group avg
isLinkLive()                // Boolean — is the public share link active and not expired?
addLog(msg)                 // Append to human activity log + Supabase activity_log
addItLog(level, module, event, detail, payload)  // Append structured IT log entry
assignProjects(idx)         // Assign 4 project IDs to a judge based on their index (0-based)
flushOfflineQueue()         // Sync any locally-queued scores to Supabase
buildDelibReport()          // Generate formatted deliberation summary string for copy
buildSnapshot()             // Generate current system state snapshot string
executeReset()              // Reset all data EXCEPT activity log — requires PIN 1680
```

---

## 🗄️ Active Backend (Supabase)

Supabase is **fully integrated and live**. Schema is applied at `supabase/schema.sql`.

### Tables
| Table | Purpose |
|---|---|
| `judges` | Registered judges (id, alias, projects JSON, joined_at) |
| `scores` | One row per judge+project pair; UNIQUE(judge_id, project_id) |
| `activity_log` | Human-readable audit trail — never deleted |
| `it_logs` | Structured diagnostic events |
| `share_links` | Public results tokens with expiry + revoked_at |
| `app_settings` | Key/value: `locked` and `deliberation_open` |
| `deliberation_notes` | Judge comments/recommendations per project (used during deliberation) |
| `final_decisions` | Admin award decisions per project |

> **Note:** `judgeValidations`, `adminValidation`, and `resultsFinalized` are currently **in-memory only** (not persisted to Supabase). If the admin refreshes the page, validation state resets. Persisting these is a planned improvement.

### Realtime
All tables are subscribed via a single `supabase.channel("app-realtime")` — changes propagate live across all open tabs/devices.

### RLS
Row Level Security is enabled on all tables with open anon policies (public read/write). Full per-judge enforcement requires Supabase Auth (not yet implemented).

---

## 🚫 Critical Rules — Do NOT Break These

1. **Never clear the activity log (`log` state) on reset.** Preserved for security purposes. `executeReset()` resets: judges, scores, locked, share*, deliberationNotes, finalDecisions, judgeValidations, adminValidation, resultsFinalized, deliberationOpen.
2. **Judge names must never appear on the public results page.** The `view === "public-results"` page is visible without login — keep it score + project data only.
3. **IT Logs tab and Reset modal both use PIN `1680`.** They share the same PIN but have separate state (`itPin`/`itUnlocked` vs `resetPin`/`showReset`).
4. **All CSS is inline** in the `CSS` template literal. Do not create external `.css` files.
5. **No routing library.** All navigation uses `setView(...)`. Do not introduce React Router.
6. **The score key format is `${judgeId}_${projectId}`** — used throughout for lookups. Do not change it.
7. **Rubric has 10 criteria summing to 42 pts max.** See rubric table above. Do NOT revert to the old 6-criteria/100-pt rubric. Each criterion uses discrete `steps` values — do not replace with continuous sliders.
8. **Judge names are Judge1–Judge15.** The `JUDGE_NAMES` constant defines the allowed list.
9. **Share tab is gated by `resultsFinalized`.** The "Generate Live Results Link" button must remain disabled until `resultsFinalized === true`. Do not remove this gate.
10. **Deliberation is conditional.** It must NOT auto-open on every session — only on tie detection or admin manual trigger. If all reviewers reached consensus, finalization proceeds without deliberation.

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
- Judge invite code: change `INVITE_CODE` constant
- Admin password: change `ADMIN_PASS` constant
- IT/Reset PIN: search `"1680"` — appears in IT logs PIN handler and reset modal PIN handler, change both

**Adding more judges (beyond 15):**
Change the `15` in `Array.from({ length: 15 }, ...)` in the `JUDGE_NAMES` constant.

**Adding a new view/screen:**
1. Add a new `if (view === "yourview") return (...)` block
2. Navigate to it with `setView("yourview")`

**Deploying:**
Push to `main` branch on GitHub — Vercel auto-deploys. No manual steps needed.

**Persisting validation state to Supabase (not yet done):**
Add a `validations` table: `(judge_id, approved, comment, validated_at)` and an `app_settings` row for `results_finalized`. Load in the Supabase loader section and subscribe in `app-realtime` channel.
