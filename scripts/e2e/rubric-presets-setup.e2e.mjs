// Browser E2E — rubric presets straight from the Setup department dropdown (UX fix).
// A fresh school has only its default rubric in the library; the presets used to be
// reachable only via Rubric tab → New rubric, so the dropdown looked like they were missing.
// Now: "Add from a preset" lists every preset not yet in the library; picking one adds it to
// the library AND assigns it; it is never added twice; a scored department refuses before
// anything is created; the comment-only option is still there.
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
await installMock(page, store, []);
await page.goto(`${BASE}/s/test`);
await page.locator(".role-card.adm").click();
await page.locator("input[type=email]").fill("admin@test.edu");
await page.locator("input[type=password]").fill("correct-horse");
await page.keyboard.press("Enter");
await page.locator(".adm-side").waitFor({ timeout: 6000 });
for (let i = 0; i < 30 && !store.rubrics.length; i++) await page.waitForTimeout(100);   // default seeded after sign-in
await page.locator(".nav-it", { hasText: "Setup" }).click();
const sel = (name) => page.getByLabel(`How ${name} is judged`);
const opts = async (name) => (await sel(name).locator("option").allInnerTexts()).map(t => t.trim());
const presetValue = async (name, label) => sel(name).locator("option", { hasText: label }).getAttribute("value");

await check("a fresh school's dropdown offers both 100-point presets under 'Add from a preset'", async () => {
  await page.waitForTimeout(400);
  const o = await opts("High School");
  assert.ok(o.some(t => t.includes("Cibecue / ISEF-style")), o.join(" | "));
  assert.ok(o.some(t => t.includes("Detailed form — 20 items")), o.join(" | "));
  assert.equal(await sel("High School").locator('optgroup[label="Add from a preset"]').count(), 1);
});
await check("the default 42-point rubric is not offered again as a preset (it is already in the library)", async () => {
  const o = await opts("High School");
  assert.ok(!o.some(t => t.includes("＋ Northeast AZ")), o.join(" | "));
  assert.ok(o.some(t => /\(default\)/.test(t)));
});
await check("'Comments only' is still offered", async () => assert.ok((await opts("High School")).includes("Comments only (not scored)")));

await sel("High School").selectOption(await presetValue("High School", "Cibecue / ISEF-style"));
await check("picking a preset adds it to the library AND assigns it to the department", async () => {
  for (let i = 0; i < 30 && !store.departments.find(d => d.id === DEPTS.D_HIGH).rubric_id; i++) await page.waitForTimeout(100);
  const r = store.rubrics.find(x => x.name.startsWith("Cibecue / ISEF-style"));
  assert.ok(r, "rubric not created"); assert.equal(r.criteria.length, 5); assert.equal(r.is_active, false);
  assert.equal(store.departments.find(d => d.id === DEPTS.D_HIGH).rubric_id, r.id);
});
await check("…and from then on it is listed under 'Your rubrics', not as a preset", async () => {
  await page.waitForTimeout(300);
  const o = await opts("Middle School");
  assert.ok(o.some(t => t.startsWith("Cibecue / ISEF-style") && t.includes("100 pts")), o.join(" | "));
  assert.ok(!o.some(t => t.includes("＋ Cibecue")), o.join(" | "));
});
await sel("Middle School").selectOption(await presetValue("Middle School", "Detailed form — 20 items"));
await check("a second department gets the 20-item form the same way", async () => {
  for (let i = 0; i < 30 && !store.departments.find(d => d.id === DEPTS.D_MID).rubric_id; i++) await page.waitForTimeout(100);
  const r = store.rubrics.find(x => x.name.startsWith("Detailed form"));
  assert.equal(r.criteria.length, 20);
  assert.equal(store.departments.find(d => d.id === DEPTS.D_MID).rubric_id, r.id);
  assert.equal(store.rubrics.length, 3, "default + 2 presets, nothing duplicated");
});
await check("once every preset is in the library the 'Add from a preset' group disappears", async () =>
  assert.equal(await sel("Elementary").locator('optgroup[label="Add from a preset"]').count(), 0));

// A department with scores refuses BEFORE anything is created.
store.scores.push({ id: "s1", school_id: SID, judge_id: "j_x", project_id: "p_seed", criteria: { presentation: 4 }, notes: "", submitted_at: new Date().toISOString() });
store.rubrics = store.rubrics.filter(r => !r.name.startsWith("Detailed form"));
store.departments.find(d => d.id === DEPTS.D_MID).rubric_id = null;
await page.reload();
await page.locator(".role-card.adm").click();
await page.locator(".adm-side, input[type=email]").first().waitFor({ timeout: 6000 });
if (await page.locator("input[type=email]").count()) {
  await page.locator("input[type=email]").fill("admin@test.edu");
  await page.locator("input[type=password]").fill("correct-horse");
  await page.keyboard.press("Enter");
}
await page.locator(".adm-side").waitFor({ timeout: 6000 });
await page.locator(".nav-it", { hasText: "Setup" }).click();
await sel("Middle School").selectOption(await presetValue("Middle School", "Detailed form — 20 items"));
await check("a scored department refuses, and no stray rubric is created", async () => {
  await page.getByText(/"Middle School" already has scores/).waitFor({ timeout: 4000 });
  assert.equal(store.rubrics.filter(r => r.name.startsWith("Detailed form")).length, 0);
  assert.equal(store.departments.find(d => d.id === DEPTS.D_MID).rubric_id, null);
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
