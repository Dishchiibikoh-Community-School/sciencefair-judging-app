// Browser E2E — each department picks its own rubric (migration 2026-10j), real UI + mock.
// Admin builds a rubric library (the 100-point Cibecue sheet, the detailed 20-item form,
// and one written from scratch), gives each department its rubric (one comment-only),
// and a judge in each department then sees THAT rubric: the right criteria, section
// headings, totals and maximums. A scored department's rubric cannot be changed, a
// rubric in use cannot be deleted, the default can be switched, and the CSV export
// carries each project's rubric.
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
const now = new Date().toISOString();
store.projects.push(
  { id: "p_hi", school_id: SID, num: "009", title: "Bridge Loads", cat: "Physics, Math & Astronomy", grade: "11", locked: false, department_id: DEPTS.D_HIGH, room: "", description: "", motivation: "", created_at: now },
  { id: "p_el", school_id: SID, num: "004", title: "Seed Sprouts", cat: "Life Science", grade: "2", locked: false, department_id: DEPTS.D_ELEM, room: "", description: "", motivation: "", created_at: now },
);

async function newPage(vp = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  return { ctx, page };
}
const rub = (name) => store.rubrics.find(r => r.name === name);
const dep = (id) => store.departments.find(d => d.id === id);

console.log("\n── Admin builds the rubric library");
const A = await newPage();
await A.page.goto(`${BASE}/s/test`);
await A.page.locator(".role-card.adm").click();
await A.page.locator("input[type=email]").fill("admin@test.edu");
await A.page.locator("input[type=password]").fill("correct-horse");
await A.page.keyboard.press("Enter");
await A.page.locator(".adm-side").waitFor({ timeout: 6000 });
await A.page.locator(".nav-it", { hasText: "Rubric" }).click();
await check("a new school starts with one default rubric (42-point Northeast AZ)", async () => {
  await A.page.getByLabel("Rubric to view").waitFor({ timeout: 5000 });
  // The default is seeded just after sign-in (ensureSeedData) — wait for it.
  for (let i = 0; i < 30 && !store.rubrics.length; i++) await A.page.waitForTimeout(100);
  await A.page.getByLabel("Rubric to view").locator("option", { hasText: "(default)" }).waitFor({ state: "attached", timeout: 4000 });
  assert.equal(store.rubrics.length, 1, store.rubrics.map(r => r.name + ":" + r.is_active).join(", "));
  assert.equal(store.rubrics[0].is_active, true);
});
async function newRubric(name, fromLabel) {
  await A.page.getByRole("button", { name: "＋ New rubric" }).click();
  await A.page.getByLabel("New rubric name").fill(name);
  await A.page.getByLabel("Start from").selectOption({ label: fromLabel });
  await A.page.getByRole("button", { name: "Create", exact: true }).click();
  await A.page.waitForTimeout(500);
}
await newRubric("Upper 100", "Start from: Cibecue / ISEF-style — 100 points");
await newRubric("Detailed 20", "Start from: Detailed form — 20 items, 100 points");
await check("two rubrics created from the presets (5 sections / 20 items, 100 points each)", async () => {
  assert.equal(rub("Upper 100").criteria.length, 5);
  assert.equal(rub("Detailed 20").criteria.length, 20);
  for (const n of ["Upper 100", "Detailed 20"]) assert.equal(rub(n).criteria.reduce((t, c) => t + c.max, 0), 100);
  assert.equal(rub("Upper 100").is_active, false);
});
await newRubric("Our own", "Start blank (write my own)");
await check("a blank rubric opens the editor straight away", () => A.page.getByText("Edit Rubric — Our own").waitFor({ timeout: 4000 }));
await A.page.locator(".rub-editor-card input").first().fill("Creativity");
await A.page.getByRole("button", { name: "Save Rubric" }).click();
await check("our own rubric is saved with its criterion", async () => {
  await A.page.waitForTimeout(500);
  assert.equal(rub("Our own").criteria[0].label, "Creativity");
});

console.log("\n── Setup: each department picks its rubric (or comments only)");
await A.page.locator(".nav-it", { hasText: "Setup" }).click();
const sel = (name) => A.page.getByLabel(`How ${name} is judged`);
await check("the selector lists every rubric plus Comments only", async () => {
  const opts = await sel("High School").locator("option").allInnerTexts();
  for (const t of ["Upper 100", "Detailed 20", "Our own", "Comments only"]) assert.ok(opts.some(o => o.includes(t)), t + " missing: " + opts.join(" | "));
  assert.ok(opts.some(o => /\(default\)/.test(o)));
});
await sel("High School").selectOption({ label: (await sel("High School").locator("option", { hasText: "Upper 100" }).innerText()).trim() });
await sel("Middle School").selectOption({ label: (await sel("Middle School").locator("option", { hasText: "Detailed 20" }).innerText()).trim() });
await sel("Elementary").selectOption("feedback");
await check("departments saved: High → Upper 100, Middle → Detailed 20, Elementary → comments only", async () => {
  await A.page.waitForTimeout(600);
  assert.equal(dep(DEPTS.D_HIGH).rubric_id, rub("Upper 100").id);
  assert.equal(dep(DEPTS.D_MID).rubric_id, rub("Detailed 20").id);
  assert.equal(dep(DEPTS.D_ELEM).scoring_mode, "feedback");
});

console.log("\n── Judges see their department's rubric");
async function judgeOpens(deptName, alias, projTitle) {
  const J = await newPage({ width: 820, height: 1180 });
  await J.page.goto(`${BASE}/s/test`);
  await J.page.locator(".role-card").first().click();
  await J.page.getByRole("button", { name: new RegExp(deptName) }).click();
  await J.page.locator('input[placeholder="e.g. Judge1"]').fill(alias);
  await J.page.locator('input[placeholder="Event invite code"]').fill("ABC123");
  await J.page.getByRole("button", { name: /Enter as Judge/ }).click();
  await J.page.getByText(projTitle).first().click();
  return J;
}
const JM = await judgeOpens("Middle School", "Judge1", "Existing Volcano Study");
await check("Middle School judge gets the 20-item form, grouped in 5 sections", async () => {
  await JM.page.locator(".rub-steps").first().waitFor({ timeout: 5000 });
  assert.equal(await JM.page.locator(".rub-steps").count(), 20);
  const heads = await JM.page.locator(".rub-section-head").allInnerTexts();
  assert.deepEqual(heads, ["Project Title", "Scientific Inquiry", "Data and Conclusion", "Presentation", "Further Research"]);
});
for (let i = 0; i < 20; i++) await JM.page.locator(".rub-steps").nth(i).locator("button").last().click();
await check("all Excellent = 100 / 100", async () => assert.equal((await JM.page.locator(".sc-total-num").innerText()).trim(), "100"));
await JM.page.getByRole("button", { name: /Submit Score/ }).click();
await check("the score is stored with the 20-item criteria", async () => {
  await JM.page.waitForTimeout(600);
  const sc = store.scores.find(s => s.project_id === "p_seed");
  assert.equal(Object.keys(sc.criteria).length, 20); assert.equal(sc.criteria.t_meaningful, 5);
});
const JH = await judgeOpens("High School", "Judge1", "Bridge Loads");
await check("High School judge gets the 5-section Cibecue rubric with rating words", async () => {
  await JH.page.locator(".rub-steps").first().waitFor({ timeout: 5000 });
  assert.equal(await JH.page.locator(".rub-steps").count(), 5);
  await JH.page.getByText("Scientific Inquiry").first().waitFor();
  assert.ok(await JH.page.locator(".rub-step-lab", { hasText: "Excellent" }).count() >= 5);
});
const JE = await judgeOpens("Elementary", "Judge1", "Seed Sprouts");
await check("Elementary judge gets the comment-only form (no rubric)", async () => {
  await JE.page.locator(".fb-chip").first().waitFor({ timeout: 5000 });
  assert.equal(await JE.page.locator(".rub-steps").count(), 0);
});

console.log("\n── Guards and admin views");
await A.page.reload();
await A.page.locator(".role-card.adm").click();
// If the stored session had not been restored yet when the card was clicked, the app
// (correctly) asks for the password — sign in again rather than racing it.
await A.page.locator(".adm-side, input[type=email]").first().waitFor({ timeout: 6000 });
if (await A.page.locator("input[type=email]").count()) {
  await A.page.locator("input[type=email]").fill("admin@test.edu");
  await A.page.locator("input[type=password]").fill("correct-horse");
  await A.page.keyboard.press("Enter");
}
await A.page.locator(".adm-side").waitFor({ timeout: 6000 });
await A.page.locator(".nav-it", { hasText: "Setup" }).click();
await sel("Middle School").selectOption({ label: (await sel("Middle School").locator("option", { hasText: "Upper 100" }).innerText()).trim() });
await check("a scored department's rubric cannot be changed", async () => {
  await A.page.getByText(/"Middle School" already has scores/).waitFor({ timeout: 4000 });
  assert.equal(dep(DEPTS.D_MID).rubric_id, rub("Detailed 20").id);
});
await A.page.locator(".nav-it", { hasText: "Overview" }).click();
await check("the leaderboard shows the Middle School project out of 100", async () => {
  const t = await A.page.locator(".adm-main").innerText();
  assert.ok(/100\.0/.test(t), "avg 100.0 missing");
});
await A.page.locator(".nav-it", { hasText: "Rubric" }).click();
await A.page.getByLabel("Rubric to view").selectOption({ label: "Detailed 20" });
await check("a rubric in use shows who uses it and offers no Delete", async () => {
  await A.page.getByText(/Used by: Middle School/).waitFor({ timeout: 3000 });
  assert.equal(await A.page.getByRole("button", { name: "🗑 Delete" }).count(), 0);
});
await A.page.getByRole("button", { name: "★ Make default" }).click();
await check("Make default switches the default rubric (exactly one)", async () => {
  await A.page.waitForTimeout(500);
  assert.deepEqual(store.rubrics.filter(r => r.is_active).map(r => r.name), ["Detailed 20"]);
});
await A.page.getByLabel("Rubric to view").selectOption({ label: "Our own" });
await A.page.getByRole("button", { name: "🗑 Delete" }).click();
await A.page.getByRole("button", { name: "Delete rubric" }).click();
await check("an unused rubric can be deleted", async () => {
  await A.page.waitForTimeout(500);
  assert.equal(rub("Our own"), undefined);
});
await A.page.locator(".nav-it", { hasText: "Score Export" }).click().catch(() => A.page.locator(".nav-it", { hasText: "Export" }).click());
const [dl] = await Promise.all([A.page.waitForEvent("download"), A.page.getByRole("button", { name: /Judge Scores CSV/ }).click()]);
const csv = readFileSync(await dl.path(), "utf8");
await check("judge-scores CSV names each row's rubric and its maximum", async () => {
  assert.match(csv.split("\n")[0], /"Rubric"/); assert.match(csv.split("\n")[0], /"Out of"/);
  assert.match(csv, /"Detailed 20"/); assert.match(csv, /Is meaningful \(5\)/);
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
