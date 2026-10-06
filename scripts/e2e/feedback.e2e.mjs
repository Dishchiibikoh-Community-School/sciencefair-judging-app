// Browser E2E — comment-only ("feedback") departments, migration 2026-10f.
// PreK / K-2 are not scored: a judge gives a commendation and an optional comment,
// every project is a participant, and the department must never appear in a ranking,
// a tie, an outlier alert or a podium.
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
store.rubrics.push({ id: "rub1", school_id: SID, name: "Default", is_active: true, criteria: [] });
const now = new Date().toISOString();
// Elementary becomes the comment-only department; Middle School stays scored, so
// the test also proves the two coexist in one fair.
store.departments.find(d => d.id === DEPTS.D_ELEM).scoring_mode = "feedback";
store.projects.push(
  { id: "p_k1", school_id: SID, num: "010", title: "My Bean Plant", cat: "Life Science", grade: "1",
    locked: false, department_id: DEPTS.D_ELEM, room: "", description: "", motivation: "", created_at: now },
  { id: "p_k2", school_id: SID, num: "011", title: "Rock Collection", cat: "Earth & Environmental Science", grade: "2",
    locked: false, department_id: DEPTS.D_ELEM, room: "", description: "", motivation: "", created_at: now },
);

async function newPage(vp = { width: 1280, height: 950 }) {
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  return { ctx, page };
}
async function adminPage() {
  const A = await newPage();
  await A.page.goto(`${BASE}/s/test`);
  await A.page.locator(".role-card.adm").click();
  await A.page.locator("input[type=email]").fill("admin@test.edu");
  await A.page.locator("input[type=password]").fill("correct-horse");
  await A.page.keyboard.press("Enter");
  await A.page.locator(".adm-side").waitFor({ timeout: 10000 });
  return A;
}
const scoreFor = (jid, pid) => store.scores.find(s => s.judge_id === jid && s.project_id === pid);

console.log("\n── Setup tab shows and controls the mode");
const A0 = await adminPage();
await A0.page.locator(".nav-it", { hasText: "Setup" }).click();
await check("a comment-only department is badged in Setup", async () => {
  const row = A0.page.locator(".setup-row", { hasText: "Elementary" }).first();
  await row.getByText("Comments only").first().waitFor({ timeout: 4000 });
  assert.equal(await row.locator("select.setup-mode").inputValue(), "feedback");
});
await check("switching a department's mode persists", async () => {
  const row = A0.page.locator(".setup-row", { hasText: "High School" }).first();
  await row.locator("select.setup-mode").selectOption("feedback");
  await A0.page.waitForTimeout(500);
  assert.equal(store.departments.find(d => d.id === DEPTS.D_HIGH).scoring_mode, "feedback");
  await row.locator("select.setup-mode").selectOption("scored");
  await A0.page.waitForTimeout(400);
  assert.equal(store.departments.find(d => d.id === DEPTS.D_HIGH).scoring_mode, "scored");
});
await A0.ctx.close();

console.log("\n── Judge in a comment-only department");
const J = await newPage();
await J.page.goto(`${BASE}/s/test`);
await J.page.locator(".role-card").first().click();
await J.page.getByRole("button", { name: /Elementary/ }).click();
await J.page.locator('input[placeholder="e.g. Judge1"]').fill("Judge1");
await J.page.locator('input[placeholder="Event invite code"]').fill("abc123");
await J.page.getByRole("button", { name: /Enter as Judge/ }).click();
await J.page.locator(".proj-item").first().waitFor({ timeout: 8000 });
await J.page.locator(".proj-item", { hasText: "My Bean Plant" }).click();

await check("no rubric is shown — a commendation picker replaces it", async () => {
  await J.page.getByText(/This group is not scored/).waitFor({ timeout: 5000 });
  assert.equal(await J.page.locator(".rub-steps").count(), 0, "rubric must not render");
  assert.equal(await J.page.locator(".fb-chip").count(), 7);
});
await check("no total score panel (there is nothing to total)", async () =>
  assert.equal(await J.page.getByText("Total Score").count(), 0));
await check("submit is blocked until a commendation is chosen", async () =>
  assert.equal(await J.page.getByRole("button", { name: /Submit Review/ }).isDisabled(), true));

await J.page.locator(".fb-chip", { hasText: "Excellent Teamwork" }).click();
await check("picking a chip enables submit", async () =>
  assert.equal(await J.page.getByRole("button", { name: /Submit Review/ }).isDisabled(), false));
await J.page.locator("textarea").fill("Lovely drawings of the roots.");
await J.page.getByRole("button", { name: /Submit Review/ }).click();
await J.page.waitForTimeout(700);
await check("the review is stored with a commendation and NO criteria", async () => {
  const s = scoreFor(store.judges[0].id, "p_k1");
  assert.ok(s, "no score row written");
  assert.equal(s.commendation, "Excellent Teamwork");
  assert.deepEqual(s.criteria, {}, "a comment-only review must not write criteria");
  assert.equal(s.notes, "Lovely drawings of the roots.");
});

// A judge can type their own wording instead of using the list.
await J.page.locator(".proj-item", { hasText: "Rock Collection" }).click();
await J.page.locator('input[type=text]').last().fill("Best Rock Hunter in First Grade");
await J.page.getByRole("button", { name: /Submit Review/ }).click();
await J.page.waitForTimeout(700);
await check("a judge can write their own commendation instead of the list", async () =>
  assert.equal(scoreFor(store.judges[0].id, "p_k2").commendation, "Best Rock Hunter in First Grade"));
await check("re-opening a reviewed project restores what was given", async () => {
  await J.page.locator(".proj-item", { hasText: "My Bean Plant" }).click();
  await J.page.locator(".fb-chip.selected").waitFor({ timeout: 4000 });
  assert.equal(await J.page.locator(".fb-chip.selected").innerText(), "Excellent Teamwork");
  await J.page.getByRole("button", { name: /Back to my projects/ }).click();
});
await J.ctx.close();

console.log("\n── The department never enters a ranking");
const A = await adminPage();
await A.page.locator(".nav-it", { hasText: "Overview" }).click();
await A.page.waitForTimeout(800);
await check("admin sees a Participants list, not a leaderboard", async () => {
  await A.page.getByText("Elementary — Participants").waitFor({ timeout: 5000 });
  await A.page.getByText("Excellent Teamwork").first().waitFor();
});
await check("comment-only projects are absent from every scored leaderboard", async () => {
  const body = await A.page.locator("body").innerText();
  const lb = body.slice(body.indexOf("Middle School — Project Leaderboard"));
  assert.ok(!lb.includes("My Bean Plant"), "a comment-only project leaked into a ranking");
});
await check("no outlier alert from a comment-only department", async () => {
  await A.page.locator(".nav-it", { hasText: "Alerts" }).click();
  await A.page.waitForTimeout(600);
  const body = await A.page.locator("body").innerText();
  assert.ok(!body.includes("My Bean Plant") && !body.includes("Rock Collection"),
    "comment-only projects must never be flagged as score outliers");
});
await check("no tie alert either (two unscored projects are not 'tied' at 0)", async () => {
  await A.page.locator(".nav-it", { hasText: "Validation" }).click();
  await A.page.waitForTimeout(600);
  assert.equal(await A.page.locator(".val-tie-alert").count(), 0);
});

console.log("\n── Public results show participants, never ranks");
await A.page.locator(".nav-it", { hasText: "Validation" }).click();
await A.page.getByRole("button", { name: /Approve Results/ }).first().click();
await A.page.waitForTimeout(500);
await A.page.getByRole("button", { name: /Finalize Results/ }).click();
await A.page.waitForTimeout(600);
await A.page.locator(".nav-it", { hasText: "Share" }).click();
await A.page.getByRole("button", { name: /Generate Live Results Link/ }).click();
await A.page.waitForTimeout(600);
const link = store.share_links[0];
const P = await newPage({ width: 390, height: 1200 });
await P.page.goto(`${BASE}/s/test?token=${link.token}`);
await check("public page lists comment-only projects as winners with their commendations", async () => {
  await P.page.getByText("My Bean Plant").first().waitFor({ timeout: 8000 });
  await P.page.getByText(/Everyone is a winner/).first().waitFor();
  await P.page.getByText("Excellent Teamwork").first().waitFor();
});
await check("…and shows them no rank, no score and no podium medal", async () => {
  const body = await P.page.locator("body").innerText();
  const seg = body.slice(body.indexOf("Elementary"), body.indexOf("Middle School") > 0 ? body.indexOf("Middle School") : undefined);
  assert.ok(!/\/\s*42|\/\s*100/.test(seg), "a score denominator appeared next to an unscored project");
  assert.ok(!seg.includes("🥇") && !seg.includes("🥈"), "a medal appeared in a comment-only department");
});
await check("judge names are still never shown publicly", async () => {
  const body = await P.page.locator("body").innerText();
  assert.ok(!/Judge\d/.test(body));
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
