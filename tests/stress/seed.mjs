// Creates the FAKE fair in the staging project. Writes nothing anywhere else.
//
//   node tests/stress/seed.mjs            (re-running replaces the previous fake fair)
//
// Shape mirrors the real 2026-27 fair so the numbers mean something: 63 projects split
// PreK 2 / K-5 8 / 6-8 31 / 9-12 19 / SPED 3, the three real 2026-27 forms, a 12-round timed
// schedule. Scaled to 30 judge numbers (the brief asks to plan for up to 30) instead of 15.
//
// No real student, teacher or judge names. Every project is "Stress Test Project NNN" and
// every judge is a number. Nothing here is copied from the live database.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { banner, rest } from "./env.mjs";
import { PRESETS, DEFAULT_CATEGORIES } from "./fixtures.mjs";

export const SLUG = "stress-test-fair";          // cleanup.mjs keys off this exact slug
export const INVITE = "STRESS26";
const PIN = "246813";

// Two schedule shapes. They share the school, projects, rubrics and categories; only the
// judge allocation and the visits differ.
//
//   load  (default) - 30 judge numbers, round-robin inside each department. Built to create
//                     concurrency for the load tests; it is NOT the real fair's shape.
//   event (--shape=event) - 15 judges and the REAL 2026-27 visit structure: every scored
//                     project visited by exactly 3 different judges, every PreK and SPED
//                     project by exactly 1. 179 visits, the same as the live schedule.
//                     Needed for coverage questions ("what if a judge does not turn up"),
//                     where the load shape would hide the risk by giving PreK 2 visits.
const SHAPE = process.argv.includes("--shape=event") ? "event" : "load";

const c = banner("SEED - create the fake fair in staging");

const ins = async (table, rows, label) => {
  const r = await rest(c, `/${table}`, {
    method: "POST", admin: true, body: rows,
    headers: { Prefer: "return=representation" },
  });
  if (!r.ok) throw new Error(`insert ${table} failed: ${r.status} ${JSON.stringify(r.data)}`);
  console.log(`  ${String(r.data.length).padStart(4)} ${label || table}`);
  return r.data;
};

// -- 0. Remove any previous fake fair (cascades). Only ever this one slug. ------------
const old = await rest(c, `/schools?slug=eq.${SLUG}&select=id`, { admin: true });
if (old.data?.length) {
  await rest(c, `/schools?slug=eq.${SLUG}`, { method: "DELETE", admin: true });
  console.log(`\nRemoved the previous fake fair (${old.data.length} school row, cascaded).`);
}

// -- 1. School -----------------------------------------------------------------------
console.log("\nCreating:");
const [school] = await ins("schools",
  [{ name: "Stress Test Fair (FAKE - not a real school)", slug: SLUG, invite_code: INVITE, admin_pin: PIN }],
  "school");
const sid = school.id;

// -- 2. Rubrics - the three real 2026-27 forms ---------------------------------------
const wanted = [
  ["isef-ms-hs-2627", "Middle & High School form (2026-27)", true],   // the school default
  ["elementary-2627", "Elementary form (2026-27)", false],
  ["prek-sped-2627", "PreK & SPED Recognition (2026-27)", false],
];
const rubrics = {};
for (const [pid, name, isDefault] of wanted) {
  const [row] = await ins("rubrics",
    [{ school_id: sid, name, criteria: PRESETS[pid].criteria, is_active: isDefault }], `rubric - ${name}`);
  rubrics[pid] = row.id;
}

// -- 3. Categories -------------------------------------------------------------------
await ins("categories",
  DEFAULT_CATEGORIES.map((cat, i) => ({ school_id: sid, name: cat.name ?? cat, code: cat.code ?? null, ord: i })),
  "categories");
const catNames = DEFAULT_CATEGORIES.map((x) => x.name ?? x);

// -- 4. Departments - same split and forms as the live fair --------------------------
// judges: how many judge NUMBERS cover it. One scored department per judge (rule 73).
// `judges` is the load shape's allocation; the event shape assigns judges in step 6 instead,
// mirroring the split the app's own Suggested setup produces for 15 judges (K-5 3 / 6-8 7 /
// 9-12 5, with PreK and SPED carried by two of the K-5 judges).
const DEPTS = [
  { name: "PreK", code: "PK", projects: 2, rubric: "prek-sped-2627", judges: 2, grade: "PreK" },
  { name: "K-5", code: "K5", projects: 8, rubric: "elementary-2627", judges: 4, grade: "4" },
  { name: "6-8", code: "G68", projects: 31, rubric: "isef-ms-hs-2627", judges: 12, grade: "7" },
  { name: "9-12", code: "G912", projects: 19, rubric: "isef-ms-hs-2627", judges: 10, grade: "10" },
  { name: "SPED", code: "SPED", projects: 3, rubric: "prek-sped-2627", judges: 2, grade: "6" },
];
const VISITS_SCORED = 3, VISITS_RECOGNITION = 1;   // the live schedule's structure
const deptRows = await ins("departments", DEPTS.map((d, i) => ({
  school_id: sid, name: d.name, code: d.code, ord: i,
  max_judges: d.judges, scoring_mode: "scored", rubric_id: rubrics[d.rubric],
})), "departments");
const deptId = Object.fromEntries(deptRows.map((r) => [r.name, r.id]));

// -- 5. Projects ---------------------------------------------------------------------
let n = 0;
const projects = [];
for (const d of DEPTS) {
  for (let i = 0; i < d.projects; i++) {
    n++;
    projects.push({
      id: `p_st${String(n).padStart(4, "0")}`, school_id: sid,
      num: String(n).padStart(3, "0"),
      title: `Stress Test Project ${String(n).padStart(3, "0")}`,
      cat: catNames[n % catNames.length], grade: d.grade,
      department_id: deptId[d.name], room: String(100 + n),
      description: "Synthetic project used for load testing. No real student work.",
    });
  }
}
for (let i = 0; i < projects.length; i += 40) await ins("projects", projects.slice(i, i + 40), "projects");

// -- 6. Judge roster + 7. Schedule ---------------------------------------------------
// Both shapes produce: `roster` (judge number -> departments), `judgeDept` (number -> its
// FIRST department, for reporting) and `visits` (one row per scheduled visit).
const roster = [];          // { school_id, judge_number, department_id }
const judgeDept = {};       // judge number -> department name (first/primary)
const visits = [];          // { school_id, judge_number, round_no, project_id }
const projectsIn = (name) => projects.filter((p) => p.department_id === deptId[name]);
const addRoster = (jn, deptName) => {
  roster.push({ school_id: sid, judge_number: jn, department_id: deptId[deptName] });
  if (!judgeDept[jn]) judgeDept[jn] = deptName;
};

let ROUNDS;

if (SHAPE === "load") {
  // Round-robin inside each department: judge j of a department visits project (j + round).
  // Each judge gets distinct projects across rounds, and within a round no two judges share a
  // project, because every department here has more projects than it has judges.
  ROUNDS = 12;
  let num = 0;
  for (const d of DEPTS) {
    for (let i = 0; i < d.judges; i++) { num++; addRoster(num, d.name); }
  }
  for (const d of DEPTS) {
    const mine = projectsIn(d.name);
    const nums = Object.keys(judgeDept).filter((k) => judgeDept[k] === d.name).map(Number);
    nums.forEach((jn, j) => {
      for (let k = 0; k < Math.min(ROUNDS, mine.length); k++) {
        visits.push({ school_id: sid, judge_number: jn, round_no: k + 1, project_id: mine[(j + k) % mine.length].id });
      }
    });
  }
} else {
  // EVENT shape - the live 2026-27 structure.
  //   judges 1-3   K-5   (judge 1 also covers PreK, judge 2 also covers SPED)
  //   judges 4-10  6-8
  //   judges 11-15 9-12
  // Every scored project gets VISITS_SCORED different judges; PreK and SPED get
  // VISITS_RECOGNITION. Totals: 8*3 + 31*3 + 19*3 + 2*1 + 3*1 = 179 visits, 15 judges.
  const PANEL = { "K-5": [1, 2, 3], "6-8": [4, 5, 6, 7, 8, 9, 10], "9-12": [11, 12, 13, 14, 15] };
  const SOLO = { PreK: 1, SPED: 2 };          // the single judge who visits that department

  for (const [deptName, nums] of Object.entries(PANEL)) for (const jn of nums) addRoster(jn, deptName);
  for (const [deptName, jn] of Object.entries(SOLO)) addRoster(jn, deptName);

  // Each judge's visits, before rounds are assigned.
  const perJudge = new Map(roster.map((r) => [r.judge_number, []]));
  for (const [deptName, nums] of Object.entries(PANEL)) {
    projectsIn(deptName).forEach((p, i) => {
      // Three CONSECUTIVE judges from the panel, so each project gets 3 distinct judges and
      // the load spreads evenly. Requires a panel of at least VISITS_SCORED judges.
      for (let v = 0; v < VISITS_SCORED; v++) perJudge.get(nums[(i + v) % nums.length]).push(p.id);
    });
  }
  for (const [deptName, jn] of Object.entries(SOLO)) {
    for (const p of projectsIn(deptName)) for (let v = 0; v < VISITS_RECOGNITION; v++) perJudge.get(jn).push(p.id);
  }

  // Rounds: each judge works through their own list, one project per round.
  ROUNDS = Math.max(...[...perJudge.values()].map((l) => l.length));
  for (const [jn, list] of perJudge) {
    list.forEach((pid, k) => visits.push({ school_id: sid, judge_number: jn, round_no: k + 1, project_id: pid }));
  }
}

// Creating a department fires the numbering trigger (migration 2026-10g/10k), which gives it
// a default block of judge numbers and writes its own roster rows. Clear those before laying
// down the roster this run actually wants, or the insert collides on the primary key.
await rest(c, `/judge_roster?school_id=eq.${sid}`, { method: "DELETE", admin: true });
await ins("judge_roster", roster, `judge roster rows (${new Set(roster.map((r) => r.judge_number)).size} judge numbers, ${SHAPE} shape)`);

// Keep the legacy judge_from/judge_to columns in step with the roster. Nothing in the scoring
// path reads them once a roster exists, but a stale range makes the Setup screen disagree with
// the grid. Derived from the roster itself, so it is correct for either shape (overlapping
// ranges are allowed since migration 2026-10h).
for (const d of DEPTS) {
  const nums = roster.filter((r) => r.department_id === deptId[d.name]).map((r) => r.judge_number);
  if (!nums.length) continue;
  await rest(c, `/departments?id=eq.${deptId[d.name]}`, {
    method: "PATCH", admin: true, body: { judge_from: Math.min(...nums), judge_to: Math.max(...nums) },
  });
}

for (let i = 0; i < visits.length; i += 100) await ins("judge_schedule", visits.slice(i, i + 100), "schedule visits");

// -- 8. Slots + settings -------------------------------------------------------------
// 8:30 start, 7-minute visits, 1-minute gaps, breaks after rounds 4 and 8 (SCHED_TPL_DEFAULT).
const hhmm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const slots = [];
let t = 8 * 60 + 30;
for (let r = 1; r <= ROUNDS; r++) {
  slots.push({ kind: "round", no: r, label: `R${r}`, start: hhmm(t), end: hhmm(t + 7) });
  t += 8;
  if (r === 4 || r === 8) { slots.push({ kind: "break", label: "BREAK", start: hhmm(t), end: hhmm(t + 5) }); t += 5; }
}
slots.push({ kind: "break", label: "WRAP-UP", start: hhmm(t), end: hhmm(t + 14) });

await ins("app_settings", [
  { school_id: sid, key: "judge_numbering", value: "school" },
  { school_id: sid, key: "judge_max", value: String(Math.max(...roster.map((r) => r.judge_number))) },
  { school_id: sid, key: "school_year", value: "2026-2027" },
  { school_id: sid, key: "min_place_pct", value: "0" },
  { school_id: sid, key: "judging_schedule", value: JSON.stringify(slots) },
  { school_id: sid, key: "locked", value: "false" },
], "app_settings");

// -- 9. An admin account, for the checks that need the admin screens ------------------
// Created through the Auth Admin API with the secret key and email_confirm: true, so it does
// not depend on the project's email provider or confirmation settings. Staging only: this
// account exists solely inside the throwaway project.
const ADMIN_EMAIL = `stress-admin@example.invalid`;
const ADMIN_PASSWORD = `Stress-${c.ref.slice(0, 6)}-2627`;
let adminUserId = null;
{
  const mk = await fetch(`${c.auth}/admin/users`, {
    method: "POST",
    headers: { apikey: c.secret, Authorization: `Bearer ${c.secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true }),
  });
  const body = await mk.json().catch(() => ({}));
  adminUserId = body?.id || null;
  if (!adminUserId) {
    // Already exists from a previous run - look it up instead of failing the seed.
    const list = await fetch(`${c.auth}/admin/users?per_page=200`, {
      headers: { apikey: c.secret, Authorization: `Bearer ${c.secret}` },
    }).then((r) => r.json()).catch(() => ({}));
    adminUserId = (list?.users || []).find((u) => u.email === ADMIN_EMAIL)?.id || null;
  }
  if (adminUserId) {
    await rest(c, "/school_admins", {
      method: "POST", admin: true, body: [{ school_id: sid, user_id: adminUserId }],
      headers: { Prefer: "resolution=merge-duplicates" },
    });
    console.log(`     1 admin account (${ADMIN_EMAIL})`);
  } else {
    console.log(`     ! admin account could not be created - admin-screen checks will be skipped`);
  }
}

// -- 10. Hand the test scripts what they need ----------------------------------------
mkdirSync(fileURLToPath(new URL("./out/", import.meta.url)), { recursive: true });
const manifest = {
  seededAt: new Date().toISOString(), ref: c.ref, schoolId: sid, slug: SLUG, invite: INVITE, pin: PIN,
  departments: deptRows.map((d) => ({ id: d.id, name: d.name })),
  judgeDept, judgeNumbers: Object.keys(judgeDept).map(Number),
  rubricByDept: Object.fromEntries(DEPTS.map((d) => [d.name, d.rubric])),
  projects: projects.map((p) => ({
    id: p.id, num: p.num, grade: p.grade,
    dept: Object.keys(deptId).find((k) => deptId[k] === p.department_id),
  })),
  shape: SHAPE,
  visits: visits.length, rounds: ROUNDS,
  // How many visits each project is scheduled to receive - what expectedReviews() in the app
  // compares against. The coverage test needs this to say what "missing a review" means.
  visitsByProject: Object.fromEntries(projects.map((p) => [p.id, visits.filter((v) => v.project_id === p.id).length])),
  // Which judge numbers visit each project, so a test can say exactly what one absence costs.
  judgesByProject: Object.fromEntries(projects.map((p) => [p.id, [...new Set(visits.filter((v) => v.project_id === p.id).map((v) => v.judge_number))]])),
  admin: adminUserId ? { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, userId: adminUserId } : null,
};
writeFileSync(new URL("./out/seeded.json", import.meta.url), JSON.stringify(manifest, null, 2));

console.log(`\nFake fair ready.`);
console.log(`  school id   : ${sid}`);
const judgeCount = new Set(roster.map((r) => r.judge_number)).size;
const perProject = {};
for (const p of projects) { const n = visits.filter((v) => v.project_id === p.id).length; perProject[n] = (perProject[n] || 0) + 1; }
console.log(`  shape       : ${SHAPE}`);
console.log(`  projects    : ${projects.length}   judges: ${judgeCount}   visits: ${visits.length} over ${ROUNDS} rounds`);
console.log(`  visits/proj : ${Object.entries(perProject).sort().map(([n, c2]) => `${c2} project(s) x ${n}`).join(", ")}`);
console.log(`  manifest    : tests/stress/out/seeded.json`);
console.log(`\nProduction (evrupqnhgrfltfhafeyj) was not contacted.`);
