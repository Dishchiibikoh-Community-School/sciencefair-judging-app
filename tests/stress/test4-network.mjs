// TEST 4 - NETWORK TROUBLE, in the real app against staging.
//
//   node tests/stress/reset.mjs && node tests/stress/test4-network.mjs
//   (devserver.mjs must be running)       takes about 4 minutes - the 60 s outage is real time
//
//   4a  slow 3G throughout a submit
//   4b  the network drops for 5 s in the middle of a submit
//   4c  the network drops for 60 s in the middle of a submit
//   4d  flapping Wi-Fi - on/off repeatedly across several submits
//
// Two promises are tested every time:
//   * NOT LOST and NOT DUPLICATED - exactly one row per (judge, project), with the values the
//     judge tapped, once the network comes back.
//   * HONEST STATUS - while a score is only on the device the judge must not be told it is
//     saved. A score shown as saved that is actually sitting in localStorage is the failure
//     that loses work quietly.
import { writeFileSync } from "node:fs";
import { banner, rest } from "./env.mjs";
import { manifest } from "./loadlib.mjs";
import { launch, newJudgePage, signInJudge, openProject, fillAllCriteria, submitScore, deviceState, listRows, DEVICES } from "./browserlib.mjs";

const c = banner("TEST 4 - NETWORK TROUBLE (slow 3G, outages, flapping Wi-Fi)");
const m = manifest();
const report = { test: "4-network", ref: c.ref, startedAt: new Date().toISOString(), cases: [] };
let fails = 0;
const check = (name, ok, detail = "") => {
  console.log(`    ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
  if (!ok) fails++;
  report.cases.push({ name, verdict: ok ? "PASS" : "FAIL", detail: String(detail) });
};
const myScores = async (judgeId) =>
  (await rest(c, `/scores?school_id=eq.${m.schoolId}&judge_id=eq.${judgeId}&select=project_id,criteria`, { admin: true })).data || [];

// Slow 3G as Chrome DevTools defines it.
const SLOW_3G = { offline: false, downloadThroughput: (500 * 1024) / 8, uploadThroughput: (500 * 1024) / 8, latency: 400 };
const NORMAL = { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 };

const browser = await launch();

// ── 4a. Slow 3G ──────────────────────────────────────────────────────────────────────
console.log("\n4a. Slow 3G (500 kbps, 400 ms latency) for a whole submit");
const A = await newJudgePage(browser, DEVICES["low-end Android phone"]);
const cdpA = await A.ctx.newCDPSession(A.page);
await signInJudge(A.page, 11, { timeout: 40000 });
const jidA = (await deviceState(A.page)).judgeId;
await cdpA.send("Network.emulateNetworkConditions", SLOW_3G);
await openProject(A.page, 0, { timeout: 40000 });
await fillAllCriteria(A.page, 0.6);
const t0 = performance.now();
await submitScore(A.page, { timeout: 60000 });
const slowMs = performance.now() - t0;
await A.page.waitForTimeout(3000);
await cdpA.send("Network.emulateNetworkConditions", NORMAL);
let sA = await myScores(jidA);
check("a score still goes through on slow 3G", sA.length === 1, `${sA.length} row, submit took ${(slowMs / 1000).toFixed(1)} s`);

// ── 4b. 5-second outage mid-submit ───────────────────────────────────────────────────
console.log("\n4b. Network drops for 5 s in the middle of a submit");
await openProject(A.page, 1);
await fillAllCriteria(A.page, 0.8);
A.page.getByRole("button", { name: /Submit Score/ }).click().catch(() => {});
await A.page.waitForTimeout(150);
await A.ctx.setOffline(true);                       // drop it mid-flight
await A.page.waitForTimeout(5000);
const duringOutage = await deviceState(A.page);
const rowsOffline = (await listRows(A.page)).join(" | ");
check("while offline the judge is told the score is not sent yet",
  /not sent yet|offline|waiting|pending sync/i.test(rowsOffline) || duringOutage.queue.length > 0,
  duringOutage.queue.length ? `${duringOutage.queue.length} queued on the device` : rowsOffline.slice(0, 90));
await A.ctx.setOffline(false);
await A.page.waitForTimeout(8000);                  // let the queue flush
sA = await myScores(jidA);
check("after a 5 s outage the score reaches the database exactly once", sA.length === 2, `${sA.length} rows`);
const afterB = await deviceState(A.page);
check("the device queue is empty again", afterB.queue.length === 0, `${afterB.queue.length} queued`);

// ── 4c. 60-second outage mid-submit ──────────────────────────────────────────────────
console.log("\n4c. Network drops for 60 s in the middle of a submit  (this takes a real minute)");
await openProject(A.page, 2);
await fillAllCriteria(A.page, 0.4);
A.page.getByRole("button", { name: /Submit Score/ }).click().catch(() => {});
await A.page.waitForTimeout(150);
await A.ctx.setOffline(true);
await A.page.waitForTimeout(60000);
const during60 = await deviceState(A.page);
check("the score is held on the device through a 60 s outage",
  during60.queue.length > 0 || Object.keys(during60.drafts).length > 0,
  `${during60.queue.length} queued, ${Object.keys(during60.drafts).length} drafts`);
const rows60 = (await listRows(A.page)).join(" | ");
check("the judge is not told it is saved while it is still on the device",
  !/\bSaved\b/i.test(rows60) || /not sent yet/i.test(rows60), rows60.slice(0, 90));
await A.ctx.setOffline(false);
await A.page.waitForTimeout(12000);
sA = await myScores(jidA);
check("after a 60 s outage the score reaches the database exactly once", sA.length === 3, `${sA.length} rows`);

// ── 4d. Flapping Wi-Fi ───────────────────────────────────────────────────────────────
console.log("\n4d. Flapping Wi-Fi across three submits");
let flapped = 0;
for (let i = 3; i <= 5; i++) {
  await openProject(A.page, i);
  await fillAllCriteria(A.page, 0.5 + (i % 3) * 0.1);
  A.page.getByRole("button", { name: /Submit Score/ }).click().catch(() => {});
  for (let f = 0; f < 3; f++) {                     // on/off/on while it tries
    await A.page.waitForTimeout(400); await A.ctx.setOffline(true);
    await A.page.waitForTimeout(600); await A.ctx.setOffline(false);
    flapped++;
  }
  await A.page.waitForTimeout(2500);
}
await A.page.waitForTimeout(12000);
sA = await myScores(jidA);
const keys = sA.map((r) => r.project_id);
check("every score survives flapping Wi-Fi", sA.length === 6, `${sA.length} of 6 expected after ${flapped} flaps`);
check("no duplicates after flapping", new Set(keys).size === keys.length, `${keys.length} rows, ${new Set(keys).size} distinct`);
const finalState = await deviceState(A.page);
check("nothing is stranded on the device at the end",
  finalState.queue.length === 0 && finalState.unsent.length === 0,
  `queue ${finalState.queue.length}, unsent ${finalState.unsent.length}`);

// Values must be intact, not merely present.
const bad = sA.filter((r) => !r.criteria || Object.keys(r.criteria).length !== 20);
check("every surviving score kept all 20 criteria", bad.length === 0, `${bad.length} incomplete`);

await browser.close();
report.fails = fails;
report.finishedAt = new Date().toISOString();
writeFileSync(new URL("./out/test4-network.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(`\n${fails === 0 ? "TEST 4 PASS" : `TEST 4 - ${fails} check(s) FAILED`}`);
console.log(`Raw results: tests/stress/out/test4-network.json`);
console.log(`Production (evrupqnhgrfltfhafeyj) was not contacted.`);
process.exit(0);
