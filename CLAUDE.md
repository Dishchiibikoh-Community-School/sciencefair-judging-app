# Science Fair Judging App — Claude Code Context

> This file is the single source of truth for AI-assisted development.
> Claude Code reads this automatically. Do not delete it.

---

## 🧭 Project Overview

A **secure, digital judging platform** for school science fairs at Dishchiibikoh Community School.
Built as a single-file React component (`ScienceFairJudging.jsx`).
**Supabase is fully connected** — PostgreSQL + Realtime powers all data persistence.
**PWA-enabled** — installable on tablets/phones, works offline with local backup.

**Target scale:** Medium — up to 15 judges, 50–150 projects.
**Target devices:** Tablets (primary), phones, laptops, Chromebooks — fully responsive.
**Live URL:** https://sciencefair-judging-app.vercel.app/
**Supabase project:** https://cjzuiimoamrggucvahjm.supabase.co

---

## 📁 File Structure

```
/
├── src/
│   ├── ScienceFairJudging.jsx   ← Entire app (single file, ~1500+ lines)
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
| `"judge-home"` | Judge's project list + progress |
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
| `"share"` | Generate/revoke public results link |
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
- **Duplicate prevention** — if a judge name is already registered (signed in on another device), a second registration attempt is blocked client-side.
- **Project assignment is deterministic** — `assignProjects(seed)` uses the judge number as the seed (Judge1 → seed 0, Judge2 → seed 1, etc.) so Judge1 always gets the same 4 projects regardless of registration order.
- **Judges only see their assigned projects** — 4 projects per judge.
- **IT Logs tab** is PIN-gated (`itUnlocked` state). Wrong PIN logs `IT_ACCESS_DENIED`.
- **Reset modal** requires PIN `1680`. Wrong PIN logs `RESET_PIN_FAILED`.
- **Activity log is NEVER cleared on reset** — preserved for security audit. This is intentional.
- **Judging can be locked** by admin (`locked` state) — blocks all judge score submissions.

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
// Key format: `${judgeId}_${projectId}`
// Value:
{ method, research, data, results, display, creativity, notes, time }
// All rubric values are numbers. Notes is a string. Time is a timestamp.
```

### Rubric (`RUBRIC` constant array — 6 criteria, total 100 pts)
```js
{ id, label, desc, max }
// id values:    "method", "research", "data", "results", "display", "creativity"
// max values:    20,       15,         20,     20,        15,        10
```

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

---

## 💾 Offline & PWA Support

### PWA
- Configured via `vite-plugin-pwa` in `vite.config.js`
- Generates `sw.js` (service worker) and `manifest.webmanifest` at build time
- App shell (JS, CSS, HTML, fonts) is precached — loads without internet after first visit
- Install prompt appears on Chrome/Android automatically; iOS requires "Add to Home Screen" manually

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

## 🔗 Share Results Feature

Controlled by these state variables:
```js
shareToken      // random token string e.g. "A3BF-9KX2-P7QR-W1TZ"
shareEnabled    // boolean
shareExpiry     // "1h" | "24h" | "7d" | "never"
shareCreated    // timestamp when link was generated
shareShowRubric // boolean — whether rubric breakdown shows on public page
shareTitle      // string — page heading on public results
```

`isLinkLive()` returns `true` only if `shareEnabled && shareToken && not expired`.

The public results page (`view === "public-results"`) shows:
- Podium (top 3 projects) — reordered visually as 2nd, 1st, 3rd
- Full ranked table with optional rubric breakdown chips
- Judge names are **never** shown on the public page

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
- `.btn.purple` — purple action button
- `.btn.sm` — auto-width small button
- `.lbl` — monospace uppercase label above inputs
- `.badge` — inline pill: `.bg` (green) `.ba` (amber) `.br` (red) `.bb` (blue) `.bp` (purple)
- `.pbar` + `.pfill` — progress bar track + fill
- `.offline-banner` — amber warning bar shown in judge views when offline
- `.locked-banner` — red warning bar when admin has locked judging
- `.it-term` — dark terminal-style container for IT logs
- `.pin-gate` — PIN entry screen (centered, full height)
- `.modal-overlay` + `.modal-box` — full-screen modal with blur backdrop

---

## ⚙️ Key Helper Functions

```js
getTotal(scoreObj)          // Sum all rubric scores → number
projAvg(pid)                // Average total score across all judges for a project → "xx.x" | null
rubAvg(pid, rid)            // Average of one rubric criterion for a project → "xx.x" | null
rankedProjects()            // All projects sorted by avg score descending
judgeComp(judge)            // { done, total, pct } completion stats for a judge
hasScored(pid)              // Boolean — has the current judge scored this project?
totalScored()               // Count of all score entries
possible()                  // Max possible scores (judges × their assigned projects)
getAnomalies()              // Array of outlier objects where deviation > 20pts from group avg
isLinkLive()                // Boolean — is the public share link active and not expired?
addLog(msg)                 // Append to human activity log + Supabase activity_log
addItLog(level, module, event, detail, payload)  // Append structured IT log entry
assignProjects(idx)         // Assign 4 project IDs to a judge based on their index (0-based)
flushOfflineQueue()         // Sync any locally-queued scores to Supabase
buildReport(logs)           // Generate formatted IT diagnostic report string for copy
buildSnapshot()             // Generate current system state snapshot string
executeReset()              // Reset all data EXCEPT activity log — requires PIN 1680
```

---

## 🚫 Critical Rules — Do NOT Break These

1. **Never clear the activity log (`log` state) on reset.** Preserved for security purposes. Only `judges`, `scores`, `locked`, `share*`, `deliberationNotes`, and `finalDecisions` are reset.
2. **Judge names must never appear on the public results page.** The `view === "public-results"` page is visible without login — keep it score + project data only.
3. **IT Logs tab and Reset modal both use PIN `1680`.** They share the same PIN but have separate state (`itPin`/`itUnlocked` vs `resetPin`/`showReset`).
4. **All CSS is inline** in the `CSS` template literal. Do not create external `.css` files.
5. **No routing library.** All navigation uses `setView(...)`. Do not introduce React Router.
6. **The score key format is `${judgeId}_${projectId}`** — used throughout for lookups. Do not change it.
7. **Rubric max values must always sum to 100.** Current: method(20) + research(15) + data(20) + results(20) + display(15) + creativity(10) = 100.
8. **Judge names are Judge1–Judge15.** The `JUDGE_NAMES` constant defines the allowed list. Do not change the sign-in to use random aliases — the school wants identifiable judges.

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
| `deliberation_notes` | Judge comments/recommendations per project |
| `final_decisions` | Admin award decisions per project |

### Realtime
All tables are subscribed via a single `supabase.channel("app-realtime")` — changes propagate live across all open tabs/devices.

### RLS
Row Level Security is enabled on all tables with open anon policies (public read/write). Full per-judge enforcement requires Supabase Auth (not yet implemented).

---

## 💡 Common Edit Patterns

**Adding a new rubric criterion:**
1. Add entry to `RUBRIC` array at top of file
2. Ensure all `max` values still sum to 100
3. Add the new column to `supabase/schema.sql` scores table and run migration

**Adding a new admin tab:**
1. Add `{ id, ico, label }` to `navItems` array inside the admin dashboard render
2. Add `{adminTab === "yourid" && <> ... </>}` block inside `.adm-main`

**Adding a new IT log event:**
Call `addItLog(level, module, event, detail, payload)` anywhere in the code.

**Changing credentials:**
- Judge invite code: change `INVITE_CODE` constant (line ~7)
- Admin password: change `ADMIN_PASS` constant (line ~8)
- IT/Reset PIN: search `"1680"` — appears in IT logs PIN handler and reset modal PIN handler, change both

**Adding more judges (beyond 15):**
Change the `15` in `Array.from({ length: 15 }, ...)` in the `JUDGE_NAMES` constant.

**Adding a new view/screen:**
1. Add a new `if (view === "yourview") return (...)` block
2. Navigate to it with `setView("yourview")`

**Deploying:**
Push to `main` branch on GitHub — Vercel auto-deploys. No manual steps needed.
