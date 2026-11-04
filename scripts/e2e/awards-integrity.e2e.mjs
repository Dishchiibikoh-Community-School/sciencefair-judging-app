// Browser E2E — award integrity fixes (FIXES_2026-11.md F7).
//   F7a  a project given Honorable Mention / Best in Category / No Award is out of the running for
//        1st–3rd (the medal passes on), and "Confirm" never overwrites those awards.
//   F7b  the Validation award dropdown changes nothing until Save; choosing Pending can be saved.
//   F7c  a tie is decided only by awards saved after the scores last changed; saving some places
//        keeps the tie visible and the other places on show; "ready" needs every expected review.
//   F7d  Finalize is refused over an undecided medal tie; confirmed places cannot be regrouped/moved.
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
  // Middle School: a tie for 2nd (80 / 80) — used by F7b and F7c.
  ["m1", "201", "Algae Lamps",    DEPTS.D_MID,  90],
  ["m2", "202", "Bee Counts",     DEPTS.D_MID,  80],
  ["m3", "203", "Cell Shapes",    DEPTS.D_MID,  80],
  ["m4", "204", "Dye Fading",     DEPTS.D_MID,  10],
  // Review Dept: every project should get TWO reviews (judges j_a and j_b) — used by F7c.
  ["r1", "401", "Radish Roots",   "d_rev",      40],
  ["r2", "402", "Salt Crystals",  "d_rev",      30],
  ["r3", "403", "Tide Model",     "d_rev",      20],
  ["h1", "301", "Hydro Cells",    DEPTS.D_HIGH, 50],
  ["h2", "302", "Ion Traps",      DEPTS.D_HIGH, 40],
  ["h3", "303", "Jet Nozzles",    DEPTS.D_HIGH, 30],
  ["h4", "304", "Kite Lift",      DEPTS.D_HIGH, 20],
];
for (const [id, num, title, dept] of P)
  store.projects.push({ id, school_id: SID, num, title, cat: LS, grade: "8", locked: false, department_id: dept, room: "", description: "", motivation: "", created_at: now });
store.departments.push({ id: "d_rev", school_id: SID, name: "Review Dept", code: "RV", max_judges: 5, ord: 3 });
store.judges.push({ id: "j_a", school_id: SID, alias: "Judge1", department_id: DEPTS.D_ELEM, department_ids: [DEPTS.D_ELEM, DEPTS.D_MID, DEPTS.D_HIGH, "d_rev"], projects: ["r1", "r2", "r3"], joined_at: now });
store.judges.push({ id: "j_b", school_id: SID, alias: "Judge2", department_id: "d_rev", department_ids: ["d_rev"], projects: ["r1", "r2", "r3"], joined_at: now });
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

console.log("\n── F7b: the award dropdown saves before anything changes; Pending can be saved");
await tab("Validation");
await page.getByRole("button", { name: "Open Manually" }).click();
const delib = (title) => page.locator(".card > div", { hasText: title }).filter({ has: page.locator("select.delib-rec-select") }).last();
await delib("Algae Lamps").locator("select.delib-rec-select").selectOption("1st Place");
await delib("Algae Lamps").getByRole("button", { name: "Save Award" }).click();
await page.waitForTimeout(500);
await check("a place award saves as before", async () => assert.equal(award("m1"), "1st Place"));
await delib("Algae Lamps").locator("select.delib-rec-select").selectOption("Pending");
await check("choosing Pending says it is NOT saved yet (nothing has changed)", async () => {
  await delib("Algae Lamps").getByText(/Not saved yet/).waitFor({ timeout: 3000 });
  assert.equal(award("m1"), "1st Place");
});
await check("…and Pending CAN be saved — it is how a saved award is taken back", async () => {
  const btn = delib("Algae Lamps").getByRole("button", { name: /Save \(remove award\)/ });
  assert.equal(await btn.isDisabled(), false);
  await btn.click();
  await page.waitForTimeout(500);
  const row = store.final_decisions.find(d => d.project_id === "m1");
  assert.equal(row.award, "Pending"); assert.equal(row.finalized, false);
});
await check("after saving, the dropdown shows the saved value with no 'not saved' note", async () => {
  assert.equal(await delib("Algae Lamps").locator("select.delib-rec-select").inputValue(), "Pending");
  assert.equal(await delib("Algae Lamps").getByText(/Not saved yet/).count(), 0);
});
await delib("Bee Counts").locator("select.delib-rec-select").selectOption("2nd Place");
await check("an unsaved dropdown change writes nothing", async () => {
  await page.waitForTimeout(400);
  assert.equal(award("m2"), undefined);
});
await delib("Bee Counts").locator("select.delib-rec-select").selectOption("Pending");   // back to the saved value
await page.getByRole("button", { name: "Close Deliberation" }).click().catch(() => {});

console.log("\n── F7c: ties, partial confirmations and readiness");
async function reload() {
  await page.reload();
  try { await page.locator(".adm-side").waitFor({ timeout: 2500 }); }
  catch { await page.locator(".role-card.adm").click(); await page.locator(".adm-side").waitFor({ timeout: 8000 }); }
}
const chips = async (label) => (await group(label).locator(".badge").allInnerTexts()).join(" | ");
// (a) SF-13 — only 1st saved while 2nd is tied (90 / 80 / 80).
decide("m1", "1st Place", new Date().toISOString());
// (b) N7 — High School was confirmed above (Ion Traps 1st, Jet Nozzles 2nd, Kite Lift 3rd);
//     a later re-score of Kite Lift makes it level with Jet Nozzles.
setScore("h4", 30, "j_a", new Date(Date.now() + 1000).toISOString());
await reload();
await tab("Awards");
await check("only 1st saved while 2nd is tied: the group still shows the tie (not decided)", async () =>
  assert.match(await chips("Middle School"), /Tie for 2nd/));
await tab("Overview");
const lbPlace = async (t) => { const l = page.locator(".adm-main tr", { hasText: t }).locator("[data-testid=lb-place]"); return (await l.count()) ? (await l.first().innerText()).trim() : ""; };
await check("…and the leaderboard still shows medals for 2nd and 3rd (the podium no longer blanks them)", async () => {
  assert.notEqual(await lbPlace("Bee Counts"), "", "2nd place blank");
  assert.notEqual(await lbPlace("Cell Shapes"), "", "3rd place blank");
});
await tab("Awards");
await check("a tie that appeared AFTER confirming is not 'Decided by hand'", async () => {
  const c = await chips("High School");
  assert.doesNotMatch(c, /Decided by hand/);
  assert.match(c, /Tie for 2nd/);
});
await tab("Validation");
await check("the tie alert stays on for both groups", async () =>
  assert.ok(await page.locator("[data-testid=tie-group]").count() >= 2));
// (c) readiness — every Review Dept project has 1 review of the 2 it should get.
await tab("Awards");
await check("a group still waiting for reviews says so", async () =>
  assert.match(await chips("Review Dept"), /3 still waiting for reviews/));
await check("…and is NOT among the 'ready' groups (Confirm all has nothing to do)", async () =>
  assert.equal(await page.locator("[data-testid=awards-confirm-all]").isDisabled(), true));
await page.locator("[data-testid=awards-confirm-all]").click({ timeout: 1500 }).catch(() => {});
await page.waitForTimeout(400);
await check("Confirm all leaves it unconfirmed", async () => assert.equal(award("r1"), undefined));
for (const [pid, t] of [["r1", 40], ["r2", 30], ["r3", 20]]) setScore(pid, t, "j_b");
await reload();
await tab("Awards");
await check("once every review is in, the group is ready and Confirm all confirms it", async () => {
  assert.doesNotMatch(await chips("Review Dept"), /waiting for reviews/);
  await page.locator("[data-testid=awards-confirm-all]").click();
  await page.waitForTimeout(700);
  assert.deepEqual(["r1", "r2", "r3"].map(award), ["1st Place", "2nd Place", "3rd Place"]);
});


console.log("\n── F7d: no Finalize over an undecided tie; confirmed places cannot be regrouped or moved");
await tab("Validation");
await page.getByRole("button", { name: /Approve Results/ }).first().click();
await page.waitForTimeout(600);
await check("Finalize is refused while a tie still decides a place — and it says where", async () => {
  assert.equal(await page.getByRole("button", { name: /Finalize Results/ }).isDisabled(), true);
  await page.getByText(/A tie still decides a place in .*Middle School/).first().waitFor({ timeout: 3000 });
});
await tab("Setup");
await page.getByLabel("Places for Elementary").selectOption("category").catch(() => {});
await check("a department with confirmed places cannot switch to per-category (the medals would land in the wrong groups)", async () => {
  await page.getByText(/already has 3 confirmed places/).first().waitFor({ timeout: 3000 });
  assert.notEqual(store.departments.find(d => d.id === DEPTS.D_ELEM).award_grouping, "category");
});
await tab("Projects");
const card = page.locator(".proj-mgmt-card", { hasText: "Paper Planes" }).first();
await card.getByRole("button", { name: /Edit/ }).click();
await page.locator(".proj-form select.delib-rec-select").first().selectOption({ label: "Middle School" }).catch(() => {});
await page.getByRole("button", { name: "Save Changes" }).click();
await check("a project holding a confirmed 1st cannot be moved to another department", async () => {
  await page.getByText(/holds a confirmed 1st Place/).first().waitFor({ timeout: 3000 });
  assert.equal(store.projects.find(p => p.id === "e2").department_id, DEPTS.D_ELEM);
});

await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
