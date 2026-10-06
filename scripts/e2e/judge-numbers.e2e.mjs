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
const counts = A.page.locator(".jn-row input[type=number]");
await check("Setup shows the Judge numbers card with one row per department", async () => {
  await A.page.getByText("Judge numbers", { exact: true }).waitFor({ timeout: 4000 });
  assert.equal(await counts.count(), 3);
});
// Elementary 1 → 1, Middle 1 → 2 : Judge4 would fall outside Middle School.
await counts.nth(0).fill("1"); await counts.nth(1).fill("1");
await check("the preview renumbers live (Middle School → Judge 2)", async () =>
  assert.equal((await A.page.locator(".jn-row").nth(1).locator(".jn-range").innerText()).trim(), "Judge 2"));
await A.page.getByRole("button", { name: "Save judge numbers" }).click();
await check("saving a list that strands Judge4 is refused with a clear message", async () => {
  await A.page.getByText(/Judge numbers NOT saved: Judge4 is signed in to Middle School/).waitFor({ timeout: 4000 });
  assert.equal(store.departments.find(d => d.id === DEPTS.D_MID).judge_to, 5);
});
await counts.nth(1).fill("3"); await counts.nth(2).fill("0");
await A.page.getByRole("button", { name: "Save judge numbers" }).click();
await check("valid list saved: Elementary 1, Middle School 2–4, High School none", async () => {
  await A.page.waitForTimeout(600);
  const d = (id) => store.departments.find(x => x.id === id);
  assert.deepEqual([d(DEPTS.D_ELEM).judge_from, d(DEPTS.D_ELEM).judge_to], [1, 1]);
  assert.deepEqual([d(DEPTS.D_MID).judge_from, d(DEPTS.D_MID).judge_to], [2, 4]);
  assert.equal(d(DEPTS.D_HIGH).judge_from, null);
  assert.ok(store.it_logs.some(r => r.event === "JUDGE_NUMBERS_SAVED"));
});
await check("department rows show their numbers instead of a Max judges box", async () => {
  const t = await A.page.locator(".setup-rows").first().innerText();
  assert.ok(!t.includes("Max judges"), "Max judges box still shown");
  assert.ok(t.includes("Judge 2–4") && t.includes("no judges"), t.slice(0, 200));
});
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
  assert.ok(store.it_logs.some(r => r.event === "JUDGE_REMOVED" && r.payload.scoresRemoved === 1));
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
