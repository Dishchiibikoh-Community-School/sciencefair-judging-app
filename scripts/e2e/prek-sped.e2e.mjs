// Browser E2E — the 2026-27 PreK & SPED Recognition Rubric (2026-10-21).
//   • 4 criteria rated 1–5 = 20, replacing "Comments only" for those departments.
//   • Every child gets a ribbon from the total: 17–20 Gold · 13–16 Silver · 4–12 Bright Star.
//   • Tied totals SHARE the place; places go to the three highest DIFFERENT totals
//     (18, 18, 16.5, 15, 12 → 1st, 1st, 2nd, 3rd, —), and such a tie opens no deliberation.
//   • Every other rubric is unchanged: a tie there is still one 1st + one 2nd and still raises the alert.
// Run: see scan.e2e.mjs header (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { freshStore, installMock, DEPTS, SID } from "./mock.mjs";

const BASE = "http://localhost:5199";
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
const errs = [];

// "Elementary" in the mock plays the PreK department: comment-only, exactly like the live school.
const store = freshStore();
store.rubrics.push({ id: "rub1", school_id: SID, name: "Default", is_active: true, criteria: [] });
store.departments.find(d => d.id === DEPTS.D_ELEM).scoring_mode = "feedback";
const now = new Date().toISOString();
const proj = (id, num, title, dept) => ({ id, school_id: SID, num, title, cat: "Life Science", grade: "PreK",
  locked: false, department_id: dept, room: "", description: "", motivation: "", created_at: now });
store.projects.push(
  proj("p_k1", "101", "Bubbles Everywhere", DEPTS.D_ELEM),
  proj("p_k2", "102", "Sink or Float",      DEPTS.D_ELEM),
  proj("p_k3", "103", "Colour Mixing",      DEPTS.D_ELEM),
  proj("p_k4", "104", "Magnet Hunt",        DEPTS.D_ELEM),
  proj("p_k5", "105", "Seeds in a Bag",     DEPTS.D_ELEM),
);
const ps = (a, b, c, d) => ({ ps_curiosity: a, ps_hands_on: b, ps_sharing: c, ps_effort: d });
const setSetting = (k, v) => {
  const row = store.app_settings.find(r => r.key === k);
  if (row) row.value = v; else store.app_settings.push({ school_id: SID, key: k, value: v });
};

async function newPage(vp = { width: 820, height: 1180 }) {
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  return { ctx, page };
}
async function adminPage() {
  const A = await newPage({ width: 1280, height: 950 });
  await A.page.goto(`${BASE}/s/test`);
  await A.page.locator(".role-card.adm").click();
  await A.page.locator("input[type=email]").fill("admin@test.edu");
  await A.page.locator("input[type=password]").fill("correct-horse");
  await A.page.keyboard.press("Enter");
  await A.page.locator(".adm-side").waitFor({ timeout: 10000 });
  return A;
}
async function adminReload(page) {
  await page.reload();
  const side = page.locator(".adm-side");
  try { await side.waitFor({ timeout: 2500 }); }
  catch { await page.locator(".role-card.adm").click(); await side.waitFor({ timeout: 8000 }); }
}
const tab = (page, label) => page.locator(".nav-it", { hasText: label }).first().click();
const tap = (page, i, n) => page.locator(".rub-item").nth(i).locator(".rub-step-btn").nth(n - 1).click();

console.log("\n── Setup: a comment-only department switches to the PreK & SPED form");
const A = await adminPage();
await tab(A.page, "Setup");
await A.page.getByLabel("How Elementary is judged").selectOption("preset:prek-sped-2627");
await A.page.waitForTimeout(800);
const psRub = () => store.rubrics.find(r => /^PreK & SPED Recognition/.test(r.name));
await check("the department is now scored on the 4-criteria form (out of 20)", async () => {
  const d = store.departments.find(x => x.id === DEPTS.D_ELEM);
  assert.ok(psRub(), "preset not added: " + store.rubrics.map(r => r.name).join(" | "));
  assert.equal(d.rubric_id, psRub().id);
  assert.notEqual(d.scoring_mode, "feedback");
  assert.deepEqual(psRub().criteria.map(c => c.id), ["ps_curiosity", "ps_hands_on", "ps_sharing", "ps_effort"]);
  assert.equal(psRub().criteria.reduce((s, c) => s + c.max, 0), 20);
  assert.ok(psRub().criteria.every(c => c.steps.join() === "1,2,3,4,5"), "whole numbers 1–5");
});

// Other judges' scores (set after the switch — a department with scores cannot change form).
store.judges.push(
  { id: "j_s1", school_id: SID, alias: "Judge8", department_id: DEPTS.D_ELEM, department_ids: [DEPTS.D_ELEM], projects: [], joined_at: now },
  { id: "j_s2", school_id: SID, alias: "Judge9", department_id: DEPTS.D_ELEM, department_ids: [DEPTS.D_ELEM], projects: [], joined_at: now },
);
store.scores.push(
  { id: "s_k2",  school_id: SID, judge_id: "j_s1", project_id: "p_k2", criteria: ps(5, 5, 4, 4), notes: "", submitted_at: now }, // 18
  { id: "s_k3",  school_id: SID, judge_id: "j_s1", project_id: "p_k3", criteria: ps(4, 4, 4, 3), notes: "", submitted_at: now }, // 15
  { id: "s_k4",  school_id: SID, judge_id: "j_s1", project_id: "p_k4", criteria: ps(3, 3, 3, 3), notes: "", submitted_at: now }, // 12
  { id: "s_k5a", school_id: SID, judge_id: "j_s1", project_id: "p_k5", criteria: ps(5, 4, 4, 4), notes: "", submitted_at: now }, // 17
  { id: "s_k5b", school_id: SID, judge_id: "j_s2", project_id: "p_k5", criteria: ps(4, 4, 4, 4), notes: "", submitted_at: now }, // 16 → 16.5
);

console.log("\n── Judge: four criteria, 1–5, the sheet's guidance on screen");
const J = await newPage();
await J.page.goto(`${BASE}/s/test`);
await J.page.locator(".role-card").first().click();
await J.page.getByRole("button", { name: /Elementary/ }).click();
await J.page.locator('input[placeholder="e.g. Judge1"]').fill("Judge1");
await J.page.locator('input[placeholder="Event invite code"]').fill("ABC123");
await J.page.getByRole("button", { name: /Enter as Judge/ }).click();
await J.page.locator(".proj-item").first().waitFor({ timeout: 8000 });
await J.page.locator(".proj-item", { hasText: "Bubbles Everywhere" }).click();
await check("the scoring screen shows the form's guidance (adult help never lowers a score)", async () =>
  assert.match(await J.page.locator("[data-testid=sc-guide]").innerText(), /Help from an adult or a communication device never lowers a score/));
await check("four criteria, five buttons each, with what a 5 / 3–4 / 1–2 looks like", async () => {
  assert.equal(await J.page.locator(".rub-item").count(), 4);
  assert.equal(await J.page.locator(".rub-item").first().locator(".rub-step-btn").count(), 5);
  await J.page.getByText(/5: Asks questions or points out what they noticed/).waitFor({ timeout: 3000 });
});
await tap(J.page, 0, 5); await tap(J.page, 1, 5); await tap(J.page, 2, 4); await tap(J.page, 3, 4);
await J.page.getByRole("button", { name: /Submit Score/ }).click();
await J.page.waitForTimeout(900);
await check("the score is stored as the four ratings (total 18 of 20)", async () => {
  const s = store.scores.find(x => x.project_id === "p_k1");
  assert.ok(s, "not saved");
  assert.deepEqual(s.criteria, ps(5, 5, 4, 4));
});
await J.ctx.close();

console.log("\n── Admin: a PreK tie shares the place and opens no deliberation");
await adminReload(A.page);
await tab(A.page, "Validation");
await A.page.locator(".adm-main").getByText(/Validat/).first().waitFor({ timeout: 6000 });
await A.page.waitForTimeout(500);
await check("two children tied on 18 raise NO 'Tie detected' alert", async () =>
  assert.equal(await A.page.getByText("Tie detected in rankings").count(), 0));

await tab(A.page, "Overview");
const lbRow = (t) => A.page.locator(".adm-main tr", { hasText: t });
await A.page.locator(".adm-main").getByText("Bubbles Everywhere").first().waitFor({ timeout: 6000 });
await check("leaderboard: both 18s are 🥇, 16.5 is 🥈, 15 is 🥉, 12 has no place", async () => {
  const place = async (t) => { const l = lbRow(t).locator("[data-testid=lb-place]"); return (await l.count()) ? (await l.innerText()).trim() : ""; };
  assert.deepEqual(
    [await place("Bubbles Everywhere"), await place("Sink or Float"), await place("Seeds in a Bag"), await place("Colour Mixing"), await place("Magnet Hunt")],
    ["🥇", "🥇", "🥈", "🥉", ""]);
});
await check("leaderboard ribbons: 18 Gold · 16.5 Silver (Gold starts at 17) · 15 Silver · 12 Bright", async () => {
  const rib = async (t) => (await lbRow(t).locator("[data-testid=lb-ribbon]").innerText()).replace("🎀", "").trim();
  assert.equal(await rib("Sink or Float"), "Gold Star Scientist");
  assert.equal(await rib("Seeds in a Bag"), "Silver Star Scientist");
  assert.equal(await rib("Colour Mixing"), "Silver Star Scientist");
  assert.equal(await rib("Magnet Hunt"), "Bright Star Scientist");
});

console.log("\n── Every other rubric is unchanged");
store.projects.push(proj("p_m1", "201", "Alpha Rockets", DEPTS.D_MID), proj("p_m2", "202", "Beta Bridges", DEPTS.D_MID));
store.judges.push({ id: "j_m", school_id: SID, alias: "Judge12", department_id: DEPTS.D_MID, department_ids: [DEPTS.D_MID], projects: [], joined_at: now });
store.scores.push(
  { id: "s_m1", school_id: SID, judge_id: "j_m", project_id: "p_m1", criteria: { presentation: 6, data: 4 }, notes: "", submitted_at: now },
  { id: "s_m2", school_id: SID, judge_id: "j_m", project_id: "p_m2", criteria: { presentation: 6, data: 4 }, notes: "", submitted_at: now },
);
await adminReload(A.page);
await tab(A.page, "Validation");
await check("a tie on the default rubric still raises 'Tie detected'", () =>
  A.page.getByText("Tie detected in rankings").first().waitFor({ timeout: 6000 }));
await tab(A.page, "Overview");
await A.page.locator(".adm-main").getByText("Alpha Rockets").first().waitFor({ timeout: 6000 });
await check("…and there the tied pair is still one 🥇 and one 🥈, with no ribbons", async () => {
  const p = [await lbRow("Alpha Rockets").locator("[data-testid=lb-place]").innerText(), await lbRow("Beta Bridges").locator("[data-testid=lb-place]").innerText()];
  assert.deepEqual([...p].sort(), ["🥇", "🥈"]);
  assert.equal(await lbRow("Alpha Rockets").locator("[data-testid=lb-ribbon]").count(), 0);
});

console.log("\n── Public results");
setSetting("results_finalized", "true");
store.share_links = [{ id: "sl1", school_id: SID, token: "PUBTOKEN", title: "Results", show_rubric: false, created_at: now, expiry: "never", revoked_at: null }];
const P = await newPage();
await P.page.goto(`${BASE}/s/test?token=PUBTOKEN`);
await P.page.getByText("Bubbles Everywhere").first().waitFor({ timeout: 8000 });
const rank = async (t) => (await P.page.locator(".res-row", { hasText: t }).locator(".res-rank").first().innerText()).trim();
await check("PreK is ranked now (no 'Everyone is a winner' list) and says every child earns a ribbon", async () => {
  assert.equal(await P.page.getByText("Everyone is a winner").count(), 0);
  assert.equal(await P.page.getByText("Every child earns a ribbon").count(), 1);
});
await check("the podium carries both tied children as 1st, then 2nd and 3rd", async () => {
  const cards = P.page.locator(".podium-card");
  const got = [];
  for (let i = 0; i < await cards.count(); i++) got.push(`${(await cards.nth(i).locator(".p-medal").innerText()).trim()} ${(await cards.nth(i).locator(".p-title").innerText()).trim()}`);
  for (const want of ["🥇 Bubbles Everywhere", "🥇 Sink or Float", "🥈 Seeds in a Bag", "🥉 Colour Mixing"]) assert.ok(got.includes(want), want + " missing: " + got.join(" | "));
  assert.ok(!got.some(g => g.includes("Magnet Hunt")), "12 is 4th-highest total — no place");
});
await check("ranked table: medals for the four placed children, a position number for the fifth", async () => {
  assert.deepEqual([await rank("Bubbles Everywhere"), await rank("Sink or Float"), await rank("Seeds in a Bag"), await rank("Colour Mixing"), await rank("Magnet Hunt")],
    ["🥇", "🥇", "🥈", "🥉", "5"]);
});
await check("every PreK child shows a ribbon; the Middle School projects show none", async () => {
  assert.equal(await P.page.locator("[data-testid=res-ribbon]").count(), 5);
  assert.match(await P.page.locator(".res-row", { hasText: "Magnet Hunt" }).innerText(), /Bright Star Scientist/);
  assert.equal(await P.page.locator(".res-row", { hasText: "Alpha Rockets" }).locator("[data-testid=res-ribbon]").count(), 0);
});
await check("Middle School's tie is still not shared on the public page", async () =>
  assert.deepEqual([await rank("Alpha Rockets"), await rank("Beta Bridges")].sort(), ["🥇", "🥈"]));
await P.ctx.close();

console.log("\n── Results CSV");
await adminReload(A.page);
await tab(A.page, "Share");
const [dl] = await Promise.all([A.page.waitForEvent("download"), A.page.getByRole("button", { name: /Download Results CSV/ }).click()]);
const csv = readFileSync(await dl.path(), "utf8");
await check("the results CSV has Place and Ribbon columns, shared places included", async () => {
  const head = csv.split("\n")[0];
  assert.ok(head.includes('"Place","Ribbon"'), head);
  const row = (t) => csv.split("\n").find(l => l.includes(t));
  assert.match(row("Bubbles Everywhere"), /"1st Place","Gold Star Scientist"/);
  assert.match(row("Sink or Float"), /"1st Place","Gold Star Scientist"/);
  assert.match(row("Seeds in a Bag"), /"2nd Place","Silver Star Scientist"/);
  assert.match(row("Magnet Hunt"), /"","Bright Star Scientist"/);
  assert.match(row("Alpha Rockets"), /"[12](st|nd) Place",""/);
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
