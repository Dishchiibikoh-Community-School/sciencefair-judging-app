// Browser E2E — a score must never be lost or stuck while saving (fix log FIXES_2026-11.md, F2/F3).
//   F2: a save that never answers is queued after SAVE_TIMEOUT_MS (the judge is never left on
//       "Saving…"), Submit works again afterwards, and when this device cannot store the queue
//       the judge stays on the form with their answers and a clear "NOT saved" message.
// Run: see scan.e2e.mjs header (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { freshStore, installMock, DEPTS, SID } from "./mock.mjs";

const BASE = "http://localhost:5199";
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });

const store = freshStore();
const now = new Date().toISOString();
store.projects.push(
  { id: "p_a", school_id: SID, num: "002", title: "Alpha Magnets", cat: "Physics, Math & Astronomy", grade: "7", locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now },
  { id: "p_b", school_id: SID, num: "003", title: "Beta Batteries", cat: "Physics, Math & Astronomy", grade: "7", locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now },
);

const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
const page = await ctx.newPage();
await installMock(page, store, []);
const scoreOf = (pid) => store.scores.filter(s => s.project_id === pid);
const maxAll = async () => { const g = page.locator(".rub-steps"); for (let i = 0; i < await g.count(); i++) await g.nth(i).locator("button").last().click(); };
const queue = () => page.evaluate(() => JSON.parse(localStorage.getItem("sf_offline_queue") || "[]"));
const drafts = () => page.evaluate(() => JSON.parse(localStorage.getItem("sf_score_drafts") || "{}"));
const submit = () => page.getByRole("button", { name: /Submit Score|Saving/ });

console.log("\n── Judge signs in");
await page.goto(`${BASE}/s/test`);
await page.locator(".role-card").first().click();
await page.getByRole("button", { name: /Middle School/ }).click();
await page.locator('input[placeholder="e.g. Judge1"]').fill("Judge1");
await page.locator('input[placeholder="Event invite code"]').fill("abc123");
await page.getByRole("button", { name: /Enter as Judge/ }).click();
await page.locator(".proj-item").first().waitFor({ timeout: 6000 });
const judgeId = await page.evaluate(() => localStorage.getItem("sf_judge_id"));

console.log("\n── F2: a save that never answers");
store.hangWrites = ["scores"];
await page.locator(".proj-item", { hasText: "Alpha Magnets" }).click();
await maxAll();
await submit().click();
await check("while the server is silent the button says Saving… (one submit in flight)", async () =>
  assert.match(await submit().innerText(), /Saving/));
await check("after the save deadline the judge is back on the list — never stuck on Saving…", async () =>
  page.locator(".proj-item").first().waitFor({ timeout: 25000 }));
await check("the unanswered score is queued on the device with its values", async () => {
  const q = await queue();
  const item = q.find(i => i.data.project_id === "p_a");
  assert.ok(item, "not in sf_offline_queue");
  assert.equal(item.data.criteria.presentation, 6);
});
await check("its draft is spent (the queue holds it now)", async () =>
  assert.equal((await drafts())[`${judgeId}_p_a`], undefined));
await check("SCORE_QUEUED records the timeout as the reason", async () => {
  const row = store.it_logs.find(r => r.event === "SCORE_QUEUED" && r.payload?.projectId === "p_a");
  assert.ok(row, "no SCORE_QUEUED entry");
  assert.equal(row.payload.error, "TIMEOUT");
});
store.hangWrites = []; store.releaseHangs?.();

await page.locator(".proj-item", { hasText: "Beta Batteries" }).click();
await maxAll();
await submit().click();
await page.locator(".proj-item").first().waitFor({ timeout: 8000 });
await check("Submit works normally afterwards (the save guard was released)", async () =>
  assert.equal(scoreOf("p_b").length, 1));

console.log("\n── F2: this device cannot store the queue");
store.failWrites = ["scores"];
await page.evaluate(() => {
  const orig = Storage.prototype.setItem;
  window.__origSetItem = orig;
  Storage.prototype.setItem = function (k, v) {
    if (k === "sf_offline_queue") throw new DOMException("QuotaExceededError", "QuotaExceededError");
    return orig.call(this, k, v);
  };
});
await page.locator(".proj-item", { hasText: "Existing Volcano Study" }).click();
await maxAll();
await submit().click();
await check("the judge is told the score was NOT saved", async () =>
  page.getByText(/NOT saved/).first().waitFor({ timeout: 6000 }));
await check("…and stays on the scoring form, answers intact", async () => {
  assert.equal(await page.locator(".rub-steps").count() > 0, true);
  assert.equal((await page.locator(".sc-total-num").innerText()).trim(), "42");
});
await check("the draft is NOT deleted when the score could not be stored anywhere", async () =>
  assert.ok((await drafts())[`${judgeId}_p_seed`], "draft was deleted"));
await check("Submit is usable again (not stuck)", async () =>
  assert.equal(await submit().isDisabled(), false));

await page.evaluate(() => { Storage.prototype.setItem = window.__origSetItem; });
store.failWrites = [];
await submit().click();
await page.locator(".proj-item").first().waitFor({ timeout: 8000 });
await check("once storage and server are back, the same Submit saves it", async () =>
  assert.equal(scoreOf("p_seed").length, 1));

await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
