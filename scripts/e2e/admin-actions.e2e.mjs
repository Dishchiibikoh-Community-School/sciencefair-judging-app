// Browser E2E — admin actions report what really happened (FIXES_2026-11.md F11).
// removeProject() used to change the screen first, ignore every database error and log
// PROJECT_REMOVED even when nothing was deleted; the lock toggle did the same.
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
store.projects.push({ id: "p_two", school_id: SID, num: "002", title: "Second Study", cat: "Life Science", grade: "7",
  locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: new Date().toISOString() });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const A = await ctx.newPage();
await installMock(A, store, []);
await A.goto(`${BASE}/s/test`);
await A.locator(".role-card.adm").click();
await A.locator("input[type=email]").fill("admin@test.edu");
await A.locator("input[type=password]").fill("correct-horse");
await A.keyboard.press("Enter");
await A.locator(".adm-side").waitFor({ timeout: 10000 });
await A.locator(".nav-it", { hasText: "Projects" }).first().click();
const card = (t) => A.locator(".proj-mgmt-card", { hasText: t }).first();
const remove = async (t) => {
  await card(t).getByRole("button", { name: /Remove/ }).click();
  await A.locator(".modal-box").getByRole("button", { name: "Remove" }).click();
};

console.log("\n── Removing a project while the database fails");
store.failWrites = ["final_decisions"];
await remove("Existing Volcano Study");
await check("the admin is told the project was NOT removed", async () =>
  A.getByTestId("admin-msg").getByText(/was NOT removed/).waitFor({ timeout: 5000 }));
await check("…the project is still in the database and still on the list", async () => {
  assert.ok(store.projects.some(p => p.id === "p_seed"));
  assert.equal(await card("Existing Volcano Study").count(), 1);
});
await check("…and no PROJECT_REMOVED is logged (PROJECT_REMOVE_FAILED instead)", async () => {
  await A.waitForTimeout(400);
  assert.equal(store.it_logs.filter(r => r.event === "PROJECT_REMOVED").length, 0);
  assert.ok(store.it_logs.some(r => r.event === "PROJECT_REMOVE_FAILED"));
});
store.failWrites = [];
await remove("Existing Volcano Study");
await check("once the database answers, Remove really removes it", async () => {
  await A.waitForTimeout(600);
  assert.ok(!store.projects.some(p => p.id === "p_seed"));
  assert.equal(await card("Existing Volcano Study").count(), 0);
});

console.log("\n── Locking a project while the database fails");
store.failWrites = ["projects"];
await card("Second Study").getByRole("button", { name: /Lock/ }).click();
await check("the admin is told it was NOT locked, and the padlock does not change", async () => {
  await A.getByTestId("admin-msg").getByText(/was NOT locked/).waitFor({ timeout: 5000 });
  assert.equal(store.projects.find(p => p.id === "p_two").locked, false);
  assert.match(await card("Second Study").getByRole("button", { name: /Lock|Unlock/ }).first().innerText(), /🔒 Lock/);
});
store.failWrites = [];

await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
