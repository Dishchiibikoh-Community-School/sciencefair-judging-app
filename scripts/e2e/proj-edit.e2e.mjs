// Browser E2E — opening the Add/Edit Project form on a LONG project list.
// The form renders at the top of the Projects tab, so before 2026-10-21 an admin scrolled down
// to project #46 pressed Edit and nothing visibly happened: the form had opened above the list,
// off the top of the viewport. The fixture is deliberately long (40 projects) because the bug
// cannot appear on a short one.
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
const now = new Date().toISOString();
const LAST = 40;
store.projects = Array.from({ length: LAST }, (_, i) => ({
  id: `p_${i + 1}`, school_id: SID, num: String(i + 1).padStart(3, "0"),
  title: `Project number ${i + 1}`, cat: "Life Science", grade: "8", locked: false,
  department_id: DEPTS.D_MID, room: "", description: `What #${i + 1} investigates`,
  motivation: "", created_at: now,
}));
store.project_private = [];
store.judges = [];

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const A = await ctx.newPage();
A.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
A.on("pageerror", e => errs.push("PAGEERROR " + e.message));
await installMock(A, store, []);
await A.goto(`${BASE}/s/test`);
await A.locator(".role-card.adm").click();
await A.locator("input[type=email]").fill("admin@test.edu");
await A.locator("input[type=password]").fill("correct-horse");
await A.keyboard.press("Enter");
await A.locator(".adm-side").waitFor({ timeout: 8000 });
await A.locator(".nav-it", { hasText: "Projects" }).first().click();

const lastCard = A.locator(".proj-mgmt-card", { hasText: `Project number ${LAST}` }).first();
await lastCard.waitFor({ timeout: 8000 });

// How far down the page the admin is when they press Edit — the bug needs a real scroll.
const scrolledAway = async () => A.evaluate(() => {
  const f = document.querySelector(".proj-form");
  if (!f) return null;
  const r = f.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight };
});

console.log("\n── Pressing Edit on a project far down the list");
await lastCard.scrollIntoViewIfNeeded();
await A.waitForTimeout(150);
await lastCard.getByRole("button", { name: /Edit/ }).click();
await A.waitForTimeout(900);   // smooth scroll

await check("the edit form is brought on screen, not left above the viewport", async () => {
  const b = await scrolledAway();
  assert.ok(b, "the form did not open at all");
  assert.ok(b.bottom > 0 && b.top < b.vh,
    `form is off screen: top ${b.top}, bottom ${b.bottom}, viewport height ${b.vh}`);
});
await check("the form names which project it opened, so the admin knows", async () => {
  const t = await A.locator(".proj-form").innerText();
  assert.match(t, new RegExp(`Edit Project #0${LAST} — Project number ${LAST}`), t.slice(0, 160));
});
await check("it opened THAT project's values, not another row's", async () => {
  assert.equal(await A.locator(".proj-form input").first().inputValue(), `Project number ${LAST}`);
  const desc = A.locator(".proj-form textarea").first();
  assert.equal((await desc.inputValue()).trim(), `What #${LAST} investigates`);
});

console.log("\n── The edit still saves");
const desc = A.locator(".proj-form textarea").first();
await desc.fill("Corrected description for the entry sheet");
await A.getByRole("button", { name: "Save Changes" }).click();
await check("the new description is written to that project only", async () => {
  await A.waitForTimeout(900);
  assert.equal(store.projects.find(p => p.num === String(LAST).padStart(3, "0")).description,
    "Corrected description for the entry sheet");
  assert.equal(store.projects.find(p => p.num === "001").description, "What #1 investigates");
});

console.log("\n── Add Project opens the same form");
await A.getByRole("button", { name: /Add Project/ }).first().click();
await A.waitForTimeout(700);
await check("Add Project is on screen too and is not labelled as an edit", async () => {
  const b = await scrolledAway();
  assert.ok(b && b.bottom > 0 && b.top < b.vh, `form off screen: ${JSON.stringify(b)}`);
  const t = await A.locator(".proj-form").innerText();
  assert.match(t, /Add New Project/);
  assert.ok(!/Edit Project/.test(t), t.slice(0, 120));
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|Failed to load resource|mock\.supabase\.co|Failed to fetch|_vercel\/insights/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
