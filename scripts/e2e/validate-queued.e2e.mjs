// Browser E2E — a judge may not validate while this device still holds unsent scores (F04).
//
// Why this matters: completion counts queued scores, so a judge whose last score is still on
// the tablet sees 100% and is offered the validation step. Saving a validation makes
// submit_score() refuse every later write by that judge (migration 2026-11a), so the offline
// flush is rejected on every retry and the score can never arrive — only "Revise my
// validation" releases it. Found by an external audit, 2026-11-16.
//
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
// Three grade-6 projects in one department, so the abstract exemption and the zero rule stay
// out of the way — this test is about the queue, not about scoring maths.
store.projects.push(
  { id: "p_two",   school_id: SID, num: "002", title: "Second Project", cat: "Life Science", grade: "6", locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now },
  { id: "p_three", school_id: SID, num: "003", title: "Third Project",  cat: "Life Science", grade: "6", locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now },
);
store.rubrics.push({ id: "rub1", school_id: SID, name: "Default", is_active: true, criteria: [] });

const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
const page = await ctx.newPage();
await installMock(page, store, []);

const maxAll = async () => {
  const g = page.locator(".rub-steps");
  for (let i = 0; i < await g.count(); i++) await g.nth(i).locator("button").last().click();
};
const scoreRow = (pid) => store.scores.filter((s) => s.project_id === pid);
const validationRows = () => (store.validations || []).filter((v) => v.judge_id !== "admin");
const queueLen = () => page.evaluate(() => JSON.parse(localStorage.getItem("sf_offline_queue") || "[]").length);

await page.goto(`${BASE}/s/test`);
await page.locator(".role-card").first().click();
await page.getByRole("button", { name: /Middle School/ }).click();
await page.locator('input[placeholder="e.g. Judge1"]').fill("Judge1");
await page.locator('input[placeholder="Event invite code"]').fill("abc123");
await page.getByRole("button", { name: /Enter as Judge/ }).click();
await page.locator(".proj-item").first().waitFor({ timeout: 8000 });

console.log("\n── Score two projects online");
for (const title of ["Existing Volcano Study", "Second Project"]) {
  await page.locator(".proj-item", { hasText: title }).click();
  await maxAll();
  await page.getByRole("button", { name: /Submit Score/ }).click();
  await page.locator(".proj-item").first().waitFor();
}
await check("two scores reached the server", async () => {
  assert.equal(scoreRow("p_seed").length, 1);
  assert.equal(scoreRow("p_two").length, 1);
});

console.log("\n── Score the last one OFFLINE, so it is only on the device");
await ctx.setOffline(true); store.offline = true;
await page.locator(".proj-item", { hasText: "Third Project" }).click();
await maxAll();
await page.getByRole("button", { name: /Submit Score/ }).click();
await page.locator(".proj-item").first().waitFor();
await check("the third score is queued on the device, not on the server", async () => {
  assert.equal(scoreRow("p_three").length, 0);
  assert.equal(await queueLen(), 1);
});

console.log("\n── The judge now reads 100% and is offered the validation step");
await check("the validation step is offered even though a score is unsent", () =>
  page.getByRole("button", { name: /Approve Results/ }).waitFor({ timeout: 6000 }));

// The fix: both buttons wait for the queue, and the judge is told why BEFORE tapping.
await check("the judge is warned that a score has not been sent", async () => {
  const t = await page.locator('[data-testid="val-unsent"]').innerText();
  assert.match(t, /not sent yet/i);
});
await check("Approve Results is disabled while a score is unsent", async () =>
  assert.equal(await page.locator('[data-testid="val-approve"]').isDisabled(), true));
await check("Flag a Concern is also gated (a concern row blocks scores just the same)", async () => {
  await page.getByRole("button", { name: /Flag a Concern/ }).click();
  assert.equal(await page.getByRole("button", { name: /Submit Concern/ }).isDisabled(), true);
});

// The handler must refuse too, not just the button (rule 18) — a score can queue between the
// render and the tap, so the UI state alone is not the gate.
await check("forcing the click writes NO validation, and the handler says why", async () => {
  await page.locator('[data-testid="val-approve"]').dispatchEvent("click");
  await page.waitForTimeout(800);
  assert.equal(validationRows().length, 0, "a validation row was written while a score was unsent");
});
await check("the unsent score is still queued, not lost", async () => assert.equal(await queueLen(), 1));

console.log("\n── Once it syncs, validation is allowed again");
store.offline = false; await ctx.setOffline(false);
await page.getByRole("button", { name: "Sync Now" }).click({ timeout: 4000 }).catch(() => {});
await page.waitForTimeout(2500);
await check("the queued score reached the server and the queue is empty", async () => {
  assert.equal(scoreRow("p_three").length, 1);
  assert.equal(await queueLen(), 0);
});
await check("the warning is gone and Approve Results is enabled", async () => {
  assert.equal(await page.locator('[data-testid="val-unsent"]').count(), 0);
  assert.equal(await page.locator('[data-testid="val-approve"]').isDisabled(), false);
});
await check("approving now works and is recorded", async () => {
  await page.locator('[data-testid="val-approve"]').click();
  await page.waitForTimeout(1200);
  assert.equal(validationRows().length, 1);
  assert.equal(validationRows()[0].approved, true);
});

await browser.close();
console.log(`\n${failures.length ? `${failures.length} FAILED` : "All checks passed"} — ${pass} passed`);
if (failures.length) { failures.forEach((f) => console.log("  ✗", f)); process.exit(1); }
