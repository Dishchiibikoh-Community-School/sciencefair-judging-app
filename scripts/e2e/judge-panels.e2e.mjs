// Browser E2E — "N judges per project" panels (migration 2026-10k), real UI + mock backend.
// Middle School: 7 projects, judges 1–4 on the roster. The admin picks "3 judges per project";
// every project gets 3 different judges, spread evenly; a judge sees ONLY their assigned
// projects; the Judges tab shows coverage and who has not signed in; Rebalance moves unscored
// work from absent judges to present ones and never moves scored work; the setting locks once
// scores exist; a project added later gets its 3 judges without reshuffling anyone.
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
const now = new Date().toISOString();
for (let i = 2; i <= 7; i++) store.projects.push({ id: `p_m${i}`, school_id: SID, num: String(i).padStart(3, "0"), title: `Middle project ${i}`,
  cat: "Life Science", grade: "7", locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now });
// Roster (2026-10k): Elementary 1, Middle School 1–4 (judge 1 shared), High School 5.
store.judge_roster = [[1, DEPTS.D_ELEM], [1, DEPTS.D_MID], [2, DEPTS.D_MID], [3, DEPTS.D_MID], [4, DEPTS.D_MID], [5, DEPTS.D_HIGH]]
  .map(([n, d]) => ({ school_id: SID, judge_number: n, department_id: d }));
for (const d of store.departments) { const ns = store.judge_roster.filter(r => r.department_id === d.id).map(r => r.judge_number);
  d.judge_from = Math.min(...ns); d.judge_to = Math.max(...ns); }

async function newPage(vp = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  return page;
}
async function admin(page) {
  await page.goto(`${BASE}/s/test`);
  await page.locator(".role-card.adm").click();
  await page.locator(".adm-side, input[type=email]").first().waitFor({ timeout: 6000 });
  if (await page.locator("input[type=email]").count()) {
    await page.locator("input[type=email]").fill("admin@test.edu");
    await page.locator("input[type=password]").fill("correct-horse");
    await page.keyboard.press("Enter");
  }
  await page.locator(".adm-side").waitFor({ timeout: 6000 });
}
async function judge(n) {
  const page = await newPage({ width: 820, height: 1180 });
  await page.goto(`${BASE}/s/test`);
  await page.locator(".role-card").first().click();
  await page.locator('input[placeholder="e.g. 7"]').fill(String(n));
  await page.locator('input[placeholder="Event invite code"]').fill("ABC123");
  await page.getByRole("button", { name: /Enter as Judge/ }).click();
  await page.locator(".proj-item").first().waitFor({ timeout: 6000 });
  return page;
}
const inMid = (pid) => store.projects.find(p => p.id === pid)?.department_id === DEPTS.D_MID;
const midRows = () => store.project_judges.filter(x => inMid(x.project_id));

console.log("\n── Admin: 3 judges per project for Middle School");
const A = await newPage();
await admin(A);
await A.locator(".nav-it", { hasText: "Setup" }).click();
await A.getByLabel("Judges per project for Middle School").selectOption("3");
await check("every Middle School project gets 3 different judges, spread evenly over judges 1–4", async () => {
  for (let i = 0; i < 30 && midRows().length < 21; i++) await A.waitForTimeout(100);
  const per = {}, load = {};
  for (const r of midRows()) { per[r.project_id] = new Set([...(per[r.project_id] || []), r.judge_number]); load[r.judge_number] = (load[r.judge_number] || 0) + 1; }
  assert.equal(Object.keys(per).length, 7); assert.ok(Object.values(per).every(s => s.size === 3));
  const l = Object.values(load); assert.equal(l.reduce((a, b) => a + b, 0), 21); assert.ok(Math.max(...l) - Math.min(...l) <= 1, JSON.stringify(load));
});
await check("the department row says '3 per project'", () =>
  A.locator(".setup-rows").first().getByText(/3 per project/).waitFor({ timeout: 4000 }));
await check("the grid's Projects column shows each judge's real load", async () => {
  const load = async (n) => (await A.locator(".roster-tbl tbody tr").nth(n - 1).locator("td").last().innerText()).trim();
  const expected1 = midRows().filter(r => r.judge_number === 1).length;   // + Elementary has 0 projects
  for (let i = 0; i < 30 && (await load(1)) !== String(expected1); i++) await A.waitForTimeout(100);
  assert.equal(await load(1), String(expected1));
});

console.log("\n── Judges see only their assigned projects");
const J1 = await judge(1);
const mine1 = () => midRows().filter(r => r.judge_number === 1).map(r => r.project_id).sort();
await check("Judge 1 sees exactly their assigned Middle School projects", async () => {
  assert.equal(await J1.locator(".proj-item").count(), mine1().length);
  assert.deepEqual([...store.judges.find(j => j.alias === "Judge1").projects].sort(), mine1());
});
const scoredPid = mine1()[0];
store.scores.push({ id: "s1", school_id: SID, judge_id: store.judges.find(j => j.alias === "Judge1").id, project_id: scoredPid,
  criteria: { presentation: 4 }, notes: "", submitted_at: now });
await judge(2);

console.log("\n── Judges tab: coverage, no-shows, rebalance");
await A.reload(); await admin(A);
await A.locator(".nav-it", { hasText: "Judges" }).click();
await check("the Panels card shows coverage and that judges 3–4 have not signed in", async () => {
  const t = await A.locator(".panel-card").innerText();
  assert.match(t, /Middle School — 3 judges per project/); assert.match(t, /2 of 4 signed in/);
  assert.match(t, /Judges 3–4 have not signed in/);
});
await A.getByRole("button", { name: "Show assignments" }).click();
await check("the assignment table lists every project with its judges and ✓ for scored", async () => {
  assert.equal(await A.locator(".panel-card tbody tr").count(), 7);
  assert.match(await A.locator(".panel-card").innerText(), /1✓/);
});
await A.getByRole("button", { name: /Rebalance/ }).click();
await check("Rebalance moves unscored work onto judges 1 and 2 and keeps the scored assignment", async () => {
  for (let i = 0; i < 30 && midRows().some(r => r.judge_number > 2); i++) await A.waitForTimeout(100);
  assert.ok(midRows().every(r => r.judge_number <= 2), JSON.stringify(midRows().filter(r => r.judge_number > 2)));
  assert.ok(midRows().some(r => r.project_id === scoredPid && r.judge_number === 1));
  await A.getByText(/still short of 3 judges/).waitFor({ timeout: 3000 });
});
await check("signed-in judges' lists follow the rebalance", async () =>
  assert.equal(store.judges.find(j => j.alias === "Judge2").projects.length, midRows().filter(r => r.judge_number === 2).length));

console.log("\n── Locks and late projects");
await A.locator(".nav-it", { hasText: "Setup" }).click();
await A.getByLabel("Judges per project for Middle School").selectOption("2");
await check("judges per project cannot change once the department has scores", async () => {
  await A.getByText(/"Middle School" already has scores/).waitFor({ timeout: 3000 });
  assert.equal(store.departments.find(d => d.id === DEPTS.D_MID).judges_per_project, 3);
});
const before = JSON.stringify(midRows());
await A.locator(".nav-it", { hasText: "Projects" }).first().click();
await A.locator('input[type=file][accept=".csv,text/csv"]').setInputFiles({ name: "late.csv", mimeType: "text/csv",
  buffer: Buffer.from("Project #,Title,Department,Category\n020,Late Volcano,Middle School,Earth & Environmental Science\n") });
await A.getByRole("button", { name: /^⬆ Import 1 project/ }).click();
await check("a late project gets its judges and nobody else's assignments change", async () => {
  await A.getByText(/^Imported 1 project\./).waitFor({ timeout: 6000 });
  const late = store.projects.find(p => p.title === "Late Volcano").id;
  for (let i = 0; i < 30 && !midRows().some(r => r.project_id === late); i++) await A.waitForTimeout(100);
  assert.equal(midRows().filter(r => r.project_id === late).length, 3);
  assert.equal(JSON.stringify(midRows().filter(r => r.project_id !== late)), before);
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
