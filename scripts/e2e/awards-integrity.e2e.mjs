// Browser E2E — award integrity fixes (FIXES_2026-11.md F7).
//   F7a  a project given Honorable Mention / Best in Category / No Award is out of the running for
//        1st–3rd (the medal passes on), and "Confirm" never overwrites those awards.
// Run: see scan.e2e.mjs header (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { freshStore, installMock, DEPTS, SID } from "./mock.mjs";

const BASE = "http://localhost:5199";
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });

const store = freshStore();
store.rubrics.push({ id: "rub1", school_id: SID, name: "Default", is_active: true, criteria: [] }); // → the 42-point rubric
const now = new Date().toISOString();
const old = "2026-01-01T00:00:00.000Z";
const LS = "Life Science";
const P = [
  // id, num, title, dept, total
  ["e1", "101", "Ant Farm",       DEPTS.D_ELEM, 40],
  ["e2", "102", "Paper Planes",   DEPTS.D_ELEM, 30],
  ["e3", "103", "Rain Gauge",     DEPTS.D_ELEM, 20],
  ["e4", "104", "Shadow Clock",   DEPTS.D_ELEM, 10],
  ["h1", "301", "Hydro Cells",    DEPTS.D_HIGH, 50],
  ["h2", "302", "Ion Traps",      DEPTS.D_HIGH, 40],
  ["h3", "303", "Jet Nozzles",    DEPTS.D_HIGH, 30],
  ["h4", "304", "Kite Lift",      DEPTS.D_HIGH, 20],
];
for (const [id, num, title, dept] of P)
  store.projects.push({ id, school_id: SID, num, title, cat: LS, grade: "8", locked: false, department_id: dept, room: "", description: "", motivation: "", created_at: now });
store.judges.push({ id: "j_a", school_id: SID, alias: "Judge1", department_id: DEPTS.D_ELEM, department_ids: [DEPTS.D_ELEM, DEPTS.D_MID, DEPTS.D_HIGH], projects: [], joined_at: now });
const setScore = (pid, total, judge = "j_a", at = now) => {
  const s = store.scores.find(x => x.project_id === pid && x.judge_id === judge);
  if (s) { s.criteria = { presentation: total }; s.submitted_at = at; }
  else store.scores.push({ id: `s_${judge}_${pid}`, school_id: SID, judge_id: judge, project_id: pid, criteria: { presentation: total }, notes: "", submitted_at: at });
};
for (const [id, , , , total] of P) setScore(id, total);
const decide = (pid, award, at = now) => {
  const row = store.final_decisions.find(d => d.project_id === pid);
  const fin = award !== "Pending";
  const v = { school_id: SID, project_id: pid, award, admin_notes: "", finalized: fin, finalized_at: fin ? at : null };
  if (row) Object.assign(row, v); else store.final_decisions.push(v);
};
const award = (pid) => store.final_decisions.find(d => d.project_id === pid)?.award;
// F7a fixture: the top project of two departments already holds a non-place award.
decide("e1", "No Award");
decide("h1", "Honorable Mention");

const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await ctx.newPage();
await installMock(page, store, []);
await page.goto(`${BASE}/s/test`);
await page.locator(".role-card.adm").click();
await page.locator("input[type=email]").fill("admin@test.edu");
await page.locator("input[type=password]").fill("correct-horse");
await page.keyboard.press("Enter");
await page.locator(".adm-side").waitFor({ timeout: 10000 });
const tab = (label) => page.locator(".nav-it", { hasText: label }).first().click();
const group = (label) => page.locator(`[data-testid=award-group][data-group="${label}"]`);
const placeCell = (label, title) => group(label).locator("[data-testid=award-row]", { hasText: title }).locator("td").first();

console.log("\n── F7a: a non-place award takes a project out of 1st–3rd");
await tab("Awards");
await check("a saved No Award winner gets no computed medal…", async () =>
  assert.doesNotMatch(await placeCell("Elementary", "Ant Farm").innerText(), /Place/));
await check("…and 1st passes to the next project", async () =>
  assert.match(await placeCell("Elementary", "Paper Planes").innerText(), /1st Place/));
await check("an Honorable Mention project is likewise out of the places (one award per project)", async () => {
  assert.doesNotMatch(await placeCell("High School", "Hydro Cells").innerText(), /Place/);
  assert.match(await placeCell("High School", "Ion Traps").innerText(), /1st Place/);
});
await group("Elementary").locator("[data-testid=award-confirm]").click();
await group("High School").locator("[data-testid=award-confirm]").click();
await page.waitForTimeout(800);
await check("Confirm never overwrites a saved No Award…", async () => assert.equal(award("e1"), "No Award"));
await check("…or a saved Honorable Mention", async () => assert.equal(award("h1"), "Honorable Mention"));
await check("…and confirms the places from the next projects", async () =>
  assert.deepEqual(["e2", "e3", "e4", "h2", "h3", "h4"].map(award),
    ["1st Place", "2nd Place", "3rd Place", "1st Place", "2nd Place", "3rd Place"]));

await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
