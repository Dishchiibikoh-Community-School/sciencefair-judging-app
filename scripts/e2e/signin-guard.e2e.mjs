// Browser E2E — judge sign-in sends one attempt at a time (FIXES_2026-11.md F6, app part).
// Five wrong invite codes lock sign-in for the whole school for 5 minutes. A double-tap on
// "Enter as Judge", or Enter pressed twice, used to send TWO register_judge calls — with a typo,
// two failures. Also: the invite box must not autocorrect the code.
// Run: see scan.e2e.mjs header (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { freshStore, installMock } from "./mock.mjs";

const BASE = "http://localhost:5199";
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });

const store = freshStore();
const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
const page = await ctx.newPage();
await installMock(page, store, []);
let registerCalls = 0;
// Count the calls, and slow them down so a second tap lands while the first is in flight.
await page.route("**/rest/v1/rpc/register_judge", async (route) => {
  registerCalls++;
  await new Promise(r => setTimeout(r, 1200));
  return route.fallback();
});
await page.goto(`${BASE}/s/test`);
await page.locator(".role-card").first().click();
await page.getByRole("button", { name: /Middle School/ }).click();
await page.locator('input[placeholder="e.g. Judge1"]').fill("Judge1");
const code = page.locator('input[placeholder="Event invite code"]');
await code.fill("WRONG1");

await check("the invite box turns off autocorrect and spell-check", async () => {
  assert.equal(await code.getAttribute("autocorrect"), "off");
  assert.equal(await code.getAttribute("spellcheck"), "false");
});
const btn = page.getByRole("button", { name: /Enter as Judge|Checking/ });
await btn.dblclick();
await code.press("Enter");
await page.waitForTimeout(2600);
await check("a double-tap plus Enter sends ONE sign-in attempt, not three", async () =>
  assert.equal(registerCalls, 1, `${registerCalls} register_judge calls`));
await check("the wrong code is still reported", async () =>
  page.getByText(/Invalid invite code|invite code/i).first().waitFor({ timeout: 3000 }));
await code.fill("abc123");
await page.getByRole("button", { name: /Enter as Judge/ }).click();
await check("the button works again afterwards (the guard was released)", async () =>
  page.locator(".proj-item").first().waitFor({ timeout: 8000 }));

await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
