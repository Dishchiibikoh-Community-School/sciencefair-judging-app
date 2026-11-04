// Browser E2E — judge-screen usability fixes (FIXES_2026-11.md F13), on a phone-sized screen:
//   U5  the "← Back to my projects" button is a real tap target (≥ 44 px tall);
//   U1  opening a project starts at the top of the form (it opened part-way down);
//   U2  a greyed Submit says how many items are left and jumps to the first one;
//   U3  a score still waiting on the tablet says "not sent yet" (it looked exactly like a saved one);
//   U4  the system Back button closes the form instead of leaving the app.
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
for (let i = 2; i <= 9; i++)
  store.projects.push({ id: `p_${i}`, school_id: SID, num: `00${i}`, title: `Project ${i}`, cat: "Life Science", grade: "7",
    locked: false, department_id: DEPTS.D_MID, room: "", description: "A description long enough to take some room on a phone screen.", motivation: "", created_at: now });
const ctx = await browser.newContext({ viewport: { width: 390, height: 700 } });
const page = await ctx.newPage();
await installMock(page, store, []);
await page.goto(`${BASE}/s/test`);
await page.locator(".role-card").first().click();
await page.getByRole("button", { name: /Middle School/ }).click();
await page.locator('input[placeholder="e.g. Judge1"]').fill("Judge1");
await page.locator('input[placeholder="Event invite code"]').fill("abc123");
await page.getByRole("button", { name: /Enter as Judge/ }).click();
await page.locator(".proj-item").first().waitFor({ timeout: 8000 });
await page.waitForTimeout(1200);

console.log("\n── Opening a project from far down the list");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(200);
await page.locator(".proj-item", { hasText: "Project 9" }).click();
await page.locator(".rub-steps").first().waitFor({ timeout: 6000 });
await page.waitForTimeout(300);
await check("U1: the form opens at the top (booth code on screen)", async () =>
  assert.equal(await page.evaluate(() => Math.round(window.scrollY)), 0));
await check("U5: '← Back to my projects' is at least 44 px tall", async () => {
  const b = await page.getByRole("button", { name: /Back to my projects/ }).boundingBox();
  assert.ok(b && b.height >= 44, `height ${b?.height}`);
});

console.log("\n── Two items not rated yet");
const groups = page.locator(".rub-steps");
const n = await groups.count();
for (let i = 0; i < n - 2; i++) await groups.nth(i).locator("button").last().click();
await check("U2: the screen says 2 items are still to rate", async () =>
  assert.match(await page.getByTestId("items-left").innerText(), /2 items still to rate/));
await page.evaluate(() => window.scrollTo(0, 0));
await page.getByTestId("items-left").click();
await page.waitForTimeout(700);
await check("…and the button brings the first unrated item into view", async () => {
  const box = await groups.nth(n - 2).boundingBox();
  assert.ok(box && box.y >= 0 && box.y + box.height <= 700, `item at y=${box?.y}`);
});

console.log("\n── A score that could not be sent yet");
for (let i = n - 2; i < n; i++) await groups.nth(i).locator("button").last().click();
store.failWrites = ["scores"];
await page.getByRole("button", { name: /Submit Score/ }).click();
await page.locator(".proj-item").first().waitFor({ timeout: 25000 });
await check("U3: the tile says 'not sent yet' (not the same tick as a saved score)", async () =>
  assert.match(await page.locator(".proj-item", { hasText: "Project 9" }).getByTestId("st-queued").innerText(), /not sent yet/));
store.failWrites = [];

console.log("\n── The system Back button");
await page.locator(".proj-item", { hasText: "Project 8" }).click();
await page.locator(".rub-steps").first().waitFor({ timeout: 6000 });
await page.goBack();
await check("U4: Back closes the form and shows the list — the app is not left", async () => {
  await page.locator(".proj-item").first().waitFor({ timeout: 5000 });
  assert.match(page.url(), /\/s\/test/);
});

await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
