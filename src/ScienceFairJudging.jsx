import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

// ─────────────────────────────────────────────
// CONSTANTS & MOCK DATA
// ─────────────────────────────────────────────
const JUDGE_NAMES  = Array.from({ length: 100 }, (_, i) => `Judge${i + 1}`);

// School slug from URL path: qritiko.com/s/school-slug
const urlSchoolSlug = typeof window !== "undefined"
  ? (window.location.pathname.split("/s/")[1]?.split("/")[0] || null)
  : null;


const DEFAULT_RUBRIC = [
  { id:"presentation", label:"Presentation",          desc:"Display Board and Project Data Book: Elements are aesthetically pleasing, organized, and creative. Is the information easy to understand?",                                                                                      max:6, steps:[0,2,4,6] },
  { id:"testable_q",   label:"Testable Question",     desc:"References a cause and effect relationship and a measurable change.",                                                                                                                                                           max:3, steps:[0,1,2,3] },
  { id:"background",   label:"Background Research",   desc:"Is diverse; multiple sources are cited and are complete.",                                                                                                                                                                     max:3, steps:[0,1,2,3] },
  { id:"hypothesis",   label:"Hypothesis",            desc:"Is based on background research.",                                                                                                                                                                                             max:3, steps:[0,1,2,3] },
  { id:"variables",    label:"Variables",             desc:"Are clearly defined (independent, controlled, dependent); may be worded as \"what I changed\", \"what I kept the same\", and \"what I measured\".",                                                                            max:3, steps:[0,1,2,3] },
  { id:"materials",    label:"Materials & Procedure", desc:"Materials are appropriate and a detailed list is given. Procedure is sequential and describes the investigation clearly and was repeated a minimum of 3 times.",                                                                max:3, steps:[0,1,2,3] },
  { id:"data",         label:"Quantitative & Qualitative Data", desc:"Quantitative Data: numbers, standard metric units, scale made up by the student. Qualitative Data: words, descriptions of physical or behavioral changes.",                                                                    max:6, steps:[0,2,4,6] },
  { id:"analysis",     label:"Analysis",              desc:"Describes the trends or patterns found in the data; may have comments on reasons for trends or patterns.",                                                                                                                      max:6, steps:[0,2,4,6] },
  { id:"conclusion",   label:"Conclusion",            desc:"Based on the analysis of the data; acceptance or rejection of hypothesis or success of solution/invention; suggestions for further efforts.",                                                                                   max:3, steps:[0,1,2,3] },
  { id:"abstract",     label:"Abstract",              desc:"Required for projects 5th–High School. Concisely sums up the project explaining the test, the outcome, and the conclusion. Not to exceed 250 words.",                                                                          max:6, steps:[0,2,4,6] },
];
// Scoring guide: 0=not present, 1/2=partial, 2/4=complete, 3/6=exceptional
// DEFAULT_RUBRIC is used as the fallback if no custom rubric is defined for the school.

// ── RUBRIC PRESETS ───────────────────────────────────────────
// One-click starting points in the admin Rubric tab. A school can still edit any
// criterion afterwards — these are seeds, never a constraint (same idea as
// DEPT_PRESETS / DEFAULT_CATEGORIES).
//
// `stepLabels` is OPTIONAL and display-only: when it has exactly one entry per
// `steps` value the scoring buttons show the word instead of the raw number.
// It exists because a 1–5 rating scaled into differently-weighted sections gives
// a different number for the SAME rating in each section (a "Good" is 9 points
// in a 15-pt section but 15 in a 25-pt section) — judges would be doing mental
// arithmetic. Nothing in the scoring maths reads it; if it ever desyncs from
// `steps` the UI silently falls back to numbers.
// ── FEEDBACK-MODE DEPARTMENTS (departments.scoring_mode = 'feedback') ────────
// PreK and K-2 are not scored: a judge leaves a commendation and an optional
// comment, every project is a participant, and nothing is ranked. The judge picks
// one of these or types their own, so the list is a starting point, not a limit.
const COMMENDATIONS = [
  "Great Scientific Thinking",
  "Creative Idea",
  "Excellent Teamwork",
  "Wonderful Presentation",
  "Careful Observer",
  "Asked Great Questions",
  "Terrific Effort",
];
const PARTICIPATION_AWARD = "Participant";

const RATING_5 = ["Needs improvement", "Fair", "Good", "Very Good", "Excellent"];
const RUBRIC_PRESETS = [
  {
    id: "northeast-az",
    label: "Northeast AZ Regional — 42 points",
    desc: "10 criteria, 0–6 points each. Grades below 5 skip the Abstract criterion.",
    criteria: () => DEFAULT_RUBRIC,
  },
  {
    id: "cibecue-100",
    label: "Cibecue / ISEF-style — 100 points",
    desc: "5 sections rated 1–5 (Needs improvement → Excellent), weighted to 100 points. No zero: the lowest possible total is 20.",
    criteria: () => [
      { id:"title", label:"Project Title", max:15, steps:[3,6,9,12,15], stepLabels:RATING_5,
        desc:"Is meaningful · reflects the student's creativity · has a clear and focused purpose · relates to real-life experimentation · is appropriate for the student's grade level." },
      { id:"inquiry", label:"Scientific Inquiry", max:25, steps:[5,10,15,20,25], stepLabels:RATING_5,
        desc:"Proposes a scientific question · follows the correct order and steps of the scientific method · has a testable hypothesis · the experiment/investigation is well organized." },
      { id:"data_conclusion", label:"Data and Conclusion", max:20, steps:[4,8,12,16,20], stepLabels:RATING_5,
        desc:"Provides enough quantitative and qualitative data · data collected from the students' own experiment · data are accurate · the conclusion is reliable and answers the scientific question." },
      { id:"presentation", label:"Presentation", max:20, steps:[4,8,12,16,20], stepLabels:RATING_5,
        desc:"Information is well presented (verbally and written) · display/trifold is neat and organized · the project is clearly presented · students show strong understanding · students answer questions about their investigation." },
      { id:"further_research", label:"Further Research", max:20, steps:[4,8,12,16,20], stepLabels:RATING_5,
        desc:"The investigation and presentation reflect teamwork · students adhere to safety rules and restrictions." },
    ],
  },
];

// True when a criterion's stepLabels can be trusted to line up with its steps.
// Anything else (an admin edited the steps, a hand-written rubric) falls back to
// showing the point value, which is always correct.
function stepLabel(r, v, i) {
  const ls = r?.stepLabels;
  return Array.isArray(ls) && ls.length === r.steps?.length ? ls[i] : null;
}

// (DEFAULT_PROJECTS seed array removed 2026-09 — unused dead code since projects
//  have been loaded exclusively from the per-school `projects` table.)

const MEDALS = ["🥇","🥈","🥉"];

const RECOMMENDATIONS = ["Recommend for Award","Strong Contender","Good Work","Needs Improvement"];
const AWARD_OPTIONS   = ["1st Place","2nd Place","3rd Place","Honorable Mention","Best in Category","No Award","Pending"];

// ── DEPARTMENTS ──────────────────────────────────────────────
// Departments are per-school rows in the `departments` table, fully editable in
// the admin Setup tab (add / rename / reorder / delete / max judges). The lists
// below are only STARTING POINTS offered to a school that has not set its own —
// never treat them as the set of departments that exists (CLAUDE.md rule 11a).
// DEPT_PRESETS[0] is what a brand-new school is seeded with.
const DEPT_PRESETS = [
  { id: "levels", label: "Elementary / Middle / High",
    desc: "Three school levels. The classic setup and what new schools start with.",
    depts: [
      { name: "Elementary",    code: "Elem" },
      { name: "Middle School", code: "JHS"  },
      { name: "High School",   code: "SHS"  },
    ] },
  { id: "bands", label: "Grade bands (PreK–12)",
    desc: "Five grade bands. Each one is judged and awarded on its own.",
    depts: [
      { name: "PreK",  code: "PK"   },
      { name: "K-2",   code: "K2"   },
      { name: "3-5",   code: "G35"  },
      { name: "6-8",   code: "G68"  },
      { name: "9-12",  code: "G912" },
    ] },
  { id: "bands-sped", label: "Grade bands + SPED",
    desc: "The five grade bands plus a separate SPED division.",
    depts: [
      { name: "PreK",  code: "PK"   },
      { name: "K-2",   code: "K2"   },
      { name: "3-5",   code: "G35"  },
      { name: "6-8",   code: "G68"  },
      { name: "9-12",  code: "G912" },
      { name: "SPED",  code: "SPED" },
    ] },
  { id: "single", label: "One department",
    desc: "A single pool — every judge sees every project.",
    depts: [{ name: "All Projects", code: "ALL" }] },
];
const DEFAULT_DEPARTMENTS = DEPT_PRESETS[0].depts.map((d, i) =>
  ({ id: null, name: d.name, code: d.code, max_judges: 5, ord: i }));

// ── PROJECT CATEGORIES ───────────────────────────────────────
// Categories are per-school rows in the `categories` table (migration 2026-10e),
// editable in the admin Setup tab. A robotics fair defines its own; nothing here
// is shared between schools.
// This list is ONLY the fallback: it is used before the table has loaded, and if
// migration 2026-10e has not been run yet (logged as CATEGORIES_TABLE_MISSING).
// It is also what "Reset to default" and ensureSeedData() seed.
// The six are the ones printed on the 2026-27 participation form. "Not sure yet"
// on the paper form is deliberately NOT a category — the admin must pick a real
// one before a scanned project can be saved. A project saved under a category
// that is later deleted keeps its text and still displays (there is no FK).
const DEFAULT_CATEGORIES = [
  { name: "Life Science",                       code: "LS"  },
  { name: "Earth & Environmental Science",      code: "EES" },
  { name: "Chemistry & Material Science",       code: "CMS" },
  { name: "Physics, Math & Astronomy",          code: "PMA" },
  { name: "Engineering, Robotics & Technology", code: "ERT" },
  { name: "Energy, Sustainability & Design",    code: "ESD" },
];

// ── REGISTRATION FORM CONSTANTS ──────────────────────────────
// TODO (Phase 1, next change): DIVISIONS/DIV_CODES still duplicate what the
// `departments` table now holds, and `departments.code` exists for exactly this.
// Unifying them also lets submit_registration() set a project's department.
const DIVISIONS     = ["Elementary", "Junior High School", "Senior High School"];
const DIV_CODES     = { "Elementary": "Elem", "Junior High School": "JHS", "Senior High School": "SHS" };

// ── ADMIN HELP & FAQ (admin "Help & FAQ" tab) ───────────────────────────────
// ⚠️ KEEP THIS CURRENT. Any change that affects what admins or judges see or do must update
// this text, ADMIN_HELP_UPDATED, AdminInstructions.md and JudgeInstructions.md in the SAME
// commit (CLAUDE.md rule 56). Plain strings only — rendered as text, never as HTML.
const ADMIN_HELP_UPDATED = "2026-10-06f";
const ADMIN_HELP = [
  { title: "How this system works", icon: "🧭", items: [
    "Your fair lives at qritiko.com/s/your-school. Share only that link — never another address (judges' unsynced scores are tied to the address they used).",
    "Everything is saved to a secure online database the moment you press Save or a judge presses Submit. App updates never erase your data.",
    "The flow: set up → add projects → judges sign in → judges score → judges validate → (deliberation if there is a tie) → you finalize → you share the results link.",
    "Each judge scores every project in their own department, and only those.",
    "A department can be set to 'Comments only' (Setup tab) — judges there give a commendation instead of scores, nothing is ranked, and everyone is shown as a winner. Everything below about scores, ties and leaderboards applies only to scored departments.",
    "Totals are always calculated with the CURRENT rubric. On the 42-point rubric, grades below 5 skip the Abstract criterion and grades 5 and up cannot be given a 0; the 100-point rubric has neither rule (its lowest possible total is 20).",
    "Score outliers in the Alerts tab are judges more than about a fifth of a project's total away from its average — so the alert means the same thing on a 42-point and a 100-point rubric.",
    "Rankings, ties and the public results are per department — projects in different departments never compete.",
    "Student names are visible only to signed-in admins of your school. Judges and the public results page never see them.",
  ]},
  { title: "Before the event — checklist", icon: "✅", items: [
    "Remember your Admin PIN (4–8 digits). It cannot be recovered, only changed (Overview → Admin PIN). 5 wrong tries lock PIN entry for 5 minutes.",
    "Setup tab: set your departments first — add, rename or reorder them, or start from a preset (school levels, PreK–12 grade bands, grade bands + SPED).",
    "Setup tab → Judge numbers: enter how many judges each department needs. Every judge gets ONE number for the whole school (e.g. PreK = Judge 1–2, K-2 = Judge 3–4) and the number decides their department.",
    "Setup tab: check your project categories. They are yours alone — rename them, delete the ones you don't use, or add your own (a robotics fair can replace all six).",
    "Setup tab: set any department that should NOT be scored (PreK, K-2) to 'Comments only'. This cannot be changed once that department has scores.",
    "Rubric tab: finish the rubric BEFORE the first judge signs in. Press a preset to start from one of the ready-made rubrics (Northeast AZ 42-point, or Cibecue/ISEF-style 100-point), then edit it if you need to.",
    "Projects tab: add every project (📷 Scan forms or + Add Project) and give each one a department — a project with no department is scored by nobody.",
    "Lock (🔒) projects whose details are final, so they cannot be edited or deleted by accident.",
    "Download Projects CSV and the Project List PDF as your own backup copy.",
    "Dry run: on a spare tablet sign in as judge number 1, score one project, check it on Overview, then remove that judge on the Judges tab (or Reset All Data).",
    "Give each judge: the school link, the invite code and their judge number — all three are on the Overview tab. They do not choose a department; their number decides it.",
  ]},
  { title: "Do", icon: "👍", items: [
    "Save a score backup (Score Export → 💾 Save Score Backup) and download the CSVs at the halfway point and at the end.",
    "Check every scanned card against its photo — amber boxes are where the AI was unsure.",
    "Keep the paper participation forms as the original record.",
    "Lock judging (sidebar → Lock Judging) when scoring time is over.",
    "Ask judges to stay on Wi-Fi when possible and press Sync Now if they see an offline warning.",
  ]},
  { title: "Don't", icon: "⛔", items: [
    "Don't change the rubric after judging starts. Removing or adding a criterion, or changing its points, changes every total and ranking. (Renaming or rewording is safe.) The app asks you to confirm and offers a backup first.",
    "Don't delete a project that has scores — its scores are deleted with it. Lock it instead.",
    "Don't use Reset All Data during the event. It removes all judges, scores, validations, awards and the share link (projects, departments and the rubric stay).",
    "Don't post the invite code or the Admin PIN publicly. 5 wrong invite codes lock judge sign-in for 5 minutes for the whole school.",
    "Don't share exports that contain student names (Projects CSV, Project List PDF, registrations) outside your staff.",
    "Don't open the app on any address other than qritiko.com.",
  ]},
  { title: "Departments & categories (Setup tab)", icon: "⚙️", faq: [
    ["What is a department?", "One judging pool. Judges sign in to a department and score every project in it. Results, ties and awards are worked out inside each department — projects in different departments never compete. Use whatever fits your fair: school levels, grade bands (PreK, K-2, 3-5, 6-8, 9-12), a SPED division, or a single pool."],
    ["How do I change my departments?", "Setup tab → Departments. Add one, ✏️ rename it, ↑↓ reorder, or 🗑 delete it. Or press a preset to add a whole set at once — a preset only ADDS what you don't have, it never deletes."],
    ["Why won't it let me delete a department?", "Because projects or judges are still in it. Deleting it would leave them unassigned, and an unassigned project is scored by nobody. Move them to another department first (Projects tab → edit → Department), then delete."],
    ["Can a department be judged without scores?", "Yes. Setup tab → set that department to 'Comments only'. Judges there give a commendation (from a list, or in their own words) and an optional comment instead of the rubric. Nothing is scored, ranked or compared, and on the results page every project in it is shown as a winner. Made for PreK and K-2."],
    ["Can I change a department to Comments only after judging has started?", "No — the app blocks it. The scores already given would stop counting but stay in the database. Decide before the first judge signs in."],
    ["Is it safe to rename a department?", "Yes. Projects, judges and scores stay attached — only the label changes."],
    ["Can I use my own project categories?", "Yes. Setup tab → Project Categories. They belong to your school only; no other school sees your list. Add, rename, reorder or delete freely — a robotics fair can replace all six."],
    ["What happens to projects if I delete or rename a category?", "Nothing. A project keeps the category text it was saved with; only the choice disappears from the dropdowns. A project on a category you removed shows it as \"(old category)\" when you edit it, and you can pick a new one."],
    ["What is the little Code for?", "A short code used to build student registration numbers, like JHS-LS-001. Leave it blank and the app makes one from the name."],
    ["I changed a category — do I need to tell the form scanner?", "No. 📷 Scan forms asks the AI to pick from your current list automatically."],
  ]},
  { title: "The rubric", icon: "📐", faq: [
    ["How do I choose a rubric?", "Rubric tab → press a preset. 'Northeast AZ Regional' is 10 criteria worth 42 points. 'Cibecue / ISEF-style' is 5 sections rated Needs improvement → Excellent, worth 100 points. Either can be edited afterwards, and a preset shows a ✓ when it is the one in use."],
    ["What do judges see on the 100-point rubric?", "Five sections. Each one has five buttons labelled Needs improvement, Fair, Good, Very Good and Excellent, with that section's points underneath — so a judge picks the rating and never does the arithmetic. The sub-points from the paper form are listed under each section heading."],
    ["Why is the lowest score 20 and not 0?", "The paper form's scale starts at 1 (Needs improvement), so there is no zero to give. All five sections at the lowest rating comes to 20 out of 100. That is expected, not a bug."],
    ["Can I change the section points?", "Yes — Rubric tab → Edit Rubric. Max Points goes up to 100 per section. If you change a section's steps the rating words are removed and judges see the point numbers instead, so re-apply the preset if you want the words back."],
    ["What happens to scores already given if I switch rubric?", "Totals are recalculated with the new rubric, so rankings change. The app shows exactly what changes and offers a backup before saving. Pick your rubric before judging starts."],
  ]},
  { title: "Data safety", icon: "🛡️", faq: [
    ["Will updates to the app erase my projects or scores?", "No. Updates replace the website, never your data. Database changes are tested on a copy first and only add or tighten things."],
    ["What does Reset All Data clear?", "Judges, scores, validations, deliberation notes, awards, the share link and the lock / finalize settings. It keeps projects, departments, the rubric, registrations and the activity log."],
    ["How do I back up?", "Score Export → 💾 Save Score Backup (stores scores AND the rubric), ⬇ Download Judge Scores CSV, and Projects → ⬇ Download Projects CSV. Download copies at the halfway point and at the end."],
    ["What happens to scores if I change the rubric?", "The raw scores are kept, but totals use the current rubric: a removed criterion stops counting, a new one counts 0 until re-scored, changed points keep the old values. Finish the rubric before judging."],
    ["Who can see student names?", "Only signed-in admins of your school. Never judges, never the public results page."],
  ]},
  { title: "Form scanning", icon: "📷", faq: [
    ["Where do the photos go?", "They are sent to Google Gemini to be read and are not stored anywhere. Only what you press Save on becomes a project."],
    ["What if a form cannot be read?", "Press ↻ Retry, or ✍️ Enter manually to type it beside the photo. You can also add a ✍️ Blank card, or use + Add Project."],
    ["A student ticked \"Not sure yet\" for the category.", "The card cannot be saved until you choose one of the six categories."],
    ["It says \"possible duplicate\".", "A project with the same title or the same students already exists. Save only if it really is a different project (\"Save anyway\")."],
    ["It says scanning is not set up / the API key was rejected.", "That is a setup problem, not your photo — tell your technical contact. Use + Add Project meanwhile."],
  ]},
  { title: "Judges", icon: "🧑‍⚖️", faq: [
    ["A judge's tablet died.", "Judges tab → Allow Transfer on that judge (Admin PIN). Within 10 minutes the judge signs in on the new device with the same judge number and invite code. Their scores are kept."],
    ["A judge lost internet.", "Scores are kept on the device and sync automatically when it reconnects (or with Sync Now). The app will not let a judge sign out while scores are still only on the device."],
    ["Can a judge change a score?", "Yes — open the project again and resubmit, until they validate their results or you lock judging."],
    ["A judge validated too early.", "They can press Revise my validation until you finalize the results."],
    ["A judge cannot see a project you just added.", "Make sure the project has their department. It appears automatically; if not, ask them to refresh the page."],
    ["A judge registered in the wrong department.", "With one judge list for the whole school (the default) this cannot happen — the number decides the department. If someone used the wrong NUMBER: Judges tab → Remove on that judge (Admin PIN), then they sign in with the right number. Removing deletes that judge's scores, so do it before they score."],
    ["Someone signed in who is not a judge / a test sign-in is in the list.", "Judges tab → Remove (Admin PIN). Their number is freed. No Reset needed."],
    ["How do judge numbers work?", "Setup tab → Judge numbers. Type how many judges each department needs and press Save; numbers are handed out in department order (PreK 2, K-2 2 → PreK = Judge 1–2, K-2 = Judge 3–4). Each number exists once in the school, so two people can never both be 'Judge 1'. Judges type only their number and the invite code."],
    ["Can I change the judge numbers after judges signed in?", "Yes, as long as everyone already signed in keeps a number inside their own department — otherwise Save is refused and tells you who is in the way. Remove that judge first if they signed in by mistake."],
    ["Can numbers restart in each department instead?", "Yes: Setup → Judge numbers → 'Numbers restart in each department'. Each department then has its own Judge1, Judge2… and judges pick their department when signing in. Not recommended — the same name then means several people."],
  ]},
  { title: "Troubleshooting", icon: "🛠️", faq: [
    ["Where is the judge invite code?", "Overview tab, at the top. Before any judge signs in it is inside the \"Get started\" card; after that the card becomes \"Judge sign-in details\" and still shows the school address and invite code with Copy buttons."],
    ["\"Email not confirmed\" when signing in.", "Click the link in the confirmation email (check spam / junk), then sign in again."],
    ["PIN entry is locked.", "5 wrong PINs lock PIN entry for 5 minutes. Wait, then try again."],
    ["The lock button says \"Lock failed — retry\".", "The change did not reach the database (often an expired sign-in). Sign out and in, then try again — judges are NOT locked until it succeeds."],
    ["\"Rubric NOT saved\".", "Nothing was changed. Your edits are still on screen — sign in again if needed and press Save Rubric again."],
    ["A red message says something was \"NOT saved\" / \"NOT finalized\".", "The change did not reach the database, so nothing changed — the screen shows the real state. Check the internet (or sign out and in), then press the same button again. Applies to validations, awards, deliberation, Finalize and Reopen."],
    ["Live updates seem frozen (judges' scores are not appearing).", "Refresh the page. IT Logs shows REALTIME_DOWN when the live connection dropped and REALTIME_RECONNECTED when it came back."],
    ["A judge says their scores will not sync.", "IT Logs → look for OFFLINE_SYNC_FAILED with their alias. It shows how many scores are stuck and how long they have waited. The scores stay safe on their device; do NOT let them clear the browser. Send the report to your technical contact."],
    ["Something looks wrong.", "IT Logs tab (Admin PIN) → copy the report and send it to your technical contact. App crashes on any device are recorded automatically as CLIENT_ERROR."],
  ]},
];

// ── PROJECT MEMBER HELPERS ───────────────────────────────────
// group_members comes in three shapes and every reader must accept all of them:
//   projects.group_members (2026-10+)   JSONB [{ name, grade }]
//   projects.group_members (2026-09)    JSONB ["name", ...]
//   registration_submissions.group_members  TEXT "Juan, Maria"
function normGrade(g) {
  const s = String(g ?? "").trim();
  if (!s) return "";
  if (/^k(inder.*)?$/i.test(s)) return "K";
  const m = s.match(/\d+/);
  return m ? String(parseInt(m[0], 10)) : "";
}
function normMembers(raw) {
  if (Array.isArray(raw)) {
    return raw.map(m => typeof m === "string"
      ? { name: m.trim(), grade: "" }
      : { name: String(m?.name ?? "").trim(), grade: normGrade(m?.grade) })
      .filter(m => m.name);
  }
  if (typeof raw === "string") {
    return raw.split(",").map(s => ({ name: s.trim(), grade: "" })).filter(m => m.name);
  }
  return [];
}
function membersText(raw) {
  return normMembers(raw).map(m => m.grade ? `${m.name} (Gr ${m.grade})` : m.name).join(", ");
}
// Highest numeric grade in the group — the project grade drives the grade<5 abstract
// rule, so a mixed group is judged at its oldest member's level.
function highestGrade(members) {
  const nums = normMembers(members).map(m => m.grade === "K" ? 0 : parseInt(m.grade, 10)).filter(n => !isNaN(n));
  if (!nums.length) return "";
  const max = Math.max(...nums);
  return max === 0 ? "K" : String(max);
}
// defaultCat comes from the school's own category list (catNames()[0]); it is a
// parameter rather than a constant because categories are per-school now.
function blankProjForm(num = "", defaultCat = "") {
  return { title:"", cat:defaultCat, grade:"", num, department_id:"", advisor_name:"",
    members:[{ name:"", grade:"" }], room:"", description:"", motivation:"" };
}
// Escape text placed into hand-built HTML (print windows). Scanned/handwritten text is
// untrusted input — a stray "<" must never become markup.
function escHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}

function uid()      { return Math.random().toString(36).slice(2, 10); }
function genToken() { return Array.from({length:4}, () => Math.random().toString(36).slice(2,6).toUpperCase()).join("-"); }
function fmt(ts)    { return new Date(ts).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }); }
function fmtFull(ts){ return new Date(ts).toLocaleString([], { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }); }
function fmtISO(ts) { return new Date(ts).toISOString(); }
function itId()     { return "EVT-" + Math.random().toString(36).slice(2,8).toUpperCase(); }
function getDivision(grade) {
  const g = parseInt(grade) || 0;
  if (g <= 2)  return "K-2";
  if (g <= 4)  return "3-4";
  if (g <= 6)  return "5-6";
  if (g <= 8)  return "7-8";
  return "HS";
}
function requiresAbstract(proj) { return (parseInt(proj?.grade) || 0) >= 5; }

// CSV cell escaper. Always quotes, doubles inner quotes, and neutralises
// spreadsheet formula injection by prefixing a leading = + - @ with an apostrophe.
function csvCell(v) {
  if (v === null || v === undefined) return '""';
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

// Read a criterion value from a score row. v2 stores { criteria: {...} };
// legacy v1 rows / backups stored the criterion ids as flat top-level fields.
function critVal(scoreOrEntry, rid) {
  const src = scoreOrEntry?.criteria || scoreOrEntry || {};
  const v = src[rid];
  return v === undefined || v === null ? "" : v;
}

// IT log levels + modules
const IT_LEVELS  = ["ERROR","WARN","INFO","DEBUG"];
const IT_MODULES = { AUTH:"AUTH", JUDGE:"JUDGE", SCORE:"SCORE", ADMIN:"ADMIN", SHARE:"SHARE", SYSTEM:"SYSTEM", DB:"DB" };

// ─────────────────────────────────────────────
// SEED DEMO DATA
// ─────────────────────────────────────────────
const SEED_JUDGES = [
  { id:"j_a", alias:"Bold Falcon",  projects:["p1","p2","p3","p4"], joinedAt: Date.now()-3600000 },
  { id:"j_b", alias:"Wise Owl",     projects:["p3","p4","p5","p6"], joinedAt: Date.now()-2400000 },
  { id:"j_c", alias:"Swift Eagle",  projects:["p5","p6","p7","p8"], joinedAt: Date.now()-1800000 },
];
const SEED_SCORES = {
  "j_a_p1":{ presentation:4,testable_q:3,background:2,hypothesis:2,variables:3,materials:3,data:4,analysis:4,conclusion:3,abstract:4, notes:"Excellent methodology.", time:Date.now()-3000000 },
  "j_a_p2":{ presentation:4,testable_q:2,background:2,hypothesis:2,variables:2,materials:2,data:4,analysis:4,conclusion:2,abstract:2, notes:"Good work.",             time:Date.now()-2700000 },
  "j_b_p3":{ presentation:6,testable_q:3,background:3,hypothesis:3,variables:3,materials:3,data:6,analysis:6,conclusion:3,abstract:6, notes:"Impressive ML work.",    time:Date.now()-2000000 },
  "j_b_p4":{ presentation:4,testable_q:2,background:2,hypothesis:2,variables:2,materials:2,data:4,analysis:4,conclusion:2,abstract:4, notes:"Creative concept.",      time:Date.now()-1700000 },
  "j_c_p5":{ presentation:4,testable_q:2,background:2,hypothesis:2,variables:3,materials:3,data:4,analysis:4,conclusion:2,abstract:4, notes:"Solid research.",        time:Date.now()-1200000 },
  "j_c_p6":{ presentation:6,testable_q:3,background:3,hypothesis:3,variables:3,materials:3,data:6,analysis:6,conclusion:3,abstract:6, notes:"Outstanding project.",   time:Date.now()-900000  },
};
const SEED_LOG = [
  { time:Date.now()-900000,  msg:"Swift Eagle submitted score for Project #006" },
  { time:Date.now()-1200000, msg:"Swift Eagle submitted score for Project #005" },
  { time:Date.now()-1700000, msg:"Wise Owl submitted score for Project #004"   },
  { time:Date.now()-2000000, msg:"Wise Owl submitted score for Project #003"   },
  { time:Date.now()-2700000, msg:"Bold Falcon submitted score for Project #002" },
  { time:Date.now()-3000000, msg:"Bold Falcon submitted score for Project #001" },
];

const SEED_IT = [
  { id:"EVT-A1B2C3", ts:Date.now()-3610000, level:"INFO",  module:"SYSTEM", event:"APP_BOOT",           detail:"Application initialized successfully",                          payload:{ env:"production", version:"1.0.0", judges:0, projects:8 } },
  { id:"EVT-D4E5F6", ts:Date.now()-3605000, level:"DEBUG", module:"DB",     event:"DB_CONNECT",         detail:"Database connection established",                               payload:{ host:"supabase.co", latency_ms:42, pool:5 } },
  { id:"EVT-G7H8I9", ts:Date.now()-3600000, level:"INFO",  module:"AUTH",   event:"JUDGE_REGISTERED",   detail:"New judge registered with valid invite code",                   payload:{ judgeId:"j_a", alias:"Bold Falcon", assignedProjects:["p1","p2","p3","p4"] } },
  { id:"EVT-J0K1L2", ts:Date.now()-2410000, level:"WARN",  module:"AUTH",   event:"INVALID_INVITE_CODE",detail:"Failed registration attempt with wrong invite code",            payload:{ attemptedCode:"TEST123", ip:"192.168.1.44", timestamp: fmtISO(Date.now()-2410000) } },
  { id:"EVT-M3N4O5", ts:Date.now()-2400000, level:"INFO",  module:"AUTH",   event:"JUDGE_REGISTERED",   detail:"New judge registered with valid invite code",                   payload:{ judgeId:"j_b", alias:"Wise Owl", assignedProjects:["p3","p4","p5","p6"] } },
  { id:"EVT-P6Q7R8", ts:Date.now()-1800000, level:"INFO",  module:"AUTH",   event:"JUDGE_REGISTERED",   detail:"New judge registered with valid invite code",                   payload:{ judgeId:"j_c", alias:"Swift Eagle", assignedProjects:["p5","p6","p7","p8"] } },
  { id:"EVT-S9T0U1", ts:Date.now()-3000000, level:"INFO",  module:"SCORE",  event:"SCORE_SUBMITTED",    detail:"Judge submitted score for assigned project",                    payload:{ judgeId:"j_a", projectId:"p1", total:83, rubric:{method:17,research:13,data:16,results:17,display:12,creativity:8} } },
  { id:"EVT-V2W3X4", ts:Date.now()-2700000, level:"INFO",  module:"SCORE",  event:"SCORE_SUBMITTED",    detail:"Judge submitted score for assigned project",                    payload:{ judgeId:"j_a", projectId:"p2", total:73, rubric:{method:15,research:11,data:14,results:15,display:11,creativity:7} } },
  { id:"EVT-Y5Z6A7", ts:Date.now()-2000000, level:"INFO",  module:"SCORE",  event:"SCORE_SUBMITTED",    detail:"Judge submitted score for assigned project",                    payload:{ judgeId:"j_b", projectId:"p3", total:89, rubric:{method:18,research:14,data:18,results:17,display:13,creativity:9} } },
  { id:"EVT-B8C9D0", ts:Date.now()-1700000, level:"INFO",  module:"SCORE",  event:"SCORE_SUBMITTED",    detail:"Judge submitted score for assigned project",                    payload:{ judgeId:"j_b", projectId:"p4", total:73, rubric:{method:14,research:12,data:13,results:14,display:12,creativity:8} } },
  { id:"EVT-E1F2G3", ts:Date.now()-1200000, level:"INFO",  module:"SCORE",  event:"SCORE_SUBMITTED",    detail:"Judge submitted score for assigned project",                    payload:{ judgeId:"j_c", projectId:"p5", total:81, rubric:{method:16,research:13,data:15,results:16,display:14,creativity:7} } },
  { id:"EVT-H4I5J6", ts:Date.now()-900000,  level:"INFO",  module:"SCORE",  event:"SCORE_SUBMITTED",    detail:"Judge submitted score for assigned project",                    payload:{ judgeId:"j_c", projectId:"p6", total:92, rubric:{method:19,research:14,data:17,results:18,display:14,creativity:10} } },
  { id:"EVT-K7L8M9", ts:Date.now()-500000,  level:"WARN",  module:"AUTH",   event:"ADMIN_LOGIN_FAILED", detail:"Admin login attempted with incorrect password",                 payload:{ ip:"10.0.0.12", attempt:1 } },
  { id:"EVT-N0O1P2", ts:Date.now()-490000,  level:"INFO",  module:"AUTH",   event:"ADMIN_LOGIN_SUCCESS",detail:"Admin authenticated successfully",                              payload:{ ip:"10.0.0.12", sessionToken:"adm_***masked***" } },
  { id:"EVT-Q3R4S5", ts:Date.now()-200000,  level:"DEBUG", module:"DB",     event:"DB_QUERY",           detail:"Score read query executed",                                    payload:{ table:"scores", rows:6, latency_ms:8 } },
  { id:"EVT-T6U7V8", ts:Date.now()-100000,  level:"WARN",  module:"SCORE",  event:"ANOMALY_DETECTED",   detail:"Score deviation exceeds threshold between judges for project",  payload:{ projectId:"p1", scores:[83,92], avg:87.5, deviation:8.5, threshold:20 } },
];

// ─────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700;900&family=Source+Sans+3:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  :root{
    --bg:#ffffff;--s1:#f8fafc;--s2:#f1f5f9;--bd:#e2e8f0;
    --navy:#1e3a5f;--navy-l:#2d5a8e;
    --text:#1e293b;--dim:#64748b;
    --green:#059669;--green-l:#d1fae5;--red:#dc2626;--red-l:#fee2e2;--amber:#d97706;--amber-l:#fef3c7;
    --blue:#2563eb;--blue-l:#dbeafe;--purple:#7c3aed;--purple-l:#ede9fe;
    --r:12px;
    --ff-d:'Merriweather',Georgia,serif;
    --ff-b:'Source Sans 3','Source Sans Pro',sans-serif;
    --ff-m:'DM Mono',monospace;
    --shadow:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);
    --shadow-md:0 4px 12px rgba(0,0,0,.07),0 2px 4px rgba(0,0,0,.04);
    --shadow-lg:0 10px 30px rgba(0,0,0,.08),0 4px 8px rgba(0,0,0,.04);
  }
  body{background:var(--bg);color:var(--text);font-family:var(--ff-b);font-size:16px;line-height:1.6;overflow-x:hidden;}
  #root{min-height:100vh;position:relative;isolation:isolate;}
  #root::before{
    content:"";
    position:fixed;
    inset:0;
    z-index:-3;
    pointer-events:none;
    background:
      radial-gradient(1200px 800px at 8% -18%, #bfdbfe 0%, transparent 62%),
      radial-gradient(1000px 680px at 96% 8%, #bae6fd 0%, transparent 60%),
      linear-gradient(135deg, #edf7ff 0%, #e6f1ff 42%, #f8fbff 100%);
    animation:bgShift 18s ease-in-out infinite alternate;
  }
  .app{min-height:100vh;position:relative;z-index:1;isolation:isolate;}
  @keyframes bgShift {
    0% {
      transform: translate3d(0,0,0) scale(1);
      filter: saturate(1);
    }
    100% {
      transform: translate3d(0,-14px,0) scale(1.025);
      filter: saturate(1.08);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    #root::before{animation:none;}
  }
  .center{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:1.5rem;}
  .inner{width:100%;max-width:580px;}

  /* LANDING */
  .glow{position:fixed;top:-200px;left:50%;transform:translateX(-50%);width:700px;height:500px;
    background:radial-gradient(ellipse at 50% 0%,#1e3a5f10 0%,transparent 70%);pointer-events:none;}
  .glow.purple{background:radial-gradient(ellipse at 50% 0%,#1e3a5f08 0%,transparent 70%);}
  .school-banner{display:flex;flex-direction:column;align-items:center;gap:.6rem;margin-bottom:2rem;}
  .school-banner img{width:88px;height:88px;object-fit:contain;filter:drop-shadow(0 4px 12px rgba(30,58,95,.15));}
  .school-name{font-family:var(--ff-d);font-size:clamp(1rem,3.5vw,1.25rem);font-weight:700;
    color:var(--navy);text-align:center;letter-spacing:.01em;line-height:1.25;}
  .school-name span{color:var(--navy-l);}
  .school-div{width:48px;height:2px;background:linear-gradient(90deg,transparent,var(--navy),transparent);margin:.2rem 0;}
  .land-badge{font-family:var(--ff-m);font-size:.75rem;letter-spacing:.15em;color:var(--navy);
    border:1px solid var(--bd);border-radius:100px;padding:.35rem 1.1rem;margin-bottom:2rem;display:inline-block;
    background:var(--s1);}
  .land-h1{font-family:var(--ff-d);font-size:clamp(2rem,6vw,3.2rem);font-weight:900;text-align:center;
    line-height:1.15;margin-bottom:.9rem;color:var(--navy);}
  .land-h1 span{color:var(--green);}
  .land-p{color:var(--dim);text-align:center;max-width:420px;line-height:1.7;margin-bottom:3rem;font-size:1.05rem;}
  .role-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;width:100%;max-width:500px;}
  .role-grid.three{grid-template-columns:1fr 1fr;}
  @media(max-width:440px){.role-grid{grid-template-columns:1fr;}}
  .role-card{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:1.75rem 1.5rem;
    cursor:pointer;transition:all .2s;text-align:center;box-shadow:var(--shadow);}
  .role-card:hover{border-color:var(--navy);transform:translateY(-2px);box-shadow:var(--shadow-lg);}
  .role-card.adm:hover{border-color:var(--navy);}
  .role-card.pub{grid-column:span 2;display:flex;align-items:center;gap:1.5rem;text-align:left;
    background:linear-gradient(135deg,#f0fdf4 0%,#ffffff 60%);border-color:var(--green);}
  .role-card.pub:hover{border-color:var(--green);box-shadow:var(--shadow-lg);}
  .role-card.pub .ico{font-size:3rem;flex-shrink:0;}
  .role-card .ico{font-size:2.4rem;margin-bottom:.65rem;}
  .role-card h3{font-size:1.1rem;font-weight:700;margin-bottom:.25rem;color:var(--navy);}
  .role-card p{font-size:.9rem;color:var(--dim);}
  .pub-pill{display:inline-flex;align-items:center;gap:.35rem;background:var(--green-l);border:1px solid #05966930;
    color:var(--green);font-size:.75rem;font-family:var(--ff-m);padding:.25rem .7rem;border-radius:100px;margin-bottom:.3rem;}
  .demo-hint{margin-top:2rem;font-size:.8rem;color:var(--dim);text-align:center;}
  .demo-hint strong{color:var(--navy);font-family:var(--ff-m);}

  /* SHARED */
  .back{background:none;border:none;color:var(--dim);cursor:pointer;font-family:var(--ff-b);
    font-size:.95rem;margin-bottom:1.5rem;padding:0;display:flex;align-items:center;gap:.3rem;}
  .back:hover{color:var(--text);}
  .card{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:1.5rem;
    margin-bottom:.85rem;box-shadow:var(--shadow);}
  .lbl{font-size:.8rem;font-family:var(--ff-m);letter-spacing:.08em;color:var(--dim);text-transform:uppercase;margin-bottom:.5rem;}
  input[type=text],input[type=password],input[type=email]{width:100%;background:var(--bg);border:1.5px solid var(--bd);
    border-radius:8px;padding:.85rem 1rem;color:var(--text);font-family:var(--ff-b);font-size:1.05rem;outline:none;transition:border-color .2s;}
  input[type=text]:read-only{color:var(--navy);font-family:var(--ff-m);font-size:.9rem;letter-spacing:.03em;cursor:default;background:var(--s1);}
  input:focus{border-color:var(--navy);}
  .err{color:var(--red);font-size:.9rem;margin-top:.4rem;}
  .judge-num-hit{margin-top:.45rem;padding:.5rem .75rem;border-radius:8px;background:var(--green-l);color:var(--green);font-size:.92rem;text-align:center;}
  .judge-num-miss{margin-top:.45rem;padding:.5rem .75rem;border-radius:8px;background:var(--amber-l);color:var(--amber);font-size:.88rem;text-align:center;}
  .jn-rows{display:flex;flex-direction:column;gap:.4rem;margin:.6rem 0 .85rem;}
  .jn-row{display:flex;align-items:center;gap:.75rem;padding:.45rem .65rem;border:1px solid var(--bd);border-radius:8px;background:var(--bg);}
  .jn-row .jn-name{flex:1;min-width:0;font-weight:600;color:var(--navy);}
  .jn-row input[type=number]{width:72px;text-align:center;}
  .jn-row .jn-range{min-width:118px;text-align:right;font-family:var(--ff-m);font-size:.82rem;color:var(--dim);}
  .jn-row .jn-range.none{color:var(--amber);}
  @media (max-width:520px){ .jn-row{flex-wrap:wrap;} .jn-row .jn-name{flex-basis:100%;} .jn-row .jn-range{min-width:0;flex:1;} }
  textarea{width:100%;background:var(--bg);border:1.5px solid var(--bd);border-radius:8px;
    padding:.85rem 1rem;color:var(--text);font-family:var(--ff-b);font-size:1rem;
    outline:none;resize:vertical;min-height:90px;transition:border-color .2s;}
  textarea:focus{border-color:var(--navy);}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;background:var(--navy);
    color:#fff;border:none;border-radius:8px;padding:.9rem 1.5rem;font-family:var(--ff-b);
    font-size:1rem;font-weight:600;cursor:pointer;transition:all .2s;width:100%;box-shadow:var(--shadow);}
  .btn:hover{background:var(--navy-l);box-shadow:var(--shadow-md);}
  .btn:disabled{opacity:.4;cursor:not-allowed;}
  .btn.sec{background:var(--bg);color:var(--text);border:1.5px solid var(--bd);box-shadow:none;}
  .btn.sec:hover{border-color:var(--dim);background:var(--s1);}
  .btn.purple{background:var(--purple);color:#fff;}
  .btn.purple:hover{background:#6d28d9;}
  .btn.danger{background:var(--red);color:#fff;}
  .btn.danger:hover{background:#b91c1c;}
  .btn.sm{width:auto;padding:.5rem 1rem;font-size:.9rem;}
  .btn-row{display:flex;gap:.6rem;flex-wrap:wrap;}
  .pbar{background:var(--bd);border-radius:100px;overflow:hidden;}
  .pfill{background:linear-gradient(90deg,var(--green),#34d399);border-radius:100px;transition:width .5s ease;}
  .badge{display:inline-block;font-size:.75rem;font-family:var(--ff-m);padding:.25rem .7rem;border-radius:100px;font-weight:500;}
  .bg{background:var(--green-l);color:var(--green);}
  .ba{background:var(--amber-l);color:var(--amber);}
  .br{background:var(--red-l);color:var(--red);}
  .bb{background:var(--blue-l);color:var(--blue);}
  .bp{background:var(--purple-l);color:var(--purple);}

  /* TOGGLE */
  .toggle-wrap{display:flex;align-items:center;justify-content:space-between;padding:.65rem 0;}
  .toggle{position:relative;width:48px;height:26px;flex-shrink:0;}
  .toggle input{opacity:0;width:0;height:0;}
  .toggle-slider{position:absolute;inset:0;background:var(--bd);border-radius:100px;cursor:pointer;transition:.2s;}
  .toggle-slider:before{content:"";position:absolute;width:20px;height:20px;left:3px;top:3px;
    background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.15);}
  .toggle input:checked + .toggle-slider{background:var(--green);}
  .toggle input:checked + .toggle-slider:before{transform:translateX(22px);}

  /* JUDGE */
  .jh-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;}
  .alias-tag{font-family:var(--ff-m);font-size:.82rem;background:var(--s1);border:1px solid var(--bd);
    color:var(--navy);padding:.35rem .9rem;border-radius:100px;font-weight:500;}
  .proj-list{padding:.25rem;}
  .proj-item{display:flex;align-items:center;gap:1rem;padding:1rem .85rem;border-radius:10px;
    cursor:pointer;transition:all .15s;border:1px solid transparent;}
  .proj-item:hover{background:var(--s1);border-color:var(--bd);}
  .proj-num{font-family:var(--ff-m);font-size:.8rem;color:var(--navy);min-width:38px;font-weight:500;}
  .proj-info{flex:1;}
  .proj-title{font-size:1rem;font-weight:600;margin-bottom:.2rem;line-height:1.35;color:var(--text);}
  .proj-meta{font-size:.85rem;color:var(--dim);}
  .proj-st{font-size:.8rem;font-family:var(--ff-m);padding:.25rem .65rem;border-radius:100px;white-space:nowrap;}
  .st-done{background:var(--green-l);color:var(--green);}
  .st-pend{background:var(--s2);color:var(--dim);}
  .locked-banner{background:var(--red-l);border:1px solid #dc262630;border-radius:10px;padding:.8rem 1.1rem;
    text-align:center;font-size:.95rem;color:var(--red);margin-bottom:1rem;font-weight:500;}
  .offline-banner{background:var(--amber-l);border:1px solid #d9770630;border-radius:10px;padding:.7rem 1.1rem;
    display:flex;align-items:center;gap:.5rem;font-size:.88rem;color:var(--amber);margin-bottom:.85rem;font-weight:500;flex-wrap:wrap;}
  .offline-banner .sync-ct{font-family:var(--ff-m);font-size:.75rem;margin-left:.25rem;opacity:.8;}
  .sync-banner{background:#fff7ed;border:1px solid #fb923c55;border-radius:10px;padding:.7rem 1.1rem;
    display:flex;align-items:center;justify-content:space-between;gap:.7rem;font-size:.86rem;color:#9a3412;margin-bottom:.85rem;flex-wrap:wrap;}
  .sync-meta{font-size:.78rem;color:var(--dim);font-family:var(--ff-m);}
  .all-done{background:var(--green-l);border:1px solid #05966920;border-radius:var(--r);padding:1.5rem;text-align:center;}

  /* SCORING */
  .sc-header{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:1.35rem 1.5rem;
    margin-bottom:1rem;box-shadow:var(--shadow);}
  .sc-header h2{font-family:var(--ff-d);font-size:1.35rem;margin-bottom:.4rem;line-height:1.25;color:var(--navy);}
  .rub-item{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:1.3rem 1.5rem;
    margin-bottom:.75rem;box-shadow:var(--shadow);}
  .rub-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.3rem;}
  .rub-lbl{font-weight:700;font-size:1rem;color:var(--text);}
  .rub-val{font-family:var(--ff-m);font-size:1.1rem;color:var(--navy);white-space:nowrap;font-weight:500;}
  .rub-desc{font-size:.88rem;color:var(--dim);margin-bottom:.85rem;line-height:1.5;}
  /* wrap: labelled steps ("Very Good") are far wider than "4", and 5 of them
     overflow a phone card otherwise — the last option ended up off-screen. */
  .rub-steps{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:.5rem;}
  .rub-step-btn{flex:1;padding:.65rem 0;border:2px solid var(--bd);border-radius:8px;background:var(--s1);
    color:var(--dim);font-family:var(--ff-m);font-size:1.1rem;font-weight:600;cursor:pointer;transition:.15s;}
  .rub-step-btn:hover{border-color:var(--navy);color:var(--text);}
  .rub-step-btn.selected{background:var(--navy);border-color:var(--navy);color:#fff;box-shadow:0 2px 8px rgba(30,58,95,.35);}
  .rub-step-btn.selected:hover{background:var(--navy-l);}
  .sc-total{display:flex;align-items:center;justify-content:space-between;
    background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:1.1rem 1.5rem;
    margin-bottom:.85rem;box-shadow:var(--shadow);}
  .sc-total-num{font-family:var(--ff-d);font-size:2.4rem;font-weight:900;color:var(--navy);}

  /* ADMIN */
  .admin-wrap{display:grid;grid-template-columns:220px 1fr;min-height:100vh;}
  @media(max-width:740px){.admin-wrap{grid-template-columns:1fr;}}
  .adm-side{background:var(--navy);border-right:none;padding:1.5rem 1rem;
    position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:.25rem;overflow-y:auto;}
  @media(max-width:740px){.adm-side{height:auto;position:static;flex-direction:row;flex-wrap:wrap;align-items:center;padding:1rem;gap:.4rem;}}
  .adm-brand{font-family:var(--ff-d);font-size:1.15rem;color:#fff;margin-bottom:1.5rem;font-weight:700;}
  @media(max-width:740px){.adm-brand{margin:0;flex:1;}}
  .nav-it{display:flex;align-items:center;gap:.6rem;padding:.65rem .9rem;border-radius:8px;
    cursor:pointer;font-size:.92rem;color:rgba(255,255,255,.65);transition:all .15s;border:1px solid transparent;}
  .nav-it:hover{background:rgba(255,255,255,.1);color:#fff;}
  .nav-it.act{background:rgba(255,255,255,.15);color:#fff;border-color:rgba(255,255,255,.1);}
  .adm-main{padding:2rem;overflow-y:auto;background:var(--s1);}
  @media(max-width:480px){.adm-main{padding:1rem;}}
  .adm-h1{font-family:var(--ff-d);font-size:1.6rem;margin-bottom:.25rem;color:var(--navy);}
  .adm-sub{color:var(--dim);font-size:.92rem;margin-bottom:1.75rem;}
  .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.85rem;margin-bottom:1.75rem;}
  .stat-card{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:1.3rem;box-shadow:var(--shadow);}
  .stat-v{font-family:var(--ff-d);font-size:2rem;font-weight:900;line-height:1;margin-bottom:.25rem;}
  .stat-l{font-size:.78rem;color:var(--dim);font-family:var(--ff-m);}
  .sec-title{font-family:var(--ff-d);font-size:1.15rem;margin-bottom:1rem;color:var(--navy);}
  .tbl-wrap{overflow-x:auto;}
  table{width:100%;border-collapse:collapse;font-size:.95rem;}
  th{font-family:var(--ff-m);font-size:.75rem;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;
    padding:.6rem 1rem;border-bottom:2px solid var(--bd);text-align:left;white-space:nowrap;}
  td{padding:.75rem 1rem;border-bottom:1px solid var(--bd);vertical-align:middle;}
  tr:last-child td{border-bottom:none;}
  tr:hover td{background:var(--s1);}
  .log-row{display:flex;align-items:flex-start;gap:.9rem;padding:.7rem 0;border-bottom:1px solid var(--bd);font-size:.95rem;}
  .log-t{font-family:var(--ff-m);color:var(--dim);font-size:.8rem;white-space:nowrap;min-width:60px;}
  .alert-box{display:flex;align-items:flex-start;gap:.85rem;background:var(--amber-l);border:1px solid #d9770630;
    border-radius:10px;padding:1.1rem 1.3rem;margin-bottom:.7rem;}
  .alert-ico{font-size:1.3rem;flex-shrink:0;margin-top:.1rem;}
  .alert-msg strong{display:block;margin-bottom:.25rem;font-size:.95rem;color:var(--text);}
  .alert-msg span{font-size:.9rem;color:var(--dim);}
  .sys-row{display:flex;align-items:center;justify-content:space-between;padding:.7rem 0;border-bottom:1px solid var(--bd);font-size:.95rem;}
  .sys-row:last-child{border:none;}

  /* SHARE */
  .share-status{display:flex;align-items:center;gap:.65rem;padding:1.1rem 1.3rem;border-radius:10px;margin-bottom:1.2rem;}
  .share-status.on{background:var(--green-l);border:1px solid #05966930;color:var(--green);}
  .share-status.off{background:var(--s1);border:1px solid var(--bd);color:var(--dim);}
  .link-box{display:flex;gap:.5rem;align-items:stretch;}
  .link-box input{flex:1;}
  .copy-btn{background:var(--s1);border:1.5px solid var(--bd);border-radius:8px;padding:.75rem 1rem;
    color:var(--text);cursor:pointer;font-size:.9rem;white-space:nowrap;transition:all .15s;font-family:var(--ff-b);}
  .copy-btn:hover{border-color:var(--navy);color:var(--navy);}
  .copy-btn.copied{border-color:var(--green);color:var(--green);}
  .token-pill{display:inline-flex;align-items:center;gap:.35rem;background:var(--purple-l);border:1px solid #7c3aed30;
    color:var(--purple);font-family:var(--ff-m);font-size:.82rem;padding:.35rem .85rem;border-radius:100px;}
  .expiry-row{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem;}
  .expiry-opt{padding:.5rem 1rem;border-radius:8px;border:1.5px solid var(--bd);background:var(--bg);
    color:var(--dim);font-size:.9rem;cursor:pointer;transition:all .15s;}
  .expiry-opt:hover{border-color:var(--navy);color:var(--text);}
  .expiry-opt.sel{border-color:var(--navy);color:var(--navy);background:#1e3a5f08;font-weight:600;}
  .sec-notes div{font-size:.9rem;color:var(--dim);line-height:1.8;}
  .sec-notes strong{color:var(--text);}

  /* PUBLIC RESULTS */
  .pub-wrap{min-height:100vh;padding:2rem 1rem 3rem;background:linear-gradient(180deg,var(--s1) 0%,var(--bg) 30%);}
  .pub-inner{max-width:780px;margin:0 auto;}
  .pub-hero{text-align:center;padding:2.5rem 1rem 1.5rem;position:relative;}
  .pub-hero h1{font-family:var(--ff-d);font-size:clamp(1.8rem,5vw,2.8rem);margin-bottom:.5rem;line-height:1.2;color:var(--navy);}
  .pub-hero p{color:var(--dim);font-size:.95rem;margin-top:.3rem;}
  .live-chip{display:inline-flex;align-items:center;gap:.4rem;background:var(--green-l);border:1px solid #05966920;
    color:var(--green);font-size:.78rem;font-family:var(--ff-m);padding:.35rem .9rem;border-radius:100px;margin-top:.75rem;}
  .podium-wrap{display:flex;align-items:flex-end;justify-content:center;gap:.85rem;margin:2rem 0 2.5rem;flex-wrap:wrap;}
  .podium-card{background:var(--bg);border:1px solid var(--bd);border-radius:16px;padding:1.5rem 1.25rem;text-align:center;
    transition:transform .2s,box-shadow .2s;cursor:default;box-shadow:var(--shadow-md);}
  .podium-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg);}
  .podium-card.p1{border-color:#d97706;background:linear-gradient(160deg,#fffbeb,#ffffff);
    box-shadow:0 8px 30px rgba(217,119,6,.12);}
  .podium-card.p2{border-color:#94a3b8;background:linear-gradient(160deg,#f8fafc,#ffffff);}
  .podium-card.p3{border-color:#b45309;background:linear-gradient(160deg,#fffbeb,#ffffff);}
  .p-medal{font-size:2.5rem;margin-bottom:.4rem;}
  .p-score{font-family:var(--ff-d);font-size:2.4rem;font-weight:900;}
  .p-title{font-size:.85rem;color:var(--dim);margin-top:.4rem;line-height:1.4;max-width:150px;margin-inline:auto;}
  .p-cat{margin-top:.5rem;}
  .p-revs{font-size:.78rem;color:var(--dim);margin-top:.25rem;}
  .results-table{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;
    margin-bottom:1.5rem;box-shadow:var(--shadow);}
  .res-row{display:grid;grid-template-columns:50px 1fr auto;align-items:center;gap:1rem;padding:1.1rem 1.35rem;
    border-bottom:1px solid var(--bd);transition:background .15s;}
  .res-row:last-child{border:none;}
  .res-row:hover{background:var(--s1);}
  .res-rank{font-family:var(--ff-m);font-size:.88rem;color:var(--dim);text-align:center;font-weight:500;}
  .res-title{font-size:1rem;font-weight:600;margin-bottom:.2rem;line-height:1.35;color:var(--text);}
  .res-meta{font-size:.82rem;color:var(--dim);margin-bottom:.4rem;}
  .rub-chips{display:flex;gap:.35rem;flex-wrap:wrap;}
  .rub-chip{font-size:.72rem;font-family:var(--ff-m);background:var(--s2);border:1px solid var(--bd);
    padding:.2rem .55rem;border-radius:100px;color:var(--dim);}
  .res-score{text-align:right;flex-shrink:0;}
  .res-score-big{font-family:var(--ff-d);font-size:1.8rem;color:var(--navy);font-weight:900;}
  .res-score-sub{font-size:.78rem;color:var(--dim);}
  .pub-footer{text-align:center;padding:1.5rem 1rem;font-size:.82rem;color:var(--dim);line-height:1.8;
    border-top:1px solid var(--bd);margin-top:1rem;}

  /* IT LOGS — STAYS DARK THEMED */
  .it-toolbar{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:1.1rem;}
  .lvl-btn{padding:.4rem .9rem;border-radius:8px;border:1px solid #1c2e4a;background:#0d1b30;
    font-family:var(--ff-m);font-size:.78rem;cursor:pointer;transition:all .15s;color:#6b7fa3;}
  .lvl-btn:hover{border-color:#a37010;color:#e2e8f5;}
  .lvl-btn.f-ALL{border-color:#e2e8f5;color:#e2e8f5;}
  .lvl-btn.f-ERROR{border-color:#ef4444;color:#ef4444;background:#3a1010;}
  .lvl-btn.f-WARN{border-color:#f59e0b;color:#f59e0b;background:#382a0a;}
  .lvl-btn.f-INFO{border-color:#60a5fa;color:#60a5fa;background:#102040;}
  .lvl-btn.f-DEBUG{border-color:#a78bfa;color:#a78bfa;background:#2d1b69;}
  .it-term{background:#020c16;border:1px solid #0e2235;border-radius:var(--r);overflow:hidden;font-family:var(--ff-m);}
  .it-term-head{display:flex;align-items:center;justify-content:space-between;padding:.6rem 1rem;
    background:#040f1c;border-bottom:1px solid #0e2235;gap:.75rem;flex-wrap:wrap;}
  .it-term-dots{display:flex;gap:.4rem;}
  .it-term-dots span{width:10px;height:10px;border-radius:50%;display:inline-block;}
  .it-body{max-height:520px;overflow-y:auto;padding:.5rem 0;}
  .it-row{display:grid;grid-template-columns:200px 54px 70px 1fr;gap:.5rem 1rem;
    padding:.5rem 1rem;border-bottom:1px solid #0e2235;font-size:.8rem;align-items:start;cursor:pointer;transition:background .1s;}
  .it-row:last-child{border:none;}
  .it-row:hover{background:#0a1a2a;}
  .it-row.expanded{background:#0a1a2a;}
  .it-ts{color:#3a6080;white-space:nowrap;font-size:.74rem;}
  .it-lvl{font-weight:500;text-align:center;}
  .it-lvl.ERROR{color:#ef4444;}
  .it-lvl.WARN{color:#f59e0b;}
  .it-lvl.INFO{color:#60a5fa;}
  .it-lvl.DEBUG{color:#a78bfa;}
  .it-mod{color:#3a8060;font-size:.74rem;}
  .it-msg{color:#9ab8cc;}
  .it-msg strong{color:#cde;font-weight:500;}
  .it-payload{grid-column:1/-1;background:#030d18;border:1px solid #0e2235;border-radius:8px;
    padding:.7rem 1rem;margin:.2rem 0 .3rem;font-size:.78rem;color:#7aa0b8;white-space:pre-wrap;
    word-break:break-all;line-height:1.65;}
  .it-empty{text-align:center;padding:3rem 1rem;color:#3a6080;font-size:.88rem;}
  .copy-report-btn{display:flex;align-items:center;gap:.4rem;background:#0a1a2a;border:1px solid #0e2235;
    border-radius:8px;padding:.5rem 1rem;color:#60a5fa;font-family:var(--ff-m);font-size:.78rem;
    cursor:pointer;transition:all .15s;white-space:nowrap;}
  .copy-report-btn:hover{border-color:#3b82f6;background:#0d2035;}
  .copy-report-btn.done{border-color:#22c55e;color:#22c55e;}
  .it-count{font-family:var(--ff-m);font-size:.78rem;color:#6b7fa3;}
  .snap-box{background:#020c16;border:1px solid #0e2235;border-radius:var(--r);padding:1.1rem 1.25rem;
    margin-bottom:1rem;font-family:var(--ff-m);font-size:.78rem;color:#7aa0b8;white-space:pre-wrap;
    line-height:1.7;max-height:240px;overflow-y:auto;}
  /* IT logs section dark wrapper */
  .it-dark-wrap{background:#07101f;color:#e2e8f5;border-radius:var(--r);padding:2rem;margin:-2rem;min-height:calc(100vh - 4rem);}
  @media(max-width:480px){.it-dark-wrap{padding:1rem;margin:-1rem;}}

  /* IT PIN GATE */
  .pin-gate{display:flex;flex-direction:column;align-items:center;justify-content:center;
    min-height:340px;text-align:center;padding:2rem;}
  .pin-gate .ico{font-size:3rem;margin-bottom:1rem;}
  .pin-gate h2{font-family:var(--ff-d);font-size:1.5rem;margin-bottom:.4rem;color:var(--navy);}
  .pin-gate p{color:var(--dim);font-size:.92rem;margin-bottom:1.75rem;max-width:340px;}
  .pin-dots{display:flex;gap:.7rem;justify-content:center;margin-bottom:1.25rem;}
  .pin-dot{width:16px;height:16px;border-radius:50%;border:2px solid var(--bd);
    background:var(--bg);transition:all .2s;}
  .pin-dot.filled{background:var(--navy);border-color:var(--navy);box-shadow:0 0 8px rgba(30,58,95,.3);}
  .pin-input-wrap{position:relative;width:200px;}
  .pin-input-wrap input[type=password]{
    text-align:center;letter-spacing:.5em;font-family:var(--ff-m);font-size:1.4rem;
    border-color:var(--bd);padding:1rem 1rem;}
  .pin-input-wrap input[type=password]:focus{border-color:var(--navy);}
  .pin-err{color:var(--red);font-size:.88rem;margin-top:.5rem;min-height:1.2em;}
  .pin-shake{animation:shake .35s ease;}
  @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
  .it-lock-badge{display:flex;align-items:center;gap:.4rem;font-family:var(--ff-m);font-size:.75rem;
    color:#6b7fa3;background:#0d1b30;border:1px solid #1c2e4a;padding:.3rem .8rem;border-radius:100px;cursor:pointer;}
  .it-lock-badge:hover{border-color:#ef4444;color:#ef4444;}

  /* RESET MODAL */
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;z-index:999;padding:1.5rem;}
  .modal-box{background:var(--bg);border:1px solid #dc262640;border-radius:16px;
    padding:2.25rem 2rem;width:100%;max-width:440px;text-align:center;
    box-shadow:0 24px 80px rgba(220,38,38,.1);}
  .modal-box .ico{font-size:3rem;margin-bottom:.75rem;}
  .modal-box h2{font-family:var(--ff-d);font-size:1.5rem;margin-bottom:.4rem;color:var(--red);}
  .modal-box p{color:var(--dim);font-size:.92rem;line-height:1.6;margin-bottom:1.5rem;}
  .modal-box .warn-list{background:var(--red-l);border:1px solid #dc262620;border-radius:10px;
    padding:.9rem 1.1rem;margin-bottom:1.5rem;text-align:left;}
  .modal-box .warn-list div{font-size:.88rem;color:var(--red);line-height:1.8;display:flex;gap:.4rem;}
  .modal-box .warn-list div::before{content:"\\2717";color:var(--red);flex-shrink:0;}
  .modal-pin-label{font-family:var(--ff-m);font-size:.78rem;letter-spacing:.1em;color:var(--dim);
    text-transform:uppercase;margin-bottom:.6rem;}
  .modal-pin-dots{display:flex;gap:.65rem;justify-content:center;margin-bottom:.85rem;}
  .modal-pin-dot{width:14px;height:14px;border-radius:50%;border:2px solid #dc262640;
    background:var(--bg);transition:all .2s;}
  .modal-pin-dot.filled{background:var(--red);border-color:var(--red);box-shadow:0 0 8px rgba(220,38,38,.3);}
  .modal-btn-row{display:flex;gap:.65rem;margin-top:1rem;}
  .nav-it.reset{color:#fca5a5;border-color:transparent;}
  .nav-it.reset:hover{background:rgba(220,38,38,.15);border-color:rgba(220,38,38,.3);color:#fca5a5;}

  /* DELIBERATION */
  .delib-section{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:1.5rem;margin-top:1rem;}
  .delib-proj{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:1.25rem;margin-bottom:.75rem;box-shadow:var(--shadow);}
  .delib-proj-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:.75rem;flex-wrap:wrap;}
  .delib-rec-select{width:100%;background:var(--bg);border:1.5px solid var(--bd);border-radius:8px;
    padding:.75rem 1rem;color:var(--text);font-family:var(--ff-b);font-size:.95rem;outline:none;cursor:pointer;}
  .delib-rec-select:focus{border-color:var(--navy);}
  .delib-flag-wrap{display:flex;align-items:center;gap:.6rem;margin-top:.75rem;padding:.6rem .8rem;
    background:var(--s1);border:1px solid var(--bd);border-radius:8px;cursor:pointer;transition:background .15s;}
  .delib-flag-wrap:hover{background:var(--s2);}
  .delib-flag-wrap input[type=checkbox]{width:18px;height:18px;accent-color:var(--amber);cursor:pointer;}
  .delib-submitted{display:flex;align-items:center;gap:.5rem;color:var(--green);font-size:.88rem;font-weight:500;
    padding:.6rem .8rem;background:var(--green-l);border:1px solid #05966920;border-radius:8px;}
  .delib-comment-card{background:var(--s1);border:1px solid var(--bd);border-radius:10px;padding:1rem;margin-bottom:.6rem;}
  .delib-comment-alias{font-family:var(--ff-m);font-size:.78rem;color:var(--navy);margin-bottom:.3rem;}
  .delib-comment-text{font-size:.9rem;color:var(--text);line-height:1.6;margin-bottom:.4rem;}
  .delib-comment-meta{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;}
  .delib-rec-pill{display:inline-block;font-size:.72rem;font-family:var(--ff-m);padding:.2rem .6rem;border-radius:100px;}
  .delib-rec-pill.award{background:var(--green-l);color:var(--green);}
  .delib-rec-pill.strong{background:var(--blue-l);color:var(--blue);}
  .delib-rec-pill.good{background:var(--amber-l);color:var(--amber);}
  .delib-rec-pill.needs{background:var(--red-l);color:var(--red);}
  .delib-flag-badge{display:inline-flex;align-items:center;gap:.25rem;font-size:.72rem;font-family:var(--ff-m);
    background:var(--amber-l);border:1px solid #d9770630;color:var(--amber);padding:.2rem .6rem;border-radius:100px;}
  .delib-discuss{display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;font-family:var(--ff-m);
    background:var(--red-l);border:1px solid #dc262620;color:var(--red);padding:.3rem .7rem;border-radius:100px;}
  .delib-phase-toggle{display:flex;align-items:center;gap:1rem;padding:1rem 1.3rem;
    background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);margin-bottom:1rem;box-shadow:var(--shadow);}
  /* VALIDATION */
  .val-status-pill{display:inline-block;font-size:.75rem;font-family:var(--ff-m);font-weight:600;padding:.25rem .7rem;border-radius:100px;}
  .val-status-pill.approved{background:var(--green-l);color:var(--green);}
  .val-status-pill.concern{background:var(--amber-l);color:var(--amber);}
  .val-status-pill.pending{background:var(--s2);color:var(--dim);}
  .val-stat-pill{display:inline-flex;align-items:center;gap:.35rem;font-size:.78rem;font-family:var(--ff-m);font-weight:600;padding:.3rem .8rem;border-radius:100px;}
  .val-stat-pill.green{background:var(--green-l);color:var(--green);}
  .val-stat-pill.red{background:var(--red-l);color:var(--red);}
  .val-stat-pill.dim{background:var(--s2);color:var(--dim);}
  .val-consensus-card{padding:1rem 1.25rem;border-radius:var(--r);border:1px solid var(--bd);background:var(--s1);margin-bottom:1rem;}
  .val-consensus-card.reached{background:var(--green-l);border-color:#05966930;}
  .val-tie-alert{display:flex;align-items:center;gap:.75rem;padding:.9rem 1.1rem;background:var(--amber-l);border:1px solid #d9770630;border-radius:var(--r);margin-bottom:1rem;color:var(--amber);}
  .val-finalized-banner{display:flex;align-items:center;gap:.85rem;padding:1rem 1.25rem;background:var(--green-l);border:1px solid #05966930;border-radius:var(--r);margin-bottom:1.25rem;}
  .btn.amber{background:var(--amber);color:#fff;}
  .delib-finalized{background:var(--green-l);border:1px solid #05966920;border-radius:10px;
    padding:.6rem 1rem;display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap;}
  .award-badge{display:inline-flex;align-items:center;gap:.35rem;font-family:var(--ff-m);font-size:.82rem;
    padding:.35rem .85rem;border-radius:100px;font-weight:600;}
  .award-badge.gold{background:var(--amber-l);color:var(--amber);border:1px solid #d9770630;}
  .award-badge.silver{background:var(--s2);color:var(--dim);border:1px solid var(--bd);}
  .award-badge.bronze{background:#fef3c7;color:#92400e;border:1px solid #92400e30;}
  .award-badge.hm{background:var(--purple-l);color:var(--purple);border:1px solid #7c3aed30;}
  .award-badge.best{background:var(--blue-l);color:var(--blue);border:1px solid #2563eb30;}
  .award-badge.none{background:var(--s2);color:var(--dim);border:1px solid var(--bd);}
  .award-badge.sm{font-size:.7rem;padding:.2rem .6rem;}

  /* PROJECT MANAGEMENT */
  .proj-mgmt-card{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:1.1rem 1.25rem;
    margin-bottom:.6rem;box-shadow:var(--shadow);transition:border-color .15s;}
  .proj-mgmt-card.is-locked{border-color:var(--amber);background:#fef3c705;}
  .proj-mgmt-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;}
  .proj-mgmt-actions{display:flex;gap:.35rem;flex-shrink:0;align-items:center;}
  .proj-act-btn{padding:.35rem .65rem;border-radius:6px;border:1px solid var(--bd);background:var(--bg);
    font-family:var(--ff-m);font-size:.72rem;cursor:pointer;transition:all .15s;color:var(--dim);}
  .proj-act-btn:hover{border-color:var(--navy);color:var(--navy);}
  .proj-act-btn.lock{color:var(--amber);border-color:var(--amber)30;}
  .proj-act-btn.lock:hover{background:var(--amber-l);}
  .proj-act-btn.unlock{color:var(--green);border-color:var(--green)30;}
  .proj-act-btn.unlock:hover{background:var(--green-l);}
  .proj-act-btn.edit{color:var(--blue);border-color:var(--blue)30;}
  .proj-act-btn.edit:hover{background:var(--blue-l);}
  .proj-act-btn.del{color:var(--red);border-color:var(--red)30;}
  .proj-act-btn.del:hover{background:var(--red-l);}
  .proj-act-btn:disabled{opacity:.3;cursor:not-allowed;}
  .proj-act-btn:disabled:hover{border-color:var(--bd);color:var(--dim);background:var(--bg);}

  /* Scoring buttons that carry a rating word (rubric stepLabels), e.g. the
     Cibecue 100-pt preset where the same rating is a different number per section. */
  /* flex-basis (not min-width) so they shrink to fit and wrap to a second row on a
     phone instead of overflowing the card. */
  .rub-step-btn.labelled{display:flex;flex-direction:column;align-items:center;gap:.1rem;
    line-height:1.15;padding:.5rem .3rem;flex:1 1 84px;}
  .rub-step-lab{font-size:.74rem;font-weight:600;font-family:var(--ff-b);}
  .rub-step-pts{font-size:.68rem;opacity:.65;font-family:var(--ff-m);}

  /* Comment-only (feedback) departments — PreK / K-2 */
  .fb-banner{background:var(--purple-l);border:1px solid #7c3aed30;border-radius:var(--r);
    padding:.85rem 1rem;margin-bottom:.9rem;font-size:.88rem;color:var(--purple);line-height:1.5;}
  .fb-chips{display:flex;flex-wrap:wrap;gap:.45rem;}
  .fb-chip{padding:.5rem .8rem;border:2px solid var(--bd);border-radius:999px;background:var(--s1);
    color:var(--text);font-family:var(--ff-b);font-size:.84rem;cursor:pointer;transition:.15s;}
  .fb-chip:hover{border-color:var(--purple);color:var(--purple);}
  .fb-chip.selected{background:var(--purple);border-color:var(--purple);color:#fff;}
  .setup-mode{padding:.28rem .4rem;border:1px solid var(--bd);border-radius:6px;background:var(--bg);
    font-family:var(--ff-b);font-size:.76rem;color:var(--text);cursor:pointer;max-width:150px;}

  /* ── Setup tab: departments + project categories ── */
  .setup-rows{display:flex;flex-direction:column;gap:.4rem;margin-bottom:1rem;}
  .setup-row{display:flex;align-items:center;gap:.6rem;padding:.55rem .7rem;background:var(--s1);
    border:1px solid var(--bd);border-radius:10px;}
  .setup-ord{display:flex;flex-direction:column;gap:.15rem;flex-shrink:0;}
  /* Tablets are the primary device: 17px-tall arrows were close to untappable.
     Keep them compact but give each a real touch target. */
  .setup-ord .proj-act-btn{padding:0 .45rem;font-size:.75rem;line-height:1;min-height:26px;}
  @media(max-width:640px){ .setup-ord .proj-act-btn{min-height:32px;padding:0 .6rem;} }
  .setup-main{flex:1;min-width:0;}
  .setup-name{font-weight:600;font-size:.92rem;color:var(--text);word-break:break-word;}
  .setup-meta{font-size:.76rem;color:var(--dim);font-family:var(--ff-m);margin-top:.15rem;}
  .setup-acts{display:flex;align-items:center;gap:.4rem;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;}
  .setup-maxj{font-size:.76rem;color:var(--dim);display:flex;align-items:center;gap:.35rem;white-space:nowrap;}
  .setup-maxj input[type=number]{width:58px;padding:.25rem .4rem;border:1px solid var(--bd);
    border-radius:6px;font-family:var(--ff-m);font-size:.82rem;}
  .setup-edit{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;}
  .setup-edit input[type=text]{flex:1;min-width:140px;margin:0;}
  .setup-code-in{max-width:88px;flex:0 0 88px !important;text-transform:uppercase;font-family:var(--ff-m);}
  .setup-add{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;padding-top:.3rem;}
  .setup-add input[type=text]{flex:1;min-width:150px;margin:0;}
  .setup-presets{margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--bd);}
  .setup-preset-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:.5rem;}
  .setup-preset{text-align:left;padding:.7rem .85rem;border:1px solid var(--bd);border-radius:10px;
    background:var(--bg);cursor:pointer;transition:all .15s;display:flex;flex-direction:column;gap:.2rem;}
  .setup-preset:hover{border-color:var(--navy);background:var(--s1);}
  .setup-preset strong{font-size:.86rem;color:var(--navy);}
  .setup-preset span{font-size:.76rem;color:var(--dim);line-height:1.4;}
  .setup-preset em{font-size:.72rem;color:var(--dim);font-family:var(--ff-m);font-style:normal;opacity:.8;margin-top:.15rem;}
  /* 900px, not 640: a department row carries max-judges + the scoring-mode select +
     rename + delete. On a tablet that cluster squeezed the name column to ~110px and
     "K-2 · 10 projects · 2/8 judges" wrapped onto three lines. Below this width the
     controls get their own full line instead. */
  @media(max-width:900px){
    .setup-row{flex-wrap:wrap;}
    /* Only DEPARTMENT rows need the full-width control bar — they carry max-judges
       and the mode select. A category row has just two buttons, so giving it the
       same treatment left a band of dead space under every category. */
    .setup-row.dept .setup-acts{width:100%;justify-content:flex-end;}
    .setup-acts{justify-content:flex-end;}
    .setup-maxj{margin-right:auto;}
    /* Give the name its own full-width line; code + Add share the next one. */
    .setup-add input[type=text]:not(.setup-code-in){flex:1 0 100%;}
  }
  .proj-form{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:1.25rem;margin-bottom:.75rem;}
  .proj-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:.65rem;}
  .proj-form-grid.full{grid-template-columns:1fr;}
  .member-row{display:flex;gap:.4rem;align-items:center;margin-bottom:.35rem;}
  .member-row input{flex:1;min-width:0;}
  .member-row input.member-grade{flex:0 0 72px;}
  /* Admin Help & FAQ */
  .help-card{margin-bottom:.85rem;}
  .help-title{font-family:var(--ff-d);font-size:1.02rem;color:var(--navy);margin-bottom:.55rem;}
  .help-list{margin:0 0 0 1.1rem;padding:0;font-size:.88rem;line-height:1.55;}
  .help-list li{margin-bottom:.35rem;}
  .help-faq{border-top:1px solid var(--bd);padding:.55rem 0;font-size:.88rem;}
  .help-faq summary{cursor:pointer;font-weight:600;color:var(--text);}
  .help-faq div{margin-top:.4rem;color:var(--dim);line-height:1.55;}
  /* Participation-form scanner */
  .scan-panel{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:1rem 1.1rem;margin-bottom:.75rem;}
  .scan-actions{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;margin-top:.65rem;}
  .scan-summary{display:flex;gap:.9rem;flex-wrap:wrap;align-items:center;font-size:.78rem;color:var(--dim);
    margin-top:.75rem;padding:.55rem .7rem;background:var(--bg);border:1px solid var(--bd);border-radius:8px;}
  .scan-card{display:flex;gap:.9rem;background:var(--bg);border:1px solid var(--bd);border-radius:10px;padding:.8rem;margin-top:.65rem;}
  .scan-card.error{border-color:var(--red);}
  .scan-card.saved{opacity:.7;}
  /* The photo stays in view while the admin checks the fields beside it. */
  .scan-thumb{flex:0 0 240px;align-self:flex-start;position:sticky;top:1rem;display:block;text-decoration:none;color:var(--dim);}
  .scan-thumb img{width:100%;border-radius:6px;border:1px solid var(--bd);display:block;}
  .scan-thumb.pdf{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.3rem;font-size:2rem;
    min-height:110px;background:var(--s2);border-radius:6px;}
  .scan-thumb.pdf span{font-size:.7rem;font-family:var(--ff-m);}
  .scan-body{flex:1;min-width:0;}
  .scan-file{font-family:var(--ff-m);font-size:.72rem;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .scan-unsure{border-color:var(--amber)!important;background:var(--amber-l)!important;}
  .scan-msg{font-size:.78rem;line-height:1.4;padding:.45rem .65rem;border-radius:6px;margin-top:.45rem;}
  .scan-msg.err{background:var(--red-l);color:var(--red);}
  .scan-msg.warn{background:var(--amber-l);color:#92400e;}
  .scan-msg.info{background:var(--blue-l);color:var(--blue);}
  .scan-msg.ok{background:var(--green-l);color:var(--green);}
  @media(max-width:900px){ .scan-thumb{flex-basis:160px;} }
  @media(max-width:640px){
    .scan-card{flex-direction:column;}
    .scan-thumb{position:static;flex-basis:auto;width:100%;max-width:none;}
    .scan-thumb img{max-height:340px;object-fit:contain;background:var(--s2);}
    .scan-thumb.pdf{min-height:70px;flex-direction:row;}
    .scan-card .proj-form-grid, .proj-form .proj-form-grid{grid-template-columns:1fr;}
  }
  .proj-lock-badge{display:inline-flex;align-items:center;gap:.25rem;font-size:.68rem;font-family:var(--ff-m);
    color:var(--amber);background:var(--amber-l);padding:.15rem .5rem;border-radius:100px;}

  /* REGISTRATION FORM */
  .reg-wrap{min-height:100vh;padding:2rem 1rem 3rem;background:linear-gradient(180deg,var(--s1) 0%,var(--bg) 30%);}
  .reg-inner{max-width:680px;margin:0 auto;}
  .reg-hero{text-align:center;padding:2rem 1rem 1.5rem;}
  .reg-section{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:1.5rem;margin-bottom:1rem;box-shadow:var(--shadow);}
  .reg-section-title{font-family:var(--ff-d);font-size:1.05rem;color:var(--navy);margin-bottom:1.1rem;padding-bottom:.6rem;border-bottom:1px solid var(--bd);}
  .reg-field{margin-bottom:1rem;}
  .reg-field:last-child{margin-bottom:0;}
  .reg-req{color:var(--red);margin-left:.15rem;}
  .reg-radio-group{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.35rem;}
  .reg-radio-item{display:flex;align-items:center;gap:.4rem;padding:.5rem .85rem;border:1.5px solid var(--bd);border-radius:8px;cursor:pointer;transition:all .15s;font-size:.92rem;user-select:none;}
  .reg-radio-item:hover{border-color:var(--navy-l);}
  .reg-radio-item.sel{border-color:var(--navy);background:#1e3a5f08;color:var(--navy);font-weight:600;}
  .reg-radio-item input{display:none;}
  .reg-check-item{display:flex;align-items:flex-start;gap:.65rem;padding:.75rem;background:var(--s1);border:1px solid var(--bd);border-radius:8px;cursor:pointer;transition:background .15s;margin-top:.35rem;}
  .reg-check-item:hover{background:var(--s2);}
  .reg-check-item input[type=checkbox]{width:18px;height:18px;flex-shrink:0;margin-top:.1rem;accent-color:var(--navy);cursor:pointer;}
  .reg-check-label{font-size:.88rem;color:var(--text);line-height:1.5;}
  .reg-success{text-align:center;padding:2.5rem 1.5rem;}
  .reg-success .ico{font-size:3.5rem;margin-bottom:1rem;}
  .reg-success h2{font-family:var(--ff-d);font-size:1.5rem;color:var(--navy);margin-bottom:.4rem;}
  .reg-number-wrap{background:var(--green-l);border:1px solid #05966930;border-radius:var(--r);padding:1.5rem;margin:1.25rem 0;text-align:center;}
  .reg-number-display{font-family:var(--ff-m);font-size:2.2rem;font-weight:700;color:var(--navy);letter-spacing:.05em;margin:.35rem 0;}
  .reg-invalid-banner{background:var(--red-l);border:1px solid #dc262630;border-radius:var(--r);padding:2rem;text-align:center;margin:2rem auto;max-width:480px;}
  .reg-instructions{background:linear-gradient(135deg,#eef4ff,#f0fdf4);border:1.5px solid #2563eb30;border-radius:var(--r);padding:1.5rem;margin-bottom:1.25rem;}
  .reg-instructions-title{font-family:var(--ff-d);font-size:1rem;color:var(--navy);font-weight:700;margin-bottom:.85rem;display:flex;align-items:center;gap:.5rem;}
  .reg-instructions ol{margin:0;padding-left:1.4rem;}
  .reg-instructions li{font-size:.88rem;color:var(--text);line-height:1.65;margin-bottom:.4rem;}
  .reg-instructions li:last-child{margin-bottom:0;}
  .reg-instructions li strong{color:var(--navy);}
  .reg-instructions li em{color:var(--blue);font-style:normal;font-weight:600;}
  .reg-num-pill{font-family:var(--ff-m);font-size:.78rem;background:var(--blue-l);color:var(--blue);padding:.2rem .6rem;border-radius:100px;}
  select.reg-select{width:100%;background:var(--bg);border:1.5px solid var(--bd);border-radius:8px;padding:.85rem 1rem;color:var(--text);font-family:var(--ff-b);font-size:1rem;outline:none;cursor:pointer;transition:border-color .2s;}
  select.reg-select:focus{border-color:var(--navy);}

  /* RUBRIC EDITOR */
  .rub-editor-row{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:.6rem;}
  @media(max-width:640px){.rub-editor-row{grid-template-columns:1fr;}}
  .rub-editor-card{background:var(--bg);border:1.5px solid var(--bd);border-radius:var(--r);padding:1rem;margin-bottom:.6rem;transition:border-color .15s;}
  .rub-editor-card:focus-within{border-color:var(--navy);}
  .rub-editor-head{display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem;}
  .rub-editor-num{font-family:var(--ff-m);font-size:.72rem;color:var(--dim);background:var(--s2);padding:.2rem .55rem;border-radius:100px;flex-shrink:0;}
  .rub-editor-actions{display:flex;gap:.3rem;margin-left:auto;flex-shrink:0;}
  .rub-move-btn{padding:.3rem .55rem;border-radius:6px;border:1px solid var(--bd);background:var(--bg);font-size:.78rem;cursor:pointer;color:var(--dim);}
  .rub-move-btn:hover:not(:disabled){border-color:var(--navy);color:var(--navy);}
  .rub-move-btn:disabled{opacity:.3;cursor:default;}
  .rub-del-btn{padding:.3rem .55rem;border-radius:6px;border:1px solid var(--red)30;background:var(--bg);font-size:.78rem;cursor:pointer;color:var(--red);}
  .rub-del-btn:hover{background:var(--red-l);}
  .rub-view-table{width:100%;border-collapse:collapse;font-size:.88rem;}
  .rub-view-table th{text-align:left;font-family:var(--ff-m);font-size:.72rem;color:var(--dim);padding:.5rem .75rem;border-bottom:1px solid var(--bd);font-weight:400;text-transform:uppercase;letter-spacing:.05em;}
  .rub-view-table td{padding:.65rem .75rem;border-bottom:1px solid var(--s2);vertical-align:top;}
  .rub-view-table tr:last-child td{border-bottom:none;}
  .rub-total-row{display:flex;align-items:center;justify-content:space-between;padding:.85rem 1rem;background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);margin-top:.75rem;}
  .rub-total-pts{font-family:var(--ff-m);font-size:1.1rem;color:var(--navy);font-weight:700;}
  .rub-steps-pill{display:inline-block;font-family:var(--ff-m);font-size:.72rem;background:var(--s2);color:var(--dim);padding:.2rem .55rem;border-radius:100px;}

  /* ADMIN SETUP GUIDE */
  .setup-guide{background:linear-gradient(135deg,#f0f9ff 0%,#f8faff 100%);border:1.5px solid #2563eb20;border-radius:var(--r);padding:1.25rem 1.5rem;margin-bottom:.9rem;}
  .setup-guide-title{font-family:var(--ff-d);font-size:1rem;color:var(--navy);font-weight:700;margin-bottom:.25rem;}
  .setup-guide-sub{font-size:.85rem;color:var(--dim);margin-bottom:1.1rem;line-height:1.5;}
  .setup-checklist{display:flex;flex-direction:column;gap:.5rem;margin-bottom:1.1rem;}
  .setup-item{display:flex;align-items:center;gap:.65rem;}
  .setup-check{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.72rem;flex-shrink:0;font-weight:700;}
  .setup-check.done{background:var(--green-l);color:var(--green);}
  .setup-check.todo{background:var(--s2);border:1.5px solid var(--bd);}
  .setup-item-text{font-size:.9rem;color:var(--text);}
  .setup-item-text.done{color:var(--dim);text-decoration:line-through;}
  .setup-item-note{font-size:.8rem;color:var(--dim);margin-left:auto;font-family:var(--ff-m);}
  .setup-share{background:var(--bg);border:1px solid var(--bd);border-radius:10px;padding:1rem;}
  .setup-share-lbl{font-family:var(--ff-m);font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);margin-bottom:.65rem;}
  .setup-share-row{display:flex;align-items:center;gap:.5rem;margin-bottom:.45rem;}
  .setup-share-row:last-child{margin-bottom:0;}
  .setup-share-key{font-size:.8rem;color:var(--dim);width:88px;flex-shrink:0;}
  .setup-share-val{flex:1;font-family:var(--ff-m);font-size:.82rem;color:var(--navy);background:var(--s1);padding:.32rem .65rem;border-radius:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
  .setup-copy-btn{font-family:var(--ff-m);font-size:.72rem;padding:.3rem .65rem;border-radius:6px;border:1px solid var(--bd);background:var(--bg);color:var(--dim);cursor:pointer;white-space:nowrap;transition:all .15s;flex-shrink:0;}
  .setup-copy-btn:hover{background:var(--navy);color:#fff;border-color:var(--navy);}
  .setup-copy-btn.copied{background:var(--green-l);color:var(--green);border-color:#05966930;}

  /* SCHOOL-SELECT MARKETING PAGE */
  .mkt-page{display:flex;flex-direction:column;}
  .mkt-nav{display:flex;align-items:center;justify-content:space-between;padding:1.1rem 2rem;max-width:1100px;margin:0 auto;width:100%;}
  .mkt-nav-brand{display:flex;align-items:center;gap:.6rem;font-family:var(--ff-d);font-size:1.05rem;font-weight:700;color:var(--navy);}
  .mkt-nav-brand .mkt-ico{font-size:1.35rem;}
  .mkt-hero{text-align:center;padding:4rem 1.5rem 3rem;max-width:760px;margin:0 auto;width:100%;}
  .mkt-hero-badge{display:inline-block;font-family:var(--ff-m);font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--blue);background:var(--blue-l);border:1px solid #2563eb30;padding:.35rem .9rem;border-radius:100px;margin-bottom:1.5rem;}
  .mkt-h1{font-family:var(--ff-d);font-size:clamp(2rem,5vw,3rem);color:var(--navy);line-height:1.2;margin-bottom:1rem;font-weight:900;}
  .mkt-h1 span{color:var(--blue);}
  .mkt-hero-sub{font-size:1.05rem;color:var(--dim);max-width:540px;margin:0 auto 2rem;line-height:1.75;}
  .mkt-hero-ctas{display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap;margin-bottom:2.5rem;}
  .mkt-hero-ctas .btn{width:auto;padding:.85rem 1.75rem;font-size:1rem;}
  .mkt-slug-wrap{text-align:center;}
  .mkt-slug-label{font-family:var(--ff-m);font-size:.72rem;text-transform:uppercase;letter-spacing:.09em;color:var(--dim);margin-bottom:.6rem;}
  .mkt-slug-row{display:inline-flex;max-width:420px;width:100%;border-radius:10px;overflow:hidden;border:1.5px solid var(--bd);box-shadow:var(--shadow);}
  .mkt-slug-row:focus-within{border-color:var(--navy);}
  .mkt-slug-pre{padding:.72rem .9rem;background:var(--s2);color:var(--dim);font-size:.82rem;white-space:nowrap;display:flex;align-items:center;flex-shrink:0;border-right:1px solid var(--bd);}
  .mkt-slug-field{flex:1;border:none !important;border-radius:0 !important;outline:none !important;box-shadow:none !important;padding:.72rem .75rem;font-family:var(--ff-b);font-size:.95rem;background:var(--bg);color:var(--text);min-width:0;}
  .mkt-slug-go{padding:.72rem 1.1rem;background:var(--navy);color:#fff;border:none;border-left:1px solid #1e3a5f30;cursor:pointer;font-family:var(--ff-b);font-size:.92rem;font-weight:600;white-space:nowrap;transition:background .15s;flex-shrink:0;}
  .mkt-slug-go:hover{background:var(--navy-l);}
  .mkt-divider{border:none;border-top:1px solid var(--bd);margin:0 2rem;}
  .mkt-section{padding:3rem 1.5rem;max-width:1000px;margin:0 auto;width:100%;}
  .mkt-section-title{font-family:var(--ff-d);font-size:1.35rem;color:var(--navy);font-weight:700;text-align:center;margin-bottom:.4rem;}
  .mkt-section-sub{text-align:center;color:var(--dim);font-size:.92rem;margin-bottom:2rem;}
  .mkt-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem;}
  @media(max-width:640px){.mkt-steps{grid-template-columns:1fr;}}
  .mkt-step{background:var(--bg);border:1.5px solid var(--bd);border-radius:var(--r);padding:1.5rem;text-align:center;box-shadow:var(--shadow);}
  .mkt-step-num{font-family:var(--ff-m);font-size:.7rem;color:var(--blue);background:var(--blue-l);padding:.22rem .65rem;border-radius:100px;display:inline-block;margin-bottom:1rem;letter-spacing:.05em;text-transform:uppercase;}
  .mkt-step-ico{font-size:2rem;margin-bottom:.65rem;}
  .mkt-step h3{font-family:var(--ff-d);font-size:.95rem;color:var(--navy);margin-bottom:.4rem;}
  .mkt-step p{font-size:.85rem;color:var(--dim);line-height:1.6;}
  .mkt-feats{display:grid;grid-template-columns:repeat(2,1fr);gap:1rem;}
  @media(max-width:640px){.mkt-feats{grid-template-columns:1fr;}}
  .mkt-feat{background:var(--bg);border:1.5px solid var(--bd);border-radius:var(--r);padding:1.25rem 1.5rem;box-shadow:var(--shadow);display:flex;gap:1rem;align-items:flex-start;}
  .mkt-feat-ico{font-size:1.5rem;flex-shrink:0;}
  .mkt-feat h4{font-family:var(--ff-d);font-size:.9rem;color:var(--navy);margin-bottom:.3rem;}
  .mkt-feat p{font-size:.83rem;color:var(--dim);line-height:1.55;}
  .mkt-bottom{background:linear-gradient(135deg,#1e3a5f 0%,#2d5a8e 100%);padding:3.5rem 1.5rem;text-align:center;}
  .mkt-bottom h2{font-family:var(--ff-d);font-size:1.5rem;color:#fff;margin-bottom:.5rem;}
  .mkt-bottom p{color:#93c5fd;font-size:.95rem;margin-bottom:1.5rem;line-height:1.6;}
  .mkt-bottom-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;background:#fff;color:var(--navy);border:none;border-radius:8px;padding:.9rem 2rem;font-family:var(--ff-b);font-size:1rem;font-weight:600;cursor:pointer;transition:all .2s;box-shadow:0 4px 12px rgba(0,0,0,.15);}
  .mkt-bottom-btn:hover{background:var(--s1);transform:translateY(-1px);}
`;

// ─────────────────────────────────────────────
// DB ↔ STATE MAPPERS
// ─────────────────────────────────────────────
function dbToJudge(row) {
  return { id: row.id, alias: row.alias, projects: row.projects, joinedAt: new Date(row.joined_at).getTime(), department_id: row.department_id || null };
}
// The one place a departments row becomes app state. judge_from / judge_to are the
// department's judge numbers (migration 2026-10g); both arrive undefined before that
// migration, which the app reads as "numbers restart per department" (the old way).
function dbToDept(r) {
  return { id: r.id, name: r.name, code: r.code || "", max_judges: r.max_judges, ord: r.ord,
           scoring_mode: r.scoring_mode === "feedback" ? "feedback" : "scored",
           judge_from: Number.isInteger(r.judge_from) ? r.judge_from : null,
           judge_to:   Number.isInteger(r.judge_to)   ? r.judge_to   : null };
}
// "8", "judge 8", "JUDGE08", "Judge8" → "Judge8". Anything else is returned trimmed,
// so the server can reject it with its own message.
function normJudgeAlias(raw) {
  const m = String(raw || "").trim().match(/^(?:judge)?\s*0*(\d{1,3})$/i);
  return m ? `Judge${parseInt(m[1], 10)}` : String(raw || "").trim();
}
function judgeNumOf(alias) {
  const m = String(alias || "").match(/^Judge(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}
function dbToLog(row) {
  return { id: row.id, time: new Date(row.created_at).getTime(), msg: row.message };
}
// RFC 4122 v4 — activity_log.id is a UUID column.
function newUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function dbToItLog(row) {
  return { id: row.id, ts: new Date(row.created_at).getTime(), level: row.level, module: row.module, event: row.event, detail: row.detail, payload: row.payload || {} };
}
function scoresToMap(rows) {
  return rows.reduce((acc, row) => {
    // v2: scores stored as JSONB criteria object { [criterion_id]: value }
    acc[`${row.judge_id}_${row.project_id}`] = {
      criteria: row.criteria || {},
      notes: row.notes || "",
      // Feedback-mode departments only; '' everywhere else, and undefined until
      // migration 2026-10f has been run.
      commendation: row.commendation || "",
      time: new Date(row.submitted_at).getTime(),
    };
    return acc;
  }, {});
}
function delibNotesToMap(rows) {
  return rows.reduce((acc, row) => {
    acc[`${row.judge_id}_${row.project_id}`] = {
      comment: row.comment || "", recommendation: row.recommendation || "Pending",
      flagged: row.flagged || false, submittedAt: new Date(row.submitted_at).getTime(),
    };
    return acc;
  }, {});
}
function finalDecisionsToMap(rows) {
  return rows.reduce((acc, row) => {
    acc[row.project_id] = {
      award: row.award || "Pending", adminNotes: row.admin_notes || "",
      finalized: row.finalized || false,
      finalizedAt: row.finalized_at ? new Date(row.finalized_at).getTime() : null,
    };
    return acc;
  }, {});
}

// Registration link token from URL — computed once at module load
const urlRegToken = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).get("register")
  : null;

// Public results share token from URL (?token=…) — computed once at module load.
// Validated against the share_links table in init(); see shareUrl().
const urlShareToken = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).get("token")
  : null;

// Project list share token from URL — computed once at module load
const urlProjListToken = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).get("projects")
  : null;

// ─────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────
export default function App() {
  // ── SCHOOL / AUTH STATE ───────────────────────────────────
  const [session,       setSession]       = useState(null);   // Supabase Auth session
  const [adminHere,     setAdminHere]     = useState(false);  // signed in as an admin of THIS school (URL slug)
  const [currentSchool, setCurrentSchool] = useState(null);   // { id, name, slug } — invite_code/admin_pin are NOT readable; use loadInviteCode() / verifyAdminPin()
  const [schoolLoading, setSchoolLoading] = useState(!!urlSchoolSlug); // true while resolving slug

  // ── RUBRIC STATE ─────────────────────────────────────────
  const [rubric,        setRubric]        = useState(DEFAULT_RUBRIC);  // loaded from rubrics table
  const [rubricId,      setRubricId]      = useState(null);            // active rubric UUID
  const [editingRubric, setEditingRubric] = useState(false);           // rubric editor open
  const [rubricDraft,   setRubricDraft]   = useState([]);              // draft criteria during edit
  const [rubricSaving,  setRubricSaving]  = useState(false);
  const [rubricErr,     setRubricErr]     = useState("");     // save / validation error shown in the Rubric tab
  const [rubricConfirm, setRubricConfirm] = useState(null);   // { criteria, impact } awaiting "save anyway" when scores exist

  // ── SCHOOL REGISTRATION STATE ────────────────────────────
  const [schoolForm, setSchoolForm] = useState({ name:"", slug:"", email:"", password:"", confirmPass:"", adminPin:"", confirmPin:"" });
  const [schoolFormErr, setSchoolFormErr] = useState("");
  const [schoolRegistering, setSchoolRegistering] = useState(false);
  const [schoolCreatedNeedsConfirm, setSchoolCreatedNeedsConfirm] = useState(""); // slug, when email confirmation is pending
  // The auth account from a sign-up whose school step failed (e.g. URL taken). Retrying reuses
  // it — calling signUp() again would fail with "User already registered" and strand the user.
  const [pendingSignup, setPendingSignup] = useState(null);   // { email, userId, hasSession }

  // ── ADMIN EMAIL (for v2 Supabase Auth login) ─────────────
  const [adminEmail, setAdminEmail] = useState("");

  const [view,        setView]       = useState(
    urlRegToken      ? "public-register"  :
    urlProjListToken ? "public-projects"  :
    urlShareToken    ? "public-results"   :
    urlSchoolSlug    ? "landing"          : "school-select"
  );
  const [departments, setDepartments] = useState(DEFAULT_DEPARTMENTS);
  // Per-school project categories (migration 2026-10e). Falls back to
  // DEFAULT_CATEGORIES until the table loads, or if the migration is missing.
  const [categories,  setCategories]  = useState(
    DEFAULT_CATEGORIES.map((c, i) => ({ id: null, name: c.name, code: c.code, ord: i })));
  const [projects,    setProjects]   = useState([]);
  const [judges,      setJudges]     = useState([]);
  const [scores,     setScores]  = useState({});
  const [log,        setLog]     = useState([]);
  const [locked,     setLocked]  = useState(false);
  const [loading,    setLoading] = useState(true);
  const [judge,      setJudge]   = useState(null);
  const [isOnline,   setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [offlineQueue, setOfflineQueue] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sf_offline_queue") || "[]"); } catch { return []; }
  });
  const flushingRef = useRef(false); // guards against concurrent offline-queue flushes
  // Diagnostics. The mount effect and window error listeners close over the FIRST render,
  // where currentSchool is still null — they pass the school id to addItLog explicitly.
  const realtimeDownRef = useRef(false); // true after a realtime drop, so the recovery is logged once
  const clientErrRef    = useRef({ count: 0, seen: new Set() }); // CLIENT_ERROR de-dupe + per-session cap
  const [lastSyncAt, setLastSyncAt] = useState(() => {
    try {
      const raw = localStorage.getItem("sf_last_sync_at");
      const n = raw ? parseInt(raw, 10) : NaN;
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  });
  const [scoringPid, setScoringPid]  = useState(null);
  const [draftSc,    setDraftSc]     = useState({});
  const [draftNotes, setDraftNotes]  = useState("");
  // Feedback-mode only: the commendation this judge is giving. Free text, seeded
  // from COMMENDATIONS but never limited to it.
  const [draftCommend, setDraftCommend] = useState("");
  const [regName,    setRegName]     = useState("");
  const [regCode,    setRegCode]     = useState("");
  const [regDept,    setRegDept]     = useState("");
  // Judge numbering (migration 2026-10g): "school" = one list for the whole school
  // (DEFAULT — the number decides the department), "department" = numbers restart
  // in every department (the pre-2026-10g behaviour).
  const [judgeNumbering,   setJudgeNumbering]   = useState("school");
  const [judgeCountDrafts, setJudgeCountDrafts] = useState({});   // Setup tab: { [deptId]: "3" }
  const [removeJudgeAsk,   setRemoveJudgeAsk]   = useState(null); // judge being removed (PIN modal)
  const [removeJudgePin,   setRemoveJudgePin]   = useState("");
  const [removeJudgeErr,   setRemoveJudgeErr]   = useState("");
  const [regErr,     setRegErr]      = useState("");
  const [adminPass,         setAdminPass]         = useState("");
  const [adminErr,          setAdminErr]          = useState("");
  const [adminLoginAttempts, setAdminLoginAttempts] = useState(0);
  const [adminLockoutUntil,  setAdminLockoutUntil]  = useState(null);
  const [deptMaxDrafts, setDeptMaxDrafts] = useState({});  // { [deptId]: string }
  const [adminTab,   setAdminTab]    = useState("overview");

  // Setup tab (departments + project categories)
  const [deptEdits,    setDeptEdits]    = useState({});  // { [deptId]: { name, code } } — only while editing
  const [catEdits,     setCatEdits]     = useState({});  // { [catId]:  { name, code } }
  const [newDept,      setNewDept]      = useState({ name: "", code: "" });
  const [newCat,       setNewCat]       = useState({ name: "", code: "" });
  const [setupErr,     setSetupErr]     = useState("");
  const [setupConfirm, setSetupConfirm] = useState(null); // { kind:"dept"|"cat", id, name, used? }

  // Share state
  const [shareToken,      setShareToken]      = useState("");
  const [shareEnabled,    setShareEnabled]    = useState(false);
  const [shareExpiry,     setShareExpiry]     = useState("never");
  const [shareCreated,    setShareCreated]    = useState(null);
  const [shareShowRubric, setShareShowRubric] = useState(true);
  const [shareTitle,      setShareTitle]      = useState("Science Fair SY 2025-2026 — Final Results");
  const [copied,          setCopied]          = useState(false);

  // Project list share state
  // The invite code is no longer readable from the schools row (anon must not
  // have it — it is verified server-side). Admins fetch their own via RPC.
  const [inviteCode,   setInviteCode]   = useState("");
  const [pinForm,      setPinForm]      = useState({ current:"", next:"", confirm:"" });
  const [pinFormMsg,   setPinFormMsg]   = useState(null); // { ok:boolean, text:string }
  const [pinSaving,    setPinSaving]    = useState(false);
  const [shareTokenValid,   setShareTokenValid]   = useState(false);
  const [shareTokenChecked, setShareTokenChecked] = useState(!urlShareToken);
  const [projListToken,   setProjListToken]   = useState("");
  const [projListCopied,  setProjListCopied]  = useState(false);
  const [setupCopied,     setSetupCopied]     = useState(null); // null | "url" | "code"
  const [projListValid,   setProjListValid]   = useState(false);
  const [projListChecked, setProjListChecked] = useState(!urlProjListToken);

  // IT logs state
  const [activityFilter, setActivityFilter] = useState("");
  const [itLogs,       setItLogs]       = useState([]);
  const [itFilter,     setItFilter]     = useState("ALL");
  const [itExpanded,   setItExpanded]   = useState({});
  const [reportCopied, setReportCopied] = useState(false);
  const [snapCopied,   setSnapCopied]   = useState(false);
  const [itUnlocked,   setItUnlocked]   = useState(false);
  const [itPin,        setItPin]        = useState("");
  const [itPinErr,     setItPinErr]     = useState("");

  // Reset modal state
  const [showReset,    setShowReset]    = useState(false);
  const [resetPin,     setResetPin]     = useState("");
  const [resetPinErr,  setResetPinErr]  = useState("");
  const [resetDone,    setResetDone]    = useState(false);

  // Deliberation state
  const [deliberationNotes,  setDeliberationNotes]  = useState({});
  const [finalDecisions,     setFinalDecisions]     = useState({});
  const [deliberationOpen,   setDeliberationOpen]   = useState(false);
  const [delibDraftComment,  setDelibDraftComment]  = useState("");
  const [delibDraftRec,      setDelibDraftRec]      = useState("Pending");
  const [delibDraftFlagged,  setDelibDraftFlagged]  = useState(false);
  const [delibReportCopied,  setDelibReportCopied]  = useState(false);
  const [delibDrafts,        setDelibDrafts]        = useState({}); // { [pid]: { comment, rec, flagged } }
  const [deliberationReason, setDeliberationReason] = useState(null); // "tie"|"manual"|null

  // Score backup state
  const [scoreBackups,   setScoreBackups]   = useState([]);
  const [savingBackup,   setSavingBackup]   = useState(false);
  const [backupSaved,    setBackupSaved]    = useState(false);

  // Validation & finalization state
  const [judgeValidations,   setJudgeValidations]   = useState({});
  const [adminValidation,    setAdminValidation]     = useState(null);
  const [resultsFinalized,   setResultsFinalized]    = useState(false);
  const [valComment,         setValComment]          = useState("");
  const [showValForm,        setShowValForm]         = useState(false);
  const [valReviseErr,       setValReviseErr]        = useState("");
  const [lockErr,            setLockErr]             = useState("");
  const [valErr,             setValErr]              = useState("");  // judge/admin validation save failed
  const [delibErr,           setDelibErr]            = useState("");  // admin Deliberation tab save failed
  const [delibNoteErr,       setDelibNoteErr]        = useState("");  // judge deliberation note save failed
  const [judgeSignOutAsk,    setJudgeSignOutAsk]     = useState(false);  // inline "sign out anyway?" step
  const [transferAllowances, setTransferAllowances]  = useState({}); // { [alias]: expiryTs }

  // Transfer PIN modal state
  const [showTransferPinModal,  setShowTransferPinModal]  = useState(false);
  const [transferPinAlias,      setTransferPinAlias]      = useState("");
  const [transferPin,           setTransferPin]           = useState("");
  const [transferPinErr,        setTransferPinErr]        = useState("");

  // Project management state
  const [showAddProject,     setShowAddProject]      = useState(false);
  // ── Participation-form scanner (admin Projects tab) ──
  // Cards live only in memory: the photos are never uploaded anywhere except /api/scan-form,
  // and nothing is written to the DB until the admin presses Save on a card.
  const [scanOpen,           setScanOpen]            = useState(false);
  const [scanCards,          setScanCards]           = useState([]);   // see newScanCard()
  const [scanSaving,         setScanSaving]          = useState(false);
  const [scanDiscardAsk,     setScanDiscardAsk]      = useState(false);
  const scanUrlsRef = useRef([]);   // object URLs for thumbnails — revoked when the scanner closes
  const [editingProject,     setEditingProject]      = useState(null); // project id being edited
  const [projForm,           setProjForm]            = useState(blankProjForm("", catNames()[0] || ""));
  const [showDeleteConfirm,  setShowDeleteConfirm]   = useState(false);
  const [deleteProjectId,    setDeleteProjectId]     = useState(null);

  // Registration feature state
  const [regLinks,        setRegLinks]       = useState([]);
  const [regSubmissions,  setRegSubmissions]  = useState([]);
  const [deleteRegSub,    setDeleteRegSub]    = useState(null); // submission pending delete
  const [regTokenData,    setRegTokenData]    = useState(null);
  const [regTokenChecked, setRegTokenChecked] = useState(!urlRegToken);
  const [regSubmitting,   setRegSubmitting]   = useState(false);
  const [regSuccess,      setRegSuccess]      = useState(null);
  const [regFormErr,      setRegFormErr]      = useState("");
  const [regLinkCopied,   setRegLinkCopied]   = useState(false);
  const [regForm,         setRegForm]         = useState({
    studentName: "", gradeLevel: "", division: "", schoolName: "",
    studentEmail: "", emailConfirm: "", contactNumber: "",
    projectTitle: "", category: "", projectType: "Individual", groupMembers: "",
    advisorName: "", advisorEmail: "", schoolDepartment: "",
    description: "", researchQuestion: "", hypothesis: "",
    needsElectricity: false, specialEquipment: "", hasTrifold: true,
    isOriginalWork: false, agreesToRules: false, guardianName: "", guardianSignature: "",
  });

  const EXPIRY_MS = { "1h":3600000, "24h":86400000, "7d":604800000, "never":Infinity };
  const EXPIRY_OPTS = [{ val:"1h",label:"1 Hour" },{ val:"24h",label:"24 Hours" },{ val:"7d",label:"7 Days" },{ val:"never",label:"Never" }];
  const backdrop = null;

  // ── SUPABASE LOADERS ──────────────────────────────────────
  // Loaders never seed. Seeding is ensureSeedData()'s job (it runs once the admin
  // is authenticated — RLS blocks anonymous inserts anyway, so an inline seed here
  // silently failed for judges and the public). If the table is empty we keep the
  // DEFAULT_* fallback so the UI still renders.
  async function loadDepartments(sid) {
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    const { data } = await supabase.from("departments").select("*").eq("school_id", schoolId).order("ord");
    if (data && data.length > 0) {
      // scoring_mode arrives undefined if migration 2026-10f has not been run —
      // default to 'scored', which is exactly how the app behaved before it existed.
      setDepartments(data.map(dbToDept));
    }
  }

  async function loadCategories(sid) {
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    const { data, error } = await supabase.from("categories")
      .select("*").eq("school_id", schoolId).order("ord");
    if (error) {
      // 42P01 / PGRST205 = migration 2026-10e has not been run on this project.
      // Keep the built-in list so every dropdown still works.
      if (error.code === "42P01" || error.code === "PGRST205") {
        addItLog("WARN","DB","CATEGORIES_TABLE_MISSING",
          "The categories table is missing — using the built-in list. Run migration 2026-10e.",
          { error: error.message });
      }
      return;
    }
    if (data && data.length > 0) {
      setCategories(data.map(r => ({ id: r.id, name: r.name, code: r.code || "", ord: r.ord })));
    }
  }
  async function loadProjects(sid) {
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    // Student/adviser names live in project_private (admin-only RLS, migration 2026-10b).
    // For judges and the public that query returns nothing, so names are simply absent.
    // Before 2026-10b the names were still columns on `projects` — fall back to those.
    const [{ data }, { data: priv }] = await Promise.all([
      supabase.from("projects").select("*").eq("school_id", schoolId).order("created_at"),
      supabase.from("project_private").select("project_id, advisor_name, group_members").eq("school_id", schoolId),
    ]);
    if (data) {
      const privById = new Map((priv || []).map(x => [x.project_id, x]));
      setProjects(data.map(r => {
        const pv = privById.get(r.id);
        return {
          id: r.id, num: r.num, title: r.title, cat: r.cat, grade: r.grade,
          locked: r.locked || false, department_id: r.department_id || null,
          advisor_name: pv?.advisor_name ?? r.advisor_name ?? "",
          // Normalised to [{ name, grade }] whichever shape the row was written in.
          group_members: normMembers(pv ? pv.group_members : r.group_members),
          // Present only after migration-2026-10-project-details.sql has been applied.
          room: r.room || "", description: r.description || "", motivation: r.motivation || "",
        };
      }));
    }
  }
  async function loadJudges(sid) {
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    const { data } = await supabase.from("judges").select("*").eq("school_id", schoolId).order("joined_at");
    if (data) setJudges(data.map(dbToJudge));
  }
  async function loadScores(sid) {
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    const { data } = await supabase.from("scores").select("*").eq("school_id", schoolId);
    if (data) setScores(scoresToMap(data));
  }
  async function loadLog(sid) {
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    const { data } = await supabase.from("activity_log").select("*").eq("school_id", schoolId).order("created_at", { ascending: false });
    if (data) setLog(data.map(dbToLog));
  }
  async function loadItLogs(sid) {
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    const { data } = await supabase.from("it_logs").select("*").eq("school_id", schoolId).order("created_at", { ascending: false });
    if (data) setItLogs(data.map(dbToItLog));
  }
  async function loadShare(sid) {
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    const { data } = await supabase
      .from("share_links").select("*").eq("school_id", schoolId).is("revoked_at", null)
      .order("created_at", { ascending: false }).limit(1);
    if (data?.length) {
      const link = data[0];
      setShareToken(link.token); setShareEnabled(true);
      setShareExpiry(link.expiry); setShareCreated(new Date(link.created_at).getTime());
      setShareShowRubric(link.show_rubric); setShareTitle(link.title);
    } else {
      setShareToken(""); setShareEnabled(false); setShareCreated(null);
    }
  }
  async function loadSettings(sid) {
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    const { data } = await supabase.from("app_settings").select("*").eq("school_id", schoolId);
    if (data) {
      const map = Object.fromEntries(data.map(r => [r.key, r.value]));
      setLocked(map.locked === "true");
      setDeliberationOpen(map.deliberation_open === "true");
      setDeliberationReason(map.deliberation_reason || null);
      setResultsFinalized(map.results_finalized === "true");
      try {
        const raw = map.judge_transfer_allowances || "{}";
        const parsed = JSON.parse(raw);
        setTransferAllowances(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        setTransferAllowances({});
      }
      setProjListToken(map.project_list_token || "");
      setJudgeNumbering(map.judge_numbering === "department" ? "department" : "school");
      // Note: judge/admin validations are loaded separately by loadValidations()
      // from the validations table — not from app_settings.
    }
  }

  async function saveTransferAllowances(next) {
    setTransferAllowances(next);
    await supabase.from("app_settings").upsert({ school_id: currentSchool.id, key: "judge_transfer_allowances", value: JSON.stringify(next) });
  }

  // Admin-only: read this school's invite code back so it can be shown on the
  // "Get started" card. Anonymous clients never receive it.
  async function loadInviteCode(sid) {
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    const { data, error } = await supabase.rpc("school_invite_code", { p_school_id: schoolId });
    if (!error && data) setInviteCode(data);
  }

  // Admin changes the PIN. The current PIN must be verified first, then
  // set_school_pin() re-hashes the new one server-side.
  async function changeAdminPin() {
    setPinFormMsg(null);
    const { current, next, confirm } = pinForm;
    // Same rule as sign-up / create_school(): 4-8 digits, nothing trivially guessable.
    if (!/^\d{4,8}$/.test(next)) { setPinFormMsg({ ok:false, text:"New PIN must be 4–8 digits." }); return; }
    if (/^(\d)\1+$/.test(next) || ["1234","12345","123456","1234567","12345678"].includes(next)) {
      setPinFormMsg({ ok:false, text:"Choose a less predictable PIN (not 0000, 1111, 1234, ...)." }); return;
    }
    if (next !== confirm)     { setPinFormMsg({ ok:false, text:"New PIN and confirmation do not match." }); return; }
    setPinSaving(true);
    const check = await verifyAdminPin(current);
    if (!check.valid) {
      setPinSaving(false);
      setPinFormMsg({ ok:false, text: check.message || "Current PIN is incorrect." });
      return;
    }
    const { error } = await supabase.rpc("set_school_pin", {
      p_school_id: currentSchool.id,
      p_new_pin: next,
    });
    setPinSaving(false);
    if (error) {
      setPinFormMsg({ ok:false, text: error.message || "Could not update PIN." });
      addItLog("ERROR","ADMIN","PIN_CHANGE_FAILED","set_school_pin failed",{ error: error.message });
      return;
    }
    setPinForm({ current:"", next:"", confirm:"" });
    setPinFormMsg({ ok:true, text:"Admin PIN updated." });
    addLog("Admin changed the admin PIN");
    addItLog("WARN","ADMIN","PIN_CHANGED","Admin PIN was changed",{ timestamp: fmtISO(Date.now()) });
  }

  // The admin PIN is a bcrypt hash in the database and is never sent to the
  // browser — verification happens in the verify_school_pin() SQL function,
  // which also rate-limits (5 failures → 5 minute lockout for this school).
  async function verifyAdminPin(pin) {
    if (!currentSchool?.id) return { valid: false, message: "School not loaded." };
    const { data, error } = await supabase.rpc("verify_school_pin", {
      p_school_id: currentSchool.id,
      p_pin: pin,
    });
    if (error) {
      // P0001 is our own RAISE — currently only the lockout message.
      addItLog("WARN","AUTH","PIN_VERIFY_ERROR","verify_school_pin returned an error",{ error: error.message });
      return { valid: false, message: error.message || "Could not verify PIN." };
    }
    return { valid: data === true };
  }

  function allowJudgeTransfer(alias) {
    setTransferPinAlias(alias);
    setTransferPin("");
    setTransferPinErr("");
    setShowTransferPinModal(true);
  }

  async function confirmTransfer() {
    const ok = await verifyAdminPin(transferPin);
    if (!ok.valid) {
      setTransferPinErr(ok.message || "Incorrect PIN. Transfer approval denied.");
      addItLog("WARN","AUTH","JUDGE_TRANSFER_PIN_FAILED","Transfer approval denied due to incorrect PIN",{ alias: transferPinAlias, timestamp: fmtISO(Date.now()) });
      setTimeout(() => setTransferPin(""), 600);
      return;
    }
    const expiry = Date.now() + 10 * 60 * 1000;
    const next = { ...transferAllowances, [transferPinAlias]: expiry };
    await saveTransferAllowances(next);
    addLog(`Admin approved device transfer for ${transferPinAlias} (expires in 10 minutes)`);
    addItLog("WARN","ADMIN","JUDGE_TRANSFER_APPROVED","Admin approved judge device transfer",{ alias: transferPinAlias, expiresAt: fmtISO(expiry) });
    setShowTransferPinModal(false);
    setTransferPin("");
    setTransferPinErr("");
  }
  async function loadValidations(sid) {
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    const { data } = await supabase.from("validations").select("*").eq("school_id", schoolId);
    if (data) {
      const jv = {};
      let av = null;
      data.forEach(row => {
        const entry = { approved: row.approved, comment: row.comment, validatedAt: new Date(row.validated_at).getTime() };
        if (row.judge_id === "admin") av = entry;
        else jv[row.judge_id] = entry;
      });
      setJudgeValidations(jv);
      if (av) setAdminValidation(av);
    }
  }
  async function loadDelibNotes(sid) {
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    const { data } = await supabase.from("deliberation_notes").select("*").eq("school_id", schoolId);
    if (data) setDeliberationNotes(delibNotesToMap(data));
  }
  async function loadFinalDecisions(sid) {
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    const { data } = await supabase.from("final_decisions").select("*").eq("school_id", schoolId);
    if (data) setFinalDecisions(finalDecisionsToMap(data));
  }
  async function loadRubric(sid) {
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    const { data } = await supabase.from("rubrics").select("*").eq("school_id", schoolId).eq("is_active", true).single();
    // rubrics.criteria defaults to '[]'. An empty or malformed rubric would give judges a
    // scoring form with nothing on it (or crash the app) — fall back to the default instead.
    const valid = Array.isArray(data?.criteria) && data.criteria.length > 0
      && data.criteria.every(c => c && c.id && Array.isArray(c.steps) && c.steps.length);
    if (data) setRubricId(data.id);
    setRubric(valid ? data.criteria : DEFAULT_RUBRIC);
  }

  // The school-registration flow fires its seed inserts immediately after signUp(),
  // but when email confirmation is enabled Supabase returns a user with NO session —
  // so the RLS-protected departments/rubrics inserts are rejected and silently lost,
  // leaving a school with no departments (which blocks judge sign-in entirely).
  // Re-seed here once a genuine admin session exists so such a school self-repairs.
  async function ensureSeedData(schoolId) {
    const sid = schoolId || currentSchool?.id;
    if (!sid) return;

    const { data: depts } = await supabase.from("departments")
      .select("id").eq("school_id", sid).limit(1);
    if (!depts || depts.length === 0) {
      const { data: seeded, error } = await supabase.from("departments")
        .insert(DEPT_PRESETS[0].depts.map((d, i) =>
          ({ school_id: sid, name: d.name, code: d.code, max_judges: 5, ord: i })))
        .select();
      if (!error && seeded) {
        setDepartments(seeded.map(dbToDept));
        addItLog("WARN","SYSTEM","DEPARTMENTS_RESEEDED",
          "Departments were missing for this school and have been re-seeded", { schoolId: sid });
      }
    }

    // Categories (migration 2026-10e). A school created by create_school() has
    // none — the RPC predates the table — so this is the normal seeding path for
    // every new school, not just a repair.
    const { data: cats, error: catErr } = await supabase.from("categories")
      .select("id").eq("school_id", sid).limit(1);
    if (!catErr && (!cats || cats.length === 0)) {
      const { data: seeded, error } = await supabase.from("categories")
        .insert(DEFAULT_CATEGORIES.map((c, i) =>
          ({ school_id: sid, name: c.name, code: c.code, ord: i })))
        .select();
      if (!error && seeded) {
        setCategories(seeded.map(r => ({ id: r.id, name: r.name, code: r.code || "", ord: r.ord })));
        addItLog("INFO","SYSTEM","CATEGORIES_SEEDED",
          "Project categories were missing for this school and have been seeded", { schoolId: sid });
      }
    }

    // app_settings became admin-write in the security migration, so a school
    // created without a session has none. Seed the baseline keys if missing.
    const { data: settings } = await supabase.from("app_settings")
      .select("key").eq("school_id", sid);
    const haveKeys = new Set((settings || []).map(r => r.key));
    const baseline = [
      { key: "locked",            value: "false" },
      { key: "deliberation_open", value: "false" },
      { key: "results_finalized", value: "false" },
    ].filter(r => !haveKeys.has(r.key)).map(r => ({ school_id: sid, ...r }));
    if (baseline.length) {
      const { error } = await supabase.from("app_settings").insert(baseline);
      if (!error) {
        addItLog("WARN","SYSTEM","APP_SETTINGS_RESEEDED",
          "Baseline app_settings were missing for this school and have been re-seeded",
          { schoolId: sid, keys: baseline.map(r => r.key) });
      }
    }

    const { data: rubs } = await supabase.from("rubrics")
      .select("id").eq("school_id", sid).eq("is_active", true).limit(1);
    if (!rubs || rubs.length === 0) {
      const { data: r, error } = await supabase.from("rubrics").insert({
        school_id: sid, name: "Default (Northeast AZ Regional)",
        criteria: DEFAULT_RUBRIC, is_active: true,
      }).select("id").single();
      if (!error && r) {
        setRubricId(r.id);
        setRubric(DEFAULT_RUBRIC);
        addItLog("WARN","SYSTEM","RUBRIC_RESEEDED",
          "Active rubric was missing for this school and has been re-seeded", { schoolId: sid });
      }
    }
  }

  // What a rubric change does to scores already entered. Totals are ALWAYS computed with the
  // current rubric (getTotal), so removing/adding criteria or changing a max changes them.
  function rubricImpact(next) {
    const cur = new Map(rubric.map(c => [c.id, c]));
    const nxt = new Map(next.map(c => [c.id, c]));
    return {
      scoreCount: Object.keys(scores).length,
      removed: rubric.filter(c => !nxt.has(c.id)).map(c => c.label),
      added:   next.filter(c => !cur.has(c.id)).map(c => c.label),
      changed: next.filter(c => cur.has(c.id) && (Number(cur.get(c.id).max) !== Number(c.max)
                 || JSON.stringify(cur.get(c.id).steps) !== JSON.stringify(c.steps))).map(c => c.label),
    };
  }
  // Validate → if scores exist and scoring changes, ask first (inline, no window.confirm —
  // it is blocked in installed/standalone mode) → save.
  function requestSaveRubric(criteria) {
    setRubricErr("");
    for (const c of criteria) {
      if (!String(c.label || "").trim()) { setRubricErr("Every criterion needs a label."); return; }
      if (!Array.isArray(c.steps) || c.steps.length < 2) { setRubricErr(`"${c.label}" needs at least 2 score steps.`); return; }
    }
    const impact = rubricImpact(criteria);
    if (impact.scoreCount > 0 && (impact.removed.length || impact.added.length || impact.changed.length)) {
      setRubricConfirm({ criteria, impact });
      return;
    }
    saveRubric(criteria);
  }

  async function saveRubric(criteria) {
    if (!currentSchool?.id) return false;
    setRubricSaving(true);
    setRubricErr("");
    let error = null;
    if (rubricId) {
      // .select() so an RLS-filtered update (0 rows, no error) is caught as a failure.
      const res = await supabase.from("rubrics").update({ criteria })
        .eq("school_id", currentSchool.id).eq("id", rubricId).select("id");
      error = res.error || (!res.data?.length ? { message: "nothing was saved (are you still signed in?)" } : null);
    } else {
      const res = await supabase.from("rubrics")
        .insert({ school_id: currentSchool.id, name: "Custom Rubric", criteria, is_active: true })
        .select("id").single();
      error = res.error;
      if (res.data) setRubricId(res.data.id);
    }
    setRubricSaving(false);
    if (error) {
      // Keep the editor open with the draft so nothing typed is lost.
      setRubricErr(`Rubric NOT saved: ${error.message}. Your changes are still here — try again.`);
      addItLog("ERROR","ADMIN","RUBRIC_SAVE_FAILED","Rubric could not be saved",{ error: error.message });
      return false;
    }
    setRubric(criteria);
    setRubricConfirm(null);
    setEditingRubric(false);
    addLog("Admin updated the scoring rubric");
    addItLog("INFO","ADMIN","RUBRIC_UPDATED","Admin saved updated scoring rubric",
      { criteriaCount: criteria.length, totalMax: criteria.reduce((s,c) => s + c.max, 0) });
    return true;
  }

  function rubricDraftMove(idx, dir) {
    setRubricDraft(prev => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  function rubricDraftUpdate(idx, field, value) {
    setRubricDraft(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  function rubricDraftDelete(idx) {
    setRubricDraft(prev => prev.filter((_, i) => i !== idx));
  }

  function rubricDraftAdd() {
    setRubricDraft(prev => [...prev, { id: "c_" + uid(), label: "", desc: "", max: 3, steps: [0,1,2,3] }]);
  }

  function parseSteps(raw, max) {
    const nums = raw.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0 && n <= max);
    const sorted = [...new Set(nums)].sort((a,b) => a-b);
    return sorted.length >= 2 ? sorted : null;
  }

  // ── INITIAL LOAD + REALTIME SUBSCRIPTIONS ─────────────────
  useEffect(() => {
    // ── Step 1: Resolve school from URL slug ─────────────────
    async function resolveSchool() {
      if (!urlSchoolSlug) { setSchoolLoading(false); return; }
      const { data } = await supabase.from("schools")
        .select("id, name, slug")
        .eq("slug", urlSchoolSlug).single();
      if (data) setCurrentSchool(data);
      setSchoolLoading(false);
      return data;
    }

    // ── Step 2: Auth state listener ──────────────────────────
    // ⚠️ NEVER await a Supabase call inside this callback. supabase-js notifies listeners
    // while holding its auth lock, and every query needs that lock to read the token —
    // so an awaited query here deadlocks. Until 2026-10-05 that made Sign Out hang forever
    // (signOut() never resolved, the admin stayed on the dashboard and every later query in
    // the tab stalled). The work is deferred with setTimeout, as Supabase recommends.
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setTimeout(() => { onAuthChanged(sess); }, 0);
    });
    async function onAuthChanged(sess) {
      if (sess) {
        // Resolve the admin's school (public columns only — the PIN is never readable)
        const { data: sa } = await supabase.from("school_admins")
          .select("school_id").eq("user_id", sess.user.id).single();
        if (sa) {
          const { data: school } = await supabase.from("schools")
            .select("id, name, slug").eq("id", sa.school_id).single();
          // Only adopt the admin's school when it IS the school in the URL.
          // Otherwise the page would read school B's data while writing to school A.
          if (school && (!urlSchoolSlug || school.slug === urlSchoolSlug)) {
            setCurrentSchool(school);
            setAdminHere(true);
            // Seed anything the signup flow could not create without a session.
            ensureSeedData(school.id);
            // These tables are admin-read only, so the anonymous load during init()
            // returned nothing. Refetch now that we have a session — otherwise the
            // Activity, IT Logs and Score Export tabs stay empty for the admin.
            loadLog(school.id);
            loadItLogs(school.id);
            loadScoreBackups(school.id);
            loadInviteCode(school.id);
            // Student names (project_private) are admin-only — refetch now we can read them.
            loadProjects(school.id);
          }
        }
      } else {
        // Signed out: drop admin-only data from memory so the next person on this
        // device cannot see it, then reload the public view of the school.
        setInviteCode("");
        setAdminHere(false);
        setRegSubmissions([]);
        setScoreBackups([]);
        setItUnlocked(false);
        if (urlSchoolSlug) {
          const { data } = await supabase.from("schools")
            .select("id, name, slug").eq("slug", urlSchoolSlug).single();
          if (data) {
            setCurrentSchool(data);
            loadProjects(data.id);   // without a session project_private returns nothing → no names
          }
        }
      }
    }

    // ── Step 3: Load all school data ─────────────────────────
    async function init(school) {
      const sid = school?.id;
      if (!sid) {
        // No school resolved (e.g. a legacy bare-origin ?token=… link with no /s/ slug).
        // Mark the token checks done so the UI shows "Link Unavailable" instead of
        // spinning on a loading screen forever.
        if (urlShareToken)    setShareTokenChecked(true);
        if (urlProjListToken) setProjListChecked(true);
        if (urlRegToken)      setRegTokenChecked(true);
        setLoading(false);
        return;
      }
      const timeout = setTimeout(() => {
        setLoading(false);
        addItLog("WARN","SYSTEM","INIT_TIMEOUT","School data did not finish loading within 8 s — showing what is available",
          { online: navigator.onLine, page: urlRegToken ? "register" : urlShareToken ? "results" : urlProjListToken ? "projects" : "school" }, sid);
      }, 8000);
      // Validate registration link token if present in URL
      if (urlRegToken) {
        try {
          const { data } = await supabase.from("registration_links")
            .select("*").eq("token", urlRegToken).eq("school_id", sid).single();
          const isValid = data?.active && (!data.expires_at || new Date(data.expires_at) > new Date());
          setRegTokenData(isValid ? data : null);
        } catch {
          setRegTokenData(null);
        }
        setRegTokenChecked(true);
      }
      // Validate project list token if present in URL.
      // The stored token must MATCH the one in the URL — previously any non-empty
      // value granted access, so ?projects=anything opened the list.
      if (urlProjListToken) {
        try {
          const { data } = await supabase.from("app_settings")
            .select("value").eq("school_id", sid).eq("key", "project_list_token").single();
          setProjListValid(!!data?.value && data.value === urlProjListToken);
        } catch {
          setProjListValid(false);
        }
        setProjListChecked(true);
      }
      // Validate the public results token if present in URL. Must match a
      // share_links row for this school that is neither revoked nor expired.
      if (urlShareToken) {
        try {
          const { data } = await supabase.from("share_links")
            .select("*").eq("school_id", sid).eq("token", urlShareToken)
            .is("revoked_at", null).single();
          const expiryMs = { "1h":3600000, "24h":86400000, "7d":604800000, "never":Infinity }[data?.expiry] ?? 0;
          const createdMs = data?.created_at ? new Date(data.created_at).getTime() : 0;
          const live = !!data && (data.expiry === "never" || (Date.now() - createdMs) < expiryMs);
          setShareTokenValid(live);
          // The view is already "public-results" from the initial state; the render
          // gate below decides between the results page and "Link Unavailable".
        } catch {
          setShareTokenValid(false);
        }
        setShareTokenChecked(true);
      }
      await Promise.all([
        loadDepartments(sid), loadCategories(sid), loadProjects(sid), loadJudges(sid), loadScores(sid),
        loadLog(sid), loadItLogs(sid), loadShare(sid), loadSettings(sid),
        loadDelibNotes(sid), loadFinalDecisions(sid), loadValidations(sid),
        loadScoreBackups(sid), loadRubric(sid),
      ]).catch(err => {
        // A loader threw (network drop mid-load, unexpected response). Previously an
        // unhandled rejection: the screen waited for the 8 s timeout and nothing was logged.
        addItLog("ERROR","DB","LOAD_FAILED","Loading school data failed",
          { error: String(err?.message || err).slice(0, 300), online: navigator.onLine }, sid);
      });
      clearTimeout(timeout);
      setLoading(false);
    }

    // ── Step 4: School-scoped realtime ───────────────────────
    let channel;
    let unmounting = false;
    const setupChannel = (sid) => {
      if (!sid) return;
      const f = (table) => `school_id=eq.${sid}`;
      channel = supabase.channel(`school-${sid}`)
        // Wrap the loaders: passing them directly hands the realtime payload in as `sid`,
        // so they queried school_id = "[object Object]" and never refreshed (bug until 2026-10-05).
        .on("postgres_changes", { event: "*", schema: "public", table: "departments", filter: f("departments") }, () => loadDepartments(sid))
        .on("postgres_changes", { event: "*", schema: "public", table: "categories",  filter: f("categories")  }, () => loadCategories(sid))
        .on("postgres_changes", { event: "*", schema: "public", table: "projects",    filter: f("projects")    }, () => loadProjects(sid))
        // Admin-only by RLS (realtime enforces it): judges/public never receive these events.
        .on("postgres_changes", { event: "*", schema: "public", table: "project_private", filter: f("project_private") }, () => loadProjects(sid))
        .on("postgres_changes", { event: "*", schema: "public", table: "judges",      filter: f("judges") }, ({ eventType, new: row }) => {
          if (eventType === "INSERT") setJudges(prev => [...prev, dbToJudge(row)].sort((a,b) => a.joinedAt - b.joinedAt));
          else if (eventType === "UPDATE") setJudges(prev => prev.map(j => j.id === row.id ? dbToJudge(row) : j));
          else loadJudges(sid);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "scores", filter: f("scores") }, ({ eventType, new: row }) => {
          if (eventType === "INSERT" || eventType === "UPDATE") {
            const key = `${row.judge_id}_${row.project_id}`;
            setScores(prev => ({ ...prev, [key]: { criteria: row.criteria || {}, notes: row.notes||"", time: new Date(row.submitted_at).getTime() } }));
          } else {
            loadScores(sid);
          }
        })
        // The writer already added its own entry locally — skip the echo of it.
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log",  filter: f("activity_log") }, ({ new: row }) => {
          setLog(prev => prev.some(x => x.id === row.id) ? prev : [dbToLog(row), ...prev]);
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "it_logs", filter: f("it_logs") }, ({ new: row }) => {
          setItLogs(prev => prev.some(x => x.id === row.id) ? prev : [dbToItLog(row), ...prev]);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "share_links",   filter: f("share_links")   }, () => loadShare(sid))
        .on("postgres_changes", { event: "*", schema: "public", table: "app_settings",  filter: f("app_settings")  }, () => loadSettings(sid))
        .on("postgres_changes", { event: "*", schema: "public", table: "deliberation_notes", filter: f("deliberation_notes") }, ({ eventType, new: row }) => {
          if (eventType === "INSERT" || eventType === "UPDATE") {
            const key = `${row.judge_id}_${row.project_id}`;
            setDeliberationNotes(prev => ({ ...prev, [key]: { comment:row.comment, recommendation:row.recommendation, flagged:row.flagged, submittedAt:new Date(row.submitted_at).getTime() } }));
          } else {
            loadDelibNotes(sid);
          }
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "final_decisions", filter: f("final_decisions") }, ({ eventType, new: row }) => {
          if (eventType === "INSERT" || eventType === "UPDATE") {
            setFinalDecisions(prev => ({ ...prev, [row.project_id]: { award:row.award, adminNotes:row.admin_notes||"", finalized:row.finalized, finalizedAt:row.finalized_at ? new Date(row.finalized_at).getTime() : null } }));
          } else {
            loadFinalDecisions(sid);
          }
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "validations", filter: f("validations") }, ({ eventType, new: row }) => {
          if (eventType === "INSERT" || eventType === "UPDATE") {
            const entry = { approved:row.approved, comment:row.comment, validatedAt:new Date(row.validated_at).getTime() };
            if (row.judge_id === "admin") setAdminValidation(entry);
            else setJudgeValidations(prev => ({ ...prev, [row.judge_id]: entry }));
          } else {
            loadValidations(sid);
          }
        })
        .subscribe((status, err) => {
          // Without this a dropped channel was invisible: the admin dashboard simply stopped
          // updating. Log each drop once, and the recovery. CLOSED during unmount is expected.
          if (status === "SUBSCRIBED") {
            if (realtimeDownRef.current) {
              realtimeDownRef.current = false;
              addItLog("INFO","SYSTEM","REALTIME_RECONNECTED","Live updates reconnected", {}, sid);
            }
          } else if (!unmounting && !realtimeDownRef.current) {
            realtimeDownRef.current = true;
            addItLog("WARN","SYSTEM","REALTIME_DOWN","Live updates disconnected — screens may be stale until it reconnects",
              { status, error: err?.message || null, online: navigator.onLine }, sid);
          }
        });
    };

    // Resolve school once, then init data + realtime together
    resolveSchool().then(school => {
      init(school);
      if (school?.id) setupChannel(school.id);
    });

    return () => {
      unmounting = true;
      authSub.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── CLIENT ERRORS → IT log ────────────────────────────────
  // A crash on a judge's tablet used to leave no trace. Same message logged once per
  // session, at most 20 per session, so a render loop cannot flood it_logs.
  const errSchoolId = currentSchool?.id;
  useEffect(() => {
    if (!errSchoolId) return;
    const report = (kind, message, extra) => {
      const msg = String(message || "Unknown error").slice(0, 300);
      const st = clientErrRef.current;
      if (st.count >= 20 || st.seen.has(msg)) return;
      st.seen.add(msg); st.count += 1;
      addItLog("ERROR","SYSTEM","CLIENT_ERROR", `${kind}: ${msg}`,
        { kind, ...extra, online: navigator.onLine, standalone: window.matchMedia?.("(display-mode: standalone)").matches || false,
          width: window.innerWidth, ua: navigator.userAgent.slice(0, 160) }, errSchoolId);
    };
    const onError = e => report("error", e.message,
      { source: (e.filename || "").split("/").pop(), line: e.lineno, col: e.colno, stack: String(e.error?.stack || "").slice(0, 600) });
    const onRejection = e => report("unhandledrejection", e.reason?.message || e.reason,
      { stack: String(e.reason?.stack || "").slice(0, 600) });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [errSchoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── INSTANT CACHE RESTORE (runs before Supabase loads) ────
  useEffect(() => {
    if (urlRegToken) return; // Don't restore judge session when visiting a registration link
    if (urlProjListToken) return; // Don't restore judge session when visiting a project list link
    if (urlShareToken) return; // Don't restore judge session when visiting a results link
    const savedId   = localStorage.getItem("sf_judge_id");
    const savedData = localStorage.getItem("sf_judge_data");
    // localStorage is per-origin and every school shares one origin, so a session
    // saved at school A must not be restored while visiting school B.
    const savedSlug = localStorage.getItem("sf_judge_slug");
    if (savedSlug && savedSlug !== urlSchoolSlug) return;
    if (savedId && savedData) {
      try {
        const cachedJudge  = JSON.parse(savedData);
        const cachedScores = localStorage.getItem("sf_scores_cache");
        setJudge(cachedJudge);
        if (cachedScores) setScores(JSON.parse(cachedScores));
        setView("judge-home");
      } catch {
        localStorage.removeItem("sf_judge_id");
        localStorage.removeItem("sf_judge_data");
        localStorage.removeItem("sf_scores_cache");
        localStorage.removeItem("sf_judge_slug");
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── SESSION SYNC (after Supabase loads) ───────────────────
  // Refresh judge from DB, or clear if admin has reset all data.
  useEffect(() => {
    if (loading) return;
    if (urlRegToken) return; // Skip session sync on registration link
    if (urlProjListToken) return; // Skip session sync on project list link
    if (urlShareToken) return; // Skip session sync on results link
    const savedId = localStorage.getItem("sf_judge_id");
    if (!savedId) return;
    // Never reconcile a session that belongs to a different school (see restore above).
    const savedSlug = localStorage.getItem("sf_judge_slug");
    if (savedSlug && savedSlug !== urlSchoolSlug) return;
    if (judges.length > 0) {
      const found = judges.find(j => j.id === savedId);
      if (found) {
        setJudge(found);
        localStorage.setItem("sf_judge_data", JSON.stringify(found));
        setView("judge-home");
      } else {
        // Judge was reset by admin — wipe local cache
        localStorage.removeItem("sf_judge_id");
        localStorage.removeItem("sf_judge_data");
        localStorage.removeItem("sf_scores_cache");
        localStorage.removeItem("sf_offline_queue");
        localStorage.removeItem("sf_judge_slug");
        setJudge(null); setView("landing");
      }
    }
    // judges.length === 0 means Supabase was unreachable — keep the cached session
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── SCORE CACHE ───────────────────────────────────────────
  // Persist this judge's own scores to localStorage after every change.
  useEffect(() => {
    if (loading || !judge) return;
    const myScores = {};
    judge.projects.forEach(pid => {
      const key = `${judge.id}_${pid}`;
      if (scores[key]) myScores[key] = scores[key];
    });
    localStorage.setItem("sf_scores_cache", JSON.stringify(myScores));
  }, [scores, judge, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ONLINE / OFFLINE EVENTS ───────────────────────────────
  useEffect(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOnline) flushOfflineQueue();
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── REGISTRATION TAB LAZY LOAD ───────────────────────────
  useEffect(() => {
    if (adminTab === "registration") {
      loadRegLinks();
      loadRegSubmissions();
    }
    if (adminTab === "projects") {
      loadRegSubmissions();
    }
  }, [adminTab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function flushOfflineQueue() {
    // Guard against overlapping flushes (rapid online/offline flapping, or a manual
    // "Sync Now" landing on top of the automatic flush) — two concurrent passes
    // would race on the same localStorage key.
    if (flushingRef.current) return;
    const queue = JSON.parse(localStorage.getItem("sf_offline_queue") || "[]");
    if (!queue.length) return;
    flushingRef.current = true;
    // NOTE: .finally() rather than a try/finally block on purpose — a try/finally
    // anywhere in this component makes the React Compiler bail out, which silently
    // disables the react-hooks/purity and /immutability lint rules for the whole file.
    await runOfflineFlush(queue).finally(() => { flushingRef.current = false; });
  }

  async function runOfflineFlush(queue) {
    const flushedKeys = new Set();
    const failedKeys  = new Set();
    const failErrors  = [];
    for (const item of queue) {
      const key = `${item.data.judge_id}_${item.data.project_id}`;
      flushedKeys.add(key);
      const { error } = await supabase.from("scores").upsert(item.data, { onConflict: "judge_id,project_id" });
      if (error) { failedKeys.add(key); failErrors.push(error.code || error.message || "unknown"); }
    }
    // Before this, a score the server kept REJECTING (e.g. the judge row was removed by a
    // reset) retried forever with nothing in the log — only successes were recorded.
    if (failedKeys.size > 0) {
      const oldest = Math.min(...queue.map(i => i.ts || Date.now()));
      addItLog("WARN","DB","OFFLINE_SYNC_FAILED",`${failedKeys.size} queued score(s) could not be synced — still on the device`,
        { failed: failedKeys.size, attempted: queue.length, errors: [...new Set(failErrors)].slice(0, 5),
          oldestWaitMin: Math.round((Date.now() - oldest) / 60000), online: navigator.onLine,
          judgeId: judge?.id || null, alias: judge?.alias || null });
    }
    // Re-read localStorage after the async loop — submitScore may have added new items
    // while we were awaiting upserts. Keep items that either failed (need retry) or
    // were added after this flush started (not in the original batch).
    const current = JSON.parse(localStorage.getItem("sf_offline_queue") || "[]");
    const next = current.filter(i => {
      const key = `${i.data.judge_id}_${i.data.project_id}`;
      return failedKeys.has(key) || !flushedKeys.has(key);
    });
    localStorage.setItem("sf_offline_queue", JSON.stringify(next));
    setOfflineQueue(next);
    const syncedCount = queue.length - failedKeys.size;
    if (syncedCount > 0) {
      const syncedAt = Date.now();
      setLastSyncAt(syncedAt);
      localStorage.setItem("sf_last_sync_at", String(syncedAt));
      addItLog("INFO","DB","OFFLINE_QUEUE_FLUSHED",`Synced ${syncedCount} queued score(s) to server`,{ synced: syncedCount });
    }
  }

  function assignProjects(deptId, projectList) {
    // Every judge scores every project in their department.
    // projectList lets callers pass a freshly-computed roster when `projects`
    // state has not flushed yet (e.g. immediately after addProject).
    const list = projectList || projects;
    return list.filter(p => (p.department_id || null) === (deptId || null)).map(p => p.id);
  }

  // Judges snapshot their project list at registration, so any project added,
  // removed, or moved between departments afterwards must be pushed out to the
  // judges of the affected departments — otherwise a late-added project is
  // invisible to everyone who already signed in.
  async function syncJudgeAssignments(deptIds, projectList) {
    if (!currentSchool?.id) return;
    const targets = [...new Set((Array.isArray(deptIds) ? deptIds : [deptIds]).filter(Boolean))];
    if (!targets.length) return;
    const list = projectList || projects;
    const updates = [];
    judges.forEach(j => {
      if (!targets.includes(j.department_id)) return;
      const next = assignProjects(j.department_id, list);
      const cur  = j.projects || [];
      const same = next.length === cur.length && next.every(pid => cur.includes(pid));
      if (!same) updates.push({ id: j.id, alias: j.alias, projects: next });
    });
    if (!updates.length) return;
    setJudges(prev => prev.map(j => {
      const u = updates.find(x => x.id === j.id);
      return u ? { ...j, projects: u.projects } : j;
    }));
    for (const u of updates) {
      await supabase.from("judges").update({ projects: u.projects })
        .eq("school_id", currentSchool.id).eq("id", u.id);
    }
    addItLog("INFO","ADMIN","JUDGE_ASSIGNMENTS_SYNCED",
      "Judge project assignments re-synced after a project change",
      { judgesUpdated: updates.length, aliases: updates.map(u => u.alias) });
  }

  function isLinkLive() {
    if (!shareEnabled || !shareToken) return false;
    if (shareExpiry === "never") return true;
    return shareCreated && (Date.now() - shareCreated) < EXPIRY_MS[shareExpiry];
  }

  // Must include the school path — a bare origin lands on the platform homepage,
  // not this school's results.
  function shareUrl() {
    const base = currentSchool?.slug
      ? `${window.location.origin}/s/${currentSchool.slug}`
      : window.location.origin;
    return `${base}?token=${shareToken}`;
  }

  async function generateLink() {
    const t = genToken();
    const { error } = await supabase.from("share_links").insert({
      school_id: currentSchool.id, token: t, expiry: shareExpiry, show_rubric: shareShowRubric, title: shareTitle,
    });
    if (!error) {
      setShareToken(t); setShareEnabled(true); setShareCreated(Date.now());
      addLog(`Admin generated public results link — token: ${t}`);
      addItLog("INFO","SHARE","LINK_GENERATED","Admin generated public results link",{ token:t, expiry:shareExpiry, showRubric:shareShowRubric });
    }
  }

  async function revokeLink() {
    await supabase.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("school_id", currentSchool.id).eq("token", shareToken);
    addItLog("WARN","SHARE","LINK_REVOKED","Admin revoked public results link",{ token:shareToken, wasExpiry:shareExpiry });
    setShareEnabled(false); setShareToken(""); setShareCreated(null);
    addLog("Admin revoked public results link");
  }

  // School-scoped, same as shareUrl() — a bare origin would hit the platform homepage.
  function projListUrl() {
    const base = currentSchool?.slug
      ? `${window.location.origin}/s/${currentSchool.slug}`
      : window.location.origin;
    return `${base}?projects=${projListToken}`;
  }

  async function generateProjListLink() {
    const t = genToken();
    await supabase.from("app_settings").upsert({ school_id: currentSchool.id, key: "project_list_token", value: t });
    setProjListToken(t);
    addLog(`Admin generated project list share link — token: ${t}`);
    addItLog("INFO","SHARE","PROJ_LIST_LINK_GENERATED","Admin generated project list share link", { token: t });
  }

  async function revokeProjListLink() {
    await supabase.from("app_settings").upsert({ school_id: currentSchool.id, key: "project_list_token", value: "" });
    setProjListToken("");
    addLog("Admin revoked project list share link");
    addItLog("WARN","SHARE","PROJ_LIST_LINK_REVOKED","Admin revoked project list share link", {});
  }

  // Full project roster as CSV — the admin's own off-database copy of every team (adviser,
  // students + grades, room, answers). Student names are included: admin-only, keep it private.
  function exportProjectsCSV() {
    const deptName = (id) => departments.find(d => d.id === id)?.name || "Unassigned";
    const rows = [[
      "Project #","Title","Department","Category","Grade","Room","Teacher / Adviser",
      "Students (grade)","What they plan to investigate","Why they chose it","Locked","Reviews",`Avg Score (of rubric max ${rubricMax()})`,
    ].map(csvCell)];
    [...projects].sort((a, b) => String(a.num).localeCompare(String(b.num))).forEach(p => {
      const sub = regSubmissions.find(s => s.project_id === p.id);
      const reviews = Object.keys(scores).filter(k => k.endsWith(`_${p.id}`)).length;
      rows.push([
        p.num, p.title, deptName(p.department_id), p.cat, p.grade, p.room || "",
        p.advisor_name || sub?.advisor_name || "",
        membersText(p.group_members?.length ? p.group_members : sub?.group_members),
        p.description || "", p.motivation || "", p.locked ? "yes" : "no", reviews, projAvg(p.id) ?? "",
      ].map(csvCell));
    });
    // BOM so Excel opens accented names (Navajo, Spanish…) correctly.
    const blob = new Blob([String.fromCharCode(0xFEFF) + rows.map(r => r.join(",")).join(String.fromCharCode(10))], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `projects_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    addItLog("INFO","ADMIN","PROJECTS_CSV_EXPORTED","Admin downloaded the projects CSV",{ count: projects.length });
  }

  function exportProjListPDF() {
    const deptColor = (name) => {
      const n = (name||"").toLowerCase();
      return n.includes("elem") ? "#059669" : n.includes("middle") ? "#d97706" : n.includes("high") ? "#2563eb" : "#7c3aed";
    };
    const grouped = departments.filter(d => d.id).map(d => ({
      dept: d,
      projs: projects.filter(p => p.department_id === d.id).sort((a,b) => a.num.localeCompare(b.num)),
    })).filter(g => g.projs.length > 0);
    const unassigned = projects.filter(p => !p.department_id).sort((a,b) => a.num.localeCompare(b.num));
    const dateStr = new Date().toLocaleDateString([], { year:"numeric", month:"long", day:"numeric" });

    const rows = (projs) => projs.map(p => {
      const sub = regSubmissions.find(s => s.project_id === p.id);
      // Project-level values win; registration submission is the legacy fallback.
      const adviser = p.advisor_name || sub?.advisor_name || "";
      const members = membersText(p.group_members?.length ? p.group_members : sub?.group_members);
      const meta = [
        adviser ? `<span style="color:#1e293b;font-weight:500">Adviser:</span> ${escHtml(adviser)}` : "",
        members ? `<span style="color:#1e293b;font-weight:500">Members:</span> ${escHtml(members)}` : "",
        p.room  ? `<span style="color:#1e293b;font-weight:500">Room:</span> ${escHtml(p.room)}` : "",
      ].filter(Boolean).join(" &nbsp;·&nbsp; ");
      return `
      <tr>
        <td style="font-family:monospace;color:#1e3a5f;white-space:nowrap;vertical-align:top">#${escHtml(p.num)}</td>
        <td>
          <div style="font-weight:600">${escHtml(p.title)}</div>
          ${meta ? `<div style="font-size:.8rem;color:#64748b;margin-top:.2rem">${meta}</div>` : ""}
        </td>
        <td style="color:#64748b;vertical-align:top">${escHtml(p.cat)}</td>
        <td style="color:#64748b;text-align:center;vertical-align:top">${escHtml(p.grade||"—")}</td>
      </tr>`;
    }).join("");

    const sections = grouped.map(({ dept, projs }) => `
      <div style="margin-bottom:1.5rem">
        <div style="display:inline-block;background:${deptColor(dept.name)}18;color:${deptColor(dept.name)};
          border:1px solid ${deptColor(dept.name)}40;border-radius:6px;padding:.25rem .75rem;
          font-size:.8rem;font-weight:600;margin-bottom:.6rem">${dept.name}</div>
        <table style="width:100%;border-collapse:collapse;font-size:.88rem">
          <thead>
            <tr style="border-bottom:2px solid #e2e8f0;color:#64748b;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em">
              <th style="text-align:left;padding:.4rem .5rem;width:60px">#</th>
              <th style="text-align:left;padding:.4rem .5rem">Project Title</th>
              <th style="text-align:left;padding:.4rem .5rem;width:160px">Category</th>
              <th style="text-align:center;padding:.4rem .5rem;width:60px">Grade</th>
            </tr>
          </thead>
          <tbody>${rows(projs)}</tbody>
        </table>
      </div>`).join("");

    const unassignedSection = unassigned.length ? `
      <div style="margin-bottom:1.5rem">
        <div style="display:inline-block;background:#fee2e218;color:#dc2626;
          border:1px solid #dc262640;border-radius:6px;padding:.25rem .75rem;
          font-size:.8rem;font-weight:600;margin-bottom:.6rem">Unassigned</div>
        <table style="width:100%;border-collapse:collapse;font-size:.88rem">
          <thead>
            <tr style="border-bottom:2px solid #e2e8f0;color:#64748b;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em">
              <th style="text-align:left;padding:.4rem .5rem;width:60px">#</th>
              <th style="text-align:left;padding:.4rem .5rem">Project Title</th>
              <th style="text-align:left;padding:.4rem .5rem;width:160px">Category</th>
              <th style="text-align:center;padding:.4rem .5rem;width:60px">Grade</th>
            </tr>
          </thead>
          <tbody>${rows(unassigned)}</tbody>
        </table>
      </div>` : "";

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Science Fair — Project List</title>
      <style>
        body{font-family:"Segoe UI",Arial,sans-serif;color:#1e293b;margin:0;padding:2rem 2.5rem;font-size:.9rem}
        table td{padding:.45rem .5rem;border-bottom:1px solid #f1f5f9;vertical-align:top}
        @media print{body{padding:1rem 1.5rem}button{display:none!important}}
      </style>
    </head><body>
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:.25rem">
        <img src="/logo.png" style="height:48px;border-radius:6px" onerror="this.style.display='none'">
        <div>
          <div style="font-size:1.3rem;font-weight:800;color:#1e3a5f">Science Fair — Project List</div>
          <div style="color:#64748b;font-size:.8rem">Generated ${dateStr} · ${projects.length} project${projects.length!==1?"s":""}</div>
        </div>
      </div>
      <hr style="border:none;border-top:2px solid #e2e8f0;margin:1rem 0 1.5rem">
      ${sections}${unassignedSection}
      <div style="text-align:center;margin-top:2rem">
        <button onclick="window.print()" style="padding:.5rem 1.5rem;background:#1e3a5f;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.88rem">🖨 Print / Save as PDF</button>
      </div>
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  // (updateMaxJudges removed 2026-09 — the global app_settings.max_judges cap was
  //  never enforced; per-department departments.max_judges is the only limit.
  //  See updateDeptMaxJudges below.)

  // ── Judge numbers (migration 2026-10g) ─────────────────────────────────────
  // School-wide numbering is only real once the departments carry judge numbers;
  // before the migration runs the app keeps the old per-department numbering.
  function schoolNumbering() {
    return judgeNumbering === "school" && departments.some(d => d.judge_from != null);
  }
  function deptForJudgeNum(n) {
    if (!n) return null;
    return [...departments].sort((a, b) => a.ord - b.ord)
      .find(d => d.judge_from != null && n >= d.judge_from && n <= d.judge_to) || null;
  }
  function judgeRangeText(d) {
    if (d?.judge_from == null) return "no judges";
    return d.judge_from === d.judge_to ? `Judge ${d.judge_from}` : `Judge ${d.judge_from}–${d.judge_to}`;
  }
  function deptJudgeCount(d) {
    return d?.judge_from == null ? 0 : d.judge_to - d.judge_from + 1;
  }
  // Counts typed in the Setup tab → contiguous ranges in department order
  // (PreK 2, K-2 2, 3-5 3 → 1–2, 3–4, 5–7). A count of 0 gives the department no judges.
  function plannedJudgeRanges() {
    // A plain loop on purpose: bumping `next` inside a .map() callback bails the React
    // Compiler out of the whole file (rule 37).
    const out = [];
    let next = 1;
    for (const d of [...departments].sort((a, b) => a.ord - b.ord)) {
      const raw = judgeCountDrafts[d.id];
      const n = raw === undefined ? deptJudgeCount(d) : Math.max(0, parseInt(raw, 10) || 0);
      out.push({ dept: d, count: n, ...(n > 0 ? { from: next, to: next + n - 1 } : { from: null, to: null }) });
      next += n;
    }
    return out;
  }

  async function saveJudgeNumbers() {
    setSetupErr("");
    const plan = plannedJudgeRanges();
    const total = plan.reduce((a, p) => a + p.count, 0);
    if (total === 0) { setSetupErr("Give at least one department some judges."); return; }
    if (total > 999) { setSetupErr("A school can have at most 999 judge numbers."); return; }
    // The server re-checks all of this (overlaps, and that no signed-in judge would end
    // up outside their department) — its message is written for the admin to read.
    const { error } = await supabase.rpc("set_judge_numbers", {
      p_school_id: currentSchool.id,
      p_ranges: plan.map(p => ({ department_id: p.dept.id, from: p.from, to: p.to })),
    });
    if (error) {
      setSetupErr(`Judge numbers NOT saved: ${error.message}`);
      addItLog("ERROR","ADMIN","JUDGE_NUMBERS_SAVE_FAILED","Could not save the judge list",{ error: error.code || error.message });
      return;
    }
    setJudgeCountDrafts({});
    await loadDepartments(currentSchool.id);
    const summary = plan.map(p => `${p.dept.name} ${p.from == null ? "none" : `${p.from}-${p.to}`}`).join(", ");
    addLog(`Admin set the judge numbers: ${summary}`);
    addItLog("INFO","ADMIN","JUDGE_NUMBERS_SAVED","Admin saved the school's judge list",
      { total, ranges: plan.map(p => ({ dept: p.dept.name, from: p.from, to: p.to })) });
  }

  async function setJudgeNumberingMode(mode) {
    if (mode !== "school" && mode !== "department") return;
    setSetupErr("");
    const { error } = await supabase.from("app_settings")
      .upsert({ school_id: currentSchool.id, key: "judge_numbering", value: mode }, { onConflict: "school_id,key" });
    if (error) {
      setSetupErr(`Judge numbering NOT changed: ${error.message}`);
      addItLog("ERROR","ADMIN","JUDGE_NUMBERING_CHANGE_FAILED","Could not change the judge numbering",{ mode, error: error.code || error.message });
      return;
    }
    setJudgeNumbering(mode);
    addLog(mode === "school" ? "Admin switched to one judge list for the whole school"
                             : "Admin switched to judge numbers that restart in each department");
    addItLog("INFO","ADMIN","JUDGE_NUMBERING_CHANGED","Admin changed how judges are numbered",{ mode });
  }

  // Remove ONE judge (wrong department, a stranger, a test sign-in). Before 2026-10g the
  // only way was Reset All Data. PIN-gated because it deletes that judge's scores.
  async function confirmRemoveJudge() {
    const j = removeJudgeAsk;
    if (!j) return;
    const ok = await verifyAdminPin(removeJudgePin);
    if (!ok.valid) {
      setRemoveJudgeErr(ok.message || "Incorrect PIN.");
      addItLog("WARN","AUTH","JUDGE_REMOVE_PIN_FAILED","Judge removal denied — wrong PIN",{ alias: j.alias });
      setTimeout(() => setRemoveJudgePin(""), 600);
      return;
    }
    const { data, error } = await supabase.rpc("remove_judge", { p_school_id: currentSchool.id, p_judge_id: j.id });
    if (error) {
      const missing = /remove_judge/.test(error.message || "") && /function|not find/i.test(error.message || "");
      setRemoveJudgeErr(missing
        ? "This needs a database update that has not been run yet (migration 2026-10g)."
        : `${j.alias} was NOT removed: ${error.message}`);
      addItLog("ERROR","ADMIN","JUDGE_REMOVE_FAILED","Could not remove a judge",{ alias: j.alias, error: error.code || error.message });
      return;
    }
    const sid = currentSchool.id;
    setJudges(p => p.filter(x => x.id !== j.id));
    await Promise.all([loadScores(sid), loadValidations(sid), loadDelibNotes(sid)]);
    const dept = departments.find(d => d.id === j.department_id);
    addLog(`Admin removed ${j.alias}${dept ? ` (${dept.name})` : ""} and ${data?.scores ?? 0} of their score(s)`);
    addItLog("WARN","ADMIN","JUDGE_REMOVED","Admin removed a judge and their scores",
      { judgeId: j.id, alias: j.alias, dept: dept?.name || null, scoresRemoved: data?.scores ?? 0 });
    setRemoveJudgeAsk(null); setRemoveJudgePin(""); setRemoveJudgeErr("");
  }

  async function updateDeptMaxJudges(deptId, newMax) {
    const num = parseInt(newMax);
    if (isNaN(num) || num < 1) return;
    const dept = departments.find(d => d.id === deptId);
    if (!dept) return;
    const currentCount = judges.filter(j => j.department_id === deptId).length;
    if (num < currentCount) {
      setDeptMaxDrafts(p => ({ ...p, [deptId]: String(dept.max_judges) }));
      return;
    }
    await supabase.from("departments").update({ max_judges: num }).eq("school_id", currentSchool.id).eq("id", deptId);
    setDepartments(prev => prev.map(d => d.id === deptId ? { ...d, max_judges: num } : d));
    addLog(`Admin set max judges for ${dept.name} to ${num}`);
    addItLog("INFO","ADMIN","MAX_JUDGES_UPDATED","Admin updated max judges for department",{ dept: dept.name, newMax: num, currentCount });
  }

  // ── SETUP TAB: departments + categories ───────────────────────────────────
  // Both are plain per-school rows. The guardrails below are the whole reason
  // these are functions and not raw queries:
  //   • a department is referenced by judges.department_id and projects.department_id
  //     (both ON DELETE SET NULL), so deleting a used one silently orphans judges
  //     and makes projects invisible to everyone — blocked outright.
  //   • a category is NOT referenced by anything (projects.cat is free text), so
  //     deleting one is safe; existing projects keep their label. We only warn.
  // Declared (not a const arrow) so it is hoisted — the projForm useState
  // initializer near the top of the component calls it.
  function catNames() { return categories.map(c => c.name); }

  // ── Scoring mode (migration 2026-10f) ─────────────────────────────────────
  // A 'feedback' department is never scored, ranked, tied or flagged as an
  // outlier. Everything that produces or compares numbers must skip it — that is
  // why these are helpers rather than inline checks (CLAUDE.md rule 59).
  function deptMode(deptId) {
    return departments.find(d => d.id === deptId)?.scoring_mode === "feedback" ? "feedback" : "scored";
  }
  function isFeedbackDept(deptId) { return deptMode(deptId) === "feedback"; }
  function isFeedbackProject(proj) { return !!proj && isFeedbackDept(proj.department_id); }
  // Projects that carry a score/ranking. Used by every leaderboard, tie check and
  // anomaly scan so a comment-only department can never appear in a ranking.
  function scoredProjects() { return projects.filter(p => !isFeedbackProject(p)); }

  async function updateDeptScoringMode(deptId, mode) {
    const dept = departments.find(d => d.id === deptId);
    if (!dept || (mode !== "scored" && mode !== "feedback")) return;
    const scored = Object.keys(scores).some(k => {
      const pid = k.slice(k.lastIndexOf("_") + 1);
      return projects.some(p => p.id === pid && p.department_id === deptId);
    });
    if (scored) {
      setSetupErr(`"${dept.name}" already has scores. Changing how it is judged now would ` +
        `strand them — they would stop counting but stay in the database. Reset or finish the event first.`);
      return;
    }
    setSetupErr("");
    const { error } = await supabase.from("departments")
      .update({ scoring_mode: mode }).eq("school_id", currentSchool.id).eq("id", deptId);
    if (error) {
      // 42703 / PGRST204 = migration 2026-10f has not been run on this project.
      const missing = error.code === "42703" || error.code === "PGRST204";
      setSetupErr(missing
        ? "This needs a database update that has not been run yet (migration 2026-10f). Scoring stays as it is until then."
        : `Could not change how "${dept.name}" is judged: ${error.message}`);
      addItLog(missing ? "WARN" : "ERROR","DB",
        missing ? "SCORING_MODE_COLS_MISSING" : "SCORING_MODE_UPDATE_FAILED",
        "departments.scoring_mode could not be written", { dept: dept.name, error: error.message });
      return;
    }
    setDepartments(prev => prev.map(d => d.id === deptId ? { ...d, scoring_mode: mode } : d));
    addLog(`Admin set ${dept.name} to ${mode === "feedback" ? "comments only (not scored)" : "scored"}`);
    addItLog("INFO","ADMIN","SCORING_MODE_CHANGED","Admin changed a department's scoring mode",
      { dept: dept.name, mode });
  }
  // Short code used for registration numbers; derived from the name if unset.
  function autoCode(name) {
    const words = String(name || "").trim().split(/[\s/&-]+/).filter(Boolean);
    const raw = words.length > 1
      ? words.map(w => w[0]).join("")
      : String(name || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 4);
    return raw.toUpperCase().slice(0, 5);
  }

  async function addDepartment(name, code) {
    const nm = String(name || "").trim();
    if (!nm) { setSetupErr("Give the department a name."); return; }
    if (departments.some(d => d.name.toLowerCase() === nm.toLowerCase())) {
      setSetupErr(`"${nm}" already exists.`); return;
    }
    setSetupErr("");
    const ord = departments.reduce((m, d) => Math.max(m, d.ord), -1) + 1;
    const { data, error } = await supabase.from("departments")
      .insert({ school_id: currentSchool.id, name: nm, code: (code || autoCode(nm)).trim(), max_judges: 5, ord })
      .select().single();
    if (error) {
      setSetupErr(`Could not add "${nm}": ${error.message}`);
      addItLog("ERROR","ADMIN","DEPARTMENT_ADD_FAILED","Department could not be added",{ name: nm, error: error.message });
      return;
    }
    // The row comes back with its judge numbers (assigned by a DB trigger, 2026-10g).
    setDepartments(prev => [...prev, dbToDept(data)]);
    setNewDept({ name: "", code: "" });
    addLog(`Admin added the department "${nm}"`);
    addItLog("INFO","ADMIN","DEPARTMENT_ADDED","Admin added a department",{ name: nm });
  }

  async function saveDepartment(deptId) {
    const dept = departments.find(d => d.id === deptId);
    const draft = deptEdits[deptId];
    if (!dept || !draft) return;
    const nm = String(draft.name || "").trim();
    if (!nm) { setSetupErr("A department needs a name."); return; }
    if (departments.some(d => d.id !== deptId && d.name.toLowerCase() === nm.toLowerCase())) {
      setSetupErr(`"${nm}" already exists.`); return;
    }
    setSetupErr("");
    const code = String(draft.code || "").trim();
    const { error } = await supabase.from("departments")
      .update({ name: nm, code }).eq("school_id", currentSchool.id).eq("id", deptId);
    if (error) {
      setSetupErr(`Could not rename "${dept.name}": ${error.message}`);
      addItLog("ERROR","ADMIN","DEPARTMENT_SAVE_FAILED","Department could not be saved",{ id: deptId, error: error.message });
      return;
    }
    setDepartments(prev => prev.map(d => d.id === deptId ? { ...d, name: nm, code } : d));
    setDeptEdits(p => { const n = { ...p }; delete n[deptId]; return n; });
    if (nm !== dept.name) addLog(`Admin renamed the department "${dept.name}" to "${nm}"`);
    addItLog("INFO","ADMIN","DEPARTMENT_SAVED","Admin saved a department",{ from: dept.name, to: nm, code });
  }

  // Reordering swaps `ord` with the neighbour. Order is cosmetic (it drives the
  // display order of leaderboards and dropdowns), so a half-applied swap is
  // harmless — but both writes are awaited so state and DB cannot diverge.
  async function moveDepartment(deptId, dir) {
    const sorted = [...departments].sort((a, b) => a.ord - b.ord);
    const i = sorted.findIndex(d => d.id === deptId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[i], b = sorted[j];
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("departments").update({ ord: b.ord }).eq("school_id", currentSchool.id).eq("id", a.id),
      supabase.from("departments").update({ ord: a.ord }).eq("school_id", currentSchool.id).eq("id", b.id),
    ]);
    if (e1 || e2) { setSetupErr("Could not reorder — try again."); return; }
    setDepartments(prev => prev.map(d =>
      d.id === a.id ? { ...d, ord: b.ord } : d.id === b.id ? { ...d, ord: a.ord } : d));
  }

  // Blocked whenever anything points at the department. ON DELETE SET NULL means
  // Postgres would happily accept this and quietly unassign every judge and
  // project instead of refusing — so the check has to live here.
  function requestDeleteDepartment(deptId) {
    const dept = departments.find(d => d.id === deptId);
    if (!dept) return;
    const nJudges = judges.filter(j => j.department_id === deptId).length;
    const nProjects = projects.filter(p => p.department_id === deptId).length;
    if (nJudges || nProjects) {
      setSetupErr(`"${dept.name}" still has ${nProjects} project${nProjects !== 1 ? "s" : ""} and ` +
        `${nJudges} judge${nJudges !== 1 ? "s" : ""}. Move them to another department first — ` +
        `deleting it now would leave them unassigned and invisible to judges.`);
      return;
    }
    setSetupErr("");
    setSetupConfirm({ kind: "dept", id: deptId, name: dept.name });
  }

  async function deleteDepartment(deptId) {
    const dept = departments.find(d => d.id === deptId);
    if (!dept) return;
    const { error } = await supabase.from("departments")
      .delete().eq("school_id", currentSchool.id).eq("id", deptId);
    if (error) {
      setSetupErr(`Could not delete "${dept.name}": ${error.message}`);
      addItLog("ERROR","ADMIN","DEPARTMENT_DELETE_FAILED","Department could not be deleted",{ name: dept.name, error: error.message });
      return;
    }
    setDepartments(prev => prev.filter(d => d.id !== deptId));
    addLog(`Admin deleted the department "${dept.name}"`);
    addItLog("WARN","ADMIN","DEPARTMENT_DELETED","Admin deleted a department",{ name: dept.name });
  }

  // Presets only ADD the departments a school does not have yet — they never
  // delete, so applying one can't destroy anything. Unwanted leftovers are
  // removed one at a time through the guarded delete above.
  async function applyDeptPreset(presetId) {
    const preset = DEPT_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    const have = new Set(departments.map(d => d.name.toLowerCase()));
    const missing = preset.depts.filter(d => !have.has(d.name.toLowerCase()));
    if (!missing.length) { setSetupErr(`You already have every department in "${preset.label}".`); return; }
    setSetupErr("");
    const base = departments.reduce((m, d) => Math.max(m, d.ord), -1) + 1;
    const rows = missing.map((d, i) =>
      ({ school_id: currentSchool.id, name: d.name, code: d.code, max_judges: 5, ord: base + i }));
    const { data, error } = await supabase.from("departments").insert(rows).select();
    if (error) {
      setSetupErr(`Could not apply "${preset.label}": ${error.message}`);
      addItLog("ERROR","ADMIN","DEPT_PRESET_FAILED","Department preset could not be applied",{ preset: preset.id, error: error.message });
      return;
    }
    setDepartments(prev => [...prev, ...data.map(dbToDept)]);
    addLog(`Admin added ${missing.length} department${missing.length !== 1 ? "s" : ""} from "${preset.label}"`);
    addItLog("INFO","ADMIN","DEPT_PRESET_APPLIED","Admin applied a department preset",
      { preset: preset.id, added: missing.map(d => d.name) });
  }

  async function addCategory(name, code) {
    const nm = String(name || "").trim();
    if (!nm) { setSetupErr("Give the category a name."); return; }
    if (categories.some(c => c.name.toLowerCase() === nm.toLowerCase())) {
      setSetupErr(`"${nm}" already exists.`); return;
    }
    setSetupErr("");
    const ord = categories.reduce((m, c) => Math.max(m, c.ord), -1) + 1;
    const { data, error } = await supabase.from("categories")
      .insert({ school_id: currentSchool.id, name: nm, code: (code || autoCode(nm)).trim(), ord })
      .select().single();
    if (error) {
      setSetupErr(`Could not add "${nm}": ${error.message}`);
      addItLog("ERROR","ADMIN","CATEGORY_ADD_FAILED","Category could not be added",{ name: nm, error: error.message });
      return;
    }
    setCategories(prev => [...prev, { id: data.id, name: data.name, code: data.code || "", ord: data.ord }]);
    setNewCat({ name: "", code: "" });
    addLog(`Admin added the project category "${nm}"`);
    addItLog("INFO","ADMIN","CATEGORY_ADDED","Admin added a project category",{ name: nm });
  }

  // Renaming a category does NOT rewrite the projects already saved under the old
  // name — projects.cat is a text snapshot with no foreign key. Those projects keep
  // the old label and the edit form shows it as "(old category)". The UI says so.
  async function saveCategory(catId) {
    const cat = categories.find(c => c.id === catId);
    const draft = catEdits[catId];
    if (!cat || !draft) return;
    const nm = String(draft.name || "").trim();
    if (!nm) { setSetupErr("A category needs a name."); return; }
    if (categories.some(c => c.id !== catId && c.name.toLowerCase() === nm.toLowerCase())) {
      setSetupErr(`"${nm}" already exists.`); return;
    }
    setSetupErr("");
    const code = String(draft.code || "").trim();
    const { error } = await supabase.from("categories")
      .update({ name: nm, code }).eq("school_id", currentSchool.id).eq("id", catId);
    if (error) {
      setSetupErr(`Could not save "${cat.name}": ${error.message}`);
      addItLog("ERROR","ADMIN","CATEGORY_SAVE_FAILED","Category could not be saved",{ id: catId, error: error.message });
      return;
    }
    setCategories(prev => prev.map(c => c.id === catId ? { ...c, name: nm, code } : c));
    setCatEdits(p => { const n = { ...p }; delete n[catId]; return n; });
    if (nm !== cat.name) addLog(`Admin renamed the category "${cat.name}" to "${nm}"`);
    addItLog("INFO","ADMIN","CATEGORY_SAVED","Admin saved a project category",{ from: cat.name, to: nm, code });
  }

  async function moveCategory(catId, dir) {
    const sorted = [...categories].sort((a, b) => a.ord - b.ord);
    const i = sorted.findIndex(c => c.id === catId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[i], b = sorted[j];
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("categories").update({ ord: b.ord }).eq("school_id", currentSchool.id).eq("id", a.id),
      supabase.from("categories").update({ ord: a.ord }).eq("school_id", currentSchool.id).eq("id", b.id),
    ]);
    if (e1 || e2) { setSetupErr("Could not reorder — try again."); return; }
    setCategories(prev => prev.map(c =>
      c.id === a.id ? { ...c, ord: b.ord } : c.id === b.id ? { ...c, ord: a.ord } : c));
  }

  function requestDeleteCategory(catId) {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;
    setSetupErr("");
    const used = projects.filter(p => p.cat === cat.name).length;
    setSetupConfirm({ kind: "cat", id: catId, name: cat.name, used });
  }

  async function deleteCategory(catId) {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;
    const { error } = await supabase.from("categories")
      .delete().eq("school_id", currentSchool.id).eq("id", catId);
    if (error) {
      setSetupErr(`Could not delete "${cat.name}": ${error.message}`);
      addItLog("ERROR","ADMIN","CATEGORY_DELETE_FAILED","Category could not be deleted",{ name: cat.name, error: error.message });
      return;
    }
    setCategories(prev => prev.filter(c => c.id !== catId));
    addLog(`Admin deleted the project category "${cat.name}"`);
    addItLog("WARN","ADMIN","CATEGORY_DELETED","Admin deleted a project category",{ name: cat.name });
  }

  // Adds back any of the six built-in categories that are missing. Like the
  // department presets it never deletes, so a school's own categories survive.
  async function restoreDefaultCategories() {
    const have = new Set(categories.map(c => c.name.toLowerCase()));
    const missing = DEFAULT_CATEGORIES.filter(c => !have.has(c.name.toLowerCase()));
    if (!missing.length) { setSetupErr("All of the built-in categories are already in your list."); return; }
    setSetupErr("");
    const base = categories.reduce((m, c) => Math.max(m, c.ord), -1) + 1;
    const { data, error } = await supabase.from("categories")
      .insert(missing.map((c, i) => ({ school_id: currentSchool.id, name: c.name, code: c.code, ord: base + i })))
      .select();
    if (error) { setSetupErr(`Could not restore the built-in categories: ${error.message}`); return; }
    setCategories(prev => [...prev, ...data.map(r => ({ id: r.id, name: r.name, code: r.code || "", ord: r.ord }))]);
    addLog(`Admin restored ${missing.length} built-in project categor${missing.length !== 1 ? "ies" : "y"}`);
    addItLog("INFO","ADMIN","CATEGORIES_RESTORED","Admin restored built-in categories",{ added: missing.map(c => c.name) });
  }

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl()).catch(()=>{});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  async function loadScoreBackups(sid) {
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    const { data } = await supabase.from("score_backups").select("id, label, created_at").eq("school_id", schoolId).order("created_at", { ascending: false });
    if (data) setScoreBackups(data);
  }

  async function saveScoreBackup() {
    setSavingBackup(true);
    setBackupSaved(false);
    const entries = [];
    for (const judge of judges) {
      for (const pid of judge.projects) {
        const sc = scores[`${judge.id}_${pid}`];
        if (!sc) continue;
        const proj = projects.find(p => p.id === pid);
        entries.push({
          judgeId:   judge.id,
          judgeAlias: judge.alias,
          department: departments.find(d => d.id === judge.department_id)?.name || "Unassigned",
          projectId:  pid,
          projectNum: proj?.num ?? "",
          projectTitle: proj?.title ?? "",
          category:   proj?.cat ?? "",
          grade:      proj?.grade ?? "",
          // v2 stores every criterion under `criteria` — copy the whole object so the
          // snapshot survives rubric changes and can be restored criterion-by-criterion.
          criteria:   { ...(sc.criteria || {}) },
          total:        getTotal(sc),
          notes:        sc.notes || "",
          submittedAt:  sc.time ? new Date(sc.time).toISOString() : "",
        });
      }
    }
    const snapshot = {
      generatedAt:   new Date().toISOString(),
      judgeCount:    judges.length,
      projectCount:  projects.length,
      scoreCount:    entries.length,
      // Snapshot the rubric too, so an old backup can still be rendered correctly
      // after the school edits its criteria.
      rubric,
      entries,
    };
    const label = `Backup — ${new Date().toLocaleString()}`;
    const { data, error } = await supabase.from("score_backups").insert({ school_id: currentSchool.id, label, snapshot }).select("id, label, created_at").single();
    if (!error && data) {
      setScoreBackups(prev => [data, ...prev]);
      addLog(`Admin saved score backup (${entries.length} entries)`);
      addItLog("INFO","ADMIN","SCORE_BACKUP_SAVED","Admin saved score backup to database",{ entryCount: entries.length, label });
      setBackupSaved(true);
      setTimeout(() => setBackupSaved(false), 3000);
    }
    setSavingBackup(false);
  }

  async function loadRegLinks() {
    if (!currentSchool?.id) return;
    const { data } = await supabase.from("registration_links").select("*").eq("school_id", currentSchool.id).order("created_at", { ascending: false });
    if (data) setRegLinks(data);
  }
  async function loadRegSubmissions() {
    if (!currentSchool?.id) return;
    const { data } = await supabase.from("registration_submissions")
      .select("id, reg_number, student_name, project_title, category, division, submitted_at, project_id, group_members, advisor_name")
      .eq("school_id", currentSchool.id)
      .order("submitted_at", { ascending: false });
    if (data) setRegSubmissions(data);
  }

  async function exportRegCSV() {
    if (!currentSchool?.id) return;
    const { data } = await supabase.from("registration_submissions")
      .select("*").eq("school_id", currentSchool.id).order("submitted_at", { ascending: true });
    if (!data || data.length === 0) return;
    const esc = csvCell;
    const headers = [
      "Reg #","Student Name","Grade Level","Division","School Name",
      "Student Email","Contact Number","Project Title","Category","Project Type",
      "Group Members","Advisor Name","Advisor Email","School Department",
      "Description","Research Question","Hypothesis",
      "Needs Electricity","Special Equipment","Has Trifold",
      "Is Original Work","Agrees to Rules","Guardian Name","Guardian Signature",
      "Submitted At"
    ];
    const rows = data.map(s => [
      s.reg_number, s.student_name, s.grade_level, s.division, s.school_name,
      s.student_email, s.contact_number, s.project_title, s.category, s.project_type,
      Array.isArray(s.group_members) ? s.group_members.join("; ") : (s.group_members || ""),
      s.advisor_name, s.advisor_email, s.school_department,
      s.description, s.research_question, s.hypothesis,
      s.needs_electricity ? "Yes" : "No",
      s.special_equipment, s.has_trifold ? "Yes" : "No",
      s.is_original_work ? "Yes" : "No", s.agrees_to_rules ? "Yes" : "No",
      s.guardian_name, s.guardian_signature,
      s.submitted_at ? new Date(s.submitted_at).toLocaleString() : ""
    ].map(esc).join(","));
    const csv = [headers.map(csvCell).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `registrations_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    addLog("Admin exported registration submissions as CSV.");
  }

  function exportJudgeScoresCSV() {
    // Columns are driven by the live rubric — a school with a custom rubric
    // gets its own criteria, not the hardcoded Northeast AZ 10.
    const maxTotal = rubric.reduce((s, r) => s + (Number(r.max) || 0), 0);
    const header = [
      "Judge","Department","Project #","Project Title","Category","Grade",
      ...rubric.map(r => `${r.label} (${r.max})`),
      `Total (${maxTotal})`,"Notes","Submitted"
    ];
    const rows = [header.map(csvCell)];
    for (const judge of [...judges].sort((a,b) => a.alias.localeCompare(b.alias))) {
      const deptName = departments.find(d => d.id === judge.department_id)?.name || "Unassigned";
      for (const proj of [...projects].sort((a,b) => (a.num||"").localeCompare(b.num||""))) {
        const sc = scores[`${judge.id}_${proj.id}`];
        if (!sc) continue;
        rows.push([
          judge.alias,
          deptName,
          proj.num,
          proj.title || "",
          proj.cat,
          proj.grade,
          ...rubric.map(r => critVal(sc, r.id)),
          getTotal(sc),
          sc.notes || "",
          sc.time ? new Date(sc.time).toISOString() : "",
        ].map(csvCell));
      }
    }
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `judge-scores-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function downloadBackupCSV(backup) {
    const entries = backup?.snapshot?.entries;
    if (!entries?.length) return;
    // Prefer the rubric captured inside the backup; fall back to the live one for
    // older snapshots that predate rubric capture.
    const snapRubric = backup?.snapshot?.rubric?.length ? backup.snapshot.rubric : rubric;
    const maxTotal = snapRubric.reduce((s, r) => s + (Number(r.max) || 0), 0);
    const header = [
      "Judge","Department","Project #","Project Title","Category","Grade",
      ...snapRubric.map(r => `${r.label} (${r.max})`),
      `Total (${maxTotal})`,"Notes","Submitted"
    ];
    const rows = [header.map(csvCell), ...entries.map(e => [
      e.judgeAlias,
      e.department || "",
      e.projectNum,
      e.projectTitle || "",
      e.category, e.grade,
      // critVal handles both v2 ({criteria:{...}}) and legacy flat-field entries.
      ...snapRubric.map(r => critVal(e, r.id)),
      e.total,
      e.notes || "",
      e.submittedAt,
    ].map(csvCell))];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `score-backup-${backup.id?.slice(0,8)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportResultsCSV() {
    // Rank within each department — projects are only comparable inside their own dept.
    const rows = [
      ["Department","Rank","Project #","Title","Category","Grade",`Avg Score (of ${rubricMax()})`,"Reviews","Award"].map(csvCell),
    ];
    const deptGroups = [
      ...departments.filter(d => d.id).map(d => ({ name: d.name, projs: rankedProjectsIn(d.id) })),
      { name: "Unassigned", projs: rankedProjectsIn(null) },
    ];
    deptGroups.forEach(g => {
      g.projs.forEach((p, i) => {
        const decision = finalDecisions[p.id];
        rows.push([
          g.name,
          i + 1, p.num,
          p.title || "",
          p.cat, p.grade,
          p.avg ?? "",
          p.revs,
          decision?.finalized ? decision.award : "Pending"
        ].map(csvCell));
      });
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "science-fair-results.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // Helpers — optimistic local update + fire-and-forget DB write.
  // Realtime subscriptions handle cross-client sync.
  // ⚠️ A supabase-js query only runs when it is awaited or .then()-ed. Until 2026-10-05 these
  // two inserts had neither, so NO activity or IT log row was ever written in v2 — the audit
  // trail existed only in each browser's memory. Keep the .then().
  // The entry id is generated here so the realtime INSERT echo can be de-duplicated.
  function addLog(msg) {
    const id = newUuid();
    setLog(p => [{ id, time: Date.now(), msg }, ...p]);
    if (!currentSchool?.id) return;
    supabase.from("activity_log").insert({ id, school_id: currentSchool.id, message: msg })
      .then(({ error }) => { if (error) console.warn("[activity_log] not saved:", error.message); });
  }

  // `sid` is only needed by callers that run outside a render with currentSchool set
  // (the mount effect, realtime status, window error listeners).
  function addItLog(level, module, event, detail, payload = {}, sid) {
    const entry = { id: itId(), ts: Date.now(), level, module, event, detail, payload };
    setItLogs(p => [entry, ...p]);
    const schoolId = sid || currentSchool?.id;
    if (!schoolId) return;
    // Never call addItLog from this callback — a failing insert would loop.
    supabase.from("it_logs").insert({ school_id: schoolId, id: entry.id, level, module, event, detail, payload })
      .then(({ error }) => { if (error) console.warn("[it_logs] not saved:", error.message); });
  }

  function buildReport(logs) {
    const now = new Date().toISOString();
    const header = [
      "╔══════════════════════════════════════════════════════════════╗",
      "║        SCIENCE FAIR APP — IT DIAGNOSTIC REPORT              ║",
      "╚══════════════════════════════════════════════════════════════╝",
      `Generated  : ${now}`,
      `App Version: 1.0.0`,
      `Filter     : ${itFilter}`,
      "",
      "── SYSTEM STATE ──────────────────────────────────────────────",
      `Judges Registered : ${judges.length}`,
      `Projects          : ${projects.length}`,
      `Scores Submitted  : ${totalScored()} / ${possible()}`,
      `Completion        : ${Math.round((totalScored()/possible())*100)||0}%`,
      `Judging Locked    : ${locked}`,
      `Results Link Live : ${isLinkLive()}`,
      shareToken ? `Share Token       : ${shareToken}` : `Share Token       : (none)`,
      `Deliberation      : ${deliberationOpen ? "Open" : "Closed"}`,
      `Delib Notes       : ${Object.keys(deliberationNotes).length}`,
      `Decisions         : ${Object.values(finalDecisions).filter(d => d.finalized).length} finalized / ${projects.length} total`,
      "",
      "── IT LOG ENTRIES ────────────────────────────────────────────",
    ].join("\n");

    const rows = logs.map(e =>
      `[${fmtISO(e.ts)}] [${e.level.padEnd(5)}] [${e.module.padEnd(6)}] ${e.event}\n` +
      `  → ${e.detail}\n` +
      `  PAYLOAD: ${JSON.stringify(e.payload)}`
    ).join("\n\n");

    const footer = [
      "",
      "── END OF REPORT ─────────────────────────────────────────────",
      `Total entries: ${logs.length}`,
    ].join("\n");

    return header + "\n\n" + rows + footer;
  }

  function buildSnapshot() {
    return [
      `SNAPSHOT @ ${new Date().toISOString()}`,
      `judges       = ${JSON.stringify(judges.map(j=>({id:j.id,alias:j.alias,projects:j.projects})))}`,
      `scores_count = ${totalScored()}`,
      `locked       = ${locked}`,
      `share_live   = ${isLinkLive()}`,
      `share_token  = "${shareToken||"none"}"`,
      `share_expiry = "${shareExpiry}"`,
      `anomalies    = ${JSON.stringify(getAnomalies())}`,
      `delib_open   = ${deliberationOpen}`,
      `delib_notes  = ${Object.keys(deliberationNotes).length}`,
      `decisions    = ${Object.keys(finalDecisions).length}`,
      `finalized    = ${Object.values(finalDecisions).filter(d => d.finalized).length}`,
    ].join("\n");
  }

  function handleCopyReport() {
    const logs = itFilter === "ALL" ? itLogs : itLogs.filter(e => e.level === itFilter);
    navigator.clipboard.writeText(buildReport(logs)).catch(()=>{});
    setReportCopied(true); setTimeout(() => setReportCopied(false), 2500);
  }

  function handleCopySnapshot() {
    navigator.clipboard.writeText(buildSnapshot()).catch(()=>{});
    setSnapCopied(true); setTimeout(() => setSnapCopied(false), 2500);
  }

  function toggleItRow(id) {
    setItExpanded(p => ({ ...p, [id]: !p[id] }));
  }

  async function executeReset() {
    addItLog("WARN","ADMIN","FULL_RESET","Admin performed a full data reset of the application",{ judgesCleared:judges.length, scoresCleared:Object.keys(scores).length, delibNotesCleared:Object.keys(deliberationNotes).length, decisionsCleared:Object.keys(finalDecisions).length, timestamp:fmtISO(Date.now()) });
    // Delete all transient data. activity_log is intentionally excluded (security audit trail).
    const sid = currentSchool.id;
    await Promise.all([
      supabase.from("scores").delete().eq("school_id", sid),
      supabase.from("judges").delete().eq("school_id", sid),
      supabase.from("share_links").delete().eq("school_id", sid),
      supabase.from("deliberation_notes").delete().eq("school_id", sid),
      supabase.from("final_decisions").delete().eq("school_id", sid),
      supabase.from("validations").delete().eq("school_id", sid),
      supabase.from("app_settings").update({ value: "false" }).eq("school_id", sid).eq("key", "locked"),
      supabase.from("app_settings").update({ value: "false" }).eq("school_id", sid).eq("key", "deliberation_open"),
      supabase.from("app_settings").upsert({ school_id: sid, key: "judge_transfer_allowances", value: "{}" }),
      supabase.from("app_settings").upsert({ school_id: sid, key: "results_finalized",         value: "false" }),
      supabase.from("app_settings").upsert({ school_id: sid, key: "deliberation_reason",       value: "" }),
      // Revoke the project-list share link too — it previously survived a reset
      // and kept serving the old roster.
      supabase.from("app_settings").upsert({ school_id: sid, key: "project_list_token",        value: "" }),
    ]);
    setJudges([]);
    setScores({});
    addLog("Admin performed a full data reset — activity log preserved for security review");
    setLocked(false);
    setShareEnabled(false);
    setShareToken("");
    setShareCreated(null);
    setShareExpiry("never");
    setShareTitle("Science Fair SY 2025-2026 — Final Results");
    setProjListToken("");
    setDeliberationNotes({});
    setFinalDecisions({});
    setDeliberationOpen(false);
    setDeliberationReason(null);
    setJudgeValidations({});
    setAdminValidation(null);
    setResultsFinalized(false);
    setTransferAllowances({});
    setAdminTab("overview");
    setResetDone(true);
    setTimeout(() => { setShowReset(false); setResetDone(false); setResetPin(""); setResetPinErr(""); }, 1800);
  }

  // PINs are 4–8 digits, so these check on Enter / button, never automatically at 4 digits
  // (until 2026-10-05 the boxes kept only 4 digits — a 5–8 digit PIN could never unlock).
  async function submitResetPin() {
    if (resetPin.length < 4) { setResetPinErr("Enter your 4–8 digit PIN."); return; }
    const ok = await verifyAdminPin(resetPin);
    if (ok.valid) { executeReset(); return; }
    setResetPinErr(ok.message || "Incorrect PIN.");
    addItLog("WARN","AUTH","RESET_PIN_FAILED","Reset attempted with wrong PIN",{});   // row has created_at
    setTimeout(() => setResetPin(""), 600);
  }
  async function submitItPin() {
    if (itPin.length < 4) { setItPinErr("Enter your 4–8 digit PIN."); return; }
    const ok = await verifyAdminPin(itPin);
    if (ok.valid) {
      setItUnlocked(true); setItPin("");
      addItLog("INFO","AUTH","IT_ACCESS_GRANTED","IT diagnostic logs accessed with correct PIN",{});
      return;
    }
    setItPinErr(ok.message || "Incorrect PIN. Try again.");
    addItLog("WARN","AUTH","IT_ACCESS_DENIED","IT diagnostic logs access attempt with wrong PIN",{});
    setTimeout(() => setItPin(""), 600);
  }

  async function handleToggleLock() {
    const next = !locked;
    setLockErr("");
    // Upsert (the row may be missing on an older school) and only flip the switch once the
    // database has it — otherwise the admin could see "Locked" while judges can still submit.
    const { error } = await supabase.from("app_settings")
      .upsert({ school_id: currentSchool.id, key: "locked", value: String(next) }, { onConflict: "school_id,key" });
    if (error) {
      setLockErr(next ? "Lock failed — retry" : "Unlock failed — retry");
      addItLog("ERROR","ADMIN","JUDGING_LOCK_FAILED","Could not change the judging lock",{ wanted: next, error: error.message });
      return;
    }
    setLocked(next);
    addLog(next ? "Admin locked judging" : "Admin unlocked judging");
    addItLog(next?"WARN":"INFO","ADMIN", next?"JUDGING_LOCKED":"JUDGING_UNLOCKED",
      next?"Admin locked judging — no more score submissions allowed":"Admin unlocked judging — submissions re-enabled",
      { lockedBy:"admin", timestamp:fmtISO(Date.now()) });
  }

  function getTotal(s) {
    const crit = s?.criteria || s || {};
    return rubric.reduce((t, r) => t + (Number(crit[r.id]) || 0), 0);
  }

  function projAvg(pid) {
    const hits = Object.entries(scores).filter(([k]) => k.endsWith(`_${pid}`));
    if (!hits.length) return null;
    return (hits.reduce((s,[,v]) => s + getTotal(v), 0) / hits.length).toFixed(1);
  }

  function rubAvg(pid, rid) {
    const hits = Object.entries(scores).filter(([k]) => k.endsWith(`_${pid}`));
    if (!hits.length) return null;
    return (hits.reduce((s,[,v]) => s + (v.criteria?.[rid] || 0), 0) / hits.length).toFixed(1);
  }

  // Total points available under the active rubric (replaces the hardcoded 42).
  function rubricMax() {
    return rubric.reduce((s, r) => s + (Number(r.max) || 0), 0);
  }
  // Points available for one project — grades below 5 are exempt from the abstract.
  function projectMax(proj) {
    return rubric.reduce((s, r) => {
      if (r.id === "abstract" && proj && !requiresAbstract(proj)) return s;
      return s + (Number(r.max) || 0);
    }, 0);
  }

  // Comment-only departments are excluded: they have no totals, so including them
  // would rank every one of their projects at 0 and bury the scored ones.
  function rankedProjects() {
    return scoredProjects()
      .map(p => ({ ...p, avg: projAvg(p.id), revs: Object.keys(scores).filter(k => k.endsWith(`_${p.id}`)).length }))
      .sort((a,b) => (Number(b.avg)||0) - (Number(a.avg)||0));
  }
  // Projects in a comment-only department, with the commendations they were given.
  // Order is by project number — there is no ranking and must never appear to be one.
  function participantsIn(deptId) {
    return projects
      .filter(p => (p.department_id || null) === (deptId || null))
      .sort((a,b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true }))
      .map(p => ({
        ...p,
        commendations: Object.entries(scores)
          .filter(([k]) => k.endsWith(`_${p.id}`))
          .map(([,s]) => s.commendation).filter(Boolean),
        reviews: Object.keys(scores).filter(k => k.endsWith(`_${p.id}`)).length,
      }));
  }

  // Ranked projects within a single department. Pass null for unassigned projects.
  // Projects are only comparable inside their own department — never rank across depts.
  function rankedProjectsIn(deptId) {
    return rankedProjects().filter(p => (p.department_id || null) === (deptId || null));
  }

  function judgeComp(j) {
    const total = j.projects?.length || 0;
    const done = (j.projects || []).filter(pid => scores[`${j.id}_${pid}`]).length;
    // Guard against 0 assigned projects (judge registered before projects were
    // added to their department) — 0/0 previously produced NaN%.
    return { done, total, pct: total === 0 ? 0 : Math.round((done/total)*100) };
  }

  function hasScored(pid) { return !!scores[`${judge?.id}_${pid}`]; }
  function totalScored()  { return Object.keys(scores).length; }
  function possible()     { return judges.reduce((s,j) => s + j.projects.length, 0); }
  function draftTotal() {
    const proj = projects.find(p => p.id === scoringPid);
    return rubric.reduce((s,r) => {
      if (r.id === "abstract" && proj && !requiresAbstract(proj)) return s;
      return s + (Number(draftSc[r.id])||0);
    }, 0);
  }
  function maxDraftScore() {
    const proj = projects.find(p => p.id === scoringPid);
    return rubric.reduce((s,r) => {
      if (r.id === "abstract" && proj && !requiresAbstract(proj)) return s;
      return s + r.max;
    }, 0);
  }
  function allMoved() {
    const proj = projects.find(p => p.id === scoringPid);
    // Comment-only: there are no criteria to move. A commendation is what makes
    // the review complete (the comment itself stays optional).
    if (isFeedbackProject(proj)) return draftCommend.trim().length > 0;
    return rubric.every(r => {
      if (r.id === "abstract" && proj && !requiresAbstract(proj)) return true;
      return draftSc[r.id] !== undefined;
    });
  }
  function hasZeroScore() {
    const proj = projects.find(p => p.id === scoringPid);
    if (!proj || !requiresAbstract(proj)) return false;
    return rubric.some(r => draftSc[r.id] === 0);
  }

  // An outlier is a judge whose total sits more than ANOMALY_PCT of the project's
  // available points away from the project average.
  // This was a hardcoded "> 8 points" until 2026-10-06, which only made sense on the
  // 42-point default rubric (≈19%). On a 100-point rubric 8 points is 8% — ordinary
  // disagreement — so the Alerts tab would have flagged almost every judge. Rule 22:
  // never hardcode anything derived from the max score.
  const ANOMALY_PCT = 0.19;
  function getAnomalies() {
    const out = [];
    // Comment-only departments have no totals to deviate from.
    scoredProjects().forEach(p => {
      const hits = Object.entries(scores).filter(([k]) => k.endsWith(`_${p.id}`));
      if (hits.length < 2) return;
      const max = projectMax(p);
      if (!max) return;
      const limit = max * ANOMALY_PCT;
      const tots = hits.map(([,s]) => getTotal(s));
      const avg  = tots.reduce((a,b) => a+b, 0) / tots.length;
      hits.forEach(([key,s]) => {
        const t = getTotal(s);
        if (Math.abs(t - avg) > limit) {
          // Exact id match — startsWith() could pick the wrong judge if one id
          // happened to be a prefix of another.
          const judgeId = key.slice(0, key.lastIndexOf(`_${p.id}`));
          const jj = judges.find(j => j.id === judgeId);
          out.push({ project: p.title, judge: jj?.alias || "Unknown", score: t, avg: avg.toFixed(1), max: projectMax(p) });
        }
      });
    });
    return out;
  }

  // Deliberation helpers
  function getDelibNotesForProject(pid) {
    return Object.entries(deliberationNotes)
      .filter(([k]) => k.endsWith(`_${pid}`))
      .map(([k, v]) => {
        const judgeId = k.slice(0, k.lastIndexOf(`_${pid}`));
        const j = judges.find(jj => jj.id === judgeId);
        return { ...v, judgeAlias: j?.alias || "Unknown" };
      });
  }
  function getRecBreakdown(pid) {
    const notes = getDelibNotesForProject(pid);
    const counts = {};
    RECOMMENDATIONS.forEach(r => counts[r] = 0);
    notes.forEach(n => { if (counts[n.recommendation] !== undefined) counts[n.recommendation]++; });
    return counts;
  }
  function getFlagCount(pid) {
    return getDelibNotesForProject(pid).filter(n => n.flagged).length;
  }

  // Validation helpers
  function completedJudges() {
    // A judge with zero assigned projects has nothing to complete and must not
    // count as "done" — otherwise consensus could pass without any real scoring.
    return judges.filter(j => judgeComp(j).total > 0 && judgeComp(j).pct === 100);
  }
  // Ties only matter inside a department — two projects in different departments
  // sharing an average are not competing with each other.
  function hasTie() {
    const groups = [
      // A comment-only department has no scores, so every project in it would
      // "tie" at 0 and the deliberation alert would never switch off.
      ...departments.filter(d => d.id && d.scoring_mode !== "feedback").map(d => d.id),
      null, // unassigned projects form their own group
    ];
    return groups.some(deptId => {
      const scored = rankedProjectsIn(deptId).filter(p => p.avg !== null);
      for (let i = 0; i < scored.length - 1; i++) {
        if (scored[i].avg === scored[i + 1].avg) return true;
      }
      return false;
    });
  }
  function consensusReached() {
    const done = completedJudges();
    if (!done.length || !adminValidation?.approved) return false;
    return done.every(j => judgeValidations[j.id]?.approved === true);
  }
  function valProgress() {
    const done = completedJudges();
    const approved = done.filter(j => judgeValidations[j.id]?.approved === true).length;
    const flagged  = done.filter(j => judgeValidations[j.id]?.approved === false).length;
    return { total: done.length, approved, flagged, pending: done.length - approved - flagged };
  }

  function recPillClass(rec) {
    return rec === "Recommend for Award" ? "award" : rec === "Strong Contender" ? "strong" : rec === "Good Work" ? "good" : "needs";
  }
  function awardBadgeClass(award) {
    return award === "1st Place" ? "gold" : award === "2nd Place" ? "silver" : award === "3rd Place" ? "bronze"
      : award === "Honorable Mention" ? "hm" : award === "Best in Category" ? "best" : "none";
  }
  function awardEmoji(award) {
    return award === "1st Place" ? "🥇" : award === "2nd Place" ? "🥈" : award === "3rd Place" ? "🥉"
      : award === "Honorable Mention" ? "🏅" : award === "Best in Category" ? "⭐" : "";
  }
  function buildDelibReport() {
    const now = new Date().toISOString();
    const ranked = rankedProjects();
    const lines = [
      "╔══════════════════════════════════════════════════════════════╗",
      "║     SCIENCE FAIR APP — DELIBERATION SUMMARY REPORT          ║",
      "╚══════════════════════════════════════════════════════════════╝",
      `Generated: ${now}`,
      "",
      "── PROJECTS (RANKED BY SCORE) ─────────────────────────────────",
      "",
    ];
    ranked.forEach((p, i) => {
      const decision = finalDecisions[p.id];
      const notes = getDelibNotesForProject(p.id);
      const breakdown = getRecBreakdown(p.id);
      const flags = getFlagCount(p.id);
      lines.push(`#${i+1} — ${p.title} (${p.cat}, Grade ${p.grade})`);
      lines.push(`  Avg Score: ${p.avg ?? "N/A"} / ${projectMax(p)}  |  Reviews: ${p.revs}`);
      lines.push(`  Award Decision: ${decision?.award || "Pending"}${decision?.finalized ? " [FINALIZED]" : ""}`);
      if (decision?.adminNotes) lines.push(`  Admin Notes: ${decision.adminNotes}`);
      lines.push(`  Recommendations: ${RECOMMENDATIONS.map(r => `${r}: ${breakdown[r]}`).join(", ")}`);
      lines.push(`  Flags for Discussion: ${flags}`);
      if (notes.length > 0) {
        lines.push("  Judge Comments:");
        notes.forEach(n => {
          lines.push(`    [${n.judgeAlias}] Rec: ${n.recommendation}${n.flagged ? " [FLAGGED]" : ""}`);
          if (n.comment) lines.push(`      "${n.comment}"`);
        });
      }
      lines.push("");
    });
    lines.push("── END OF REPORT ─────────────────────────────────────────────");
    return lines.join("\n");
  }

  // Actions
  async function handleRegister() {
    const name = normJudgeAlias(regName);
    // One list for the whole school (default): the NUMBER decides the department —
    // the judge no longer picks one. The server does the same lookup and is the
    // authority; this is only so the screen can name the department up front.
    const dept0 = schoolNumbering()
      ? deptForJudgeNum(judgeNumOf(name))
      : departments.find(d => d.id === regDept);
    if (!dept0) {
      setRegErr(schoolNumbering()
        ? (judgeNumOf(name) ? `Judge ${judgeNumOf(name)} is not on this school's judge list. Check your number with the coordinator.`
                            : "Enter your judge number.")
        : "Please select your department.");
      return;
    }

    // All validation now happens inside the register_judge() SQL function:
    // the invite code is checked server-side (rate-limited, 5 failures = 5 min
    // lockout), along with the alias range, the department cap and the admin
    // transfer allowance. The browser can no longer read the invite code, and
    // direct INSERTs into `judges` are blocked by RLS — this RPC is the only
    // way a judge row can be created.
    const { data, error } = await supabase.rpc("register_judge", {
      p_school_id:     currentSchool.id,
      p_department_id: dept0.id,
      p_alias:         name,
      p_invite_code:   regCode.trim(),
    });

    if (error) {
      // Our RAISE messages are already written for the judge to read.
      setRegErr(error.message || "Registration failed. Please try again.");
      addItLog("WARN","AUTH","JUDGE_REGISTER_REJECTED","register_judge rejected a sign-in attempt",
        { attemptedName: name, dept: dept0.name, error: error.message, timestamp: fmtISO(Date.now()) });
      return;
    }

    const j = dbToJudge(data);
    const isTransfer = judges.some(x => x.id === j.id);
    // Name the department the server actually used (an older row may sit elsewhere).
    const dept = departments.find(d => d.id === j.department_id) || dept0;
    setJudges(p => (isTransfer ? p.map(x => x.id === j.id ? j : x) : [...p, j]));
    setJudge(j);
    localStorage.setItem("sf_judge_id",   j.id);
    localStorage.setItem("sf_judge_data", JSON.stringify(j));
    localStorage.setItem("sf_judge_slug", currentSchool.slug);

    if (isTransfer) {
      addLog(`${j.alias} (${dept.name}) session transferred to a new device`);
      addItLog("WARN","AUTH","JUDGE_SESSION_TRANSFERRED","Existing judge session transferred to another device (admin-approved)",
        { judgeId: j.id, alias: j.alias, dept: dept.name, timestamp: fmtISO(Date.now()) });
    } else {
      addLog(`${j.alias} joined as a judge (${dept.name})`);
      addItLog("INFO","AUTH","JUDGE_REGISTERED","Judge registered with valid credentials",
        { judgeId: j.id, alias: j.alias, dept: dept.name, assignedProjects: j.projects });
    }
    setRegName(""); setRegCode(""); setRegDept(""); setRegErr(""); setView("judge-home");
  }

  async function handleAdminLogin() {
    if (adminLockoutUntil && Date.now() < adminLockoutUntil) {
      const secs = Math.ceil((adminLockoutUntil - Date.now()) / 1000);
      setAdminErr(`Too many failed attempts. Try again in ${secs}s.`);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: adminEmail.trim(), password: adminPass });
    if (!error) {
      setAdminLoginAttempts(0);
      setAdminLockoutUntil(null);
      addItLog("INFO","AUTH","ADMIN_LOGIN_SUCCESS","Admin authenticated via Supabase Auth",{ email: adminEmail.trim() });
      setView("admin-home"); setAdminPass(""); setAdminEmail(""); setAdminErr("");
    } else {
      const next = adminLoginAttempts + 1;
      setAdminLoginAttempts(next);
      addItLog("WARN","AUTH","ADMIN_LOGIN_FAILED","Admin login failed",{ attempt: next, error: error.message });
      if (next >= 5) {
        const until = Date.now() + 30000;
        setAdminLockoutUntil(until);
        setAdminLoginAttempts(0);
        setAdminErr("Too many failed attempts. Locked for 30 seconds.");
      } else {
        setAdminErr(`Login failed: ${error.message}`);
      }
    }
  }

  async function handleAdminLogout() {
    await supabase.auth.signOut();
    setSession(null);
    setView("landing");
    addItLog("INFO","AUTH","ADMIN_LOGOUT","Admin signed out",{});
  }

  function startScoring(pid) {
    setScoringPid(pid);
    const ex = scores[`${judge.id}_${pid}`];
    if (ex) { setDraftSc({ ...ex.criteria }); setDraftNotes(ex.notes||""); setDraftCommend(ex.commendation||""); }
    else { setDraftSc({}); setDraftNotes(""); setDraftCommend(""); }
    setView("judge-scoring");
  }

  async function submitScore() {
    // Lock is enforced here, not just on the project tile — a judge already inside
    // the scoring form when the admin locks must not be able to submit.
    if (locked) {
      addItLog("WARN","SCORE","SCORE_BLOCKED_LOCKED","Score submission rejected — judging is locked",
        { judgeId: judge?.id, alias: judge?.alias, projectId: scoringPid });
      setView("judge-home");
      return;
    }
    if (judgeValidations[judge?.id]) {
      addItLog("WARN","SCORE","SCORE_BLOCKED_VALIDATED","Score submission rejected — judge already validated results",
        { judgeId: judge?.id, alias: judge?.alias, projectId: scoringPid });
      setView("judge-home");
      return;
    }
    const total = draftTotal();
    // A comment-only department writes no criteria at all — the commendation and
    // the comment ARE the review. getTotal() then sums an empty object to 0, which
    // is why such departments are excluded from every ranking (rule 59).
    const proj = projects.find(p => p.id === scoringPid);
    const feedback = isFeedbackProject(proj);
    const criteria = feedback ? {} : { ...draftSc };
    const commendation = feedback ? draftCommend.trim() : "";
    setScores(p => ({ ...p, [`${judge.id}_${scoringPid}`]:
      { criteria, notes: draftNotes, commendation, time: Date.now() } }));
    const payload = {
      school_id: currentSchool.id,
      judge_id: judge.id, project_id: scoringPid,
      criteria,
      notes: draftNotes,
      ...(feedback ? { commendation } : {}),
    };
    const { error } = await supabase.from("scores").upsert(payload, { onConflict: "judge_id,project_id" });
    if (error || !navigator.onLine) {
      const q = JSON.parse(localStorage.getItem("sf_offline_queue") || "[]");
      const filtered = q.filter(x => !(x.data.judge_id === judge.id && x.data.project_id === scoringPid));
      filtered.push({ data: payload, ts: Date.now() });
      localStorage.setItem("sf_offline_queue", JSON.stringify(filtered));
      setOfflineQueue(filtered);
      addItLog("WARN","DB","SCORE_QUEUED","Score saved locally — will sync when online",
        { judgeId:judge.id, projectId:scoringPid,
          // "offline" vs a server rejection need different fixes — record which it was.
          reason: error ? "server_error" : "offline", error: error ? (error.code || error.message) : null });
    } else {
      const syncedAt = Date.now();
      setLastSyncAt(syncedAt);
      localStorage.setItem("sf_last_sync_at", String(syncedAt));
    }
    addLog(`${judge.alias} submitted ${feedback ? "a review" : "score"} for Project #${proj.num}`);
    addItLog("INFO","SCORE","SCORE_SUBMITTED","Judge submitted a review for an assigned project",
      { judgeId:judge.id, alias:judge.alias, projectId:scoringPid, projectNum:proj.num,
        mode: feedback ? "feedback" : "scored",
        ...(feedback ? { commendation } : { total, rubric: draftSc }) });
    setView("judge-home");
  }

  // Every handler below saves FIRST and only changes the screen once the database has it
  // (rule 55). Until 2026-10-06 they updated the screen, ignored the save's error and logged
  // success anyway, so the IT log could say "finalized" for a save that never happened.
  const firstErr = results => results.find(r => r?.error)?.error || null;
  const errInfo  = e => e?.code || e?.message || "unknown";

  async function submitDelibNote(pid) {
    if (!deliberationOpen) return;
    setDelibNoteErr("");
    const proj = projects.find(p => p.id === pid);
    const { error } = await supabase.from("deliberation_notes").upsert({
      school_id: currentSchool.id, judge_id: judge.id, project_id: pid,
      comment: delibDraftComment, recommendation: delibDraftRec, flagged: delibDraftFlagged,
    }, { onConflict: "judge_id,project_id" });
    if (error) {
      setDelibNoteErr(`Your note for Project #${proj?.num} was NOT saved. Check your connection and try again.`);
      addItLog("ERROR","JUDGE","DELIB_NOTE_FAILED","Could not save a deliberation note",
        { judgeId:judge.id, alias:judge.alias, projectId:pid, error: errInfo(error) });
      return;
    }
    const entry = { comment: delibDraftComment, recommendation: delibDraftRec, flagged: delibDraftFlagged, submittedAt: Date.now() };
    setDeliberationNotes(p => ({ ...p, [`${judge.id}_${pid}`]: entry }));
    addLog(`${judge.alias} submitted deliberation note for Project #${proj.num}`);
    addItLog("INFO","JUDGE","DELIB_NOTE_SUBMITTED","Judge submitted deliberation note",
      { judgeId:judge.id, alias:judge.alias, projectId:pid, projectNum:proj.num, recommendation:delibDraftRec, flagged:delibDraftFlagged });
    setDelibDraftComment(""); setDelibDraftRec("Pending"); setDelibDraftFlagged(false);
  }

  async function openDeliberation(reason) {
    setDelibErr("");
    const sid = currentSchool.id;
    const error = firstErr(await Promise.all([
      supabase.from("app_settings").upsert({ school_id: sid, key: "deliberation_open",  value: "true" }),
      supabase.from("app_settings").upsert({ school_id: sid, key: "deliberation_reason", value: reason }),
    ]));
    if (error) {
      setDelibErr("Deliberation was NOT opened — the change could not be saved. Check your connection and try again.");
      addItLog("ERROR","ADMIN","DELIBERATION_OPEN_FAILED","Could not open deliberation",{ reason, error: errInfo(error) });
      return;
    }
    setDeliberationOpen(true);
    setDeliberationReason(reason);
    const msg = reason === "tie" ? "Deliberation triggered due to tied scores" : "Admin manually opened deliberation";
    addLog(msg);
    addItLog("INFO","ADMIN","DELIBERATION_OPENED", msg, { reason, timestamp:fmtISO(Date.now()) });
  }
  async function closeDeliberation() {
    setDelibErr("");
    const sid = currentSchool.id;
    const error = firstErr(await Promise.all([
      supabase.from("app_settings").upsert({ school_id: sid, key: "deliberation_open",  value: "false" }),
      supabase.from("app_settings").upsert({ school_id: sid, key: "deliberation_reason", value: "" }),
    ]));
    if (error) {
      setDelibErr("Deliberation was NOT closed — the change could not be saved. Check your connection and try again.");
      addItLog("ERROR","ADMIN","DELIBERATION_CLOSE_FAILED","Could not close deliberation",{ error: errInfo(error) });
      return;
    }
    setDeliberationOpen(false);
    setDeliberationReason(null);
    addLog("Admin closed deliberation phase");
    addItLog("INFO","ADMIN","DELIBERATION_CLOSED","Admin closed deliberation phase",{ timestamp:fmtISO(Date.now()) });
  }
  async function submitJudgeValidation(approved) {
    setValErr("");
    const { error } = await supabase.from("validations").upsert(
      { school_id: currentSchool.id, judge_id: judge.id, approved, comment: valComment, validated_at: new Date().toISOString() },
      { onConflict: "school_id,judge_id" }
    );
    if (error) {
      setValErr("Your validation was NOT saved. Check your connection and try again.");
      addItLog("ERROR","JUDGE","VALIDATION_SAVE_FAILED","Could not save the judge's validation",
        { judgeId:judge.id, alias:judge.alias, approved, online: navigator.onLine, error: errInfo(error) });
      return;
    }
    setJudgeValidations(p => ({ ...p, [judge.id]: { approved, comment: valComment, validatedAt: Date.now() } }));
    addLog(`${judge.alias} ${approved ? "validated" : "raised a concern about"} the computed results`);
    addItLog(approved?"INFO":"WARN","JUDGE", approved?"RESULTS_VALIDATED":"RESULTS_CONCERN",
      approved ? "Judge validated computed results" : "Judge raised concern about results",
      { judgeId:judge.id, alias:judge.alias, comment:valComment, timestamp:fmtISO(Date.now()) });
    setValComment(""); setShowValForm(false);
  }
  async function submitAdminValidation(approved) {
    setValErr("");
    const { error } = await supabase.from("validations").upsert(
      { school_id: currentSchool.id, judge_id: "admin", approved, comment: valComment, validated_at: new Date().toISOString() },
      { onConflict: "school_id,judge_id" }
    );
    if (error) {
      setValErr("Your validation was NOT saved. Check your connection and try again.");
      addItLog("ERROR","ADMIN","ADMIN_VALIDATION_FAILED","Could not save the admin's validation",{ approved, error: errInfo(error) });
      return;
    }
    setAdminValidation({ approved, comment: valComment, validatedAt: Date.now() });
    addLog(`Admin ${approved ? "validated" : "flagged concerns with"} the computed results`);
    addItLog(approved?"INFO":"WARN","ADMIN", approved?"ADMIN_RESULTS_VALIDATED":"ADMIN_RESULTS_CONCERN",
      approved ? "Admin validated computed results" : "Admin flagged concerns with results",
      { approved, comment:valComment, timestamp:fmtISO(Date.now()) });
    setValComment(""); setShowValForm(false);
  }
  async function finalizeResults() {
    setDelibErr("");
    const sid = currentSchool.id;
    const wasOpen = deliberationOpen;
    const error = firstErr(await Promise.all([
      supabase.from("app_settings").upsert({ school_id: sid, key: "results_finalized", value: "true" }),
      ...(wasOpen ? [
        supabase.from("app_settings").upsert({ school_id: sid, key: "deliberation_open",  value: "false" }),
        supabase.from("app_settings").upsert({ school_id: sid, key: "deliberation_reason", value: "" }),
      ] : []),
    ]));
    if (error) {
      setDelibErr("Results were NOT finalized — the change could not be saved. Check your connection and try again.");
      addItLog("ERROR","ADMIN","FINALIZE_FAILED","Could not finalize results",{ error: errInfo(error) });
      return;
    }
    setResultsFinalized(true);
    if (wasOpen) { setDeliberationOpen(false); setDeliberationReason(null); }
    addLog("Admin finalized results — public sharing now available");
    addItLog("INFO","ADMIN","RESULTS_FINALIZED","Admin finalized results for public sharing",{ timestamp:fmtISO(Date.now()) });
  }
  async function reopenResults() {
    setDelibErr("");
    const { error } = await supabase.from("app_settings")
      .upsert({ school_id: currentSchool?.id, key: "results_finalized", value: "false" }, { onConflict: "school_id,key" });
    if (error) {
      setDelibErr("Results were NOT reopened — the change could not be saved. Check your connection and try again.");
      addItLog("ERROR","ADMIN","REOPEN_FAILED","Could not reopen finalized results",{ error: errInfo(error) });
      return;
    }
    setResultsFinalized(false);
    addLog("Admin reopened results for revision");
    addItLog("WARN","ADMIN","RESULTS_REOPENED","Admin reopened finalized results for revision",{ timestamp:fmtISO(Date.now()) });
  }

  async function saveFinalDecision(pid, award, adminNotes) {
    setDelibErr("");
    const isFinalize = award !== "Pending";
    const proj = projects.find(p => p.id === pid);
    const { error } = await supabase.from("final_decisions").upsert({
      school_id: currentSchool.id, project_id: pid, award, admin_notes: adminNotes,
      finalized: isFinalize, finalized_at: isFinalize ? new Date().toISOString() : null,
    }, { onConflict: "school_id,project_id" });
    if (error) {
      setDelibErr(`The award for Project #${proj?.num} was NOT saved. Check your connection and try again.`);
      addItLog("ERROR","ADMIN","DECISION_SAVE_FAILED","Could not save an award decision",
        { projectId:pid, projectNum:proj?.num, award, error: errInfo(error) });
      return;
    }
    setFinalDecisions(p => ({ ...p, [pid]: { award, adminNotes, finalized: isFinalize, finalizedAt: isFinalize ? Date.now() : null } }));
    addLog(`Admin ${isFinalize ? "finalized" : "updated"} decision for Project #${proj.num}: ${award}`);
    addItLog("INFO","ADMIN", isFinalize?"DECISION_FINALIZED":"DECISION_UPDATED",
      `Admin ${isFinalize?"finalized":"updated"} award decision for project`,
      { projectId:pid, projectNum:proj.num, award, timestamp:fmtISO(Date.now()) });
  }

  async function reviseDecision(pid) {
    setFinalDecisions(p => ({ ...p, [pid]: { ...p[pid], finalized: false, finalizedAt: null } }));
    await supabase.from("final_decisions").update({ finalized: false, finalized_at: null }).eq("school_id", currentSchool.id).eq("project_id", pid);
    const proj = projects.find(p => p.id === pid);
    addLog(`Admin reopened decision for Project #${proj.num} for revision`);
    addItLog("INFO","ADMIN","DECISION_REVISED","Admin reopened award decision for revision",
      { projectId:pid, projectNum:proj.num, timestamp:fmtISO(Date.now()) });
  }

  // ── PROJECT MANAGEMENT ──────────────────────────────────────
  // advisor_name / group_members were added to `projects` in the 2026-09 migration
  // (supabase/migration-2026-09-project-adviser.sql). If a deployment has not run
  // that migration yet, Postgres rejects the unknown columns — detect that and retry
  // without them so project management keeps working on the old schema.
  const MISSING_COL = (err) =>
    err && (err.code === "42703" || err.code === "PGRST204" || /column .* does not exist/i.test(err.message || ""));

  // Columns added by later migrations. On a missing-column error we drop them and retry.
  // (Names are NOT written here — they go to project_private via writeProjectPrivate().)
  const OPTIONAL_PROJECT_COLS = [
    { cols: ["room", "description", "motivation"], event: "PROJECT_DETAIL_COLS_MISSING",
      file: "migration-2026-10-project-details.sql" },
  ];
  const MISSING_TABLE = (err) =>
    err && (err.code === "42P01" || err.code === "PGRST205" || /could not find the table|relation .* does not exist/i.test(err.message || ""));

  // Adviser + student names live in project_private (admin-only RLS) since migration
  // 2026-10b, because `projects` is publicly readable. Before that migration the names
  // were columns on `projects`, so fall back to writing them there.
  async function writeProjectPrivate(pid, advisor_name, group_members) {
    const { error } = await supabase.from("project_private").upsert(
      { school_id: currentSchool.id, project_id: pid, advisor_name, group_members, updated_at: new Date().toISOString() },
      { onConflict: "project_id,school_id" });
    if (!error) return null;
    if (MISSING_TABLE(error)) {
      const { error: legacyErr } = await supabase.from("projects")
        .update({ advisor_name, group_members }).eq("school_id", currentSchool.id).eq("id", pid);
      addItLog("WARN","DB","PROJECT_PRIVATE_TABLE_MISSING",
        "project_private missing — names saved on projects (PUBLIC). Run migration-2026-10b-private-members-and-registration.sql",
        { projectId: pid, legacyError: legacyErr?.message || null });
      // Neither migration run: nowhere to keep names. Save the project anyway (logged above).
      return MISSING_COL(legacyErr) ? null : legacyErr;
    }
    addItLog("ERROR","DB","PROJECT_PRIVATE_WRITE_FAILED","Could not save adviser/student names",
      { projectId: pid, error: error.message });
    return error;
  }

  async function writeProjectRow(mode, row, pid) {
    const attempt = (payload) => mode === "insert"
      ? supabase.from("projects").insert(payload)
      : supabase.from("projects").update(payload).eq("school_id", currentSchool.id).eq("id", pid);
    let payload = row;
    let { error } = await attempt(payload);
    for (const step of OPTIONAL_PROJECT_COLS) {
      if (!MISSING_COL(error)) break;
      payload = Object.fromEntries(Object.entries(payload).filter(([k]) => !step.cols.includes(k)));
      ({ error } = await attempt(payload));
      if (!error) {
        addItLog("WARN","DB",step.event,
          `projects.${step.cols.join("/")} missing — run ${step.file}`,
          { projectId: pid || row.id });
      }
    }
    return error;
  }

  function nextProjectNum(list = projects) {
    const nums = list.map(p => parseInt(p.num) || 0);
    return String(Math.max(0, ...nums) + 1).padStart(3, "0");
  }

  // Shared by the Add Project form and the form scanner. `baseProjects` is the list to
  // build on — the scanner saves several projects in a row before React state flushes,
  // so it threads the list through itself; otherwise every save would get the same number.
  // Returns { error, nextProjects }.
  async function createProject(data, baseProjects = projects) {
    const members = normMembers(data.members);
    const id = "p_" + uid();
    const finalNum = (data.num || "").trim() || nextProjectNum(baseProjects);
    // Public columns only — names go to project_private below.
    const proj = {
      id, num: finalNum, title: data.title.trim(), cat: data.cat,
      grade: normGrade(data.grade) || highestGrade(members),
      locked: false,
      department_id: data.department_id || null,
      room: (data.room || "").trim(),
      description: (data.description || "").trim(),
      motivation: (data.motivation || "").trim(),
      school_id: currentSchool.id,
    };
    const advisorName = (data.advisor_name || "").trim();
    const localProj = { ...proj, school_id: undefined, advisor_name: advisorName, group_members: members };
    const nextProjects = [...baseProjects, localProj];
    setProjects(nextProjects);
    const error = await writeProjectRow("insert", proj);
    if (error) {
      // Roll back the optimistic insert so the UI never shows a project the DB rejected.
      setProjects(baseProjects);
      addItLog("ERROR","ADMIN","PROJECT_ADD_FAILED","Failed to insert project",{ projectId:id, error:error.message });
      return { error, nextProjects: baseProjects };
    }
    const privErr = await writeProjectPrivate(id, advisorName, members);
    if (privErr) {
      // A project without its students is worse than no project: undo it so the admin
      // can retry instead of ending up with an anonymous team.
      await supabase.from("projects").delete().eq("school_id", currentSchool.id).eq("id", id);
      setProjects(baseProjects);
      return { error: privErr, nextProjects: baseProjects };
    }
    const deptName = departments.find(d => d.id === proj.department_id)?.name || "Unassigned";
    addLog(`Admin added project: ${proj.title} (#${finalNum}) — ${deptName}${data.source ? ` [${data.source}]` : ""}`);
    addItLog("INFO","ADMIN","PROJECT_ADDED","Admin added a new project",
      { projectId:id, num:finalNum, title:proj.title, cat:proj.cat, grade:proj.grade, dept:deptName,
        source: data.source || "form", timestamp:fmtISO(Date.now()) });
    // Push the new project out to judges already registered in this department.
    await syncJudgeAssignments(proj.department_id, nextProjects);
    return { error: null, nextProjects, proj: localProj };
  }

  async function addProject() {
    if (!projForm.title.trim()) return;
    const { error } = await createProject(projForm);
    if (error) return;
    setProjForm(blankProjForm("", catNames()[0] || ""));
    setShowAddProject(false);
  }

  async function updateProject(pid) {
    const existing = projects.find(p => p.id === pid);
    if (!existing || existing.locked) return;
    const { title, cat, grade, num, department_id, advisor_name } = projForm;
    if (!title.trim()) return;
    const membersArrProj = normMembers(projForm.members);
    const prevDept = existing.department_id || null;
    const updated = {
      ...existing,
      title: title.trim(), cat,
      grade: normGrade(grade) || highestGrade(membersArrProj),
      num: num.trim() || existing.num,
      department_id: department_id || null,
      advisor_name: (advisor_name || "").trim(),
      group_members: membersArrProj,
      room: (projForm.room || "").trim(),
      description: (projForm.description || "").trim(),
      motivation: (projForm.motivation || "").trim(),
    };
    const nextProjects = projects.map(pp => pp.id === pid ? updated : pp);
    setProjects(nextProjects);
    // Names first: the projects UPDATE fires the realtime event other admin screens reload
    // on, so the private row must already be current when they do.
    await writeProjectPrivate(pid, updated.advisor_name, updated.group_members);
    await writeProjectRow("update", {
      title: updated.title, cat: updated.cat, grade: updated.grade, num: updated.num,
      department_id: updated.department_id,
      room: updated.room, description: updated.description, motivation: updated.motivation,
    }, pid);
    // A department change moves the project between judge pools — resync both sides.
    if (prevDept !== updated.department_id) {
      await syncJudgeAssignments([prevDept, updated.department_id], nextProjects);
    }
    // If project came from registration, keep the submission record in step too.
    const regSub = regSubmissions.find(s => s.project_id === pid);
    if (regSub) {
      // NOTE: registration_submissions.group_members is TEXT (projects.group_members
      // is JSONB) — write the joined string here, the array on the project.
      // Names only — the registration table has no per-member grade.
      const membersTextRegSub = membersArrProj.map(m => m.name).join(", ");
      const { error: regSubErr } = await supabase.from("registration_submissions")
        .update({ advisor_name: updated.advisor_name, group_members: membersTextRegSub })
        .eq("school_id", currentSchool.id).eq("id", regSub.id);
      if (regSubErr) {
        addItLog("ERROR","ADMIN","REG_SUB_UPDATE_FAILED","Failed to update registration submission adviser/members",
          { submissionId: regSub.id, projectId: pid, error: regSubErr.message });
      } else {
        setRegSubmissions(prev => prev.map(s => s.id === regSub.id
          ? { ...s, advisor_name: updated.advisor_name, group_members: membersTextRegSub }
          : s));
      }
    }
    addLog(`Admin updated project #${updated.num}: ${updated.title}`);
    addItLog("INFO","ADMIN","PROJECT_UPDATED","Admin updated project details",
      { projectId:pid, title:updated.title, num:updated.num, timestamp:fmtISO(Date.now()) });
    setEditingProject(null);
    setProjForm(blankProjForm("", catNames()[0] || ""));
  }

  // ── PARTICIPATION-FORM SCANNER ──────────────────────────────
  // Flow: admin picks photos/PDFs → each is shrunk in the browser → POST /api/scan-form
  // (Gemini) → one editable card per form → admin reviews/corrects → Save → createProject().
  // Nothing touches the database until Save. See CLAUDE.md "📷 Form scanning".
  const SCAN_MAX_BYTES   = 3.2 * 1024 * 1024;   // must match MAX_BYTES in api/scan-form.js
  const SCAN_CONCURRENCY = 3;
  const SCAN_MIME = ["application/pdf","image/heic","image/heif","image/png","image/webp","image/jpeg"];

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  // Photos are re-encoded as ≤2000px JPEG so they fit Vercel's 4.5 MB request limit and
  // upload fast on school Wi-Fi. PDFs, and HEIC the browser cannot decode, go as-is.
  async function scanPayload(file) {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      let bmp = null;
      try { bmp = await createImageBitmap(file); } catch { bmp = null; }
      if (bmp) {
        const scale  = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(bmp.width * scale);
        canvas.height = Math.round(bmp.height * scale);
        canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
        if (bmp.close) bmp.close();
        const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.85));
        if (blob) return { mimeType: "image/jpeg", data: await blobToBase64(blob) };
      }
    }
    const type = isPdf ? "application/pdf" : (file.type || (/\.hei[cf]$/i.test(file.name) ? "image/heic" : ""));
    if (!SCAN_MIME.includes(type)) throw new Error("This file type can't be read. Use a photo (JPEG, PNG, HEIC) or a PDF.");
    if (file.size > SCAN_MAX_BYTES) {
      throw new Error(isPdf ? "PDF is larger than 3 MB — split it into smaller files."
                            : "Photo is too large and this browser couldn't shrink it. Try a JPEG.");
    }
    return { mimeType: type, data: await blobToBase64(file) };
  }

  function emptyScanData() {
    return { title:"", department_id:"", cat:"", grade:"", advisor_name:"", room:"",
      description:"", motivation:"", members:[{ name:"", grade:"" }] };
  }
  function newScanCard(file, url) {
    return {
      key: "sc_" + uid(), file, url,
      fileName: file ? file.name : "Manual entry",
      isPdf: !!file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name)),
      // Only real images get an <img>; HEIC the browser can't draw flips thumbBroken.
      isImage: !!file && (/^image\//.test(file.type) || /\.(jpe?g|png|webp|hei[cf])$/i.test(file.name)),
      thumbBroken: false,
      retryable: true,     // false for problems retrying can't fix (wrong type, too big)
      status: file ? "reading" : "ready",       // reading | ready | saving | saved | error
      error: "", data: emptyScanData(), conf: {},
      notSure: false, notForm: false, notes: "", workMode: "", deptRaw: "", savedNum: "",
    };
  }
  // One /api/scan-form result → one review card (a PDF or photo can hold several forms).
  function scanCardFromForm(base, f) {
    const members = (f.students || []).map(s => ({ name: s.name.value, grade: s.grade.value }));
    return {
      ...base, key: "sc_" + uid(), status: "ready", error: "",
      data: {
        title: f.title.value, department_id: f.department_id.value, cat: f.cat.value,
        grade: "", advisor_name: f.advisor_name.value, room: f.room.value,
        description: f.description.value, motivation: f.motivation.value,
        members: members.length ? members : [{ name:"", grade:"" }],
      },
      conf: {
        title: f.title.confidence, department_id: f.department_id.confidence, cat: f.cat.confidence,
        advisor_name: f.advisor_name.confidence, room: f.room.confidence,
        description: f.description.confidence, motivation: f.motivation.confidence,
        members: (f.students || []).map(s => ({ name: s.name.confidence, grade: s.grade.confidence })),
      },
      notSure: !!f.cat.notSure, notForm: !f.isForm, notes: f.notes || "",
      workMode: f.workMode || "", deptRaw: f.department_id.raw || "",
    };
  }

  function patchScanCard(key, patch) {
    setScanCards(cs => cs.map(c => c.key === key ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) } : c));
  }
  // Any field the admin touches stops being highlighted as "AI unsure".
  function editScanField(key, field, value) {
    patchScanCard(key, c => ({
      data: { ...c.data, [field]: value },
      conf: { ...c.conf, [field]: "edited" },
      ...(field === "cat" ? { notSure: false } : {}),
    }));
  }
  function editScanMember(key, i, field, value) {
    patchScanCard(key, c => {
      const memConf = [...(c.conf.members || [])];
      memConf[i] = { ...(memConf[i] || {}), [field]: "edited" };
      return {
        data: { ...c.data, members: c.data.members.map((m, j) => j === i ? { ...m, [field]: value } : m) },
        conf: { ...c.conf, members: memConf },
      };
    });
  }
  function addScanMember(key) {
    patchScanCard(key, c => ({ data: { ...c.data, members: [...c.data.members, { name:"", grade:"" }] } }));
  }
  function removeScanMember(key, i) {
    patchScanCard(key, c => ({
      data: { ...c.data, members: c.data.members.filter((_, j) => j !== i) },
      conf: { ...c.conf, members: (c.conf.members || []).filter((_, j) => j !== i) },
    }));
  }
  function removeScanCard(key) {
    setScanCards(cs => cs.filter(c => c.key !== key));
  }

  async function scanOne(card) {
    patchScanCard(card.key, { status: "reading", error: "" });
    let payload;
    try { payload = await scanPayload(card.file); }
    catch (e) { patchScanCard(card.key, { status: "error", error: e.message, retryable: false }); return; }
    const { data: { session: s } } = await supabase.auth.getSession();
    const resp = await fetch("/api/scan-form", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.access_token || ""}` },
      body: JSON.stringify({ schoolId: currentSchool.id, ...payload }),
    }).catch(() => null);
    const body = resp ? await resp.json().catch(() => ({})) : {};
    if (!resp || !resp.ok) {
      const msg = !resp ? "No connection — check the internet and retry."
        : resp.status === 413 ? "File is too large. Split the PDF or use a smaller photo."
        : (body.error || `Scan failed (error ${resp.status}).`);
      patchScanCard(card.key, { status: "error", error: msg });
      // Never log names or form content — status and code only.
      addItLog("WARN","ADMIN","FORM_SCAN_FAILED","Participation form could not be read",
        { status: resp?.status || 0, code: body.code || "NETWORK", mimeType: payload.mimeType });
      return;
    }
    const forms = Array.isArray(body.forms) ? body.forms : [];
    if (!forms.length) {
      patchScanCard(card.key, { status: "error", error: "No form was found in this file. Retry or enter it manually." });
      return;
    }
    setScanCards(cs => cs.flatMap(c => c.key === card.key ? forms.map(f => scanCardFromForm(c, f)) : [c]));
    addItLog("INFO","ADMIN","FORM_SCANNED","Participation form read by AI",
      { forms: forms.length, mimeType: payload.mimeType, model: body.model });
  }

  async function scanAddFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const cards = files.map(file => {
      const url = URL.createObjectURL(file);
      scanUrlsRef.current.push(url);
      return newScanCard(file, url);
    });
    setScanCards(cs => [...cs, ...cards]);
    // Small worker pool — a stack of 30 photos is read 3 at a time.
    const queue = [...cards];
    const worker = async () => { while (queue.length) await scanOne(queue.shift()); };
    await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, queue.length) }, worker));
  }

  const scanKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  function scanProblems(card) {
    const p = [];
    if (!card.data.title.trim()) p.push("Project title is required.");
    if (!card.data.department_id) p.push(card.deptRaw && card.deptRaw !== "None"
      ? `Pick a department (form says “${card.deptRaw}”).` : "Pick a department.");
    if (!catNames().includes(card.data.cat)) p.push(card.notSure
      ? "The student ticked “Not sure yet” — pick a category." : "Pick a category.");
    if (!normMembers(card.data.members).length) p.push("Add at least one student.");
    return p;
  }
  // Same title, or the same team (2+ shared names, or the same single student).
  function scanDuplicate(card) {
    const t = scanKey(card.data.title);
    const names = new Set(normMembers(card.data.members).map(m => scanKey(m.name)));
    const sameTeam = (members) => {
      const other = normMembers(members).map(m => scanKey(m.name));
      const shared = other.filter(n => names.has(n)).length;
      return shared >= 2 || (shared === 1 && other.length === 1 && names.size === 1);
    };
    const hit = projects.find(p => (t && scanKey(p.title) === t) || sameTeam(p.group_members));
    if (hit) return `Possible duplicate of project #${hit.num} “${hit.title}”.`;
    const twin = scanCards.find(c => c.key !== card.key && (c.status === "ready" || c.status === "saving")
      && ((t && scanKey(c.data.title) === t) || sameTeam(c.data.members)));
    return twin ? `Looks the same as another card in this batch (${twin.fileName}).` : "";
  }

  async function saveScanCard(card, base) {
    if (scanProblems(card).length) return { ok: false, nextProjects: base };
    patchScanCard(card.key, { status: "saving", error: "" });
    const { error, nextProjects, proj } = await createProject({ ...card.data, source: "scanned form" }, base);
    if (error) {
      patchScanCard(card.key, { status: "ready", error: `Could not save: ${error.message}` });
      return { ok: false, nextProjects };
    }
    patchScanCard(card.key, { status: "saved", savedNum: proj.num });
    return { ok: true, nextProjects };
  }
  async function saveOneScanCard(card) {
    setScanSaving(true);
    await saveScanCard(card, projects);
    setScanSaving(false);
  }
  // Saves only cards with no problems, no duplicate warning and that are real forms;
  // the rest need an explicit per-card Save. Saves run one after another, threading the
  // project list so each gets the next number.
  async function saveAllScanCards() {
    setScanSaving(true);
    let base = projects;
    const ready = scanCards.filter(c => c.status === "ready" && !c.notForm && !scanProblems(c).length && !scanDuplicate(c));
    for (const c of ready) {
      const r = await saveScanCard(c, base);
      base = r.nextProjects;
    }
    setScanSaving(false);
  }
  function closeScanner(force) {
    if (!force && scanCards.some(c => c.status !== "saved")) { setScanDiscardAsk(true); return; }
    scanUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    scanUrlsRef.current = [];
    setScanCards([]);
    setScanDiscardAsk(false);
    setScanOpen(false);
  }

  function renderScanCard(card) {
    const cf = card.conf || {};
    const unsure = (lvl) => (lvl === "low" || lvl === "unreadable") ? "scan-unsure" : "";
    const editable = card.status === "ready" || card.status === "saving";
    const problems = card.status === "ready" ? scanProblems(card) : [];
    const dup = card.status === "ready" ? scanDuplicate(card) : "";
    const busy = card.status === "saving" || scanSaving;
    const named = normMembers(card.data.members).length;
    const expected = { "Individually": 1, "In pairs": 2, "In groups of three": 3 }[card.workMode];
    return (
      <div key={card.key} className={`scan-card ${card.status}`}>
        {card.url
          ? <a className={`scan-thumb ${card.isImage && !card.thumbBroken ? "" : "pdf"}`} href={card.url} target="_blank" rel="noreferrer" title="Open the original full size">
              {card.isImage && !card.thumbBroken
                ? <img src={card.url} alt="Scanned participation form" onError={() => patchScanCard(card.key, { thumbBroken: true })} />
                : <>{card.isPdf ? "📄" : "🗂️"}<span>{card.isPdf ? "Open PDF" : "Open file"}</span></>}
            </a>
          : <div className="scan-thumb pdf">✍️<span>Manual</span></div>}
        <div className="scan-body">
          <div className="scan-file">{card.fileName}</div>

          {card.status === "reading" && <div className="scan-msg info">⏳ Reading form…</div>}

          {card.status === "error" && <>
            <div className="scan-msg err">⚠ {card.error}</div>
            <div className="scan-actions">
              {card.file && card.retryable && <button className="btn sm" style={{width:"auto"}} disabled={scanSaving} onClick={() => scanOne(card)}>↻ Retry</button>}
              <button className="btn sec sm" style={{width:"auto"}} onClick={() => patchScanCard(card.key, { status:"ready", error:"" })}>✍️ Enter manually</button>
              <button className="proj-act-btn del" onClick={() => removeScanCard(card.key)}>Remove</button>
            </div>
          </>}

          {card.status === "saved" && <div className="scan-msg ok">✅ Saved as project #{card.savedNum} — {card.data.title}</div>}

          {editable && <>
            {card.notForm && <div className="scan-msg warn">This page doesn't look like a participation form. Remove it, or fill it in if it is one.</div>}
            {card.notes && <div className="scan-msg warn">🔎 AI note: {card.notes}</div>}

            <div className="lbl" style={{marginTop:".5rem"}}>Project title</div>
            <input type="text" className={unsure(cf.title)} value={card.data.title}
              onChange={e => editScanField(card.key, "title", e.target.value)} />

            <div className="proj-form-grid" style={{marginTop:".5rem"}}>
              <div>
                <div className="lbl">Department</div>
                <select className={`delib-rec-select ${unsure(cf.department_id)}`} value={card.data.department_id}
                  onChange={e => editScanField(card.key, "department_id", e.target.value)}>
                  <option value="">— Pick a department —</option>
                  {departments.filter(d => d.id).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <div className="lbl">Category</div>
                <select className={`delib-rec-select ${unsure(cf.cat)}`} value={card.data.cat}
                  onChange={e => editScanField(card.key, "cat", e.target.value)}>
                  <option value="">{card.notSure ? "— Student was not sure: pick one —" : "— Pick a category —"}</option>
                  {catNames().map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="proj-form-grid" style={{marginTop:".5rem"}}>
              <div>
                <div className="lbl">Teacher / Adviser</div>
                <input type="text" className={unsure(cf.advisor_name)} value={card.data.advisor_name}
                  onChange={e => editScanField(card.key, "advisor_name", e.target.value)} />
              </div>
              <div>
                <div className="lbl">Room</div>
                <input type="text" className={unsure(cf.room)} value={card.data.room}
                  onChange={e => editScanField(card.key, "room", e.target.value)} />
              </div>
            </div>

            <div className="lbl" style={{marginTop:".5rem"}}>Students <span style={{fontWeight:400,textTransform:"none",letterSpacing:0}}>· name · grade</span></div>
            {card.data.members.map((m, i) => (
              <div key={i} className="member-row">
                <input type="text" placeholder={`Student ${i + 1}`} className={unsure(cf.members?.[i]?.name)} value={m.name}
                  onChange={e => editScanMember(card.key, i, "name", e.target.value)} />
                <input type="text" placeholder="Gr." className={`member-grade ${unsure(cf.members?.[i]?.grade)}`} value={m.grade}
                  onChange={e => editScanMember(card.key, i, "grade", e.target.value)} />
                {card.data.members.length > 1 &&
                  <button type="button" className="proj-act-btn del" title="Remove student" onClick={() => removeScanMember(card.key, i)}>✕</button>}
              </div>
            ))}
            {card.data.members.length < 6 &&
              <button type="button" className="btn sec sm" style={{width:"auto"}} onClick={() => addScanMember(card.key)}>+ Add student</button>}
            {expected && named !== expected &&
              <div className="scan-msg info">Form says “{card.workMode}” but {named} student{named !== 1 ? "s are" : " is"} listed — check the names.</div>}

            <div className="proj-form-grid" style={{marginTop:".5rem"}}>
              <div>
                <div className="lbl">Project grade</div>
                <input type="text" placeholder={highestGrade(card.data.members) ? `${highestGrade(card.data.members)} (highest student)` : "e.g. 8"}
                  value={card.data.grade} onChange={e => editScanField(card.key, "grade", e.target.value)} />
              </div>
              <div />
            </div>

            <div className="lbl" style={{marginTop:".5rem"}}>What they plan to investigate, test, design or build</div>
            <textarea rows={2} className={unsure(cf.description)} value={card.data.description}
              onChange={e => editScanField(card.key, "description", e.target.value)} />
            <div className="lbl" style={{marginTop:".5rem"}}>Why they chose this project</div>
            <textarea rows={2} className={unsure(cf.motivation)} value={card.data.motivation}
              onChange={e => editScanField(card.key, "motivation", e.target.value)} />

            {problems.length > 0 && <div className="scan-msg err">{problems.map(p => <div key={p}>• {p}</div>)}</div>}
            {dup && <div className="scan-msg warn">⚠ {dup} Save only if it really is a different project.</div>}
            {card.error && <div className="scan-msg err">{card.error}</div>}

            <div className="scan-actions">
              <button className="btn sm" style={{width:"auto"}} disabled={busy || problems.length > 0} onClick={() => saveOneScanCard(card)}>
                {card.status === "saving" ? "Saving…" : dup ? "Save anyway" : "✓ Save project"}
              </button>
              <button className="proj-act-btn del" disabled={busy} onClick={() => removeScanCard(card.key)}>Remove</button>
            </div>
          </>}
        </div>
      </div>
    );
  }

  async function removeProject(pid) {
    const proj = projects.find(p => p.id === pid);
    if (!proj || proj.locked) return;
    // Clean up all related data
    const relatedScoreKeys = Object.keys(scores).filter(k => k.endsWith(`_${pid}`));
    const relatedDelibKeys = Object.keys(deliberationNotes).filter(k => k.endsWith(`_${pid}`));
    // Remove from local state
    setProjects(p => p.filter(pp => pp.id !== pid));
    if (relatedScoreKeys.length) setScores(p => { const n = {...p}; relatedScoreKeys.forEach(k => delete n[k]); return n; });
    if (relatedDelibKeys.length) setDeliberationNotes(p => { const n = {...p}; relatedDelibKeys.forEach(k => delete n[k]); return n; });
    setFinalDecisions(p => { const n = {...p}; delete n[pid]; return n; });
    // Remove from Supabase
    const sid = currentSchool.id;
    await Promise.all([
      supabase.from("scores").delete().eq("school_id", sid).eq("project_id", pid),
      supabase.from("deliberation_notes").delete().eq("school_id", sid).eq("project_id", pid),
      supabase.from("final_decisions").delete().eq("school_id", sid).eq("project_id", pid),
      supabase.from("projects").delete().eq("school_id", sid).eq("id", pid),
    ]);
    // Remove from judge assignments (clean orphaned refs)
    for (const j of judges) {
      if (j.projects.includes(pid)) {
        const newProjs = j.projects.filter(id => id !== pid);
        await supabase.from("judges").update({ projects: newProjs }).eq("school_id", sid).eq("id", j.id);
      }
    }
    addLog(`Admin removed project #${proj.num}: ${proj.title}`);
    addItLog("WARN","ADMIN","PROJECT_REMOVED","Admin removed a project and all related data",
      { projectId:pid, num:proj.num, title:proj.title, scoresCleared:relatedScoreKeys.length, delibCleared:relatedDelibKeys.length, timestamp:fmtISO(Date.now()) });
  }

  async function toggleProjectLock(pid) {
    const proj = projects.find(p => p.id === pid);
    if (!proj) return;
    const next = !proj.locked;
    setProjects(p => p.map(pp => pp.id === pid ? { ...pp, locked: next } : pp));
    await supabase.from("projects").update({ locked: next }).eq("school_id", currentSchool.id).eq("id", pid);
    addLog(`Admin ${next ? "locked" : "unlocked"} project #${proj.num}`);
    addItLog("INFO","ADMIN", next ? "PROJECT_LOCKED" : "PROJECT_UNLOCKED",
      `Admin ${next ? "locked" : "unlocked"} project`,
      { projectId:pid, num:proj.num, title:proj.title, timestamp:fmtISO(Date.now()) });
  }

  // ── REGISTRATION ACTIONS ──────────────────────────────────
  // Registration numbers ("JHS-PMA-003") are built server-side by submit_registration();
  // the client only sends the "JHS-PMA" prefix (see handleRegSubmit).

  async function deleteRegSubmission(sub) {
    await supabase.from("registration_submissions").delete().eq("school_id", currentSchool.id).eq("id", sub.id);
    setRegSubmissions(prev => prev.filter(s => s.id !== sub.id));
    addLog(`Admin deleted registration submission: ${sub.reg_number} — ${sub.student_name}`);
  }

  async function generateRegLink() {
    const token = genToken();
    const { error } = await supabase.from("registration_links").insert({ school_id: currentSchool.id, token, active: true });
    if (!error) {
      await loadRegLinks();
      addLog("Admin generated a student registration link");
      addItLog("INFO", "ADMIN", "REG_LINK_GENERATED", "Admin generated student registration link", { token });
    }
  }

  async function deactivateRegLink(linkId) {
    await supabase.from("registration_links").update({ active: false }).eq("school_id", currentSchool.id).eq("id", linkId);
    await loadRegLinks();
    addLog("Admin deactivated student registration link");
    addItLog("INFO", "ADMIN", "REG_LINK_DEACTIVATED", "Admin deactivated student registration link", { linkId });
  }

  async function handleRegSubmit() {
    const f = regForm;
    if (!f.studentName.trim() || !f.gradeLevel.trim() || !f.schoolName.trim()
        || !f.studentEmail.trim() || !f.projectTitle.trim() || !f.category || !f.division
        || !f.isOriginalWork || !f.agreesToRules) {
      setRegFormErr("Please fill in all required fields (*) and check both consent boxes.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.studentEmail.trim())) {
      setRegFormErr("Please enter a valid email address.");
      return;
    }
    if (f.studentEmail.trim().toLowerCase() !== f.emailConfirm.trim().toLowerCase()) {
      setRegFormErr("Email addresses do not match. Please re-enter to confirm.");
      return;
    }
    setRegSubmitting(true);
    setRegFormErr("");
    try {
      // One SECURITY DEFINER call (migration 2026-10b) validates the registration token and
      // creates the project, its private names row and the submission in a single
      // transaction, numbering under a per-school lock. Anonymous visitors cannot write
      // `projects` or `registration_submissions` directly — that is why the old
      // three-step client insert always failed.
      const { data: res, error: rpcErr } = await supabase.rpc("submit_registration", {
        p_token: urlRegToken,
        p_form: {
          student_name:       f.studentName.trim(),
          grade_level:        f.gradeLevel.trim(),
          division:           f.division,
          school_name:        f.schoolName.trim(),
          student_email:      f.studentEmail.trim(),
          contact_number:     f.contactNumber.trim(),
          project_title:      f.projectTitle.trim(),
          category:           f.category,
          project_type:       f.projectType,
          group_members:      f.groupMembers ? f.groupMembers.split("\n").map(s => s.trim()).filter(Boolean) : [],
          advisor_name:       f.advisorName.trim(),
          advisor_email:      f.advisorEmail.trim(),
          school_department:  f.schoolDepartment.trim(),
          description:        f.description.trim(),
          research_question:  f.researchQuestion.trim(),
          hypothesis:         f.hypothesis.trim(),
          needs_electricity:  !!f.needsElectricity,
          special_equipment:  f.specialEquipment.trim(),
          has_trifold:        !!f.hasTrifold,
          is_original_work:   !!f.isOriginalWork,
          agrees_to_rules:    !!f.agreesToRules,
          guardian_name:      f.guardianName.trim(),
          guardian_signature: f.guardianSignature.trim(),
          // "JHS-PMA" — the server appends the next number. The division code is
          // still the hardcoded DIV_CODES map; the category code now comes from
          // the school's own category row.
          reg_prefix: `${DIV_CODES[f.division] || "UNK"}-${categories.find(c => c.name === f.category)?.code || "OTH"}`,
        },
      });
      if (rpcErr || !res?.reg_number) {
        // P0001 messages are written for the student ("link is not active", missing fields).
        setRegFormErr(rpcErr?.code === "P0001" ? rpcErr.message : "Submission failed — please try again or contact the organizer.");
        addItLog("ERROR","DB","REG_SUBMIT_FAILED","submit_registration failed — is migration-2026-10b applied?",
          { code: rpcErr?.code || null, error: rpcErr?.message || "no result" });
        setRegSubmitting(false);
        return;
      }
      const regNumber = res.reg_number;
      const projId    = res.project_id;

      addLog(`New project registered online: "${f.projectTitle.trim()}" — ${regNumber}`);
      addItLog("INFO", "ADMIN", "PROJECT_REGISTERED", "Project submitted via online registration form",
        { regNumber, projectId: projId, title: f.projectTitle.trim(), category: f.category, division: f.division });

      // Send confirmation email — non-critical, failure does not block submission
      try {
        await fetch("/api/send-registration-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentEmail: f.studentEmail.trim(),
            advisorEmail: f.advisorEmail.trim(),
            studentName:  f.studentName.trim(),
            regNumber,
            projectTitle: f.projectTitle.trim(),
            category:     f.category,
            division:     f.division,
          }),
        });
      } catch {
        addItLog("WARN", "SYSTEM", "REG_EMAIL_FAILED", "Registration confirmation email could not be sent",
          { regNumber, email: f.studentEmail.trim() });
      }

      setRegSuccess({ regNumber, projectTitle: f.projectTitle.trim(), category: f.category });
    } catch (err) {
      setRegFormErr("An unexpected error occurred. Please try again.");
      addItLog("ERROR", "SYSTEM", "REG_SUBMIT_ERROR", "Registration form submission error", { error: err?.message });
    }
    setRegSubmitting(false);
  }

  // ─── VIEWS ───

  /* LOADING */
  if (loading && !judge) return (
    <div className="app"><style>{CSS}</style>{backdrop}
      <div className="center">
        <div style={{ textAlign:"center", color:"var(--dim)" }}>
          <div style={{ fontSize:"2.5rem", marginBottom:"1rem" }}>⏳</div>
          <div style={{ fontFamily:"var(--ff-m)", fontSize:".9rem", letterSpacing:".1em" }}>Connecting…</div>
        </div>
      </div>
    </div>
  );

  /* SCHOOL LOADING GATE */
  if (urlSchoolSlug && schoolLoading) return (
    <div className="app"><style>{CSS}</style>
      <div className="center"><div style={{ textAlign:"center", color:"var(--dim)" }}>Loading school…</div></div>
    </div>
  );

  /* SCHOOL NOT FOUND */
  if (urlSchoolSlug && !schoolLoading && !currentSchool) return (
    <div className="app"><style>{CSS}</style>
      <div className="center"><div className="inner">
        <div className="card" style={{ textAlign:"center" }}>
          <div style={{ fontSize:"3rem", marginBottom:".75rem" }}>🏫</div>
          <h2 style={{ fontFamily:"var(--ff-d)", color:"var(--navy)", marginBottom:".4rem" }}>School Not Found</h2>
          <p style={{ color:"var(--dim)", marginBottom:"1.25rem" }}>No school is registered at <code>/s/{urlSchoolSlug}</code>.</p>
          <button className="btn" onClick={() => window.location.href = "/"}>← Back to Home</button>
        </div>
      </div></div>
    </div>
  );

  /* LANDING */
  if (view === "landing") return (
    <div className="app"><style>{CSS}</style>{backdrop}
      <div className="glow" />
      <div className="center" style={{ position:"relative" }}>
        <div className="school-banner">
          <img src="/logo.png" alt={currentSchool?.name || "Science Fair"} />
          <div className="school-name">{currentSchool?.name || <span>Science Fair</span>}</div>
          <div className="school-div" />
        </div>
        <div className="land-badge">🔬 Digital Judging Platform</div>
        <h1 className="land-h1">Judging <span>Portal</span></h1>
        <p className="land-p">A secure, anonymous, and digital evaluation platform for fair and accurate scoring of student science projects.</p>
        <div className="role-grid">
          <div className="role-card" onClick={() => setView("judge-register")}>
            <div className="ico">🧑‍⚖️</div><h3>I'm a Judge</h3><p>You'll need your assigned judge name (e.g. Judge1) and the invite code from your coordinator</p>
          </div>
          {/* Already signed in as this school's admin (e.g. arriving from the email-confirmation
              link) → straight to the dashboard instead of asking for the password again. */}
          <div className="role-card adm" onClick={() => setView(adminHere && session ? "admin-home" : "admin-login")}>
            <div className="ico">🛡️</div><h3>Admin</h3><p>Monitor progress and manage the event</p>
          </div>
          {isLinkLive() && (
            <div className="role-card pub" onClick={() => setView("public-results")}>
              <div className="ico">🏆</div>
              <div>
                <div className="pub-pill">● LIVE RESULTS</div>
                <h3 style={{ marginBottom:".2rem" }}>View Results Dashboard</h3>
                <p>{shareTitle}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  /* JUDGE REGISTER */
  if (view === "judge-register") return (
    <div className="app"><style>{CSS}</style>{backdrop}
      <div className="center"><div className="inner">
        <button className="back" onClick={() => { setView("landing"); setRegErr(""); setRegCode(""); setRegName(""); setRegDept(""); }}>← Back</button>
        <div className="card">
          <div style={{ textAlign:"center", marginBottom:"1.5rem" }}>
            <div style={{ fontSize:"2.5rem", marginBottom:".5rem" }}>🔐</div>
            <h2 style={{ fontFamily:"var(--ff-d)", fontSize:"1.5rem", marginBottom:".4rem", color:"var(--navy)" }}>Judge Sign In</h2>
            <p style={{ color:"var(--dim)", fontSize:".95rem" }}>Your coordinator will give you your judge name and invite code before the event starts.</p>
          </div>
          {schoolNumbering() ? (() => {
            // One list for the whole school: the judge types only their number and the
            // department is shown back from it — they can no longer pick the wrong one.
            const num  = judgeNumOf(normJudgeAlias(regName));
            const dept = deptForJudgeNum(num);
            const top  = departments.reduce((m, d) => Math.max(m, d.judge_to || 0), 0);
            return (
              <div style={{ marginBottom:"1rem" }}>
                <div className="lbl">Judge Number</div>
                <input type="text" inputMode="numeric" placeholder="e.g. 7" value={regName}
                  onChange={e => { setRegName(e.target.value); setRegErr(""); }}
                  onKeyDown={e => e.key==="Enter" && handleRegister()}
                  style={{ textAlign:"center", fontFamily:"var(--ff-m)", fontSize:"1.1rem" }} />
                {num && dept ? (
                  <div className="judge-num-hit">✓ Judge {num} · <strong>{dept.name}</strong></div>
                ) : num ? (
                  <div className="judge-num-miss">Judge {num} is not on this school's judge list (1–{top}).</div>
                ) : (
                  <p style={{ fontSize:".78rem", color:"var(--dim)", marginTop:".35rem" }}>
                    Your coordinator gave you a judge number. Your department is filled in from it.
                  </p>
                )}
              </div>
            );
          })() : (<>
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">Department</div>
            <div style={{ display:"flex", flexDirection:"column", gap:".45rem" }}>
              {departments.map(d => (
                <button key={d.id} type="button"
                  onClick={() => { setRegDept(d.id); setRegErr(""); }}
                  style={{
                    padding:".65rem 1rem", borderRadius:"var(--r)", cursor:"pointer", fontFamily:"var(--ff-b)",
                    fontSize:".95rem", fontWeight: regDept === d.id ? 600 : 400, textAlign:"left",
                    background: regDept === d.id ? "var(--navy)" : "var(--s1)",
                    color:       regDept === d.id ? "#fff"       : "var(--text)",
                    border:`1.5px solid ${regDept === d.id ? "var(--navy)" : "var(--bd)"}`,
                    transition:"all .15s",
                  }}>
                  {regDept === d.id ? "✓ " : ""}{d.name}
                  <span style={{ float:"right", fontSize:".78rem", opacity:.65, fontFamily:"var(--ff-m)" }}>
                    {judges.filter(j => j.department_id === d.id).length}/{d.max_judges} judges
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">Judge Name</div>
            <input type="text" placeholder="e.g. Judge1" value={regName}
              onChange={e => { setRegName(e.target.value.trim()); setRegErr(""); }}
              onKeyDown={e => e.key==="Enter" && handleRegister()}
              style={{ textAlign:"center", fontFamily:"var(--ff-m)", fontSize:"1.1rem" }} />
            <p style={{ fontSize:".78rem", color:"var(--dim)", marginTop:".35rem" }}>
              Your coordinator assigned you a name like <strong>Judge1</strong>, <strong>Judge2</strong>, etc.
            </p>
          </div>
          </>)}
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">Invite Code</div>
            <input type="text" placeholder="Event invite code" value={regCode}
              onChange={e => { setRegCode(e.target.value.toUpperCase()); setRegErr(""); }}
              onKeyDown={e => e.key==="Enter" && handleRegister()}
              style={{ textAlign:"center", letterSpacing:".18em", fontFamily:"var(--ff-m)", fontSize:"1.1rem" }} />
            <p style={{ fontSize:".78rem", color:"var(--dim)", marginTop:".35rem" }}>
              Get this from your event coordinator or administrator.
            </p>
            {regErr && <div className="err">⚠ {regErr}</div>}
          </div>
          <button className="btn" onClick={handleRegister}>Enter as Judge →</button>
          <p style={{ textAlign:"center", fontSize:".72rem", color:"var(--dim)", marginTop:".9rem", lineHeight:1.5 }}>
            🔒 Your session is saved to this device — you can close and reopen the browser without losing your progress.
          </p>
        </div>
      </div></div>
    </div>
  );

  /* JUDGE HOME */
  if (view === "judge-home" && judge) {
    const myProj = projects.filter(p => judge.projects.includes(p.id));
    const done   = myProj.filter(p => hasScored(p.id)).length;
    const pct    = Math.round((done / myProj.length) * 100);
    return (
      <div className="app"><style>{CSS}</style>{backdrop}
        <div className="center"><div className="inner">
          <div className="jh-top">
            <div>
              <h2 style={{ fontFamily:"var(--ff-d)", fontSize:"1.5rem", marginBottom:".15rem", color:"var(--navy)" }}>My Projects</h2>
              <p style={{ color:"var(--dim)", fontSize:".9rem" }}>Score each project using the rubric</p>
            </div>
            <div className="alias-tag">👤 {judge.alias}</div>
          </div>
          {!isOnline && (
            <div className="offline-banner">
              📵 You're offline — scores are saved locally and will sync when reconnected.
              {offlineQueue.length > 0 && <span className="sync-ct">({offlineQueue.length} pending sync)</span>}
            </div>
          )}
          {locked && <div className="locked-banner">🔒 Judging is currently locked by the administrator.</div>}
          <div className="card" style={{ padding:"1rem 1.2rem" }}>
            <div className="lbl">Scoring Guide</div>
            <div style={{ fontSize:".88rem", color:"var(--text)", lineHeight:1.6 }}>
              <div>0 = not present</div>
              <div>1 or 2 = partial</div>
              <div>2 or 4 = complete</div>
              <div>3 or 6 = exceptional</div>
            </div>
          </div>
          <div className="card" style={{ padding:"1.1rem 1.4rem" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:".45rem" }}>
              <span style={{ fontSize:".83rem" }}>Your Progress</span>
              <span style={{ fontFamily:"var(--ff-m)", fontSize:".9rem", color:"var(--navy)" }}>{done}/{myProj.length} scored</span>
            </div>
            <div className="pbar" style={{ height:"7px" }}><div className="pfill" style={{ width:`${pct}%`, height:"7px" }} /></div>
          </div>
          {done === 0 && myProj.length > 0 && (
            <div style={{ background:"var(--blue-l)", border:"1px solid #2563eb20", borderRadius:"var(--r)", padding:".85rem 1.1rem", marginBottom:".85rem", display:"flex", alignItems:"center", gap:".75rem" }}>
              <span style={{ fontSize:"1.3rem" }}>👆</span>
              <div>
                <div style={{ fontWeight:600, fontSize:".9rem", color:"var(--navy)", marginBottom:".1rem" }}>Tap a project to start scoring</div>
                <div style={{ fontSize:".8rem", color:"var(--dim)" }}>Score each criterion using the button options, then submit when done.</div>
              </div>
            </div>
          )}
          <div className="card proj-list">
            {myProj.map(proj => {
              const scored = hasScored(proj.id);
              const ex = scores[`${judge.id}_${proj.id}`];
              return (
                <div key={proj.id} className="proj-item"
                  onClick={() => !locked && !judgeValidations[judge.id] && startScoring(proj.id)}
                  style={{ cursor: locked || judgeValidations[judge.id] ? "not-allowed" : "pointer", opacity:scored?.75:1 }}>
                  <div className="proj-num">#{proj.num}</div>
                  <div className="proj-info">
                    <div className="proj-title">{proj.title}</div>
                    <div className="proj-meta">{proj.cat} · Grade {proj.grade}</div>
                  </div>
                  {scored ? <span className="proj-st st-done">✓ {getTotal(ex)}pts</span>
                          : <span className="proj-st st-pend">Pending →</span>}
                </div>
              );
            })}
          </div>
          {done === myProj.length && (
            <div className="all-done">
              <div style={{ fontSize:"2rem", marginBottom:".4rem" }}>🎉</div>
              <div style={{ fontWeight:600, marginBottom:".2rem" }}>All projects scored!</div>
              <div style={{ fontSize:".82rem", color:"var(--dim)" }}>
                Please review and validate the computed results below.
              </div>
            </div>
          )}
          {done === myProj.length && (() => {
            const myVal = judgeValidations[judge.id];
            if (myVal) return (
              <div className="delib-section">
                <div style={{fontFamily:"var(--ff-d)",fontSize:"1.1rem",color:"var(--navy)",marginBottom:".5rem"}}>
                  ✅ Results Validated
                </div>
                <div className={`val-status-pill ${myVal.approved ? "approved" : "concern"}`}>
                  {myVal.approved ? "✓ You approved the computed results" : "⚠ You flagged a concern"}
                </div>
                {myVal.comment && <div style={{fontSize:".82rem",color:"var(--dim)",marginTop:".5rem"}}>Your note: "{myVal.comment}"</div>}
                {valReviseErr && <div className="err" style={{marginTop:".75rem"}}>⚠ {valReviseErr}</div>}
                <button className="btn sec sm" style={{marginTop:"1rem",width:"auto"}} onClick={async () => {
                  // Delete in the database FIRST and only unlock on screen if a row was really
                  // removed. Until 2026-10-05 this was a fire-and-forget delete that never ran,
                  // and then (RLS admin-only) silently matched 0 rows — the screen said
                  // "revised" while the DB still had the judge validated and locked out.
                  setValReviseErr("");
                  const { data, error } = await supabase.from("validations").delete()
                    .eq("school_id", currentSchool?.id).eq("judge_id", judge.id).select("judge_id");
                  if (error || !data?.length) {
                    setValReviseErr(resultsFinalized
                      ? "Results are already finalized — your validation can no longer be changed."
                      : "Could not reopen your validation. Check your connection, or ask the admin.");
                    addItLog("ERROR","JUDGE","VALIDATION_REVISE_FAILED","Could not clear validation",
                      { judgeId: judge.id, error: error?.message || "0 rows deleted (RLS / migration 2026-10d not run?)" });
                    return;
                  }
                  setJudgeValidations(p => { const n={...p}; delete n[judge.id]; return n; });
                  addLog(`${judge.alias} reopened their validation`);
                  setShowValForm(false); setValComment("");
                }}>Revise my validation</button>
              </div>
            );
            return (
              <div className="delib-section">
                <div style={{fontFamily:"var(--ff-d)",fontSize:"1.1rem",color:"var(--navy)",marginBottom:".3rem"}}>
                  📋 Validate Computed Results
                </div>
                <p style={{fontSize:".85rem",color:"var(--dim)",marginBottom:"1rem",lineHeight:1.6}}>
                  Review the system-computed rankings and confirm they look correct. If you have a concern, flag it for the admin to review.
                </p>
                <div style={{marginBottom:"1rem"}}>
                  {rankedProjects().filter(p => myProj.some(mp => mp.id === p.id)).map((p, i) => (
                    <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:".55rem .75rem",borderBottom:"1px solid var(--bd)",fontSize:".88rem"}}>
                      <span style={{color:"var(--dim)",fontFamily:"var(--ff-m)",marginRight:".5rem"}}>{i+1}.</span>
                      <span style={{flex:1}}>{p.title}</span>
                      <span style={{fontFamily:"var(--ff-m)",color:"var(--navy)",fontWeight:600}}>{p.avg ?? "—"} pts</span>
                    </div>
                  ))}
                </div>
                {showValForm && (
                  <div style={{marginBottom:".75rem"}}>
                    <div className="lbl">Comment (optional)</div>
                    <textarea placeholder="Describe your concern or observation..." value={valComment} onChange={e => setValComment(e.target.value)} rows={3} />
                  </div>
                )}
                {valErr && <div className="err" style={{marginBottom:".75rem"}}>⚠ {valErr}</div>}
                <div style={{display:"flex",gap:".65rem",flexWrap:"wrap"}}>
                  <button className="btn sm" style={{width:"auto",background:"var(--green)"}} onClick={() => submitJudgeValidation(true)}>
                    ✓ Approve Results
                  </button>
                  {!showValForm
                    ? <button className="btn sec sm" style={{width:"auto"}} onClick={() => setShowValForm(true)}>⚠ Flag a Concern</button>
                    : <button className="btn danger sm" style={{width:"auto"}} onClick={() => submitJudgeValidation(false)}>Submit Concern</button>
                  }
                </div>
              </div>
            );
          })()}
          {deliberationOpen && (
            <div className="delib-section" style={{marginTop:"1rem"}}>
              <div style={{fontFamily:"var(--ff-d)",fontSize:"1.1rem",color:"var(--navy)",marginBottom:".3rem"}}>
                💬 Deliberation Notes
              </div>
              <p style={{fontSize:".85rem",color:"var(--dim)",marginBottom:"1rem",lineHeight:1.6}}>
                Admin has opened deliberation. Add a recommendation and optional comment for each project to help inform the final award decision.
              </p>
              {delibNoteErr && <div className="err" style={{marginBottom:".75rem"}}>⚠ {delibNoteErr}</div>}
              {myProj.map(proj => {
                const noteKey = `${judge.id}_${proj.id}`;
                const existing = deliberationNotes[noteKey];
                const draft = delibDrafts[proj.id] || { comment: existing?.comment || "", rec: existing?.recommendation || "Pending", flagged: existing?.flagged || false };
                return (
                  <div key={proj.id} className="delib-proj">
                    <div className="delib-proj-head">
                      <div>
                        <div style={{fontFamily:"var(--ff-m)",fontSize:".73rem",color:"var(--navy)"}}>#{proj.num}</div>
                        <div style={{fontWeight:600,fontSize:".88rem"}}>{proj.title}</div>
                        <div style={{fontSize:".75rem",color:"var(--dim)"}}>{proj.cat} · Grade {proj.grade}</div>
                      </div>
                      {existing && <span className="delib-submitted">✓ Submitted</span>}
                    </div>
                    <div style={{marginBottom:".5rem"}}>
                      <div className="lbl">Recommendation</div>
                      <select className="delib-rec-select"
                        value={draft.rec}
                        onChange={e => setDelibDrafts(p => ({...p, [proj.id]: {...(delibDrafts[proj.id]||draft), rec: e.target.value}}))}>
                        <option value="Pending">Pending</option>
                        {RECOMMENDATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div style={{marginBottom:".5rem"}}>
                      <div className="lbl">Comment (optional)</div>
                      <textarea rows={2} placeholder="Your observations about this project…"
                        value={draft.comment}
                        onChange={e => setDelibDrafts(p => ({...p, [proj.id]: {...(delibDrafts[proj.id]||draft), comment: e.target.value}}))} />
                    </div>
                    <label className="delib-flag-wrap">
                      <input type="checkbox" checked={draft.flagged || false}
                        onChange={e => setDelibDrafts(p => ({...p, [proj.id]: {...(delibDrafts[proj.id]||draft), flagged: e.target.checked}}))} />
                      <span style={{fontSize:".88rem"}}>🚩 Flag this project for discussion</span>
                    </label>
                    <button className="btn sm" style={{marginTop:".75rem",width:"auto"}}
                      onClick={async () => {
                        const d = delibDrafts[proj.id] || draft;
                        setDelibNoteErr("");
                        // Save first; only show it as submitted once the database has it.
                        const { error } = await supabase.from("deliberation_notes").upsert({
                          school_id: currentSchool?.id, judge_id: judge.id, project_id: proj.id,
                          comment: d.comment, recommendation: d.rec, flagged: d.flagged||false,
                        }, { onConflict: "judge_id,project_id" });
                        if (error) {
                          setDelibNoteErr(`Your note for Project #${proj.num} was NOT saved. Check your connection and try again.`);
                          addItLog("ERROR","JUDGE","DELIB_NOTE_FAILED","Could not save a deliberation note",
                            { judgeId: judge.id, alias: judge.alias, projectId: proj.id, online: navigator.onLine, error: error.code || error.message });
                          return;
                        }
                        const entry = { comment: d.comment, recommendation: d.rec, flagged: d.flagged||false, submittedAt: Date.now() };
                        setDeliberationNotes(p => ({...p, [noteKey]: entry}));
                        addLog(`${judge.alias} submitted deliberation note for Project #${proj.num}`);
                        addItLog("INFO","JUDGE","DELIB_NOTE_SUBMITTED","Judge submitted deliberation note",
                          { judgeId: judge.id, alias: judge.alias, projectId: proj.id, projectNum: proj.num, recommendation: d.rec, flagged: d.flagged||false });
                      }}>
                      {existing ? "Update Note" : "Submit Note"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {offlineQueue.length > 0 && (
            <div className="sync-banner" style={{ marginTop:".85rem" }}>
              <div>
                ⚠ {offlineQueue.length} score{offlineQueue.length!==1?"s":""} currently saved only on this device (not yet in Supabase).
              </div>
              {isOnline && <button className="btn sec sm" style={{width:"auto"}} onClick={flushOfflineQueue}>Sync Now</button>}
            </div>
          )}
          <div className="sync-meta" style={{ marginTop:".3rem", marginBottom:".7rem" }}>
            Sync status: {offlineQueue.length > 0 ? "Pending local saves" : "All local scores synced"} · Last sync: {lastSyncAt ? fmtFull(lastSyncAt) : "Not yet"}
          </div>
          {/* Signing out wipes this device's copy of the session. It must NEVER wipe scores that
              have not reached the database yet (sf_offline_queue) — until 2026-10-05 it did, so an
              offline judge who signed out lost those scores for good. No window.confirm: it is
              blocked when the app is installed. */}
          {offlineQueue.length > 0 ? (
            <div className="locked-banner" style={{ marginTop:".85rem" }}>
              ⚠ {offlineQueue.length} score{offlineQueue.length!==1?"s are":" is"} only on this device. Connect to the internet and
              press <b>Sync Now</b> before signing out — signing out now would lose {offlineQueue.length!==1?"them":"it"}.
            </div>
          ) : judgeSignOutAsk ? (
            <div className="scan-msg warn" style={{ marginTop:".85rem" }}>
              <div style={{ marginBottom:".5rem" }}>You have scored {done} of {myProj.length} projects. Sign out anyway? Your saved scores stay in the system.</div>
              <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" }}>
                <button className="btn danger sm" style={{ width:"auto" }} onClick={() => {
                  setJudgeSignOutAsk(false); setJudge(null);
                  ["sf_judge_id","sf_judge_data","sf_scores_cache"].forEach(k => localStorage.removeItem(k));
                  setView("landing");
                }}>Yes, sign out</button>
                <button className="btn sec sm" style={{ width:"auto" }} onClick={() => setJudgeSignOutAsk(false)}>Keep scoring</button>
              </div>
            </div>
          ) : (
          <button className="btn sec" style={{ marginTop:".85rem" }} onClick={() => {
            if (done < myProj.length) { setJudgeSignOutAsk(true); return; }
            setJudge(null);
            ["sf_judge_id","sf_judge_data","sf_scores_cache"].forEach(k => localStorage.removeItem(k));
            setView("landing");
          }}>Sign Out</button>
          )}
        </div></div>
      </div>
    );
  }

  /* JUDGE SCORING */
  if (view === "judge-scoring" && scoringPid) {
    const proj = projects.find(p => p.id === scoringPid);
    return (
      <div className="app"><style>{CSS}</style>{backdrop}
        <div className="center" style={{ justifyContent:"flex-start", paddingTop:"2rem" }}>
          <div className="inner">
            <button className="back" onClick={() => setView("judge-home")}>← Back to my projects</button>
            {!isOnline && (
              <div className="offline-banner">
                📵 Offline — score will be saved locally and synced when reconnected.
              </div>
            )}
            {offlineQueue.length > 0 && (
              <div className="sync-banner">
                ⚠ {offlineQueue.length} pending local save{offlineQueue.length!==1?"s":""} not yet in backend.
              </div>
            )}
            <div className="sc-header">
              <div style={{ fontFamily:"var(--ff-m)", fontSize:".78rem", color:"var(--navy)", marginBottom:".2rem" }}>PROJECT #{proj.num}</div>
              <h2>{proj.title}</h2>
              <div style={{ fontSize:".78rem", color:"var(--dim)", marginTop:".35rem" }}>
                {proj.cat} · Grade {proj.grade} · {getDivision(proj.grade)}{proj.room ? ` · Room ${proj.room}` : ""}
              </div>
              {proj.description && (
                <div style={{ fontSize:".8rem", color:"var(--text)", marginTop:".5rem", lineHeight:1.45 }}>{proj.description}</div>
              )}
            </div>
            {/* Comment-only department (PreK / K-2): no rubric, no total, no ranking.
                The judge gives a commendation — from the list or in their own words. */}
            {isFeedbackProject(proj) ? (
              <>
                <div className="fb-banner">
                  🌟 <strong>This group is not scored.</strong> Every project here is a winner.
                  Choose a commendation that fits what you saw, and add a comment if you would like to.
                </div>
                <div className="card">
                  <div className="lbl" style={{ marginBottom:".5rem" }}>Commendation</div>
                  <div className="fb-chips">
                    {COMMENDATIONS.map(c => (
                      <button key={c} type="button"
                        className={"fb-chip" + (draftCommend === c ? " selected" : "")}
                        onClick={() => setDraftCommend(c)}>{c}</button>
                    ))}
                  </div>
                  <div className="lbl" style={{ margin:".9rem 0 .35rem" }}>…or write your own</div>
                  <input type="text" maxLength={60} placeholder="e.g. Best Volcano in the Whole School"
                    value={draftCommend}
                    onChange={e => setDraftCommend(e.target.value)} />
                </div>
              </>
            ) : rubric.map(r => {
              if (r.id === "abstract" && !requiresAbstract(proj)) return null;
              return (
                <div className="rub-item" key={r.id}>
                  <div className="rub-top">
                    <span className="rub-lbl">{r.label}</span>
                    <span className="rub-val">{draftSc[r.id] !== undefined ? draftSc[r.id] : "—"} / {r.max}</span>
                  </div>
                  <div className="rub-desc">{r.desc}</div>
                  <div className="rub-steps">
                    {r.steps.map((v, i) => {
                      const lab = stepLabel(r, v, i);
                      return (
                        <button key={v} type="button"
                          className={"rub-step-btn" + (draftSc[r.id] === v ? " selected" : "") + (lab ? " labelled" : "")}
                          onClick={() => setDraftSc(p => ({ ...p, [r.id]: v }))}>
                          {lab ? <><span className="rub-step-lab">{lab}</span><span className="rub-step-pts">{v}</span></> : v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {hasZeroScore() && (
              <div className="val-tie-alert" style={{ marginBottom:"1rem" }}>
                ⚠️ <strong>Grades 5 and up must have no zeroes.</strong> Please review your scores — at least one criterion is scored 0.
              </div>
            )}
            <div className="card">
              <div className="lbl">{isFeedbackProject(proj) ? "Comment for the students (optional)" : "Judge Notes (Optional)"}</div>
              <textarea placeholder={isFeedbackProject(proj)
                ? "Something encouraging they can read later…"
                : "Add observations about this project…"}
                value={draftNotes} onChange={e => setDraftNotes(e.target.value)} />
            </div>
            {!isFeedbackProject(proj) && (
              <div className="sc-total">
                <div><div className="lbl">Total Score</div><div style={{ fontSize:".76rem", color:"var(--dim)" }}>Out of {maxDraftScore()} points</div></div>
                <div className="sc-total-num">{draftTotal()}</div>
              </div>
            )}
            <button className="btn" onClick={submitScore} disabled={!allMoved() || hasZeroScore()}>
              {isFeedbackProject(proj) ? "Submit Review →" : "Submit Score →"}
            </button>
            {isFeedbackProject(proj) && !allMoved() && (
              <p style={{ textAlign:"center", fontSize:".72rem", color:"var(--dim)", marginTop:".4rem" }}>Choose or write a commendation to finish.</p>
            )}
            {hasZeroScore() && <p style={{ textAlign:"center", fontSize:".72rem", color:"var(--red)", marginTop:".4rem" }}>Remove all zero scores before submitting (Grades 5+ rule).</p>}
            <p style={{ textAlign:"center", fontSize:".72rem", color:"var(--dim)", marginTop:".7rem" }}>You may revise this before judging closes.</p>
          </div>
        </div>
      </div>
    );
  }

  /* PUBLIC REGISTRATION FORM */
  if (view === "public-register") {
    if (loading || !regTokenChecked) return (
      <div className="app"><style>{CSS}</style>
        <div className="center">
          <div style={{ textAlign:"center", color:"var(--dim)" }}>
            <div style={{ fontSize:"2.5rem", marginBottom:"1rem" }}>⏳</div>
            <div style={{ fontFamily:"var(--ff-m)", fontSize:".9rem", letterSpacing:".1em" }}>Loading…</div>
          </div>
        </div>
      </div>
    );

    if (!regTokenData) return (
      <div className="app"><style>{CSS}</style>
        <div className="reg-wrap">
          <div className="reg-inner">
            <div className="reg-hero">
              <img src="/logo.png" alt="Dishchiibikoh Community School" style={{ width:64, marginBottom:"1rem" }} />
              <div className="school-name">Dishchiibikoh <span>Community School</span></div>
            </div>
            <div className="reg-invalid-banner">
              <div style={{ fontSize:"2rem", marginBottom:".75rem" }}>🔗</div>
              <h3 style={{ fontFamily:"var(--ff-d)", color:"var(--red)", marginBottom:".5rem" }}>Registration Link Invalid</h3>
              <p style={{ color:"var(--dim)", fontSize:".92rem" }}>
                This registration link is no longer active or does not exist. Please contact your event organizer for a new link.
              </p>
            </div>
          </div>
        </div>
      </div>
    );

    if (regSuccess) return (
      <div className="app"><style>{CSS}</style>
        <div className="reg-wrap">
          <div className="reg-inner">
            <div className="reg-hero">
              <img src="/logo.png" alt="Dishchiibikoh Community School" style={{ width:64, marginBottom:".75rem" }} />
              <div className="school-name">Dishchiibikoh <span>Community School</span></div>
            </div>
            <div className="card reg-success">
              <div className="ico">🎉</div>
              <h2>Registration Successful!</h2>
              <p style={{ color:"var(--dim)", fontSize:".95rem", marginBottom:"1.25rem" }}>
                Your project has been registered for the Science Fair SY 2025-2026.
              </p>
              <div className="reg-number-wrap">
                <div className="lbl" style={{ marginBottom:".35rem" }}>Your Registration Number</div>
                <div className="reg-number-display">{regSuccess.regNumber}</div>
                <div style={{ fontSize:".82rem", color:"var(--dim)", marginTop:".35rem" }}>
                  Write this number on your project trifold board.
                </div>
              </div>
              <div style={{ background:"var(--s1)", border:"1px solid var(--bd)", borderRadius:10, padding:"1rem", marginBottom:"1rem", textAlign:"left" }}>
                <div className="lbl" style={{ marginBottom:".4rem" }}>Project Summary</div>
                <div style={{ fontWeight:600, marginBottom:".2rem" }}>{regSuccess.projectTitle}</div>
                <div style={{ fontSize:".88rem", color:"var(--dim)" }}>{regSuccess.category}</div>
              </div>
              <div className="val-tie-alert" style={{ marginBottom:"1rem" }}>
                <span style={{ fontSize:"1.1rem" }}>📧</span>
                <span style={{ fontSize:".9rem" }}>A confirmation email has been sent to your registered email address.</span>
              </div>
              <p style={{ fontSize:".82rem", color:"var(--dim)" }}>
                Bring your trifold board with registration number <strong style={{ fontFamily:"var(--ff-m)" }}>{regSuccess.regNumber}</strong> to the science fair venue on event day.
              </p>
            </div>
          </div>
        </div>
      </div>
    );

    return (
      <div className="app"><style>{CSS}</style>
        <div className="reg-wrap">
          <div className="reg-inner">
            <div className="reg-hero">
              <img src="/logo.png" alt="Dishchiibikoh Community School" style={{ width:72, marginBottom:".75rem" }} />
              <div className="school-name">Dishchiibikoh <span>Community School</span></div>
              <h1 style={{ fontFamily:"var(--ff-d)", fontSize:"clamp(1.4rem,4vw,1.9rem)", color:"var(--navy)", margin:"1rem 0 .4rem" }}>Science Fair Registration</h1>
              <p style={{ color:"var(--dim)", fontSize:".9rem" }}>SY 2025-2026 · Required fields are marked <span style={{ color:"var(--red)" }}>*</span></p>
            </div>

            {/* Instructions */}
            <div className="reg-instructions">
              <div className="reg-instructions-title">📋 Online Registration Instructions</div>
              <ol>
                <li>Fill out the online registration form and provide all required details <strong>accurately</strong>.</li>
                <li>Complete all fields marked with an <strong style={{ color:"var(--red)" }}>asterisk (*)</strong> as they are required in order to proceed.</li>
                <li><strong>Review all information carefully</strong> before submitting the form.</li>
                <li>If a student does not have an email address, you may <em>use the teacher's email instead</em>.</li>
                <li>Ensure that the email address is <strong>written correctly</strong> to avoid any errors.</li>
                <li>After submitting, you will receive an <strong>automatic confirmation email</strong> containing the student's registration number and assigned category.</li>
                <li><strong>Save or keep the confirmation message</strong> for your records.</li>
                <li>If you have any questions or need assistance, please feel free to ask.</li>
              </ol>
            </div>

            {regFormErr && <div className="locked-banner" style={{ marginBottom:"1rem" }}>⚠ {regFormErr}</div>}

            {/* Section 1 — Student Information */}
            <div className="reg-section">
              <div className="reg-section-title">👤 Student Information</div>
              <div className="reg-field">
                <div className="lbl">Full Name <span className="reg-req">*</span></div>
                <input type="text" placeholder="e.g. Maria Santos" value={regForm.studentName}
                  onChange={e => setRegForm(p => ({...p, studentName: e.target.value}))} />
              </div>
              <div className="reg-field">
                <div className="lbl">Grade Level <span className="reg-req">*</span></div>
                <input type="text" placeholder="e.g. 7, 10, 12" value={regForm.gradeLevel}
                  onChange={e => setRegForm(p => ({...p, gradeLevel: e.target.value}))} />
              </div>
              <div className="reg-field">
                <div className="lbl">Division <span className="reg-req">*</span></div>
                <div className="reg-radio-group">
                  {DIVISIONS.map(d => (
                    <label key={d} className={`reg-radio-item${regForm.division === d ? " sel" : ""}`}>
                      <input type="radio" name="division" value={d} checked={regForm.division === d}
                        onChange={() => setRegForm(p => ({...p, division: d}))} />
                      {d}
                    </label>
                  ))}
                </div>
              </div>
              <div className="reg-field">
                <div className="lbl">School Name <span className="reg-req">*</span></div>
                <input type="text" placeholder="e.g. Dishchiibikoh Community School" value={regForm.schoolName}
                  onChange={e => setRegForm(p => ({...p, schoolName: e.target.value}))} />
              </div>
              <div className="reg-field">
                <div className="lbl">Student Email Address <span className="reg-req">*</span></div>
                <input type="email" placeholder="yourname@dishchiibikoh.org" value={regForm.studentEmail}
                  onChange={e => setRegForm(p => ({...p, studentEmail: e.target.value}))} />
                <div style={{ fontSize:".78rem", color:"var(--dim)", marginTop:".3rem" }}>
                  Use your school email (e.g. yourname@dishchiibikoh.org). If you don't have one, use your teacher's email address.
                </div>
              </div>
              <div className="reg-field">
                <div className="lbl">Confirm Email Address <span className="reg-req">*</span></div>
                <input type="email" placeholder="Re-enter email address" value={regForm.emailConfirm}
                  onChange={e => setRegForm(p => ({...p, emailConfirm: e.target.value}))}
                  onPaste={e => e.preventDefault()} />
                {regForm.emailConfirm && regForm.studentEmail && (
                  <div style={{ fontSize:".78rem", marginTop:".3rem",
                    color: regForm.studentEmail.trim().toLowerCase() === regForm.emailConfirm.trim().toLowerCase()
                      ? "var(--green)" : "var(--red)" }}>
                    {regForm.studentEmail.trim().toLowerCase() === regForm.emailConfirm.trim().toLowerCase()
                      ? "✓ Emails match" : "✗ Emails do not match"}
                  </div>
                )}
              </div>
              <div className="reg-field">
                <div className="lbl">Contact Number</div>
                <input type="text" placeholder="e.g. 09XX-XXX-XXXX" value={regForm.contactNumber}
                  onChange={e => setRegForm(p => ({...p, contactNumber: e.target.value}))} />
              </div>
            </div>

            {/* Section 2 — Project Information */}
            <div className="reg-section">
              <div className="reg-section-title">🔬 Project Information</div>
              <div className="reg-field">
                <div className="lbl">Project Title <span className="reg-req">*</span></div>
                <input type="text" placeholder="Enter your project title" value={regForm.projectTitle}
                  onChange={e => setRegForm(p => ({...p, projectTitle: e.target.value}))} />
              </div>
              <div className="reg-field">
                <div className="lbl">Category <span className="reg-req">*</span></div>
                <div className="reg-radio-group">
                  {catNames().map(c => (
                    <label key={c} className={`reg-radio-item${regForm.category === c ? " sel" : ""}`}>
                      <input type="radio" name="category" value={c} checked={regForm.category === c}
                        onChange={() => setRegForm(p => ({...p, category: c}))} />
                      {c}
                    </label>
                  ))}
                </div>
              </div>
              <div className="reg-field">
                <div className="lbl">Type of Project <span className="reg-req">*</span></div>
                <div className="reg-radio-group">
                  {["Individual","Group"].map(t => (
                    <label key={t} className={`reg-radio-item${regForm.projectType === t ? " sel" : ""}`}>
                      <input type="radio" name="projectType" value={t} checked={regForm.projectType === t}
                        onChange={() => setRegForm(p => ({...p, projectType: t}))} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              {regForm.projectType === "Group" && (
                <div className="reg-field">
                  <div className="lbl">Group Members — one per line (name and grade)</div>
                  <textarea rows={4} placeholder={"Maria Santos, Grade 9\nJuan Dela Cruz, Grade 9"}
                    value={regForm.groupMembers}
                    onChange={e => setRegForm(p => ({...p, groupMembers: e.target.value}))} />
                </div>
              )}
            </div>

            {/* Section 3 — Teacher/Advisor */}
            <div className="reg-section">
              <div className="reg-section-title">👩‍🏫 Teacher / Advisor Information</div>
              <div className="reg-field">
                <div className="lbl">Teacher/Advisor Name</div>
                <input type="text" placeholder="e.g. Ms. Reyes" value={regForm.advisorName}
                  onChange={e => setRegForm(p => ({...p, advisorName: e.target.value}))} />
              </div>
              <div className="reg-field">
                <div className="lbl">Teacher/Advisor Email</div>
                <input type="email" placeholder="advisor@dishchiibikoh.org" value={regForm.advisorEmail}
                  onChange={e => setRegForm(p => ({...p, advisorEmail: e.target.value}))} />
              </div>
              <div className="reg-field">
                <div className="lbl">School/Department</div>
                <input type="text" placeholder="e.g. Science Department" value={regForm.schoolDepartment}
                  onChange={e => setRegForm(p => ({...p, schoolDepartment: e.target.value}))} />
              </div>
            </div>

            {/* Section 4 — Project Details */}
            <div className="reg-section">
              <div className="reg-section-title">📄 Project Details</div>
              <div className="reg-field">
                <div className="lbl">Brief Project Description (2–3 sentences)</div>
                <textarea rows={3} placeholder="Describe your project briefly…"
                  value={regForm.description}
                  onChange={e => setRegForm(p => ({...p, description: e.target.value}))} />
              </div>
              <div className="reg-field">
                <div className="lbl">Research Question or Problem Statement</div>
                <textarea rows={2} placeholder="What question are you trying to answer?"
                  value={regForm.researchQuestion}
                  onChange={e => setRegForm(p => ({...p, researchQuestion: e.target.value}))} />
              </div>
              <div className="reg-field">
                <div className="lbl">Hypothesis (if applicable)</div>
                <textarea rows={2} placeholder="If [this], then [that] because [reason]…"
                  value={regForm.hypothesis}
                  onChange={e => setRegForm(p => ({...p, hypothesis: e.target.value}))} />
              </div>
            </div>

            {/* Section 5 — Logistics */}
            <div className="reg-section">
              <div className="reg-section-title">🏗️ Logistics & Submission</div>
              <div className="reg-field">
                <div className="lbl">Do you require electricity for your display?</div>
                <div className="reg-radio-group">
                  {[{v:true,l:"Yes"},{v:false,l:"No"}].map(opt => (
                    <label key={opt.l} className={`reg-radio-item${regForm.needsElectricity === opt.v ? " sel" : ""}`}>
                      <input type="radio" name="needsElectricity" checked={regForm.needsElectricity === opt.v}
                        onChange={() => setRegForm(p => ({...p, needsElectricity: opt.v}))} />
                      {opt.l}
                    </label>
                  ))}
                </div>
              </div>
              <div className="reg-field">
                <div className="lbl">Do you need special equipment or space?</div>
                <input type="text" placeholder="Describe any special requirements (leave blank if none)"
                  value={regForm.specialEquipment}
                  onChange={e => setRegForm(p => ({...p, specialEquipment: e.target.value}))} />
              </div>
              <div className="reg-field">
                <div className="lbl">Will you bring a trifold board?</div>
                <div className="reg-radio-group">
                  {[{v:true,l:"Yes"},{v:false,l:"No"}].map(opt => (
                    <label key={opt.l} className={`reg-radio-item${regForm.hasTrifold === opt.v ? " sel" : ""}`}>
                      <input type="radio" name="hasTrifold" checked={regForm.hasTrifold === opt.v}
                        onChange={() => setRegForm(p => ({...p, hasTrifold: opt.v}))} />
                      {opt.l}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 6 — Consent */}
            <div className="reg-section">
              <div className="reg-section-title">✅ Consent & Agreement</div>
              <div className="reg-field">
                <label className="reg-check-item">
                  <input type="checkbox" checked={regForm.isOriginalWork}
                    onChange={e => setRegForm(p => ({...p, isOriginalWork: e.target.checked}))} />
                  <span className="reg-check-label">
                    I confirm that this project is my/our original work. <span className="reg-req">*</span>
                  </span>
                </label>
              </div>
              <div className="reg-field">
                <label className="reg-check-item">
                  <input type="checkbox" checked={regForm.agreesToRules}
                    onChange={e => setRegForm(p => ({...p, agreesToRules: e.target.checked}))} />
                  <span className="reg-check-label">
                    I agree to follow all science fair rules and guidelines. <span className="reg-req">*</span>
                  </span>
                </label>
              </div>
              <div className="reg-field">
                <div className="lbl">Parent/Guardian Name</div>
                <input type="text" placeholder="Full name of parent or guardian" value={regForm.guardianName}
                  onChange={e => setRegForm(p => ({...p, guardianName: e.target.value}))} />
              </div>
              <div className="reg-field">
                <div className="lbl">Parent/Guardian Signature (type full name)</div>
                <input type="text" placeholder="Type full name as digital signature" value={regForm.guardianSignature}
                  onChange={e => setRegForm(p => ({...p, guardianSignature: e.target.value}))} />
              </div>
            </div>

            {regFormErr && <div className="locked-banner" style={{ marginBottom:"1rem" }}>⚠ {regFormErr}</div>}
            <p style={{ fontSize:".82rem", color:"var(--dim)", textAlign:"center", marginBottom:".75rem" }}>
              Please review all information before submitting. You cannot edit your registration after submission.
            </p>
            <button className="btn" onClick={handleRegSubmit}
              disabled={regSubmitting || !regForm.isOriginalWork || !regForm.agreesToRules}>
              {regSubmitting ? "Submitting…" : "Submit Registration →"}
            </button>
            <p style={{ textAlign:"center", fontSize:".75rem", color:"var(--dim)", marginTop:".75rem", marginBottom:"2rem" }}>
              After submitting, you will receive a registration number and a confirmation email.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* SCHOOL SELECT — no slug in URL */
  if (view === "school-select") return (
    <div className="app mkt-page"><style>{CSS}</style>{backdrop}
      <div className="glow" />

      {/* NAV */}
      <nav className="mkt-nav">
        <div className="mkt-nav-brand">
          <span className="mkt-ico">⚗️</span> Science Fair Judging
        </div>
        <button className="btn sm" onClick={() => setView("school-register")}>Register Free →</button>
      </nav>

      {/* HERO */}
      <div className="mkt-hero">
        <div className="mkt-hero-badge">Free for schools</div>
        <h1 className="mkt-h1">Run your science fair,<br /><span>fully digital.</span></h1>
        <p className="mkt-hero-sub">
          From project scoring to final results — one platform built for judges on tablets.
          Works offline. Real-time sync. No spreadsheets.
        </p>
        <div className="mkt-hero-ctas">
          <button className="btn" style={{ width:"auto", padding:".85rem 1.75rem" }} onClick={() => setView("school-register")}>
            Register your school →
          </button>
        </div>
        <div className="mkt-slug-wrap">
          <div className="mkt-slug-label">Already registered? Go to your school</div>
          <div className="mkt-slug-row">
            <span className="mkt-slug-pre">{window.location.origin}/s/</span>
            <input
              type="text"
              className="mkt-slug-field"
              placeholder="your-school-slug"
              value={schoolForm.slug}
              onChange={e => setSchoolForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"") }))}
              onKeyDown={e => { if (e.key === "Enter" && schoolForm.slug.trim()) window.location.href = `/s/${schoolForm.slug.trim()}`; }}
            />
            <button className="mkt-slug-go" onClick={() => { if (schoolForm.slug.trim()) window.location.href = `/s/${schoolForm.slug.trim()}`; }}>Go →</button>
          </div>
        </div>
      </div>

      <hr className="mkt-divider" />

      {/* HOW IT WORKS */}
      <div className="mkt-section">
        <div className="mkt-section-title">How it works</div>
        <div className="mkt-section-sub">Set up your fair in minutes, run it with confidence.</div>
        <div className="mkt-steps">
          <div className="mkt-step">
            <div className="mkt-step-num">Step 1</div>
            <div className="mkt-step-ico">🏫</div>
            <h3>Register your school</h3>
            <p>Create a free account. Your school gets its own private URL and admin dashboard instantly.</p>
          </div>
          <div className="mkt-step">
            <div className="mkt-step-num">Step 2</div>
            <div className="mkt-step-ico">📋</div>
            <h3>Set up your event</h3>
            <p>Add projects, configure judge slots, and customize your scoring rubric — all from the admin panel.</p>
          </div>
          <div className="mkt-step">
            <div className="mkt-step-num">Step 3</div>
            <div className="mkt-step-ico">🏆</div>
            <h3>Score and share results</h3>
            <p>Judges score on any device. Averages calculate automatically. Share a live results link when done.</p>
          </div>
        </div>
      </div>

      <hr className="mkt-divider" />

      {/* FEATURES */}
      <div className="mkt-section">
        <div className="mkt-section-title">Everything you need</div>
        <div className="mkt-section-sub">Built for real science fairs, tested in the field.</div>
        <div className="mkt-feats">
          <div className="mkt-feat">
            <div className="mkt-feat-ico">📡</div>
            <div>
              <h4>Real-time sync</h4>
              <p>All judges see live score updates. The admin dashboard refreshes automatically — no manual refresh needed.</p>
            </div>
          </div>
          <div className="mkt-feat">
            <div className="mkt-feat-ico">📱</div>
            <div>
              <h4>Offline-ready PWA</h4>
              <p>Judges can score without internet. Scores queue locally and sync the moment connection returns.</p>
            </div>
          </div>
          <div className="mkt-feat">
            <div className="mkt-feat-ico">📊</div>
            <div>
              <h4>Smart results workflow</h4>
              <p>Automatic averages, tie detection, deliberation workflow, and award assignments — all built in.</p>
            </div>
          </div>
          <div className="mkt-feat">
            <div className="mkt-feat-ico">🔒</div>
            <div>
              <h4>Secure by design</h4>
              <p>PIN-gated admin access, per-judge validation, full audit logs, and isolated data per school.</p>
            </div>
          </div>
          <div className="mkt-feat">
            <div className="mkt-feat-ico">📐</div>
            <div>
              <h4>Custom rubrics</h4>
              <p>Start with the Northeast AZ Regional scoring sheet or build your own criteria from scratch.</p>
            </div>
          </div>
          <div className="mkt-feat">
            <div className="mkt-feat-ico">🎓</div>
            <div>
              <h4>Student registration</h4>
              <p>Share registration links with students. Submissions are linked to projects automatically.</p>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM CTA */}
      <div className="mkt-bottom">
        <h2>Ready to go digital?</h2>
        <p>Free for schools. No credit card required. Set up in minutes.</p>
        <button className="mkt-bottom-btn" onClick={() => setView("school-register")}>
          Create school account →
        </button>
      </div>
    </div>
  );

  /* SCHOOL REGISTER */
  if (view === "school-register") return (
    <div className="app"><style>{CSS}</style>{backdrop}
      <div className="center"><div className="inner">
        <button className="back" onClick={() => setView("school-select")}>← Back</button>
        <div className="card">
          <div style={{ textAlign:"center", marginBottom:"1.5rem" }}>
            <div style={{ fontSize:"2.5rem", marginBottom:".5rem" }}>🏫</div>
            <h2 style={{ fontFamily:"var(--ff-d)", fontSize:"1.5rem", color:"var(--navy)", marginBottom:".4rem" }}>Register Your School</h2>
            <p style={{ color:"var(--dim)", fontSize:".92rem" }}>Set up a free science fair account for your school.</p>
          </div>
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">School Name</div>
            <input type="text" placeholder="Dishchiibikoh Community School" value={schoolForm.name}
              onChange={e => {
                const n = e.target.value;
                // ≤50 chars, no leading/trailing dash — create_school() enforces the same rule.
                const slug = n.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0, 50).replace(/-+$/,"");
                setSchoolForm(f => ({ ...f, name: n, slug }));
              }} />
          </div>
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">School URL</div>
            {/* type="text" matters: the input styles are keyed on it. min-width:0 + the
                ellipsis keep the row inside the card on phones. */}
            <div style={{ display:"flex", minWidth:0 }}>
              <span style={{ padding:".75rem .6rem .75rem .9rem", background:"var(--s2)", border:"1.5px solid var(--bd)", borderRadius:"10px 0 0 10px", color:"var(--dim)", fontSize:".9rem", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"55%", flexShrink:1 }}>
                {window.location.host}/s/
              </span>
              <input type="text" style={{ borderRadius:"0 10px 10px 0", borderLeft:"none", flex:1, minWidth:0 }}
                placeholder="my-school" maxLength={50}
                value={schoolForm.slug}
                onChange={e => setSchoolForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"") }))} />
            </div>
          </div>
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">Admin Email</div>
            <input type="email" placeholder="admin@myschool.edu" value={schoolForm.email}
              onChange={e => setSchoolForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">Password</div>
            <input type="password" placeholder="At least 8 characters" value={schoolForm.password}
              onChange={e => setSchoolForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">Confirm Password</div>
            <input type="password" placeholder="Re-enter password" value={schoolForm.confirmPass}
              onChange={e => setSchoolForm(f => ({ ...f, confirmPass: e.target.value }))} />
          </div>
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">Admin PIN</div>
            <input type="password" inputMode="numeric" placeholder="4-8 digits" value={schoolForm.adminPin}
              onChange={e => setSchoolForm(f => ({ ...f, adminPin: e.target.value.replace(/D/g,"").slice(0,8) }))} />
            <div style={{ fontSize:".76rem", color:"var(--dim)", marginTop:".3rem", lineHeight:1.45 }}>
              Separate from your password. Guards <strong>Reset All Data</strong>, the IT Logs tab and
              judge device transfers. Stored encrypted (hashed) — nobody, including us, can read it back,
              so keep a note of it.
            </div>
          </div>
          <div style={{ marginBottom:"1.25rem" }}>
            <div className="lbl">Confirm Admin PIN</div>
            <input type="password" inputMode="numeric" placeholder="Re-enter PIN" value={schoolForm.confirmPin}
              onChange={e => setSchoolForm(f => ({ ...f, confirmPin: e.target.value.replace(/D/g,"").slice(0,8) }))} />
          </div>
          {schoolFormErr && <div className="err" style={{ marginBottom:"1rem" }}>⚠ {schoolFormErr}</div>}
          {schoolCreatedNeedsConfirm ? (
            <div className="scan-msg ok" style={{ fontSize:".9rem", padding:"1rem" }}>
              <div style={{ fontWeight:700, marginBottom:".35rem" }}>✅ School created</div>
              <div>Check <b>{schoolForm.email}</b> and click the confirmation link. Then open your school&apos;s page and sign in as admin:</div>
              <div style={{ fontFamily:"var(--ff-m)", margin:".5rem 0", wordBreak:"break-all" }}>
                {window.location.origin}/s/{schoolCreatedNeedsConfirm}
              </div>
              <a className="btn sm" style={{ width:"auto", display:"inline-block", textDecoration:"none" }}
                href={`/s/${schoolCreatedNeedsConfirm}`}>Go to my school page →</a>
            </div>
          ) : (
          <button className="btn" disabled={schoolRegistering} onClick={async () => {
            const { name, slug, email, password, confirmPass, adminPin, confirmPin } = schoolForm;
            if (!name.trim() || !slug.trim() || !email.trim() || !password) {
              setSchoolFormErr("Please fill in all fields."); return;
            }
            if (password !== confirmPass) {
              setSchoolFormErr("Passwords do not match."); return;
            }
            if (password.length < 8) {
              setSchoolFormErr("Password must be at least 8 characters."); return;
            }
            // (Was /^d{4,8}$/ — missing backslash — which rejected every numeric PIN, so no
            // school could sign up from 2026-09-25 to 2026-10-05.)
            if (!/^\d{4,8}$/.test(adminPin)) {
              setSchoolFormErr("Admin PIN must be 4-8 digits."); return;
            }
            if (adminPin !== confirmPin) {
              setSchoolFormErr("Admin PIN and confirmation do not match."); return;
            }
            if (/^(\d)\1+$/.test(adminPin) || adminPin === "1234" || adminPin === "12345678") {
              setSchoolFormErr("Choose a less predictable PIN (not 0000, 1111, 1234, ...)."); return;
            }
            const cleanSlug = slug.trim().toLowerCase();
            if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(cleanSlug)) {
              setSchoolFormErr("School URL: 3–50 lowercase letters, numbers or dashes (not starting/ending with a dash)."); return;
            }
            setSchoolRegistering(true); setSchoolFormErr("");
            // 0. Check the URL BEFORE creating an account, so a taken URL never leaves an
            //    orphan login behind.
            const { data: taken } = await supabase.from("schools").select("id").eq("slug", cleanSlug).limit(1);
            if (taken && taken.length) {
              setSchoolFormErr("That school URL is already taken. Choose another."); setSchoolRegistering(false); return;
            }
            // 1. Create the login (or reuse the one from a failed earlier attempt). With
            //    "Confirm email" on, signUp() returns a user but NO session; create_school()
            //    handles that case.
            let user, hasSession;
            if (pendingSignup && pendingSignup.email === email.trim().toLowerCase()) {
              user = { id: pendingSignup.userId }; hasSession = pendingSignup.hasSession;
            } else {
              // emailRedirectTo: the confirmation link lands on the new school's page (and signs
              // the admin in). Without it Supabase uses its "Site URL", which defaulted to
              // http://localhost:3000 — the first real school landed on a dead page. The URL must
              // be allowed in Supabase → Authentication → URL Configuration (https://qritiko.com/**).
              const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
                email: email.trim(), password,
                options: { emailRedirectTo: `${window.location.origin}/s/${cleanSlug}` },
              });
              if (signUpErr) { setSchoolFormErr(signUpErr.message); setSchoolRegistering(false); return; }
              user = signUpData?.user;
              hasSession = !!signUpData?.session;
              if (!user) { setSchoolFormErr("Sign-up did not return a user. Please try again."); setSchoolRegistering(false); return; }
              setPendingSignup({ email: email.trim().toLowerCase(), userId: user.id, hasSession });
            }
            // 2. Create the school, its owner link, settings, departments and rubric in ONE
            //    server-side transaction (migration 2026-10c). Direct inserts into
            //    schools / school_admins are closed: they let anyone make themselves admin
            //    of any school. Works with or without a session (email confirmation).
            const { data: school, error: schoolErr } = await supabase.rpc("create_school", {
              p_user_id:     user.id,
              p_name:        name.trim(),
              p_slug:        cleanSlug,
              p_invite_code: genToken().slice(0,8).toUpperCase(),
              p_admin_pin:   adminPin,
              p_rubric:      DEFAULT_RUBRIC,
            });
            setSchoolRegistering(false);
            if (schoolErr || !school?.slug) {
              // P0001 messages are written for the person signing up (slug taken, weak PIN…).
              setSchoolFormErr(schoolErr?.code === "P0001" ? schoolErr.message
                : `Could not create the school (${schoolErr?.message || "no result"}). Please try again.`);
              return;
            }
            setPendingSignup(null);
            if (!hasSession) {
              setSchoolFormErr("");
              setSchoolCreatedNeedsConfirm(school.slug);
              return;
            }
            window.location.href = `/s/${school.slug}`;
          }}>
            {schoolRegistering ? "Creating account…" : "Create School Account →"}
          </button>
          )}
        </div>
      </div></div>
    </div>
  );

  /* ADMIN LOGIN */
  if (view === "admin-login") return (
    <div className="app"><style>{CSS}</style>{backdrop}
      <div className="center"><div className="inner">
        <button className="back" onClick={() => { setView("landing"); setAdminErr(""); setAdminPass(""); setAdminEmail(""); }}>← Back</button>
        <div className="card">
          <div style={{ textAlign:"center", marginBottom:"1.5rem" }}>
            <div style={{ fontSize:"2.5rem", marginBottom:".5rem" }}>🛡️</div>
            <h2 style={{ fontFamily:"var(--ff-d)", fontSize:"1.5rem", marginBottom:".4rem", color:"var(--navy)" }}>Admin Access</h2>
            <p style={{ color:"var(--dim)", fontSize:".95rem" }}>
              {currentSchool ? currentSchool.name : "Restricted to authorized science fair coordinators."}
            </p>
          </div>
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">Email</div>
            <input type="email" placeholder="admin@yourschool.edu" value={adminEmail}
              onChange={e => { setAdminEmail(e.target.value); setAdminErr(""); }}
              onKeyDown={e => e.key==="Enter" && handleAdminLogin()} />
          </div>
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">Password</div>
            <input type="password" placeholder="Enter admin password" value={adminPass}
              onChange={e => { setAdminPass(e.target.value); setAdminErr(""); }}
              onKeyDown={e => e.key==="Enter" && handleAdminLogin()} />
            {adminErr && <div className="err">⚠ {adminErr}</div>}
          </div>
          <button className="btn" onClick={handleAdminLogin}
            disabled={!!(adminLockoutUntil && Date.now() < adminLockoutUntil)}>
            Access Dashboard →
          </button>
        </div>
      </div></div>
    </div>
  );

  /* ADMIN DASHBOARD */
  if (view === "admin-home") {
    const anomalies  = getAnomalies();
    const completion = Math.round((totalScored() / possible()) * 100) || 0;

    const navItems = [
      { id:"overview", ico:"📊", label:"Overview"     },
      { id:"setup",    ico:"⚙️", label:"Setup"        },
      { id:"judges",   ico:"👥", label:"Judges"       },
      { id:"projects", ico:"🔬", label:"Projects"     },
      { id:"activity", ico:"📋", label:"Activity Log" },
      { id:"alerts",   ico:"⚠️", label:`Alerts${anomalies.length?` (${anomalies.length})`:""}`},
      { id:"deliberation", ico:"🤝", label:`Validation${resultsFinalized ? " ✓" : consensusReached() ? " 🟢" : ""}` },
      { id:"share",    ico:"🔗", label:`Share${resultsFinalized ? " 🔗" : ""}` },
      { id:"export",   ico:"📦", label:"Score Export"  },
      { id:"registration", ico:"📝", label:"Registration" },
      { id:"rubric",   ico:"📐", label:"Rubric"        },
      { id:"itlogs",   ico:"🖥️", label:"IT Logs"      },
      { id:"help",     ico:"❓", label:"Help & FAQ"   },
    ];

    return (
      <div className="app"><style>{CSS}</style>{backdrop}
        <div className="admin-wrap">
          <div className="adm-side">
            <div className="adm-brand">⚗️ Admin Panel</div>
            {currentSchool && (
              <div style={{ padding:".4rem 1rem .75rem", fontSize:".78rem", color:"#6b8ab5", fontFamily:"var(--ff-m)", borderBottom:"1px solid #1c2e4a", marginBottom:".25rem" }}>
                {currentSchool.name}
              </div>
            )}
            {navItems.map(n => (
              <div key={n.id} className={`nav-it ${adminTab===n.id?"act":""}`} onClick={() => setAdminTab(n.id)}>
                <span>{n.ico}</span><span>{n.label}</span>
                {n.id==="share" && isLinkLive() && (
                  <span className="badge bg" style={{ marginLeft:"auto", fontSize:".6rem", padding:".1rem .4rem" }}>LIVE</span>
                )}
              </div>
            ))}
            <div style={{ flex:1 }} />
            <div className="nav-it" style={{ color:locked?"#fca5a5":"#86efac" }}
              onClick={handleToggleLock}>
              <span>{locked?"🔒":"🔓"}</span><span>{lockErr ? `⚠ ${lockErr}` : `${locked?"Unlock":"Lock"} Judging`}</span>
            </div>
            <div className="nav-it" onClick={() => setView("landing")}><span>←</span><span>Exit</span></div>
            {session && (
              <div className="nav-it" style={{ color:"#fca5a5" }} onClick={handleAdminLogout}><span>🚪</span><span>Sign Out</span></div>
            )}
            <div className="nav-it reset" onClick={() => { setShowReset(true); setResetPin(""); setResetPinErr(""); setResetDone(false); }}>
              <span>⚠️</span><span>Reset All Data</span>
            </div>
          </div>

          {/* ── RESET MODAL ── */}
          {showReset && (
            <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget){ setShowReset(false); setResetPin(""); setResetPinErr(""); }}}>
              <div className="modal-box">
                {resetDone ? (
                  <>
                    <div className="ico">✅</div>
                    <h2 style={{color:"var(--green)"}}>Reset Complete</h2>
                    <p>All data has been cleared. Returning to dashboard…</p>
                  </>
                ) : (
                  <>
                    <div className="ico">⚠️</div>
                    <h2>Reset All Data?</h2>
                    <p>This will permanently erase all judging data for this session. This cannot be undone.</p>
                    <div className="warn-list">
                      <div>All registered judges removed</div>
                      <div>All submitted scores deleted</div>
                      <div>All deliberation notes removed</div>
                      <div>All final decisions cleared</div>
                      <div>Share link revoked</div>
                      <div>Judging lock reset to open</div>
                    </div>
                    <div style={{background:"var(--green-l)",border:"1px solid #05966920",borderRadius:"10px",
                      padding:".7rem 1.1rem",marginBottom:"1.5rem",textAlign:"left"}}>
                      <div style={{fontSize:".88rem",color:"var(--green)",display:"flex",gap:".4rem"}}>
                        <span>✓</span><span>Activity log is <strong>preserved</strong> for security &amp; review purposes</span>
                      </div>
                    </div>
                    <div className="modal-pin-label">Enter PIN to confirm</div>
                    <div className="modal-pin-dots">
                      {Array.from({ length: Math.max(4, resetPin.length) }, (_, i) => i).map(i => (
                        <div key={i} className={`modal-pin-dot ${resetPin.length > i ? "filled" : ""}`} />
                      ))}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:".25rem"}}>
                      <input
                        type="password"
                        maxLength={8} inputMode="numeric"
                        placeholder="••••"
                        value={resetPin}
                        autoFocus
                        style={{
                          width:"160px", textAlign:"center", letterSpacing:".5em",
                          fontFamily:"var(--ff-m)", fontSize:"1.3rem",
                          background:"var(--bg)", border:`1.5px solid ${resetPinErr?"var(--red)":"var(--bd)"}`,
                          borderRadius:"8px", padding:".8rem 1rem", color:"var(--text)", outline:"none"
                        }}
                        onChange={e => { setResetPin(e.target.value.replace(/\D/g,"").slice(0,8)); setResetPinErr(""); }}
                        onKeyDown={e => { if (e.key === "Enter") submitResetPin(); }}
                      />
                      {resetPinErr && <div style={{color:"var(--red)",fontSize:".8rem",marginTop:".25rem"}}>{resetPinErr}</div>}
                    </div>
                    <div className="modal-btn-row">
                      <button className="btn sec" onClick={() => { setShowReset(false); setResetPin(""); setResetPinErr(""); }}>
                        Cancel
                      </button>
                      <button className="btn danger" disabled={resetPin.length < 4} onClick={submitResetPin}>
                        Reset everything
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── TRANSFER PIN MODAL ── */}
          {removeJudgeAsk && (() => {
            const j = removeJudgeAsk;
            const dept = departments.find(d => d.id === j.department_id);
            const nScores = Object.keys(scores).filter(k => k.startsWith(`${j.id}_`)).length;
            const close = () => { setRemoveJudgeAsk(null); setRemoveJudgePin(""); setRemoveJudgeErr(""); };
            return (
              <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) close(); }}>
                <div className="modal-box">
                  <div className="ico">🗑</div>
                  <h2>Remove {j.alias}?</h2>
                  <p>{j.alias}{dept ? ` (${dept.name})` : ""} will be signed out and their number freed, so the right person can sign in with it.</p>
                  <p style={{marginTop:".5rem",color: nScores ? "var(--red)" : "var(--dim)",fontWeight: nScores ? 600 : 400}}>
                    {nScores
                      ? `This permanently deletes their ${nScores} score${nScores!==1?"s":""}, notes and validation. It cannot be undone.`
                      : "They have not scored anything yet."}
                  </p>
                  <div className="modal-pin-label" style={{marginTop:"1.1rem"}}>Admin PIN</div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:".25rem"}}>
                    <input type="password" maxLength={8} inputMode="numeric" placeholder="••••" autoFocus
                      value={removeJudgePin}
                      style={{ width:"160px", textAlign:"center", letterSpacing:".5em", fontFamily:"var(--ff-m)", fontSize:"1.3rem",
                        background:"var(--bg)", border:`1.5px solid ${removeJudgeErr?"var(--red)":"var(--bd)"}`,
                        borderRadius:"8px", padding:".8rem 1rem", color:"var(--text)", outline:"none" }}
                      onChange={e => { setRemoveJudgePin(e.target.value.replace(/\D/g,"").slice(0,8)); setRemoveJudgeErr(""); }}
                      onKeyDown={e => { if (e.key === "Enter" && removeJudgePin.length >= 4) confirmRemoveJudge(); }} />
                    {removeJudgeErr && <div style={{color:"var(--red)",fontSize:".8rem",marginTop:".25rem",textAlign:"center"}}>{removeJudgeErr}</div>}
                  </div>
                  <div className="modal-btn-row">
                    <button className="btn sec" onClick={close}>Cancel</button>
                    <button className="btn danger" disabled={removeJudgePin.length < 4} onClick={confirmRemoveJudge}>
                      Remove {j.alias}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {showTransferPinModal && (
            <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget){ setShowTransferPinModal(false); setTransferPin(""); setTransferPinErr(""); }}}>
              <div className="modal-box">
                <div className="ico">🔐</div>
                <h2>Approve Device Transfer</h2>
                <p>Enter the IT PIN to approve a one-time device transfer for <strong>{transferPinAlias}</strong>.</p>
                <p style={{fontSize:".8rem",color:"var(--dim)",marginTop:".4rem"}}>Approval expires in 10 minutes.</p>
                <div className="modal-pin-label" style={{marginTop:"1.25rem"}}>IT PIN</div>
                <div className="modal-pin-dots">
                  {Array.from({ length: Math.max(4, transferPin.length) }, (_, i) => i).map(i => (
                    <div key={i} className={`modal-pin-dot ${transferPin.length > i ? "filled" : ""}`} />
                  ))}
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:".25rem"}}>
                  <input
                    type="password"
                    maxLength={8} inputMode="numeric"
                    placeholder="••••"
                    value={transferPin}
                    autoFocus
                    style={{
                      width:"160px", textAlign:"center", letterSpacing:".5em",
                      fontFamily:"var(--ff-m)", fontSize:"1.3rem",
                      background:"var(--bg)", border:`1.5px solid ${transferPinErr?"var(--red)":"var(--bd)"}`,
                      borderRadius:"8px", padding:".8rem 1rem", color:"var(--text)", outline:"none"
                    }}
                    onChange={e => { setTransferPin(e.target.value.replace(/\D/g,"").slice(0,8)); setTransferPinErr(""); }}
                    onKeyDown={e => { if (e.key === "Enter" && transferPin.length >= 4) confirmTransfer(); }}
                  />
                  {transferPinErr && <div style={{color:"var(--red)",fontSize:".8rem",marginTop:".25rem"}}>{transferPinErr}</div>}
                </div>
                <div className="modal-btn-row">
                  <button className="btn sec" onClick={() => { setShowTransferPinModal(false); setTransferPin(""); setTransferPinErr(""); }}>
                    Cancel
                  </button>
                  <button className="btn" disabled={transferPin.length < 4} onClick={confirmTransfer}>
                    Approve transfer
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── DELETE REGISTRATION SUBMISSION MODAL ── */}
          {deleteRegSub && (
            <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) setDeleteRegSub(null); }}>
              <div className="modal-box">
                <div className="ico">🗑️</div>
                <h2>Delete Registration?</h2>
                <p>Remove <strong>{deleteRegSub.reg_number}</strong> — <strong>{deleteRegSub.student_name}</strong> from the submissions log?</p>
                <p style={{ color:"var(--dim)", fontSize:".85rem", marginTop:".5rem" }}>This only removes the registration record. The project entry is not affected.</p>
                <p style={{ color:"var(--red)", fontSize:".85rem", marginTop:".25rem" }}>This cannot be undone.</p>
                <div className="modal-btn-row" style={{ marginTop:"1.5rem" }}>
                  <button className="btn sec" onClick={() => setDeleteRegSub(null)}>Cancel</button>
                  <button className="btn danger sm" style={{ width:"auto" }} onClick={() => { deleteRegSubmission(deleteRegSub); setDeleteRegSub(null); }}>Delete</button>
                </div>
              </div>
            </div>
          )}

          {/* ── DELETE PROJECT MODAL ── */}
          {showDeleteConfirm && deleteProjectId && (() => {
            const proj = projects.find(p => p.id === deleteProjectId);
            return (
              <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget){ setShowDeleteConfirm(false); setDeleteProjectId(null); }}}>
                <div className="modal-box">
                  <div className="ico">🗑️</div>
                  <h2>Remove Project?</h2>
                  <p>Remove <strong>"{proj?.title}"</strong> and all its scores, deliberation notes, and decisions?</p>
                  <p style={{color:"var(--red)",fontSize:".85rem",marginTop:".5rem"}}>This cannot be undone.</p>
                  <div className="modal-btn-row" style={{marginTop:"1.5rem"}}>
                    <button className="btn sec" onClick={() => { setShowDeleteConfirm(false); setDeleteProjectId(null); }}>Cancel</button>
                    <button className="btn danger sm" style={{width:"auto"}} onClick={() => { removeProject(deleteProjectId); setShowDeleteConfirm(false); setDeleteProjectId(null); }}>Remove</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Setup tab: delete a department / category. Never window.confirm (rule 36). */}
          {setupConfirm && (
            <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) setSetupConfirm(null); }}>
              <div className="modal-box">
                <div className="ico">🗑️</div>
                <h2>Delete {setupConfirm.kind === "dept" ? "Department" : "Category"}?</h2>
                <p>Delete <strong>"{setupConfirm.name}"</strong>?</p>
                {setupConfirm.kind === "cat" && setupConfirm.used > 0 && (
                  <p style={{color:"var(--dim)",fontSize:".85rem",marginTop:".5rem"}}>
                    {setupConfirm.used} project{setupConfirm.used!==1?"s":""} already use this category.
                    They keep it as their label — only the choice is removed from the dropdowns.
                  </p>
                )}
                {setupConfirm.kind === "cat" && setupConfirm.used === 0 && (
                  <p style={{color:"var(--dim)",fontSize:".85rem",marginTop:".5rem"}}>No projects use it.</p>
                )}
                {setupConfirm.kind === "dept" && (
                  <p style={{color:"var(--dim)",fontSize:".85rem",marginTop:".5rem"}}>
                    It has no projects and no judges, so nothing is lost. You can add it back at any time.
                  </p>
                )}
                <div className="modal-btn-row" style={{marginTop:"1.5rem"}}>
                  <button className="btn sec" onClick={() => setSetupConfirm(null)}>Cancel</button>
                  <button className="btn danger sm" style={{width:"auto"}}
                    onClick={() => {
                      const c = setupConfirm;
                      setSetupConfirm(null);
                      if (c.kind === "dept") deleteDepartment(c.id); else deleteCategory(c.id);
                    }}>Delete</button>
                </div>
              </div>
            </div>
          )}

          <div className="adm-main">

            {/* OVERVIEW */}
            {adminTab==="overview" && <>
              <div className="adm-h1">Dashboard Overview</div>
              <div className="adm-sub">Live judging progress · Science Fair SY 2025-2026</div>
              {locked && <div className="locked-banner">🔒 Judging LOCKED — judges cannot submit scores</div>}

              {/* SETUP GUIDE — the checklist shows only before the first judge registers; the
                  school URL + invite code stay visible always. Until 2026-10-06 the whole card
                  (the only place the invite code is shown) vanished with the first judge, so
                  the admin could no longer invite the rest. */}
              {(
                <div className="setup-guide">
                  <div className="setup-guide-title">{judges.length === 0 ? "🚀 Get started" : "🔑 Judge sign-in details"}</div>
                  <div className="setup-guide-sub">{judges.length === 0
                    ? "Complete these steps before inviting judges to your fair."
                    : "Give judges this address and invite code. Keep the code private — anyone holding it can sign in as a judge."}</div>
                  {judges.length === 0 && <div className="setup-checklist">
                    <div className="setup-item">
                      <div className={`setup-check ${projects.length > 0 ? "done" : "todo"}`}>
                        {projects.length > 0 ? "✓" : ""}
                      </div>
                      <span className={`setup-item-text ${projects.length > 0 ? "done" : ""}`}>
                        Add your projects
                      </span>
                      {projects.length > 0
                        ? <span className="setup-item-note">{projects.length} added</span>
                        : <button className="btn sm" style={{ marginLeft:"auto", width:"auto", padding:".3rem .8rem", fontSize:".8rem" }} onClick={() => setAdminTab("projects")}>
                            Go to Projects →
                          </button>
                      }
                    </div>
                    <div className="setup-item">
                      <div className="setup-check done">✓</div>
                      <span className="setup-item-text done">Admin account created</span>
                    </div>
                    <div className="setup-item">
                      <div className={`setup-check ${projects.length > 0 ? "done" : "todo"}`}>
                        {projects.length > 0 ? "✓" : ""}
                      </div>
                      <span className={`setup-item-text ${projects.length > 0 ? "done" : ""}`}>
                        Share school URL &amp; invite code with judges
                      </span>
                    </div>
                  </div>}
                  <div className="setup-share">
                    <div className="setup-share-lbl">Share with judges</div>
                    <div className="setup-share-row">
                      <span className="setup-share-key">School URL</span>
                      <span className="setup-share-val">{window.location.origin}/s/{currentSchool?.slug}</span>
                      <button
                        className={`setup-copy-btn ${setupCopied === "url" ? "copied" : ""}`}
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/s/${currentSchool?.slug}`);
                          setSetupCopied("url");
                          setTimeout(() => setSetupCopied(null), 2000);
                        }}>
                        {setupCopied === "url" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <div className="setup-share-row">
                      <span className="setup-share-key">Invite Code</span>
                      <span className="setup-share-val">{inviteCode}</span>
                      <button
                        className={`setup-copy-btn ${setupCopied === "code" ? "copied" : ""}`}
                        onClick={() => {
                          navigator.clipboard.writeText(inviteCode || "");
                          setSetupCopied("code");
                          setTimeout(() => setSetupCopied(null), 2000);
                        }}>
                        {setupCopied === "code" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    {schoolNumbering() && (
                      <div className="setup-share-row" style={{alignItems:"flex-start"}}>
                        <span className="setup-share-key">Judge numbers</span>
                        <span className="setup-share-val" style={{whiteSpace:"normal",fontSize:".82rem",lineHeight:1.5}}>
                          {[...departments].sort((a,b)=>a.ord-b.ord).filter(d => d.judge_from != null)
                            .map(d => `${d.name}: ${d.judge_from === d.judge_to ? d.judge_from : `${d.judge_from}–${d.judge_to}`}`).join(" · ")}
                        </span>
                        <button className="setup-copy-btn" onClick={() => setAdminTab("setup")}>Edit</button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Security — change the admin PIN. The PIN is stored as a bcrypt hash
                  and verified server-side, so it can be changed but never read back. */}
              <div className="card" style={{ marginBottom:".9rem" }}>
                <div className="sec-title">🔐 Admin PIN</div>
                <div style={{ fontSize:".84rem", color:"var(--dim)", marginBottom:".85rem", lineHeight:1.5 }}>
                  Guards <strong>Reset All Data</strong>, the IT Logs tab and judge device transfers.
                  Separate from your login password. Change it before every event.
                </div>
                <div className="proj-form-grid">
                  <div>
                    <div className="lbl">Current PIN</div>
                    <input type="password" inputMode="numeric" placeholder="••••" value={pinForm.current}
                      onChange={e => { setPinForm(f => ({...f, current:e.target.value.replace(/D/g,"").slice(0,8)})); setPinFormMsg(null); }} />
                  </div>
                  <div>
                    <div className="lbl">New PIN</div>
                    <input type="password" inputMode="numeric" placeholder="4-8 digits" value={pinForm.next}
                      onChange={e => { setPinForm(f => ({...f, next:e.target.value.replace(/D/g,"").slice(0,8)})); setPinFormMsg(null); }} />
                  </div>
                  <div>
                    <div className="lbl">Confirm New PIN</div>
                    <input type="password" inputMode="numeric" placeholder="Re-enter" value={pinForm.confirm}
                      onChange={e => { setPinForm(f => ({...f, confirm:e.target.value.replace(/D/g,"").slice(0,8)})); setPinFormMsg(null); }} />
                  </div>
                </div>
                {pinFormMsg && (
                  <div style={{ marginTop:".6rem", fontSize:".83rem", color: pinFormMsg.ok ? "var(--green)" : "var(--red)" }}>
                    {pinFormMsg.ok ? "✓ " : "⚠ "}{pinFormMsg.text}
                  </div>
                )}
                <div style={{ marginTop:".75rem" }}>
                  <button className="btn sm" style={{ width:"auto" }}
                    disabled={pinSaving || !pinForm.current || !pinForm.next || !pinForm.confirm}
                    onClick={changeAdminPin}>
                    {pinSaving ? "Updating…" : "Update PIN"}
                  </button>
                </div>
              </div>
              <div className="card" style={{ marginBottom:".9rem" }}>
                <div className="lbl">Sync Health (This Device)</div>
                <div style={{fontSize:".9rem", color: offlineQueue.length > 0 ? "var(--amber)" : "var(--green)", fontWeight:600, marginBottom:".2rem"}}>
                  {offlineQueue.length > 0
                    ? `${offlineQueue.length} local score${offlineQueue.length!==1?"s":""} waiting to sync`
                    : "All local scores synced to Supabase"}
                </div>
                <div className="sync-meta">Last successful sync: {lastSyncAt ? fmtFull(lastSyncAt) : "Not yet"}</div>
              </div>
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-v" style={{color:"var(--navy)"}}>{judges.length}/{departments.reduce((s,d)=>s+d.max_judges,0)}</div><div className="stat-l">Judges</div></div>
                <div className="stat-card"><div className="stat-v" style={{color:"var(--blue)"}}>{projects.length}</div><div className="stat-l">Projects</div></div>
                <div className="stat-card"><div className="stat-v" style={{color:"var(--green)"}}>{totalScored()}</div><div className="stat-l">Scores In</div></div>
                <div className="stat-card">
                  <div className="stat-v" style={{color:completion<50?"var(--red)":completion<80?"var(--amber)":"var(--green)"}}>{completion}%</div>
                  <div className="stat-l">Completion</div>
                </div>
              </div>

              {/* Departments + categories moved to the Setup tab (2026-10-05) */}
              <div className="card" style={{backgroundColor:"var(--s1)",border:"1px solid var(--bd)"}}>
                <div className="lbl" style={{marginBottom:".5rem"}}>Departments &amp; Categories</div>
                <p style={{fontSize:".82rem",color:"var(--dim)",marginBottom:".6rem"}}>
                  {departments.length} department{departments.length!==1?"s":""} · {categories.length} project categor{categories.length!==1?"ies":"y"}.
                  {" "}Add, rename, reorder or set judge slots in the Setup tab.
                </p>
                <button className="btn sec sm" style={{width:"auto"}} onClick={() => setAdminTab("setup")}>⚙️ Open Setup</button>
              </div>

              <div className="card">
                <div style={{display:"flex",justifyContent:"space-between",fontSize:".82rem",marginBottom:".4rem"}}>
                  <span style={{color:"var(--dim)"}}>Overall completion</span>
                  <span style={{fontFamily:"var(--ff-m)"}}>{totalScored()} / {possible()}</span>
                </div>
                <div className="pbar" style={{height:"10px"}}><div className="pfill" style={{width:`${completion}%`,height:"10px"}} /></div>
              </div>

              {/* Per-department leaderboards */}
              {departments.map(dept => {
                if (projects.filter(p => p.department_id === dept.id).length === 0) return null;
                // Comment-only: a participant list, never a ranking. rankedProjects()
                // already excludes these, so without this branch the card would be empty.
                if (dept.scoring_mode === "feedback") {
                  const parts = participantsIn(dept.id);
                  return (
                    <div className="card" key={dept.id}>
                      <div className="sec-title">{dept.name} — Participants <span className="badge bp">Not scored</span></div>
                      <div className="tbl-wrap">
                        <table>
                          <thead><tr><th>#</th><th>Project</th><th>Commendations</th><th>Reviews</th></tr></thead>
                          <tbody>
                            {parts.map(p => (
                              <tr key={p.id}>
                                <td style={{fontFamily:"var(--ff-m)",color:"var(--dim)"}}>{p.num}</td>
                                <td style={{maxWidth:"200px"}}>{p.title}</td>
                                <td style={{fontSize:".82rem"}}>
                                  {p.commendations.length
                                    ? [...new Set(p.commendations)].map(c => <span key={c} className="badge bp" style={{marginRight:".25rem"}}>{c}</span>)
                                    : <span style={{color:"var(--dim)"}}>—</span>}
                                </td>
                                <td>{p.reviews}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                }
                const all = rankedProjects().filter(p => p.department_id === dept.id);
                const scored   = all.filter(p => p.avg !== null);
                const unscored = all.filter(p => p.avg === null);
                return (
                  <div className="card" key={dept.id}>
                    <div className="sec-title">{dept.name} — Project Leaderboard</div>
                    <div className="tbl-wrap">
                      <table>
                        <thead><tr><th>#</th><th>Project</th><th>Category</th><th>Avg</th><th>Reviews</th></tr></thead>
                        <tbody>
                          {scored.map((p,i) => (
                            <tr key={p.id}>
                              <td style={{fontFamily:"var(--ff-m)",color:"var(--dim)"}}>{i+1}</td>
                              <td style={{maxWidth:"200px"}}>{p.title}</td>
                              <td><span className="badge bb">{p.cat}</span></td>
                              <td style={{fontFamily:"var(--ff-m)",color:"var(--navy)"}}>{p.avg}</td>
                              <td>{p.revs}</td>
                            </tr>
                          ))}
                          {unscored.length > 0 && (
                            <tr><td colSpan={5} style={{textAlign:"center",fontSize:".75rem",color:"var(--dim)",padding:".4rem .75rem",background:"var(--s1)",fontFamily:"var(--ff-m)",letterSpacing:".05em"}}>NOT YET SCORED</td></tr>
                          )}
                          {unscored.map(p => (
                            <tr key={p.id} style={{opacity:.5}}>
                              <td style={{fontFamily:"var(--ff-m)",color:"var(--dim)"}}>—</td>
                              <td style={{maxWidth:"200px"}}>{p.title}</td>
                              <td><span className="badge bb">{p.cat}</span></td>
                              <td style={{fontFamily:"var(--ff-m)",color:"var(--dim)"}}>—</td>
                              <td>{p.revs}</td>
                            </tr>
                          ))}
                          {all.length === 0 && (
                            <tr><td colSpan={5} style={{textAlign:"center",fontSize:".8rem",color:"var(--dim)",padding:".75rem"}}>No projects yet</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              {/* Unassigned projects leaderboard (safety net) */}
              {(() => {
                const unassigned = rankedProjects().filter(p => !p.department_id);
                if (!unassigned.length) return null;
                return (
                  <div className="card">
                    <div className="sec-title">Unassigned — Project Leaderboard</div>
                    <div className="tbl-wrap">
                      <table>
                        <thead><tr><th>#</th><th>Project</th><th>Category</th><th>Avg</th><th>Reviews</th></tr></thead>
                        <tbody>
                          {unassigned.map((p,i) => (
                            <tr key={p.id}>
                              <td style={{fontFamily:"var(--ff-m)",color:"var(--dim)"}}>{p.avg ? i+1 : "—"}</td>
                              <td style={{maxWidth:"200px"}}>{p.title}</td>
                              <td><span className="badge bb">{p.cat}</span></td>
                              <td style={{fontFamily:"var(--ff-m)",color:p.avg?"var(--navy)":"var(--dim)"}}>{p.avg ?? "—"}</td>
                              <td>{p.revs}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </>}

            {/* SETUP — departments + project categories */}
            {adminTab==="setup" && <>
              <div className="adm-h1">Setup</div>
              <div className="adm-sub">Departments and project categories for your fair · set these before judging begins</div>

              {setupErr && (
                <div className="card" style={{borderColor:"var(--red)",background:"var(--red-l)",color:"var(--red)",fontSize:".85rem"}}>
                  ⚠ {setupErr}
                </div>
              )}

              {/* ── Departments ── */}
              <div className="card">
                <div className="lbl" style={{marginBottom:".4rem"}}>Departments</div>
                <p style={{fontSize:".82rem",color:"var(--dim)",marginBottom:".9rem"}}>
                  A department is one judging pool. Judges sign in to a department and score every project in it,
                  and results, ties and awards are worked out inside each one — projects in different departments never compete.
                  {schoolNumbering() ? " How many judges each one gets is set on the Judge numbers card below."
                                     : " Max Judges locks once that department's first judge signs in."}
                </p>

                <div className="setup-rows">
                  {[...departments].sort((a,b)=>a.ord-b.ord).map((dept, i, arr) => {
                    const deptCount = judges.filter(j => j.department_id === dept.id).length;
                    const projCount = projects.filter(p => p.department_id === dept.id).length;
                    const judgeLock = deptCount > 0;
                    const inUse     = deptCount > 0 || projCount > 0;
                    const edit      = deptEdits[dept.id];
                    const maxDraft  = deptMaxDrafts[dept.id] ?? String(dept.max_judges);
                    return (
                      <div key={dept.id || dept.name} className="setup-row dept">
                        <div className="setup-ord">
                          <button className="proj-act-btn" disabled={i===0} title="Move up"
                            onClick={() => moveDepartment(dept.id, -1)}>↑</button>
                          <button className="proj-act-btn" disabled={i===arr.length-1} title="Move down"
                            onClick={() => moveDepartment(dept.id, 1)}>↓</button>
                        </div>
                        <div className="setup-main">
                          {edit ? (
                            <div className="setup-edit">
                              <input type="text" value={edit.name} placeholder="Department name"
                                onChange={e => setDeptEdits(p => ({...p, [dept.id]: {...p[dept.id], name: e.target.value}}))} />
                              <input type="text" value={edit.code} placeholder="Code" maxLength={5} className="setup-code-in"
                                onChange={e => setDeptEdits(p => ({...p, [dept.id]: {...p[dept.id], code: e.target.value}}))} />
                              <button className="btn sm" style={{width:"auto"}} onClick={() => saveDepartment(dept.id)}>Save</button>
                              <button className="btn sec sm" style={{width:"auto"}}
                                onClick={() => { setSetupErr(""); setDeptEdits(p => { const n={...p}; delete n[dept.id]; return n; }); }}>Cancel</button>
                            </div>
                          ) : (
                            <>
                              <div className="setup-name">
                                {dept.name}
                                {dept.scoring_mode === "feedback" &&
                                  <span className="badge bp" style={{marginLeft:".4rem"}}>Comments only</span>}
                              </div>
                              <div className="setup-meta">
                                {dept.code && <span className="badge bb">{dept.code}</span>}
                                {" "}{projCount} project{projCount!==1?"s":""} · {deptCount}/{schoolNumbering() ? deptJudgeCount(dept) : dept.max_judges} judge{deptCount!==1?"s":""}
                              </div>
                            </>
                          )}
                        </div>
                        {!edit && (
                          <div className="setup-acts">
                            {schoolNumbering() ? (
                              <span className="setup-maxj" title="Set on the Judge numbers card below">
                                {judgeRangeText(dept)}
                              </span>
                            ) : <span className="setup-maxj">
                              Max judges:{" "}
                              {judgeLock
                                ? <><strong>{dept.max_judges}</strong> <span title="Locked — judges have signed in">🔒</span></>
                                : <>
                                    <input type="number" min="1" max="100" value={maxDraft}
                                      onChange={e => setDeptMaxDrafts(p => ({...p, [dept.id]: e.target.value}))}
                                      onBlur={e => updateDeptMaxJudges(dept.id, e.target.value)}
                                      onKeyDown={e => e.key==="Enter" && updateDeptMaxJudges(dept.id, maxDraft)} />
                                  </>}
                            </span>}
                            <select className="setup-mode" value={dept.scoring_mode || "scored"}
                              title="How this department is judged"
                              onChange={e => updateDeptScoringMode(dept.id, e.target.value)}>
                              <option value="scored">Scored (rubric)</option>
                              <option value="feedback">Comments only</option>
                            </select>
                            <button className="proj-act-btn" title="Rename"
                              onClick={() => { setSetupErr(""); setDeptEdits(p => ({...p, [dept.id]: { name: dept.name, code: dept.code || "" }})); }}>✏️</button>
                            <button className="proj-act-btn del" title={inUse ? "In use — move its projects and judges first" : "Delete"}
                              onClick={() => requestDeleteDepartment(dept.id)}>🗑</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="setup-add">
                  <input type="text" placeholder="New department name" value={newDept.name}
                    onChange={e => setNewDept(p => ({...p, name: e.target.value}))}
                    onKeyDown={e => e.key==="Enter" && addDepartment(newDept.name, newDept.code)} />
                  <input type="text" placeholder="Code" maxLength={5} className="setup-code-in" value={newDept.code}
                    onChange={e => setNewDept(p => ({...p, code: e.target.value}))}
                    onKeyDown={e => e.key==="Enter" && addDepartment(newDept.name, newDept.code)} />
                  <button className="btn sm" style={{width:"auto"}} onClick={() => addDepartment(newDept.name, newDept.code)}>+ Add</button>
                </div>

                <div className="setup-presets">
                  <div className="lbl" style={{marginBottom:".35rem"}}>Or start from a preset</div>
                  <p style={{fontSize:".78rem",color:"var(--dim)",marginBottom:".5rem"}}>
                    A preset only adds the departments you don't have yet — it never deletes. Remove any you don't want afterwards.
                  </p>
                  <div className="setup-preset-grid">
                    {DEPT_PRESETS.map(p => (
                      <button key={p.id} className="setup-preset" onClick={() => applyDeptPreset(p.id)}>
                        <strong>{p.label}</strong>
                        <span>{p.desc}</span>
                        <em>{p.depts.map(d => d.name).join(" · ")}</em>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Judge numbers (migration 2026-10g) ── */}
              {departments.some(d => d.judge_from != null) && (() => {
                const plan    = plannedJudgeRanges();
                const total   = plan.reduce((a, p) => a + p.count, 0);
                const dirty   = Object.keys(judgeCountDrafts).length > 0;
                return (
                  <div className="card">
                    <div className="lbl" style={{marginBottom:".4rem"}}>Judge numbers</div>
                    <select className="setup-mode" aria-label="Judge numbering" style={{marginBottom:".6rem"}} value={judgeNumbering}
                      onChange={e => setJudgeNumberingMode(e.target.value)}>
                      <option value="school">One list for the whole school (recommended)</option>
                      <option value="department">Numbers restart in each department</option>
                    </select>
                    {judgeNumbering === "school" ? (<>
                      <p style={{fontSize:".82rem",color:"var(--dim)",marginBottom:".2rem"}}>
                        Every judge gets one number for the whole school, and the number decides the department —
                        judges type only their number and the invite code. Enter how many judges each department needs;
                        numbers are handed out in department order.
                      </p>
                      <div className="jn-rows">
                        {plan.map(p => {
                          const signedIn = judges.filter(j => j.department_id === p.dept.id).length;
                          return (
                            <div key={p.dept.id || p.dept.name} className="jn-row">
                              <span className="jn-name">{p.dept.name}
                                {signedIn > 0 && <span style={{fontWeight:400,fontSize:".76rem",color:"var(--dim)"}}> · {signedIn} signed in</span>}
                              </span>
                              <input type="number" min="0" max="999" aria-label={`Judges for ${p.dept.name}`}
                                value={judgeCountDrafts[p.dept.id] ?? String(deptJudgeCount(p.dept))}
                                onChange={e => { setSetupErr(""); setJudgeCountDrafts(d => ({...d, [p.dept.id]: e.target.value})); }} />
                              <span className={`jn-range ${p.from == null ? "none" : ""}`}>
                                {p.from == null ? "no judges" : p.from === p.to ? `Judge ${p.from}` : `Judge ${p.from}–${p.to}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{display:"flex",gap:".5rem",alignItems:"center",flexWrap:"wrap"}}>
                        <button className="btn sm" style={{width:"auto"}} disabled={!dirty} onClick={saveJudgeNumbers}>Save judge numbers</button>
                        {dirty && <button className="btn sec sm" style={{width:"auto"}} onClick={() => { setSetupErr(""); setJudgeCountDrafts({}); }}>Cancel</button>}
                        <span style={{fontSize:".8rem",color:"var(--dim)"}}>{total} judge{total!==1?"s":""} in total</span>
                      </div>
                      <p style={{fontSize:".76rem",color:"var(--dim)",marginTop:".6rem"}}>
                        You can change this after judges have signed in, as long as each of them keeps a number inside
                        their own department. To fix a judge who signed in by mistake, remove them on the Judges tab.
                      </p>
                    </>) : (
                      <p style={{fontSize:".82rem",color:"var(--dim)"}}>
                        Each department has its own Judge1, Judge2, … and judges pick their department when signing in.
                        Set the size of each department with Max judges above.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* ── Project categories ── */}
              <div className="card">
                <div className="lbl" style={{marginBottom:".4rem"}}>Project Categories</div>
                <p style={{fontSize:".82rem",color:"var(--dim)",marginBottom:".9rem"}}>
                  The subject areas students pick from — yours alone, not shared with other schools.
                  A robotics fair can replace all of these. The code is used to build registration numbers (e.g. <code>JHS-LS-001</code>).
                  Renaming or deleting one never changes projects already saved under it: they keep their old label.
                </p>

                <div className="setup-rows">
                  {[...categories].sort((a,b)=>a.ord-b.ord).map((cat, i, arr) => {
                    const used = projects.filter(p => p.cat === cat.name).length;
                    const edit = catEdits[cat.id];
                    return (
                      <div key={cat.id || cat.name} className="setup-row">
                        <div className="setup-ord">
                          <button className="proj-act-btn" disabled={i===0} title="Move up"
                            onClick={() => moveCategory(cat.id, -1)}>↑</button>
                          <button className="proj-act-btn" disabled={i===arr.length-1} title="Move down"
                            onClick={() => moveCategory(cat.id, 1)}>↓</button>
                        </div>
                        <div className="setup-main">
                          {edit ? (
                            <div className="setup-edit">
                              <input type="text" value={edit.name} placeholder="Category name"
                                onChange={e => setCatEdits(p => ({...p, [cat.id]: {...p[cat.id], name: e.target.value}}))} />
                              <input type="text" value={edit.code} placeholder="Code" maxLength={5} className="setup-code-in"
                                onChange={e => setCatEdits(p => ({...p, [cat.id]: {...p[cat.id], code: e.target.value}}))} />
                              <button className="btn sm" style={{width:"auto"}} onClick={() => saveCategory(cat.id)}>Save</button>
                              <button className="btn sec sm" style={{width:"auto"}}
                                onClick={() => { setSetupErr(""); setCatEdits(p => { const n={...p}; delete n[cat.id]; return n; }); }}>Cancel</button>
                            </div>
                          ) : (
                            <>
                              <div className="setup-name">{cat.name}</div>
                              <div className="setup-meta">
                                {cat.code && <span className="badge bp">{cat.code}</span>}
                                {" "}{used} project{used!==1?"s":""}
                              </div>
                            </>
                          )}
                        </div>
                        {!edit && (
                          <div className="setup-acts">
                            <button className="proj-act-btn" title="Rename"
                              onClick={() => { setSetupErr(""); setCatEdits(p => ({...p, [cat.id]: { name: cat.name, code: cat.code || "" }})); }}>✏️</button>
                            <button className="proj-act-btn del" title="Delete"
                              onClick={() => requestDeleteCategory(cat.id)}>🗑</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="setup-add">
                  <input type="text" placeholder="New category name" value={newCat.name}
                    onChange={e => setNewCat(p => ({...p, name: e.target.value}))}
                    onKeyDown={e => e.key==="Enter" && addCategory(newCat.name, newCat.code)} />
                  <input type="text" placeholder="Code" maxLength={5} className="setup-code-in" value={newCat.code}
                    onChange={e => setNewCat(p => ({...p, code: e.target.value}))}
                    onKeyDown={e => e.key==="Enter" && addCategory(newCat.name, newCat.code)} />
                  <button className="btn sm" style={{width:"auto"}} onClick={() => addCategory(newCat.name, newCat.code)}>+ Add</button>
                </div>
                <div style={{marginTop:".75rem"}}>
                  <button className="btn sec sm" style={{width:"auto"}} onClick={restoreDefaultCategories}>
                    ↺ Restore built-in categories
                  </button>
                </div>
              </div>
            </>}

            {/* JUDGES */}
            {adminTab==="judges" && <>
              <div className="adm-h1">Judge Management</div>
              <div className="adm-sub">Monitor activity and completion per judge · approve device transfer only when needed</div>
              <div className="card"><div className="tbl-wrap">
                <table>
                  <thead><tr><th>Alias</th><th>Department</th><th>Joined</th><th>Assigned</th><th>Progress</th><th>Status</th><th>Device / remove</th></tr></thead>
                  <tbody>
                    {judges.length === 0 && (
                      <tr><td colSpan={7} style={{textAlign:"center",color:"var(--dim)",padding:"1rem",fontSize:".85rem"}}>No judges registered yet.</td></tr>
                    )}
                    {departments.map(dept => {
                      const deptJudges = judges.filter(j => j.department_id === dept.id);
                      if (!deptJudges.length) return null;
                      return [
                        <tr key={`dept-hdr-${dept.id}`}>
                          <td colSpan={7} style={{background:"var(--s2)",fontWeight:600,fontSize:".78rem",color:"var(--navy)",fontFamily:"var(--ff-m)",letterSpacing:".05em",padding:".35rem .75rem"}}>
                            {dept.name.toUpperCase()} — {deptJudges.length}/{schoolNumbering() ? deptJudgeCount(dept) : dept.max_judges}
                            {schoolNumbering() && <span style={{fontWeight:400,opacity:.75}}> · {judgeRangeText(dept)}</span>}
                          </td>
                        </tr>,
                        ...deptJudges.map(j => {
                          const {done,total,pct} = judgeComp(j);
                          const transferKey = `${dept.id}:${j.alias}`;
                          const transferOpen = (!!transferAllowances[transferKey] && Date.now() <= transferAllowances[transferKey])
                                            || (!!transferAllowances[j.alias]     && Date.now() <= transferAllowances[j.alias]);
                          return (
                            <tr key={j.id}>
                              <td style={{fontFamily:"var(--ff-m)",color:"var(--navy)"}}>{j.alias}</td>
                              <td><span className="badge bp" style={{fontSize:".72rem"}}>{dept.name}</span></td>
                              <td style={{color:"var(--dim)",fontSize:".78rem"}}>{fmt(j.joinedAt)}</td>
                              <td>{total}</td>
                              <td>
                                <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                                  <div className="pbar" style={{width:"60px",height:"4px"}}>
                                    <div className="pfill" style={{width:`${pct}%`,height:"4px"}} />
                                  </div>
                                  <span style={{fontFamily:"var(--ff-m)",fontSize:".76rem"}}>{done}/{total}</span>
                                </div>
                              </td>
                              <td><span className={`badge ${done===total?"bg":done>0?"ba":"br"}`}>
                                {done===total?"Complete":done>0?"In Progress":"Not Started"}
                              </span></td>
                              <td>
                                <button className="btn sec sm" style={{width:"auto"}} onClick={() => allowJudgeTransfer(j.alias)}>
                                  {transferOpen ? "Approved (active)" : "Allow Transfer"}
                                </button>
                                <button className="btn danger sm" style={{width:"auto",marginLeft:".35rem"}}
                                  onClick={() => { setRemoveJudgeAsk(j); setRemoveJudgePin(""); setRemoveJudgeErr(""); }}>Remove</button>
                              </td>
                            </tr>
                          );
                        })
                      ];
                    })}
                    {/* Judges without a department (legacy / migration) */}
                    {judges.filter(j => !j.department_id).map(j => {
                      const {done,total,pct} = judgeComp(j);
                      const transferOpen = !!transferAllowances[j.alias] && Date.now() <= transferAllowances[j.alias];
                      return (
                        <tr key={j.id}>
                          <td style={{fontFamily:"var(--ff-m)",color:"var(--navy)"}}>{j.alias}</td>
                          <td><span className="badge br" style={{fontSize:".72rem"}}>Unassigned</span></td>
                          <td style={{color:"var(--dim)",fontSize:".78rem"}}>{fmt(j.joinedAt)}</td>
                          <td>{total}</td>
                          <td>
                            <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                              <div className="pbar" style={{width:"60px",height:"4px"}}>
                                <div className="pfill" style={{width:`${pct}%`,height:"4px"}} />
                              </div>
                              <span style={{fontFamily:"var(--ff-m)",fontSize:".76rem"}}>{done}/{total}</span>
                            </div>
                          </td>
                          <td><span className={`badge ${done===total?"bg":done>0?"ba":"br"}`}>
                            {done===total?"Complete":done>0?"In Progress":"Not Started"}
                          </span></td>
                          <td>
                            <button className="btn sec sm" style={{width:"auto"}} onClick={() => allowJudgeTransfer(j.alias)}>
                              {transferOpen ? "Approved (active)" : "Allow Transfer"}
                            </button>
                            <button className="btn danger sm" style={{width:"auto",marginLeft:".35rem"}}
                              onClick={() => { setRemoveJudgeAsk(j); setRemoveJudgePin(""); setRemoveJudgeErr(""); }}>Remove</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div></div>
            </>}

            {/* PROJECTS */}
            {adminTab==="projects" && <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:".5rem"}}>
                <div>
                  <div className="adm-h1">Projects Overview</div>
                  <div className="adm-sub">Manage projects, view rubric breakdown, and control project access</div>
                </div>
                <div style={{display:"flex",gap:".4rem",flexWrap:"wrap"}}>
                  <button className="btn sec sm" style={{width:"auto"}} onClick={() => setScanOpen(true)} disabled={scanOpen}>
                    📷 Scan forms
                  </button>
                  <button className="btn sm" style={{width:"auto"}} onClick={() => {
                    setProjForm(blankProjForm(nextProjectNum(), catNames()[0] || ""));
                    setShowAddProject(true); setEditingProject(null);
                  }}>
                    + Add Project
                  </button>
                </div>
              </div>

              {/* Participation-form scanner — see CLAUDE.md "📷 Form scanning" */}
              {scanOpen && (() => {
                const count = (s) => scanCards.filter(c => c.status === s).length;
                const readyToSave = scanCards.filter(c => c.status === "ready" && !c.notForm && !scanProblems(c).length && !scanDuplicate(c)).length;
                const needsAttention = scanCards.filter(c => c.status === "error" || (c.status === "ready" && (c.notForm || scanProblems(c).length || scanDuplicate(c)))).length;
                return (
                  <div className="scan-panel">
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:".5rem",flexWrap:"wrap"}}>
                      <div>
                        <div style={{fontWeight:600,fontSize:".95rem"}}>📷 Scan participation forms</div>
                        <div style={{fontSize:".76rem",color:"var(--dim)",marginTop:".2rem",maxWidth:"560px"}}>
                          Photos are sent to Google Gemini to be read and are <b>not stored</b>. Fields the AI was unsure of are
                          <span className="scan-unsure" style={{padding:"0 .3rem",borderRadius:"4px",margin:"0 .25rem"}}>highlighted</span>.
                          Check every card against the photo before saving.
                        </div>
                      </div>
                      <button className="btn sec sm" style={{width:"auto"}} disabled={scanSaving} onClick={() => closeScanner(false)}>Done</button>
                    </div>

                    <div className="scan-actions">
                      <label className="btn sm" style={{width:"auto",cursor:"pointer"}}>
                        📁 Choose photos / PDFs
                        <input type="file" accept="image/*,application/pdf" multiple style={{display:"none"}}
                          onChange={e => { scanAddFiles(e.target.files); e.target.value = ""; }} />
                      </label>
                      <label className="btn sec sm" style={{width:"auto",cursor:"pointer"}}>
                        📸 Take photo
                        <input type="file" accept="image/*" capture="environment" style={{display:"none"}}
                          onChange={e => { scanAddFiles(e.target.files); e.target.value = ""; }} />
                      </label>
                      <button className="btn sec sm" style={{width:"auto"}} onClick={() => setScanCards(cs => [...cs, newScanCard(null, null)])}>
                        ✍️ Blank card
                      </button>
                    </div>

                    {scanCards.length > 0 && (
                      <div className="scan-summary">
                        <span>⏳ {count("reading")} reading</span>
                        <span>✓ {readyToSave} ready</span>
                        <span style={{color: needsAttention ? "var(--amber)" : undefined}}>⚠ {needsAttention} need attention</span>
                        <span>💾 {count("saved")} saved</span>
                        <button className="btn sm" style={{width:"auto",marginLeft:"auto"}}
                          disabled={scanSaving || readyToSave === 0} onClick={saveAllScanCards}>
                          {scanSaving ? "Saving…" : `Save all ready (${readyToSave})`}
                        </button>
                      </div>
                    )}

                    {scanDiscardAsk && (
                      <div className="scan-msg warn" style={{display:"flex",alignItems:"center",gap:".5rem",flexWrap:"wrap"}}>
                        <span>{scanCards.filter(c => c.status !== "saved").length} card(s) are not saved and will be discarded.</span>
                        <button className="btn danger sm" style={{width:"auto"}} onClick={() => closeScanner(true)}>Discard &amp; close</button>
                        <button className="btn sec sm" style={{width:"auto"}} onClick={() => setScanDiscardAsk(false)}>Keep reviewing</button>
                      </div>
                    )}

                    {scanCards.map(renderScanCard)}
                  </div>
                );
              })()}

              {/* Add / Edit project form */}
              {(showAddProject || editingProject) && (
                <div className="proj-form">
                  <div style={{fontWeight:600,marginBottom:".75rem",fontSize:".95rem"}}>
                    {editingProject ? "Edit Project" : "Add New Project"}
                  </div>
                  <div className="proj-form-grid full">
                    <div>
                      <div className="lbl">Title</div>
                      <input type="text" placeholder="Project title..." value={projForm.title}
                        onChange={e => setProjForm(f => ({...f, title:e.target.value}))} />
                    </div>
                  </div>
                  <div className="proj-form-grid" style={{marginTop:".5rem"}}>
                    <div>
                      <div className="lbl">Department</div>
                      <select className="delib-rec-select" value={projForm.department_id}
                        onChange={e => setProjForm(f => ({...f, department_id:e.target.value}))}>
                        <option value="">— Unassigned —</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="lbl">Category</div>
                      <select className="delib-rec-select" value={projForm.cat}
                        onChange={e => setProjForm(f => ({...f, cat:e.target.value}))}>
                        {/* A project saved under a pre-2026-10 category keeps it until changed */}
                        {projForm.cat && !catNames().includes(projForm.cat) &&
                          <option value={projForm.cat}>{projForm.cat} (old category)</option>}
                        {catNames().map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="proj-form-grid" style={{marginTop:".5rem"}}>
                    <div>
                      <div className="lbl">Grade <span style={{fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:".7rem"}}>(blank = highest student grade)</span></div>
                      <input type="text" placeholder={highestGrade(projForm.members) || "e.g. 9"} value={projForm.grade}
                        onChange={e => setProjForm(f => ({...f, grade:e.target.value}))} />
                    </div>
                    <div>
                      <div className="lbl">Project Number</div>
                      <input type="text" placeholder="e.g. 001" value={projForm.num} style={{fontFamily:"var(--ff-m)"}}
                        onChange={e => setProjForm(f => ({...f, num:e.target.value}))} />
                    </div>
                  </div>
                  {/* Always available — admin-entered teams have no registration row
                      to carry the adviser/member names, so these must be editable here. */}
                  <div className="proj-form-grid" style={{marginTop:".5rem"}}>
                    <div>
                      <div className="lbl">Teacher / Adviser</div>
                      <input type="text" placeholder="Adviser name..." value={projForm.advisor_name}
                        onChange={e => setProjForm(f => ({...f, advisor_name:e.target.value}))} />
                    </div>
                    <div>
                      <div className="lbl">Room</div>
                      <input type="text" placeholder="e.g. T25" value={projForm.room}
                        onChange={e => setProjForm(f => ({...f, room:e.target.value}))} />
                    </div>
                  </div>
                  <div style={{marginTop:".5rem"}}>
                    <div className="lbl">Students</div>
                    {projForm.members.map((m, i) => (
                      <div key={i} className="member-row">
                        <input type="text" placeholder={`Student ${i + 1} name`} value={m.name}
                          onChange={e => setProjForm(f => ({...f, members: f.members.map((x, j) => j === i ? {...x, name:e.target.value} : x)}))} />
                        <input type="text" placeholder="Grade" value={m.grade} className="member-grade"
                          onChange={e => setProjForm(f => ({...f, members: f.members.map((x, j) => j === i ? {...x, grade:e.target.value} : x)}))} />
                        {projForm.members.length > 1 && (
                          <button type="button" className="proj-act-btn del" title="Remove student"
                            onClick={() => setProjForm(f => ({...f, members: f.members.filter((_, j) => j !== i)}))}>✕</button>
                        )}
                      </div>
                    ))}
                    {projForm.members.length < 6 && (
                      <button type="button" className="btn sec sm" style={{width:"auto",marginTop:".35rem"}}
                        onClick={() => setProjForm(f => ({...f, members: [...f.members, { name:"", grade:"" }]}))}>
                        + Add student
                      </button>
                    )}
                  </div>
                  <div style={{marginTop:".5rem"}}>
                    <div className="lbl">What they plan to investigate, test, design or build</div>
                    <textarea rows={2} value={projForm.description}
                      onChange={e => setProjForm(f => ({...f, description:e.target.value}))} />
                  </div>
                  <div style={{marginTop:".5rem"}}>
                    <div className="lbl">Why they chose this project</div>
                    <textarea rows={2} value={projForm.motivation}
                      onChange={e => setProjForm(f => ({...f, motivation:e.target.value}))} />
                  </div>
                  <div style={{marginTop:".5rem",display:"flex",gap:".5rem"}}>
                    <button className="btn sm" style={{width:"auto"}}
                      disabled={!projForm.title.trim()}
                      onClick={() => editingProject ? updateProject(editingProject) : addProject()}>
                      {editingProject ? "Save Changes" : "Add Project"}
                    </button>
                    <button className="btn sec sm" style={{width:"auto"}}
                      onClick={() => { setShowAddProject(false); setEditingProject(null); setProjForm(blankProjForm("", catNames()[0] || "")); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Project cards */}
              {projects.map(p => {
                const hits = Object.entries(scores).filter(([k]) => k.endsWith(`_${p.id}`));
                const avg  = projAvg(p.id);
                const assignedJudges = judges.filter(j => j.projects.includes(p.id));
                const regSub = regSubmissions.find(s => s.project_id === p.id);
                return (
                  <div className={`proj-mgmt-card ${p.locked?"is-locked":""}`} key={p.id}>
                    <div className="proj-mgmt-head">
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:".5rem",marginBottom:".2rem",flexWrap:"wrap"}}>
                          <span style={{fontFamily:"var(--ff-m)",fontSize:".78rem",color:"var(--navy)"}}>#{p.num} · {p.cat}</span>
                          {(() => { const d = departments.find(d => d.id === p.department_id); if (!d) return <span className="badge br" style={{fontSize:".68rem"}}>Unassigned</span>; const dc = d.name.toLowerCase().includes("elem") ? "bg" : d.name.toLowerCase().includes("middle") ? "ba" : d.name.toLowerCase().includes("high") ? "bb" : "bp"; return <span className={`badge ${dc}`} style={{fontSize:".68rem"}}>{d.name}</span>; })()}
                          {p.locked && <span className="proj-lock-badge">🔒 Locked</span>}
                        </div>
                        <div style={{fontWeight:600,marginBottom:".2rem",lineHeight:1.3}}>{p.title}</div>
                        <div style={{fontSize:".76rem",color:"var(--dim)"}}>
                          Grade {p.grade} · {hits.length} review{hits.length!==1?"s":""}
                          {assignedJudges.length > 0 && ` · ${assignedJudges.length} judge${assignedJudges.length!==1?"s":""} assigned`}
                        </div>
                        {(() => {
                          // Prefer the values stored on the project itself (admin-entered);
                          // fall back to the registration submission for student-registered ones.
                          const adviser = p.advisor_name || regSub?.advisor_name || "";
                          const members = membersText(p.group_members?.length ? p.group_members : regSub?.group_members);
                          if (!adviser && !members && !p.room && !p.description) return null;
                          return (
                            <>
                              <div style={{fontSize:".74rem",color:"var(--dim)",marginTop:".3rem",display:"flex",flexWrap:"wrap",gap:".5rem 1rem"}}>
                                {adviser && <span><span style={{color:"var(--text)",fontWeight:500}}>Adviser:</span> {adviser}</span>}
                                {members && <span><span style={{color:"var(--text)",fontWeight:500}}>Members:</span> {members}</span>}
                                {p.room && <span><span style={{color:"var(--text)",fontWeight:500}}>Room:</span> {p.room}</span>}
                              </div>
                              {p.description && (
                                <div style={{fontSize:".74rem",color:"var(--dim)",marginTop:".25rem",fontStyle:"italic"}}>{p.description}</div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <div style={{display:"flex",alignItems:"flex-start",gap:"1rem"}}>
                        <div className="proj-mgmt-actions">
                          <button className={`proj-act-btn ${p.locked?"unlock":"lock"}`}
                            onClick={() => toggleProjectLock(p.id)}
                            title={p.locked ? "Unlock project" : "Lock project"}>
                            {p.locked ? "🔓 Unlock" : "🔒 Lock"}
                          </button>
                          {!p.locked && (
                            <>
                              <button className="proj-act-btn edit"
                                onClick={() => {
                                  setEditingProject(p.id);
                                  const mem = normMembers(p.group_members?.length ? p.group_members : regSub?.group_members);
                                  setProjForm({
                                    title:p.title, cat:p.cat, grade:p.grade, num:p.num, department_id:p.department_id||"",
                                    advisor_name: p.advisor_name || regSub?.advisor_name || "",
                                    members: mem.length ? mem : [{ name:"", grade:"" }],
                                    room: p.room || "", description: p.description || "", motivation: p.motivation || "",
                                  });
                                  setShowAddProject(false);
                                }}
                                title="Edit project">
                                ✏️ Edit
                              </button>
                              <button className="proj-act-btn del"
                                onClick={() => { setDeleteProjectId(p.id); setShowDeleteConfirm(true); }}
                                title="Remove project">
                                🗑 Remove
                              </button>
                            </>
                          )}
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontFamily:"var(--ff-d)",fontSize:"1.8rem",color:avg?"var(--navy)":"var(--dim)"}}>{avg??"—"}</div>
                          <div style={{fontSize:".7rem",color:"var(--dim)"}}>avg / {projectMax(p)}</div>
                        </div>
                      </div>
                    </div>
                    {hits.length > 0 && (
                      <div style={{marginTop:".75rem",borderTop:"1px solid var(--bd)",paddingTop:".75rem"}}>
                        {rubric.map(r => {
                          const avgR = hits.reduce((s,[,sc]) => s+(sc.criteria?.[r.id]||0),0) / hits.length;
                          return (
                            <div key={r.id} style={{display:"flex",alignItems:"center",gap:".65rem",marginBottom:".35rem"}}>
                              <span style={{fontSize:".73rem",color:"var(--dim)",width:"125px",flexShrink:0}}>{r.label}</span>
                              <div className="pbar" style={{flex:1,height:"4px"}}>
                                <div className="pfill" style={{width:`${(avgR/r.max)*100}%`,height:"4px"}} />
                              </div>
                              <span style={{fontFamily:"var(--ff-m)",fontSize:".73rem",width:"38px",textAlign:"right"}}>{avgR.toFixed(1)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {projects.length === 0 && (
                <div className="all-done">
                  <div style={{fontSize:"2rem",marginBottom:".4rem"}}>📋</div>
                  <div style={{fontWeight:600}}>No projects yet</div>
                  <div style={{fontSize:".82rem",color:"var(--dim)",marginTop:".25rem"}}>Click "Add Project" to get started.</div>
                </div>
              )}

              {/* Export Project List */}
              <div style={{marginTop:"2rem",borderTop:"1px solid var(--bd)",paddingTop:"1.5rem"}}>
                <div className="adm-h1" style={{marginBottom:".25rem"}}>Export Project List</div>
                <div className="adm-sub" style={{marginBottom:"1rem"}}>Printable PDF grouped by department, or a spreadsheet (CSV) with every detail — keep the CSV as your own backup copy. Both contain student names: share only with staff.</div>
                <div style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}>
                  <button className="btn sm" style={{width:"auto"}} onClick={exportProjListPDF} disabled={projects.length === 0}>
                    🖨 Export Project List PDF
                  </button>
                  <button className="btn sec sm" style={{width:"auto"}} onClick={exportProjectsCSV} disabled={projects.length === 0}>
                    ⬇ Download Projects CSV
                  </button>
                </div>
              </div>
            </>}

            {/* ACTIVITY */}
            {adminTab==="activity" && <>
              <div className="adm-h1">Activity Log</div>
              <div className="adm-sub">Timestamped record of all actions</div>
              <div style={{marginBottom:".75rem"}}>
                <input type="text" placeholder="Filter by keyword…" value={activityFilter}
                  onChange={e => setActivityFilter(e.target.value)}
                  style={{width:"100%",padding:".6rem 1rem",border:"1.5px solid var(--bd)",borderRadius:"8px",fontFamily:"var(--ff-b)",fontSize:".9rem",outline:"none"}} />
              </div>
              <div className="card">
                {log
                  .filter(e => !activityFilter || e.msg.toLowerCase().includes(activityFilter.toLowerCase()))
                  .map((e,i) => (
                    <div className="log-row" key={i}>
                      <div className="log-t">{fmtFull(e.time)}</div>
                      <div>{e.msg}</div>
                    </div>
                  ))}
                {log.filter(e => !activityFilter || e.msg.toLowerCase().includes(activityFilter.toLowerCase())).length === 0 && (
                  <div style={{color:"var(--dim)",textAlign:"center",padding:"1rem",fontSize:".88rem"}}>No matching entries.</div>
                )}
              </div>
            </>}

            {/* ALERTS */}
            {adminTab==="alerts" && <>
              <div className="adm-h1">Alerts & Anomalies</div>
              <div className="adm-sub">Score outliers and system warnings</div>
              {anomalies.length === 0
                ? <div className="all-done"><div style={{fontSize:"2rem",marginBottom:".4rem"}}>✅</div>
                    <div style={{fontWeight:600}}>No anomalies detected</div>
                    <div style={{fontSize:".82rem",color:"var(--dim)",marginTop:".25rem"}}>All scores are within expected range.</div>
                  </div>
                : anomalies.map((a,i) => (
                    <div className="alert-box" key={i}>
                      <div className="alert-ico">⚠️</div>
                      <div className="alert-msg">
                        <strong>Score Outlier — Review Recommended</strong>
                        <span><strong>{a.judge}</strong> scored <strong>{a.score}/{a.max ?? rubricMax()}</strong> — group avg is <strong>{a.avg}</strong>. Deviation &gt; {Math.round((a.max ?? rubricMax()) * ANOMALY_PCT)} pts ({Math.round(ANOMALY_PCT*100)}% of this project&apos;s total).</span>
                      </div>
                    </div>
                  ))
              }
              <div className="card" style={{marginTop:"1.5rem"}}>
                <div className="sec-title">System Status</div>
                <div className="sys-row"><span style={{color:"var(--dim)"}}>Database</span><span className="badge bg">● Operational</span></div>
                <div className="sys-row"><span style={{color:"var(--dim)"}}>Judging</span><span className={`badge ${locked?"br":"bg"}`}>{locked?"🔒 Locked":"🔓 Open"}</span></div>
                <div className="sys-row"><span style={{color:"var(--dim)"}}>Results Link</span><span className={`badge ${isLinkLive()?"bg":"br"}`}>{isLinkLive()?"Live":"Disabled"}</span></div>
                <div className="sys-row"><span style={{color:"var(--dim)"}}>Score Records</span><span style={{fontFamily:"var(--ff-m)"}}>{totalScored()}</span></div>
              </div>
            </>}

            {/* DELIBERATION */}
            {adminTab==="deliberation" && (() => {
              const vp = valProgress();
              const tie = hasTie();
              const consensus = consensusReached();
              const canFinalize = adminValidation?.approved && !deliberationOpen;
              return <>
                <div className="adm-h1">Validation &amp; Deliberation</div>
                <div className="adm-sub">Review computed results, reach consensus, and finalize before sharing</div>

                {/* Finalized banner */}
                {resultsFinalized && (
                  <div className="val-finalized-banner">
                    <span style={{fontSize:"1.5rem"}}>✅</span>
                    <div>
                      <div style={{fontWeight:700,fontSize:".95rem"}}>Results are finalized</div>
                      <div style={{fontSize:".78rem",opacity:.8}}>Public sharing is now available from the Share tab.</div>
                    </div>
                    <button className="btn danger sm" style={{width:"auto",marginLeft:"auto"}} onClick={reopenResults}>Reopen</button>
                  </div>
                )}

                {delibErr && <div className="err" style={{marginBottom:"1rem"}}>⚠ {delibErr}</div>}

                {/* Tie alert */}
                {tie && !resultsFinalized && (
                  <div className="val-tie-alert">
                    <span style={{fontSize:"1.2rem"}}>⚠️</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:".88rem"}}>Tie detected in rankings</div>
                      <div style={{fontSize:".76rem",opacity:.85}}>Two or more projects share the same average score. Deliberation is recommended.</div>
                    </div>
                    {!deliberationOpen && <button className="btn amber sm" style={{width:"auto"}} onClick={() => openDeliberation("tie")}>Open Deliberation</button>}
                  </div>
                )}

                {/* Consensus status */}
                {!resultsFinalized && (
                  <div className={`val-consensus-card ${consensus ? "reached" : ""}`}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:".5rem"}}>
                      <div>
                        <div style={{fontWeight:600,fontSize:".92rem"}}>{consensus ? "✅ Consensus reached" : "⏳ Awaiting consensus"}</div>
                        <div style={{fontSize:".76rem",color:"var(--dim)",marginTop:".15rem"}}>
                          {consensus ? "All reviewers approved the computed results. You can finalize and share." : "All judges who have completed scoring and the admin must approve before results can be finalized."}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Judge validation status */}
                <div className="card" style={{marginBottom:"1rem"}}>
                  <div className="sec-title">Judge Validations</div>
                  <div style={{display:"flex",gap:".75rem",marginBottom:"1rem",flexWrap:"wrap"}}>
                    <div className="val-stat-pill green">{vp.approved} Approved</div>
                    <div className="val-stat-pill red">{vp.flagged} Concerned</div>
                    <div className="val-stat-pill dim">{vp.pending} Pending</div>
                  </div>
                  {completedJudges().length === 0
                    ? <div style={{fontSize:".82rem",color:"var(--dim)"}}>No judges have completed scoring yet.</div>
                    : completedJudges().map(j => {
                        const v = judgeValidations[j.id];
                        return (
                          <div key={j.id} style={{display:"flex",alignItems:"center",gap:".75rem",padding:".5rem 0",borderBottom:"1px solid var(--bd)"}}>
                            <div style={{flex:1,fontSize:".88rem",fontWeight:500}}>{j.alias}</div>
                            {v
                              ? <>
                                  <span className={`val-status-pill ${v.approved ? "approved" : "concern"}`}>{v.approved ? "✓ Approved" : "⚠ Concern"}</span>
                                  {v.comment && <span style={{fontSize:".72rem",color:"var(--dim)",maxWidth:"160px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{v.comment}"</span>}
                                </>
                              : <span className="val-status-pill pending">Pending</span>
                            }
                          </div>
                        );
                      })
                  }
                </div>

                {/* Admin validation */}
                <div className="card" style={{marginBottom:"1rem"}}>
                  <div className="sec-title">Your Validation (Admin)</div>
                  {adminValidation ? (
                    <div>
                      <div className={`val-status-pill ${adminValidation.approved ? "approved" : "concern"}`} style={{marginBottom:".5rem"}}>
                        {adminValidation.approved ? "✓ You approved the computed results" : "⚠ You flagged a concern"}
                      </div>
                      {adminValidation.comment && <div style={{fontSize:".8rem",color:"var(--dim)",marginBottom:".75rem"}}>Note: "{adminValidation.comment}"</div>}
                      <button className="btn sec sm" style={{width:"auto"}} onClick={() => { setAdminValidation(null); setValComment(""); setShowValForm(false); }}>Revise</button>
                    </div>
                  ) : (
                    <div>
                      <p style={{fontSize:".83rem",color:"var(--dim)",marginBottom:".85rem",lineHeight:1.5}}>Review the auto-computed rankings and confirm they look correct before finalizing.</p>
                      {showValForm && (
                        <div style={{marginBottom:".75rem"}}>
                          <div className="lbl">Comment (optional)</div>
                          <textarea placeholder="Describe your concern..." value={valComment} onChange={e => setValComment(e.target.value)} rows={2} />
                        </div>
                      )}
                      {valErr && <div className="err" style={{marginBottom:".75rem"}}>⚠ {valErr}</div>}
                      <div style={{display:"flex",gap:".65rem",flexWrap:"wrap"}}>
                        <button className="btn sm" style={{width:"auto",background:"var(--green)"}} onClick={() => submitAdminValidation(true)}>✓ Approve Results</button>
                        {!showValForm
                          ? <button className="btn sec sm" style={{width:"auto"}} onClick={() => setShowValForm(true)}>⚠ Flag a Concern</button>
                          : <button className="btn danger sm" style={{width:"auto"}} onClick={() => submitAdminValidation(false)}>Submit Concern</button>
                        }
                      </div>
                    </div>
                  )}
                </div>

                {/* Deliberation section */}
                {!resultsFinalized && (
                  <div className="card" style={{marginBottom:"1rem"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:".5rem",marginBottom:".75rem"}}>
                      <div>
                        <div className="sec-title" style={{marginBottom:".1rem"}}>Deliberation</div>
                        <div style={{fontSize:".76rem",color:"var(--dim)"}}>
                          {deliberationOpen
                            ? `Open · Reason: ${deliberationReason === "tie" ? "Tied scores" : "Admin initiated"}`
                            : "Not active · Triggered automatically on ties or manually by admin"}
                        </div>
                      </div>
                      {deliberationOpen
                        ? <button className="btn sec sm" style={{width:"auto"}} onClick={closeDeliberation}>Close Deliberation</button>
                        : <button className="btn sec sm" style={{width:"auto"}} onClick={() => openDeliberation("manual")}>Open Manually</button>
                      }
                    </div>
                    {deliberationOpen && rankedProjects().map((p, i) => {
                      const notes = getDelibNotesForProject(p.id);
                      const flags = getFlagCount(p.id);
                      const decision = finalDecisions[p.id];
                      return (
                        <div key={p.id} style={{borderTop:"1px solid var(--bd)",paddingTop:".85rem",marginTop:".85rem"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"1rem",flexWrap:"wrap",marginBottom:".5rem"}}>
                            <div>
                              <div style={{fontFamily:"var(--ff-m)",fontSize:".73rem",color:"var(--navy)"}}>#{p.num} · Rank {i+1}</div>
                              <div style={{fontWeight:600,fontSize:".92rem",lineHeight:1.3}}>{p.title}</div>
                            </div>
                            <div style={{textAlign:"right",flexShrink:0}}>
                              <div style={{fontFamily:"var(--ff-d)",fontSize:"1.5rem",color:"var(--navy)"}}>{p.avg ?? "—"}</div>
                              <div style={{fontSize:".65rem",color:"var(--dim)"}}>avg / {projectMax(p)}</div>
                            </div>
                          </div>
                          {/* Per-judge score breakdown */}
                          {(() => {
                            const judgeScores = judges
                              .map(j => ({ alias: j.alias, sc: scores[`${j.id}_${p.id}`] }))
                              .filter(x => x.sc);
                            if (!judgeScores.length) return null;
                            return (
                              <div style={{background:"var(--s1)",border:"1px solid var(--bd)",borderRadius:"8px",padding:".65rem .85rem",marginBottom:".6rem"}}>
                                <div style={{fontSize:".7rem",fontFamily:"var(--ff-m)",color:"var(--dim)",marginBottom:".45rem",textTransform:"uppercase",letterSpacing:".04em"}}>Judge Scores</div>
                                {judgeScores.map(({alias, sc}) => {
                                  const total = getTotal(sc);
                                  return (
                                    <div key={alias} style={{marginBottom:".5rem"}}>
                                      <div style={{display:"flex",alignItems:"center",gap:".6rem",marginBottom:".2rem"}}>
                                        <span style={{fontFamily:"var(--ff-m)",fontSize:".75rem",color:"var(--dim)",width:"60px",flexShrink:0}}>{alias}</span>
                                        <div className="pbar" style={{flex:1,height:"5px"}}>
                                          <div className="pfill" style={{width:`${(total/(projectMax(p)||1))*100}%`,height:"5px"}} />
                                        </div>
                                        <span style={{fontFamily:"var(--ff-m)",fontSize:".78rem",fontWeight:600,width:"52px",textAlign:"right",color:"var(--navy)"}}>{total}/{projectMax(p)}</span>
                                      </div>
                                      {sc.notes && sc.notes.trim() && (
                                        <div style={{marginLeft:"68px",fontSize:".78rem",color:"var(--dim)",fontStyle:"italic",lineHeight:1.5,borderLeft:"2px solid var(--bd)",paddingLeft:".5rem"}}>
                                          "{sc.notes.trim()}"
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          {flags > 0 && <div style={{display:"inline-flex",alignItems:"center",gap:".3rem",fontSize:".73rem",fontFamily:"var(--ff-m)",padding:".2rem .5rem",background:"var(--amber-l)",color:"var(--amber)",borderRadius:"6px",marginBottom:".5rem"}}>🚩 {flags} flag{flags!==1?"s":""} for discussion</div>}
                          {notes.length > 0 && notes.map((n, ni) => (
                            <div key={ni} className="delib-comment-card">
                              <div className="delib-comment-alias">👤 {n.judgeAlias}</div>
                              {n.comment && <div className="delib-comment-text">"{n.comment}"</div>}
                              <div className="delib-comment-meta">
                                <span className={`delib-rec-pill ${recPillClass(n.recommendation)}`}>{n.recommendation}</span>
                                {n.flagged && <span className="delib-flag-badge">🚩 Flagged</span>}
                              </div>
                            </div>
                          ))}
                          <div style={{marginTop:".5rem"}}>
                            <div style={{display:"flex",gap:".5rem",flexWrap:"wrap",marginBottom:".4rem"}}>
                              <select className="delib-rec-select" style={{flex:1,minWidth:"140px"}}
                                value={decision?.award || "Pending"}
                                onChange={e => setFinalDecisions(prev => ({ ...prev, [p.id]: { ...prev[p.id], award: e.target.value, finalized:false, adminNotes:prev[p.id]?.adminNotes||"" } }))}>
                                {AWARD_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                              </select>
                              <button className="btn sm" style={{width:"auto"}}
                                disabled={!decision?.award || decision?.award==="Pending"}
                                onClick={() => saveFinalDecision(p.id, decision?.award||"Pending", decision?.adminNotes||"")}>
                                {decision?.finalized ? "✓ Saved" : "Save Award"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Finalize button */}
                {!resultsFinalized && (
                  <div style={{background:"var(--s1)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"1.25rem",marginBottom:"1rem"}}>
                    <div style={{fontWeight:600,marginBottom:".3rem"}}>Finalize &amp; Enable Sharing</div>
                    <div style={{fontSize:".8rem",color:"var(--dim)",marginBottom:"1rem",lineHeight:1.5}}>
                      {!adminValidation?.approved ? "You must approve the results before finalizing." :
                       deliberationOpen ? "Close deliberation before finalizing." :
                       "Results are ready to finalize. Once finalized, the Share tab will be unlocked."}
                    </div>
                    <button className="btn" disabled={!canFinalize} onClick={finalizeResults}>
                      🏁 Finalize Results
                    </button>
                  </div>
                )}

                {/* Copy report */}
                <div>
                  <button className="btn sec sm" style={{width:"auto"}} onClick={() => { navigator.clipboard.writeText(buildDelibReport()).catch(()=>{}); setDelibReportCopied(true); setTimeout(()=>setDelibReportCopied(false),2500); }}>
                    {delibReportCopied ? "✓ Copied!" : "📋 Copy Summary Report"}
                  </button>
                </div>
              </>;
            })()}

            {/* SHARE RESULTS */}
            {adminTab==="share" && <>
              <div className="adm-h1">Share Live Results</div>
              <div className="adm-sub">Generate a public link for parents, students, and attendees — no login required to view.</div>

              {/* Not-finalized gate */}
              {!resultsFinalized && (
                <div className="val-tie-alert" style={{marginBottom:"1.2rem"}}>
                  <span style={{fontSize:"1.2rem"}}>🔒</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:".88rem"}}>Results not yet finalized</div>
                    <div style={{fontSize:".76rem",opacity:.85}}>Complete validation and finalize results in the Validation tab before sharing.</div>
                  </div>
                  <button className="btn sm" style={{width:"auto"}} onClick={() => setAdminTab("deliberation")}>Go to Validation →</button>
                </div>
              )}

              {/* Status bar */}
              <div className={`share-status ${isLinkLive()?"on":"off"}`}>
                <span style={{fontSize:"1.2rem"}}>{isLinkLive()?"🟢":"⚫"}</span>
                <div>
                  <div style={{fontWeight:500,fontSize:".88rem"}}>{isLinkLive()?"Results link is LIVE":"Results link is disabled"}</div>
                  <div style={{fontSize:".78rem",opacity:.7}}>{isLinkLive()?"Anyone with the link can view the public results dashboard.":"Generate a link below to share results."}</div>
                </div>
              </div>

              {/* Active link panel */}
              {isLinkLive() && (
                <div className="card">
                  <div className="lbl" style={{marginBottom:".6rem"}}>Public Results URL</div>
                  <div className="link-box" style={{marginBottom:".75rem"}}>
                    <input type="text" readOnly value={shareUrl()} />
                    <button className={`copy-btn ${copied?"copied":""}`} onClick={handleCopy}>
                      {copied ? "✓ Copied!" : "📋 Copy"}
                    </button>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:".75rem",flexWrap:"wrap",marginBottom:"1.1rem"}}>
                    <span className="token-pill">🔑 {shareToken}</span>
                    {shareExpiry==="never"
                      ? <span style={{fontSize:".75rem",color:"var(--green)"}}>✓ No expiry</span>
                      : <span style={{fontSize:".75rem",color:"var(--amber)"}}>⏱ Expires {EXPIRY_OPTS.find(e=>e.val===shareExpiry)?.label} from {fmtFull(shareCreated)}</span>
                    }
                  </div>
                  <div className="btn-row">
                    <button className="btn purple sm" onClick={() => setView("public-results")}>👁 Preview Page</button>
                    <button className="btn danger sm" onClick={revokeLink}>🚫 Revoke Link</button>
                  </div>
                </div>
              )}

              {/* Settings card */}
              <div className="card">
                <div className="sec-title">Link Settings</div>

                <div style={{marginBottom:"1.2rem"}}>
                  <div className="lbl">Page Title (shown to public)</div>
                  <input type="text" value={shareTitle} onChange={e => setShareTitle(e.target.value)} placeholder="Science Fair SY 2025-2026 — Final Results" />
                </div>

                <div style={{marginBottom:"1.2rem"}}>
                  <div className="lbl">Link Expiry</div>
                  <div className="expiry-row">
                    {EXPIRY_OPTS.map(o => (
                      <div key={o.val} className={`expiry-opt ${shareExpiry===o.val?"sel":""}`} onClick={() => setShareExpiry(o.val)}>
                        {o.label}
                      </div>
                    ))}
                  </div>
                  <div style={{fontSize:".73rem",color:"var(--dim)",marginTop:".5rem"}}>After expiry, viewers see an "expired" message. You can always regenerate.</div>
                </div>

                <div style={{background:"var(--s1)",border:"1px solid var(--bd)",borderRadius:"10px",padding:"1rem",marginBottom:"1.2rem"}}>
                  <div className="toggle-wrap">
                    <div>
                      <div style={{fontSize:".88rem",fontWeight:500}}>Show rubric breakdown</div>
                      <div style={{fontSize:".75rem",color:"var(--dim)",marginTop:".1rem"}}>Viewers see per-category scores, not just totals</div>
                    </div>
                    <label className="toggle">
                      <input type="checkbox" checked={shareShowRubric} onChange={e => setShareShowRubric(e.target.checked)} />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                </div>

                <button className="btn" onClick={generateLink} disabled={!resultsFinalized}>
                  {isLinkLive() ? "🔄 Regenerate New Link" : "🔗 Generate Live Results Link"}
                </button>
                {!resultsFinalized && <p style={{fontSize:".72rem",color:"var(--dim)",marginTop:".5rem",textAlign:"center"}}>Finalize results first to enable sharing.</p>}
                {isLinkLive() && (
                  <p style={{fontSize:".72rem",color:"var(--amber)",marginTop:".5rem",textAlign:"center"}}>
                    ⚠ Regenerating invalidates the current link immediately.
                  </p>
                )}
              </div>

              {/* CSV Export */}
              {resultsFinalized && (
                <div className="card" style={{background:"var(--s1)"}}>
                  <div style={{fontFamily:"var(--ff-d)",fontSize:"1rem",marginBottom:".5rem"}}>📥 Export Results</div>
                  <p style={{fontSize:".85rem",color:"var(--dim)",marginBottom:".75rem"}}>Download a CSV of ranked projects with awards — for school records or regional fair submission.</p>
                  <button className="btn sec sm" style={{width:"auto"}} onClick={exportResultsCSV}>⬇ Download Results CSV</button>
                </div>
              )}

              {/* Security notes */}
              <div className="card sec-notes" style={{background:"var(--s1)"}}>
                <div style={{fontFamily:"var(--ff-d)",fontSize:"1rem",marginBottom:".75rem"}}>🔐 Security Notes</div>
                <div>• Secured by a <strong>unique random token</strong> — unguessable without the URL.</div>
                <div>• Shows <strong>project names and scores only</strong> — judge aliases are never exposed.</div>
                <div>• <strong>Revoke anytime</strong> — the link stops working instantly.</div>
                <div>• Use <strong>expiry</strong> to auto-disable the link after the event ends.</div>
              </div>
            </>}

            {/* SCORE EXPORT */}
            {adminTab==="export" && <>
              <div className="adm-h1">Score Export</div>
              <div className="adm-sub">Extract every judge's scores for every project — download as CSV or save a backup to the database.</div>

              {/* Live export */}
              <div className="card">
                <div className="sec-title">Live Export</div>
                <p style={{fontSize:".85rem",color:"var(--dim)",marginBottom:"1rem"}}>
                  Download the current scores as a detailed CSV — one row per judge + project combination, with all 10 rubric criteria, totals, and judge notes.
                </p>
                <div style={{display:"flex",gap:".75rem",flexWrap:"wrap",alignItems:"center"}}>
                  <button className="btn sec sm" style={{width:"auto"}} onClick={exportJudgeScoresCSV}
                    disabled={Object.keys(scores).length === 0}>
                    ⬇ Download Judge Scores CSV
                  </button>
                  {Object.keys(scores).length === 0 && (
                    <span style={{fontSize:".78rem",color:"var(--dim)"}}>No scores recorded yet.</span>
                  )}
                </div>
                <div style={{marginTop:".75rem",fontSize:".76rem",color:"var(--dim)"}}>
                  Columns: Judge · Project # · Title · Category · Grade · Presentation · Testable Q · Background · Hypothesis · Variables · Materials · Data · Analysis · Conclusion · Abstract · Total · Notes · Submitted
                </div>
              </div>

              {/* Save backup to DB */}
              <div className="card">
                <div className="sec-title">Save Backup to Database</div>
                <p style={{fontSize:".85rem",color:"var(--dim)",marginBottom:"1rem"}}>
                  Snapshot the current scores and store them permanently in Supabase. Saved backups are listed below and can be re-downloaded anytime.
                </p>
                <div style={{display:"flex",gap:".75rem",flexWrap:"wrap",alignItems:"center"}}>
                  <button className="btn sm" style={{width:"auto",background:backupSaved?"var(--green)":undefined}}
                    onClick={saveScoreBackup} disabled={savingBackup || Object.keys(scores).length === 0}>
                    {savingBackup ? "⏳ Saving…" : backupSaved ? "✓ Saved!" : "💾 Save Score Backup"}
                  </button>
                  {Object.keys(scores).length === 0 && (
                    <span style={{fontSize:".78rem",color:"var(--dim)"}}>No scores to back up yet.</span>
                  )}
                </div>
              </div>

              {/* Saved backups list */}
              <div className="card">
                <div className="sec-title">Saved Backups</div>
                {scoreBackups.length === 0 ? (
                  <div style={{fontSize:".85rem",color:"var(--dim)",padding:".5rem 0"}}>No backups saved yet.</div>
                ) : (
                  <div className="tbl-wrap">
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:".84rem"}}>
                      <thead>
                        <tr style={{borderBottom:"2px solid var(--bd)"}}>
                          <th style={{textAlign:"left",padding:".5rem .75rem",color:"var(--dim)",fontFamily:"var(--ff-m)",fontSize:".73rem",fontWeight:500}}>SAVED AT</th>
                          <th style={{textAlign:"left",padding:".5rem .75rem",color:"var(--dim)",fontFamily:"var(--ff-m)",fontSize:".73rem",fontWeight:500}}>LABEL</th>
                          <th style={{textAlign:"right",padding:".5rem .75rem",color:"var(--dim)",fontFamily:"var(--ff-m)",fontSize:".73rem",fontWeight:500}}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scoreBackups.map((bk, i) => (
                          <tr key={bk.id} style={{borderBottom:"1px solid var(--bd)",background:i%2===0?"var(--s1)":"var(--bg)"}}>
                            <td style={{padding:".55rem .75rem",fontFamily:"var(--ff-m)",fontSize:".78rem",color:"var(--dim)",whiteSpace:"nowrap"}}>
                              {new Date(bk.created_at).toLocaleString()}
                            </td>
                            <td style={{padding:".55rem .75rem",fontSize:".84rem",color:"var(--text)"}}>{bk.label}</td>
                            <td style={{padding:".55rem .75rem",textAlign:"right"}}>
                              <button className="btn sec sm" style={{width:"auto",fontSize:".75rem"}}
                                onClick={() => {
                                  if (!bk.snapshot) {
                                    supabase.from("score_backups").select("snapshot").eq("id", bk.id).single()
                                      .then(({ data }) => data && downloadBackupCSV({ ...bk, snapshot: data.snapshot }));
                                  } else {
                                    downloadBackupCSV(bk);
                                  }
                                }}>
                                ⬇ CSV
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>}

            {/* REGISTRATION */}
            {adminTab==="registration" && (
              <div>
                <div className="adm-h1">📝 Registration</div>
                <div className="adm-sub">Manage student project registration links and view submitted entries.</div>

                {/* Link management card */}
                <div className="card" style={{ marginBottom:"1.25rem" }}>
                  <div className="sec-title">Registration Link</div>
                  {(() => {
                    const activeLink = regLinks.find(l => l.active);
                    if (activeLink) {
                      // School-scoped so the link resolves to this school, not the platform homepage.
                      const regUrl = `${window.location.origin}${currentSchool?.slug ? `/s/${currentSchool.slug}` : ""}?register=${activeLink.token}`;
                      return (
                        <>
                          <div className="share-status on" style={{ marginBottom:"1rem" }}>
                            <span style={{ fontSize:"1rem" }}>🟢</span>
                            <span style={{ fontWeight:600 }}>Registration is open</span>
                          </div>
                          <div className="lbl">Registration URL — share this with participants</div>
                          <div className="link-box" style={{ marginBottom:"1rem" }}>
                            <input type="text" readOnly value={regUrl} />
                            <button className={`copy-btn${regLinkCopied ? " copied" : ""}`} onClick={() => {
                              navigator.clipboard.writeText(regUrl).catch(()=>{});
                              setRegLinkCopied(true); setTimeout(() => setRegLinkCopied(false), 2000);
                            }}>
                              {regLinkCopied ? "Copied!" : "Copy"}
                            </button>
                          </div>
                          <button className="btn danger sm" style={{ width:"auto" }} onClick={() => deactivateRegLink(activeLink.id)}>
                            🔒 Deactivate Registration Link
                          </button>
                        </>
                      );
                    }
                    return (
                      <>
                        <div className="share-status off" style={{ marginBottom:"1rem" }}>
                          <span style={{ fontSize:"1rem" }}>⚫</span>
                          <span>Registration is closed — no active link</span>
                        </div>
                        <p style={{ fontSize:".85rem", color:"var(--dim)", marginBottom:"1rem" }}>
                          Generate a link and share it with participants. They will fill out a registration form and their project will be automatically added to the project list.
                        </p>
                        <button className="btn sm" style={{ width:"auto" }} onClick={generateRegLink}>
                          🔗 Generate Registration Link
                        </button>
                      </>
                    );
                  })()}
                </div>

                {/* Submissions table */}
                <div className="card">
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1rem" }}>
                    <div className="sec-title" style={{ marginBottom:0 }}>
                      Submitted Registrations
                      {regSubmissions.length > 0 && <span className="badge bb" style={{ marginLeft:".5rem" }}>{regSubmissions.length}</span>}
                    </div>
                    <div style={{ display:"flex", gap:".5rem" }}>
                      <button className="btn sec sm" style={{ width:"auto" }} onClick={exportRegCSV} disabled={regSubmissions.length === 0}>
                        ⬇ Export CSV
                      </button>
                      <button className="btn sec sm" style={{ width:"auto" }} onClick={() => { loadRegLinks(); loadRegSubmissions(); }}>
                        ↻ Refresh
                      </button>
                    </div>
                  </div>
                  {regSubmissions.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"2rem 1rem", color:"var(--dim)", fontSize:".9rem" }}>
                      No registrations submitted yet.
                    </div>
                  ) : (
                    <div className="tbl-wrap">
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:".88rem" }}>
                        <thead>
                          <tr>
                            <th style={{ fontFamily:"var(--ff-m)", fontSize:".72rem", color:"var(--dim)", textTransform:"uppercase", letterSpacing:".08em", padding:".5rem .75rem", borderBottom:"2px solid var(--bd)", textAlign:"left", whiteSpace:"nowrap" }}>Reg #</th>
                            <th style={{ fontFamily:"var(--ff-m)", fontSize:".72rem", color:"var(--dim)", textTransform:"uppercase", letterSpacing:".08em", padding:".5rem .75rem", borderBottom:"2px solid var(--bd)", textAlign:"left" }}>Student Name</th>
                            <th style={{ fontFamily:"var(--ff-m)", fontSize:".72rem", color:"var(--dim)", textTransform:"uppercase", letterSpacing:".08em", padding:".5rem .75rem", borderBottom:"2px solid var(--bd)", textAlign:"left" }}>Project Title</th>
                            <th style={{ fontFamily:"var(--ff-m)", fontSize:".72rem", color:"var(--dim)", textTransform:"uppercase", letterSpacing:".08em", padding:".5rem .75rem", borderBottom:"2px solid var(--bd)", textAlign:"left" }}>Category</th>
                            <th style={{ fontFamily:"var(--ff-m)", fontSize:".72rem", color:"var(--dim)", textTransform:"uppercase", letterSpacing:".08em", padding:".5rem .75rem", borderBottom:"2px solid var(--bd)", textAlign:"left", whiteSpace:"nowrap" }}>Division</th>
                            <th style={{ fontFamily:"var(--ff-m)", fontSize:".72rem", color:"var(--dim)", textTransform:"uppercase", letterSpacing:".08em", padding:".5rem .75rem", borderBottom:"2px solid var(--bd)", textAlign:"left", whiteSpace:"nowrap" }}>Submitted</th>
                            <th style={{ borderBottom:"2px solid var(--bd)", padding:".5rem .75rem" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {regSubmissions.map(s => (
                            <tr key={s.id}>
                              <td style={{ padding:".6rem .75rem", borderBottom:"1px solid var(--bd)" }}>
                                <span className="reg-num-pill">{s.reg_number}</span>
                              </td>
                              <td style={{ padding:".6rem .75rem", borderBottom:"1px solid var(--bd)", fontWeight:600 }}>{s.student_name}</td>
                              <td style={{ padding:".6rem .75rem", borderBottom:"1px solid var(--bd)", maxWidth:200 }}>{s.project_title}</td>
                              <td style={{ padding:".6rem .75rem", borderBottom:"1px solid var(--bd)" }}>
                                <span className="badge bb" style={{ fontSize:".7rem" }}>{s.category}</span>
                              </td>
                              <td style={{ padding:".6rem .75rem", borderBottom:"1px solid var(--bd)", fontSize:".82rem", color:"var(--dim)" }}>{s.division}</td>
                              <td style={{ padding:".6rem .75rem", borderBottom:"1px solid var(--bd)", fontFamily:"var(--ff-m)", fontSize:".74rem", color:"var(--dim)", whiteSpace:"nowrap" }}>
                                {fmtFull(s.submitted_at)}
                              </td>
                              <td style={{ padding:".6rem .75rem", borderBottom:"1px solid var(--bd)", whiteSpace:"nowrap" }}>
                                <button className="proj-act-btn" style={{ color:"var(--red)" }}
                                  onClick={() => setDeleteRegSub(s)}>
                                  🗑
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* RUBRIC */}
            {/* HELP & FAQ — content lives in ADMIN_HELP (top of file). Keep it current. */}
            {adminTab==="help" && <>
              <div className="adm-h1">Help &amp; FAQ</div>
              <div className="adm-sub">How the system works, what to do and what to avoid. Last updated {ADMIN_HELP_UPDATED}.</div>
              {ADMIN_HELP.map(sec => (
                <div key={sec.title} className="card help-card">
                  <div className="help-title">{sec.icon} {sec.title}</div>
                  {sec.items && <ul className="help-list">{sec.items.map((t, i) => <li key={i}>{t}</li>)}</ul>}
                  {sec.faq && sec.faq.map(([q, a]) => (
                    <details key={q} className="help-faq">
                      <summary>{q}</summary>
                      <div>{a}</div>
                    </details>
                  ))}
                </div>
              ))}
            </>}

            {adminTab==="rubric" && (() => {
              const draftTotal = rubricDraft.reduce((s,c) => s + (Number(c.max)||0), 0);
              const hasScores  = Object.keys(scores).length > 0;
              const scoreCount = Object.keys(scores).length;
              // Shown in both edit and view mode (Reset to Default uses it too).
              const confirmPanel = rubricConfirm && (
                <div className="scan-msg warn" style={{ padding:"1rem", marginBottom:"1rem", fontSize:".86rem" }}>
                  <div style={{ fontWeight:700, marginBottom:".4rem" }}>⚠️ {rubricConfirm.impact.scoreCount} score{rubricConfirm.impact.scoreCount!==1?"s":""} already exist. This change will change project totals and rankings:</div>
                  <ul style={{ margin:"0 0 .6rem 1.1rem" }}>
                    {rubricConfirm.impact.removed.length > 0 && <li><b>Removed:</b> {rubricConfirm.impact.removed.join(", ")} — those points disappear from every total (the raw scores are kept and come back if you restore the criterion).</li>}
                    {rubricConfirm.impact.added.length > 0 && <li><b>Added:</b> {rubricConfirm.impact.added.join(", ")} — projects already scored get 0 for it until judges re-score them.</li>}
                    {rubricConfirm.impact.changed.length > 0 && <li><b>Points/steps changed:</b> {rubricConfirm.impact.changed.join(", ")} — existing scores keep their old values.</li>}
                  </ul>
                  <div style={{ marginBottom:".6rem" }}>Recommended: save a score backup first (it stores the current rubric too).</div>
                  <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" }}>
                    <button className="btn sec sm" style={{ width:"auto" }} disabled={savingBackup} onClick={saveScoreBackup}>
                      {savingBackup ? "⏳ Saving backup…" : backupSaved ? "✓ Backup saved" : "💾 Save score backup first"}
                    </button>
                    <button className="btn danger sm" style={{ width:"auto" }} disabled={rubricSaving} onClick={() => saveRubric(rubricConfirm.criteria)}>
                      {rubricSaving ? "Saving…" : "Yes, change the rubric"}
                    </button>
                    <button className="btn sec sm" style={{ width:"auto" }} onClick={() => setRubricConfirm(null)}>Cancel</button>
                  </div>
                </div>
              );
              const errBanner = rubricErr && <div className="err" style={{ marginBottom:"1rem" }}>⚠ {rubricErr}</div>;

              if (editingRubric) return (
                <div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.25rem", flexWrap:"wrap", gap:".75rem" }}>
                    <h2 style={{ fontFamily:"var(--ff-d)", fontSize:"1.2rem", color:"var(--navy)" }}>Edit Rubric</h2>
                    <div style={{ display:"flex", gap:".5rem" }}>
                      <button className="btn sec sm" style={{ width:"auto" }} onClick={() => { setEditingRubric(false); setRubricDraft([]); setRubricConfirm(null); setRubricErr(""); }}>Cancel</button>
                      <button className="btn sm" style={{ width:"auto" }} disabled={rubricSaving || rubricDraft.length === 0 || !!rubricConfirm}
                        onClick={() => requestSaveRubric(rubricDraft)}>
                        {rubricSaving ? "Saving…" : "Save Rubric"}
                      </button>
                    </div>
                  </div>

                  {errBanner}
                  {confirmPanel}
                  {hasScores && !rubricConfirm && (
                    <div style={{ background:"var(--amber-l)", border:"1px solid #d9770630", borderRadius:"var(--r)", padding:".85rem 1rem", marginBottom:"1rem", fontSize:".88rem", color:"var(--amber)" }}>
                      ⚠️ {scoreCount} score{scoreCount!==1?"s":""} already exist. Totals are always calculated with the <b>current</b> rubric —
                      removing a criterion, adding one, or changing its points will change every project&apos;s total and ranking.
                      Renaming a criterion or editing its description is safe. You will be asked to confirm before saving.
                    </div>
                  )}

                  {rubricDraft.map((c, idx) => (
                    <div className="rub-editor-card" key={c.id}>
                      <div className="rub-editor-head">
                        <span className="rub-editor-num">#{idx + 1}</span>
                        <span style={{ fontSize:".88rem", color:"var(--dim)", fontFamily:"var(--ff-m)", fontSize:".72rem" }}>{c.id}</span>
                        <div className="rub-editor-actions">
                          <button className="rub-move-btn" disabled={idx === 0} onClick={() => rubricDraftMove(idx, -1)}>↑</button>
                          <button className="rub-move-btn" disabled={idx === rubricDraft.length - 1} onClick={() => rubricDraftMove(idx, 1)}>↓</button>
                          <button className="rub-del-btn" onClick={() => rubricDraftDelete(idx)}>✕</button>
                        </div>
                      </div>
                      <div className="rub-editor-row">
                        <div>
                          <div className="lbl" style={{ marginBottom:".35rem" }}>Label</div>
                          <input value={c.label} placeholder="e.g. Presentation"
                            onChange={e => rubricDraftUpdate(idx, "label", e.target.value)} />
                        </div>
                        <div>
                          <div className="lbl" style={{ marginBottom:".35rem" }}>Max Points</div>
                          {/* Cap is 100, not 20: a weighted section can legitimately be worth
                              25 (Cibecue "Scientific Inquiry"). The old cap silently blocked it. */}
                          <input type="number" min="1" max="100" value={c.max}
                            onChange={e => {
                              const max = parseInt(e.target.value) || 1;
                              // Keep the steps that still fit and make sure the new max is one of
                              // them. Do NOT force a 0 — a no-zero rubric (ratings 1–5) is valid,
                              // and injecting 0 would let judges score below the intended floor.
                              const kept = c.steps.filter(s => s <= max);
                              const steps = [...new Set([...kept, max])].sort((a,b)=>a-b);
                              rubricDraftUpdate(idx, "max", max);
                              rubricDraftUpdate(idx, "steps", steps);
                              // Labels are positional; once the step count changes they no longer
                              // line up, so drop them rather than mislabel a button.
                              if (Array.isArray(c.stepLabels) && c.stepLabels.length !== steps.length) {
                                rubricDraftUpdate(idx, "stepLabels", undefined);
                              }
                            }} />
                        </div>
                      </div>
                      <div style={{ marginBottom:".65rem" }}>
                        <div className="lbl" style={{ marginBottom:".35rem" }}>Description</div>
                        <input value={c.desc} placeholder="What are judges evaluating?"
                          onChange={e => rubricDraftUpdate(idx, "desc", e.target.value)} />
                      </div>
                      <div>
                        <div className="lbl" style={{ marginBottom:".35rem" }}>Allowed Step Values <span style={{ color:"var(--dim)", fontWeight:400 }}>(comma-separated, at least 2, between 0 and {c.max})</span></div>
                        <input
                          defaultValue={c.steps.join(", ")}
                          placeholder={`e.g. 0, 1, 2, ${c.max}`}
                          onBlur={e => {
                            const parsed = parseSteps(e.target.value, c.max);
                            if (parsed) {
                              rubricDraftUpdate(idx, "steps", parsed);
                              if (Array.isArray(c.stepLabels) && c.stepLabels.length !== parsed.length) {
                                rubricDraftUpdate(idx, "stepLabels", undefined);
                              }
                            } else e.target.value = c.steps.join(", ");
                          }} />
                        {Array.isArray(c.stepLabels) && c.stepLabels.length === c.steps.length && (
                          <div style={{ fontSize:".76rem", color:"var(--dim)", marginTop:".3rem" }}>
                            Judges see: {c.stepLabels.map((l, i) => `${l} (${c.steps[i]})`).join(" · ")}
                          </div>
                        )}
                        <div style={{ fontSize:".78rem", color:"var(--dim)", marginTop:".3rem" }}>
                          Current: {c.steps.map(s => <span key={s} className="rub-steps-pill" style={{ marginRight:".25rem" }}>{s}</span>)}
                        </div>
                      </div>
                    </div>
                  ))}

                  <button className="btn sec" style={{ marginTop:".5rem" }} onClick={rubricDraftAdd}>
                    + Add Criterion
                  </button>

                  <div className="rub-total-row" style={{ marginTop:"1rem" }}>
                    <span style={{ color:"var(--dim)", fontSize:".9rem" }}>Total max points</span>
                    <span className="rub-total-pts">{draftTotal} pts</span>
                  </div>
                </div>
              );

              // ── VIEW MODE ─────────────────────────────────────────
              return (
                <div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.25rem", flexWrap:"wrap", gap:".75rem" }}>
                    <h2 style={{ fontFamily:"var(--ff-d)", fontSize:"1.2rem", color:"var(--navy)" }}>Scoring Rubric</h2>
                    <div style={{ display:"flex", gap:".5rem" }}>
                      <button className="btn sec sm" style={{ width:"auto" }} onClick={() => {
                        setRubricDraft(rubric.map(c => ({ ...c })));
                        setEditingRubric(true);
                      }}>
                        Edit Rubric
                      </button>
                    </div>
                  </div>
                  {errBanner}
                  {confirmPanel}

                  {/* Presets — same idea as the department presets: a starting point,
                      fully editable afterwards. Routed through requestSaveRubric() so an
                      existing set of scores still triggers the impact warning + backup offer. */}
                  <div className="card" style={{ marginBottom:"1rem" }}>
                    <div className="lbl" style={{ marginBottom:".35rem" }}>Start from a preset</div>
                    <p style={{ fontSize:".8rem", color:"var(--dim)", marginBottom:".6rem" }}>
                      Replaces the whole rubric. If scores already exist you will be shown what changes and offered a backup first.
                    </p>
                    <div className="setup-preset-grid">
                      {RUBRIC_PRESETS.map(p => {
                        const crit = p.criteria();
                        const total = crit.reduce((s, c) => s + (Number(c.max) || 0), 0);
                        const active = crit.length === rubric.length
                          && crit.every((c, i) => rubric[i]?.id === c.id && Number(rubric[i]?.max) === Number(c.max));
                        return (
                          <button key={p.id} className="setup-preset" disabled={rubricSaving || !!rubricConfirm}
                            onClick={() => requestSaveRubric(crit)}>
                            <strong>{p.label}{active ? " ✓" : ""}</strong>
                            <span>{p.desc}</span>
                            <em>{crit.length} criteria · {total} pts</em>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="card" style={{ padding:0, overflow:"hidden", marginBottom:"1rem" }}>
                    <table className="rub-view-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Criterion</th>
                          <th>Max</th>
                          <th>Steps</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rubric.map((r, i) => (
                          <tr key={r.id}>
                            <td style={{ color:"var(--dim)", fontFamily:"var(--ff-m)", fontSize:".78rem" }}>{i + 1}</td>
                            <td>
                              <div style={{ fontWeight:600, marginBottom:".2rem" }}>{r.label}</div>
                              <div style={{ fontSize:".8rem", color:"var(--dim)", lineHeight:1.5 }}>{r.desc}</div>
                            </td>
                            <td style={{ fontFamily:"var(--ff-m)", fontWeight:700, color:"var(--navy)" }}>{r.max}</td>
                            <td>{r.steps.map((s, i) => {
                              const lab = stepLabel(r, s, i);
                              return <span key={s} className="rub-steps-pill" style={{ marginRight:".25rem" }}>
                                {lab ? `${lab} (${s})` : s}
                              </span>;
                            })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="rub-total-row">
                    <span style={{ color:"var(--dim)", fontSize:".9rem" }}>Total max points</span>
                    <span className="rub-total-pts">{rubric.reduce((s,r) => s + r.max, 0)} pts</span>
                  </div>

                  {rubricId && (
                    <div style={{ marginTop:".75rem", fontSize:".78rem", color:"var(--dim)", fontFamily:"var(--ff-m)" }}>
                      Rubric ID: {rubricId}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* IT LOGS */}
            {adminTab==="itlogs" && (()=>{
              // ── PIN GATE ──
              if (!itUnlocked) return (
                <div className="pin-gate">
                  <div className="ico">🔐</div>
                  <h2>IT Access Required</h2>
                  <p>This section contains sensitive diagnostic data. Enter the IT PIN to continue.</p>
                  <div className="pin-dots">
                    {Array.from({ length: Math.max(4, itPin.length) }, (_, i) => i).map(i => (
                      <div key={i} className={`pin-dot ${itPin.length > i ? "filled" : ""}`} />
                    ))}
                  </div>
                  <div className="pin-input-wrap">
                    <input
                      type="password"
                      maxLength={8} inputMode="numeric"
                      placeholder="••••"
                      value={itPin}
                      className={itPinErr ? "pin-shake" : ""}
                      autoFocus
                      onChange={e => { setItPin(e.target.value.replace(/\D/g,"").slice(0,8)); setItPinErr(""); }}
                      onKeyDown={e => { if (e.key === "Enter") submitItPin(); }}
                    />
                    <div className="pin-err">{itPinErr}</div>
                    <button className="btn sm" style={{ width:"auto", marginTop:".75rem" }} disabled={itPin.length < 4} onClick={submitItPin}>
                      Unlock
                    </button>
                  </div>
                </div>
              );

              // ── UNLOCKED VIEW ──
              const filtered = itFilter==="ALL" ? itLogs : itLogs.filter(e=>e.level===itFilter);
              const errCount  = itLogs.filter(e=>e.level==="ERROR").length;
              const warnCount = itLogs.filter(e=>e.level==="WARN").length;
              return <div className="it-dark-wrap">
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:".75rem",marginBottom:".25rem"}}>
                  <div>
                    <div className="adm-h1" style={{color:"#e2e8f5"}}>IT Diagnostic Logs</div>
                    <div className="adm-sub" style={{marginBottom:0,color:"#6b7fa3"}}>Structured event log for debugging — copy & paste directly into AI for analysis.</div>
                  </div>
                  <div className="it-lock-badge" onClick={() => { setItUnlocked(false); setItPin(""); setItPinErr(""); addItLog("INFO","AUTH","IT_ACCESS_LOCKED","IT diagnostic logs manually locked",{ timestamp:fmtISO(Date.now()) }); }}>
                    🔒 Lock IT Logs
                  </div>
                </div>
                <div style={{marginBottom:"1.5rem"}} />
                {/* Quick stats */}
                <div className="stat-grid" style={{marginBottom:"1rem"}}>
                  <div className="stat-card" style={{background:"#0d1b30",border:"1px solid #1c2e4a"}}><div className="stat-v" style={{color:"#e2e8f5",fontSize:"1.5rem"}}>{itLogs.length}</div><div className="stat-l" style={{color:"#6b7fa3"}}>Total Events</div></div>
                  <div className="stat-card" style={{background:"#0d1b30",border:"1px solid #1c2e4a"}}><div className="stat-v" style={{color:"#ef4444",fontSize:"1.5rem"}}>{errCount}</div><div className="stat-l" style={{color:"#6b7fa3"}}>Errors</div></div>
                  <div className="stat-card" style={{background:"#0d1b30",border:"1px solid #1c2e4a"}}><div className="stat-v" style={{color:"#f59e0b",fontSize:"1.5rem"}}>{warnCount}</div><div className="stat-l" style={{color:"#6b7fa3"}}>Warnings</div></div>
                  <div className="stat-card" style={{background:"#0d1b30",border:"1px solid #1c2e4a"}}><div className="stat-v" style={{color:"#22c55e",fontSize:"1.5rem"}}>{itLogs.filter(e=>e.level==="INFO").length}</div><div className="stat-l" style={{color:"#6b7fa3"}}>Info</div></div>
                </div>

                {/* Toolbar */}
                <div className="it-toolbar">
                  {["ALL",...IT_LEVELS].map(lv => (
                    <button key={lv} className={`lvl-btn ${itFilter===lv?`f-${lv}`:""}`} onClick={()=>setItFilter(lv)}>
                      {lv==="ALL"?"ALL LEVELS":lv}
                      {lv!=="ALL" && <span style={{marginLeft:".35rem",opacity:.6}}>({itLogs.filter(e=>e.level===lv).length})</span>}
                    </button>
                  ))}
                  <div style={{flex:1}} />
                  <span className="it-count">{filtered.length} entries</span>
                  <button className={`copy-report-btn ${reportCopied?"done":""}`} onClick={handleCopyReport}>
                    {reportCopied ? "✓ Copied!" : "📋 Copy Full Report"}
                  </button>
                </div>

                {/* Terminal */}
                <div className="it-term">
                  <div className="it-term-head">
                    <div className="it-term-dots">
                      <span style={{background:"#ff5f57"}} />
                      <span style={{background:"#ffbd2e"}} />
                      <span style={{background:"#28c840"}} />
                    </div>
                    <span style={{fontFamily:"var(--ff-m)",fontSize:".72rem",color:"#3a6080"}}>
                      sciencefair.app / system.log — {filtered.length} events
                    </span>
                    <span style={{fontFamily:"var(--ff-m)",fontSize:".68rem",color:"#3a6080"}}>click row to expand payload</span>
                  </div>
                  <div className="it-body">
                    {filtered.length === 0 && (
                      <div className="it-empty">No {itFilter} events recorded.</div>
                    )}
                    {filtered.map(e => (
                      <div key={e.id}>
                        <div className={`it-row ${itExpanded[e.id]?"expanded":""}`} onClick={()=>toggleItRow(e.id)}>
                          <span className="it-ts">{fmtISO(e.ts)}</span>
                          <span className={`it-lvl ${e.level}`}>{e.level}</span>
                          <span className="it-mod">[{e.module}]</span>
                          <span className="it-msg"><strong>{e.event}</strong> — {e.detail}</span>
                        </div>
                        {itExpanded[e.id] && (
                          <div style={{padding:"0 1rem .5rem",background:"#0a1a2a"}}>
                            <div style={{fontFamily:"var(--ff-m)",fontSize:".68rem",color:"#3a6080",marginBottom:".25rem"}}>
                              EVENT ID: {e.id}
                            </div>
                            <div className="it-payload">{JSON.stringify(e.payload, null, 2)}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* System snapshot */}
                <div style={{marginTop:"1.25rem",background:"#0d1b30",border:"1px solid #1c2e4a",borderRadius:"var(--r)",padding:"1.5rem"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".75rem",flexWrap:"wrap",gap:".5rem"}}>
                    <div>
                      <div style={{fontFamily:"var(--ff-d)",fontSize:"1rem",marginBottom:".15rem",color:"#e2e8f5"}}>📸 System Snapshot</div>
                      <div style={{fontSize:".82rem",color:"#6b7fa3"}}>Current live state — paste into AI to diagnose issues</div>
                    </div>
                    <button className={`copy-report-btn ${snapCopied?"done":""}`} onClick={handleCopySnapshot}>
                      {snapCopied ? "✓ Copied!" : "📋 Copy Snapshot"}
                    </button>
                  </div>
                  <div className="snap-box">{buildSnapshot()}</div>
                </div>

                {/* How to use */}
                <div style={{marginTop:"1rem",background:"#0d1b30",border:"1px solid #1c2e4a",borderRadius:"var(--r)",padding:"1.5rem"}}>
                  <div style={{fontFamily:"var(--ff-d)",fontSize:"1rem",marginBottom:".75rem",color:"#e2e8f5"}}>💡 How to use with AI</div>
                  <div style={{fontSize:".88rem",color:"#6b7fa3",lineHeight:"1.8"}}>
                    <div>1. Filter by <strong style={{color:"#e2e8f5"}}>ERROR</strong> or <strong style={{color:"#e2e8f5"}}>WARN</strong> to isolate the issue.</div>
                    <div>2. Click <strong style={{color:"#e2e8f5"}}>Copy Full Report</strong> — it includes the system state + all log entries.</div>
                    <div>3. Paste into Claude or any AI with: <em style={{color:"#60a5fa"}}>"Here is my science fair app diagnostic report. What is causing the issue and how do I fix it?"</em></div>
                    <div>4. For live state issues, use <strong style={{color:"#e2e8f5"}}>Copy Snapshot</strong> to share the current data state.</div>
                  </div>
                </div>

                {/* Clear button */}
                <button className="btn danger sm" style={{width:"auto",marginTop:"1rem"}}
                  onClick={() => { setItLogs([]); addItLog("INFO","ADMIN","LOGS_CLEARED","IT logs cleared by admin",{ clearedAt:fmtISO(Date.now()), count: itLogs.length }); }}>
                  🗑 Clear All IT Logs
                </button>
              </div>;
            })()}

          </div>
        </div>
      </div>
    );
  }

  /* PUBLIC PROJECT LIST */
  if (view === "public-projects") {
    if (!projListChecked) return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{textAlign:"center",color:"var(--dim)"}}>
          <div style={{fontSize:"2rem",marginBottom:".75rem"}}>📋</div>
          <div style={{fontFamily:"var(--ff-b)"}}>Loading project list…</div>
        </div>
      </div>
    );

    if (!projListValid) return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
        <div className="card" style={{maxWidth:"400px",width:"100%",textAlign:"center",padding:"2rem"}}>
          <div style={{fontSize:"2.5rem",marginBottom:".75rem"}}>🔗</div>
          <div style={{fontWeight:700,fontSize:"1.1rem",marginBottom:".5rem"}}>Link Unavailable</div>
          <div style={{color:"var(--dim)",fontSize:".88rem"}}>This project list link is invalid or has been revoked by the administrator.</div>
        </div>
      </div>
    );

    const deptBadgeClass = (name) => {
      const n = (name||"").toLowerCase();
      return n.includes("elem") ? "bg" : n.includes("middle") ? "ba" : n.includes("high") ? "bb" : "bp";
    };

    return (
      <div className="pub-wrap">
        <div className="pub-inner">
          <div className="pub-hero">
            <img src="/logo.png" alt="School logo" style={{height:"60px",marginBottom:"1rem",borderRadius:"8px"}} onError={e => e.target.style.display="none"} />
            <div style={{fontFamily:"var(--ff-d)",fontSize:"1.6rem",fontWeight:900,color:"var(--navy)",marginBottom:".35rem"}}>
              Science Fair — Project List
            </div>
            <div style={{color:"var(--dim)",fontSize:".88rem"}}>{projects.length} project{projects.length!==1?"s":""} registered</div>
          </div>

          {departments.filter(d => d.id).map(dept => {
            const deptProjects = projects.filter(p => p.department_id === dept.id).sort((a,b) => a.num.localeCompare(b.num));
            if (deptProjects.length === 0) return null;
            return (
              <div key={dept.id} style={{marginBottom:"1.75rem"}}>
                <div style={{display:"flex",alignItems:"center",gap:".6rem",marginBottom:".75rem"}}>
                  <span className={`badge ${deptBadgeClass(dept.name)}`} style={{fontSize:".78rem",padding:".25rem .75rem"}}>{dept.name}</span>
                  <span style={{fontSize:".78rem",color:"var(--dim)"}}>{deptProjects.length} project{deptProjects.length!==1?"s":""}</span>
                </div>
                <div className="card" style={{padding:0,overflow:"hidden"}}>
                  {deptProjects.map((p, i) => (
                    <div key={p.id} style={{padding:".85rem 1.1rem",borderBottom: i < deptProjects.length-1 ? "1px solid var(--bd)" : "none"}}>
                      <div style={{display:"flex",alignItems:"flex-start",gap:".75rem"}}>
                        <span style={{fontFamily:"var(--ff-m)",fontSize:".78rem",color:"var(--navy)",flexShrink:0,paddingTop:".15rem"}}>#{p.num}</span>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:".95rem",lineHeight:1.3,marginBottom:".2rem"}}>{p.title}</div>
                          <div style={{fontSize:".75rem",color:"var(--dim)"}}>
                            {p.cat}{p.grade ? ` · Grade ${p.grade}` : ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Unassigned projects */}
          {(() => {
            const unassigned = projects.filter(p => !p.department_id).sort((a,b) => a.num.localeCompare(b.num));
            if (unassigned.length === 0) return null;
            return (
              <div style={{marginBottom:"1.75rem"}}>
                <div style={{display:"flex",alignItems:"center",gap:".6rem",marginBottom:".75rem"}}>
                  <span className="badge br" style={{fontSize:".78rem",padding:".25rem .75rem"}}>Unassigned</span>
                  <span style={{fontSize:".78rem",color:"var(--dim)"}}>{unassigned.length} project{unassigned.length!==1?"s":""}</span>
                </div>
                <div className="card" style={{padding:0,overflow:"hidden"}}>
                  {unassigned.map((p, i) => (
                    <div key={p.id} style={{padding:".85rem 1.1rem",borderBottom: i < unassigned.length-1 ? "1px solid var(--bd)" : "none"}}>
                      <div style={{display:"flex",alignItems:"flex-start",gap:".75rem"}}>
                        <span style={{fontFamily:"var(--ff-m)",fontSize:".78rem",color:"var(--navy)",flexShrink:0,paddingTop:".15rem"}}>#{p.num}</span>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:".95rem",lineHeight:1.3,marginBottom:".2rem"}}>{p.title}</div>
                          <div style={{fontSize:".75rem",color:"var(--dim)"}}>
                            {p.cat}{p.grade ? ` · Grade ${p.grade}` : ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div style={{textAlign:"center",marginTop:"2rem",fontSize:".75rem",color:"var(--dim)"}}>
            Powered by Dishchiibikoh Community School · Science Fair Judging System
          </div>
        </div>
      </div>
    );
  }

  /* PUBLIC RESULTS */
  if (view === "public-results") {
    // A ?token= link must resolve to a live, unrevoked share_links row. Visitors who
    // arrived from the school landing card (isLinkLive) or an authenticated admin
    // previewing the page are allowed through without a token.
    if (urlShareToken && !shareTokenChecked) return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{textAlign:"center",color:"var(--dim)"}}>
          <div style={{fontSize:"2rem",marginBottom:".75rem"}}>🏆</div>
          <div style={{fontFamily:"var(--ff-b)"}}>Loading results…</div>
        </div>
      </div>
    );
    if (urlShareToken && !shareTokenValid) return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
        <div className="card" style={{maxWidth:"400px",width:"100%",textAlign:"center",padding:"2rem"}}>
          <div style={{fontSize:"2.5rem",marginBottom:".75rem"}}>🔗</div>
          <div style={{fontWeight:700,fontSize:"1.1rem",marginBottom:".5rem"}}>Link Unavailable</div>
          <div style={{color:"var(--dim)",fontSize:".88rem"}}>
            This results link is invalid, has expired, or was revoked by the administrator.
          </div>
        </div>
      </div>
    );

    const podCols = ["var(--amber)","#64748b","#b45309"];

    // Helper: render podium + ranked table for a given set of projects
    function DeptResults({ deptProjects, deptName }) {
      const scored   = deptProjects.filter(p => p.avg);
      const unscored = deptProjects.filter(p => !p.avg);
      const top3     = scored.slice(0, 3);
      return (
        <>
          {top3.length > 0 && (
            <div className="podium-wrap">
              {[top3[1], top3[0], top3[2]].filter(Boolean).map((p, vi) => {
                const ri = p===top3[0]?0:p===top3[1]?1:2;
                return (
                  <div key={p.id} className={`podium-card p${ri+1}`}
                    style={{ width:ri===0?"200px":"168px", order:[1,0,2][vi] }}>
                    <div className="p-medal">{MEDALS[ri]}</div>
                    <div className="p-score" style={{color:podCols[ri]}}>{p.avg}</div>
                    <div style={{fontSize:".65rem",color:"var(--dim)",marginTop:".1rem"}}>/{projectMax(p)} pts</div>
                    <div className="p-title">{p.title}</div>
                    {finalDecisions[p.id]?.finalized && finalDecisions[p.id]?.award !== "No Award" && finalDecisions[p.id]?.award !== "Pending" && (
                      <div style={{marginTop:".35rem"}}>
                        <span className={`award-badge sm ${awardBadgeClass(finalDecisions[p.id].award)}`}>
                          {awardEmoji(finalDecisions[p.id].award)} {finalDecisions[p.id].award}
                        </span>
                      </div>
                    )}
                    <div className="p-cat"><span className="badge bb">{p.cat}</span></div>
                    <div className="p-revs">{p.revs} review{p.revs!==1?"s":""}</div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{marginBottom:".75rem",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:".5rem"}}>
            <div style={{fontFamily:"var(--ff-d)",fontSize:"1.05rem"}}>{deptName} — All Projects</div>
            <span className="badge bg">{scored.length} scored · {unscored.length} pending</span>
          </div>
          <div className="results-table">
            {scored.map((p, i) => (
              <div key={p.id} className="res-row">
                <div className="res-rank">{i < 3 ? MEDALS[i] : <span>{i+1}</span>}</div>
                <div>
                  <div className="res-title">
                    {p.title}
                    {finalDecisions[p.id]?.finalized && finalDecisions[p.id]?.award !== "No Award" && finalDecisions[p.id]?.award !== "Pending" && (
                      <span className={`award-badge sm ${awardBadgeClass(finalDecisions[p.id].award)}`} style={{marginLeft:".5rem",verticalAlign:"middle"}}>
                        {awardEmoji(finalDecisions[p.id].award)} {finalDecisions[p.id].award}
                      </span>
                    )}
                  </div>
                  <div className="res-meta">{p.cat} · Grade {p.grade} · {p.revs} review{p.revs!==1?"s":""}</div>
                  {shareShowRubric && (
                    <div className="rub-chips">
                      {rubric.map(r => {
                        const avg = rubAvg(p.id, r.id);
                        if (!avg) return null;
                        return <span key={r.id} className="rub-chip">{r.label.split(" ")[0]}: {avg}/{r.max}</span>;
                      })}
                    </div>
                  )}
                </div>
                <div className="res-score">
                  <div className="res-score-big">{p.avg}</div>
                  <div className="res-score-sub">/{projectMax(p)}</div>
                </div>
              </div>
            ))}
            {unscored.map(p => (
              <div key={p.id} className="res-row" style={{opacity:.35}}>
                <div className="res-rank">—</div>
                <div>
                  <div className="res-title">{p.title}</div>
                  <div className="res-meta">{p.cat} · Grade {p.grade} · Awaiting scores</div>
                </div>
                <div className="res-score"><div style={{fontFamily:"var(--ff-m)",color:"var(--dim)",fontSize:".85rem"}}>TBD</div></div>
              </div>
            ))}
          </div>
        </>
      );
    }

    const allRanked = rankedProjects();

    return (
      <div className="app"><style>{CSS}</style>{backdrop}
        <div className="glow purple" />
        <div className="pub-wrap">
          <div className="pub-inner">

            {/* Hero */}
            <div className="pub-hero">
              <div style={{fontSize:"3.5rem",marginBottom:".5rem"}}>🏆</div>
              <h1>{shareTitle || "Science Fair SY 2025-2026 — Final Results"}</h1>
              <p>Final rankings · {judges.length} judges · {totalScored()} evaluations</p>
              <div className="live-chip">● RESULTS PUBLISHED · {shareCreated ? fmtFull(shareCreated) : "Today"}</div>
            </div>

            {/* Per-department sections */}
            {departments.map(dept => {
              // Comment-only department: every project is a participant. No podium,
              // no ranks, no scores — showing a "1st" here would contradict the
              // whole point of not scoring these grades.
              if (dept.scoring_mode === "feedback") {
                const parts = participantsIn(dept.id);
                if (!parts.length) return null;
                return (
                  <div key={dept.id}>
                    <div style={{fontFamily:"var(--ff-d)",fontSize:"1.4rem",color:"var(--navy)",margin:"2rem 0 1rem",borderBottom:"2px solid var(--bd)",paddingBottom:".5rem"}}>
                      {dept.name} <span className="badge bp" style={{fontSize:".7rem",verticalAlign:"middle"}}>Everyone is a winner</span>
                    </div>
                    <div className="card" style={{padding:0,overflow:"hidden"}}>
                      {parts.map((p, i) => (
                        <div key={p.id} style={{padding:".8rem 1.1rem",borderBottom: i < parts.length-1 ? "1px solid var(--bd)" : "none",display:"flex",gap:".75rem",alignItems:"flex-start"}}>
                          <span style={{fontSize:"1.1rem",flexShrink:0}}>🌟</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:600,fontSize:".95rem",lineHeight:1.3}}>{p.title}</div>
                            <div style={{fontSize:".76rem",color:"var(--dim)",fontFamily:"var(--ff-m)",marginTop:".15rem"}}>#{p.num}</div>
                            {p.commendations.length > 0 && (
                              <div style={{marginTop:".35rem",display:"flex",flexWrap:"wrap",gap:".25rem"}}>
                                {[...new Set(p.commendations)].map(c => <span key={c} className="badge bp">{c}</span>)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              const deptProjects = allRanked.filter(p => p.department_id === dept.id);
              if (!deptProjects.length) return null;
              return (
                <div key={dept.id}>
                  <div style={{fontFamily:"var(--ff-d)",fontSize:"1.4rem",color:"var(--navy)",margin:"2rem 0 1rem",borderBottom:"2px solid var(--bd)",paddingBottom:".5rem"}}>
                    {dept.name}
                  </div>
                  <DeptResults deptProjects={deptProjects} deptName={dept.name} />
                </div>
              );
            })}

            {/* Unassigned projects (safety net) */}
            {(() => {
              const unassigned = allRanked.filter(p => !p.department_id);
              if (!unassigned.length) return null;
              return (
                <div>
                  <div style={{fontFamily:"var(--ff-d)",fontSize:"1.4rem",color:"var(--dim)",margin:"2rem 0 1rem",borderBottom:"2px solid var(--bd)",paddingBottom:".5rem"}}>
                    Other Projects
                  </div>
                  <DeptResults deptProjects={unassigned} deptName="Other" />
                </div>
              );
            })()}

            <div className="pub-footer">
              <strong>{shareTitle || "Science Fair SY 2025-2026"}</strong><br />
              Scores are final averages across all assigned judges.<br />
              All judge identities remain anonymous.
            </div>

            {/* Admin back button (preview only) */}
            <div style={{textAlign:"center",paddingBottom:"2rem"}}>
              <button className="btn sec sm" style={{width:"auto"}} onClick={() => setView("admin-home")}>← Back to Admin</button>
            </div>

          </div>
        </div>
      </div>
    );
  }

  return null;
}
