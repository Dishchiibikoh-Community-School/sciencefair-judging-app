// Browser E2E — "minimum score to place" (app_settings.min_place_pct, rule 72).
// A project must average at least N% of ITS OWN maximum to take 1st/2nd/3rd. Below that it
// still appears in the results with its real score; it just gets no medal and no podium slot.
// Checks: off by default · the Setup control saves · the medal MOVES to the next qualifying
// project (it is not simply removed) · exactly on the threshold still places · the below-minimum
// project is still listed · admin leaderboard marks it · deliberation warns but never blocks.
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

// ── Three scored projects in one department, under the 42-point default rubric ──
// 42 = 100% · 21 = exactly 50% (the boundary) · 14 = 33% (below a 50% minimum).
const MAXED = { presentation:6, testable_q:3, background:3, hypothesis:3, variables:3, materials:3, data:6, analysis:6, conclusion:3, abstract:6 };
const HALF  = { presentation:6, testable_q:3, background:3, hypothesis:3, variables:3, materials:3 };          // 21
const LOW   = { presentation:2, testable_q:2, background:2, hypothesis:2, variables:2, materials:2, data:2 };  // 14

const store = freshStore();
const now = new Date().toISOString();
store.projects = [
  { id:"p_top",  school_id:SID, num:"001", title:"Top Tomatoes",  cat:"Life Science", grade:"8", locked:false, department_id:DEPTS.D_MID, room:"", description:"", motivation:"", created_at:now },
  { id:"p_edge", school_id:SID, num:"002", title:"Edge Ecology",  cat:"Life Science", grade:"8", locked:false, department_id:DEPTS.D_MID, room:"", description:"", motivation:"", created_at:now },
  { id:"p_low",  school_id:SID, num:"003", title:"Low Lanterns",  cat:"Life Science", grade:"8", locked:false, department_id:DEPTS.D_MID, room:"", description:"", motivation:"", created_at:now },
];
store.project_private = [];
store.judges = [{ id:"j_1", school_id:SID, alias:"Judge1", department_id:DEPTS.D_MID, department_ids:[DEPTS.D_MID], projects:["p_top","p_edge","p_low"], joined_at:now }];
store.scores = [
  { id:"s1", school_id:SID, judge_id:"j_1", project_id:"p_top",  criteria:MAXED, notes:"", submitted_at:now },
  { id:"s2", school_id:SID, judge_id:"j_1", project_id:"p_edge", criteria:HALF,  notes:"", submitted_at:now },
  { id:"s3", school_id:SID, judge_id:"j_1", project_id:"p_low",  criteria:LOW,   notes:"", submitted_at:now },
];
// freshStore already holds these keys — push a second row and the app reads the LAST one while
// a later find() edits the FIRST, so always set in place.
const setSetting = (k, v) => {
  const row = store.app_settings.find(r => r.key === k);
  if (row) row.value = v; else store.app_settings.push({ school_id: SID, key: k, value: v });
};
setSetting("results_finalized", "true");
setSetting("deliberation_open", "true");   // so the award dropdowns render later
// `expiry` is the string the app reads ("never" / "1h" / …), NOT an expires_at timestamp.
store.share_links = [{ id:"sl1", school_id:SID, token:"PUBTOKEN", title:"Results", show_rubric:false, created_at:now, expiry:"never", revoked_at:null }];

async function newPage(vp = { width: 1280, height: 1000 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  return page;
}
async function adminPage() {
  const page = await newPage();
  await page.goto(`${BASE}/s/test`);
  await page.locator(".role-card.adm").click();
  await page.locator("input[type=email]").fill("admin@test.edu");
  await page.locator("input[type=password]").fill("correct-horse");
  await page.keyboard.press("Enter");
  await page.locator(".adm-side").waitFor({ timeout: 8000 });
  return page;
}
const tab = (page, label) => page.locator(".nav-it", { hasText: label }).first().click();
// A reload drops the mock's session often enough that every suite re-signs in on the way back.
async function adminReload(page) {
  await page.reload();
  const side = page.locator(".adm-side");
  try { await side.waitFor({ timeout: 2500 }); }
  catch { await page.locator(".role-card.adm").click(); await side.waitFor({ timeout: 8000 }); }
}
const setting = (k) => store.app_settings.find(r => r.key === k)?.value;
// The medal shown beside a title in the public ranked table.
async function rankOf(page, title) {
  return (await page.locator(".res-row", { hasText: title }).locator(".res-rank").first().innerText()).trim();
}
const podiumTitles = (page) => page.locator(".podium-card .p-title").allInnerTexts();

console.log("\n── Off by default: the lowest score still takes a medal");
let P = await newPage({ width: 820, height: 1180 });
await P.goto(`${BASE}/s/test?token=PUBTOKEN`);
await P.getByText("Top Tomatoes").first().waitFor({ timeout: 8000 });
await check("with no minimum set, all three projects are on the podium", async () => {
  const t = await podiumTitles(P);
  assert.deepEqual([...t].sort(), ["Edge Ecology", "Low Lanterns", "Top Tomatoes"]);
});
await check("Low Lanterns (14 / 42 = 33%) holds the bronze", async () => assert.equal(await rankOf(P, "Low Lanterns"), "🥉"));

console.log("\n── Admin sets the minimum to 50%");
const A = await adminPage();
await tab(A, "Setup");
await A.locator("#min-place").waitFor({ timeout: 6000 });
await check("Setup shows the rule as off", () => A.locator("#min-place").getByText(/Off — any score can place/).waitFor({ timeout: 4000 }));
await A.locator("#min-place").getByRole("button", { name: /Change/ }).click();
await A.locator('#min-place input[aria-label="Minimum score to place, percent"]').fill("50");
await A.locator("#min-place").getByRole("button", { name: "Save" }).click();
await check("the percentage is saved to app_settings and confirmed on screen", async () => {
  await A.locator("#min-place").getByText(/at least 50%/).waitFor({ timeout: 5000 });
  assert.equal(setting("min_place_pct"), "50");
});
await check("Setup spells out what 50% means in points on the rubric in use", () =>
  A.locator("#min-place").getByText(/21 of 42/).waitFor({ timeout: 4000 }));

console.log("\n── Public results now withhold the medal");
P = await newPage({ width: 820, height: 1180 });
await P.goto(`${BASE}/s/test?token=PUBTOKEN`);
await P.getByText("Top Tomatoes").first().waitFor({ timeout: 8000 });
await check("the below-minimum project is off the podium; the other two remain", async () => {
  const t = await podiumTitles(P);
  assert.deepEqual([...t].sort(), ["Edge Ecology", "Top Tomatoes"]);
});
await check("Low Lanterns keeps its place in the list, with its real score and no medal", async () => {
  await P.getByText("Low Lanterns").first().waitFor({ timeout: 4000 });
  assert.equal(await rankOf(P, "Low Lanterns"), "3");          // position, not a medal
  const row = await P.locator(".res-row", { hasText: "Low Lanterns" }).innerText();
  assert.ok(row.includes("14.0"), "the real score is no longer shown: " + row);
});
await check("exactly on the threshold still places — 21.0 of 42 is 50%, so Edge Ecology keeps silver", async () =>
  assert.equal(await rankOf(P, "Edge Ecology"), "🥈"));
await check("the medals did not shift up — nobody is promoted into a vacancy", async () =>
  assert.equal(await rankOf(P, "Top Tomatoes"), "🥇"));

console.log("\n── Admin screens explain it");
await tab(A, "Overview");
await check("the leaderboard marks the project that cannot place", async () => {
  await A.locator(".adm-main").getByText("Low Lanterns").first().waitFor({ timeout: 6000 });
  const row = A.locator("tr", { hasText: "Low Lanterns" });
  assert.ok((await row.innerText()).includes("no place"), await row.innerText());
});
// The award editors only render while results are NOT finalized — the public-results checks
// above needed the opposite, so reopen the event now that they are done.
setSetting("results_finalized", "false");
await adminReload(A);
await tab(A, "Validation");
// Each deliberation block is one project. Walk the award dropdowns and pick the one whose
// own block mentions the project — index alone would break the moment ranking changes.
async function inBlockFor(locator, title) {
  for (let i = 0; i < await locator.count(); i++) {
    const text = await locator.nth(i).evaluate(el => el.closest("div[style*='border-top']")?.innerText || "");
    if (text.includes(title)) return locator.nth(i);
  }
  throw new Error(`nothing matching found in the block for ${title}`);
}
const awardSelectFor = (t) => inBlockFor(A.locator(".adm-main select"), t);
const saveAwardBtnFor = (t) => inBlockFor(A.getByRole("button", { name: /Save Award/ }), t);
await A.locator(".adm-main select").first().waitFor({ timeout: 8000 });
const lowSel = await awardSelectFor("Low Lanterns");
await lowSel.selectOption("1st Place");
await check("choosing 1st Place below the minimum WARNS, naming the score and the threshold in points", async () => {
  await A.getByText(/14\.0 is below the 50% minimum to place \(21 of 42\)/).waitFor({ timeout: 5000 });
});
await check("the warning does not block the save — Save Award stays usable", async () => {
  const btn = await saveAwardBtnFor("Low Lanterns");
  assert.equal(await btn.isDisabled(), false, "a warning must never become a block on event day");
});
await check("a qualifying project gets no warning for the same award", async () => {
  await (await awardSelectFor("Top Tomatoes")).selectOption("1st Place");
  await A.waitForTimeout(400);
  assert.equal(await A.getByText(/42\.0 is below/).count(), 0);
});

console.log("\n── Turning it back off restores every medal");
await tab(A, "Setup");
await A.locator("#min-place").getByRole("button", { name: /Change/ }).click();
await A.locator('#min-place input[aria-label="Minimum score to place, percent"]').fill("0");
await A.locator("#min-place").getByRole("button", { name: "Save" }).click();
await check("0 turns the rule off again", async () => {
  await A.locator("#min-place").getByText(/every project can place again/).waitFor({ timeout: 5000 });
  assert.equal(setting("min_place_pct"), "0");
});
P = await newPage({ width: 820, height: 1180 });
await P.goto(`${BASE}/s/test?token=PUBTOKEN`);
await P.getByText("Low Lanterns").first().waitFor({ timeout: 8000 });
await check("the bronze comes back", async () => assert.equal(await rankOf(P, "Low Lanterns"), "🥉"));

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|Failed to load resource|mock\.supabase\.co|Failed to fetch|_vercel\/insights/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
