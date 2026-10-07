// Browser E2E — Alerts "Event health" board + IT-log diagnostics (2026-10-07), real UI + mock backend.
// Coverage (no department, department without judges), progress per department, idle judges,
// outliers with every judge's total (and the two-judge note), devices with stuck scores, errors in
// the last hour; IT Logs: build stamp, ctx on every entry, time window, report hides the results
// token, no fake "Clear" button; LOAD_FAILED once per table (never for admin-only tables seen by a
// visitor); a dropped live connection is logged only after the 30-second grace.
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
const T = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
const now = T(0);
store.projects.push(
  { id: "p_m2", school_id: SID, num: "002", title: "Unreviewed Middle", cat: "Life Science", grade: "7", locked: false,
    department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now },
  { id: "p_none", school_id: SID, num: "050", title: "Homeless Project", cat: "Life Science", grade: "7", locked: false,
    department_id: null, room: "", description: "", motivation: "", created_at: now },
  { id: "p_hi", school_id: SID, num: "003", title: "High Bridges", cat: "Life Science", grade: "11", locked: false,
    department_id: DEPTS.D_HIGH, room: "", description: "", motivation: "", created_at: now },
);
const judgeRow = (id, alias, joinedMin) => ({ id, school_id: SID, alias, department_id: DEPTS.D_MID, department_ids: [DEPTS.D_MID],
  projects: ["p_seed", "p_m2"], joined_at: T(joinedMin) });
store.judges.push(judgeRow("j_1", "Judge1", 40), judgeRow("j_2", "Judge2", 40));
const MAX = { presentation:6, testable_q:3, background:3, hypothesis:3, variables:3, materials:3, data:6, analysis:6, conclusion:3, abstract:6 };   // 42
const LOW = { presentation:2, testable_q:1, background:1, hypothesis:1, variables:1, materials:1, data:2, analysis:2, conclusion:1, abstract:2 };   // 14
store.scores.push(
  { id: "s1", school_id: SID, judge_id: "j_1", project_id: "p_seed", criteria: MAX, notes: "", submitted_at: T(35) },
  { id: "s2", school_id: SID, judge_id: "j_2", project_id: "p_seed", criteria: LOW, notes: "", submitted_at: T(3) },
);
const it = (id, level, event, minAgo, payload = {}) =>
  ({ id, school_id: SID, level, module: "DB", event, detail: event, payload, created_at: T(minAgo) });
store.it_logs.push(
  it("EVT-ERR001", "ERROR", "SOMETHING_BROKE", 10),
  it("EVT-Q2A", "WARN", "SCORE_QUEUED", 20, { judgeId: "j_2", projectId: "p_m2", queueLength: 2 }),
  it("EVT-Q2B", "WARN", "OFFLINE_SYNC_FAILED", 15, { judgeId: "j_2", queueLength: 2, failed: 2 }),
  it("EVT-Q1A", "WARN", "SCORE_QUEUED", 50, { judgeId: "j_1", projectId: "p_m2", queueLength: 1 }),
  it("EVT-Q1B", "INFO", "OFFLINE_QUEUE_FLUSHED", 45, { judgeId: "j_1", queueLength: 0, synced: 1 }),
  it("EVT-OLD001", "INFO", "OLD_EVENT", 300),
);
store.share_links.push({ id: "sl1", school_id: SID, token: "SECRET-TOKEN-XYZ", expiry: "never", show_rubric: false,
  title: "Results", created_at: now, revoked_at: null });

async function newPage({ refuseRealtime = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  // A realtime server that answers every channel join with an error: the subscribe callback
  // reports CHANNEL_ERROR at once — the case that used to log REALTIME_DOWN immediately.
  if (refuseRealtime) await page.routeWebSocket(/realtime/, ws => ws.onMessage(raw => {
    let m; try { m = JSON.parse(String(raw)); } catch { return; }
    if (Array.isArray(m) && m[3] === "phx_join")
      ws.send(JSON.stringify([m[0], m[1], m[2], "phx_reply", { status: "error", response: { reason: "refused by test" } }]));
  }));
  return page;
}
async function admin(page) {
  await page.goto(`${BASE}/s/test`);
  await page.locator(".role-card.adm").click();
  await page.locator("input[type=email]").fill("admin@test.edu");
  await page.locator("input[type=password]").fill("correct-horse");
  await page.keyboard.press("Enter");
  await page.locator(".adm-side").waitFor({ timeout: 6000 });
}
const tid = (page, id) => page.locator(`[data-testid="${id}"]`);

// ── A visitor's page: no noise from admin-only tables, no instant REALTIME_DOWN ──
console.log("\n── Visitor page: logging noise");
const V = await newPage({ refuseRealtime: true });
const visitorStart = Date.now();
await V.goto(`${BASE}/s/test`);
await V.locator(".role-card").first().waitFor({ timeout: 6000 });
await V.waitForTimeout(15000);
const visitorRows = () => store.it_logs.filter(r => r.payload?.ctx?.role === "visitor");
await check("a visitor never logs LOAD_FAILED for admin-only tables (project_private / judge_labels refuse everyone else)", async () =>
  assert.deepEqual(store.it_logs.filter(r => r.event === "LOAD_FAILED").map(r => r.payload.table), []));
await check("a refused live connection is NOT logged within the first 15 s (every locked phone used to log one at once)", async () =>
  assert.equal(visitorRows().filter(r => r.event === "REALTIME_DOWN").length, 0));

// ── Admin: the health board ──
console.log("\n── Alerts: event health");
const A = await newPage();
const adminStart = Date.now();
await admin(A);
await A.locator(".nav-it", { hasText: "Alerts" }).click();
await A.locator('[data-testid="hb-summary"]').waitFor({ timeout: 4000 });
await A.waitForTimeout(800);
await check("the fake 'Database ● Operational' badge is gone; live updates show their real state", async () => {
  assert.equal(await A.getByText("Operational").count(), 0);
  assert.notEqual((await tid(A, "hb-realtime").innerText()).trim(), "● Live", "the mock has no realtime — it cannot be live");
});
await check("coverage: a project with no department is listed (nobody would score it)", async () =>
  assert.match(await tid(A, "hb-nodept").innerText(), /050/));
await check("coverage: a department with projects but no judge is named", async () =>
  assert.match(await tid(A, "hb-nojudge").innerText(), /High School/));
await check("progress per department: Middle School 2/4 scores, 1 project not reviewed yet", async () => {
  const t = await tid(A, "hb-prog").filter({ hasText: "Middle School" }).innerText();
  assert.match(t, /2\/4 scores/); assert.match(t, /1 project not reviewed yet/);
});
await check("idle judges: Judge1 (last score 35 min ago, work left) is listed; Judge2 (3 min ago) is not", async () => {
  const t = await tid(A, "hb-idle").innerText();
  assert.match(t, /Judge1/); assert.doesNotMatch(t, /Judge2/);
});
await check("outliers: one card per project with EVERY judge's total, and the two-judge note", async () => {
  const t = await tid(A, "hb-outlier").innerText();
  assert.match(t, /Judge1: 42/); assert.match(t, /Judge2: 14/);
  assert.match(t, /Only two judges/);
  assert.equal(await tid(A, "hb-outlier").count(), 1);
});
await check("stuck scores: Judge2's device reports 2 waiting and the server refusing; Judge1's queue was flushed", async () => {
  const t = await tid(A, "hb-stuck").innerText();
  assert.match(t, /Judge2 — 2 scores waiting/); assert.match(t, /server refusing/);
  assert.doesNotMatch(t, /Judge1/);
});
await check("errors in the last hour: 1, with the event name", async () => {
  assert.match(await tid(A, "hb-errors").innerText(), /1 error/);
  await A.getByText("SOMETHING_BROKE").first().waitFor({ timeout: 2000 });
});

// ── IT Logs ──
console.log("\n── IT Logs: diagnostics");
await A.getByRole("button", { name: "Open IT Logs →" }).click();
await A.locator(".pin-gate input").fill("4821");
await A.getByRole("button", { name: "Unlock" }).click();
await A.locator(".it-term").waitFor({ timeout: 4000 });
await check("the terminal shows the build this page runs (not a hardcoded 1.0.0)", async () =>
  assert.match(await A.locator(".it-term-head").innerText(), /build local·\d{4}-\d\d-\d\d/));
await check("no fake 'Clear All IT Logs' button; the screen says the log is permanent", async () => {
  assert.equal(await A.getByRole("button", { name: /Clear All IT Logs/ }).count(), 0);
  await A.getByText(/The IT log is permanent/).waitFor({ timeout: 2000 });
});
await check("time window: 'last 2 hours' hides a 5-hour-old entry, 'everything loaded' shows it", async () => {
  await A.locator("select.it-range").selectOption("2h");
  assert.equal(await A.locator(".it-body").getByText("OLD_EVENT").count(), 0);
  await A.locator("select.it-range").selectOption("all");
  assert.equal(await A.locator(".it-body").getByText("OLD_EVENT").count(), 1);
});
await A.locator("select.it-range").selectOption("2h");
await A.getByRole("button", { name: /Copy Full Report/ }).click();
await check("Copy Full Report: school address + build, the results-link token hidden, the window applied", async () => {
  const txt = await A.evaluate(() => navigator.clipboard.readText());
  assert.match(txt, /\/s\/test/); assert.match(txt, /App build  : local·/); assert.match(txt, /last 2 hours/);
  assert.ok(!txt.includes("SECRET-TOKEN-XYZ"), "the public results token leaked into the report");
  assert.match(txt, /\(set — hidden\)/);
  assert.ok(!txt.includes("OLD_EVENT"), "the 2-hour window was not applied to the report");
});
await check("every new entry carries ctx: build, session, role, online, installed-app flag", async () => {
  const mine = store.it_logs.filter(r => r.payload?.ctx?.role === "admin");
  assert.ok(mine.length > 0, "no admin entries written");
  const c = mine.at(-1).payload.ctx;
  assert.match(c.build, /^local·/); assert.match(c.session, /^[A-Z0-9]{6}$/);
  assert.equal(c.online, true); assert.equal(typeof c.app, "boolean");
});

// ── LOAD_FAILED ──
console.log("\n── Failed loads are logged");
store.failReads = ["deliberation_notes"];
const L = await newPage();
await admin(L);
await L.waitForTimeout(1500);
store.failReads = [];
await check("a failed read is logged as LOAD_FAILED with the table and error code — once per page load", async () => {
  const rows = store.it_logs.filter(r => r.event === "LOAD_FAILED");
  assert.equal(rows.length, 1, `got ${rows.length}`);
  assert.equal(rows[0].payload.table, "deliberation_notes"); assert.equal(rows[0].payload.code, "PGRST000");
  assert.equal(rows[0].level, "ERROR");
});

// ── The 30-second grace, end to end ──
console.log("\n── Live connection drop: logged after the grace period");
await check("the visitor page's connection drop IS logged once it has lasted 30 s (with role + downtime)", async () => {
  const deadline = visitorStart + 75000;
  while (Date.now() < deadline && !visitorRows().some(r => r.event === "REALTIME_DOWN")) await V.waitForTimeout(1000);
  const rows = visitorRows().filter(r => r.event === "REALTIME_DOWN");
  assert.equal(rows.length, 1, `got ${rows.length} REALTIME_DOWN`);
  assert.equal(rows[0].payload.status, "CHANNEL_ERROR");
  assert.ok(rows[0].payload.downForSec >= 30, `downForSec ${rows[0].payload.downForSec}`);
});
await check("one entry per outage per device — a socket that keeps failing and retrying is not logged again", async () => {
  while (Date.now() < adminStart + 60000 && !store.it_logs.some(r => r.event === "REALTIME_DOWN" && r.payload?.ctx?.role === "admin"))
    await A.waitForTimeout(1000);
  const per = {};
  for (const r of store.it_logs.filter(r => r.event === "REALTIME_DOWN")) per[r.payload.ctx.session] = (per[r.payload.ctx.session] || 0) + 1;
  assert.ok(Object.keys(per).length >= 2, "expected the visitor AND an admin page to have logged their outage");
  assert.deepEqual(Object.values(per).filter(n => n !== 1), [], JSON.stringify(per));
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
