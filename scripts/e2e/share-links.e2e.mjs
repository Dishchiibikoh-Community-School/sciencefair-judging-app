// Browser E2E — the public results link lifecycle (FIXES_2026-11.md F10).
//   - Regenerate switches the OLD link off (the screen always said so; it never did);
//   - Revoke switches EVERY link off — an older one no longer comes back as "LIVE";
//   - while results are reopened for a correction, the public page says so instead of showing
//     half-edited awards; once finalized again the same link shows them.
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
store.app_settings.find(r => r.key === "results_finalized").value = "true";
const live = () => store.share_links.filter(l => !l.revoked_at);

const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const A = await ctx.newPage();
await installMock(A, store, []);
await A.goto(`${BASE}/s/test`);
await A.locator(".role-card.adm").click();
await A.locator("input[type=email]").fill("admin@test.edu");
await A.locator("input[type=password]").fill("correct-horse");
await A.keyboard.press("Enter");
await A.locator(".adm-side").waitFor({ timeout: 10000 });
await A.locator(".nav-it", { hasText: "Share" }).first().click();

await A.getByRole("button", { name: /Generate Live Results Link/ }).click();
await A.waitForTimeout(600);
const first = store.share_links[0]?.token;
await check("a results link is created", async () => assert.equal(live().length, 1));
await A.getByRole("button", { name: /Regenerate New Link/ }).click();
await A.waitForTimeout(600);
await check("Regenerate switches the OLD link off (only the new one is live)", async () => {
  assert.equal(store.share_links.length, 2);
  assert.equal(live().length, 1);
  assert.notEqual(live()[0].token, first);
});
const P = await (await browser.newContext()).newPage();
await installMock(P, store, []);
await P.goto(`${BASE}/s/test?token=${first}`);
await check("…so the old link now says Link Unavailable", async () =>
  P.getByText("Link Unavailable").waitFor({ timeout: 8000 }));

await A.getByRole("button", { name: /Revoke Link/ }).click();
await A.waitForTimeout(600);
await check("Revoke switches every link off", async () => assert.equal(live().length, 0));
// An older link that is still valid must not come back as LIVE after a reload.
store.share_links.push({ id: "old_live", school_id: SID, token: "OLDER-LIVE", expiry: "never", show_rubric: false,
  title: "x", created_at: "2026-01-01T00:00:00.000Z", revoked_at: null });
await A.getByRole("button", { name: /Generate Live Results Link/ }).click();
await A.waitForTimeout(600);
await A.getByRole("button", { name: /Revoke Link/ }).click();
await A.waitForTimeout(600);
await A.reload();
await A.locator(".adm-side").waitFor({ timeout: 10000 }).catch(async () => { await A.locator(".role-card.adm").click(); await A.locator(".adm-side").waitFor({ timeout: 8000 }); });
await A.locator(".nav-it", { hasText: "Share" }).first().click();
await check("after Revoke no older link comes back as LIVE", async () => {
  assert.equal(live().length, 0);
  await A.getByText("Results link is disabled").waitFor({ timeout: 5000 });
});

console.log("\n── Reopened for a correction");
await A.getByRole("button", { name: /Generate Live Results Link/ }).click();
await A.waitForTimeout(600);
const tok = live()[0].token;
store.app_settings.find(r => r.key === "results_finalized").value = "false";   // the admin reopened
await P.goto(`${BASE}/s/test?token=${tok}`);
await check("the public page says the results are being updated (no half-edited awards)", async () =>
  P.getByTestId("results-updating").waitFor({ timeout: 8000 }));
store.app_settings.find(r => r.key === "results_finalized").value = "true";
await P.reload();
await check("once finalized again, the SAME link shows the results", async () => {
  await P.waitForTimeout(1500);
  assert.equal(await P.getByTestId("results-updating").count(), 0);
  assert.equal(await P.getByText("Link Unavailable").count(), 0);
});

await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
