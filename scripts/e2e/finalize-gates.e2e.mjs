// Browser E2E — finalize and validation gates (FIXES_2026-11.md F8).
//   - Finalize also locks judging, so nobody can change a score after the results are final (SF-04);
//   - a score scored offline that syncs AFTER Finalize is flagged in the IT log (I2);
//   - a judge who validated and then got a new project can still reach "Revise my validation" (SF-12);
//   - a concern from a judge who is not at 100 % can still be cleared by the admin (N5);
//   - a judge with no projects is told so, not "All projects scored!" (B4).
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
store.rubrics.push({ id: "rub1", school_id: SID, name: "Default", is_active: true, criteria: [] });
const now = new Date().toISOString();
for (const [id, num, title] of [["p1", "011", "Pond Algae"], ["p2", "012", "Quartz Glow"]])
  store.projects.push({ id, school_id: SID, num, title, cat: "Life Science", grade: "7", locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now });
const full = { presentation: 6, testable_q: 3, background: 3, hypothesis: 3, variables: 3, materials: 3, data: 6, analysis: 6, conclusion: 3, abstract: 6 };
const judge = (id, alias, projects) => store.judges.push({ id, school_id: SID, alias, department_id: DEPTS.D_MID, department_ids: [DEPTS.D_MID], projects, joined_at: now });
judge("j1", "Judge1", ["p1"]);          // validated, then gets p2 (SF-12)
judge("j2", "Judge2", ["p1", "p2"]);    // a concern while only half done (N5)
judge("j3", "Judge3", []);              // nothing assigned (B4)
store.scores.push(
  { id: "s1", school_id: SID, judge_id: "j1", project_id: "p1", criteria: full, notes: "", submitted_at: now },
  { id: "s2", school_id: SID, judge_id: "j2", project_id: "p1", criteria: full, notes: "", submitted_at: now },
);
store.validations.push(
  { school_id: SID, judge_id: "j1", approved: true,  comment: "",            validated_at: now },
  { school_id: SID, judge_id: "j2", approved: false, comment: "Recheck p1",  validated_at: now },
);
const setting = (k) => store.app_settings.find(r => r.key === k)?.value;

async function judgePage(judgeId, alias) {
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
  const page = await ctx.newPage();
  await installMock(page, store, []);
  await page.goto(`${BASE}/s/test`);
  await page.evaluate(([id, j]) => {   // a device already signed in as this judge
    localStorage.setItem("sf_judge_id", id); localStorage.setItem("sf_judge_slug", "test");
    localStorage.setItem("sf_judge_data", JSON.stringify(j));
  }, [judgeId, { id: judgeId, alias, projects: store.judges.find(j => j.id === judgeId).projects, department_id: DEPTS.D_MID }]);
  await page.reload();
  return page;
}

console.log("\n── B4: a judge with nothing assigned");
const J3 = await judgePage("j3", "Judge3");
await check("is told no projects are assigned yet", async () => J3.getByTestId("no-projects").waitFor({ timeout: 8000 }));
await check("…and is NOT shown 'All projects scored!' or the Approve buttons", async () => {
  assert.equal(await J3.getByText("All projects scored!").count(), 0);
  assert.equal(await J3.getByRole("button", { name: /Approve Results/ }).count(), 0);
});

console.log("\n── SF-12: a validated judge gets a new project");
store.judges.find(j => j.id === "j1").projects = ["p1", "p2"];
const J1 = await judgePage("j1", "Judge1");
await check("the judge is told a project was added after they validated", async () =>
  J1.getByTestId("new-after-validation").waitFor({ timeout: 8000 }));
await check("…and can reach Revise my validation (it only showed at 100% before)", async () =>
  J1.getByRole("button", { name: "Revise my validation" }).waitFor({ timeout: 3000 }));

console.log("\n── N5: a concern from a judge who is not at 100%");
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const A = await ctx.newPage();
await installMock(A, store, []);
await A.goto(`${BASE}/s/test`);
await A.locator(".role-card.adm").click();
await A.locator("input[type=email]").fill("admin@test.edu");
await A.locator("input[type=password]").fill("correct-horse");
await A.keyboard.press("Enter");
await A.locator(".adm-side").waitFor({ timeout: 10000 });
await A.locator(".nav-it", { hasText: "Validation" }).first().click();
await check("the admin sees Judge2's concern with a Clear concern button", async () =>
  A.locator("div", { has: A.getByText("Judge2") }).getByRole("button", { name: "Clear concern" }).first().waitFor({ timeout: 6000 }));
await A.locator("div", { has: A.getByText("Judge2") }).getByRole("button", { name: "Clear concern" }).first().click().catch(() => {});
await check("…and clearing it removes the concern", async () => {
  await A.waitForTimeout(600);
  assert.equal(store.validations.filter(v => v.judge_id === "j2").length, 0);
});

console.log("\n── SF-04 / I2: Finalize locks judging; a late offline score is flagged");
// Judge2's tablet scores p2 while the server refuses → it waits in the queue.
const J2 = await judgePage("j2", "Judge2");
await J2.locator(".proj-item", { hasText: "Quartz Glow" }).click();
const groups = J2.locator(".rub-steps");
await groups.first().waitFor({ timeout: 6000 });
for (let i = 0; i < await groups.count(); i++) await groups.nth(i).locator("button").last().click();
store.failWrites = ["scores"];
await J2.getByRole("button", { name: /Submit Score/ }).click();
await J2.locator(".proj-item").first().waitFor({ timeout: 25000 });
store.failWrites = [];
await A.getByRole("button", { name: /Approve Results/ }).first().click();
await A.waitForTimeout(500);
await A.getByRole("button", { name: /Finalize Results/ }).click();
await check("Finalize also locks judging", async () => {
  await A.waitForTimeout(700);
  assert.equal(setting("results_finalized"), "true");
  assert.equal(setting("locked"), "true");
});
await J2.reload();
await check("the queued score still syncs, and SCORE_SYNCED_AFTER_FINALIZE tells the admin", async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 30000 && !store.it_logs.some(r => r.event === "SCORE_SYNCED_AFTER_FINALIZE")) await J2.waitForTimeout(500);
  assert.ok(store.scores.some(s => s.judge_id === "j2" && s.project_id === "p2"), "the queued score never arrived");
  assert.ok(store.it_logs.some(r => r.event === "SCORE_SYNCED_AFTER_FINALIZE"), "not flagged");
});

await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
