// Browser E2E — one judge list for the whole school (migration 2026-10g), on the real UI
// with the mock backend (mock.mjs mirrors register_judge / set_judge_numbers / remove_judge).
// Judge signs in by number only · department shown from the number · duplicate and
// off-list numbers refused · admin edits the list in Setup (stranding a judge is refused) ·
// admin removes one judge with the PIN · switching back to per-department numbering.
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
const rng = (id, f, t) => Object.assign(store.departments.find(d => d.id === id), { judge_from: f, judge_to: t, max_judges: t - f + 1 });
rng(DEPTS.D_ELEM, 1, 2); rng(DEPTS.D_MID, 3, 5); rng(DEPTS.D_HIGH, 6, 7);

async function newPage(vp = { width: 820, height: 1180 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  return { ctx, page };
}
const numBox  = (p) => p.locator('input[placeholder="e.g. 7"]');
const codeBox = (p) => p.locator('input[placeholder="Event invite code"]');

console.log("\n── Judge signs in by number (tablet)");
const J = await newPage();
await J.page.goto(`${BASE}/s/test`);
await J.page.locator(".role-card").first().click();
await check("no department picker — only a judge number box", async () => {
  await numBox(J.page).waitFor({ timeout: 5000 });
  assert.equal(await J.page.getByRole("button", { name: /Middle School/ }).count(), 0);
});
await numBox(J.page).fill("9");
await check("a number outside the list is flagged before submitting", () =>
  J.page.getByText(/Judge 9 is not on this school's judge list/).waitFor({ timeout: 3000 }));
await numBox(J.page).fill("4");
await check("typing 4 shows 'Judge 4 · Middle School'", async () => {
  const t = await J.page.locator(".judge-num-hit").innerText();
  assert.match(t, /Judge 4/); assert.match(t, /Middle School/);
});
await codeBox(J.page).fill("ABC123");
await J.page.getByRole("button", { name: /Enter as Judge/ }).click();
await check("Judge4 reaches the Middle School project list", () => J.page.getByText("Existing Volcano Study").waitFor({ timeout: 5000 }));
await check("judge home says which judge AND department this device is signed in as", async () =>
  assert.match(await J.page.locator(".alias-tag").innerText(), /Judge4 · Middle School/));
await check("stored as Judge4 in Middle School", async () => {
  const j = store.judges.find(x => x.alias === "Judge4");
  assert.ok(j); assert.equal(j.department_id, DEPTS.D_MID);
});
store.scores.push({ id: "s1", school_id: SID, judge_id: store.judges[0].id, project_id: "p_seed", criteria: { presentation: 4 }, notes: "", created_at: new Date().toISOString() });

const J2 = await newPage({ width: 390, height: 844 });
await J2.page.goto(`${BASE}/s/test`);
await J2.page.locator(".role-card").first().click();
await numBox(J2.page).fill("judge 04");
await codeBox(J2.page).fill("ABC123");
await J2.page.getByRole("button", { name: /Enter as Judge/ }).click();
await check("a second person typing 'judge 04' is refused — Judge4 is already signed in", () =>
  J2.page.getByText(/Judge4 is already signed in/).waitFor({ timeout: 4000 }));
assert.equal(store.judges.length, 1);

console.log("\n── Admin: judge list in Overview + Setup");
const A = await newPage({ width: 1280, height: 900 });
await A.page.goto(`${BASE}/s/test`);
await A.page.locator(".role-card.adm").click();
await A.page.locator("input[type=email]").fill("admin@test.edu");
await A.page.locator("input[type=password]").fill("correct-horse");
await A.page.keyboard.press("Enter");
await A.page.locator(".adm-side").waitFor({ timeout: 6000 });
await check("Overview lists the judge numbers per department", async () => {
  const t = await A.page.locator(".setup-share").innerText();
  for (const s of ["Elementary: 1–2", "Middle School: 3–5", "High School: 6–7"]) assert.ok(t.includes(s), s);
});
await A.page.locator(".nav-it", { hasText: "Setup" }).click();
const cell = (n, dept) => A.page.getByLabel(`Judge ${n} judges ${dept}`);
await check("Setup shows the judge grid, ticked from the current numbers", async () => {
  await cell(1, "Elementary").waitFor({ timeout: 4000 });
  for (const [n, d] of [[1, "Elementary"], [2, "Elementary"], [3, "Middle School"], [5, "Middle School"], [7, "High School"]])
    assert.equal(await cell(n, d).isChecked(), true, `Judge ${n} ${d}`);
  assert.equal(await cell(8, "High School").isChecked(), false);
});
// Unticking signed-in Judge4's department must be refused.
await cell(4, "Middle School").uncheck();
await A.page.getByRole("button", { name: "Save judges" }).click();
await check("unticking a signed-in judge's department is refused with a clear message", async () => {
  await A.page.getByText(/Judges NOT saved: Judge4 is signed in to Middle School and would lose it/).waitFor({ timeout: 4000 });
  assert.equal(store.judge_roster.length, 0, "nothing saved");
});
await A.page.getByRole("button", { name: "Cancel" }).first().click();
// Elementary {1}, Middle School {2,3,4}, High School {} — any pattern, by ticking.
await cell(2, "Elementary").uncheck(); await cell(2, "Middle School").check(); await cell(5, "Middle School").uncheck();
await cell(6, "High School").uncheck(); await cell(7, "High School").uncheck();
await A.page.getByLabel("Name for judge 3").fill("Ms. Rabah");
await A.page.getByRole("button", { name: "Save judges" }).click();
await check("valid grid saved: Elementary 1, Middle School 2–4, High School none (+ a private name)", async () => {
  await A.page.waitForTimeout(700);
  const nums = (id) => store.judge_roster.filter(r => r.department_id === id).map(r => r.judge_number).sort((a, b) => a - b);
  assert.deepEqual(nums(DEPTS.D_ELEM), [1]); assert.deepEqual(nums(DEPTS.D_MID), [2, 3, 4]); assert.deepEqual(nums(DEPTS.D_HIGH), []);
  assert.ok(store.it_logs.some(r => r.event === "JUDGE_ROSTER_SAVED"));
  assert.equal(store.judge_labels.find(r => r.judge_number === 3)?.label, "Ms. Rabah");
});
await check("department rows show their numbers and sharing, not a Max judges box", async () => {
  const t = await A.page.locator(".setup-rows").first().innerText();
  assert.ok(!t.includes("Max judges"), "Max judges box still shown");
  assert.ok(t.includes("Judges 2–4") && t.includes("own judges") && t.includes("no judges"), t.slice(0, 300));
});
await check("no false alarm: High School has no projects, so 'no judges' is not flagged", async () =>
  assert.equal(await A.page.getByText(/Nobody judges High School/).count(), 0));
await check("Setup has no horizontal overflow on a phone", async () => {
  await A.page.setViewportSize({ width: 390, height: 844 });
  await A.page.waitForTimeout(200);
  const over = await A.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 1, `page scrolls sideways by ${over}px`);
  await A.page.setViewportSize({ width: 1280, height: 900 });
});

console.log("\n── Admin: remove one judge");
await A.page.locator(".nav-it", { hasText: "Judges" }).click();
await A.page.getByRole("button", { name: "Remove" }).first().click();
await check("the remove dialog warns that 1 score will be deleted", () =>
  A.page.getByText(/permanently deletes their 1 score/).waitFor({ timeout: 4000 }));
const pinBox = A.page.locator(".modal-box input[type=password]");
await pinBox.fill("0000");
await A.page.getByRole("button", { name: "Remove Judge4" }).click();
await check("wrong PIN: nothing removed", async () => {
  await A.page.getByText(/Incorrect PIN/).waitFor({ timeout: 4000 });
  assert.equal(store.judges.length, 1);
});
await pinBox.fill("4821");
await A.page.getByRole("button", { name: "Remove Judge4" }).click();
await check("right PIN: Judge4 and their score are gone, and it is logged", async () => {
  await A.page.locator(".modal-box").waitFor({ state: "detached", timeout: 4000 });
  assert.equal(store.judges.length, 0); assert.equal(store.scores.length, 0);
  // The IT-log row is written in the background after the dialog closes — wait for it.
  for (let i = 0; i < 20 && !store.it_logs.some(r => r.event === "JUDGE_REMOVED"); i++) await A.page.waitForTimeout(100);
  assert.ok(store.it_logs.some(r => r.event === "JUDGE_REMOVED" && r.payload.scoresRemoved === 1));
});

console.log("\n── Maximum judges (default 15, up to 90)");
await A.page.locator(".nav-it", { hasText: "Setup" }).click();
await check("the maximum shows 15 by default", async () =>
  assert.equal(await A.page.getByLabel("Maximum judges").inputValue(), "15"));
await check("the grid offers exactly judge numbers 1–15 (nothing above the maximum)", async () => {
  assert.equal(await A.page.locator(".roster-tbl tbody tr").count(), 15);
  assert.equal(await A.page.getByLabel("Judge 16 judges Elementary").count(), 0);
});
await A.page.getByLabel("Maximum judges").fill("2");
await A.page.getByRole("button", { name: "Save maximum" }).click();
await check("the maximum cannot go below a number in use", () =>
  A.page.getByText(/Judge numbers already go up to 4/).waitFor({ timeout: 3000 }));
await A.page.getByLabel("Maximum judges").fill("91");
await A.page.getByRole("button", { name: "Save maximum" }).click();
await check("the maximum cannot go above 90", () => A.page.getByText(/from 1 to 90/).waitFor({ timeout: 3000 }));
await A.page.getByLabel("Maximum judges").fill("40");
await A.page.getByRole("button", { name: "Save maximum" }).click();
await check("raising the maximum to 40 is saved and the grid grows to 40 numbers", async () => {
  await A.page.getByText("numbers 1–40").waitFor({ timeout: 3000 });
  assert.equal(store.app_settings.find(r => r.key === "judge_max")?.value, "40");
  assert.equal(await A.page.locator(".roster-tbl tbody tr").count(), 40);
});

console.log("\n── Switching back to per-department numbering");
await A.page.locator(".nav-it", { hasText: "Setup" }).click();
await A.page.locator('select[aria-label="Judge numbering"]').selectOption("department");
await check("setting saved", async () => {
  await A.page.waitForTimeout(400);
  assert.equal(store.app_settings.find(r => r.key === "judge_numbering")?.value, "department");
});
await J2.page.reload();
await J2.page.locator(".role-card").first().click();
await check("judges pick a department again", () => J2.page.getByRole("button", { name: /Middle School/ }).waitFor({ timeout: 5000 }));

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
