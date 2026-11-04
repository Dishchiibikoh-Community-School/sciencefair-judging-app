// Browser E2E — a screen catches up after its live connection drops (FIXES_2026-11.md F5).
// Supabase Realtime does not replay changes missed while a channel was down, so a tablet that
// slept or lost Wi-Fi kept showing stale data ("live" again, but wrong) until a manual refresh.
// The mock has no realtime server, so this test fakes one with page.routeWebSocket: it accepts
// channel joins (echoing the client's postgres_changes bindings back, as supabase-js requires),
// can drop every socket on demand, and counts joins so the test knows when the client is back.
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
const sockets = [];
let schoolJoins = 0;
const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
const page = await ctx.newPage();
await installMock(page, store, []);
await page.routeWebSocket(/realtime/, ws => {
  sockets.push(ws);
  ws.onMessage(raw => {
    let m; try { m = JSON.parse(String(raw)); } catch { return; }
    // vsn 2.0.0 frames are arrays [join_ref, ref, topic, event, payload]; 1.0.0 are objects.
    const arr = Array.isArray(m);
    const [joinRef, ref, topic, event, payload] = arr ? m : [m.join_ref, m.ref, m.topic, m.event, m.payload];
    const reply = (response) => ws.send(JSON.stringify(arr
      ? [joinRef ?? null, ref, topic, "phx_reply", { status: "ok", response }]
      : { join_ref: joinRef, ref, topic, event: "phx_reply", payload: { status: "ok", response } }));
    if (event === "phx_join") {
      if (String(topic).includes("school-")) schoolJoins++;
      const pc = (payload?.config?.postgres_changes || []).map((c, i) => ({ ...c, id: 1000 + i }));
      reply({ postgres_changes: pc });
    } else if (event === "heartbeat" || event === "access_token" || event === "phx_leave") reply({});
  });
});
const waitFor = async (cond, ms, what) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (cond()) return; await page.waitForTimeout(200); }
  throw new Error("timed out waiting for " + what);
};

console.log("\n── A judge's tablet with a live connection");
await page.goto(`${BASE}/s/test`);
await page.locator(".role-card").first().click();
await page.getByRole("button", { name: /Middle School/ }).click();
await page.locator('input[placeholder="e.g. Judge1"]').fill("Judge1");
await page.locator('input[placeholder="Event invite code"]').fill("abc123");
await page.getByRole("button", { name: /Enter as Judge/ }).click();
await page.locator(".proj-item").first().waitFor({ timeout: 8000 });
await check("the tablet joins the school's live channel", async () => waitFor(() => schoolJoins >= 1, 10000, "the first join"));
await check("judging is open on the tablet", async () =>
  assert.equal(await page.getByText(/Judging is currently locked/i).count(), 0));

console.log("\n── The connection drops; the organiser locks judging meanwhile; it comes back");
const joinsBefore = schoolJoins;
sockets.splice(0).forEach(ws => ws.close().catch(() => {}));
store.app_settings.find(s => s.key === "locked").value = "true";   // missed: no event is ever sent
await check("the tablet reconnects on its own", async () => waitFor(() => schoolJoins > joinsBefore, 30000, "a rejoin"));
await check("…and shows the lock it missed — without a refresh", async () =>
  page.getByText(/Judging is currently locked/i).first().waitFor({ timeout: 8000 }));

console.log("\n── It drops AGAIN right away (inside the 10 s refresh window); the organiser unlocks");
const joinsBefore2 = schoolJoins;
sockets.splice(0).forEach(ws => ws.close().catch(() => {}));
store.app_settings.find(s => s.key === "locked").value = "false";
await check("the tablet reconnects again", async () => waitFor(() => schoolJoins > joinsBefore2, 30000, "a second rejoin"));
await check("…and still catches up — the refresh is delayed to the end of the window, never dropped", async () =>
  (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { if (await page.getByText(/Judging is currently locked/i).count() === 0) return; await page.waitForTimeout(300); }
    throw new Error("the lock banner is still shown — the second change was never loaded");
  })());

console.log("\n── F17: the organiser removes the project this judge has open");
await page.locator(".proj-item", { hasText: "Existing Volcano Study" }).click();
await page.locator(".rub-steps").first().waitFor({ timeout: 6000 });
store.projects = store.projects.filter(p => p.id !== "p_seed");
const joinsBefore3 = schoolJoins;
sockets.splice(0).forEach(ws => ws.close().catch(() => {}));
await waitFor(() => schoolJoins > joinsBefore3, 30000, "a third rejoin").catch(() => {});
await check("the tablet says the project is no longer on the list — no white screen", async () =>
  page.getByTestId("project-gone").waitFor({ timeout: 15000 }));
await check("…and the way back to the list works", async () => {
  await page.getByRole("button", { name: /Back to my projects/ }).click();
  assert.equal(await page.getByTestId("crash-screen").count(), 0);
});

await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
