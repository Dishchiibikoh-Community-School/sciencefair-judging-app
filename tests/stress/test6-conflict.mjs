// TEST 6 - CONFLICT AND INTEGRITY, in the real app against staging.
//
//   node tests/stress/reset.mjs && node tests/stress/test6-conflict.mjs
//   (devserver.mjs must be running)
//
//   6a  two judges score the SAME project at the same time
//   6b  one judge number on TWO devices
//   6c  double-tapping Submit
//   6d  refreshing the page in the middle of a submit
//   6e  the browser Back button straight after a submit
//
// After each, the database is read back and compared with what the judge actually entered.
// The question is never "did the UI look right" but "is the stored score exactly what was
// tapped, exactly once".
import { writeFileSync } from "node:fs";
import { banner, rest } from "./env.mjs";
import { manifest } from "./loadlib.mjs";
import { launch, newJudgePage, signInJudge, openProject, fillAllCriteria, submitScore, deviceState, listRows, DEVICES } from "./browserlib.mjs";

const c = banner("TEST 6 - CONFLICT AND INTEGRITY (real app, real staging database)");
const m = manifest();
const report = { test: "6-conflict", ref: c.ref, startedAt: new Date().toISOString(), cases: [] };
let fails = 0;
const check = (name, ok, detail = "") => {
  console.log(`    ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
  if (!ok) fails++;
  report.cases.push({ name, verdict: ok ? "PASS" : "FAIL", detail: String(detail) });
};
const scoresFor = async (pid) =>
  (await rest(c, `/scores?school_id=eq.${m.schoolId}&project_id=eq.${pid}&select=judge_id,project_id,criteria,notes,submitted_at`, { admin: true })).data || [];
const allScores = async () =>
  (await rest(c, `/scores?school_id=eq.${m.schoolId}&select=judge_id,project_id`, { admin: true })).data || [];

const browser = await launch();

// ── 6a. Two judges, same project, at the same moment ─────────────────────────────────
// Judges 7 and 8 are both 6-8 judges; the round-robin schedule gives them overlapping
// projects, so there is a project they can legitimately both score.
console.log("\n6a. Two judges scoring the SAME project simultaneously");
const A = await newJudgePage(browser, DEVICES.iPad);
const B = await newJudgePage(browser, DEVICES["low-end Android phone"]);
await signInJudge(A.page, 7);
await signInJudge(B.page, 8);

const rowsA = await listRows(A.page), rowsB = await listRows(B.page);
const codeOf = (s) => (s.match(/G68-[A-Z]+-\d+/) || [])[0];
const sharedCode = rowsA.map(codeOf).find((x) => x && rowsB.map(codeOf).includes(x));
const idxA = rowsA.findIndex((r) => codeOf(r) === sharedCode);
const idxB = rowsB.findIndex((r) => codeOf(r) === sharedCode);
const sharedProj = m.projects.find((p) => `G68-${""}`.length && rowsA[idxA].includes(p.num));
console.log(`    both judges have ${sharedCode} (judge 7 slot ${idxA + 1}, judge 8 slot ${idxB + 1})`);

await openProject(A.page, idxA);
await openProject(B.page, idxB);
await fillAllCriteria(A.page, 0.75);
await fillAllCriteria(B.page, 0.25);
await Promise.all([submitScore(A.page), submitScore(B.page)]);
await new Promise((r) => setTimeout(r, 1500));

const pid = sharedProj?.id || m.projects.find((p) => rowsA[idxA].includes(p.num))?.id;
const both = await scoresFor(pid);
check("both judges' scores are stored", both.length === 2, `${both.length} rows for ${sharedCode}`);
check("they are two DIFFERENT judges", new Set(both.map((r) => r.judge_id)).size === 2);
check("the two scores kept their own values (neither overwrote the other)",
  both.length === 2 && JSON.stringify(both[0].criteria) !== JSON.stringify(both[1].criteria),
  both.length === 2 ? `totals ${both.map((r) => Object.values(r.criteria).reduce((a, b) => a + Number(b), 0)).join(" vs ")}` : "");

// ── 6b. One judge number on two devices ──────────────────────────────────────────────
console.log("\n6b. The same judge number signing in on a SECOND device");
const C = await newJudgePage(browser, DEVICES["iPhone (Safari viewport)"]);
let secondDeviceRefused = false, refusalText = "";
try {
  await signInJudge(C.page, 7, { timeout: 8000 });
} catch {
  secondDeviceRefused = true;
  // Take the whole sentence pair: the message ends with the instruction, and an earlier
  // version of this test cut it at the first full stop and wrongly reported a failure.
  const body = (await C.page.locator("body").innerText()).replace(/\s+/g, " ");
  refusalText = body.match(/[^.!?]*already signed in[^]{0,120}/i)?.[0]?.trim() || "";
}
check("a second device is refused for a judge already signed in", secondDeviceRefused, refusalText.slice(0, 80));
check("the refusal tells the judge what to do (ask for a transfer)", /transfer/i.test(refusalText), refusalText.slice(0, 80));

// ── 6c. Double-tapping Submit ────────────────────────────────────────────────────────
console.log("\n6c. Double-tapping Submit Score");
const beforeDbl = (await allScores()).length;
await openProject(A.page, (idxA + 1) % (await A.page.locator(".proj-item").count()));
await fillAllCriteria(A.page, 0.5);
const dblBtn = A.page.getByRole("button", { name: /Submit Score/ });
await dblBtn.click({ force: true });
await dblBtn.click({ force: true }).catch(() => {});        // second tap, may already be gone
await A.page.waitForTimeout(2500);
const afterDbl = (await allScores()).length;
check("a double tap creates exactly one new score row", afterDbl - beforeDbl === 1, `${beforeDbl} -> ${afterDbl}`);

// ── 6d. Refresh in the middle of a submit ────────────────────────────────────────────
// The request is delayed server-side so the reload lands while it is genuinely in flight.
console.log("\n6d. Refreshing the page mid-submit");
const D = await newJudgePage(browser, DEVICES.iPad);
await signInJudge(D.page, 9);
const pendingRow = (await listRows(D.page))[0];      // captured on the LIST, before opening
await openProject(D.page, 0);
const nCrit = await fillAllCriteria(D.page, 0.8);
await D.page.route("**/rest/v1/rpc/submit_score", async (route) => {
  await new Promise((r) => setTimeout(r, 3000));            // hold it in flight
  await route.continue();
});
D.page.getByRole("button", { name: /Submit Score/ }).click().catch(() => {});
await D.page.waitForTimeout(700);
await D.page.reload({ waitUntil: "domcontentloaded" });     // refresh WHILE it is in flight
await D.page.locator(".proj-item").first().waitFor({ timeout: 20000 });
await D.page.waitForTimeout(3000);
const stD = await deviceState(D.page);
const firstPid = m.projects.find((p) => pendingRow.includes(p.num))?.id;
const afterRefresh = await scoresFor(firstPid);
check("the score is not silently lost by a mid-submit refresh",
  afterRefresh.length >= 1 || stD.queue.length > 0 || Object.keys(stD.drafts).length > 0,
  `stored ${afterRefresh.length}, queued ${stD.queue.length}, drafts ${Object.keys(stD.drafts).length}`);
// Must be scoped to THIS judge: other judges legitimately score the same project, and an
// earlier version of this check counted their rows and reported a false duplicate.
const mineAfterRefresh = afterRefresh.filter((r) => r.judge_id === stD.judgeId);
check("no duplicate row for that judge and project", mineAfterRefresh.length <= 1,
  `${mineAfterRefresh.length} row(s) for this judge, ${afterRefresh.length} for the project across all judges`);
check("the form had all criteria filled before the refresh", nCrit > 0, `${nCrit} criteria`);

// ── 6e. Back button straight after a submit ──────────────────────────────────────────
console.log("\n6e. Browser Back immediately after a submit");
await D.page.unroute("**/rest/v1/rpc/submit_score");
const beforeBack = (await allScores()).length;
await openProject(D.page, 1);
await fillAllCriteria(D.page, 0.4);
await submitScore(D.page);
await D.page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
await D.page.waitForTimeout(2000);
const afterBack = (await allScores()).length;
check("Back after submitting does not create a second score", afterBack - beforeBack <= 1, `${beforeBack} -> ${afterBack}`);
check("the judge is not thrown out of the app by Back",
  /Judge|Pending|Scored|project/i.test(await D.page.locator("body").innerText()), "still in the app");

// ── Whole-database integrity sweep ───────────────────────────────────────────────────
console.log("\nDatabase sweep");
const rows = await allScores();
const keys = rows.map((r) => `${r.judge_id}_${r.project_id}`);
check("no duplicate (judge, project) row anywhere", new Set(keys).size === keys.length,
  `${rows.length} rows, ${new Set(keys).size} distinct`);
const valid = await rest(c, `/scores?school_id=eq.${m.schoolId}&select=project_id,judge_id,criteria`, { admin: true });
const empty = (valid.data || []).filter((r) => !r.criteria || Object.keys(r.criteria).length === 0);
check("no score row stored with empty criteria", empty.length === 0, `${empty.length} empty`);

await browser.close();
report.finishedAt = new Date().toISOString();
report.fails = fails;
writeFileSync(new URL("./out/test6-conflict.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(`\n${fails === 0 ? "TEST 6 PASS" : `TEST 6 - ${fails} check(s) FAILED`}`);
console.log(`Raw results: tests/stress/out/test6-conflict.json`);
console.log(`Production (evrupqnhgrfltfhafeyj) was not contacted.`);
process.exit(0);
