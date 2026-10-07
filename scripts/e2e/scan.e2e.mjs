// Browser E2E — real app in Edge/Chrome via playwright-core, with Supabase and
// /api/scan-form faked by scripts/e2e/mock.mjs (no production data is touched).
//   1) VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5199
//   2) npm run test:e2e        (needs Microsoft Edge installed; set E2E_CHANNEL=chrome otherwise)
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import assert from "node:assert/strict";
import { freshStore, installMock, installScanMock, DEPTS } from "./mock.mjs";

const BASE = "http://localhost:5199";
const DIR = new URL("./out/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
mkdirSync(DIR, { recursive: true });
const SAMPLE = process.env.SAMPLE_IMG || new URL("../../public/branding/dishchiibikoh-logo.png", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");

// Fixture files
const fx = (name, content) => { const p = DIR + name; writeFileSync(p, content); return p; };
const pdf = (s) => `%PDF-1.4\n% SCENARIO:${s}\n%%EOF\n`;
const files = {
  good: fx("form-good.pdf", pdf("good")),
  messy: fx("form-messy.pdf", pdf("messy")),
  multi: fx("form-multi.pdf", pdf("multi")),
  dup: fx("form-dup.pdf", pdf("dup")),
  notform: fx("form-notform.pdf", pdf("notform")),
  html: fx("form-html.pdf", pdf("html")),
  ratelimit: fx("form-ratelimit.pdf", pdf("ratelimit")),
  big: fx("form-big.pdf", "%PDF-1.4\n" + "x".repeat(3.5 * 1024 * 1024)),
  txt: fx("notes.txt", "hello"),
};
const photo = DIR + "photo-form.png";
copyFileSync(SAMPLE, photo);

let pass = 0, failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", e => consoleErrors.push("PAGEERROR " + e.message));
const store = freshStore(); const log = []; const scanCalls = [];
await installMock(page, store, log);
await installScanMock(page, scanCalls);

console.log("\n── Admin login");
await page.goto(`${BASE}/s/test`);
await page.locator(".role-card.adm").click();
await page.locator('input[type=email]').fill("admin@test.edu");
await page.locator('input[type=password]').fill("wrong");
await page.keyboard.press("Enter");
await check("wrong password shows an error", () => page.getByText(/invalid|incorrect|failed/i).first().waitFor({ timeout: 4000 }));
await page.locator('input[type=password]').fill("correct-horse");
await page.keyboard.press("Enter");
await check("admin dashboard loads", () => page.locator(".adm-side").waitFor({ timeout: 6000 }));
await page.locator(".nav-it", { hasText: "Projects" }).click();
await check("project_private fetched with admin token after sign-in", async () => {
  // The admin-only refetch runs after sign-in; on a cold dev server it can land after the click.
  for (let i = 0; i < 20 && !log.some(l => l.includes("/rest/v1/project_private") && l.includes("[admin]")); i++) await page.waitForTimeout(200);
  assert.ok(log.some(l => l.includes("/rest/v1/project_private") && l.includes("[admin]")));
});
await check("seed project shows legacy-shape members + adviser + room", async () => {
  await page.getByText("Ana Ruiz, Ben Ortiz").waitFor({ timeout: 3000 });
  await page.getByText("Ms. Lee").first().waitFor();
  await page.getByText("B12").first().waitFor();
});
await page.screenshot({ path: DIR + "01-projects.png", fullPage: true });

console.log("\n── Scanner: open + upload 10 files");
await page.getByRole("button", { name: /Scan forms/ }).click();
await check("scanner panel opens with privacy note", () => page.getByText(/not stored/).waitFor({ timeout: 3000 }));
await page.locator('.scan-panel input[type=file][multiple]').setInputFiles(
  [files.good, files.messy, files.multi, files.dup, files.notform, files.html, files.ratelimit, files.big, files.txt, photo]);
await page.waitForFunction(() => !document.body.innerText.includes("Reading form…"), null, { timeout: 20000 });
await page.screenshot({ path: DIR + "02-scanned.png", fullPage: true });

await check("8 files reached the API (big PDF + .txt rejected in the browser)", async () => {
  const names = scanCalls.map(c => c.scenario).sort();
  assert.deepEqual(names.filter(n => n !== "ratelimit").length, 7, JSON.stringify(names));
  assert.ok(!scanCalls.some(c => c.bytes > 4.4e6), "oversized body sent");
});
await check("every API call carried the admin token + school id", async () =>
  assert.ok(scanCalls.every(c => c.authed && c.schoolId === "11111111-1111-1111-1111-111111111111")));
await check("photo was re-encoded to JPEG before upload", async () =>
  assert.ok(scanCalls.some(c => c.scenario === "image" && c.mimeType === "image/jpeg")));
const cardByFile = (f) => page.locator(".scan-card", { has: page.locator(".scan-file", { hasText: f }) });
await check("multi-form PDF became 2 cards with their own titles", async () => {
  const c = cardByFile("form-multi.pdf");
  assert.equal(await c.count(), 2);
  const titles = [await c.nth(0).locator("input[type=text]").first().inputValue(), await c.nth(1).locator("input[type=text]").first().inputValue()].sort();
  assert.deepEqual(titles, ["Bridge Load Testing", "Solar Oven Efficiency"]);
});
await check("big PDF shows a clear size error", () => cardByFile("form-big.pdf").getByText(/larger than 3 MB/).waitFor());
await check("txt file shows a clear type error", () => cardByFile("notes.txt").getByText(/can't be read/).waitFor());
await check("rate-limited file shows server message + Retry", async () => {
  await cardByFile("form-ratelimit.pdf").getByText(/rate limit/i).waitFor();
  await cardByFile("form-ratelimit.pdf").getByRole("button", { name: /Retry/ }).waitFor();
});

console.log("\n── Scanner: card states");
const messy = cardByFile("form-messy.pdf");
await check("messy card: unsure fields highlighted amber", async () =>
  assert.ok(await messy.locator(".scan-unsure").count() >= 4, "expected ≥4 amber fields"));
await check("messy card: AI note shown", () => messy.getByText(/Two category boxes/).waitFor());
await check("messy card: 'Not sure yet' blocks save with explanation", async () => {
  await messy.getByText(/ticked “Not sure yet”/).waitFor();
  await messy.getByText(/form says “Jr High”/).waitFor();
  assert.equal(await messy.getByRole("button", { name: /Save/ }).isDisabled(), true);
});
await check("messy card: work-mode mismatch hint (groups of three vs 2 names)", () => messy.getByText(/In groups of three/).waitFor());
await check("dup card warns + button says 'Save anyway'", async () => {
  const dup = cardByFile("form-dup.pdf");
  await dup.getByText(/Possible duplicate of project #001/).waitFor();
  await dup.getByRole("button", { name: "Save anyway" }).waitFor();
});
await check("not-a-form card warns", () => cardByFile("form-notform.pdf").getByText(/doesn't look like a participation form/).waitFor());
await check("HTML in scanned text is shown as text, never executed", async () => {
  await page.getByText("<b>Bold</b> Kid", { exact: false }).count();
  assert.equal(await page.evaluate(() => window.__xss), undefined);
});
await check("summary counts are consistent", async () => {
  const t = await page.locator(".scan-summary").innerText();
  assert.match(t, /0 reading/); assert.match(t, /saved/);
});

console.log("\n── Scanner: fix + save");
// Fix messy: edit title (amber should clear), pick dept + category, fill missing grade.
const title = messy.locator("input[type=text]").first();
await title.fill("Plant growth in salt water");
await check("editing a field clears its amber highlight", async () =>
  assert.equal(await title.evaluate(el => el.classList.contains("scan-unsure")), false));
await messy.locator("select").nth(0).selectOption({ label: "Middle School" });
await messy.locator("select").nth(1).selectOption({ label: "Life Science" });
await check("messy card becomes saveable after fixes", async () =>
  assert.equal(await messy.getByRole("button", { name: /Save project/ }).isDisabled(), false));

// Retry the rate-limited one → becomes a good card.
await cardByFile("form-ratelimit.pdf").getByRole("button", { name: /Retry/ }).click();
await check("retry succeeds and the card becomes editable", () =>
  cardByFile("form-ratelimit.pdf").getByRole("button", { name: /Save/ }).waitFor({ timeout: 5000 }));
await check("retried card duplicates the 'good' card → both flagged", () =>
  cardByFile("form-ratelimit.pdf").getByText(/Looks the same as another card/).waitFor());

const before = store.projects.length;
const saveAllBtn = page.getByRole("button", { name: /Save all ready/ });
const label = await saveAllBtn.innerText();
await saveAllBtn.click();
await page.waitForFunction(() => !document.body.innerText.includes("Saving…"), null, { timeout: 15000 });
await page.screenshot({ path: DIR + "03-after-save-all.png", fullPage: true });
const added = store.projects.slice(before);
await check(`'${label}' saved only clean cards (no dup/not-form/error)`, async () => {
  const titles = added.map(p => p.title).sort();
  assert.ok(!titles.includes("Existing Volcano Study"), "duplicate was auto-saved");
  assert.ok(!titles.includes(""), "not-a-form was saved");
  assert.ok(titles.includes("Plant growth in salt water") && titles.includes("Solar Oven Efficiency") && titles.includes("Bridge Load Testing"), titles.join(" | "));
  assert.ok(!titles.includes("Modeling Adaptive Surfaces"), "twin-flagged cards must not auto-save");
});
await check("project numbers are unique and sequential", async () => {
  const nums = store.projects.map(p => p.num);
  assert.equal(new Set(nums).size, nums.length, nums.join(","));
});
await check("names went to project_private as {name, grade}, NOT onto projects", async () => {
  for (const p of added) {
    assert.equal(p.group_members, undefined, "names leaked onto projects row");
    assert.equal(p.advisor_name, undefined, "adviser leaked onto projects row");
    const pv = store.project_private.find(x => x.project_id === p.id);
    assert.ok(pv && Array.isArray(pv.group_members) && pv.group_members[0].name, p.title);
  }
});
await check("grade defaults to highest student grade (pairs 11 & 12 → 12)", async () =>
  assert.equal(added.find(p => p.title === "Bridge Load Testing").grade, "12"));
await check("departments + category saved correctly", async () => {
  const b = added.find(p => p.title === "Bridge Load Testing");
  assert.equal(b.department_id, DEPTS.D_HIGH);
  assert.equal(added.find(p => p.title === "Plant growth in salt water").cat, "Life Science");
});
await check("activity_log + it_logs rows are really POSTed to the database", async () => {
  assert.ok(log.some(l => l.startsWith("POST /rest/v1/activity_log")), "no activity_log POST");
  assert.ok(log.some(l => l.startsWith("POST /rest/v1/it_logs")), "no it_logs POST");
});
await check("activity log records [scanned form] source", async () =>
  assert.ok(store.activity_log.some(r => /scanned form/.test(r.message || ""))));
await check("IT logs never contain student names", async () => {
  const blob = JSON.stringify(store.it_logs.filter(r => /FORM_SCAN/.test(r.event)));
  assert.ok(blob.length > 2, "no FORM_SCAN logs at all");
  for (const n of ["Amos", "Kai", "Rosa", "Eli", "Lena"]) assert.ok(!blob.includes(n), "name in IT log: " + n);
});

// Save a dup explicitly, remove the not-form card, then Done → discard prompt.
await cardByFile("form-dup.pdf").getByRole("button", { name: "Save anyway" }).click();
await check("'Save anyway' saves a flagged card on purpose", () =>
  cardByFile("form-dup.pdf").getByText(/Saved as project/).waitFor({ timeout: 5000 }));
await cardByFile("form-notform.pdf").getByRole("button", { name: "Remove" }).click();
await page.getByRole("button", { name: "Done" }).click();
await check("Done with unsaved cards asks before discarding (no window.confirm)", () =>
  page.getByText(/not saved and will be discarded/).waitFor());
await page.getByRole("button", { name: "Keep reviewing" }).click();
await check("'Keep reviewing' keeps the cards", async () => assert.ok(await page.locator(".scan-card").count() > 0));
await page.getByRole("button", { name: "Done" }).click();
await page.getByRole("button", { name: /Discard/ }).click();
await check("discard closes the scanner", async () => assert.equal(await page.locator(".scan-panel").count(), 0));

console.log("\n── Projects list + edit form after scanning");
await check("scanned project shows members with grades + room", async () => {
  await page.getByText("Eli Watchman (Gr 11), Mia Nez (Gr 12)").waitFor({ timeout: 3000 });
});
const card = page.locator(".proj-mgmt-card", { hasText: "Bridge Load Testing" });
await card.getByRole("button", { name: /Edit/ }).click();
await check("edit form pre-fills one row per student with grade", async () => {
  const rows = page.locator(".proj-form .member-row");
  assert.equal(await rows.count(), 2);
  assert.equal(await rows.nth(1).locator("input").first().inputValue(), "Mia Nez");
  assert.equal(await rows.nth(1).locator("input").nth(1).inputValue(), "12");
});
await page.locator(".proj-form").getByRole("button", { name: "+ Add student" }).click();
const third = page.locator(".proj-form .member-row").nth(2);
await third.locator("input").first().fill("Sam Begay");
await third.locator("input").nth(1).fill("10th");
await page.locator(".proj-form").getByRole("button", { name: "Save Changes" }).click();
await page.waitForTimeout(500);
await check("edit saves members (incl. '10th' → '10') to project_private, not projects", async () => {
  const p = store.projects.find(x => x.title === "Bridge Load Testing");
  const pv = store.project_private.find(x => x.project_id === p.id);
  assert.deepEqual(pv.group_members.map(m => m.grade), ["11", "12", "10"]);
  assert.equal(p.group_members, undefined);
});
await page.screenshot({ path: DIR + "04-after-edit.png", fullPage: true });

console.log("\n── Mobile layout (390px)");
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: /Scan forms/ }).click();
await page.locator('.scan-panel input[type=file][multiple]').setInputFiles([files.messy]);
await page.waitForFunction(() => !document.body.innerText.includes("Reading form…"), null, { timeout: 10000 });
await page.screenshot({ path: DIR + "05-mobile-scanner.png", fullPage: true });
await check("no horizontal page scroll on phone width", async () => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 1, `page is ${over}px wider than the screen`);
});

console.log("\n── Sign out drops names from memory");
await page.setViewportSize({ width: 1280, height: 900 });
log.length = 0;
await page.locator(".nav-it", { hasText: "Sign Out" }).click();
await check("Sign Out returns to the school landing page (was hanging)", () => page.locator(".role-card.adm").waitFor({ timeout: 5000 }));
await page.waitForTimeout(800);
await check("ADMIN_LOGOUT IT log reached the database after sign-out", async () =>
  assert.ok(store.it_logs.some(r => r.event === "ADMIN_LOGOUT")));
await check("after sign-out, project_private is requested without admin rights (→ denied → no names)", async () =>
  assert.ok(log.some(l => l.includes("project_private") && l.includes("[anon]")), log.join("\n")));

const realErrors = consoleErrors.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|Failed to load resource|mock\.supabase\.co/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(realErrors, []));
if (realErrors.length) console.log(realErrors.slice(0, 10).join("\n"));

await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
