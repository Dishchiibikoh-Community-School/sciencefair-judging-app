// Browser E2E — stress test of the Cibecue / ISEF-style 100-point rubric preset.
// Exercises the whole scoring chain on a rubric that breaks every "42 points, has an
// abstract criterion, allows 0" assumption the app grew up with:
//   preset apply → judge scores with rating labels → min 20 / max 100 → averages →
//   anomaly threshold (now % of project max, not 8 points) → leaderboard → exports.
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
// A grade-4 project: under the 42-pt rubric it skips Abstract (max 36). The 100-pt
// rubric has no abstract criterion, so it must be scored out of the full 100.
store.projects.push(
  { id: "p_g4", school_id: SID, num: "002", title: "Young Plants", cat: "Life Science", grade: "4",
    locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now },
  { id: "p_g8", school_id: SID, num: "003", title: "Rocket Fins", cat: "Physics, Math & Astronomy", grade: "8",
    locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now },
);

async function newPage(vp = { width: 1280, height: 950 }) {
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  return { ctx, page };
}
// The mock has no realtime push and no session that survives a reload, so an admin
// tab opened earlier keeps stale score state. Open a fresh signed-in admin instead.
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
const activeRubric = () => store.rubrics.find(r => r.is_active)?.criteria || [];
const scoreFor = (jid, pid) => store.scores.find(s => s.judge_id === jid && s.project_id === pid);
const totalOf = (sc) => activeRubric().reduce((t, c) => t + (Number(sc?.criteria?.[c.id]) || 0), 0);

console.log("\n── Admin applies the 100-point preset");
const A = await adminPage();
await A.page.locator(".nav-it", { hasText: "Rubric" }).click();
await A.page.getByRole("button", { name: /Cibecue \/ ISEF-style/ }).click();
await A.page.waitForTimeout(600);
await check("preset writes 5 criteria totalling exactly 100 points", async () => {
  const c = activeRubric();
  assert.equal(c.length, 5, `got ${c.length}`);
  assert.equal(c.reduce((s, x) => s + x.max, 0), 100);
  assert.deepEqual(c.map(x => x.max), [15, 25, 20, 20, 20]);
});
await check("…and no criterion allows 0 (floor is 20, per the paper form)", async () => {
  const c = activeRubric();
  assert.ok(c.every(x => !x.steps.includes(0)), "a 0 step leaked in");
  assert.equal(c.reduce((s, x) => s + Math.min(...x.steps), 0), 20);
});
await check("rubric view shows rating words next to the points", async () => {
  await A.page.getByText("Needs improvement (3)").first().waitFor({ timeout: 4000 });
  await A.page.getByText("Excellent (25)").first().waitFor();
});

console.log("\n── Judge scores on the 100-point rubric");
const J = await newPage();
await J.page.goto(`${BASE}/s/test`);
await J.page.locator(".role-card").first().click();
await J.page.getByRole("button", { name: /Middle School/ }).click();
await J.page.locator('input[placeholder="e.g. Judge1"]').fill("Judge1");
await J.page.locator('input[placeholder="Event invite code"]').fill("abc123");
await J.page.getByRole("button", { name: /Enter as Judge/ }).click();
await J.page.locator(".proj-item").first().waitFor({ timeout: 8000 });

// Grade 4 — the 42-pt rubric would hide Abstract; this one has none, so all 5 show.
await J.page.locator(".proj-item", { hasText: "Young Plants" }).click();
await check("grade-4 project shows all 5 sections (no abstract rule to apply)", async () =>
  assert.equal(await J.page.locator(".rub-steps").count(), 5));
await check("buttons show the rating word, not raw points", async () => {
  const first = J.page.locator(".rub-steps").first();
  assert.deepEqual(await first.locator(".rub-step-lab").allTextContents(),
    ["Needs improvement", "Fair", "Good", "Very Good", "Excellent"]);
  assert.deepEqual(await first.locator(".rub-step-pts").allTextContents(), ["3", "6", "9", "12", "15"]);
});
await check("submit stays disabled until all 5 sections are rated", async () =>
  assert.equal(await J.page.getByRole("button", { name: /Submit Score/ }).isDisabled(), true));

// Lowest possible rating everywhere → exactly 20/100
const groups = J.page.locator(".rub-steps");
for (let i = 0; i < await groups.count(); i++) await groups.nth(i).locator("button").first().click();
await check("all-lowest does NOT trip the 'no zeroes' rule (there are no zeros to give)", async () =>
  assert.equal(await J.page.getByText(/must have no zeroes/).count(), 0));
await J.page.getByRole("button", { name: /Submit Score/ }).click();
await J.page.waitForTimeout(600);
await check("all 'Needs improvement' = 20/100, the documented floor", async () =>
  assert.equal(totalOf(scoreFor(store.judges[0].id, "p_g4")), 20));

// Highest everywhere on the other project → exactly 100
await J.page.locator(".proj-item", { hasText: "Rocket Fins" }).click();
const g2 = J.page.locator(".rub-steps");
for (let i = 0; i < await g2.count(); i++) await g2.nth(i).locator("button").last().click();
await J.page.getByRole("button", { name: /Submit Score/ }).click();
await J.page.waitForTimeout(600);
await check("all 'Excellent' = 100/100", async () =>
  assert.equal(totalOf(scoreFor(store.judges[0].id, "p_g8")), 100));

// Re-score the first project in the middle of the scale → 60
await J.page.locator(".proj-item", { hasText: "Young Plants" }).click();
const g3 = J.page.locator(".rub-steps");
for (let i = 0; i < await g3.count(); i++) await g3.nth(i).locator("button").nth(2).click();
await J.page.getByRole("button", { name: /Submit Score/ }).click();
await J.page.waitForTimeout(600);
await check("all 'Good' = 60/100, and editing replaced the old score (no duplicate row)", async () => {
  assert.equal(totalOf(scoreFor(store.judges[0].id, "p_g4")), 60);
  assert.equal(store.scores.filter(s => s.project_id === "p_g4").length, 1);
});

console.log("\n── Phone layout: labelled steps must stay inside the card");
// "Needs improvement" is far wider than "4". Five of them overflowed the card at
// 390px and the last option was off-screen — i.e. a judge on a phone could not
// give an Excellent. They must wrap instead.
const PH = await newPage({ width: 390, height: 1400 });
await PH.page.goto(`${BASE}/s/test`);
await PH.page.locator(".role-card").first().click();
await PH.page.getByRole("button", { name: /Middle School/ }).click();
await PH.page.locator('input[placeholder="e.g. Judge1"]').fill("Judge3");
await PH.page.locator('input[placeholder="Event invite code"]').fill("abc123");
await PH.page.getByRole("button", { name: /Enter as Judge/ }).click();
await PH.page.locator(".proj-item", { hasText: "Rocket Fins" }).click();
await PH.page.locator(".rub-steps").first().waitFor({ timeout: 8000 });
await check("no scoring button overflows its card at 390px (all 5 are tappable)", async () => {
  const over = await PH.page.evaluate(() => {
    const out = [];
    document.querySelectorAll(".rub-steps").forEach(s => {
      const card = s.closest(".rub-item")?.getBoundingClientRect();
      if (!card) return;
      s.querySelectorAll("button").forEach(b => {
        const r = b.getBoundingClientRect();
        if (r.right > card.right + 1 || r.left < card.left - 1) out.push(b.innerText.replace(/\n/g, " "));
      });
    });
    return out;
  });
  assert.deepEqual(over, [], `off-card buttons: ${over.join(" | ")}`);
});
await PH.ctx.close();

console.log("\n── Anomaly threshold is now relative, not a hardcoded 8 points");
// Judge2 scores p_g4 at 72 — 12 points from Judge1's 60. Under the old rule (>8 pts)
// that was an outlier; on a 100-point rubric 12 points is 12% and must NOT be.
const J2 = await newPage();
await J2.page.goto(`${BASE}/s/test`);
await J2.page.locator(".role-card").first().click();
await J2.page.getByRole("button", { name: /Middle School/ }).click();
await J2.page.locator('input[placeholder="e.g. Judge1"]').fill("Judge2");
await J2.page.locator('input[placeholder="Event invite code"]').fill("abc123");
await J2.page.getByRole("button", { name: /Enter as Judge/ }).click();
await J2.page.locator(".proj-item", { hasText: "Young Plants" }).click();
const g4 = J2.page.locator(".rub-steps");
// Very Good, Good, Good, Good, Good = 12+15+12+12+12 = 63
for (const [i, n] of [[0,3],[1,2],[2,2],[3,2],[4,2]]) await g4.nth(i).locator("button").nth(n).click();
await J2.page.getByRole("button", { name: /Submit Score/ }).click();
await J2.page.waitForTimeout(600);
const B = await adminPage();   // fresh admin, sees every score written so far
await check("two judges 3 points apart on a 100-pt rubric → NOT flagged", async () => {
  await B.page.locator(".nav-it", { hasText: "Alerts" }).click();
  await B.page.waitForTimeout(600);
  assert.equal(await B.page.locator(".alert-box").count(), 0,
    "a 3-point gap must not be an outlier (the old hardcoded >8 pts would have been close)");
});

console.log("\n── Totals, averages and the leaderboard");
await B.page.locator(".nav-it", { hasText: "Overview" }).click();
await B.page.waitForTimeout(800);
await check("leaderboard shows averages out of each project's own max", async () => {
  // p_g4 = (60 + 63) / 2 = 61.5 ; p_g8 = 100
  await B.page.getByText("61.5").first().waitFor({ timeout: 5000 });
  await B.page.getByText("100.0").first().waitFor({ timeout: 5000 });
});
await check("no '/42' left anywhere on the admin dashboard", async () => {
  const body = await B.page.locator("body").innerText();
  assert.ok(!/\/\s*42\b/.test(body), "found a hardcoded /42");
});

console.log("\n── Exports carry the real rubric");
await B.page.locator(".nav-it", { hasText: "Score Export" }).click();
await B.page.getByRole("button", { name: /Save Score Backup/ }).click();
await B.page.waitForTimeout(700);
await check("score backup stores per-criterion values AND a copy of the rubric", async () => {
  const b = store.score_backups.at(-1);
  assert.ok(b, "no backup row written");
  const snap = typeof b.snapshot === "string" ? JSON.parse(b.snapshot) : b.snapshot;
  assert.ok(snap?.entries?.length, "snapshot has no entries");
  // Every entry must carry the per-criterion values, not just a total — the 2026-09
  // audit found backups that held totals only because they read v1 flat columns.
  const e = snap.entries.find(x => x.projectId === "p_g8");
  assert.equal(e.total, 100);
  assert.deepEqual(Object.keys(e.criteria).sort(),
    ["data_conclusion", "further_research", "inquiry", "presentation", "title"]);
  assert.equal(e.criteria.inquiry, 25);
  // …and a copy of the rubric, so the snapshot still renders after a rubric change.
  assert.equal(snap.rubric.length, 5);
  assert.equal(snap.rubric.find(r => r.id === "inquiry").max, 25);
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
