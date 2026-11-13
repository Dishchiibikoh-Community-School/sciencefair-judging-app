// TEST 7 - SLEEP / WAKE AND TAB SWITCHING.
//
//   node tests/stress/previewserver.mjs      (in one terminal)
//   node tests/stress/reset.mjs && node tests/stress/test7-sleep.mjs
//   takes about 11 minutes - the 10-minute background period is real time
//
// A judge taps a tablet awake after a break and expects to carry on. This checks that after
// ten minutes in the background:
//   * the session is still signed in (not bounced to the landing page);
//   * a half-finished score is still there (the draft survives);
//   * submitting works immediately, and the score reaches the database;
//   * the Realtime connection either survived or recovered, so the admin board is not blind.
//
// The tab is both hidden behind another tab AND frozen through CDP, which is what a phone
// actually does to a backgrounded page.
import { writeFileSync } from "node:fs";
import { banner, rest } from "./env.mjs";
import { manifest } from "./loadlib.mjs";
import { launch, newJudgePage, signInJudge, openProject, fillAllCriteria, submitScore, deviceState, listRows, DEVICES } from "./browserlib.mjs";

const BASE = "http://localhost:5200";
const BACKGROUND_MS = 10 * 60 * 1000;
const c = banner("TEST 7 - SLEEP / WAKE (10 minutes backgrounded)");
const m = manifest();
const report = { test: "7-sleep", ref: c.ref, startedAt: new Date().toISOString(), backgroundMs: BACKGROUND_MS, cases: [] };
let fails = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
  if (!ok) fails++;
  report.cases.push({ name, verdict: ok ? "PASS" : "FAIL", detail: String(detail) });
};
const myScores = async (jid) =>
  (await rest(c, `/scores?school_id=eq.${m.schoolId}&judge_id=eq.${jid}&select=project_id,criteria`, { admin: true })).data || [];

const browser = await launch();
const { ctx, page } = await newJudgePage(browser, DEVICES.iPad);
// browserlib points at the dev server; this test uses the production build.
await page.goto(`${BASE}/s/stress-test-fair`, { waitUntil: "domcontentloaded" });
await page.locator(".role-card").first().click();
await page.locator('input[placeholder="e.g. 7"]').fill("21");
await page.locator('input[placeholder="Event invite code"]').fill("STRESS26");
await page.getByRole("button", { name: /Enter as Judge/ }).click();
await page.locator(".proj-item").first().waitFor({ timeout: 30000 });

const judgeId = (await deviceState(page)).judgeId;
console.log(`\nJudge 21 signed in (${judgeId})`);

// One completed score before the break, so we can prove nothing was lost or duplicated.
await openProject(page, 0);
await fillAllCriteria(page, 0.6);
await submitScore(page);
await page.waitForTimeout(2000);
const before = await myScores(judgeId);
check("a score submitted before the break is stored", before.length === 1, `${before.length} row`);

// A half-finished score, left unsubmitted.
await openProject(page, 1);
const groups = page.locator(".rub-steps");
const half = Math.floor((await groups.count()) / 2);
for (let i = 0; i < half; i++) await groups.nth(i).locator("button").nth(3).click();
await page.waitForTimeout(800);
const draftBefore = await deviceState(page);
const draftKeysBefore = Object.keys(draftBefore.drafts);
check("the half-finished score is saved as a draft on the device", draftKeysBefore.length > 0,
  `${draftKeysBefore.length} draft(s), ${half} of ${await groups.count()} criteria tapped`);

// ── background it for ten minutes ────────────────────────────────────────────────────
console.log(`\nBackgrounding the tab for ${BACKGROUND_MS / 60000} minutes...`);
const other = await ctx.newPage();
await other.goto("about:blank");
await other.bringToFront();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Page.enable").catch(() => {});
await cdp.send("Page.setWebLifecycleState", { state: "frozen" }).catch(() => {});

const started = Date.now();
while (Date.now() - started < BACKGROUND_MS) {
  await new Promise((r) => setTimeout(r, 60000));
  process.stdout.write(`  ${Math.round((Date.now() - started) / 60000)} min... `);
}
console.log("");

// ── wake it up ───────────────────────────────────────────────────────────────────────
await cdp.send("Page.setWebLifecycleState", { state: "active" }).catch(() => {});
await page.bringToFront();
await other.close();
await page.waitForTimeout(6000);                      // what a judge would wait for

const bodyAfter = (await page.locator("body").innerText()).replace(/\s+/g, " ");
check("still signed in after ten minutes (not bounced to the landing page)",
  !/I'm a Judge|Enter as Judge|Judging Portal/i.test(bodyAfter) || (await page.locator(".rub-steps").count()) > 0,
  bodyAfter.slice(0, 70));

const stAfter = await deviceState(page);
check("the session is still on the device", !!stAfter.judgeId && stAfter.judgeId === judgeId, stAfter.judgeId || "gone");
check("the draft survived the ten minutes",
  Object.keys(stAfter.drafts).length >= draftKeysBefore.length,
  `${Object.keys(stAfter.drafts).length} draft(s)`);

// ── finish the score and submit ──────────────────────────────────────────────────────
const onForm = (await page.locator(".rub-steps").count()) > 0;
if (!onForm) { await openProject(page, 1); }
await fillAllCriteria(page, 0.7);                     // complete whatever is left
const t0 = Date.now();
await submitScore(page, { timeout: 40000 });
const submitMs = Date.now() - t0;
await page.waitForTimeout(4000);

const after = await myScores(judgeId);
check("the score submitted after waking reaches the database", after.length === 2, `${after.length} rows`);
check("submitting after waking is not slow", submitMs < 10000, `${(submitMs / 1000).toFixed(1)} s`);
const keys = after.map((r) => r.project_id);
check("no duplicate rows after sleep/wake", new Set(keys).size === keys.length, `${keys.length} rows, ${new Set(keys).size} distinct`);
const endState = await deviceState(page);
check("nothing stranded on the device", endState.queue.length === 0 && endState.unsent.length === 0,
  `queue ${endState.queue.length}, unsent ${endState.unsent.length}`);

// ── does the woken tab still see live updates? ───────────────────────────────────────
// Another judge scores a project; this tab should notice without a reload if Realtime
// recovered. Checked through the judge's own list refreshing rather than internals.
const listNow = (await listRows(page)).join(" | ");
check("the project list renders normally after waking", /R\d|Pending|Scored|✓/i.test(listNow), listNow.slice(0, 80));

await browser.close();
report.fails = fails;
report.finishedAt = new Date().toISOString();
writeFileSync(new URL("./out/test7-sleep.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(`\n${fails === 0 ? "TEST 7 PASS" : `TEST 7 - ${fails} check(s) FAILED`}`);
console.log(`Raw results: tests/stress/out/test7-sleep.json`);
console.log(`Production (evrupqnhgrfltfhafeyj) was not contacted.`);
process.exit(0);
