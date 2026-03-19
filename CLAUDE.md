# Science Fair Judging App — Claude Code Context

> This file is the single source of truth for AI-assisted development.
> Claude Code reads this automatically. Do not delete it.

---

## 🧭 Project Overview

A **secure, anonymous, digital judging platform** for school science fairs.
Built as a single-file React component (`ScienceFairJudging.jsx`).
No external backend yet — all state lives in React `useState` (in-memory).
Designed to eventually connect to **Supabase** (PostgreSQL + Auth + Realtime).

**Target scale:** Medium — 10–30 judges, 50–150 projects.
**Target devices:** Mobile phones, tablets, laptops, Chromebooks (fully responsive).

---

## 📁 File Structure

```
/
├── ScienceFairJudging.jsx   ← Entire app (single file, ~1400 lines)
├── CLAUDE.md                ← This file — read before making any changes
```

All CSS lives inside a `const CSS = \`...\`` template literal injected via `<style>{CSS}</style>`.
There are no separate `.css` files, no Tailwind, no CSS modules.

---

## 🏗️ Architecture

### Single-file React component
- **One default export:** `App()` in `ScienceFairJudging.jsx`
- **No routing library** — view switching is done via a `view` state string
- **No external state management** — plain `useState` throughout
- **All mock/seed data** is defined at the top of the file as constants

### View system
The app renders different screens based on `const [view, setView] = useState("landing")`.

| `view` value | Screen |
|---|---|
| `"landing"` | Landing page — choose Judge or Admin |
| `"judge-register"` | Judge registration with invite code |
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

### Credentials (demo values — change before production)
| Access | Credential |
|---|---|
| Judge registration | Invite code: `FAIR2025` |
| Admin dashboard | Password: `admin2025` |
| IT Logs tab | PIN: `1680` |
| Reset All Data | PIN: `1680` (same PIN, separate modal) |

### Security model
- **Judges are anonymous** — on registration, a random alias is assigned from `ADJ[]` + `ANIM[]` arrays (e.g. "Bold Falcon"). Real identity never stored.
- **Judges only see their assigned projects** — `assignProjects(idx)` assigns 4 projects per judge based on their registration index.
- **IT Logs tab** is PIN-gated (`itUnlocked` state). Wrong PIN logs `IT_ACCESS_DENIED` to IT logs.
- **Reset modal** requires the same PIN (`1680`). Wrong PIN logs `RESET_PIN_FAILED`.
- **Activity log is NEVER cleared on reset** — preserved for security and review purposes. This is intentional and must not be changed.
- **Judging can be locked** by admin (`locked` state) — locked state blocks all judge score submissions.

---

## 📊 Data Model

### Projects (`PROJECTS` constant array)
```js
{ id, num, title, cat, grade }
// cat values: "Biology", "Physics", "Computer Sci.", "Chemistry", "Earth Science"
```

### Judges (stored in `judges` state, seeded from `SEED_JUDGES`)
```js
{ id, alias, projects: [pid, ...], joinedAt }
// projects: array of 4 project IDs assigned to this judge
```

### Scores (stored in `scores` state as flat key-value object, seeded from `SEED_SCORES`)
```js
// Key format: `${judgeId}_${projectId}`  e.g. "j_a_p1"
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

### Activity log (`log` state, seeded from `SEED_LOG`)
```js
[{ time: timestamp, msg: "Human readable string" }, ...]
// NEVER clear this on reset. Preserved for security review.
```

### IT diagnostic logs (`itLogs` state, seeded from `SEED_IT`)
```js
[{ id, ts, level, module, event, detail, payload }, ...]
// level:  "ERROR" | "WARN" | "INFO" | "DEBUG"
// module: "AUTH" | "JUDGE" | "SCORE" | "ADMIN" | "SHARE" | "DB" | "SYSTEM"
```

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
- Judge aliases are **never** shown on the public page

---

## 🎨 Design System

### Fonts (loaded from Google Fonts)
| Variable | Font | Usage |
|---|---|---|
| `--ff-d` | Playfair Display 600/700 | Headings, titles, big numbers |
| `--ff-b` | DM Sans 300–600 | Body text, UI labels |
| `--ff-m` | DM Mono 400/500 | Codes, IDs, timestamps, pills |

### Color palette (CSS variables)
```css
--bg:    #07101f   /* darkest background */
--s1:    #0d1b30   /* card background */
--s2:    #132240   /* hover / secondary card */
--bd:    #1c2e4a   /* borders */
--gold:  #f0a500   /* primary accent */
--gold2: #a37010   /* muted gold (borders) */
--text:  #e2e8f5   /* primary text */
--dim:   #6b7fa3   /* muted / secondary text */
--blue:  #3b82f6
--green: #22c55e
--red:   #ef4444
--amber: #f59e0b
--purple:#a78bfa
--r:     12px      /* border-radius */
```

### Key CSS classes
- `.card` — standard dark card with border
- `.btn` — gold primary button (full width by default)
- `.btn.sec` — secondary/ghost button
- `.btn.danger` — red destructive button
- `.btn.purple` — purple action button
- `.btn.sm` — auto-width small button
- `.lbl` — monospace uppercase label above inputs
- `.badge` — inline pill: `.bg` (green) `.ba` (amber) `.br` (red) `.bb` (blue) `.bp` (purple)
- `.pbar` + `.pfill` — progress bar track + fill
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
addLog(msg)                 // Append to human activity log
addItLog(level, module, event, detail, payload)  // Append structured IT log entry
genAlias(seed)              // Generate anonymous judge alias from ADJ+ANIM arrays
assignProjects(idx)         // Assign 4 project IDs to a judge based on their index
buildReport(logs)           // Generate formatted IT diagnostic report string for copy
buildSnapshot()             // Generate current system state snapshot string
executeReset()              // Reset all data EXCEPT activity log — requires PIN 1680
```

---

## 🚫 Critical Rules — Do NOT Break These

1. **Never clear the activity log (`log` state) on reset.** It is preserved for security purposes. Only `judges`, `scores`, `locked`, and `share*` state are reset.
2. **Judge aliases must never appear on the public results page.** The `view === "public-results"` page is visible without login — keep it score + project data only.
3. **IT Logs tab and Reset modal both use PIN `1680`.** They share the same PIN but have separate state (`itPin`/`itUnlocked` vs `resetPin`/`showReset`).
4. **All CSS is inline** in the `CSS` template literal. Do not create external `.css` files.
5. **No routing library.** All navigation uses `setView(...)`. Do not introduce React Router.
6. **The score key format is `${judgeId}_${projectId}`** — this pattern is used throughout for lookups. Do not change it.
7. **Rubric max values must always sum to 100.** Current: method(20) + research(15) + data(20) + results(20) + display(15) + creativity(10) = 100.

---

## 🗄️ Planned Backend (Not yet implemented)

When connecting to **Supabase**:
- Replace `useState` for `judges`, `scores`, `log` with Supabase realtime subscriptions
- Use Supabase Auth for invite code enforcement (not plain string comparison)
- Enable Row-Level Security (RLS) so judges can only read/write their own score rows
- Store share tokens in a `share_links` table with expiry timestamps
- IT logs should write to a `diagnostic_logs` table

---

## 💡 Common Edit Patterns

**Adding a new rubric criterion:**
1. Add entry to `RUBRIC` array at top of file
2. Ensure all `max` values still sum to 100
3. Any existing `SEED_SCORES` entries will need the new key added

**Adding a new admin tab:**
1. Add `{ id, ico, label }` to `navItems` array inside the admin dashboard render
2. Add `{adminTab === "yourid" && <> ... </>}` block inside `.adm-main`

**Adding a new IT log event:**
Call `addItLog(level, module, event, detail, payload)` anywhere in the code.

**Changing the PIN:**
Search for `"1680"` — it appears in the IT logs PIN handler and the reset modal PIN handler. Change both.

**Adding a new view/screen:**
1. Add a new `if (view === "yourview") return (...)` block
2. Navigate to it with `setView("yourview")`
