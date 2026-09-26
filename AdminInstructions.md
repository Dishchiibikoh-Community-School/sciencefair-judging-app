# Admin Instructions — Science Fair Judging App

## Welcome to the Admin Dashboard

This guide covers everything an event organizer needs to know to run the digital judging platform smoothly, from pre-event setup through results publication.

---

## Admin Access

Your fair lives at its own address: **`https://app.qritiko.com/s/your-school`**. Everything below happens there — a plain `app.qritiko.com` is the platform homepage, not your fair.

**Login:** the **email and password** you chose when you registered the school (Supabase Auth). There is no shared admin password.

**To enter admin mode:**
1. Open your school's link
2. Click **"I'm an Admin"**
3. Enter your admin email and password
4. You'll see the full dashboard with tabs

Five failed attempts locks login for 30 seconds. Every failure is written to the IT log.

**Your 4-digit PIN** (separate from the password) guards the IT Logs tab, Reset All Data, and judge device transfers. It defaults to **`0000`** when the school is created — **change it before your event.**

> **First time signing in?** If you just registered the school, confirm your email first. Departments and the default rubric finish setting themselves up automatically on your first successful admin sign-in.

---

## Tab Overview

| Tab | Purpose |
|---|---|
| **Overview** | Stats, completion tracking, per-department leaderboards, department settings |
| **Judges** | Track judge registration and scoring progress, grouped by department |
| **Projects** | Add, edit, remove, or lock projects — each assigned to a department |
| **Registration** | Generate/deactivate student registration link; view all submitted registrations |
| **Activity** | Human-readable timeline of all system events |
| **Alerts** | Anomaly detection and system status |
| **Deliberation** | Validation workflow and award decisions |
| **Share** | Generate live results link (after results finalized) |
| **Score Export** | Per-judge CSV export and score backups |
| **Rubric** | View and edit your school's scoring criteria |
| **IT Logs** | Diagnostic terminal for troubleshooting (PIN-gated) |

---

## Pre-Event Checklist

Run through this a few days before, not on the morning of.

- [ ] **Check the app is awake.** Open `https://app.qritiko.com/s/your-school`. The free Supabase tier pauses a project after ~7 days with no traffic, and a paused project takes the whole app down. If anything fails to load, resume it from the Supabase dashboard and re-check.
- [ ] **Change the admin PIN** from the default `0000` (IT Logs tab).
- [ ] **Confirm departments exist** — the Overview tab should list Elementary / Middle School / High School. If it does not, sign out and back in; they re-seed on admin sign-in.
- [ ] **Set max judges per department** (locks per department once its first judge registers).
- [ ] **Enter every project/team**, each assigned to a department, with adviser and members.
- [ ] **Print the project list** (Projects tab) and check advisers/members appear.
- [ ] **Do a dry run:** sign in as Judge1 on a spare tablet, score one project, confirm it shows in Overview, then Reset All Data.
- [ ] **Write down** the school link, invite code, and which judge name each judge gets.
- [ ] **Save a score backup** (Score Export tab) at the halfway point on event day.

---

## Pre-Event Setup

### 1. Configure Department Settings

The app has three departments: **Elementary**, **Middle School**, and **High School**. Each department has its own judge pool, project list, and leaderboard.

**On the Overview tab, before any judges register:**

- **Set Max Judges per Department** — Each department shows its own max judges setting
  - Click the number next to a department's max judges field
  - Enter the new number (e.g., 5, 8, 10)
  - Click **"Save"**
  - Default is **5 judges per department**
  - Once the first judge registers in a department, that department's max locks
  - Other departments remain editable until their first judge registers

**Why this matters:**
- Elementary, Middle School, and High School may have different judge counts
- Each department is independent — locking one does not affect the others
- After a reset, all department max judges become editable again

### ⚠️ Order matters: add ALL projects BEFORE judges sign in

A judge's project list is built when they sign in. The app now pushes newly added
projects out to judges who have already registered — but the safest sequence is still:

1. Set each department's max judges
2. Enter **every** project/team
3. *Then* hand out the judge name + invite code

If you must add a late entry after judging has started, it is pushed to the judges in
that department automatically. Ask them to pull-to-refresh, and check the Judges tab —
their "Projects Assigned" count should go up by one.

---

### 2. Add Projects

**On the Projects tab:**

1. Click **"+ Add Project"**
2. Fill in the form:
   - **Department** — Which department this project belongs to (Elementary, Middle School, or High School)
   - **Title** — Project name (e.g., "Solar Cell Efficiency Under Different Light Spectra")
   - **Category** — Life Science · Earth and Space Science · Physical Science · Engineering and Technology
   - **Grade** — Student grade level (e.g., 4, 6, 9, 11)
   - **Number** — Auto-generated, can edit (e.g., 001, 002, 003)
3. Fill in **Adviser Name** and **Group Members** (comma-separated) if it is a team entry
4. Click **"Add Project"**

**Important:** Judges only score projects in their own department. A judge registered under Elementary will only see Elementary projects.

#### Registering teams yourself (2026-27 workflow)

When organisers enter the teams rather than students self-registering, the Projects tab is
your only data-entry path. Adviser and group members are stored **on the project**, so they
appear on the project rows and on the printed project list PDF.

| Field | Notes |
|---|---|
| Department | Required — a project with no department is scored by nobody |
| Title | The project name |
| Category | One of the four official categories |
| Grade | Drives the abstract rule — grades below 5 skip the Abstract criterion and are scored out of 36 |
| Number | Auto-filled; edit if you use your own numbering |
| Adviser Name | Teacher/coach — optional but appears on the project list |
| Group Members | Comma-separated, e.g. `Juan, Maria, Pedro` — leave blank for individual entries |

You do **not** need to generate a registration link at all this year. Leave it deactivated.

**Tips:**
- Assign every project to a department before judging begins
- Projects without a department assigned will not appear in any judge's list
- Use consistent numbering per department (e.g., Elementary: 001–020, Middle: 021–040)

### 3. Prepare Judge Credentials

- **Judge names:** Judge1 through Judge[N] — where N is the Max Judges value configured per department
  - Example: Elementary has 5 judges → Judge1–Judge5 in that department
  - Middle School also has 5 judges → Judge1–Judge5 in that department (same names are fine — different departments)
- **Invite code:** shown on your admin Overview tab ("Get started" card). Judges type this to sign in.
- **Department:** Tell each judge which department they are assigned to before the event

---

## During Judging

### Overview Tab — Live Scorecard

**Per-department stats:**

Each department shows its own section with:
- **Judge count** — registered vs max for that department (e.g., 3/5)
- **Max Judges setting** — editable until first judge registers in that dept
- **Leaderboard** — real-time ranked list of projects in that department

| Leaderboard Column | What It Shows |
|---|---|
| **#** | Rank within department (by current average) |
| **Project** | Title |
| **Category** | Subject area |
| **Avg** | Current average score (out of 42) |
| **Reviews** | How many judges have scored it |

Unscored projects (no reviews yet) appear below a divider at reduced opacity.

### Judges Tab — Per-Judge Status

Judges are grouped by department with a section header for each.

| Column | Meaning |
|---|---|
| **Judge Name** | Who they are |
| **Department** | Which department they registered under |
| **Projects Assigned** | Count they're responsible for |
| **Completed** | How many they've finished |
| **Progress %** | Visual completion indicator |
| **Status** | "Scoring", "Validated", or "Pending" |

**Use this to:**
- Identify judges who are falling behind — within their department
- Confirm all departments have enough judges registered
- Contact slow judges for a nudge (off-app)

### Device Transfer (Admin-Controlled)

If a judge's tablet fails and they need to continue on another device:

1. Go to **Judges** tab
2. Find the judge row
3. Click **"Allow Transfer"**
4. Enter the **IT PIN** to authorize transfer
5. Approval stays active briefly (about 10 minutes, one-time use)
6. Judge signs in on the new device with the same judge name + department + invite code

**Important:**
- Judges cannot self-transfer without admin approval
- Approval is consumed after a successful transfer
- If transfer expires, admin can approve again

### Projects Tab — Project Management

**View all projects with:**
- Number, Title, Category, Grade, Department badge
- **Rubric Breakdown** — How judges are scoring this project (expandable card)
- **Actions:** Edit, Delete, Lock

**Edit a Project:**
1. Click **"Edit"**
2. Change title, category, grade, number, or department
3. Click **"Save Changes"**

**Delete a Project:**
1. Click **"Remove"**
2. Confirm the prompt
3. All scores, deliberation notes, and decisions for this project are deleted
4. Locked projects cannot be deleted — unlock first if needed

**Lock a Project:**
- Click **"Lock"** to prevent editing/removal
- Click **"Unlock"** to allow changes again

**Rubric Breakdown (Expandable):**
- Shows average score per criterion
- Helps identify which rubric items judges are rating consistently high/low

### Alerts Tab — Quality Control

**Anomaly Detection:**
- Flags projects with unusual scoring patterns
- Example: Judge1 gave Project 5 a score 15 points lower/higher than other judges
- Details: project, outlier scores, threshold, and recommendation

**System Status:**
- Health indicators and Supabase sync status

### Activity Tab — Audit Trail

Complete log of all events: judge registrations, score submissions, project changes, resets, deliberation events.

---

## Student Registration

> **Not using this?** If organisers are entering the teams themselves (the 2026-27 workflow),
> skip this whole section. Leave the registration link deactivated and add projects directly in
> the Projects tab. Nothing else depends on it. The tab still shows any submissions from
> previous years.

### Overview

Before the event, admin generates a registration link and shares it with participants. Students fill out a form and their project is automatically added to the project list — no manual admin entry needed.

### Generate a Registration Link

1. Go to **Registration tab**
2. Click **Generate Registration Link**
3. Copy the URL and share it with participants (post on school website, group chat, or print on flyer)
4. The same link works for all participants — one link, unlimited submissions

### What Participants See

Students fill out a 6-section form:
1. **Student Info** — name, grade, division, school, email, contact number
2. **Project Info** — title, category, type (Individual/Group), group members if any
3. **Teacher/Advisor** — advisor name, email, department
4. **Project Details** — description, research question, hypothesis
5. **Logistics** — electricity needs, special equipment, trifold board
6. **Consent** — original work declaration, rules agreement, guardian signature

On submission:
- Project is auto-saved to the Projects list
- Student receives a **confirmation email** with their registration number (e.g. `Elem-LF-001`)
- Registration number format: `{Division}-{Category}-{NNN}`

### Registration Number Format

| Division | Code | Category | Code |
|---|---|---|---|
| Elementary | `Elem` | Life Science | `LF` |
| Junior High School | `JHS` | Earth and Space Science | `ESS` |
| Senior High School | `SHS` | Physical Science | `PS` |
| | | Engineering and Technology | `ET` |

Example: `JHS-PS-003` = 3rd Junior High School Physical Science entry

### View Submitted Registrations

The **Submitted Registrations** table on the Registration tab shows:
- Registration number, student name, project title, category, division, submission date

### Close Registration

Click **Deactivate Registration Link** when registration period ends. The link stops working immediately. All previously submitted records are preserved.

### Notes

- Deactivating a link and generating a new one does **not** affect existing submissions
- Registration submissions and links are **not cleared** by Reset All Data
- To delete registration data, remove rows directly in the Supabase dashboard

---

## Validation & Deliberation Workflow

### Step 1: Judges Validate Their Results

After a judge completes scoring all projects in their department:
1. Judge sees a read-only ranked list of their projects
2. Two options:
   - **"Approve Results"** — scores look good
   - **"Flag a Concern"** — something seems off + optional comment

### Step 2: Admin Reviews Validations

**On the Deliberation tab:**
- See all judges' validation statuses across all departments
- Green = Approved, Amber = Concern, Gray = Pending
- Admin also validates themselves

### Step 3: Consensus Check

Green banner appears when all completed judges have approved AND admin has approved.

### Step 4: Deliberation (Conditional)

Opens automatically on a tie, or admin can open manually. Admin assigns final awards per project.

### Step 5: Finalize Results

1. Ensure consensus is reached
2. Close deliberation if opened
3. Click **"Finalize Results"**
4. Share tab becomes enabled

---

## Data Management

### Reset All Data

**CAUTION — This is permanent:**

1. Go to **IT Logs tab** (enter the 4-digit IT PIN)
2. Click **"Reset All Data"**
3. Enter IT PIN and confirm

**What resets:**
- All judge registrations and sessions (across all departments)
- All scores
- All deliberation notes and decisions
- All validation entries
- Share link (public results **and** project list links)
- Per-department judge counts return to 0 (max judges become editable again)

**What is NOT reset:**
- Projects
- Department definitions and max judges settings
- Activity log (security audit trail is permanent)

### Lock Judging

1. **Overview tab**
2. Click **"Lock Judging"** toggle
3. Red banner appears — judges cannot submit scores
4. Affects all departments simultaneously

---

## Share Results

### Prerequisites

- All scoring complete
- Consensus reached (all judges approved)
- Deliberation closed (if it was opened)
- Results finalized

### Generate Link

**On the Share tab:**

1. **Public Results Title** — Appears at top of results page
2. **Show Rubric Breakdown** — Toggle to display criterion scores
3. **Link Expiry** — 1 Hour / 24 Hours / 7 Days / Never
4. Click **"Generate Live Results Link"**
5. Copy and share the URL

The link looks like `https://app.qritiko.com/s/your-school?token=…`. Anyone with it sees the
results page directly. If you **Revoke** it, or it expires, the link shows "Link Unavailable".

> Note: while a link is live, a "● LIVE RESULTS" card also appears on your school's landing
> page for anyone who visits it. Revoke the link when you want results off the public page.

### What the Public Sees

- Results are split by department — Elementary, Middle School, High School each have their own section
- Each department shows a Podium (top 3) and full ranked table
- Award badges if assigned
- Optional rubric breakdown if enabled
- Judge names are never shown

### Revoke Link

Click **"Revoke Link"** to expire the URL immediately.

---

## IT Diagnostics

**PIN:** your school's 4-digit PIN (defaults to `0000` — change it before the event). The same PIN guards Reset All Data and judge device transfers.

1. Go to **IT Logs tab**
2. Click **"Unlock"** and enter PIN
3. Terminal shows detailed event logs with timestamp, level, module, event, detail, payload

**Common Events:**
- `JUDGE_REGISTERED` — New judge signed in
- `SCORE_SUBMITTED` — Score recorded
- `PROJECT_ADDED/REMOVED` — Project management
- `MAX_JUDGES_UPDATED` — Department max judges changed
- `FULL_RESET` — All data cleared

---

## Technical Considerations

### Offline Mode

- Judges can score offline if internet drops
- Scores sync automatically when connection returns

### Multiple Devices

- Admin can open dashboard on multiple screens (live updates across all)
- Judges can only be logged in on one device at a time

### Browser Compatibility

- Works on tablets, phones, laptops
- Chrome, Safari, Firefox, Edge
- PWA installable (can install like app on home screen)

---

## Workflow Summary

### Pre-Event
1. Set max judges per department (Elementary, Middle School, High School)
2. Add all projects — assign each to the correct department
3. Prepare judge credentials (names, department assignment, invite code)

### During Event
1. Judges register — they select their department at sign-in
2. Each judge scores only the projects in their department
3. Monitor progress on Overview tab (per department)
4. Lock judging when deadline passed

### Post-Scoring
1. Judges validate their results
2. Admin validates
3. Review any flagged concerns
4. Open deliberation if ties exist
5. Finalize results
6. Generate share link — public page shows results split by department
7. Share with community

---

## Common Admin Tasks

**Q: Can two judges have the same name in different departments?**
A: Yes. Judge1 can exist in Elementary AND Middle School simultaneously — they are separate registrations in separate departments.

**Q: A judge registered in the wrong department. What do I do?**
A: Use Reset All Data only if nothing has been scored yet. Otherwise, use Allow Transfer so the judge can re-register on a new device — but they will still be in the same department. To switch departments, the admin must remove that judge (Reset) and have them re-register in the correct one. Plan department assignments carefully before the event.

**Q: Can I add judges beyond 5 per department?**
A: Yes. Before any judge registers in that department, set its Max Judges higher (e.g., 10) on the Overview tab.

**Q: What if a department has no projects?**
A: Judges in that department will see an empty project list and cannot complete scoring. Always assign projects to departments before judging begins.

**Q: Can judges see projects from other departments?**
A: No. Each judge only sees and scores projects assigned to their department.

**Q: Can I enter results manually?**
A: Only via judges. Admin provides oversight and final award decisions, but scores must come from registered judges.

---

## Troubleshooting

### Scenario: Judge can't find their projects
- Check: Is the judge registered in the correct department?
- Check: Are projects assigned to that department in the Projects tab?
- Check: Did the judge select the right department at registration?

### Scenario: Judges can't register
- Check: Is that department's max judges already full?
- Check: Are they using the correct invite code?
- Check: Is their name already taken in that department?

### Scenario: Scores not showing up
- Check: Did judge complete all rubric fields and click Submit?
- Check: Is internet connection stable?
- Check: IT Logs for errors

### Scenario: Can't finalize results
- Check: Have ALL judges (across all departments) validated?
- Check: Has admin validated?
- Check: Is deliberation still open? Close it first.

---

## Summary

1. Set max judges per department + add projects (with department assigned) before judging
2. Judges select their department at registration — they only score projects in their dept
3. Monitor per-department progress on Overview tab
4. Validate, deliberate if needed, finalize results
5. Generate share link — public page splits results by department
6. Preserve activity log for audit trail
