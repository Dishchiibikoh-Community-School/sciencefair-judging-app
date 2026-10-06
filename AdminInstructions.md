# Admin Instructions — Science Fair Judging App

## Welcome to the Admin Dashboard

This guide covers everything an event organizer needs to know to run the digital judging platform smoothly, from pre-event setup through results publication.

---

## Admin Access

Your fair lives at its own address: **`https://qritiko.com/s/your-school`**. Everything below happens there — a plain `qritiko.com` is the platform homepage, not your fair.

**Login:** the **email and password** you chose when you registered the school (Supabase Auth). There is no shared admin password.

**To enter admin mode:**
1. Open your school's link
2. Click **"I'm an Admin"**
3. Enter your admin email and password
4. You'll see the full dashboard with tabs

Five failed attempts locks login for 30 seconds. Every failure is written to the IT log.

**Your Admin PIN** (separate from the password) guards the IT Logs tab, Reset All Data, and
judge device transfers. **You choose it when you register the school** — 4 to 8 digits.

- It is stored **encrypted (hashed)**. Nobody can read it back — not the app, not us, not
  anyone with database access. Write it down somewhere safe; it cannot be recovered, only
  replaced.
- Obvious PINs (0000, 1111, 1234) are rejected at sign-up.
- **5 wrong attempts locks PIN entry for 5 minutes** for your whole school. This is deliberate:
  it stops someone guessing a 4-digit PIN. If you lock yourself out, just wait it out.
- To change it: **Overview tab → Admin PIN card** → enter current PIN, new PIN, confirm.
  Change it before every event, and immediately if anyone who knew it has left.

> **Schools created before 2026-09-25** were given the default PIN `0000`, and that PIN was
> readable by anyone on the internet until the September security fix. If your school is one
> of those, change it now — treat the old PIN as public.

> **First time signing in?** If you just registered the school, confirm your email first. Departments and the default rubric finish setting themselves up automatically on your first successful admin sign-in.

---

> **In the app:** the **❓ Help & FAQ** tab (admin sidebar) has the same essentials — how the system
> works, a before-event checklist, do's and don'ts, and answers to common problems. It is kept up to
> date with every change to the system.

## Tab Overview

| Tab | Purpose |
|---|---|
| **Overview** | Stats, completion tracking, per-department leaderboards |
| **Setup** | Your departments, **judge grid**, project categories, project codes, **school year** and **school logo / poster** |
| **Judges** | Track judge registration and scoring progress, grouped by department |
| **Projects** | Add, edit, remove, or lock projects — each assigned to a department |
| **Registration** | Generate/deactivate student registration link; view all submitted registrations |
| **Activity** | Human-readable timeline of all system events |
| **Alerts** | Anomaly detection and system status |
| **Deliberation** | Validation workflow and award decisions |
| **Share** | Generate live results link (after results finalized) |
| **Score Export** | Per-judge CSV export and score backups |
| **Rubric** | Your rubric library — create, edit, rename, delete, set the default |
| **IT Logs** | Diagnostic terminal for troubleshooting (PIN-gated) |
| **Help & FAQ** | How the system works, checklist, do's and don'ts, troubleshooting |

---

## Pre-Event Checklist

Run through this a few days before, not on the morning of.

- [ ] **Check the app is awake.** Open `https://qritiko.com/s/your-school`. The free Supabase tier pauses a project after ~7 days with no traffic, and a paused project takes the whole app down. If anything fails to load, resume it from the Supabase dashboard and re-check.
- [ ] **Change the admin PIN** (Overview tab → Admin PIN card) if it has not been changed since the school was created.
- [ ] **Set up your departments** (Setup tab). A new school starts with Elementary / Middle School / High School — change them to whatever your fair uses, or press a preset. If the list is empty, sign out and back in; they re-seed on admin sign-in.
- [ ] **Check your project categories** (Setup tab) — rename, remove or add so they match your entry form.
- [ ] **Set up the judges** (Setup tab → Judges grid): tick the departments each judge number covers.
- [ ] **Check the school year** (Setup tab → School year) shows the right year, e.g. SY 2026-2027.
- [ ] **Upload your school logo** (Setup tab → School branding) — and your fair poster if you have one.
- [ ] **Enter every project/team**, each assigned to a department, with adviser and members.
- [ ] **Print the project list** (Projects tab) and check advisers/members appear.
- [ ] **Download Projects CSV** (Projects tab) — your own backup copy of every team. **⬆ Import projects** reads it back in if you ever need to restore.
- [ ] **Finish the rubrics** (Rubric tab) and **pick one for each department** (Setup) before the first judge signs in.
- [ ] **Do a dry run:** sign in as judge number 1 on a spare tablet, score one project, confirm it shows in Overview, then **Remove** that judge on the Judges tab.
- [ ] **Write down** the school link, invite code, and which judge number each judge gets (Overview → "Judge sign-in details" lists the numbers per department).
- [ ] **Save a score backup** (Score Export tab) at the halfway point on event day.

---

## Pre-Event Setup

### 1. Set up departments and categories (Setup tab)

Everything in this section lives on the **⚙️ Setup** tab. Do it before judges sign in.

#### Departments

A **department** is one judging pool. Judges sign in to a department and score every project in it. Results, ties and awards are worked out *inside* each department — projects in different departments never compete.

A new school starts with **Elementary / Middle School / High School**, but that is only a starting point. Your fair can use anything:

- **Add one** — type a name in the box at the bottom of the list and press **+ Add**.
- **Rename / change the code** — press ✏️ on the row, edit, press **Save**. Renaming is completely safe: projects, judges and scores stay attached.
- **Reorder** — the ↑ ↓ buttons. This controls the order of leaderboards and dropdowns.
- **Delete** — press 🗑. You will be asked to confirm.
- **Start from a preset** — one click adds a whole set:

| Preset | Departments |
|---|---|
| Elementary / Middle / High | Elementary · Middle School · High School |
| Grade bands (PreK–12) | PreK · K-2 · 3-5 · 6-8 · 9-12 |
| Grade bands + SPED | PreK · K-2 · 3-5 · 6-8 · 9-12 · SPED |
| PreK · K-5 · 6-8 · 9-12 · SPED | PreK · K-5 · 6-8 · 9-12 · SPED (K-5 as one elementary band) |
| One department | All Projects |

> A preset only **adds** the departments you don't already have — it never deletes. Remove the ones you don't want afterwards, one at a time.
>
> **Switching from K-2 + 3-5 to K-5?** Applying *PreK · K-5 · 6-8 · 9-12 · SPED* on top of the grade-band
> presets adds only **K-5**. Move any K-2 / 3-5 projects to K-5 (Projects tab → edit → Department), then
> delete K-2 and 3-5 — the app will not delete a department that still has projects or judges. Then check
> **Judge numbers** and each department's **rubric** in Setup: a new department gets judge numbers only if
> they fit under the maximum, and uses the default rubric until you pick one.

> **⚠️ You cannot delete a department that still has projects or judges in it.** The app blocks it and tells you how many there are. This is deliberate: deleting it would leave those projects unassigned, and an unassigned project is scored by nobody. Move them first (Projects tab → edit a project → Department), then delete.

#### Which rubric — or comments only?

Each department row has a **how it is judged** dropdown with three groups:

- **Your rubrics** — every rubric in your library (the default is marked).
- **Add from a preset** — the built-in rubrics you have not added yet (e.g. *Cibecue / ISEF-style — 100
  points*, *Detailed form — 20 items*). Picking one **adds it to your rubrics and assigns it** in one step;
  after that it is listed under *Your rubrics* and can be edited in the Rubric tab.
- **Comments only (not scored)**.

| Choice | What judges see | What happens to results |
|---|---|---|
| **A rubric** (e.g. *Upper grades 100-point*) | That rubric — each department can use a different one | Totals, averages, ranking, ties, 1st/2nd/3rd, out of that rubric's points |
| **Comments only** | A commendation to pick (or type) plus an optional comment | Nothing is scored or ranked. Every project is listed as a winner |

Use **Comments only** for the grades you don't want to rank — PreK and K-2 at the 2026-27 fair.
Those departments never appear in a leaderboard, never trigger a tie or an outlier alert, and on
the public results page they appear under *"Everyone is a winner"* with the commendations they were
given, with no rank, no score and no medal.

The commendations judges can pick from are: Great Scientific Thinking · Creative Idea · Excellent
Teamwork · Wonderful Presentation · Careful Observer · Asked Great Questions · Terrific Effort —
and a judge can always type their own instead.

> **⚠️ Set this before judging starts.** Once a department has scores the app refuses to change its
> mode, because those scores would stop counting but stay in the database.

#### Judges — the judge grid (Setup tab)

Every judge gets **one number for the whole school**. The **Judges** card is a grid: one row per judge
number, one column per department. **Tick the departments each number judges** and press
**Save judges**.

```
            PreK   K-5   6-8   9-12  SPED   Projects
Judge 1      ☑     ☑     ☐     ☐     ☐        10
Judge 2      ☑     ☐     ☐     ☐     ☑         5
Judge 5      ☑     ☐     ☐     ☐     ☐         2
```

- **Any pattern works:** a department can use numbers 1, 2, 5, 8 — not just a block — and one judge
  can cover several departments (tick them all). Judges type only their number and the invite code;
  the sign-in screen shows their department(s), e.g. *"✓ Judge 2 · PreK + SPED"*.
- **Name (private):** an optional note of who has each number (*"Ms. Rabah"*). Only your school's
  admins can see it — never judges, never the public.
- **Projects** column: how many projects each judge will score (≈ = estimate until you save). Aim for
  no more than ~20 (about 5 minutes per scored project).
- **Maximum judges** (above the grid): 15 by default, up to 90. The grid shows numbers up to it; to
  lower it, untick the higher numbers first.
- Warnings: a department with projects but **nobody ticked**; a department that needs more judges than
  are ticked.
- **After judges sign in** you can tick MORE departments for them (their list updates). Unticking a
  signed-in judge's department is refused — remove that judge on the Judges tab first.
- Each department row above shows its numbers and whether they are shared (*"Judges 1–3 · shared
  with K-5"*); click it to jump to the grid.

#### Judges per project (big departments)

By default **every judge scores every project** in their department. For a big department (e.g. 6-8
with 31 projects) choose **"3 judges per project"** under its column in the grid:

- Each project is scored by **3 different judges**, and the app **shares the projects out evenly**
  (with 6 judges, about 16 each instead of 31). Judges see only the projects assigned to them.
- A **project added later** gets its 3 judges automatically — nobody else's list changes.
- **Locked once the department has scores** (same as its rubric).
- Every project in the department is still ranked on the same rubric; the Alerts tab still flags a
  judge far from a project's average.

**Event day — a judge did not come:** Judges tab → the department's **Panels** card shows how many
judges have signed in and who has not. Press **⚖ Rebalance**: their **unscored** projects move to the
judges who are there. Scored work never moves. If too few judges are present, the card says how many
projects are still short.

**Old style — numbers restart in each department.** Choose *"Numbers restart in each department"*
above the grid if you really want it: each department then has its own Judge1, Judge2…, judges pick
their department when signing in, and each department row gets a **Max judges** box. Not
recommended: "Judge1" then means several people, and "judges per project" does not apply.

#### Project codes (e.g. PK-LS-001)

Every project gets a **code** built from its department's code, its category's code and its number:
**PK-LS-001** = PreK · Life Science · project 001. Judges see it on their list and scoring form, and it
appears on the public results, the project-list PDF and every CSV (a **Code** column).

- **The parts** come from the **Code** of each department and category (✏️ on their rows). Change one and
  every project follows immediately — codes are worked out live, never stored, so they cannot go stale.
- **Your own format:** Setup → **Project codes**. Combine `{DEPT}`, `{CAT}`, `{NUM}` and `{GRADE}` with
  your own text (letters, numbers, spaces, `- _ . / #`), e.g. `SF26/{DEPT}/{NUM}` → `SF26/PK/001`. The
  examples underneath update as you type. `{NUM}` is required — it is what keeps codes unique.
  **Reset** restores `{DEPT}-{CAT}-{NUM}`.
- A project without a department (e.g. from student registration) shows the code without that part
  (`LS-007`) until you assign one.
- If two projects end up with the **same code** (same number in the same department and category),
  the card warns you — give one of them a new number.
- Printed labels do not update themselves: settle the format and codes before printing.

#### Project categories

The subject areas students pick from. **These belong to your school alone** — no other school on the platform sees or shares your list.

The six built-in ones match the 2026-27 participation form, but you can replace all of them. A robotics fair might use *Autonomous*, *Remote-Operated* and *Innovation & Design* instead.

- **Add / rename / reorder / delete** — exactly like departments.
- **Code** — a short tag used in student registration numbers (`JHS-LS-001`). Leave it blank and the app builds one from the name.
- **↺ Restore built-in categories** — adds back any of the original six that are missing. It never removes your own.

> **Deleting or renaming a category never changes existing projects.** A project keeps the category text it was saved with; only the choice disappears from the dropdowns. When you edit such a project it shows the old value as *"(old category)"* so you can pick a new one.

> The 📷 form scanner reads your current category list automatically — there is nothing to keep in sync.

#### School year (e.g. SY 2026-2027)

**Setup → School year → ✏️ Change**, type the year (e.g. `2026-2027` — "SY" is added for you), **Save**.

- Shown on the student registration form (heading and the success message), the admin dashboard, and the
  **default title** of your public results ("Science Fair SY 2026-2027 — Final Results").
- **Leave it empty** to follow the calendar automatically: a new school year starts in **August**.
- A results link you already created keeps the title it was made with. To change it, edit the title on the
  Share tab and generate a new link.
- The registration **confirmation email** still says SY 2025-2026 — it will be updated separately.

#### School branding — logo and fair poster

**Setup → School branding.** Your logo replaces the school initials on every page visitors see; the poster is optional decoration.

| | Logo | Fair poster (optional) |
|---|---|---|
| Shown on | Landing page, student registration form, public results, public project list, printed project list, registration confirmation email | Landing page (**below** the Judge / Admin buttons), registration form, public results |
| Never on | — | Judges' project list and scoring screens |
| File | PNG, JPG or WebP. Square works best; transparent background is fine | PNG, JPG or WebP, any shape — never cropped or stretched |
| Size | Shrunk in your browser to 512 px before upload | Shrunk to 1600 px |
| Required | — | A short **description** (read aloud by screen readers instead of the picture — include any date/place on the poster) |

- **Upload / Replace:** pick the image → check the preview → **✓ Save**. Nothing is uploaded until you press Save. When you replace an image, the old one is deleted after the new one is saved.
- **Remove:** asks first, then takes it off every page. It cannot be undone — you would upload the image again.
- **Edit description:** changes the poster's description without re-uploading it.
- **No logo?** Visitors see a circle with your school's initials — never another school's logo.
- **"NOT saved"** means nothing changed: your old logo/poster is still showing. Sign in again on your school's own address and press Save again.
- Not accepted: iPhone **HEIC** photos (take a screenshot or export as JPG), **SVG** files, images smaller than 48 px (logo) / 300 px (poster).
- The browser-tab icon and the installed-app icon are the **Qritiko** mark for every school: one address serves every school, so it cannot be one school's logo.

### ⚠️ Order matters: add ALL projects BEFORE judges sign in

A judge's project list is built when they sign in. The app now pushes newly added
projects out to judges who have already registered — but the safest sequence is still:

1. Set the judge numbers (Setup tab)
2. Enter **every** project/team
3. *Then* hand out each judge's number + the invite code

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
   - **Category** — Life Science · Earth & Environmental Science · Chemistry & Material Science · Physics, Math & Astronomy · Engineering, Robotics & Technology · Energy, Sustainability & Design
   - **Grade** — Student grade level (e.g., 4, 6, 9, 11)
   - **Number** — Auto-generated, can edit (e.g., 001, 002, 003)
3. Fill in **Teacher / Adviser**, **Room**, each **Student** with their grade (tap **+ Add student** for more), and the two short answers from the form
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
| Category | One of the six categories on the participation form |
| Grade | Drives the abstract rule — grades below 5 skip the Abstract criterion and are scored out of 36 |
| Number | Auto-filled; edit if you use your own numbering |
| Teacher / Adviser | Teacher/coach — optional but appears on the project list |
| Room | Where the project is — shown to judges and on the project list |
| Students | One row per student, name + grade. Leave the project **Grade** blank and it uses the highest student grade |
| What they plan to investigate | From the form — shown to judges on the scoring screen |
| Why they chose it | From the form — admin only |

You do **not** need to generate a registration link at all this year. Leave it deactivated.

#### 📷 Scan paper participation forms (fastest way)

Instead of typing each team, photograph the **Student Participation Forms** and let the app read them.

1. **Projects tab → 📷 Scan forms**
2. **📁 Choose photos / PDFs** (pick many at once) or **📸 Take photo** on a tablet
   - One form per photo works best. Flat, well-lit, whole page in frame.
   - Scanned PDFs work too (up to ~3 MB — split bigger ones).
3. Each form becomes a **card** next to its photo. Check every card against the photo:
   - **Amber boxes** = the AI wasn't sure (messy handwriting). Fix them; the colour goes away when you edit.
   - **Red message** = must be fixed before saving (missing title, department, category or student).
     If the student ticked *Not sure yet*, you must choose a category.
   - **Amber message** = a warning, e.g. *possible duplicate of project #012* or *doesn't look like a
     participation form*. Save only if it is really a new project.
4. Press **✓ Save project** on a card, or **Save all ready** to save every card with no warnings.
   Cards with warnings must be saved one by one.
5. If a form can't be read: **↻ Retry**, or **✍️ Enter manually** and type it in from the photo.
6. Press **Done** when finished. Unsaved cards are discarded (it asks first).

**Privacy:** photos are sent to Google Gemini to be read and are **not stored** anywhere — not in
the app, not in the database. Only what you save becomes a project. Keep the paper forms as the
original record.

**If scanning shows an error** (for example *"Form scanning is not set up yet"* or *"API key was
rejected"*), it is a setup problem, not your photo — tell your technical contact. You can always
add projects with **+ Add Project** instead.

**Tips:**
- Assign every project to a department before judging begins
- Projects without a department assigned will not appear in any judge's list
- Use consistent numbering per department (e.g., Elementary: 001–020, Middle: 021–040)

### 3. Prepare Judge Credentials

- **Judge numbers:** one list for the whole school, set in the Setup → Judges grid
  - Example: tick Judge 1–2 under PreK, Judge 3–4 under K-2, and Judge 2 under SPED too if they cover both
  - Give each judge their number. They do not need to know their department — the app shows it to them
- **Invite code:** shown at the top of your admin Overview tab — in the "Get started" card before any judge signs in, then in the "Judge sign-in details" card (it stays visible for the whole event). Judges type this to sign in.
  It is checked on the server, so a wrong code now returns a clear error — and 5 wrong attempts
  lock sign-in for 5 minutes across the school.
- **Department:** follows from the number. (Only if you switched to per-department numbering must you tell each judge which department to tap.)

---

## During Judging

### Overview Tab — Live Scorecard

**Per-department stats:**

Each department shows its own section with:
- **Judge count** — registered vs max for that department (e.g., 3/5)
- **Judge numbers** — set on the Setup tab
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

**Panels** (departments set to "N judges per project"): one card per department showing how many
judges have signed in, who has not, and how many projects are short of judges. **Show assignments**
lists every project with its judge numbers (✓ = already scored). **⚖ Rebalance** moves unscored work
from judges who have not signed in to those who have.

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
4. Enter your **Admin PIN** to authorize transfer
5. Approval stays active briefly (about 10 minutes, one-time use)
6. Judge signs in on the new device with the same judge number + invite code

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
| Elementary | `Elem` | Life Science | `LS` |
| Junior High School | `JHS` | Earth & Environmental Science | `EES` |
| Senior High School | `SHS` | Chemistry & Material Science | `CMS` |
| | | Physics, Math & Astronomy | `PMA` |
| | | Engineering, Robotics & Technology | `ERT` |
| | | Energy, Sustainability & Design | `ESD` |

Example: `JHS-PMA-003` = 3rd Junior High School Physics, Math & Astronomy entry

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

### Your data is saved immediately — and kept

Projects and scores are written to the online database the moment you press Save / a judge presses
Submit. Updates to the app never erase data. What *does* remove data: deleting a project (its scores go
with it — lock it instead), and Reset All Data (keeps projects, departments and the rubric).

### Rubrics: a library, one per department

Your school can have **several rubrics**, and **each department uses one** (Setup → Departments →
the dropdown on its row), or is comment-only. Judges automatically get the rubric of the department
each project belongs to.

**Rubric tab:**
- The selector at the top chooses which rubric you are looking at; everything below (presets, Edit
  Rubric, the impact warning) acts on that one.
- **＋ New rubric** — name it, then start **blank** (write your own criteria), from a **preset**, or
  as a **copy** of the one on screen.
- **✏️ Rename**, **★ Make default** (the rubric departments use until you pick another), **🗑 Delete**
  (only for a rubric no department uses and that is not the default).
- "Used by: …" shows which departments use the rubric on screen.

**Rules that protect your results:**
- Once a department **has scores**, its rubric (and comment-only setting) **cannot change** — those
  scores would suddenly count against different criteria. Remove the scores first (Reset All Data,
  or remove the judges who gave them).
- The default can't be switched while a department that follows it has scores — pick that
  department's rubric explicitly first, then change the default.

### The built-in presets

Three are built in; use them for a new rubric or to replace the criteria of the one on screen.

| Preset | Shape | Score range |
|---|---|---|
| **Northeast AZ Regional** | 10 criteria, 0–6 points each. Grades below 5 skip Abstract (so they are judged out of 36). Grades 5+ may not be given a 0. | 0–42 |
| **Cibecue / ISEF-style** | 5 sections, each rated Needs improvement · Fair · Good · Very Good · Excellent, weighted: Project Title 15, Scientific Inquiry 25, Data and Conclusion 20, Presentation 20, Further Research 20. | 20–100 |
| **Detailed form — 20 items** | Every item on the judging form rated 1–5 (Needs improvement → Excellent), grouped under five headings: Project Title (5 items), Scientific Inquiry (4), Data and Conclusion (4), Presentation (5), Further Research (2). | 20–100 |

On the 100-point rubric judges tap the **rating word**, not a number — the section's points appear
underneath. The detailed sub-points from the paper form are listed under each section heading, so a
judge reads all of them and then gives one rating for the section.

**Why the lowest score is 20, not 0:** the paper scale starts at 1 (Needs improvement), so there is
no zero to give. Five sections at the lowest rating = 20/100. That is correct, not a bug.

Either preset can be edited afterwards (Edit Rubric). Max Points goes up to 100 per criterion. If
you change a section's step values the rating words are dropped and judges see point numbers
instead — re-apply the preset to get the words back.

### Changing a rubric

Totals are always calculated with the **current** version of each department's rubric — editing a
rubric changes the totals of every department that uses it. Renaming or rewording a criterion is safe.
Removing one, adding one, or changing its points changes every total and ranking — once scores exist,
the app shows exactly what will change, offers to save a score backup first, and asks you to confirm.
If a save fails you will see **Rubric NOT saved** and your edits stay on screen. Best practice: finish
the rubric before judging starts.

### Backups

At the halfway point and at the end: **Score Export → 💾 Save Score Backup** (includes the rubric),
**⬇ Download Judge Scores CSV**, and **Projects → ⬇ Download Projects CSV**. Keep the files somewhere
safe and private — they contain student names.

### Restoring projects / copying them to a new school

**Projects tab → ⬆ Import projects (CSV)** reads the file that *⬇ Download Projects CSV* makes.

1. Download the projects CSV (from this school, or from the old one).
2. Optional: edit it in Excel. Save it as **CSV UTF-8 (Comma delimited)** — Import does not read `.xlsx`.
3. Projects tab → **⬆ Import projects (CSV)** → choose the file.
4. Check the review table. Nothing is saved yet.
   - **Duplicates** (a project with the same title already exists, or appears twice in the file) start **unticked**.
   - A **department name this school does not have** (e.g. the file says *Middle School*, this school calls it *6-8*) appears once at the top with a dropdown — pick the right department and every row follows.
   - A category that is not in your list is kept as written; a project number already in use gets the next free one.
5. Press **⬆ Import N projects**. Each project is created exactly like **+ Add Project**: student names go to the private table and judges already signed in to that department get it.

**What is imported:** number, title, department, category, grade, room, teacher/adviser, students with
grades, and the two description answers. **Grades:** `PreK`, `K` or `1`–`12`. For a group with different
grades leave Grade empty and write each student as `Name (Gr 8)` — the project takes the highest grade. **Not imported:** Locked, Reviews and Avg Score — scores and
judges belong to an event, not to the project list.

If some rows say **NOT saved**, nothing was half-written; press Import again to retry just those rows.

### Reset All Data

**CAUTION — This is permanent:**

1. Go to **IT Logs tab** (enter your Admin PIN)
2. Click **"Reset All Data"**
3. Enter your Admin PIN and confirm

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

The link looks like `https://qritiko.com/s/your-school?token=…`. Anyone with it sees the
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

**PIN:** your school's Admin PIN, chosen when the school was registered (change it on the Overview tab). The same PIN guards Reset All Data and judge device transfers. Five wrong attempts locks PIN entry for 5 minutes.

1. Go to **IT Logs tab**
2. Click **"Unlock"** and enter PIN
3. Terminal shows detailed event logs with timestamp, level, module, event, detail, payload

**Common Events:**
- `JUDGE_REGISTERED` — New judge signed in
- `SCORE_SUBMITTED` — Score recorded
- `PROJECT_ADDED/REMOVED` — Project management
- `MAX_JUDGES_UPDATED` — Department max judges changed
- `FULL_RESET` — All data cleared

**Problems to watch for** (added 2026-10-06):
- `*_FAILED` (e.g. `FINALIZE_FAILED`, `DECISION_SAVE_FAILED`, `VALIDATION_SAVE_FAILED`, `DELIB_NOTE_FAILED`) — a save did not reach the database. The person saw a red **"NOT saved"** message and nothing changed; they just retry.
- `OFFLINE_SYNC_FAILED` — a judge's queued scores were rejected by the server when they came back online. Shows the alias, how many scores, the error code and how long the oldest has waited. The scores stay on the judge's device.
- `SCORE_QUEUED` — now records whether the device was simply **offline** or the **server refused** the score (`reason`).
- `REALTIME_DOWN` / `REALTIME_RECONNECTED` — the live-update connection dropped / came back. While down, dashboards do not update by themselves; refresh the page.
- `CLIENT_ERROR` — the app crashed or hit an unexpected error on some device (judge tablets included). Includes screen width and browser. Each distinct error is logged once per session, at most 20.
- `INIT_TIMEOUT` / `LOAD_FAILED` — the school's data took over 8 seconds or failed to load.

Logs never contain student names or form text.

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

**Q: Can two judges have the same number?**
A: No (with one list for the whole school, the default). Each number belongs to one person. Only if you switch to "numbers restart in each department" can Judge1 exist in several departments.

**Q: A judge signed in with the wrong number / someone signed in who should not have.**
A: Judges tab → **Remove** on that judge → enter your Admin PIN. Their number is freed and they can sign in again with the right one. Removing **permanently deletes that judge's scores, notes and validation** — the dialog tells you how many — so fix it before they score. No Reset All Data needed.

**Q: Can I add more judges to a department?**
A: Yes. Setup → Judges → tick more judge numbers under that department → **Save judges**. Nobody else's number changes. If the grid has no free numbers left, raise **Maximum judges** first (up to 90).

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

### Scenario: A red "NOT saved" / "NOT finalized" message
- The change did not reach the database, and nothing changed — what you see is the real state
- Check: internet connection; sign out and back in if your session may have expired
- Then press the same button again. IT Logs shows the matching `*_FAILED` event with the error code

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
