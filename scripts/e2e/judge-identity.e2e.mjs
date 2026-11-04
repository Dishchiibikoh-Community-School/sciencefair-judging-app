// Browser E2E — per-judge secret and checked judge writes (FIXES_2026-11.md F1, migration 2026-11a).
// The SQL side (wrong secret, wrong values, unassigned project, finalize, transfer…) is covered by
// scripts/db-migrations.test.mjs. This checks the APP: it signs in through register_judge_secure,
// keeps the secret on the device, writes scores only through submit_score, a transferred-away
// tablet can no longer write, and a database WITHOUT the migration still works (fallback).
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
store.projects.push({ id: "p_b", school_id: SID, num: "002", title: "Bean Sprouts", cat: "Life Science", grade: "7",
  locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now });
const calls = { secureScore: 0, directScore: 0 };
async function device() {
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
  const page = await ctx.newPage();
  await installMock(page, store, []);
  page.on("request", r => {
    if (r.method() === "POST" && r.url().includes("/rpc/submit_score")) calls.secureScore++;
    if (r.method() === "POST" && /\/rest\/v1\/scores(\?|$)/.test(r.url())) calls.directScore++;
  });
  return page;
}
async function signIn(page, alias) {
  await page.goto(`${BASE}/s/test`);
  await page.locator(".role-card").first().click();
  await page.getByRole("button", { name: /Middle School/ }).click();
  await page.locator('input[placeholder="e.g. Judge1"]').fill(alias);
  await page.locator('input[placeholder="Event invite code"]').fill("abc123");
  await page.getByRole("button", { name: /Enter as Judge/ }).click();
  await page.locator(".proj-item").first().waitFor({ timeout: 8000 });
  await page.waitForTimeout(800);
}
async function score(page, title) {
  await page.locator(".proj-item", { hasText: title }).click();
  const g = page.locator(".rub-steps");
  await g.first().waitFor({ timeout: 6000 });
  for (let i = 0; i < await g.count(); i++) await g.nth(i).locator("button").last().click();
  await page.getByRole("button", { name: /Submit Score/ }).click();
  await page.locator(".proj-item").first().waitFor({ timeout: 25000 });
}
const secrets = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("sf_judge_secrets") || "{}"));

console.log("\n── Signing in hands the device its judge secret");
const A = await device();
await signIn(A, "Judge1");
const j1 = store.judges.find(j => j.alias === "Judge1");
await check("the tablet keeps a 48-hex secret for its judge (and nowhere in sf_judge_data)", async () => {
  assert.match((await secrets(A))[j1.id] || "", /^[0-9a-f]{48}$/);
  assert.ok(!(await A.evaluate(() => localStorage.getItem("sf_judge_data"))).includes("judge_secret"));
});
await score(A, "Existing Volcano Study");
await check("the score is written through submit_score — never straight into the table", async () => {
  assert.ok(store.scores.some(s => s.judge_id === j1.id && s.project_id === "p_seed"));
  assert.ok(calls.secureScore >= 1); assert.equal(calls.directScore, 0);
});

console.log("\n── A device transfer: the old tablet can no longer write");
const until = Date.now() + 600000;
const allowRow = store.app_settings.find(r => r.key === "judge_transfer_allowances");
allowRow.value = JSON.stringify({ [`${DEPTS.D_MID}:Judge1`]: until, Judge1: until });
const B = await device();
await signIn(B, "Judge1");
await check("the new tablet gets a NEW secret", async () =>
  assert.notEqual((await secrets(B))[j1.id], (await secrets(A))[j1.id]));
await score(A, "Bean Sprouts");
await check("the OLD tablet's score is refused by the server (kept on that tablet, not saved)", async () => {
  assert.ok(!store.scores.some(s => s.judge_id === j1.id && s.project_id === "p_b"), "the old device still wrote a score");
  const q = await A.evaluate(() => JSON.parse(localStorage.getItem("sf_offline_queue") || "[]"));
  assert.ok(q.some(i => i.data.project_id === "p_b"));
});
await score(B, "Bean Sprouts");
await check("the new tablet saves normally", async () =>
  assert.ok(store.scores.some(s => s.judge_id === j1.id && s.project_id === "p_b")));

console.log("\n── A database without migration 2026-11a");
store.noSecureRpc = true;
const C = await device();
calls.directScore = 0;
await signIn(C, "Judge2");
const j2 = store.judges.find(j => j.alias === "Judge2");
await check("sign-in falls back to the plain register_judge (no secret)", async () => {
  assert.ok(j2, "Judge2 was not created");
  assert.equal((await secrets(C))[j2.id], undefined);
});
await score(C, "Existing Volcano Study");
await check("…and scores still save, the old way", async () => {
  assert.ok(store.scores.some(s => s.judge_id === j2.id && s.project_id === "p_seed"));
  assert.ok(calls.directScore >= 1);
});

await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
