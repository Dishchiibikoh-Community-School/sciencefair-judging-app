// Browser E2E — the 2026-27 evaluation forms (2026-10-21).
//   • Middle & High School: 20 items rated 1–5 in five sections = 100.
//   • Elementary: 8 items rated 1–5 = 40, counted × 2.5 = 100, with Strength / Next step comments
//     and a safety-concern check that reaches the admin's Alerts board.
//   • Unsubmitted taps are kept on the device (drafts) — leaving the screen or a reload loses nothing.
//   • Without migration 2026-10o the comments + safety flag are folded into notes, never lost.
//   • The rubric editor keeps half points (12.5 / 7.5) — parseInt used to cut them.
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
store.rubrics.push({ id: "rub1", school_id: SID, name: "Default", is_active: true, criteria: [] });
const now = new Date().toISOString();
store.projects.push(
  { id: "p_el1", school_id: SID, num: "007", title: "Bean Plant Soil", cat: "Life Science", grade: "3",
    locked: false, department_id: DEPTS.D_ELEM, room: "", description: "", motivation: "", created_at: now },
  { id: "p_el2", school_id: SID, num: "008", title: "Toothpaste and Eggs", cat: "Chemistry & Material Science", grade: "2",
    locked: false, department_id: DEPTS.D_ELEM, room: "", description: "", motivation: "", created_at: now },
  { id: "p_ms1", school_id: SID, num: "014", title: "Bridge Earthquake Test", cat: "Engineering, Robotics & Technology", grade: "7",
    locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now },
);

async function newPage(vp = { width: 820, height: 1180 }) {
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  return { ctx, page };
}
async function adminPage() {
  const A = await newPage({ width: 1280, height: 950 });
  await A.page.goto(`${BASE}/s/test`);
  await A.page.locator(".role-card.adm").click();
  await A.page.locator("input[type=email]").fill("admin@test.edu");
  await A.page.locator("input[type=password]").fill("correct-horse");
  await A.page.keyboard.press("Enter");
  await A.page.locator(".adm-side").waitFor({ timeout: 10000 });
  return A;
}
async function judgeIn(deptName, alias) {
  const J = await newPage();
  await J.page.goto(`${BASE}/s/test`);
  await J.page.locator(".role-card").first().click();
  await J.page.getByRole("button", { name: new RegExp(deptName) }).click();
  await J.page.locator('input[placeholder="e.g. Judge1"]').fill(alias);
  await J.page.locator('input[placeholder="Event invite code"]').fill("ABC123");
  await J.page.getByRole("button", { name: /Enter as Judge/ }).click();
  await J.page.locator(".proj-item").first().waitFor({ timeout: 8000 });
  return J;
}
const rub = (re) => store.rubrics.find(r => re.test(r.name));
const judgeId = (alias, dept) => store.judges.find(j => j.alias === alias && j.department_id === dept)?.id;
const scoreOf = (jid, pid) => store.scores.find(s => s.judge_id === jid && s.project_id === pid);
// Tap rating `n` (1–5) on item i of the scoring form.
const tap = (page, i, n) => page.locator(".rub-item").nth(i).locator(".rub-step-btn").nth(n - 1).click();

console.log("\n── Setup: both new forms are presets, added + assigned in one step");
const A = await adminPage();
await A.page.locator(".nav-it", { hasText: "Setup" }).click();
const sel = (name) => A.page.getByLabel(`How ${name} is judged`);
await sel("Elementary").selectOption("preset:elementary-2627");
await A.page.waitForTimeout(700);
await sel("Middle School").selectOption("preset:isef-ms-hs-2627");
await A.page.waitForTimeout(700);
await check("Elementary → the 8-item form, Middle School → the 20-item form", async () => {
  const el = rub(/^Elementary form/), hs = rub(/^Middle & High School form/);
  assert.ok(el && hs, "presets were not added: " + store.rubrics.map(r => r.name).join(" | "));
  assert.equal(store.departments.find(d => d.id === DEPTS.D_ELEM).rubric_id, el.id);
  assert.equal(store.departments.find(d => d.id === DEPTS.D_MID).rubric_id, hs.id);
  assert.equal(el.criteria.length, 8); assert.equal(hs.criteria.length, 20);
});
await check("both forms total exactly 100 points (elementary = 8 × 5 × 2.5)", async () => {
  const sum = (r) => r.criteria.reduce((s, c) => s + c.max, 0);
  assert.equal(sum(rub(/^Elementary form/)), 100); assert.equal(sum(rub(/^Middle & High School form/)), 100);
});
await check("the middle/high sections are 15 / 25 / 20 / 20 / 20 (items × 5), and no criterion is id 'abstract'", async () => {
  const by = {}; for (const c of rub(/^Middle & High School form/).criteria) by[c.section] = (by[c.section] || 0) + c.max;
  assert.deepEqual(Object.values(by), [15, 25, 20, 20, 20]);
  assert.ok(!store.rubrics.some(r => r.criteria.some(c => c.id === "abstract" && /2026-27/.test(r.name))));
});

console.log("\n── Elementary judge: ratings 1–5, × 2.5 shown, drafts kept");
const J = await judgeIn("Elementary", "Judge1");
await check("the old 42-point 'Scoring Guide' card is gone from the judge's list", async () =>
  assert.equal(await J.page.getByText(/0 = not present/).count(), 0));
await check("the project code is the big badge a judge reads", async () =>
  assert.equal((await J.page.locator(".proj-item", { hasText: "Bean Plant Soil" }).locator(".proj-num").innerText()).trim(), "Elem-LS-007"));
await J.page.locator(".proj-item", { hasText: "Bean Plant Soil" }).click();
await check("the elementary guide is shown (just starting · getting there · shining)", async () =>
  assert.match(await J.page.locator("[data-testid=sc-guide]").innerText(), /1 = just starting · 3 = getting there · 5 = shining/));
await check("buttons show the rating 1–5 with the points under it", async () => {
  const b = J.page.locator(".rub-item").first().locator(".rub-step-btn");
  assert.equal(await b.count(), 5);
  assert.equal((await b.nth(2).locator(".rub-step-lab").innerText()).trim(), "3");
  assert.equal((await b.nth(2).locator(".rub-step-pts").innerText()).trim(), "7.5 pts");
});
// Three taps, then leave the screen and reload the whole page — nothing may be lost.
await tap(J.page, 0, 4); await tap(J.page, 1, 4); await tap(J.page, 2, 2);
await check("the item shows the RATING given ('4 / 5'), not 10 / 12.5", async () =>
  assert.equal((await J.page.locator(".rub-item").first().locator(".rub-val").innerText()).trim(), "4 / 5"));
await J.page.getByRole("button", { name: /Back to my projects/ }).click();
await check("the list marks the half-scored project as a draft", () =>
  J.page.locator(".proj-item", { hasText: "Bean Plant Soil" }).getByText(/Draft — not submitted/).waitFor({ timeout: 4000 }));
await J.page.reload();
await J.page.locator(".proj-item").first().waitFor({ timeout: 8000 });
await J.page.locator(".proj-item", { hasText: "Bean Plant Soil" }).click();
await check("after a reload the three taps come back, with a 'kept on this device' note", async () => {
  await J.page.locator("[data-testid=draft-restored]").waitFor({ timeout: 4000 });
  assert.equal(await J.page.locator(".rub-step-btn.selected").count(), 3);
});
for (let i = 2; i < 8; i++) await tap(J.page, i, 4);   // all eight at "4"
await check("the total shows the paper form's working: Ratings 32 / 40 × 2.5 = 80 / 100", async () => {
  assert.equal((await J.page.locator("[data-testid=sc-working]").innerText()).trim(), "Ratings 32 / 40 × 2.5 = 80 / 100");
  assert.equal((await J.page.locator(".sc-total-num").innerText()).trim(), "80");
});
await J.page.locator("[data-testid=sc-feedback] textarea").nth(0).fill("Clear question and a neat chart");
await J.page.locator("[data-testid=sc-feedback] textarea").nth(1).fill("Test more than one plant");
await J.page.locator("[data-testid=sc-safety]").getByRole("button", { name: /Yes/ }).click();
await J.page.getByRole("button", { name: /Submit Score/ }).click();
await J.page.waitForTimeout(800);
const j1el = judgeId("Judge1", DEPTS.D_ELEM);
await check("stored: 8 values of 10 points, Strength + Next step, safety_concern true", async () => {
  const s = scoreOf(j1el, "p_el1");
  assert.ok(s, "no score row");
  assert.equal(Object.keys(s.criteria).length, 8);
  assert.ok(Object.values(s.criteria).every(v => v === 10));
  assert.deepEqual(s.feedback, { strength: "Clear question and a neat chart", next_step: "Test more than one plant" });
  assert.equal(s.safety_concern, true);
});
await check("after submitting, the draft is gone and the list shows 80 points", async () => {
  await J.page.locator(".proj-item", { hasText: "Bean Plant Soil" }).getByText("✓ 80pts").waitFor({ timeout: 4000 });
  assert.equal(await J.page.getByText(/Draft — not submitted/).count(), 0);
});
await check("the raised concern is written to both logs — the activity log WITHOUT the comment text", async () => {
  assert.ok(store.activity_log.some(l => /SAFETY \/ RULE CONCERN on Project #007/.test(l.message)));
  const it = store.it_logs.find(l => l.event === "SAFETY_CONCERN_RAISED");
  assert.ok(it, "no SAFETY_CONCERN_RAISED");
  assert.ok(!JSON.stringify(it.payload).includes("neat chart"), "comment text leaked into it_logs");
});

console.log("\n── Discarding a draft");
await J.page.locator(".proj-item", { hasText: "Toothpaste and Eggs" }).click();
await tap(J.page, 0, 5);
await J.page.getByRole("button", { name: /Back to my projects/ }).click();
await J.page.locator(".proj-item", { hasText: "Toothpaste and Eggs" }).click();
await J.page.getByRole("button", { name: "Discard draft" }).click();
await check("Discard draft empties the form and the list no longer says Draft", async () => {
  assert.equal(await J.page.locator(".rub-step-btn.selected").count(), 0);
  await J.page.getByRole("button", { name: /Back to my projects/ }).click();
  assert.equal(await J.page.getByText(/Draft — not submitted/).count(), 0);
});
await J.ctx.close();

console.log("\n── Middle / High School judge: 20 items in five sections");
const M = await judgeIn("Middle School", "Judge1");
await M.page.locator(".proj-item", { hasText: "Bridge Earthquake Test" }).click();
await check("five section headings, in the form's order", async () =>
  assert.deepEqual((await M.page.locator(".rub-section-head").allInnerTexts()).map(s => s.trim()),
    ["Project Overview & Purpose", "Scientific Inquiry & Method", "Data & Conclusion", "Presentation & Defense", "Research, Collaboration & Compliance"]));
await check("numbers only (1–5), the scale in the guide, the form's comment box, no safety check", async () => {
  assert.equal(await M.page.locator(".rub-step-btn.labelled").count(), 0);
  assert.match(await M.page.locator("[data-testid=sc-guide]").innerText(), /1 = Needs Improvement · 2 = Fair · 3 = Good · 4 = Very Good · 5 = Excellent/);
  await M.page.getByText("Judge Comments & Constructive Feedback").waitFor({ timeout: 3000 });
  assert.equal(await M.page.locator("[data-testid=sc-safety]").count(), 0);
  assert.equal(await M.page.locator("[data-testid=sc-working]").count(), 0);
});
for (let i = 0; i < 20; i++) await tap(M.page, i, 3);
await check("all 'Good' (3) = 60 / 100 — the 60% minimum to place, exactly", async () =>
  assert.equal((await M.page.locator(".sc-total-num").innerText()).trim(), "60"));
await M.page.locator("textarea").fill("Strong testing, cite your sources");
await M.page.getByRole("button", { name: /Submit Score/ }).click();
await M.page.waitForTimeout(800);
await check("stored with 20 values and notes — and NO feedback / safety columns (other rubrics unchanged)", async () => {
  const s = scoreOf(judgeId("Judge1", DEPTS.D_MID), "p_ms1");
  assert.equal(Object.keys(s.criteria).length, 20);
  assert.equal(s.notes, "Strong testing, cite your sources");
  assert.ok(!("feedback" in s) && !("safety_concern" in s), "a middle/high score must keep its old shape");
});
await M.ctx.close();

console.log("\n── Admin sees the safety concern, the comments and the working");
// A fresh admin screen: the mock has no realtime, so the one opened before judging is stale.
await A.ctx.close();
const B = await adminPage();
await B.page.locator(".nav-it", { hasText: "Alerts" }).click();
await check("Alerts: a red safety card naming the project, the judge and their comments", async () => {
  const card = B.page.locator("[data-testid=hb-safety]");
  await card.waitFor({ timeout: 5000 });
  const t = await card.innerText();
  assert.match(t, /Elem-LS-007/); assert.match(t, /Bean Plant Soil/); assert.match(t, /raised by Judge1/);
  assert.match(t, /Test more than one plant/);
});
await B.page.locator(".nav-it", { hasText: "Validation" }).click();
// The per-judge score breakdown lives in the deliberation panel.
await B.page.getByRole("button", { name: "Open Manually" }).click();
await check("deliberation: the judge's Strength / Next step and the concern sit beside their score", async () => {
  await B.page.getByText("⚠ Safety / rule concern raised").first().waitFor({ timeout: 5000 });
  await B.page.getByText("Strength: Clear question and a neat chart").first().waitFor();
});
await B.page.locator(".nav-it", { hasText: "Score Export" }).click();
const [dl] = await Promise.all([B.page.waitForEvent("download"), B.page.getByRole("button", { name: /Download Judge Scores CSV/ }).click()]);
const csv = readFileSync(await dl.path(), "utf8");
await check("judge-scores CSV: Total 80 of 100, Ratings 32 of 40, Strength / Next step, Safety YES", async () => {
  const head = csv.split("\n")[0];
  for (const h of ["Ratings", "Ratings out of", "Strength", "Next step", "Safety concern"]) assert.ok(head.includes(`"${h}"`), h + " column missing");
  const row = csv.split("\n").find(l => l.includes("Bean Plant Soil"));
  assert.match(row, /"80","100","32","40"/); assert.match(row, /"Clear question and a neat chart","Test more than one plant","YES"/);
});

console.log("\n── Database without migration 2026-10o: nothing the judge wrote is lost");
store.scoresFeedbackMissing = true;
const J2 = await judgeIn("Elementary", "Judge2");
await J2.page.locator(".proj-item", { hasText: "Toothpaste and Eggs" }).click();
for (let i = 0; i < 8; i++) await tap(J2.page, i, 3);
await J2.page.locator("[data-testid=sc-feedback] textarea").nth(0).fill("Great egg idea");
await J2.page.locator("[data-testid=sc-safety]").getByRole("button", { name: /Yes/ }).click();
await J2.page.getByRole("button", { name: /Submit Score/ }).click();
await J2.page.waitForTimeout(900);
await check("the score is saved (not stuck in the offline queue) with the concern + comment inside notes", async () => {
  const s = scoreOf(judgeId("Judge2", DEPTS.D_ELEM), "p_el2");
  assert.ok(s, "score was not saved — it would sit in the offline queue forever");
  assert.match(s.notes, /SAFETY \/ RULE CONCERN/); assert.match(s.notes, /Strength: Great egg idea/);
  assert.equal(await J2.page.evaluate(() => JSON.parse(localStorage.getItem("sf_offline_queue") || "[]").length), 0);
});
await check("…and the IT log says the migration is missing", async () =>
  assert.ok(store.it_logs.some(l => l.event === "SCORE_FEEDBACK_COLS_MISSING")));
store.scoresFeedbackMissing = false;
await J2.ctx.close();

console.log("\n── The rubric editor keeps half points");
await B.page.locator(".nav-it", { hasText: "Rubric" }).click();
await B.page.getByLabel("Rubric to view").selectOption({ label: rub(/^Elementary form/).name });
await B.page.getByRole("button", { name: "Edit Rubric" }).click();
// Touch the first item's steps field (blur re-parses it) and save — 7.5 must survive.
const steps = B.page.locator('input[placeholder^="e.g. 0, 1, 2"]').first();
await steps.click(); await steps.blur();
await B.page.getByRole("button", { name: "Save Rubric" }).click();
await B.page.waitForTimeout(800);
// Scores exist under this rubric, so ANY change to steps/points would stop for the impact
// warning. An untouched rubric must save straight through — with parseInt it did not: 7.5
// became 7, the steps "changed", and the warning asked to rewrite every elementary score.
await check("saving the untouched elementary rubric asks nothing and closes the editor", async () => {
  await B.page.getByRole("button", { name: "Edit Rubric" }).waitFor({ timeout: 4000 });
  assert.equal(await B.page.getByRole("button", { name: "Save Rubric" }).count(), 0);
});
await check("after editing + saving, the elementary steps are still 2.5 / 5 / 7.5 / 10 / 12.5", async () => {
  const c = rub(/^Elementary form/).criteria[0];
  assert.deepEqual(c.steps, [2.5, 5, 7.5, 10, 12.5]); assert.equal(c.max, 12.5);
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
