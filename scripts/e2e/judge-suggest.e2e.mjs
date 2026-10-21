// Browser E2E — Setup → Judges "Suggested setup" (rule 73) and the per-judge time hint.
// The fixture deliberately mirrors the real 2026-27 fair (PreK 2 · K-5 8 · 6-8 31 · 9-12 19 ·
// SPED 3, 15 judges, 3 scores per project) so the expected split is the one the organiser was
// given by hand: K-5 3 judges · 6-8 7 · 9-12 5, everybody on 11–13 projects.
// Run: see scan.e2e.mjs header (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { freshStore, installMock, SID } from "./mock.mjs";

const BASE = "http://localhost:5199";
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
const errs = [];

// ── Fixture: the real fair's shape ──
const D = { PreK:"e0000000-0000-0000-0000-0000000000p1", K5:"e0000000-0000-0000-0000-0000000000k5",
            G68:"e0000000-0000-0000-0000-00000000g068", G912:"e0000000-0000-0000-0000-0000000g0912",
            SPED:"e0000000-0000-0000-0000-00000000sped" };
const store = freshStore();
const now = new Date().toISOString();
store.departments = [
  { id:D.PreK, school_id:SID, name:"PreK",  code:"PK",   max_judges:5, ord:0, scoring_mode:"feedback" },
  { id:D.K5,   school_id:SID, name:"K-5",   code:"K5",   max_judges:5, ord:1, scoring_mode:"scored" },
  { id:D.G68,  school_id:SID, name:"6-8",   code:"G68",  max_judges:5, ord:2, scoring_mode:"scored" },
  { id:D.G912, school_id:SID, name:"9-12",  code:"G912", max_judges:5, ord:3, scoring_mode:"scored" },
  { id:D.SPED, school_id:SID, name:"SPED",  code:"SPED", max_judges:5, ord:4, scoring_mode:"feedback" },
];
let seq = 0;
const make = (deptId, count) => Array.from({ length: count }, () => {
  seq += 1;
  return { id:`p_${seq}`, school_id:SID, num:String(seq).padStart(3,"0"), title:`Project ${seq}`,
           cat:"Life Science", grade:"8", locked:false, department_id:deptId,
           room:"", description:"", motivation:"", created_at:now };
});
store.projects = [...make(D.PreK,2), ...make(D.K5,8), ...make(D.G68,31), ...make(D.G912,19), ...make(D.SPED,3)];
store.project_private = [];
store.judges = [];
store.judge_roster = [];
store.app_settings.push({ school_id:SID, key:"judge_max", value:"15" });

async function adminPage() {
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1100 } });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  await page.goto(`${BASE}/s/test`);
  await page.locator(".role-card.adm").click();
  await page.locator("input[type=email]").fill("admin@test.edu");
  await page.locator("input[type=password]").fill("correct-horse");
  await page.keyboard.press("Enter");
  await page.locator(".adm-side").waitFor({ timeout: 8000 });
  await page.locator(".nav-it", { hasText: "Setup" }).first().click();
  await page.locator(".sug-card").waitFor({ timeout: 8000 });
  return page;
}
const row = (page, dept) => page.locator(".sug-tbl tbody tr", { hasText: dept }).first();
const judgesIn = (deptName) => {
  const d = store.departments.find(x => x.name === deptName);
  return store.judge_roster.filter(r => r.department_id === d.id).map(r => r.judge_number).sort((a,b)=>a-b);
};

console.log("\n── The card suggests a split for 15 judges at 3 scores per project");
const A = await adminPage();
await A.locator('.sug-head input[aria-label="How many judges are coming"]').fill("15");
await A.locator('.sug-head select[aria-label="Target scores per project"]').selectOption("3");
await A.waitForTimeout(400);

await check("6-8 (31 projects) gets the most judges — 7", async () =>
  assert.match(await row(A, "6-8").innerText(), /\b7\b/));
await check("9-12 (19 projects) gets 5", async () =>
  assert.match(await row(A, "9-12").innerText(), /\b5\b/));
await check("K-5 (8 projects) gets 3 and needs no panel — everyone scores all", async () => {
  const t = await row(A, "K-5").innerText();
  assert.match(t, /\b3\b/);
  assert.match(t, /every judge scores all/);
});
await check("the busiest judge is told both the count and the time", async () => {
  const t = await A.locator(".sug-sum").innerText();
  assert.match(t, /11–13 projects/, t);
  assert.match(t, /1 h 18 min/, t);                 // 13 projects x 6 min
  assert.match(t, /3 scores/, t);
});
await check("comment-only departments ride along instead of consuming judges", async () => {
  for (const d of ["PreK", "SPED"]) assert.match(await row(A, d).innerText(), /shares Judge/, d);
});
await check("the explanation says WHY — panels are blind across departments", async () => {
  const t = await A.locator(".sug-note").last().innerText();
  for (const phrase of ["one scored department", "blind", "rubric"]) assert.ok(t.includes(phrase), phrase + " :: " + t);
});

console.log("\n── Fewer judges than the panel needs is refused, not fudged");
await A.locator('.sug-head input[aria-label="How many judges are coming"]').fill("5");
await A.waitForTimeout(400);
await check("5 judges at 3 scores across 3 scored departments shows the shortfall", async () => {
  await A.getByText(/need at least/).waitFor({ timeout: 4000 });
  assert.match(await A.locator(".sug-card").innerText(), /9 judges/);
});

console.log("\n── Apply fills the grid but saves nothing until Save judges");
await A.locator('.sug-head input[aria-label="How many judges are coming"]').fill("15");
await A.waitForTimeout(400);
await A.locator(".sug-card").getByRole("button", { name: /Apply to the grid/ }).click();
// Wait before asserting, so a background write would have landed by now. Honest note: I could
// not build a mutation that makes this one fail — calling saveRoster() inside applySuggestion
// reads rosterView() before React has flushed setRosterDraft, so it saves the OLD roster and
// writes nothing. The "grid is now dirty" check below is what reliably catches a premature save.
await A.waitForTimeout(900);
await check("nothing is written to the database by Apply alone", async () =>
  assert.equal(store.judge_roster.length, 0, "Apply saved without asking"));
await check("Save judges becomes available (the grid is now dirty)", async () =>
  assert.equal(await A.getByRole("button", { name: "Save judges" }).isDisabled(), false));
await A.getByRole("button", { name: "Save judges" }).click();
await A.waitForTimeout(900);
await check("after Save the roster matches the suggestion exactly", async () => {
  assert.deepEqual(judgesIn("K-5"),  [1,2,3],          "K-5 "  + judgesIn("K-5"));
  assert.deepEqual(judgesIn("6-8"),  [4,5,6,7,8,9,10], "6-8 "  + judgesIn("6-8"));
  assert.deepEqual(judgesIn("9-12"), [11,12,13,14,15], "9-12 " + judgesIn("9-12"));
});
await check("the comment-only departments went to the lightest block (K-5's judges)", async () => {
  assert.deepEqual(judgesIn("PreK"), [1,2,3]);
  assert.deepEqual(judgesIn("SPED"), [1,2,3]);
});
await check("every scored department has at least 3 judges, so 3 scores is reachable", async () => {
  for (const d of ["K-5","6-8","9-12"]) assert.ok(judgesIn(d).length >= 3, d);
});
await check("all 15 numbers are used and none is left empty", async () => {
  const used = new Set(store.judge_roster.map(r => r.judge_number));
  assert.deepEqual([...used].sort((a,b)=>a-b), Array.from({length:15},(_,i)=>i+1));
});

console.log("\n── The grid itself shows each judge's load and time");
await check("the grid has an 'About' column with a time next to the project count", async () => {
  // innerText() on <thead> truncates here (the department cells hold selects) — read the cells.
  const head = await A.locator(".roster-tbl thead th").allInnerTexts();
  assert.ok(head.some(h => /ABOUT/i.test(h)), "no About column in: " + JSON.stringify(head));
  // By class, never by column position — adding this very column broke two suites that
  // read the row with td.last().
  const r4 = A.locator(".roster-tbl tbody tr", { hasText: "Judge 4" }).first();
  assert.match((await r4.locator("td.roster-load").innerText()).trim(), /\d/, "no project count");
  assert.match((await r4.locator("td.roster-time").innerText()).trim(), /h|min/, "no time beside it");
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|Failed to load resource|mock\.supabase\.co|Failed to fetch|_vercel\/insights/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
