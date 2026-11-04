// Browser E2E — starting the app when the server cannot be reached (FIXES_2026-11.md F4).
//   - a failed rubric read never hands judges the built-in 42-point form (SF-09);
//   - a signed-in tablet restarted while the server is unreachable still shows its projects and
//     the right scoring form, from this device's last good copy (B2 / SF-08);
//   - a device with no copy says "Can't reach the server" (not "School Not Found") and recovers;
//   - an address that really has no school still says "School Not Found".
// "Unreachable" is simulated with store.failReads (503 on reads), because the dev server has no
// service worker — a real offline reload cannot load the page at all in this setup.
// Run: see scan.e2e.mjs header (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { freshStore, installMock, SID } from "./mock.mjs";

const BASE = "http://localhost:5199";
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });

const store = freshStore();
const now = new Date().toISOString();
// The school's own form: 3 items rated 1–5. The built-in default has 10 criteria — easy to tell apart.
const step5 = [1, 2, 3, 4, 5];
store.rubrics.push({ id: "r_three", school_id: SID, name: "Three items", is_active: true, created_at: now, criteria: [
  { id: "q1", label: "Question", desc: "", max: 5, steps: step5 },
  { id: "q2", label: "Method",   desc: "", max: 5, steps: step5 },
  { id: "q3", label: "Talk",     desc: "", max: 5, steps: step5 },
] });
const UNREACHABLE = ["schools", "projects", "project_private", "departments", "categories", "rubrics", "app_settings",
  "judge_schedule", "judges", "scores", "validations", "deliberation_notes", "final_decisions", "share_links",
  "judge_roster", "project_judges", "school_branding"];

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
  const page = await ctx.newPage();
  await installMock(page, store, []);
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
}
const openProject = (page) => page.locator(".proj-item", { hasText: "Existing Volcano Study" }).click({ timeout: 12000 }).catch(() => {});

console.log("\n── A device that loaded everything once");
const A = await newPage();
await signIn(A, "Judge1");
await openProject(A);
await check("the judge gets the school's own 3-item form", async () => {
  await A.locator(".rub-steps").first().waitFor({ timeout: 5000 });
  assert.equal(await A.locator(".rub-steps").count(), 3);
});
await A.getByRole("button", { name: /Back to my projects/ }).click({ timeout: 4000 }).catch(() => {});

console.log("\n── SF-09: a fresh device whose rubric read fails");
const B = await newPage();
store.failReads = ["rubrics"];
await signIn(B, "Judge2");
await openProject(B);
await check("it is told the scoring form could not be loaded…", async () =>
  B.getByTestId("rubric-unavailable").waitFor({ timeout: 5000 }));
await check("…and is NOT given the built-in 42-point form (no criteria shown)", async () =>
  assert.equal(await B.locator(".rub-steps").count(), 0));
store.failReads = [];
await B.getByRole("button", { name: "Try again" }).click({ timeout: 4000 }).catch(() => {});
await check("Try again loads the school's real form", async () => {
  await B.locator(".rub-steps").first().waitFor({ timeout: 5000 });
  assert.equal(await B.locator(".rub-steps").count(), 3);
});

console.log("\n── B2: the first device restarts while the server cannot be reached");
store.failReads = UNREACHABLE;
await A.reload();
await check("it does NOT say School Not Found", async () => {
  await A.waitForTimeout(1500);
  assert.equal(await A.getByText("School Not Found").count(), 0);
});
await check("the judge still sees their project list (this device's copy)", async () =>
  A.locator(".proj-item", { hasText: "Existing Volcano Study" }).waitFor({ timeout: 12000 }));
await openProject(A);
await check("…and the RIGHT scoring form (3 items, from the copy — not the 42-point default)", async () => {
  await A.locator(".rub-steps").first().waitFor({ timeout: 5000 });
  assert.equal(await A.locator(".rub-steps").count(), 3);
});
store.failReads = [];

console.log("\n── A fresh device while the server cannot be reached");
const D = await newPage();
store.failReads = ["schools"];
await D.goto(`${BASE}/s/test`);
await check("it says it cannot reach the server…", async () =>
  D.getByTestId("school-unreachable").waitFor({ timeout: 8000 }));
await check("…not that the school does not exist", async () =>
  assert.equal(await D.getByText("School Not Found").count(), 0));
store.failReads = [];
await D.getByRole("button", { name: "Try again" }).click({ timeout: 4000 }).catch(() => {});
await check("once the server answers, Try again opens the school", async () =>
  D.locator(".role-card").first().waitFor({ timeout: 8000 }));

console.log("\n── Regression: an address with no school");
await D.goto(`${BASE}/s/no-such-school`);
await check("a slug that really does not exist still says School Not Found", async () =>
  D.getByText("School Not Found").waitFor({ timeout: 8000 }));

await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
