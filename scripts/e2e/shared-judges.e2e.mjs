// Browser E2E — departments sharing judges (migration 2026-10h), real UI + mock backend.
// Elementary (comment-only) and Middle School share Judge 1–2; High School has Judge 3–4.
// A shared judge sees both departments' projects under headings; a reviewed comment-only
// project says "Reviewed" (not "0pts"); the admin's Setup shows who judges what; widening a
// range adds a department, narrowing one away from a signed-in judge is refused; the Judges
// tab lists a shared judge under each department; an imported project reaches the shared
// judge; the default (counts) mode warns that saving would undo sharing.
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
const dep = (id) => store.departments.find(d => d.id === id);
Object.assign(dep(DEPTS.D_ELEM), { judge_from: 1, judge_to: 2, scoring_mode: "feedback" });
Object.assign(dep(DEPTS.D_MID),  { judge_from: 1, judge_to: 2 });
Object.assign(dep(DEPTS.D_HIGH), { judge_from: 3, judge_to: 4 });
const now = new Date().toISOString();
store.projects.push(
  { id: "p_e", school_id: SID, num: "005", title: "Ladybug Garden", cat: "Life Science", grade: "K", locked: false, department_id: DEPTS.D_ELEM, room: "", description: "", motivation: "", created_at: now },
  { id: "p_h", school_id: SID, num: "009", title: "Bridge Loads", cat: "Physics, Math & Astronomy", grade: "11", locked: false, department_id: DEPTS.D_HIGH, room: "", description: "", motivation: "", created_at: now },
);

async function newPage(vp = { width: 820, height: 1180 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  return page;
}

console.log("\n── A shared judge signs in");
const J = await newPage();
await J.goto(`${BASE}/s/test`);
await J.locator(".role-card").first().click();
await J.locator('input[placeholder="e.g. 7"]').fill("2");
await check("preview names both departments: 'Judge 2 · Elementary + Middle School'", async () =>
  assert.match(await J.locator(".judge-num-hit").innerText(), /Judge 2 · Elementary \+ Middle School/));
await J.locator('input[placeholder="Event invite code"]').fill("ABC123");
await J.getByRole("button", { name: /Enter as Judge/ }).click();
await J.getByText("Ladybug Garden").waitFor({ timeout: 5000 });
const j2 = () => store.judges.find(j => j.alias === "Judge2");
await check("stored with both departments and both departments' projects", async () => {
  assert.deepEqual(j2().department_ids, [DEPTS.D_ELEM, DEPTS.D_MID]);
  assert.deepEqual([...j2().projects].sort(), ["p_e", "p_seed"]);
});
await check("project list has a heading per department, Elementary first", async () => {
  const heads = await J.locator(".jh-dept-head").allInnerTexts();
  assert.deepEqual(heads.map(h => h.trim().toLowerCase()), ["elementary", "middle school"]);
  assert.equal(await J.locator(".proj-item").count(), 2);
});
// A comment-only review is stored with empty criteria — it must not read "0pts".
store.scores.push({ id: "s_e", school_id: SID, judge_id: j2().id, project_id: "p_e", criteria: {}, notes: "", commendation: "Creative Idea", submitted_at: now });
await J.reload();
await check("a reviewed comment-only project shows '✓ Reviewed', not '0pts'", async () => {
  const row = J.locator(".proj-item", { hasText: "Ladybug Garden" });
  await row.waitFor({ timeout: 5000 });
  const t = await row.innerText();
  assert.match(t, /Reviewed/); assert.ok(!/0pts/.test(t), t);
});

console.log("\n── Admin: Setup shows and edits sharing");
const A = await newPage({ width: 1280, height: 900 });
await A.goto(`${BASE}/s/test`);
await A.locator(".role-card.adm").click();
await A.locator("input[type=email]").fill("admin@test.edu");
await A.locator("input[type=password]").fill("correct-horse");
await A.keyboard.press("Enter");
await A.locator(".adm-side").waitFor({ timeout: 6000 });
await A.locator(".nav-it", { hasText: "Setup" }).click();
const cell = (n, dept) => A.getByLabel(`Judge ${n} judges ${dept}`);
await check("department rows say who shares judges", async () => {
  const t = await A.locator(".setup-rows").first().innerText();
  assert.match(t, /shared with Middle School/); assert.match(t, /shared with Elementary/); assert.match(t, /own judges/);
});
await check("the grid shows the shared judges ticked in both departments, with their workload", async () => {
  assert.equal(await cell(1, "Elementary").isChecked(), true); assert.equal(await cell(1, "Middle School").isChecked(), true);
  assert.equal(await cell(3, "High School").isChecked(), true); assert.equal(await cell(3, "Elementary").isChecked(), false);
  const load = async (n) => (await A.locator(".roster-tbl tbody tr").nth(n - 1).locator("td").last().innerText()).trim();
  assert.equal(await load(1), "2", "Judge 1: Elementary + Middle School = 2 projects");
  assert.equal(await load(3), "1", "Judge 3: High School = 1 project");
});
// Tick High School for signed-in Judge2 → Judge2 gains High School.
await cell(2, "High School").check();
await A.getByRole("button", { name: "Save judges" }).click();
await check("ticking High School for signed-in Judge2 adds it to them (projects re-synced)", async () => {
  await A.waitForTimeout(700);
  assert.deepEqual(j2().department_ids, [DEPTS.D_ELEM, DEPTS.D_MID, DEPTS.D_HIGH]);
  assert.ok(j2().projects.includes("p_h"));
});
// Untick Middle School for Judge2 → would take it away from a signed-in judge → refused.
await cell(2, "Middle School").uncheck();
await A.getByRole("button", { name: "Save judges" }).click();
await check("taking Middle School away from signed-in Judge2 is refused, nothing changes", async () => {
  await A.getByText(/Judge2 is signed in to Middle School and would lose it/).waitFor({ timeout: 4000 });
  assert.ok(store.judge_roster.some(r => r.judge_number === 2 && r.department_id === DEPTS.D_MID));
});
await A.getByRole("button", { name: "Cancel" }).first().click();
await check("Cancel puts the saved ticks back", async () => assert.equal(await cell(2, "Middle School").isChecked(), true));

console.log("\n── Judges tab");
await A.locator(".nav-it", { hasText: "Judges" }).click();
await check("Judge2 is listed under all three departments, with 'also …'", async () => {
  assert.equal(await A.locator("tbody tr", { hasText: "Judge2" }).count(), 3);
  await A.getByText(/also Middle School, High School/).waitFor({ timeout: 3000 });
});

console.log("\n── A project added later reaches the shared judge");
await A.locator(".nav-it", { hasText: "Projects" }).first().click();
await A.locator('input[type=file][accept=".csv,text/csv"]').setInputFiles({ name: "late.csv", mimeType: "text/csv",
  buffer: Buffer.from("Project #,Title,Department,Category\n020,Late Volcano,Middle School,Earth & Environmental Science\n") });
await A.getByRole("button", { name: /^⬆ Import 1 project/ }).click();
await check("imported Middle School project is added to Judge2's list", async () => {
  await A.getByText(/^Imported 1 project\.$/).waitFor({ timeout: 6000 });
  const pid = store.projects.find(p => p.title === "Late Volcano").id;
  assert.ok(j2().projects.includes(pid));
});

console.log("\n── Phone");
await A.locator(".nav-it", { hasText: "Setup" }).click();
await check("Setup has no horizontal page overflow on a phone (the grid scrolls inside its box)", async () => {
  await A.setViewportSize({ width: 390, height: 844 });
  await A.waitForTimeout(250);
  const over = await A.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 1, `page scrolls sideways by ${over}px`);
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
