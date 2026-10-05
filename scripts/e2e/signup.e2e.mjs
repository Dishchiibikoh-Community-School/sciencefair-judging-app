// Browser E2E — school sign-up (homepage → Register Free → create_school).
// See scan.e2e.mjs for how to run (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { freshStore, installMock } from "./mock.mjs";
const BASE = "http://localhost:5199";
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
const errs = [];

async function openSignup(store) {
  const log = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, log);
  await page.goto(BASE + "/");
  await page.getByRole("button", { name: /Register Free/ }).first().click();
  return { page, log };
}
async function fill(page, { name = "Dishchii'bikoh Community School", slug, email = "kent+test@example.com", pin = "4821", pin2 } = {}) {
  await page.locator('input[placeholder="Dishchiibikoh Community School"]').fill(name);
  if (slug !== undefined) await page.locator('input[placeholder="my-school"]').fill(slug);
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[placeholder="At least 8 characters"]').fill("correct-horse-9");
  await page.locator('input[placeholder="Re-enter password"]').fill("correct-horse-9");
  await page.locator('input[placeholder="4-8 digits"]').fill(pin);
  await page.locator('input[placeholder="Re-enter PIN"]').fill(pin2 ?? pin);
}
const submit = (page) => page.getByRole("button", { name: /Create School Account/ }).click();

console.log("\n── Sign-up with email confirmation ON (no session)");
{
  const store = freshStore(); store.signupMode = "confirm";
  const { page, log } = await openSignup(store);
  await fill(page);
  await check("auto URL from the school name is valid and ≤50 chars", async () => {
    const v = await page.locator('input[placeholder="my-school"]').inputValue();
    assert.match(v, /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/); assert.equal(v, "dishchii-bikoh-community-school");
  });
  await fill(page, { pin: "1111" }); await submit(page);
  await check("trivial PIN rejected in the browser (no account created)", async () => {
    await page.getByText(/less predictable PIN/).waitFor({ timeout: 3000 }); assert.equal(store.signupCalls || 0, 0);
  });
  await fill(page, { pin: "4821" }); await submit(page);
  await check("a normal numeric PIN is ACCEPTED (was rejected by the /^d{4,8}$/ bug)", () =>
    page.getByText("School created").waitFor({ timeout: 5000 }));
  await check("went through create_school with the rubric, not direct inserts", async () => {
    assert.ok(log.some(l => l.startsWith("POST /rest/v1/rpc/create_school")));
    assert.ok(!log.some(l => /^POST \/rest\/v1\/(schools|school_admins|departments|rubrics|app_settings)/.test(l)), log.join("\n"));
    const call = store.createSchoolCalls[0];
    assert.equal(call.p_user_id, store.lastSignupUserId); assert.ok(Array.isArray(call.p_rubric) && call.p_rubric.length === 10);
  });
  await check("confirmation screen shows the email and the school link", async () => {
    await page.getByText("kent+test@example.com").waitFor();
    await page.getByText(/\/s\/dishchii-bikoh-community-school/).first().waitFor();
  });
  await page.screenshot({ path: new URL("./out/signup-confirm-390.png", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"), fullPage: true });
  await page.close();
}

console.log("\n── URL already taken → caught BEFORE an account is created");
{
  const store = freshStore(); store.signupMode = "confirm";
  const { page } = await openSignup(store);
  await fill(page, { slug: "test" }); await submit(page);
  await check("taken URL message shown and NO login was created", async () => {
    await page.getByText(/already taken/).waitFor({ timeout: 4000 }); assert.equal(store.signupCalls || 0, 0);
  });
  await page.close();
}

console.log("\n── create_school fails after sign-up → retry reuses the same account");
{
  const store = freshStore(); store.signupMode = "confirm"; store.failCreateOnce = true;
  const { page } = await openSignup(store);
  await fill(page, { slug: "fresh-school" }); await submit(page);
  await page.getByText(/already taken/).waitFor({ timeout: 4000 });
  await page.locator('input[placeholder="my-school"]').fill("fresh-school-2");
  await submit(page);
  await check("retry succeeds without a second signUp ('User already registered' trap avoided)", async () => {
    await page.getByText("School created").waitFor({ timeout: 5000 });
    assert.equal(store.signupCalls, 1);
    assert.equal(store.createSchoolCalls[1].p_user_id, store.createSchoolCalls[0].p_user_id);
  });
  await page.close();
}

console.log("\n── Sign-up with email confirmation OFF (session returned)");
{
  const store = freshStore(); store.signupMode = "session";
  const { page } = await openSignup(store);
  await fill(page, { slug: "instant-school" }); await submit(page);
  await check("goes straight to the new school's page", () => page.waitForURL(/\/s\/instant-school$/, { timeout: 6000 }));
  await page.close();
}

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|Failed to load resource|mock\.supabase\.co/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
