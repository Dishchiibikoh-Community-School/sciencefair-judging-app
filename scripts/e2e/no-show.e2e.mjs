// Browser E2E — no-show projects (2026-11-22, rule 87).
// The admin marks a project whose team did not come (or left). Every visit nobody has scored yet is
// skipped on the judges' tablets ("No-show — skip", not openable, NEXT moves on, it leaves that judge's
// total so they can reach 100 % and validate). Scores are never touched: a judge who already scored it
// keeps the score, the project ranks on what it got, a late score counts and never pulls another judge
// back below 100 %. A project nobody scored cannot place; the Awards tab does not hold its group back.
// Undo brings it back; a failed save changes nothing; Finalize freezes it; Reset clears it.
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

// ── fixture: 4 projects, 3 judges, a 3-round schedule (default 42-point rubric) ──
const store = freshStore();
store.pin = "482193";
const now = new Date().toISOString();
const P = (id, num, title, cat, grade, dept) => ({ id, school_id: SID, num, title, cat, grade, locked: false,
  department_id: dept, room: "", description: "", motivation: "", created_at: now });
store.projects = [
  P("pA", "010", "Bean Plants", "Life Science", "6", DEPTS.D_ELEM),             // Elem-LS-010
  P("pB", "011", "Egg Enamel", "Life Science", "6", DEPTS.D_ELEM),              // Elem-LS-011  ← the no-show
  P("pC", "012", "Earthquake Bridges", "Engineering, Robotics & Technology", "7", DEPTS.D_MID),
  P("pD", "013", "Magnet Cars", "Engineering, Robotics & Technology", "8", DEPTS.D_MID),
];
store.project_private = [];
store.judge_roster = [1, 2, 3].flatMap(n => [DEPTS.D_ELEM, DEPTS.D_MID].map(d => ({ school_id: SID, judge_number: n, department_id: d })));
// round → project per judge. Judge 1 visits the no-show in R2; Judge 3 in R1 (its FIRST visit).
const VISITS = { 1: ["pA", "pB", "pC"], 2: ["pC", "pA", "pD"], 3: ["pB", "pD", "pA"] };
store.judge_schedule = Object.entries(VISITS).flatMap(([n, ps]) => ps.map((pid, i) => ({ school_id: SID, judge_number: +n, round_no: i + 1, project_id: pid })));
store.app_settings.push({ school_id: SID, key: "judging_schedule", value: JSON.stringify([
  { kind: "round", no: 1, label: "R1", start: "8:30", end: "8:37" },
  { kind: "round", no: 2, label: "R2", start: "8:38", end: "8:45" },
  { kind: "break", label: "BREAK", start: "8:46", end: "8:51" },
  { kind: "round", no: 3, label: "R3", start: "8:51", end: "8:58" }]) });
const setting = (k) => store.app_settings.find(r => r.key === k)?.value;
const noShowIds = () => Object.keys(JSON.parse(setting("no_show_projects") || "{}"));

async function newPage(vp = { width: 1280, height: 950 }) {
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  return page;
}
async function adminPage() {
  const A = await newPage();
  await A.goto(`${BASE}/s/test`);
  await A.locator(".role-card.adm").click();
  await A.locator("input[type=email]").fill("admin@test.edu");
  await A.locator("input[type=password]").fill("correct-horse");
  await A.keyboard.press("Enter");
  await A.locator(".adm-side").waitFor({ timeout: 10000 });
  return A;
}
async function reloadAdmin(A) {
  await A.reload();
  for (let i = 0; i < 40 && !(await A.locator(".adm-side").isVisible().catch(() => false)); i++) {
    if (await A.locator(".role-card.adm").isVisible().catch(() => false)) await A.locator(".role-card.adm").click().catch(() => {});
    if (await A.locator("input[type=email]").isVisible().catch(() => false)) {
      await A.locator("input[type=email]").fill("admin@test.edu"); await A.locator("input[type=password]").fill("correct-horse"); await A.keyboard.press("Enter"); }
    await A.waitForTimeout(250);
  }
  await A.locator(".adm-side").waitFor({ timeout: 10000 });
}
const tab = (A, name) => A.locator(".nav-it", { hasText: name }).first().click();
async function judgePage(n) {
  const J = await newPage({ width: 820, height: 1180 });
  await J.goto(`${BASE}/s/test`);
  await J.locator(".role-card").first().click();
  await J.locator('input[placeholder="e.g. 7"]').fill(String(n));
  await J.locator('input[placeholder="Event invite code"]').fill("ABC123");
  await J.getByRole("button", { name: /Enter as Judge/ }).click();
  await J.getByTestId("js-list").waitFor({ timeout: 10000 });
  return J;
}
const rowOf = (J, code) => J.locator('[data-testid="js-list"] .proj-item').filter({ has: J.locator(".proj-num", { hasText: new RegExp(`^${code}$`) }) });
async function score(J, code, stepFromEnd = 1) {
  await rowOf(J, code).first().click();
  await J.locator(".rub-item").first().waitFor({ timeout: 8000 });
  const n = await J.locator(".rub-item").count();
  for (let i = 0; i < n; i++) { const b = J.locator(".rub-item").nth(i).locator(".rub-step-btn"); await b.nth(await b.count() - stepFromEnd).click(); }
  await J.getByRole("button", { name: /Submit Score/ }).click();
  await J.getByTestId("js-list").waitFor({ timeout: 10000 });
}
// IT-log rows are written just AFTER the on-screen message — wait for them, never race them.
async function waitLog(ev) { for (let i = 0; i < 50 && !store.it_logs.some(r => r.event === ev); i++) await new Promise(r => setTimeout(r, 100)); }
const card = (A, title) => A.locator(".proj-mgmt-card", { hasText: title }).first();

console.log("\n── Admin marks Egg Enamel (Elem-LS-011) as a no-show — before anyone scored it");
const A = await adminPage();
await tab(A, "Projects");
await card(A, "Egg Enamel").getByTestId("noshow-mark").click();
await check("saved to app_settings.no_show_projects (one row, that project only)", async () => {
  await A.getByTestId("admin-msg").filter({ hasText: /marked as a no-show/ }).waitFor({ timeout: 5000 });
  assert.deepEqual(noShowIds(), ["pB"]);
});
await check("the card shows the No-show badge and an Undo button", async () => {
  await card(A, "Egg Enamel").getByTestId("noshow-badge").waitFor({ timeout: 4000 });
  await card(A, "Egg Enamel").getByTestId("noshow-undo").waitFor({ timeout: 4000 });
});
await check("activity log + IT log PROJECT_NO_SHOW (ids and code only)", async () => {
  assert.ok(store.activity_log.some(r => /marked project #011 as a no-show/.test(r.message)));
  await waitLog("PROJECT_NO_SHOW");
  const e = store.it_logs.find(r => r.event === "PROJECT_NO_SHOW");
  assert.ok(e, "no IT log entry"); assert.equal(e.payload.projectId, "pB"); assert.equal(e.payload.code, "Elem-LS-011");
});
await check("nothing was written to scores", () => assert.equal(store.scores.length, 0));

console.log("\n── Judge 3: the no-show is the FIRST visit");
const J3 = await judgePage(3);
await check("the visit reads 'No-show — skip' and cannot be opened", async () => {
  await J3.getByTestId("js-noshow").filter({ hasText: "Elem-LS-011" }).waitFor({ timeout: 4000 });
  await J3.getByTestId("js-noshow").filter({ hasText: "Elem-LS-011" }).click();
  await J3.waitForTimeout(400);
  assert.equal(await J3.locator(".rub-item").count(), 0, "the scoring screen opened");
});
await check("NEXT skips it: R2 · JHS-ERT-013", async () => {
  const t = await J3.getByTestId("js-next").innerText();
  assert.match(t, /R2/); assert.match(t, /JHS-ERT-013/);
});
await check("progress counts 2 projects, not 3: '0/2 scored · 1 no-show'", async () =>
  assert.match(await J3.getByTestId("js-progress").innerText(), /0\/2 scored · 1 no-show/));

console.log("\n── Judging; then the Bean Plants team LEAVES after only Judge 1 scored it");
const J1 = await judgePage(1), J2 = await judgePage(2);
await score(J1, "Elem-LS-010", 1); await score(J1, "JHS-ERT-012", 2);
await score(J2, "JHS-ERT-012", 1); await score(J2, "JHS-ERT-013", 1);
await score(J3, "JHS-ERT-013", 2);
const j1aScore = store.scores.find(s => s.project_id === "pA");
await reloadAdmin(A); await tab(A, "Projects");
await card(A, "Bean Plants").getByTestId("noshow-mark").click();
await check("a project that already has a score CAN be marked: the message says its score still counts", async () =>
  A.getByTestId("admin-msg").filter({ hasText: /1 score already given still counts/ }).waitFor({ timeout: 5000 }));
await check("…its card reads 'No-show — partly judged (1 score)'", async () =>
  assert.match(await card(A, "Bean Plants").getByTestId("noshow-badge-scored").innerText(), /partly judged \(1 score\)/));
await check("…and Judge 1's score is untouched (same row, same values)", () =>
  assert.deepEqual(store.scores.find(s => s.project_id === "pA"), j1aScore));

for (const J of [J1, J2, J3]) { await J.reload(); await J.getByTestId("js-list").waitFor({ timeout: 10000 }); }
await check("Judge 1 (who scored it) still sees ✓ and can open it; '2/2 scored · 1 no-show'", async () => {
  assert.match(await rowOf(J1, "Elem-LS-010").innerText(), /✓/);
  assert.match(await J1.getByTestId("js-progress").innerText(), /2\/2 scored · 1 no-show/);
});
await check("Judge 2's unvisited Bean Plants is skipped: '2/2 scored · 1 no-show', all done", async () => {
  await J2.getByTestId("js-noshow").filter({ hasText: "Elem-LS-010" }).waitFor({ timeout: 4000 });
  assert.match(await J2.getByTestId("js-progress").innerText(), /2\/2 scored · 1 no-show/);
  await J2.getByText("All projects scored!").waitFor({ timeout: 4000 });
});
await check("Judge 3 skips both: '1/1 scored · 2 no-show'", async () =>
  assert.match(await J3.getByTestId("js-progress").innerText(), /1\/1 scored · 2 no-show/));
await check("5 score rows: none for Egg Enamel, exactly 1 for Bean Plants", () => {
  assert.equal(store.scores.length, 5); assert.ok(!store.scores.some(s => s.project_id === "pB"));
  assert.equal(store.scores.filter(s => s.project_id === "pA").length, 1);
});
await check("Judge 1's validation list ranks the projects it scored and leaves out the no-show", async () => {
  await J1.getByRole("button", { name: /Approve Results/ }).waitFor({ timeout: 4000 });
  const t = await J1.locator(".delib-section").first().innerText();
  assert.ok(/Bean Plants/.test(t), t.slice(0, 300)); assert.ok(!/Egg Enamel/.test(t), t.slice(0, 300));
});
await J1.getByRole("button", { name: /Approve Results/ }).click();
await J2.getByRole("button", { name: /Approve Results/ }).click();
await check("Judges 1 and 2 approve with a no-show on their list", async () => {
  await J2.waitForTimeout(900);
  const al = id => store.judges.find(j => j.id === id)?.alias;
  assert.deepEqual(store.validations.filter(v => v.approved).map(v => al(v.judge_id)).sort(), ["Judge1", "Judge2"]);
});

// Judge 1: 2 of 3 visits scored, the third is a no-show — nothing left, so no "scored 2 of 3" question.
await J1.getByRole("button", { name: /^Sign Out$/ }).click();
await check("a judge with everything scored and a no-show signs out without the 'scored 2 of 3' question", async () =>
  J1.locator(".role-card").first().waitFor({ timeout: 5000 }));

console.log("\n── Admin: results, Awards, Alerts, Judges");
await reloadAdmin(A);
await tab(A, "Overview");
await check("leaderboard: Egg Enamel unscored with a 'no-show' badge; Bean Plants ranked on Judge 1's score with 🥇", async () => {
  await A.getByTestId("lb-noshow").first().waitFor({ timeout: 4000 });
  assert.equal(await A.locator("tr", { hasText: "Egg Enamel" }).first().getByTestId("lb-place").count(), 0);
  const t = await A.locator("tr", { hasText: "Bean Plants" }).first().innerText();
  assert.match(t, /🥇/); assert.ok(/\d+\.\d/.test(t), t);
});
await tab(A, "Judges");
await check("Judges tab: nobody is 'In Progress' or 'Not Started' — skipped visits are not work", async () => {
  const t = await A.locator(".adm-main").innerText();
  assert.ok(!/In Progress|Not Started/.test(t), t.slice(0, 700));
  assert.ok((t.match(/Complete/g) || []).length >= 3, t.slice(0, 700));
});
await tab(A, "Alerts");
await check("Alerts: Egg Enamel under no-shows; Bean Plants under 'marked after some judges scored'", async () => {
  const a = await A.getByTestId("hb-noshow").innerText(), b = await A.getByTestId("hb-noshow-scored").innerText();
  assert.match(a, /Elem-LS-011/); assert.ok(!/Elem-LS-010/.test(a), a);
  assert.match(b, /Elem-LS-010/);
});
await tab(A, "Awards");
await check("Awards: Elementary shows '1 no-show', and neither 'not scored yet' nor 'waiting for reviews'", async () => {
  const g = A.locator("[data-testid=award-group][data-group='Elementary']");
  await g.getByTestId("st-noshow").waitFor({ timeout: 4000 });
  assert.equal(await g.getByTestId("st-unscored").count(), 0);
  assert.equal(await g.getByTestId("st-missing").count(), 0);
});
let fdWrites = 0; A.on("request", r => { if (r.method() !== "GET" && r.url().includes("/final_decisions")) fdWrites++; });
await A.getByTestId("awards-confirm-all").click(); await A.waitForTimeout(1200);
await check("Confirm all ready groups includes Elementary: Bean Plants 1st, nothing for the no-show", () => {
  assert.equal(fdWrites, 1);
  assert.equal(store.final_decisions.find(d => d.project_id === "pA")?.award, "1st Place");
  assert.ok(!store.final_decisions.some(d => d.project_id === "pB" && /Place/.test(d.award)));
});

console.log("\n── A late score arrives (a tablet that was offline) after judges validated");
// Judge 3's score for Bean Plants syncs late. It counts (a score always counts) — and it must
// NOT drag Judge 2, who skipped that visit and already validated, back below 100 %.
const j3 = store.judges.find(j => j.alias === "Judge3");
store.scores.push({ ...j1aScore, id: "late1", judge_id: j3.id, submitted_at: new Date().toISOString() });
await J2.reload(); await J2.getByTestId("js-list").waitFor({ timeout: 10000 });
await check("Judge 2 stays at '2/2 scored · 1 no-show', still validated, no 'added after you validated' warning", async () => {
  assert.match(await J2.getByTestId("js-progress").innerText(), /2\/2 scored · 1 no-show/);
  await J2.getByText("Results Validated").first().waitFor({ timeout: 4000 });
  assert.equal(await J2.getByTestId("new-after-validation").count(), 0);
});
await reloadAdmin(A); await tab(A, "Overview");
await check("…and Bean Plants now averages both scores (2 reviews)", async () =>
  assert.match(await A.locator("tr", { hasText: "Bean Plants" }).first().innerText(), /\b2\s*$/m));

console.log("\n── Refusals");
await check("a failed save says NOT marked and changes nothing", async () => {
  store.projects.push(P("pE", "014", "Late Team", "Engineering, Robotics & Technology", "8", DEPTS.D_MID));
  await reloadAdmin(A); await tab(A, "Projects");
  store.failWrites = ["app_settings"];
  await card(A, "Late Team").getByTestId("noshow-mark").click();
  await A.getByTestId("admin-msg").filter({ hasText: /NOT marked as a no-show/ }).waitFor({ timeout: 5000 });
  assert.deepEqual(noShowIds().sort(), ["pA", "pB"]);
  assert.equal(await card(A, "Late Team").getByTestId("noshow-badge").count(), 0);
  await waitLog("NO_SHOW_SAVE_FAILED");
  assert.ok(store.it_logs.some(r => r.event === "NO_SHOW_SAVE_FAILED"));
  store.failWrites = [];
});

console.log("\n── Undo: the Egg Enamel team arrived");
await reloadAdmin(A); await tab(A, "Projects");
await card(A, "Egg Enamel").getByTestId("noshow-undo").click();
await check("Undo removes it from the list and logs PROJECT_NO_SHOW_UNDONE", async () => {
  await A.getByTestId("admin-msg").filter({ hasText: /back on the judges' lists/ }).waitFor({ timeout: 5000 });
  assert.deepEqual(noShowIds(), ["pA"]);
  await waitLog("PROJECT_NO_SHOW_UNDONE");
  assert.ok(store.it_logs.some(r => r.event === "PROJECT_NO_SHOW_UNDONE"));
});
await J3.reload(); await J3.getByTestId("js-list").waitFor({ timeout: 10000 });
await check("Judge 3: Egg Enamel is back (NEXT = R1 Elem-LS-011); its own late Bean Plants score counts: '2/3 scored'", async () => {
  assert.equal(await J3.getByTestId("js-noshow").count(), 0);
  assert.match(await J3.getByTestId("js-next").innerText(), /Elem-LS-011/);
  assert.match(await J3.getByTestId("js-progress").innerText(), /2\/3 scored/);
});
await score(J3, "Elem-LS-011", 1);
await check("…and it can be scored normally", () => assert.ok(store.scores.some(s => s.project_id === "pB")));

console.log("\n── Sign out, Finalize, Reset");
store.app_settings.find(r => r.key === "no_show_projects").value = JSON.stringify({ pE: now });
store.app_settings.find(r => r.key === "results_finalized").value = "true";
await reloadAdmin(A); await tab(A, "Projects");
await check("after Finalize both buttons are disabled", async () => {
  assert.ok(await card(A, "Late Team").getByTestId("noshow-undo").isDisabled());
  assert.ok(await card(A, "Egg Enamel").getByTestId("noshow-mark").isDisabled());
});
store.app_settings.find(r => r.key === "results_finalized").value = "false";
await reloadAdmin(A);
await tab(A, "Reset All Data");
await A.locator(".modal-box input[type=password]").fill("482193");
await A.getByRole("button", { name: "Reset everything" }).click();
await A.waitForTimeout(1200);
await check("Reset All Data clears the no-show marks (and keeps the projects)", () => {
  assert.equal(setting("no_show_projects"), "{}"); assert.equal(store.projects.length, 5);
});

await check("no JavaScript errors", () => assert.deepEqual(errs, []));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
