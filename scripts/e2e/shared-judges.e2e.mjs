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
store.app_settings.push({ school_id: SID, key: "judge_sharing", value: "on" });
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
await check("sharing mode is selected and rows say who shares", async () => {
  assert.equal(await A.getByRole("radio", { name: /Departments can share judges/ }).isChecked(), true);
  const t = await A.locator(".jn-rows").innerText();
  assert.match(t, /shared with Middle School/); assert.match(t, /shared with Elementary/); assert.match(t, /own judges/);
});
await check("'Who judges what' shows each judge's departments and workload", async () => {
  const rows = (await A.locator(".jn-cover-row").allInnerTexts()).map(r => r.replace(/\s+/g, " ").trim());
  assert.ok(rows.some(r => /Judge 1–2 Elementary \+ Middle School 2 projects each/.test(r)), rows.join(" | "));
  assert.ok(rows.some(r => /Judge 3–4 High School 1 project each/.test(r)), rows.join(" | "));
});
// Widen High School down to Judge 2 → Judge2 gains High School.
await A.getByLabel("First judge for High School").fill("2");
await A.getByRole("button", { name: "Save judge numbers" }).click();
await check("widening High School to 2–4 adds it to signed-in Judge2 (projects re-synced)", async () => {
  await A.waitForTimeout(700);
  assert.deepEqual(j2().department_ids, [DEPTS.D_ELEM, DEPTS.D_MID, DEPTS.D_HIGH]);
  assert.ok(j2().projects.includes("p_h"));
});
// Narrow Middle School to Judge 1 only → would take it away from Judge2 → refused.
await A.getByLabel("Last judge for Middle School").fill("1");
await A.getByRole("button", { name: "Save judge numbers" }).click();
await check("taking Middle School away from signed-in Judge2 is refused, nothing changes", async () => {
  await A.getByText(/Judge2 is signed in to Middle School and would lose it/).waitFor({ timeout: 4000 });
  assert.equal(dep(DEPTS.D_MID).judge_to, 2);
});
await A.getByRole("button", { name: "Cancel" }).first().click();
await check("bad input is caught before saving (From > To)", async () => {
  await A.getByLabel("First judge for High School").fill("9");
  await A.getByLabel("Last judge for High School").fill("5");
  await A.getByRole("button", { name: "Save judge numbers" }).click();
  await A.getByText(/High School: enter both numbers/).waitFor({ timeout: 3000 });
  assert.equal(dep(DEPTS.D_HIGH).judge_from, 2);
});
await A.getByRole("button", { name: "Cancel" }).first().click();

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

console.log("\n── Back to the default mode");
await A.locator(".nav-it", { hasText: "Setup" }).click();
await A.getByRole("radio", { name: /Each department has its own judges/ }).click();
await check("default mode warns that departments currently share judges", async () => {
  await A.getByText(/Some departments currently share judges/).waitFor({ timeout: 4000 });
  assert.equal(store.app_settings.find(r => r.key === "judge_sharing").value, "off");
});
await check("Setup has no horizontal overflow on a phone (sharing editor)", async () => {
  await A.getByRole("radio", { name: /Departments can share judges/ }).click();
  await A.getByText("Who judges what").waitFor({ timeout: 4000 });
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
