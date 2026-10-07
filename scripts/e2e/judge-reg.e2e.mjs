// Browser E2E — real app in Edge/Chrome via playwright-core, with Supabase and
// /api/scan-form faked by scripts/e2e/mock.mjs (no production data is touched).
//   1) VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5199
//   2) npm run test:e2e        (needs Microsoft Edge installed; set E2E_CHANNEL=chrome otherwise)
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { freshStore, installMock } from "./mock.mjs";
const BASE = "http://localhost:5199";
import { mkdirSync } from "node:fs";
const OUT = process.argv[2] || new URL("./out", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
mkdirSync(OUT, { recursive: true });
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
const errs = [];
const newPage = async (store, log, vp = { width: 1280, height: 900 }) => {
  const page = await browser.newPage({ viewport: vp });
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, log);
  return page;
};

console.log("\n── Judge (tablet 820px)");
{
  const store = freshStore(); const log = [];
  const page = await newPage(store, log, { width: 820, height: 1180 });
  await page.goto(`${BASE}/s/test`);
  await page.locator(".role-card").first().click();
  await page.getByRole("button", { name: /Middle School/ }).click();
  await page.locator('input[placeholder="e.g. Judge1"]').fill("Judge1");
  await page.locator('input[placeholder="Event invite code"]').fill("WRONG");
  await page.getByRole("button", { name: /Enter as Judge/ }).click();
  // 2026-10m: this now arrives as a 200 result with an `error` key, not an HTTP error —
  // the message must still reach the judge unchanged (and it is the SQL's exact wording).
  await check("wrong invite code shows the server message", () => page.getByText("Invalid invite code").waitFor({ timeout: 4000 }));
  await page.locator('input[placeholder="Event invite code"]').fill("ABC123");
  await page.getByRole("button", { name: /Enter as Judge/ }).click();
  await check("judge reaches their project list", () => page.getByText("Existing Volcano Study").waitFor({ timeout: 5000 }));
  await check("judge never requests names with privileges / never sees names", async () => {
    const body = await page.locator("body").innerText();
    for (const n of ["Ana Ruiz", "Ben Ortiz", "Ms. Lee"]) assert.ok(!body.includes(n), "name visible: " + n);
    assert.ok(!log.some(l => l.includes("project_private") && l.includes("[admin]")));
  });
  await page.getByText("Existing Volcano Study").click();
  await check("scoring screen shows room + description", async () => {
    await page.getByText(/Room B12/).waitFor({ timeout: 4000 });
    await page.getByText("How lava cools").waitFor();
  });
  await page.screenshot({ path: `${OUT}/judge-scoring-820.png` });
  await check("scoring screen shows no student names", async () => {
    const body = await page.locator("body").innerText();
    assert.ok(!body.includes("Ana Ruiz") && !body.includes("Ms. Lee"));
  });
  await page.close();
}

console.log("\n── Public student registration (phone 390px)");
{
  const store = freshStore(); const log = [];
  const page = await newPage(store, log, { width: 390, height: 844 });
  await page.goto(`${BASE}/s/test?register=REG-TOKEN`);
  await page.locator('input[placeholder="e.g. Maria Santos"]').waitFor({ timeout: 6000 });
  await check("form lists the six new categories", async () => {
    for (const c of ["Life Science", "Earth & Environmental Science", "Chemistry & Material Science",
      "Physics, Math & Astronomy", "Engineering, Robotics & Technology", "Energy, Sustainability & Design"])
      await page.getByText(c, { exact: true }).first().waitFor({ timeout: 2000 });
  });
  await page.locator('input[placeholder="e.g. Maria Santos"]').fill("Lena Begay");
  await page.locator('input[placeholder="e.g. 7, 10, 12"]').fill("8");
  await page.getByPlaceholder("e.g. Dishchii'bikoh Test", { exact: true }).fill("DCS");
  await page.locator('input[placeholder="yourname@school.org"]').fill("lena@example.com");
  await page.locator('input[placeholder="Re-enter email address"]').fill("lena@example.com");
  await page.locator('input[placeholder="Enter your project title"]').fill("Solar Ovens");
  await page.locator('input[placeholder="e.g. Ms. Reyes"]').fill("Mr. Agan");
  await page.locator("label.reg-radio-item", { hasText: "Junior High School" }).click();
  await page.locator("label.reg-radio-item", { hasText: "Energy, Sustainability & Design" }).click();
  await page.locator("label.reg-radio-item", { hasText: /^Group/ }).click();
  await page.locator("textarea").filter({ hasNot: page.locator("xx") }).first().waitFor();
  const membersBox = page.locator("textarea").first();
  await membersBox.fill("Kai Yazzie\nLena Begay");
  await page.locator('input[type=checkbox]').nth(0).check({ force: true });
  await page.locator('input[type=checkbox]').nth(1).check({ force: true });
  await page.locator('input[placeholder="Full name of parent or guardian"]').fill("Ruth Begay");
  await page.locator('input[placeholder="Type full name as digital signature"]').fill("Ruth Begay");
  await page.getByRole("button", { name: /Submit|Register/ }).last().click();
  await check("registration succeeds and shows the registration number", () =>
    page.getByText("JHS-ESD-001").first().waitFor({ timeout: 6000 }));
  await page.screenshot({ path: `${OUT}/registration-success-390.png`, fullPage: true });
  await check("it went through submit_registration (not direct table inserts)", async () => {
    assert.ok(log.some(l => l.startsWith("POST /rest/v1/rpc/submit_registration")));
    assert.ok(!log.some(l => /^POST \/rest\/v1\/(projects|registration_submissions)/.test(l)));
  });
  await check("RPC received booleans + member list + prefix", async () => {
    const f = store.lastRegForm;
    assert.equal(f.is_original_work, true); assert.equal(f.agrees_to_rules, true);
    assert.deepEqual(f.group_members, ["Kai Yazzie", "Lena Begay"]);
    assert.equal(f.reg_prefix, "JHS-ESD");
  });
  await page.close();

  // Dead link
  const page2 = await newPage(freshStore(), []);
  await page2.goto(`${BASE}/s/test?register=DEAD-TOKEN`);
  await page2.waitForTimeout(2000);
  await check("inactive registration link shows a clear unavailable message", async () =>
    assert.match(await page2.locator("body").innerText(), /not active|unavailable|expired|invalid/i));
  await page2.screenshot({ path: `${OUT}/registration-dead-link.png` });
  await page2.close();
}

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|Failed to load resource|mock\.supabase\.co/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
