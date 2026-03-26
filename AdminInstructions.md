# Admin Instructions — Science Fair Judging App

## Welcome to the Admin Dashboard 🎛️

This guide covers everything an event organizer needs to know to run the digital judging platform smoothly, from pre-event setup through results publication.

---

## 🔐 Admin Access

**Password:** set by your deployment administrator (stored in `VITE_ADMIN_PASS` environment variable — never shared in docs)

**To enter admin mode:**
1. Open the app
2. Click **"I'm an Admin"**
3. Enter the admin password
4. You'll see the full dashboard with tabs

---

## ⚙️ Tab Overview

| Tab | Purpose |
|---|---|
| **Overview** | Stats, completion tracking, leaderboard, event settings |
| **Judges** | Track judge registration and scoring progress |
| **Projects** | Add, edit, remove, or lock projects |
| **Activity** | Human-readable timeline of all system events |
| **Alerts** | Anomaly detection and system status |
| **Deliberation** | Validation workflow and award decisions |
| **Share** | Generate live results link (after results finalized) |
| **IT Logs** | Diagnostic terminal for troubleshooting (PIN-gated) |

---

## 📋 Pre-Event Setup

### 1. Configure Event Settings

**On the Overview tab, before any judges register:**

- **Set Max Judges** — How many judges will participate?
  - Click on "Max Judges for This Event"
  - Enter the number (e.g., 12, 15, 20)
  - Click "Save"
  - ⚠️ **Once the first judge registers, this setting locks** (prevents mid-event changes)
  - To change again, you must Reset All Data (clears all scores/judges)

**Why this matters:**
- Prevents accidental registration beyond your capacity
- Ensures consistent event planning
- Can be adjusted only before judging begins

### 2. Add Projects

**On the Projects tab:**

1. Click **"+ Add Project"**
2. Fill in the form:
   - **Title** — Project name (e.g., "Solar Cell Efficiency Under Different Light Spectra")
   - **Category** — Choose from Biology, Physics, Computer Sci., Chemistry, Earth Science, Engineering, Math, Environmental Sci.
   - **Grade** — Student grade level (e.g., 9, 10, 11, 12)
   - **Number** — Auto-generated, can edit (e.g., 001, 002, 003)
3. Click **"Add Project"**

**Tips:**
- Project numbers should be sequential or based on your system
- Use descriptive titles judges can understand quickly
- Grade levels help context for scoring (e.g., abstract required for grade 5+)

### 3. Prepare Judge Credentials

- **Judge names:** Judge1 through Judge15 (or up to however many you set as max)
- **Invite code:** provided at deployment — check your `VITE_INVITE_CODE` environment variable or ask your technical administrator
- **Share this with judges** before the event so they know what to expect

---

## 👥 During Judging

### Overview Tab — Live Scorecard

**Watch real-time progress:**

| Stat | What It Shows |
|---|---|
| **Judges** | Registration count vs max (e.g., 8/15) |
| **Projects** | Total projects in the system |
| **Scores In** | Count of completed scores across all judges |
| **Completion %** | Overall scoring completion |
| **Progress Bar** | Visual indicator of completion |

**Project Leaderboard:**
- Shows real-time averages as judges score
- **#** = Rank (by current average)
- **Project** = Title
- **Category** = Subject area
- **Avg** = Current average score (out of 42)
- **Reviews** = How many judges have scored it

### Judges Tab — Per-Judge Status

- **Judge Name** — Who they are
- **Projects Assigned** — Count they're responsible for
- **Completed** — How many they've finished
- **Progress %** — Visual completion indicator
- **Status** — "Scoring" or "Validated" or "Pending"

**Use this to:**
- Identify judges who are falling behind
- Contact slow judges for a nudge (off-app)
- Confirm everyone has registered

### Device Transfer (Admin-Controlled)

If a judge's tablet fails and they need to continue on another device:

1. Go to **Judges** tab
2. Find the judge row
3. Click **"Allow Transfer"**
4. Enter the **IT PIN** to authorize transfer
5. Approval stays active briefly (about 10 minutes, one-time use)
6. Judge signs in on the new device with the same judge name + invite code

**Important:**
- Judges cannot self-transfer without admin approval
- Approval is consumed after a successful transfer
- If transfer expires, admin can approve again

### Projects Tab — Project Management

**View all projects with:**
- Number, Title, Category, Grade
- **Rubric Breakdown** — How judges are scoring this project (expandable card)
- **Actions:** Edit, Delete, Lock

**Edit a Project:**
1. Click **"✏️ Edit"**
2. Change title, category, grade, or number
3. Click **"Save Changes"**

**Delete a Project:**
1. Click **"🗑 Remove"**
2. Confirm the prompt
3. ⚠️ **All scores, deliberation notes, and decisions for this project are deleted**
4. ⚠️ **Locked projects cannot be deleted** — unlock first if needed

**Lock a Project:**
- Click **"🔒 Lock"** to prevent editing/removal (useful for final projects that must stay)
- Click **"🔓 Unlock"** to allow changes again
- Locked badge shows on locked projects

**Rubric Breakdown (Expandable):**
- Shows average score per criterion
- Helps identify which rubric items judges are rating consistently high/low
- Useful for spotting scoring patterns

### Alerts Tab — Quality Control

**Anomaly Detection:**
- Flags projects with unusual scoring patterns
- Example: Judge1 gave Project 5 a score 15 points lower/higher than other judges
- **Details:** Shows project, outlier scores, threshold, and recommendation

**System Status:**
- Health indicators
- Sync status with Supabase
- Offline modes active
- Real-time connection status

### Activity Tab — Audit Trail

**Complete log of all events:**
- Judge registered
- Score submitted
- Project added/removed
- Lock toggled
- Reset executed
- Deliberation opened/closed
- Results finalized

**Use for:**
- Verifying what happened when
- Auditing judge accountability
- Reviewing system changes over time

---

## 🔍 Validation & Deliberation Workflow

### Step 1: Judges Validate Their Results

**For each judge who completes scoring:**
1. Judge goes to their "Judge Home" screen
2. Sees a read-only ranked list of their projects (sorted by avg score)
3. **Two options:**
   - **"Approve Results"** → "Your results look good; I validate these rankings"
   - **"Flag a Concern"** → "Something seems off; I have a concern" + optional comment

### Step 2: Admin Reviews Validations

**On the Deliberation tab:**

1. See a table of all judges' validation statuses:
   - 🟢 **Approved** — Judge confirms scores are confident
   - 🟡 **Concern** — Judge flagged an issue (with optional comment)
   - ⚪ **Pending** — Judge hasn't validated yet

2. Admin also validates themselves:
   - **"Approve Results"** → All results are fair and accurate
   - **"Flag a Concern"** → I have reservations (with optional comment)

**Key point:** Both judges AND admin must approve for consensus.

### Step 3: Consensus Check

**Green banner appears when:**
- ✅ ALL judges who completed scoring have approved
- ✅ Admin has approved

**Until consensus:**
- Deliberation may be needed for flagged concerns
- Or judges may revise and re-validate

### Step 4: Deliberation (Conditional)

**Deliberation opens automatically if:**
- **Tie detected** — Two or more projects have the exact same average score
- **Admin manually opens it** — "Open Manually" button available anytime

**What happens in deliberation:**
1. Admin sees judge comments for each project
2. Admin views recommendation breakdown (e.g., "3 judges: Award, 2 judges: Strong")
3. Admin assigns final awards for each project
4. Admin can flag specific projects for discussion

### Step 5: Finalize Results

**When ready:**
1. Ensure consensus is reached (green banner)
2. Close deliberation if opened
3. Click **"Finalize Results"** button
4. ✅ Results locked; Share tab now enabled

**After finalization:**
- Scores can't be changed by judges
- Admin can still adjust awards/decisions
- Public results link can be generated

---

## 📊 Data Management

### Reset All Data

**⚠️ CAUTION — This is permanent:**

1. Go to **IT Logs tab** (enter the 4-digit IT PIN set by your administrator)
2. Click **"Reset All Data"** button
3. Enter the IT PIN
4. Confirm the prompt
5. ✅ Cleared: Judges, scores, validation, deliberation, results, sharing link
6. ✅ **Preserved:** Projects (configuration), activity log (audit trail)

**What resets:**
- Max judges back to 15 (becomes editable again)
- All judge registrations and sessions
- All scores
- All deliberation notes and decisions
- All validation entries
- Judging lock status
- Share link

**What is NOT reset:**
- Projects (you keep your event project list)
- Activity log (security audit trail is permanent)

### Lock Judging

**Prevent judges from submitting new scores:**

1. **Overview tab**
2. Look for **"Lock Judging"** toggle (top area)
3. Click to lock/unlock
4. Red banner appears: "🔒 Judging LOCKED — judges cannot submit scores"
5. Judges already scoring can finish, but can't submit new projects

**Why lock?**
- Deadline has passed
- Prevent late entries
- Prepare for deliberation

---

## 🌐 Share Results

### Prerequisites

- ✅ All scoring complete
- ✅ Consensus reached (all judges approved)
- ✅ Deliberation closed (if it was opened)
- ✅ Results finalized

### Generate Link

**On the Share tab:**

1. **Public Results Title** — What appears at top of results page (default: "Science Fair SY 2025-2026 — Final Results")
2. **Show Rubric Breakdown** — Toggle to display individual criterion scores on results page
3. **Link Expiry** — Choose:
   - **1 Hour** — For live event display
   - **24 Hours** — For day-after viewing
   - **7 Days** — Full week of access
   - **Never** — Permanent access
4. Click **"Generate Live Results Link"**
5. Copy the URL (button provided)
6. Share with participants, parents, school

### What the Public Sees

**Public results page shows:**
- 🏆 **Podium** (top 3 projects) — Visually featured with medals
- 📋 **Full Ranked Table** — All projects sorted by average score
- 🎖️ **Award Badges** — If awards assigned (1st Place, Best in Category, etc.)
- 📊 **Optional Rubric Breakdown** — If enabled: scoring details per criterion
- **Judge names: NEVER shown** — Scores only

### Revoke Link

- Click **"Revoke Link"** to make sharing URL expire immediately
- Useful if link was shared by mistake or need to unpublish results

---

## 🛠️ IT Diagnostics

### Access IT Logs Terminal

**PIN:** set by your deployment administrator (stored in `VITE_IT_PIN` environment variable)

1. Go to **IT Logs tab**
2. Click **"Unlock"** button
3. Enter the 4-digit IT PIN
4. Click **"Unlock"**
5. Terminal opens showing detailed event logs

### What You See

**Columns:**
- **Timestamp** — When event occurred
- **Level** — ERROR, WARN, INFO, DEBUG
- **Module** — AUTH, JUDGE, SCORE, ADMIN, SYSTEM, DB
- **Event** — What happened (e.g., JUDGE_REGISTERED, SCORE_SUBMITTED)
- **Detail** — Human-readable description
- **Payload** — Raw data (JSON format)

**Common Events:**
- `JUDGE_REGISTERED` — New judge signed in
- `JUDGE_REMOVED` — Judge deleted/reset
- `SCORE_SUBMITTED` — Score recorded
- `PROJECT_ADDED/REMOVED` — Project management
- `LINK_GENERATED/REVOKED` — Share link changes
- `FULL_RESET` — All data cleared
- `MAX_JUDGES_REACHED` — Registration limit hit
- `MAX_JUDGES_UPDATED` — Setting changed

### Filter Logs

- **Event Filter** — Dropdown to search by type
- **Clear filters** — Show all logs
- Expand any row for full payload details

### Export / Copy

- Select a row and copy details for troubleshooting
- Send to technical support if needed

---

## 👁️ Activity Log

**On the Activity tab:**

- **Human-readable timeline** of all significant events
- Shows: "Judge3 submitted score for Project #005"
- Sorted newest first
- ⚠️ **Never cleared** — Full audit trail of the event

**Review to:**
- Verify activity during event
- Audit judge participation
- Identify any system issues
- Document for school records

---

## 📱 Technical Considerations

### Offline Mode

- Judges can score offline if internet drops
- Scores sync automatically when connection returns
- **Ensure browsers don't clear app data** (can lose cached entries)

### Multiple Devices

- Admin can open dashboard on multiple screens (live updates across all)
- Judges can only be logged in on one device at a time
- If duplicate login detected, older session is kicked out

### Browser Compatibility

- ✅ Works on tablets, phones, laptops
- ✅ Chrome, Safari, Firefox, Edge
- ✅ PWA installable (can install like app on home screen)

### Data Persistence

- All data stored in Supabase (cloud)
- Activity log preserved forever (security/audit)
- Can clear session, but online data persists

---

## 🎯 Workflow Summary

### Pre-Event
1. ✅ Set max judges
2. ✅ Add all projects
3. ✅ Prepare judge credentials (names, invite code)

### During Event
1. ✅ Judges register and score all projects
2. ✅ Monitor progress on Overview tab
3. ✅ Lock judging when deadline passed

### Post-Scoring
1. ✅ Judges validate their results
2. ✅ Admin validates
3. ✅ Review any flagged concerns
4. ✅ Open deliberation if ties exist
5. ✅ Finalize results
6. ✅ Generate share link
7. ✅ Share results with community

### Archive
- 📋 Review Activity Log
- 📊 Download results if needed
- 🔍 Check IT Logs for any issues

---

## ❓ Common Admin Tasks

**Q: A judge registered twice. How do I remove them?**
A: If this is a device issue, use **Allow Transfer** in the Judges tab (PIN required) so they can continue on the new device. Use Reset All Data only for full event reset scenarios.

**Q: Can I add judges beyond 15?**
A: Yes! Before any judge registers, set Max Judges to higher number (e.g., 25) on Overview tab.

**Q: How many projects should we have?**
A: Typically 8-50 projects. More projects = longer scoring time per judge. Plan ~3-5 min per project.

**Q: Can judges change their scores after submitting?**
A: Yes, until they validate results. After validation, they can't modify. Use deliberation to revisit if needed.

**Q: What's the difference between "Appealing Results" and "Flagging a Concern"?**
A: Judges approve results if they're confident. Flagging means they want it discussed (e.g., unusual tie, scoring inconsistency).

**Q: Can I enter results manually or only via judges?**
A: Only via judges. Admin provides oversight/decisions, but scores must come from registered judges.

**Q: How long until results are official?**
A: After "Finalize Results" is clicked. That's the official snapshot. Further changes only via admin award assignments, not score changes.

---

## 📞 Troubleshooting

### Scenario: Judges can't register
- ❌ **Check:** Is max judges set? Are slots full?
- ❌ **Check:** Are judges using correct invite code?
- ❌ **Check:** Is their name already taken (logged in elsewhere)?

### Scenario: Scores not showing up
- ❌ **Check:** Judge completed all rubric fields?
- ❌ **Check:** Did judge click "Submit"?
- ❌ **Check:** Is internet connection stable?
- ❌ **Check:** IT Logs for errors

### Scenario: Can't finalize results
- ❌ **Check:** Have ALL judges validated?
- ❌ **Check:** Has admin validated?
- ❌ **Check:** Is deliberation still open? Close it first.

### Scenario: Offline judges losing data
- ✅ **Ensure:** Judges don't clear browser cache/data
- ✅ **Ensure:** Try sync manually by refreshing page

---

## Summary

1. ⚙️ Set max judges + add projects before judging
2. 👥 Monitor judge registration and progress
3. 🔍 Review validation status during deliberation
4. 🎯 Finalize results when consensus reached
5. 🌐 Generate share link for community
6. 📋 Preserve activity log for audit trail

**You're ready to run a smooth, fair, and professional science fair! 🎉**
