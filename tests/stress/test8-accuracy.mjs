// TEST 8 - RESULTS ACCURACY UNDER LOAD.
//
//   node tests/stress/previewserver.mjs      (in one terminal)
//   node tests/stress/reset.mjs && node tests/stress/test8-accuracy.mjs
//
// Fills every project with scores from every judge the schedule assigns, then compares the
// numbers the APP PUTS ON SCREEN against an independent recomputation done here from the raw
// score rows. The point is to catch the app and this test disagreeing - if both used the
// app's own arithmetic the test would prove nothing, so the maths below is written from the
// rubric definition, not imported from the app.
//
// Comparison is made on the public results page, reached with a real share link, because
// that is the page the school actually publishes.
import { writeFileSync } from "node:fs";
import { banner, rest } from "./env.mjs";
import { manifest, signIn, resetJudges, scoreWave } from "./loadlib.mjs";
import { PRESETS } from "./fixtures.mjs";
import { launch, newJudgePage, SCHOOL, DEVICES } from "./browserlib.mjs";

const BASE = "http://localhost:5200";
const c = banner("TEST 8 - RESULTS ACCURACY (app on screen vs independent recomputation)");
const m = manifest();
const report = { test: "8-accuracy", ref: c.ref, startedAt: new Date().toISOString(), cases: [], projects: [] };
let fails = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
  if (!ok) fails++;
  report.cases.push({ name, verdict: ok ? "PASS" : "FAIL", detail: String(detail) });
};

// ── 1. Generate a full set of scores under concurrent load ───────────────────────────
console.log("\nFilling every scheduled visit with a score (all judges at once)...");
await resetJudges(c, m);
const si = await signIn(c, m, m.judgeNumbers);
const res = await scoreWave(c, m, si.judges, { pick: 0.65 });
console.log(`  ${res.filter((r) => r.ok).length} scores written, ${res.filter((r) => !r.ok).length} errors`);

// ── 2. Independent recomputation, from the raw rows ──────────────────────────────────
const rows = (await rest(c, `/scores?school_id=eq.${m.schoolId}&select=judge_id,project_id,criteria&limit=2000`, { admin: true })).data || [];
const byProject = new Map();
for (const r of rows) {
  const total = Object.values(r.criteria || {}).reduce((a, b) => a + Number(b), 0);
  if (!byProject.has(r.project_id)) byProject.set(r.project_id, []);
  byProject.get(r.project_id).push(total);
}
// Average to one decimal, the way the app displays it. Max comes from the project's own
// rubric (sum of each criterion's max), derived here from the preset, not from the app.
const expected = new Map();
for (const [pid, totals] of byProject) {
  const proj = m.projects.find((p) => p.id === pid);
  const preset = PRESETS[m.rubricByDept[proj.dept]];
  const max = preset.criteria.reduce((s, cr) => s + cr.max, 0);
  expected.set(pid, {
    num: proj.num, dept: proj.dept, reviews: totals.length,
    avg: (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1),
    max,
  });
}
console.log(`  recomputed ${expected.size} project averages independently`);

// ── 3. Publish results and read what the app actually shows ──────────────────────────
const token = `stress${Math.random().toString(36).slice(2, 12)}`;
await rest(c, "/app_settings", {
  method: "POST", admin: true, body: [{ school_id: m.schoolId, key: "results_finalized", value: "true" }],
  headers: { Prefer: "resolution=merge-duplicates" },
});
await rest(c, "/share_links", {
  method: "POST", admin: true,
  body: [{ school_id: m.schoolId, token, expiry: "never", show_rubric: true, title: "Stress Test Results" }],
});

const browser = await launch();
const { ctx, page } = await newJudgePage(browser, DEVICES.laptop);
await page.goto(`${BASE}/s/${SCHOOL}?token=${token}`, { waitUntil: "domcontentloaded" });
// Wait for the rows themselves, not a fixed delay: a timed wait raced the render and made
// an earlier run scrape an empty page.
await page.locator(".res-row").first().waitFor({ timeout: 45000 }).catch(() => {});
await page.waitForTimeout(1500);
const bodyText = (await page.locator("body").innerText()).replace(/ /g, " ");

check("the public results page opened with the share link",
  !/Link Unavailable|School Not Found/i.test(bodyText), bodyText.slice(0, 70).replace(/\n/g, " "));

// Read the actual elements rather than regexing row text. An earlier version matched the
// first decimal number in each row and picked up RUBRIC BREAKDOWN CHIPS (a criterion worth
// 7.5 on the elementary form) instead of the average, and reported 55 false mismatches.
// Extracted entirely inside the page, returning a plain {num: average} object. An earlier
// version marshalled intermediate objects out through evaluateAll and silently produced an
// empty map even though the rows were present; doing the parsing in one place in the page
// removes that whole class of problem and keeps one definition of "the average the app showed".
const shownObj = await page.evaluate(() => {
  const out = {};
  for (const row of document.querySelectorAll(".res-row")) {
    const title = row.querySelector(".res-title")?.textContent || "";
    const big = row.querySelector(".res-score-big")?.textContent || "";
    const num = (title.match(/(\d{3})/) || [])[1];
    const avg = (big.match(/(\d{1,3}(?:\.\d)?)/) || [])[1];
    if (num && avg && !(num in out)) out[num] = avg;
  }
  return out;
});
const shown = new Map(Object.entries(shownObj));

console.log(`  app displayed averages for ${shown.size} projects`);
if (shown.size === 0) {
  console.log(`  DEBUG res-row=${await page.locator(".res-row").count()} podium=${await page.locator(".podium-card").count()}`);
  console.log("  DEBUG body: " + bodyText.replace(/\s+/g, " ").slice(0, 600));
}

// ── 4. Compare, project by project ───────────────────────────────────────────────────
const mismatches = [];
let compared = 0;
for (const [pid, exp] of expected) {
  const got = shown.get(exp.num);
  if (got === undefined) continue;
  compared++;
  if (Math.abs(Number(got) - Number(exp.avg)) > 0.05) mismatches.push({ num: exp.num, dept: exp.dept, app: got, independent: exp.avg, reviews: exp.reviews });
  report.projects.push({ num: exp.num, dept: exp.dept, reviews: exp.reviews, independent: exp.avg, app: got, max: exp.max });
}
check("the app's averages were readable on the page", compared > 0, `${compared} projects compared`);
check("every displayed average matches the independent recomputation",
  mismatches.length === 0,
  mismatches.length ? `${mismatches.length} differ, e.g. ${JSON.stringify(mismatches.slice(0, 3))}` : `${compared} projects identical`);

// Ranking: within each department the order by average must match.
// Order the app actually rendered, read in the page for the same reason as above. This was
// returning an empty list, which made the ranking check pass without testing anything.
const order = await page.evaluate(() => [...document.querySelectorAll(".res-row")]
  .map((r) => ((r.querySelector(".res-title")?.textContent || "").match(/(\d{3})/) || [])[1])
  .filter(Boolean));
const byDept = {};
for (const [, e] of expected) (byDept[e.dept] ||= []).push(e);
// Tie-safe: within a department the averages must never INCREASE as you go down the list.
// Comparing against a sorted list of project numbers instead would fail spuriously whenever
// two projects share an average, which synthetic scores produce constantly - an earlier
// version did exactly that and reported 4 false failures.
let rankProblems = 0;
const deptOfNum = new Map([...expected.values()].map((e) => [e.num, e.dept]));
const outOfOrder = [];
for (const [dept, list] of Object.entries(byDept)) {
  const seq = order.filter((n) => deptOfNum.get(n) === dept).map((n) => Number(shown.get(n)));
  const bad = seq.findIndex((v, i) => i > 0 && v > seq[i - 1] + 0.001);
  if (bad > 0) { rankProblems++; outOfOrder.push(`${dept}: ${seq[bad - 1]} then ${seq[bad]}`); }
  report.cases.push({ name: `ranking order in ${dept}`, verdict: bad > 0 ? "FAIL" : "PASS", detail: seq.join(" >= ") });
}
check("the rendered order was actually readable (not a vacuous pass)", order.length > 0, `${order.length} rows in render order`);
check("displayed averages never increase down a department list", rankProblems === 0, rankProblems ? outOfOrder.join(" | ") : `${Object.keys(byDept).length} departments in order`);

check("no judge name appears on the public page",
  !/Judge\s*\d+/i.test(bodyText), (bodyText.match(/Judge\s*\d+/i) || ["none"])[0]);
console.log(`  (app order sample: ${order.slice(0, 8).join(", ")})`);

// ── 5. Put the fair back the way it was ──────────────────────────────────────────────
await rest(c, `/share_links?token=eq.${token}`, { method: "DELETE", admin: true });
await rest(c, "/app_settings", {
  method: "POST", admin: true, body: [{ school_id: m.schoolId, key: "results_finalized", value: "false" }],
  headers: { Prefer: "resolution=merge-duplicates" },
});

await browser.close();
report.fails = fails;
report.finishedAt = new Date().toISOString();
writeFileSync(new URL("./out/test8-accuracy.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(`\n${fails === 0 ? "TEST 8 PASS" : `TEST 8 - ${fails} check(s) FAILED`}`);
console.log(`Raw results: tests/stress/out/test8-accuracy.json`);
console.log(`Production (evrupqnhgrfltfhafeyj) was not contacted.`);
process.exit(0);
