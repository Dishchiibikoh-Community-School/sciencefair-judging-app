// Browser E2E — Phase 3 awards (2026-10-21).
//   • Setup: a department awards places per department (default) or PER CATEGORY.
//   • Award groups drive every medal: leaderboard, public podium, results CSV, tie alert.
//   • Awards tab: computed top 3 per group, "Confirm" / "Confirm all ready groups" in ONE write,
//     ties and unscored groups float up, a confirmed group whose scores changed says so,
//     "Clear", a tie decided by hand in deliberation, read-only once finalized.
//   • The awards list (print + CSV) carries names — admin only.
// Run: see scan.e2e.mjs header (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { freshStore, installMock, DEPTS, SID } from "./mock.mjs";

const BASE = "http://localhost:5199";
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
const errs = [];

const store = freshStore();
store.rubrics.push({ id: "rub1", school_id: SID, name: "Default", is_active: true, criteria: [] }); // → the 42-point rubric
const now = new Date().toISOString();
const LS = "Life Science", CMS = "Chemistry & Material Science";
const P = [
  // id, num, title, dept, cat, total
  ["e1", "101", "Ant Farm",        DEPTS.D_ELEM, LS,  40],
  ["e2", "102", "Paper Planes",    DEPTS.D_ELEM, CMS, 30],
  ["e3", "103", "Rain Gauge",      DEPTS.D_ELEM, LS,  20],
  ["e4", "104", "Shadow Clock",    DEPTS.D_ELEM, LS,  10],
  ["m1", "201", "Algae Lamps",     DEPTS.D_MID,  LS,  30],
  ["m2", "202", "Bee Counts",      DEPTS.D_MID,  LS,  25],
  ["m3", "203", "Cell Shapes",     DEPTS.D_MID,  LS,  20],
  ["m4", "204", "Dye Fading",      DEPTS.D_MID,  CMS, 35],
  ["m5", "205", "Egg Drop Foam",   DEPTS.D_MID,  CMS, 35],
  ["m6", "206", "Fizz Rates",      DEPTS.D_MID,  CMS, 10],
];
for (const [id, num, title, dept, cat] of P)
  store.projects.push({ id, school_id: SID, num, title, cat, grade: "8", locked: false, department_id: dept, room: "", description: "", motivation: "", created_at: now });
store.project_private.push({ project_id: "e1", school_id: SID, advisor_name: "Ms. Begay", group_members: [{ name: "Rosa Yazzie", grade: "4" }] });
store.judges.push({ id: "j_a", school_id: SID, alias: "Judge1", department_id: DEPTS.D_ELEM, department_ids: [DEPTS.D_ELEM, DEPTS.D_MID], projects: [], joined_at: now });
const setScore = (pid, total) => {
  const s = store.scores.find(x => x.project_id === pid);
  if (s) s.criteria = { presentation: total };
  else store.scores.push({ id: `s_${pid}`, school_id: SID, judge_id: "j_a", project_id: pid, criteria: { presentation: total }, notes: "", submitted_at: now });
};
for (const [id, , , , , total] of P) setScore(id, total);
const setSetting = (k, v) => {
  const row = store.app_settings.find(r => r.key === k);
  if (row) row.value = v; else store.app_settings.push({ school_id: SID, key: k, value: v });
};
const award = (pid) => store.final_decisions.find(d => d.project_id === pid);

const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
let fdWrites = 0;
page.on("request", r => { if (r.method() !== "GET" && r.url().includes("/final_decisions")) fdWrites++; });
await installMock(page, store, []);
await page.goto(`${BASE}/s/test`);
await page.locator(".role-card.adm").click();
await page.locator("input[type=email]").fill("admin@test.edu");
await page.locator("input[type=password]").fill("correct-horse");
await page.keyboard.press("Enter");
await page.locator(".adm-side").waitFor({ timeout: 10000 });
const tab = (label) => page.locator(".nav-it", { hasText: label }).first().click();
async function reload() {
  await page.reload();
  try { await page.locator(".adm-side").waitFor({ timeout: 2500 }); }
  catch { await page.locator(".role-card.adm").click(); await page.locator(".adm-side").waitFor({ timeout: 8000 }); }
}
const group = (label) => page.locator(`[data-testid=award-group][data-group="${label}"]`);
const chips = async (label) => (await group(label).locator(".badge").allInnerTexts()).join(" | ");

console.log("\n── Setup: Middle School awards places per category");
await tab("Setup");
await page.getByLabel("Places for Middle School").selectOption("category");
await page.waitForTimeout(600);
await check("the choice is saved on the department (award_grouping = category)", async () => {
  assert.equal(store.departments.find(d => d.id === DEPTS.D_MID).award_grouping, "category");
  assert.equal(await page.getByLabel("Places for Elementary").inputValue(), "department");
});

console.log("\n── Leaderboard + tie alert follow the groups");
await tab("Overview");
await page.locator(".adm-main").getByText("Algae Lamps").first().waitFor({ timeout: 6000 });
const lbPlace = async (t) => { const l = page.locator(".adm-main tr", { hasText: t }).locator("[data-testid=lb-place]"); return (await l.count()) ? (await l.innerText()).trim() : ""; };
await check("Middle School is marked 'places per category' and each category has its own 🥇", async () => {
  await page.locator("[data-testid=lb-per-category]").waitFor({ timeout: 3000 });
  assert.equal(await lbPlace("Algae Lamps"), "🥇");   // 30: 1st in Life Science though 3rd in the department
  assert.equal(await lbPlace("Cell Shapes"), "🥉");
  assert.equal(await lbPlace("Fizz Rates"), "🥉");    // 10: 3rd of three in Chemistry
});
await check("Elementary is still one group: 40 / 30 / 20 take the places, 10 does not", async () => {
  assert.deepEqual([await lbPlace("Ant Farm"), await lbPlace("Paper Planes"), await lbPlace("Rain Gauge"), await lbPlace("Shadow Clock")], ["🥇", "🥈", "🥉", ""]);
});
await tab("Validation");
await check("the tie alert names the group and the place: Chemistry, 1st", async () => {
  const t = await page.locator("[data-testid=tie-group]").first().innerText({ timeout: 5000 });
  assert.match(t, /Tie for 1st Place/); assert.match(t, /Middle School · Chemistry & Material Science/);
  assert.equal(await page.locator("[data-testid=tie-group]").count(), 1);
});

console.log("\n── Awards tab");
await tab("Awards");
await page.locator("[data-testid=awards-summary]").waitFor({ timeout: 5000 });
await check("one card per award group: Elementary + 3 Middle School categories", async () => {
  const labels = await page.locator("[data-testid=award-group]").evaluateAll(els => els.map(e => e.dataset.group));
  assert.deepEqual([...labels].sort(), ["Elementary", "Middle School · Chemistry & Material Science",
    "Middle School · Earth & Environmental Science", "Middle School · Life Science"]);
});
await check("groups needing attention come first (the tie, the unscored seed project)", async () => {
  const labels = await page.locator("[data-testid=award-group]").evaluateAll(els => els.map(e => e.dataset.group));
  assert.deepEqual(labels.slice(0, 2).sort(), ["Middle School · Chemistry & Material Science", "Middle School · Earth & Environmental Science"]);
  assert.match(await chips("Middle School · Chemistry & Material Science"), /Tie for 1st Place/);
  assert.match(await chips("Middle School · Earth & Environmental Science"), /1 not scored yet/);
});
await check("the nav shows how many groups need attention", async () =>
  assert.match(await page.locator(".nav-it", { hasText: "Awards" }).innerText(), /Awards \(1\)/));
await check("'Confirm all ready groups' counts the two clean groups", async () =>
  assert.match(await page.locator("[data-testid=awards-confirm-all]").innerText(), /\(2\)/));

store.failWrites = ["final_decisions"];
await page.locator("[data-testid=awards-confirm-all]").click();
await check("a failed save says NOT saved and changes nothing", async () => {
  await page.locator("[data-testid=awards-msg]").getByText(/NOT saved/).waitFor({ timeout: 4000 });
  assert.equal(store.final_decisions.length, 0);
  assert.match(await chips("Elementary"), /Not confirmed/);
});
store.failWrites = [];
fdWrites = 0;
await page.locator("[data-testid=awards-confirm-all]").click();
await page.locator("[data-testid=awards-msg]").getByText(/Confirmed 6 place awards in 2 groups/).waitFor({ timeout: 4000 }).catch(() => {});
await check("Confirm all writes the six places in ONE request", async () => {
  assert.equal(fdWrites, 1, `${fdWrites} writes`);
  assert.deepEqual(["e1", "e2", "e3", "m1", "m2", "m3"].map(id => award(id)?.award),
    ["1st Place", "2nd Place", "3rd Place", "1st Place", "2nd Place", "3rd Place"]);
  assert.ok(["e1", "m3"].every(id => award(id).finalized === true));
  assert.equal(award("e4"), undefined, "4th place must not get an award row");
});
await check("both groups now read ✓ Confirmed, and the activity log says so", async () => {
  assert.match(await chips("Elementary"), /✓ Confirmed/);
  assert.match(await chips("Middle School · Life Science"), /✓ Confirmed/);
  assert.ok(store.activity_log.some(l => /confirmed the places for Elementary, Middle School · Life Science/.test(l.message)));
});

console.log("\n── Scores change after confirming");
setScore("e3", 35);   // Rain Gauge 20 → 35: now 2nd, Paper Planes drops to 3rd
await reload();
await tab("Awards");
await page.locator("[data-testid=awards-summary]").waitFor({ timeout: 5000 });
await check("the group says 'Scores changed since you confirmed' and floats up", async () => {
  assert.match(await chips("Elementary"), /Scores changed since you confirmed/);
  const first = await page.locator("[data-testid=award-group]").first().getAttribute("data-group");
  assert.notEqual(first, "Middle School · Life Science");
});
await check("…while the confirmed awards still stand until the admin acts", async () =>
  assert.equal(award("e3").award, "3rd Place"));
await group("Elementary").locator("[data-testid=award-confirm]").click();
await page.waitForTimeout(600);
await check("Re-confirm moves the places to the new order", async () => {
  assert.deepEqual(["e1", "e3", "e2"].map(id => award(id).award), ["1st Place", "2nd Place", "3rd Place"]);
  assert.match(await chips("Elementary"), /✓ Confirmed/);
});
await group("Middle School · Life Science").locator("[data-testid=award-clear]").click();
await page.waitForTimeout(600);
await check("Clear puts that group's place awards back to Pending", async () => {
  assert.ok(["m1", "m2", "m3"].every(id => award(id).award === "Pending" && award(id).finalized === false));
  assert.match(await chips("Middle School · Life Science"), /Not confirmed/);
});

console.log("\n── A tie decided by hand");
await tab("Validation");
await page.getByRole("button", { name: "Open Manually" }).click();
const delib = (title) => page.locator(".card > div", { hasText: title }).filter({ has: page.locator("select.delib-rec-select") }).last();
await delib("Egg Drop Foam").locator("select.delib-rec-select").selectOption("1st Place");
await delib("Egg Drop Foam").getByRole("button", { name: "Save Award" }).click();
await page.waitForTimeout(400);
await delib("Dye Fading").locator("select.delib-rec-select").selectOption("2nd Place");
await delib("Dye Fading").getByRole("button", { name: "Save Award" }).click();
await page.waitForTimeout(400);
await check("the deliberation list labels each project with its award group", async () =>
  assert.match(await delib("Egg Drop Foam").innerText(), /Middle School · Chemistry & Material Science · Rank \d/));
await check("once decided the tie alert switches off", async () =>
  assert.equal(await page.locator("[data-testid=tie-group]").count(), 0));
await page.getByRole("button", { name: "Close Deliberation" }).click();
await tab("Awards");
await check("the Awards tab shows the group as ✓ Decided by hand", async () =>
  assert.match(await chips("Middle School · Chemistry & Material Science"), /✓ Decided by hand/));

console.log("\n── Awards list");
const [popup] = await Promise.all([ctx.waitForEvent("page"), page.getByRole("button", { name: /Print awards list/ }).click()]);
await popup.waitForLoadState();
const html = await popup.content();
await popup.close();
await check("the printout lists each group, the place, the student and the teacher", async () => {
  assert.match(html, /Middle School · Chemistry &amp; Material Science/);
  assert.match(html, /🥇 1st Place[\s\S]*?Ant Farm[\s\S]*?Rosa Yazzie[\s\S]*?Ms\. Begay/);
  assert.match(html, /Middle School · Life Science <span[^>]*>— computed, not confirmed yet/);
  assert.ok(!html.includes("Shadow Clock"), "4th place, no ribbon, no award — not on the awards list");
});
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Awards CSV/ }).click()]);
const csv = readFileSync(await dl.path(), "utf8");
await check("the awards CSV: decided tie, places, names, and whether each group was confirmed", async () => {
  const row = (t) => csv.split("\n").find(l => l.includes(t)) || "";
  assert.match(row("Egg Drop Foam"), /"Chemistry & Material Science","1st Place"/);
  assert.match(row("Dye Fading"), /"2nd Place"/);
  assert.match(row("Ant Farm"), /"Rosa Yazzie \(Gr 4\)","Ms. Begay"/);
  assert.match(row("Algae Lamps"), /"No — computed"$/);
  assert.match(row("Ant Farm"), /"Yes"$/);
});

console.log("\n── Public results + results CSV");
setSetting("results_finalized", "true");
store.share_links = [{ id: "sl1", school_id: SID, token: "PUBTOKEN", title: "Results", show_rubric: false, created_at: now, expiry: "never", revoked_at: null }];
const pub = await ctx.newPage();
await installMock(pub, store, []);
await pub.goto(`${BASE}/s/test?token=PUBTOKEN`);
await pub.getByText("Egg Drop Foam").first().waitFor({ timeout: 8000 });
const rank = async (t) => (await pub.locator(".res-row", { hasText: t }).locator(".res-rank").first().innerText()).trim();
await check("Middle School is shown per category (3 sections)", async () =>
  assert.equal(await pub.locator("[data-testid=pub-cat-group]").count(), 3));
await check("the decided tie is on the podium as decided: Egg Drop Foam 🥇, Dye Fading 🥈", async () =>
  assert.deepEqual([await rank("Egg Drop Foam"), await rank("Dye Fading")], ["🥇", "🥈"]));
await check("Elementary follows the re-confirmed order: Rain Gauge 🥈, Paper Planes 🥉", async () =>
  assert.deepEqual([await rank("Ant Farm"), await rank("Rain Gauge"), await rank("Paper Planes")], ["🥇", "🥈", "🥉"]));
await check("Algae Lamps (30) is 🥇 in Life Science although Chemistry has 35s", async () =>
  assert.equal(await rank("Algae Lamps"), "🥇"));
await check("no student or teacher name on the public page", async () => {
  const t = await pub.locator("body").innerText();
  assert.ok(!/Rosa Yazzie|Begay/.test(t));
});
await pub.close();
await reload();
await tab("Share");
const [dl2] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download Results CSV/ }).click()]);
const rcsv = readFileSync(await dl2.path(), "utf8");
await check("results CSV: an Award group column, ranks restart in each group", async () => {
  assert.ok(rcsv.split("\n")[0].startsWith('"Department","Award group","Rank"'));
  assert.match(rcsv.split("\n").find(l => l.includes("Algae Lamps")), /"Middle School","Life Science","1"/);
  assert.match(rcsv.split("\n").find(l => l.includes("Ant Farm")), /"Elementary","Whole department","1"/);
});
await tab("Awards");
await check("once finalized the Awards tab is read-only", async () => {
  await page.getByText(/Results are finalized — the awards are read-only/).waitFor({ timeout: 4000 });
  assert.ok(await page.locator("[data-testid=award-confirm]").first().isDisabled());
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
