// Browser E2E — winners PER CATEGORY, chosen on the Awards tab (2026-11-16).
// Shaped like the live 2026-27 K-5 department: 8 projects, 4 of them in one category and the
// other 4 alone in theirs — so per category gives five 1st places, four of them uncontested.
//   • Awards tab → "How winners are chosen": per department / per category for each department,
//     plus "All departments" buttons; the choice is the same setting as Setup's.
//   • Per category: a 1st–3rd in every category; groups of 1 or 2 projects say so.
//   • Confirm all ready groups: ONE write, a tie inside a category is held back.
//   • Switching is refused while a department has confirmed places, and the refusal is shown on
//     the Awards tab (not only in Setup); a refused department never blocks the others.
//   • Read-only once results are finalized.
// Run: see scan.e2e.mjs header (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { freshStore, installMock, DEPTS, SID } from "./mock.mjs";

const BASE = "http://localhost:5199";
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
const errs = [];

const store = freshStore();
store.rubrics.push({ id: "rub1", school_id: SID, name: "Default", is_active: true, criteria: [] }); // → the 42-point rubric
store.projects = []; store.project_private = [];
const now = new Date().toISOString();
const LS = "Life Science", EES = "Earth & Environmental Science", CMS = "Chemistry & Material Science",
  ERT = "Engineering, Robotics & Technology", ESD = "Energy, Sustainability & Design";
const P = [
  // id, num, title, dept, cat, total
  ["k1", "101", "Bean Sprouts",    DEPTS.D_ELEM, LS,  40],
  ["k2", "102", "Ant Paths",       DEPTS.D_ELEM, LS,  35],
  ["k3", "103", "Leaf Colors",     DEPTS.D_ELEM, LS,  30],
  ["k4", "104", "Worm Homes",      DEPTS.D_ELEM, LS,  20],
  ["k5", "105", "Rain Jars",       DEPTS.D_ELEM, EES, 10],
  ["k6", "106", "Salt Crystals",   DEPTS.D_ELEM, CMS, 38],
  ["k7", "107", "Lego Crane",      DEPTS.D_ELEM, ERT, 25],
  ["k8", "108", "Sun Oven",        DEPTS.D_ELEM, ESD, 15],
  ["m1", "201", "Algae Lamps",     DEPTS.D_MID,  LS,  30],
  ["m2", "202", "Bee Counts",      DEPTS.D_MID,  LS,  30],   // tie for 1st with m1
  ["m3", "203", "Cell Shapes",     DEPTS.D_MID,  LS,  20],
  ["m4", "204", "Dye Fading",      DEPTS.D_MID,  CMS, 35],
  ["m5", "205", "Fizz Rates",      DEPTS.D_MID,  CMS, 25],
];
for (const [id, num, title, dept, cat, total] of P) {
  store.projects.push({ id, school_id: SID, num, title, cat, grade: "8", locked: false, department_id: dept, room: "", description: "", motivation: "", created_at: now });
  store.scores.push({ id: `s_${id}`, school_id: SID, judge_id: "j_a", project_id: id, criteria: { presentation: total }, notes: "", submitted_at: now });
}
store.judges.push({ id: "j_a", school_id: SID, alias: "Judge1", department_id: DEPTS.D_ELEM, department_ids: [DEPTS.D_ELEM, DEPTS.D_MID], projects: [], joined_at: now });
const dept = (id) => store.departments.find(d => d.id === id);
const placed = () => store.final_decisions.filter(d => d.finalized && /Place/.test(d.award));

const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await ctx.newPage();
page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
let fdWrites = 0, deptWrites = 0;
page.on("request", r => {
  if (r.method() === "GET") return;
  if (r.url().includes("/final_decisions")) fdWrites++;
  if (r.url().includes("/departments")) deptWrites++;
});
await installMock(page, store, []);
await page.goto(`${BASE}/s/test`);
await page.locator(".role-card.adm").click();
await page.locator("input[type=email]").fill("admin@test.edu");
await page.locator("input[type=password]").fill("correct-horse");
await page.keyboard.press("Enter");
await page.locator(".adm-side").waitFor({ timeout: 10000 });
const tab = (label) => page.locator(".nav-it", { hasText: label }).first().click();
const group = (label) => page.locator(`[data-testid=award-group][data-group="${label}"]`);
const groupLabels = async () => page.locator("[data-testid=award-group]").evaluateAll(els => els.map(e => e.dataset.group));
// The place shown in a group's table for one project code → "1st Place" etc. ("" = none).
const placeIn = async (label, title) => (await group(label).locator("[data-testid=award-row]", { hasText: title }).locator("td").first().innerText()).replace(/^\S+\s/, "").trim();
const msg = () => page.getByTestId("awards-msg").innerText();

console.log("\n── The Awards tab shows the choice; everything starts per department");
await tab("Awards");
await check("'How winners are chosen' lists both scored departments, both per department", async () => {
  await page.getByTestId("awards-grouping").waitFor({ timeout: 5000 });
  const rows = await page.getByTestId("grouping-row").evaluateAll(els => els.map(e => e.dataset.dept));
  assert.deepEqual(rows, ["Elementary", "Middle School"]);
  assert.equal(await page.getByLabel("Winners for Elementary").inputValue(), "department");
  assert.equal(await page.getByLabel("Winners for Middle School").inputValue(), "department");
});
await check("per department: Elementary is ONE group and its 1st–3rd are the department's top three", async () => {
  assert.ok((await groupLabels()).includes("Elementary"));
  assert.equal(await placeIn("Elementary", "Bean Sprouts"), "1st Place");
  assert.equal(await placeIn("Elementary", "Salt Crystals"), "2nd Place");
  assert.equal(await placeIn("Elementary", "Ant Paths"), "3rd Place");
  assert.equal(await placeIn("Elementary", "Leaf Colors"), "");
});

console.log("\n── Elementary → per category, from the Awards tab");
const w0 = deptWrites;
await page.getByLabel("Winners for Elementary").selectOption("category");
await page.waitForTimeout(700);
await check("the choice is saved on the department, in one write, and confirmed on screen", async () => {
  assert.equal(dept(DEPTS.D_ELEM).award_grouping, "category");
  assert.equal(deptWrites - w0, 1);
  assert.match(await msg(), /Elementary now awards places per category/);
});
await check("Elementary is now 5 groups, in category order; 4 have fewer than 3 projects", async () => {
  const labels = (await groupLabels()).filter(l => l.startsWith("Elementary"));
  assert.deepEqual(labels.sort(), [`Elementary · ${CMS}`, `Elementary · ${EES}`, `Elementary · ${ERT}`, `Elementary · ${ESD}`, `Elementary · ${LS}`].sort());
  assert.match(await page.locator("[data-testid=grouping-row][data-dept=Elementary]").innerText(), /5 groups/);
  assert.match(await page.locator("[data-testid=grouping-row][data-dept=Elementary] [data-testid=grouping-small]").innerText(), /4 with fewer than 3/);
});
await check("Life Science gets its own 1st–3rd; Worm Homes (4th) gets nothing", async () => {
  assert.equal(await placeIn(`Elementary · ${LS}`, "Bean Sprouts"), "1st Place");
  assert.equal(await placeIn(`Elementary · ${LS}`, "Ant Paths"), "2nd Place");
  assert.equal(await placeIn(`Elementary · ${LS}`, "Leaf Colors"), "3rd Place");
  assert.equal(await placeIn(`Elementary · ${LS}`, "Worm Homes"), "");
});
await check("each single-project category gives its project 1st — whatever its score — and says it is uncontested", async () => {
  assert.equal(await placeIn(`Elementary · ${EES}`, "Rain Jars"), "1st Place");   // 10 points, lowest in the department
  for (const c of [EES, CMS, ERT, ESD]) assert.equal(await group(`Elementary · ${c}`).getByTestId("st-single").count(), 1, c);
  assert.equal(await group(`Elementary · ${LS}`).getByTestId("st-single").count(), 0);
});
await check("the Setup dropdown shows the same choice (one setting, two places to change it)", async () => {
  await tab("Setup");
  assert.equal(await page.getByLabel("Places for Elementary").inputValue(), "category");
  await tab("Awards");
});
await check("Overview leaderboard: Elementary shows five 🥇, one 🥈 and one 🥉", async () => {
  await tab("Overview");
  const card = page.locator(".card", { has: page.locator(".sec-title", { hasText: "Elementary — Project Leaderboard" }) });
  const medals = await card.getByTestId("lb-place").allInnerTexts();
  assert.deepEqual([medals.filter(m => m.includes("🥇")).length, medals.filter(m => m.includes("🥈")).length, medals.filter(m => m.includes("🥉")).length], [5, 1, 1]);
  await tab("Awards");
});

console.log("\n── All departments → per category");
await page.getByTestId("grouping-all-cat").click();
await page.waitForTimeout(700);
await check("Middle School switches too; the message names it; the button is now disabled", async () => {
  assert.equal(dept(DEPTS.D_MID).award_grouping, "category");
  assert.match(await msg(), /Middle School now awards places per category/);
  assert.ok(await page.getByTestId("grouping-all-cat").isDisabled());
});
await check("a tie inside a category is flagged; a 2-project category says there is no 3rd place", async () => {
  assert.match(await group(`Middle School · ${LS}`).getByTestId("st-tie").innerText(), /Tie for 1st/);
  assert.equal(await group(`Middle School · ${CMS}`).getByTestId("st-two").count(), 1);
  assert.equal(await placeIn(`Middle School · ${CMS}`, "Fizz Rates"), "2nd Place");
});

console.log("\n── Confirm all ready groups");
const f0 = fdWrites;
await page.getByTestId("awards-confirm-all").click();
await page.waitForTimeout(800);
await check("ONE write confirms 9 places in 6 groups — the tied Middle School Life Science group is held back", async () => {
  assert.equal(fdWrites - f0, 1);
  assert.equal(placed().length, 9);
  assert.equal(placed().filter(d => d.award === "1st Place").length, 6);
  for (const pid of ["m1", "m2", "m3"]) assert.ok(!placed().some(d => d.project_id === pid), pid);
  assert.equal(store.final_decisions.find(d => d.project_id === "k5")?.award, "1st Place");
});

console.log("\n── Changing the choice after places are confirmed");
const w1 = deptWrites;
await page.getByLabel("Winners for Elementary").selectOption("department");
await page.waitForTimeout(700);
await check("refused ON THE AWARDS TAB, naming the department and the confirmed places; nothing written", async () => {
  assert.match(await msg(), /Elementary.*7 confirmed places.*Clear them/);
  assert.equal(dept(DEPTS.D_ELEM).award_grouping, "category");
  assert.equal(deptWrites - w1, 0);
  assert.equal(await page.getByLabel("Winners for Elementary").inputValue(), "category");
});
for (const c of [LS, EES, CMS, ERT, ESD]) {
  await group(`Elementary · ${c}`).getByTestId("award-clear").click();
  await page.waitForTimeout(350);
}
await page.getByTestId("grouping-all-dept").click();
await page.waitForTimeout(800);
await check("after clearing Elementary, 'All departments: per department' changes Elementary and names Middle School as refused", async () => {
  assert.equal(dept(DEPTS.D_ELEM).award_grouping, "department");
  assert.equal(dept(DEPTS.D_MID).award_grouping, "category");
  const t = await msg();
  assert.match(t, /1 department changed to places per department/);
  assert.match(t, /Not changed: "Middle School" already has 2 confirmed places/);
});
await check("Elementary is one group again with the department's top three", async () => {
  assert.equal(await placeIn("Elementary", "Bean Sprouts"), "1st Place");
  assert.equal(await placeIn("Elementary", "Salt Crystals"), "2nd Place");
  assert.equal(await placeIn("Elementary", "Ant Paths"), "3rd Place");
  assert.equal(await placeIn("Elementary", "Rain Jars"), "");
});
await check("every change is in the IT log (AWARD_GROUPING_SET) — three successful switches", async () => {
  assert.equal(store.it_logs.filter(l => l.event === "AWARD_GROUPING_SET").length, 3);
});

console.log("\n── Finalized results");
store.app_settings.find(r => r.key === "results_finalized").value = "true";
await page.reload();
try { await page.locator(".adm-side").waitFor({ timeout: 2500 }); }
catch { await page.locator(".role-card.adm").click(); await page.locator(".adm-side").waitFor({ timeout: 8000 }); }
await tab("Awards");
await check("the choices and both 'All departments' buttons are disabled", async () => {
  await page.getByTestId("awards-grouping").waitFor({ timeout: 5000 });
  assert.ok(await page.getByLabel("Winners for Elementary").isDisabled());
  assert.ok(await page.getByLabel("Winners for Middle School").isDisabled());
  assert.ok(await page.getByTestId("grouping-all-dept").isDisabled());
  assert.ok(await page.getByTestId("grouping-all-cat").isDisabled());
});

await check("no JavaScript errors", async () => {
  assert.deepEqual(errs.filter(e => !/Failed to load resource|favicon|net::ERR/.test(e)), []);
});

await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(" - " + failures.join("\n - ")); process.exit(1); }
