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
const DEPTS = [
  { name: "PreK", code: "PK", projects: 2, rubric: "prek-sped-2627", judges: 2, grade: "PreK" },
  { name: "K-5", code: "K5", projects: 8, rubric: "elementary-2627", judges: 4, grade: "4" },
  { name: "6-8", code: "G68", projects: 31, rubric: "isef-ms-hs-2627", judges: 12, grade: "7" },
  { name: "9-12", code: "G912", projects: 19, rubric: "isef-ms-hs-2627", judges: 10, grade: "10" },
  { name: "SPED", code: "SPED", projects: 3, rubric: "prek-sped-2627", judges: 2, grade: "6" },
];
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

// -- 6. Judge roster - judge numbers 1..30, one department each ----------------------
const roster = [];
const judgeDept = {};         // number -> department name
let num = 0;
for (const d of DEPTS) {
  for (let i = 0; i < d.judges; i++) {
    num++;
    roster.push({ school_id: sid, judge_number: num, department_id: deptId[d.name] });
    judgeDept[num] = d.name;
  }
}
// Creating a department fires the numbering trigger (migration 2026-10g/10k), which gives it
// a default block of judge numbers and writes its own roster rows. Clear those before laying
// down the roster this test actually wants, or the insert collides on the primary key.
await rest(c, `/judge_roster?school_id=eq.${sid}`, { method: "DELETE", admin: true });
await ins("judge_roster", roster, "judge roster rows (judge numbers 1-30)");

// Keep the legacy judge_from/judge_to columns in step with the roster, since the trigger set
// them from its own numbering. Nothing in the scoring path reads them once a roster exists,
// but a stale range would make the admin Setup screen disagree with the grid.
let lo = 0;
for (const d of DEPTS) {
  const from = lo + 1, to = lo + d.judges; lo = to;
  await rest(c, `/departments?id=eq.${deptId[d.name]}`, {
    method: "PATCH", admin: true, body: { judge_from: from, judge_to: to },
  });
}

// -- 7. Schedule - 12 rounds, round-robin within each department ---------------------
// Judge j of a department visits project (j + round) mod n, which gives each judge distinct
// projects across rounds AND distinct projects per round between judges (no booth clash),
// because every department has more projects than it has judges.
const ROUNDS = 12;
const visits = [];
for (const d of DEPTS) {
  const mine = projects.filter((p) => p.department_id === deptId[d.name]);
  const nums = Object.keys(judgeDept).filter((k) => judgeDept[k] === d.name).map(Number);
  nums.forEach((jn, j) => {
    for (let k = 0; k < Math.min(ROUNDS, mine.length); k++) {
      visits.push({ school_id: sid, judge_number: jn, round_no: k + 1, project_id: mine[(j + k) % mine.length].id });
    }
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
  { school_id: sid, key: "judge_max", value: "30" },
  { school_id: sid, key: "school_year", value: "2026-2027" },
  { school_id: sid, key: "min_place_pct", value: "0" },
  { school_id: sid, key: "judging_schedule", value: JSON.stringify(slots) },
  { school_id: sid, key: "locked", value: "false" },
], "app_settings");

// -- 9. Hand the test scripts what they need -----------------------------------------
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
  visits: visits.length, rounds: ROUNDS,
};
writeFileSync(new URL("./out/seeded.json", import.meta.url), JSON.stringify(manifest, null, 2));

console.log(`\nFake fair ready.`);
console.log(`  school id   : ${sid}`);
console.log(`  projects    : ${projects.length}   judges: ${roster.length}   visits: ${visits.length} over ${ROUNDS} rounds`);
console.log(`  manifest    : tests/stress/out/seeded.json`);
console.log(`\nProduction (evrupqnhgrfltfhafeyj) was not contacted.`);
