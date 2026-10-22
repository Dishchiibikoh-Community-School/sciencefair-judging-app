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
| **Activity Log** | Human-readable timeline of all system events |
| **Alerts** | Event health: connection, errors, scores stuck on devices, coverage, progress per department, idle judges, score outliers |
| **Validation** | Judges' and your own validation, deliberation, award decisions, Finalize |
| **Awards** | 1st / 2nd / 3rd per award group, worked out from the scores — confirm them, see ties, print the awards list |
| **Share** | Generate live results link (after results finalized) |
| **Score Export** | Per-judge CSV export and score backups |
| **Registration** | Student registration link and submissions (not used in 2026-27) |
| **Rubric** | Your rubric library — create, edit, rename, delete, set the default |
| **IT Logs** | Diagnostic terminal for troubleshooting (PIN-gated) |
| **Help & FAQ** | How the system works, checklist, do's and don'ts, troubleshooting |

At the bottom of the sidebar: **🔓 Lock Judging**, **Exit**, **Sign Out** and **⚠️ Reset All Data**.

---

## Pre-Event Checklist

Run through this a few days before, not on the morning of.

- [ ] **Check the app is awake.** Open `https://qritiko.com/s/your-school`. The free Supabase tier pauses a project after ~7 days with no traffic, and a paused project takes the whole app down. If anything fails to load, resume it from the Supabase dashboard and re-check.
- [ ] **Change the admin PIN** (Overview tab → Admin PIN card) if it has not been changed since the school was created.
- [ ] **Set up your departments** (Setup tab). A new school starts with Elementary / Middle School / High School — change them to whatever your fair uses, or press a preset. If the list is empty, sign out and back in; they re-seed on admin sign-in.
- [ ] **Check your project categories** (Setup tab) — rename, remove or add so they match your entry form.
      ⚠️ Do this **before** you add projects. Renaming a category later does **not** move the projects
      already saved under the old name — see "Renaming a category" below.
- [ ] **Set up the judges** (Setup tab → Judges grid): tick the departments each judge number covers.
      **Or**, with a timed schedule: Setup → **📅 Judging schedule** → import it (the grid fills itself),
      import the booth numbers, and print the judge sheets and booth visit times.
- [ ] **Check the school year** (Setup tab → School year) shows the right year, e.g. SY 2026-2027.
- [ ] **Upload your school logo** (Setup tab → School branding) — and your fair poster if you have one.
- [ ] **Enter every project/team**, each assigned to a department, with adviser and members.
- [ ] **Print the project list** (Projects tab) and check advisers/members appear.
- [ ] **Download Projects CSV** (Projects tab) — your own backup copy of every team. **⬆ Import projects** reads it back in if you ever need to restore.
- [ ] **Finish the rubrics** (Rubric tab) and **pick one for each department** (Setup) before the first judge signs in.
- [ ] **Decide how places are awarded** (Setup → each department → *Places: per department / per category*).
- [ ] **Do a dry run:** sign in as judge number 1 on a spare tablet, score one project, confirm it shows in Overview, then **Remove** that judge on the Judges tab.
- [ ] **Write down** the school link, invite code, and which judge number each judge gets (Overview → "Judge sign-in details" lists the numbers per department).
- [ ] **Plan your backups** — see [Event-day backup plan](#event-day-backup-plan). The day before: download the Projects CSV and print the project list.

---

## Pre-Event Setup

### 1. Set up departments and categories (Setup tab)

Everything in this section lives on the **⚙️ Setup** tab. Do it before judges sign in.

#### Departments

A **department** is one judging pool. Each judge number covers one or more departments (the judge grid, below), and its judges score that department's projects — all of them, or an even share when you choose "N judges per project". Results, ties and awards are worked out *inside* each department — projects in different departments never compete.

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

#### Places: per department or per category

Each scored department has a second dropdown, **Places: per department** (default) or **Places: per
category**. It decides who competes for 1st, 2nd and 3rd:

- **Per department** — every project in the department competes together: one 1st, 2nd, 3rd.
- **Per category** — each category inside that department has its own 1st, 2nd, 3rd (e.g. *6-8 · Life
  Science*, *6-8 · Chemistry & Material Science*). The public results show the department split into its
  categories.

Choose per category only where each category has several projects — a category with a single project
would get an uncontested 1st. You can change it at any time; groups you already confirmed on the Awards
tab will then say *Scores changed since you confirmed* so you can re-confirm.

#### Which rubric — or comments only?

Each department row has a **how it is judged** dropdown with three groups:

- **Your rubrics** — every rubric in your library (the default is marked).
- **Add from a preset** — the built-in rubrics you have not added yet, including the three **2026-27
  evaluation forms** (see *The 2026-27 evaluation forms* below) and e.g. *Cibecue / ISEF-style — 100
  points*, *Detailed form — 20 items*). Picking one **adds it to your rubrics and assigns it** in one step;
  after that it is listed under *Your rubrics* and can be edited in the Rubric tab.
- **Comments only (not scored)**.

| Choice | What judges see | What happens to results |
|---|---|---|
| **A rubric** (e.g. *Upper grades 100-point*) | That rubric — each department can use a different one | Totals, averages, ranking, ties, 1st/2nd/3rd, out of that rubric's points |
| **Comments only** | A commendation to pick (or type) plus an optional comment | Nothing is scored or ranked. Every project is listed as a winner |

Use **Comments only** for grades you don't want to rank. (The 2026-27 fair first planned this for PreK and
K-2; since 2026-10-21 **PreK and SPED are scored on the PreK & SPED form** instead — see *The 2026-27
evaluation forms*.)
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
   - **Department** — one of your departments (Setup tab), e.g. 6-8
   - **Title** — Project name (e.g., "Solar Cell Efficiency Under Different Light Spectra")
   - **Category** — one of your school's categories (Setup tab)
   - **Grade** — PreK, K or 1–12 (or leave it blank to use the highest student grade)
   - **Number** — Auto-generated, can edit (e.g., 001, 002, 003)
3. Fill in **Teacher / Adviser**, **Room**, each **Student** with their grade (tap **+ Add student** for more), and the two short answers from the form
4. Click **"Add Project"**

**Important:** Judges only see projects in the departments their number covers (and, in a "N judges per project" department, only the ones assigned to them).

#### Registering teams yourself (2026-27 workflow)

When organisers enter the teams rather than students self-registering, the Projects tab is
your only data-entry path. Adviser and group members are stored **on the project**, so they
appear on the project rows and on the printed project list PDF.

| Field | Notes |
|---|---|
| Department | Required — a project with no department is scored by nobody |
| Title | The project name |
| Category | One of your school's categories (Setup tab) |
| Grade | PreK, K or 1–12. On the 42-point rubric, grades below 5 skip the Abstract criterion (scored out of 36); the 100-point rubrics have no such rule |
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
- Project numbers are unique across the whole school; the project code (e.g. G68-LS-014) already shows the department, so numbering straight through (001, 002, …) is fine

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

**Top cards:** **Judges signed in** (e.g. *3/15* — judges who have signed in / judge numbers in use;
a judge covering several departments counts once), Projects, Scores In, Completion.

**Per-department stats:**

Each department shows its own section with:
- **Judge count** — judges signed in vs judge numbers in that department (e.g., 3/5)
- **Judge numbers** — set on the Setup tab
- **Leaderboard** — real-time ranked list of projects in that department

| Leaderboard Column | What It Shows |
|---|---|
| **#** | Rank within department (by current average) |
| **Project** | Title — with 🥇🥈🥉 beside the projects currently holding 1st/2nd/3rd, and on the PreK & SPED form the child's ribbon (🎀 Gold / Silver / Bright Star Scientist) |
| **Category** | Subject area |
| **Avg** | Current average score, out of that department's rubric total (e.g. 100, or 20 on the PreK & SPED form) |
| **Reviews** | How many judges have scored it |

Unscored projects (no reviews yet) appear below a divider at reduced opacity. A **Comments only**
department shows a **Participants** list instead (commendations and review count, by project number —
never ranked).

### Judges Tab — Per-Judge Status

**Panels** (departments set to "N judges per project"): one card per department showing how many
judges have signed in, who has not, and how many projects are short of judges. **Show assignments**
lists every project with its judge numbers (✓ = already scored). **⚖ Rebalance** moves unscored work
from judges who have not signed in to those who have.

Judges are grouped by department with a section header for each. A judge who covers several
departments is listed under each one ("also K-5").

| Column | Meaning |
|---|---|
| **Alias** | The judge number they signed in with (e.g. Judge7) |
| **Department** | The department of this section, plus any others they cover |
| **Joined** | When they signed in |
| **Assigned** | How many projects they have to score |
| **Progress** | Bar + scored / assigned (e.g. 8/16) |
| **Status** | Not Started · In Progress · Complete |
| **Device / remove** | **Allow Transfer** (new device) and **Remove** (wrong sign-in) — both need the Admin PIN |

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
- If the box says **"The transfer was NOT approved"**, the approval could not be saved and the judge
  will still be refused — check the internet and press **Approve transfer** again

### Projects Tab — Project Management

**View all projects with:**
- Number, Title, Category, Grade, Department badge
- **Rubric Breakdown** — How judges are scoring this project (expandable card)
- **Actions:** Edit, Delete, Lock

**Edit a Project:**
1. Click **"Edit"** on the project's card
2. The page scrolls up to the form — its heading names the project, e.g. *Edit Project #046 —
   Local Cactus BioScaffold*. There is **one** form for Add and Edit and it sits at the **top** of
   the tab, above the list
3. Change title, category, grade, number, department, teacher, students, room or either answer
4. Click **"Save Changes"**

> **"Nothing happens when I press Edit."** Fixed 2026-10-21 — the page now scrolls to the form. On a
> device still running an older cached version the form opens *above* your scroll position, so it
> looks like the button did nothing. Reload the page (or close and reopen the installed app). Until
> then just scroll up to the top of the Projects tab — the form is open and waiting.

> **If the save fails** you get a red *"Not saved — …"* under the form. Nothing was written, the
> list goes back to what the database really holds, and your typing stays in the form so you can
> press **Save Changes** again. (Before 2026-10-06 a failed save closed the editor and said nothing.)

> **Moving a project that already has scores.** If the department you are moving it to is judged
> differently — a different rubric, or one of the two is **Comments only** — the move is refused and
> says why. Those scores were given under the old department's rubric, so they would be counted out
> of the wrong total, or hidden from the results entirely. Moving between departments judged the
> **same** way still works, so fixing a misfiled project mid-event is fine. If you really must move
> it, delete that project's scores first.

> **One click is enough.** While a project is saving the button reads *Saving…* and is disabled, so
> an impatient second tap cannot create a duplicate. (It used to create two projects sharing one
> number.)

> **Two admins at once.** Every project number is unique within your school. If another admin takes
> the number the form filled in for you a moment before you press **Add Project**, the app quietly
> uses the next free number instead. If you **typed** the number yourself and it is already taken,
> you get *"Project number 007 is already used by another project"* — nothing is saved and your
> typing stays in the form. Type another number, or clear the box to use the next free one.
> (Needs database migration 2026-10n — until it is run, two admins can still end up on one number.)

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

### Alerts Tab — Event Health

Keep this tab open on event day. It updates live and its times refresh every 30 seconds. The
banner at the top says how many things need attention.

- **Connection (this screen)** — whether *this* device is online and receiving live updates
  (*Live* / *Connecting…* / *Disconnected*). Disconnected means judges' scores will not appear
  until it reconnects — refresh the page if it stays that way. Also shows the judging lock and
  whether the results link is live.
- **Errors in the last hour** — how many, and which kinds. **Open IT Logs →** goes straight there.
- **⚠ Safety / rule concerns** (red, only when there is one) — a judge answered **Yes** to the
  elementary form's safety question. Shows the project code and title, which judge, when, and their
  comments. Notify the Science Fair Committee. It clears when that judge re-submits with **No**.
- **Scores stuck on a device** — judges whose tablet reports scores still waiting to sync, and for
  how long. *Server refusing* means the scores reach the server but are rejected: tell the judge
  **not** to sign out or clear the browser, and send the IT Logs report to your technical contact.
  Otherwise ask them to connect to Wi-Fi and press **Sync Now**. A tablet that is offline cannot
  report — it shows up here once it is back online but still cannot sync.
- **Coverage** — projects with **no department** (nobody will score them), departments with
  projects but **no judge signed in**, and departments where some projects have **fewer judges than
  "N judges per project"**.
- **Scoring progress by department** — scores done out of scores assigned, and how many projects
  have no review at all yet. Shows which room is behind.
- **Idle judges** — signed in, work left, nothing scored for 20 minutes or more.
- **Score outliers** — one card per project: its code, department, average, and **every** judge's
  total, with the far-off ones in red. When only two judges scored a project, both are always
  equally far from the average, so the card says the scores disagree rather than blaming either.

### Activity Log Tab — Audit Trail

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
- Student receives a **confirmation email** with their registration number (e.g. `Elem-LS-001`)
- Registration number format: `{Division}-{Category}-{NNN}`
- ⚠️ The new project has **no department yet**, so no judge will see it — give it one on the Projects tab.
  The form's divisions (Elementary / Junior High / Senior High) are not your Setup departments.

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

After a judge has scored every project assigned to them:
1. Judge sees a read-only ranked list of their projects
2. Two options:
   - **"Approve Results"** — scores look good
   - **"Flag a Concern"** — something seems off + optional comment

### Step 2: Admin Reviews Validations

**On the Validation tab:**
- See all judges' validation statuses across all departments
- Green = Approved, Amber = Concern, Gray = Pending
- Admin also validates themselves
- A judge's **concern blocks Finalize** until it is resolved: talk to the judge, who presses
  **Revise my validation** and approves — or, if they have left, press **Clear concern** next to
  their name (they go back to Pending; it is recorded in the activity log)

### Step 3: Consensus Check

Green banner appears when all completed judges have approved AND admin has approved.

### Step 4: Deliberation (Conditional)

Opens automatically on a tie, or admin can open manually. Admin assigns final awards per project.
A tie on the **PreK & SPED form** does not open it — tied children share the place (see *PreK & SPED:
ribbons and shared places*); open it manually if you want to break such a tie using the judge's comments.

### Step 5: Finalize Results

Finalize needs **all three**: you approved, deliberation is closed, and **no judge has an open
concern**. A judge who has not validated yet does *not* block it (so a judge who left early can
never stop the results). The box above the button says what is still missing.

1. Approve the results yourself
2. Resolve any concerns (see Step 2) and close deliberation if it was opened
3. Click **"Finalize Results"**
4. Share tab becomes enabled

---

## Awards (1st, 2nd, 3rd)

The **🏅 Awards** tab turns the scores into places without typing a single award.

1. Each **award group** — a department, or a category inside it (see *Places: per department or per
   category*) — is a card with its projects in order and the computed **🥇 1st / 🥈 2nd / 🥉 3rd**.
2. A group that is fully scored and has no tie is **ready**. Press **✓ Confirm all ready groups** to
   confirm every ready group in one go, or **✓ Confirm these places** on one card. It is saved in a
   single step; a red *NOT saved* message means nothing changed — check the connection and press again.
3. Cards that need you are listed **first**, and the menu shows how many (e.g. *Awards (2)*):

| Label | Meaning | What to do |
|---|---|---|
| **Not confirmed** | Nothing saved for this group yet | Check it, then Confirm |
| **N not scored yet** | Some projects in the group have no score | Wait for the judges (or confirm anyway if a project withdrew) |
| **Tie for 1st / 2nd / 3rd** | Two projects are level where it decides a place | Validation → Open Manually → read the judges' notes → give the awards there |
| **✓ Decided by hand** | You gave the places yourself (e.g. after a tie) | Nothing |
| **Scores changed since you confirmed** | A judge re-scored after you confirmed | **↻ Re-confirm from the scores**, or decide by hand |
| **✓ Confirmed** | Saved, and still what the scores say | Nothing |
| **Ties share the place** | PreK & SPED form — tied children share the place | Nothing (see *PreK & SPED: ribbons and shared places*) |

**What the public sees.** Once a group has confirmed places, the public podium and ranked table show
**your** places — that is how a tie you broke reaches the podium. Until then they show the places worked
out from the scores. **Clear confirmed places** puts a group back to the computed places.

**Which ties raise the amber "Tie detected" alert.** Only ties that decide a place: level for 1st, 2nd or
3rd, or across 3rd and 4th, inside one award group. A tie lower down decides nothing and no longer raises
it; a tie you have decided, and ties on the PreK & SPED form, never do.

**Honorable Mention and Best in Category** are still given in Validation → Deliberation, project by
project. Confirming places never touches them.

**The awards list.** **🖨 Print awards list** and **⬇ Awards CSV** give every group with its places, any
special award, every ribbon, the **student names and the teacher** — for the ceremony and the
certificates. Because of the names it is for you only: never post it or send it to families. Groups not
confirmed yet are marked *computed, not confirmed yet*.

**After Finalize** the Awards tab is read-only. Reopen the results in the Validation tab to change anything.

The **results CSV** (Share tab) now has an **Award group** column, and its **Rank** restarts in each group.

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

### The 2026-27 evaluation forms

These three match the paper forms exactly. **Setup → each department's dropdown → Add from a preset**:
**PreK and SPED → PreK & SPED Recognition**, **K-5 → Elementary form**, **6-8 and 9-12 → Middle & High
School form**. Do it before the first judge scores — a department's rubric locks once it has scores.
Switching a **Comments only** department to a form is allowed until it has scores.

| Form | What the judge does | Out of |
|---|---|---|
| **Middle & High School form (2026-27)** | Rates 20 items **1–5** under five headings: Project Overview & Purpose (3 items = 15), Scientific Inquiry & Method (5 = 25), Data & Conclusion (4 = 20), Presentation & Defense (4 = 20), Research, Collaboration & Compliance (4 = 20). One comment box: *Judge Comments & Constructive Feedback*. | 100 (lowest possible 20) |
| **Elementary form (2026-27)** | Rates 8 items **1–5** (= 40), then writes a **Strength**, a **Next step**, and answers **Safety / rule concern? No / Yes**. | 40 × 2.5 = **100** |
| **PreK & SPED Recognition (2026-27)** | Rates 4 criteria **1–5**: Curiosity · Hands-On Exploration · Sharing What They Learned · Effort and Teamwork. Each criterion says what 5, 3–4 and 1–2 look like. Optional comment. | **20** (lowest possible 4) |

**How the elementary form gets to 100.** The paper form says *"Committee use: total × 2.5 = score out
of 100"*. The app does that multiplication for you and shows it, so the 100 is never a mystery:

- each button shows the **rating** (1–5) with its **points** underneath — a 3 is worth 7.5 points
- the total shows the working, e.g. **Ratings 32 / 40 × 2.5 = 80 / 100**
- results, rankings and the minimum to place (if you set one) all work out of 100,
  exactly like middle and high school
- the judge-scores CSV has both columns: **Total** (out of 100) and **Ratings** (out of 40)

**The safety question.** When a judge answers **Yes**, a red card appears at the top of the **Alerts**
tab straight away — project code, title, which judge, and their comments — and the activity log
records it. Please also expect the judge to tell a committee member in person. The card clears when
that judge re-submits the project with **No**.

> These forms need the database update **2026-10o** for the comments and the safety question to be
> stored in their own fields. Without it nothing is lost — they are saved inside the judge's notes —
> but the Alerts card cannot appear, and IT Logs shows `SCORE_FEEDBACK_COLS_MISSING`.

**PreK & SPED: ribbons and shared places.** These follow the PreK & SPED rubric sheet, and apply to
that form only:

- **Every child gets a ribbon** from the total: **17–20 Gold Star Scientist · 13–16 Silver Star
  Scientist · 4–12 Bright Star Scientist**. It shows on the Overview leaderboard, the public results
  and the results CSV (*Ribbon* column). With more than one judge the *average* decides (16.5 = Silver).
- **1st, 2nd and 3rd go to the three highest totals in each department** — PreK and SPED place
  separately. With two PreK projects, PreK has a 1st and a 2nd only.
- **Ties share the place.** Places go to the highest, second-highest and third-highest *different*
  totals, so **18, 18, 15 → 1st, 1st, 2nd**. A tie on this form does **not** open deliberation. If you
  would rather break one yourself, read that judge's comments (Validation → Open Manually) and give the
  award there. A tie on any other form still raises the amber *Tie detected* alert as before.

### Other built-in presets

| Preset | Shape | Score range |
|---|---|---|
| **Northeast AZ Regional** | 10 criteria, 0–6 points each. Grades below 5 skip Abstract (so they are judged out of 36). Grades 5+ may not be given a 0. | 0–42 |
| **Cibecue / ISEF-style** | 5 sections, each rated Needs improvement · Fair · Good · Very Good · Excellent, weighted: Project Title 15, Scientific Inquiry 25, Data and Conclusion 20, Presentation 20, Further Research 20. | 20–100 |
| **Detailed form — 20 items** | An earlier version of the item-by-item form: 20 items rated 1–5 under Project Title (5 items), Scientific Inquiry (4), Data and Conclusion (4), Presentation (5), Further Research (2). | 20–100 |

On the Cibecue rubric judges tap the **rating word**, not a number — the section's points appear
underneath.

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

### Event-day backup plan

**Why bother:** the online database has **no undo and no restore**. If data is deleted by mistake,
or the database is unavailable, the only copies are the files *you* downloaded. **💾 Save Score
Backup** on its own is not enough: it is stored in the same database. Always press its **⬇ CSV**
as well, so a copy is on your computer.

| When | Do this | Where |
|---|---|---|
| **Day before** | ⬇ Download Projects CSV + 🖨 Export Project List PDF (print one copy) | Projects tab |
| **Day before** | Open your school link; if it does not load, wake the project in the Supabase dashboard | Browser |
| **Day before** | Print a few blank paper score sheets — if the app is down, judges score on paper and you enter it later | Your rubric |
| **Halfway through judging** | 💾 Save Score Backup → then **⬇ CSV** on that backup row; ⬇ Download Judge Scores CSV | Score Export tab |
| **Right after Lock Judging** | The same again: 💾 Save Score Backup + ⬇ CSV, ⬇ Download Judge Scores CSV | Score Export tab |
| **After Finalize** | ⬇ Download Results CSV, and ⬇ Download Projects CSV once more | Share tab, Projects tab |

**Where to keep the files:** on a school computer or school drive that only fair staff can open.
They contain **student names** — not on a personal phone, not in a shared or public folder, never
emailed outside the staff. Give each file a date in its name.

**What each file can bring back:**
- **Projects CSV** — can be re-imported (Projects → ⬆ Import projects) into this or a new school.
- **Judge Scores CSV / backup CSV** — every judge's score per criterion. It cannot be imported back
  automatically; it is the record you would decide awards from by hand if the app were unavailable.
- **Results CSV** — the final ranking per department, for your records.

If a judge's tablet loses internet, nothing needs backing up: scores wait on the tablet and send
themselves when it reconnects (the judge must not sign out or clear the browser meanwhile).

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
- The judging lock, deliberation and Finalize go back to off
- Every judge's device is signed out the next time it opens the app — judges sign in again with the same numbers

**What is NOT reset:**
- Projects (and student names)
- Departments, the judge grid, categories, rubrics, school year, logo and poster
- Registrations
- Activity log (security audit trail is permanent)

### Lock Judging

1. In the **sidebar** (bottom), click **🔓 Lock Judging**
2. It turns into **🔒 Unlock Judging** — judges can no longer submit scores
3. Affects all departments at once. Click again to unlock
4. If it says **"⚠ Lock failed — retry"**, judges are NOT locked yet — check the internet and click again

---

## Share Results

### Prerequisites

- All scoring complete
- You approved, and no judge has an open concern
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

- Results are split by department — each of your departments has its own section
- Each scored department shows a Podium (top 3) and full ranked table
- A **Comments only** department is listed under *"Everyone is a winner"* with its commendations — no rank, no score
- A department on the **PreK & SPED** form is ranked, says *"Every child earns a ribbon"*, shows each child's
  ribbon, and puts tied children on the same podium step
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
4. Filter by level (ERROR / WARN / …) and by time (**last hour**, **last 2 hours**, **last 24
   hours**, everything loaded). **📋 Copy Full Report** copies exactly what you are looking at —
   pick "last 2 hours" when reporting something that just happened

**What every entry records** (2026-10-07): at the end of its payload, `ctx` says which **build**
of the app that device was running, a **session** id (one per page load — follow one tablet's events
in order), the **role** (admin / judge / visitor) and judge number, whether it was **online**, and
whether it was the **installed app**. The report header adds your school's address and this
screen's build. The results-link token is hidden in reports and snapshots.

**The IT log is permanent** — there is no Clear button (the old one only hid the entries until the
next refresh). The tab loads the newest 1,000 entries and says so when it hits that limit.

**Entries written while a tablet was offline** are kept on the tablet and sent when it reconnects,
with their original time (`ctx.delayed: true`).

**Common Events:**
- `JUDGE_REGISTERED` — New judge signed in
- `SCORE_SUBMITTED` — Score recorded
- `PROJECT_ADDED/REMOVED` — Project management
- `JUDGE_ROSTER_SAVED` — Judge grid saved (Setup → Judges)
- `JUDGE_REMOVED` / `JUDGE_TRANSFER_APPROVED` — Judges tab actions
- `FULL_RESET` — All data cleared

**Problems to watch for** (added 2026-10-06):
- `*_FAILED` (e.g. `FINALIZE_FAILED`, `DECISION_SAVE_FAILED`, `VALIDATION_SAVE_FAILED`, `DELIB_NOTE_FAILED`) — a save did not reach the database. The person saw a red **"NOT saved"** message and nothing changed; they just retry.
- `OFFLINE_SYNC_FAILED` — a judge's queued scores were rejected by the server when they came back online. Shows the alias, how many scores, the error code and how long the oldest has waited. The scores stay on the judge's device.
- `SCORE_QUEUED` — now records whether the device was simply **offline** or the **server refused** the score (`reason`).
- `REALTIME_DOWN` / `REALTIME_RECONNECTED` — the live-update connection was down for **over 30 seconds while the screen was in use** / came back (with how long it was down). Brief drops and phones with a locked screen are no longer logged — they used to fill the log. While down, dashboards do not update by themselves; refresh the page.
- `SCHEDULE_IMPORTED` / `SCHEDULE_CLEARED` / `SCHEDULE_SAVE_FAILED` / `BOOTHS_IMPORTED` — judging schedule and booth numbers.
- `SAFETY_CONCERN_RAISED` — a judge answered Yes to the safety question (the comment text is never logged).
- `SCORE_FEEDBACK_COLS_MISSING` — database update 2026-10o has not been run; elementary comments and safety answers are being saved inside notes instead. Tell your technical contact.
- `CLIENT_ERROR` — the app crashed or hit an unexpected error on some device (judge tablets included). Includes screen width and browser. Each distinct error is logged once per session, at most 20.
- `INIT_TIMEOUT` — the school's data took over 8 seconds to load.
- `LOAD_FAILED` — one kind of data could not be loaded (the payload names the `table` and error `code`), so that screen may show old or missing data. Logged once per table per page load. Usually an expired sign-in or a dropped connection — refresh, or sign out and in.

Logs never contain student names or form text.

---

## Technical Considerations

### Offline Mode

- Judges can score offline if internet drops
- Scores sync automatically when connection returns
- A score waiting to sync still shows as scored on that judge's device, even after the page is
  refreshed or the tablet restarts — the judge does not need to score it again

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
1. Setup tab: departments, how each is judged (rubric or Comments only), categories, the judge grid
2. Add all projects — assign each to the correct department
3. Give each judge the school link, the invite code and their judge number
4. Day before: the backups in the [Event-day backup plan](#event-day-backup-plan)

### During Event
1. Judges sign in with their number — the number decides their department(s)
2. Each judge scores the projects assigned to them
3. Watch the Alerts tab (and Overview for leaderboards)
4. Halfway: save a score backup and download its CSV
5. Lock judging (sidebar) when time is up, then back up again

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
A: No. A judge sees only the departments their number covers in the judge grid — and in a "N judges per project" department, only the projects assigned to them.

**Q: Can I enter results manually?**
A: Only via judges. Admin provides oversight and final award decisions, but scores must come from registered judges.

---

## Suggested judge setup

**Setup → Judges**, in the box under the grid. Tell it **how many judges are coming** and **how many
scores you want on each project**, and it works out the split for you:

- how many judges each department needs
- how many projects each judge reviews
- roughly how long that will take them

**Apply to the grid** ticks the boxes. Nothing is written until you press **Save judges**, so you can
look it over or change it first. You can ignore it entirely — it is a starting point, not a rule.

### Why it gives each judge one scored department

"N judges per project" shares work **inside** a department and is **blind across** them. A judge
ticked into three departments collects three separate shares — which is how one judge ends up with
four times another's load. One scored department each levels it out, and it also means nobody has to
switch between two different rubrics halfway through their session.

Comment-only departments (PreK, SPED) are too small to split, so they ride along with the lightest group.

### How it picks the numbers

Each scored department first gets the minimum it needs — one judge per score you asked for — and then
every spare judge goes to whichever department is **busiest per judge**. It is plain arithmetic
(projects × scores ÷ judges), not a guess, so it is instant and always adds up.

If you ask for more scores than you have judges for, it says so rather than quietly fudging it:
three scored departments at 3 scores each need at least 9 judges.

### Reading the load

The grid has a **Projects** column and an **About** column — each judge's workload and a rough time.
It assumes about **6 minutes a project**. That is a planning guide, not a limit: a comment-only review
is quicker, and a 20-item rubric is slower. The figure turns amber above 20 projects.
**With a judging schedule** the Projects column is each judge's number of **visits** in the schedule
(e.g. 12), not every project of the departments ticked for them.

> **Worked example (the 2026-27 fair).** 63 projects — PreK 2 · K-5 8 · 6-8 31 · 9-12 19 · SPED 3 —
> with 15 judges at 3 scores each. The suggestion is **K-5 3 judges · 6-8 7 · 9-12 5**, with PreK and
> SPED riding along with K-5's three. Everyone reviews **11–13 projects, about 1¼ hours**, and every
> project gets 3 scores. Left on "every judge scores all" the same roster puts one judge on **58
> projects — nearly 6 hours.**

---

## Judging schedule (rounds and times)

**Setup → 📅 Judging schedule.** If your fair runs on a timed schedule — judges moving from booth to
booth in fixed rounds — import it, and every judge's tablet follows it.

**What judges see:** their projects **in round order with the times**, the breaks between, and a big
**NEXT** card at the top — *"NEXT · R3 · 8:46–8:53 · G68-ERT-015 · Booth 14"*. After they submit a
project, NEXT moves on to the following round. A round where they have nothing reads *free*.

### Making the file

Build the grid in Excel (the 2026-27 schedule already has this shape):

| Judge | Judge Name | Interviews | R1 8:30–8:37 | R2 8:38–8:45 | … | BREAK 9:02–9:07 | R5 9:07–9:14 | … | WRAP-UP 10:16–10:30 |
|---|---|---|---|---|---|---|---|---|---|
| Judge 1 | | 12 | PK-EES-004 | G68-CMS-020 | … | COMMON BREAK | G68-LS-044 | … | |

- One row per judge, starting **Judge 1**, **Judge 2**, …
- One column per round, with the round and its time in the heading (**R1 8:30–8:37**). **BREAK** and
  **WRAP-UP** columns are shown to judges as breaks; anything typed in them is ignored.
- In each cell the project **code exactly as the app shows it** (e.g. **G68-ERT-015**). **—** means free.
- Title rows above the grid and notes below it are fine — they are ignored.
- Save it as **CSV** (File → Save As → *CSV UTF-8 (Comma delimited)*).

### Importing it

1. **⬆ Import schedule (CSV)** and choose the file. **Nothing is saved yet.**
2. Check the review: judges, rounds, breaks, how many visits, and how many visits each project gets
   (e.g. *58 projects × 3 · 5 projects × 1*).
   - **✗ (blocks saving):** a code that matches no project, a judge visiting the same project twice,
     or a judge number above Maximum judges. Fix the file and import again.
   - **⚠ (warning):** a project in nobody's row (nobody would visit it), or two judges at the same
     booth in the same round.
3. **Save schedule.** The judge grid fills itself from the schedule, and judges' lists follow it.

**While a schedule is in use** the judge grid, *judges per project*, **Rebalance** and the
*Suggested setup* are switched off — so nothing can quietly reshuffle a schedule you have printed.
In Setup → Judges the ticks are greyed out (they show which departments each judge visits, filled in
from the schedule), each department column reads **📅 Set by the schedule**, and the Projects column
is each judge's number of visits. The private **Name** boxes stay editable.
To change it, edit the file and import it again (**Replace the schedule**). Removing a visit a judge
has **already scored** is refused; moving it to another round is fine.

### Booth numbers

Fill in the **Booth #** column of the booth template, save it as CSV, and press
**⬆ Import booth numbers (CSV)** in the same box. Each project's booth is saved as its *Room / booth*
and appears next to the code on the judges' tablets and on the printouts. Locked projects are skipped.

### Printouts

- **🖨 Judge sheets** — one page per judge: round, time, code, booth, title, the breaks, and a box to
  tick each project once it is submitted in the app.
- **🖨 Booth visit times** — every booth with the times and judge numbers of its visits, so students
  know when to be at their project.

Neither has student names or scores.

### On the day

- **Judges tab** shows which scheduled judges have **not signed in** yet.
- **A judge did not come:** give a stand-in that judge's **number** and the invite code — they get the
  same projects in the same rounds.
- **Alerts** warns if a project is *not in the judging schedule* (added after the import).
- **Remove schedule** puts lists back on the judge grid. No score is lost.

> Needs the database update **2026-10p**. Without it the box says so and nothing else changes.

---

## Renaming a category (after projects exist)

**Renaming a category does not move the projects already saved under the old name.** The category is
stored on each project as plain text, taken at the moment it was saved — so a rename changes every
dropdown from then on, while the existing projects keep the old label and show as *"(old category)"*
when you edit them.

If you stop there you have **one category under two names**. The consequences:

| | |
|---|---|
| **Awards by category** | The old and new names become **two separate award groups**, each giving out its own 1st, 2nd and 3rd. This is the one that bites. |
| **Public results & printouts** | Both labels appear, as if they were different categories. |
| **Project codes** | **Unaffected** — as long as you leave the **Code** box alone (see below). |
| **Category list** | The count next to the renamed category looks too low. That is the easiest way to spot the problem. |

### Do this instead

1. **Setup → Project Categories** → rename it, and **leave the Code box exactly as it was**.
2. **Move the existing projects over** — Projects tab → **Edit** each one → pick the new category → Save.
   For more than a handful, ask your technical contact to update them in one go; it is a single
   database statement and takes seconds.
3. **Check Setup → Project Categories.** The count beside the renamed category should match what you
   expect. If it reads lower, some projects are still on the old text.
4. **Download a fresh ⬇ Projects CSV.** An older export still holds the old category text, and the
   importer keeps an unrecognised category exactly as written — so restoring it would undo the rename.

> **The Code box matters more than the name.** Project codes are built from the *code*, not the name.
> Rename `Life Science` to `Life, Health & Behavior` and keep the code `LS`, and every project code
> stays identical — printed judge sheets and booth lists remain valid. Blank the Code box and the app
> derives a new one from the new name (`LHB`), changing every project code in that category.

> **Scanned forms.** 📷 Scan forms accepts only an exact match to your current list. If your paper
> entry forms still print the old category name, those scans arrive with the category blank.

**Done at this fair (2026-10-21):** `Life Science` → `Life, Health & Behavior` to match the 2026-27
middle/high form. The code stayed `LS`, 16 projects were moved over in one database statement, and all
63 projects were then verified to carry a live category and the same code as before — nothing needed
reprinting.

---

## Minimum score to place

**Setup → Minimum score to place.** By default the top three averages in each department take 1st,
2nd and 3rd — **however low they are**. If you do not want a weak project on the podium, set a minimum.

It is a **percentage of each project's own maximum**, not a number of points. That is deliberate:
your departments may use different rubrics (42 points, 100 points), and a project below grade 5 skips
the Abstract criterion so its maximum is 36, not 42. A percentage means the same thing everywhere.
The card shows you what it comes to in points for the rubrics you actually use — e.g. *60% (60 of 100)*.

| | What happens |
|---|---|
| **0 (default)** | No rule. Any score can place. **This is what the 2026-27 fair uses** (decided 2026-10-21). |
| **60** | A project must average at least 60% of its own maximum to take 1st, 2nd or 3rd. |

**A project below the minimum is not hidden.** It keeps its position in the results with its real
average and review count — it just gets no medal and no place on the podium. The medals pass to the
next projects down that *do* qualify, so you never end up with an empty podium step.

A project **exactly on the line places** — 60% means "60% or more".

**If you do use one, 60 is a good number.** (The 2026-27 fair chose 60 first, then decided on 0 on
2026-10-21 — the top three always place.) On both 100-point rubrics 60% is 60 points, which is a straight *Good*
(3 out of 5) on every section or item. Neither rubric has a zero, so the lowest total a project can
possibly get is 20 — which puts 60 exactly halfway between the floor (20) and full marks (100).
That is an easy bar to explain to a parent: *a project has to average "Good" to place.*

**Where you will see it:**
- Overview → the department leaderboard marks those projects **no place**
- Judges → their validation list marks them **below N%**, so a judge does not report the missing
  medal as a fault
- Validation → if you choose 1st, 2nd or 3rd for one anyway, you get a warning with the numbers.
  **It does not stop you** — the award is still yours to give. Honorable Mention and Best in
  Category are never affected by this rule

**Set it before judging starts and tell the judges.** Changing it later changes no score at all —
only who gets a medal — but changing it after you have announced winners is confusing for everyone.

---

## Troubleshooting

### Scenario: Judge can't find their projects
- Check: The top of their list shows who the device is signed in as (e.g. *"👤 Judge15 · PreK"*). Is that their number?
- Check: Is that number ticked under the right department in Setup → Judges?
- Check: Do the projects have that department (Projects tab)?
- In a "N judges per project" department a judge sees only their share — Judges tab → Panels → Show assignments

### Scenario: Judges can't sign in
- *"Judge N is not on this school's judge list"* — that number is not ticked in the judge grid (or is above Maximum judges)
- *"Invalid invite code"* — check the code on the Overview tab. 5 wrong tries lock sign-in for 5 minutes for the whole school
- *"Judge7 is already signed in"* — another device has that number: **Allow Transfer** if it was them, **Remove** if it was someone else

### Scenario: Scores not showing up
- Check: Did judge complete all rubric fields and click Submit?
- Check: Is internet connection stable?
- Check: IT Logs for errors

### Scenario: A red "NOT saved" / "NOT finalized" message
- The change did not reach the database, and nothing changed — what you see is the real state
- Check: internet connection; sign out and back in if your session may have expired
- Then press the same button again. IT Logs shows the matching `*_FAILED` event with the error code

### Scenario: A project with a low score still took 3rd place
- By default there is no minimum — the top three averages in a department place, however low
- Set one in **Setup → Minimum score to place** (see below). It only affects medals, never scores

### Scenario: Reset says some steps failed
- The message reads *"N of 12 steps failed — NOTHING is guaranteed cleared"*. Take it literally:
  the old judges and scores may still be live
- Check the internet, then press **Reset everything** again — repeating it is safe
- Only the green **Reset Complete** screen means it finished. IT Logs records `FULL_RESET_FAILED`

### Scenario: Judges did not get a project you just added or moved
- Look in IT Logs for `JUDGE_ASSIGNMENTS_SYNC_FAILED`. It means the server could not update the
  judge lists, so **nothing was changed** — your "N judges per project" panels are untouched
- Once the connection is back, re-save the judge grid (Setup → Judges) or press **Rebalance** on
  the Judges tab

### Scenario: "Project number … is already used by another project"
- Every project number is unique within your school. Another admin probably just used it (your list
  refreshes when you see this message)
- Type a different number, or clear the number box to use the next free one, and save again
- Nothing was saved, so there is nothing to clean up

### Scenario: "Not saved" when moving a project to another department
- Only happens to a project that **already has scores**, and only when the two departments are
  judged differently (different rubric, or one is Comments only). The message names both
- This is deliberate — see *Projects Tab → Edit a Project*
- Either leave it where it is, or delete its scores and then move it

### Scenario: Can't finalize results
The text above the Finalize button names what is missing:
- "You must approve the results" — approve on the Validation tab
- "Close deliberation before finalizing" — close it first
- "JudgeN raised a concern" — the judge presses Revise my validation and approves, or you press
  **Clear concern** next to their name
Judges who have not validated yet do not block Finalize.

---

## Summary

1. Before judging: set up departments, the judge grid and every project (each with a department)
2. Judges sign in with their number — it decides their department(s) and the projects they score
3. Watch Alerts and Overview during judging; back up halfway and after locking
4. Validate, deliberate if needed, finalize results
5. Generate share link — public page splits results by department
6. Preserve activity log for audit trail
