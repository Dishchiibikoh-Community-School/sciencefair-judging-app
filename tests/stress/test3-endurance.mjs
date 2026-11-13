// TEST 3 - ENDURANCE: steady scoring for 30 minutes, watching for drift.
//
//   node tests/stress/previewserver.mjs      (in one terminal)
//   node tests/stress/reset.mjs && node tests/stress/test3-endurance.mjs
//   takes 30 minutes of real time
//
// A fair runs for three to four hours. Short tests cannot show the failures that matter over
// that span - memory climbing on a tablet that is never reloaded, event listeners or Realtime
// channels accumulating, latency drifting upward as connections pile up.
//
// So: 15 judges score steadily through Node (the real RPCs), while TWO real browser pages sit
// open the whole time - one judge's tablet and one admin-style page subscribed to Realtime.
// Every minute it samples the browser's JS heap, DOM node count, listener count and live
// WebSocket count, plus write latency. At the end it compares the first third with the last
// third, because a leak shows as a trend, not a number.
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { banner, rest } from "./env.mjs";
import { manifest, signIn, resetJudges, submitOne, stats, fmt } from "./loadlib.mjs";
import { launch, newJudgePage, deviceState, DEVICES } from "./browserlib.mjs";

const BASE = "http://localhost:5200";
const MINUTES = Number(process.env.STRESS_MINUTES || 30);
const c = banner(`TEST 3 - ENDURANCE (${MINUTES} minutes of steady scoring)`);
const m = manifest();
const report = { test: "3-endurance", ref: c.ref, minutes: MINUTES, startedAt: new Date().toISOString(), samples: [], cases: [] };
let fails = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
  if (!ok) fails++;
  report.cases.push({ name, verdict: ok ? "PASS" : "FAIL", detail: String(detail) });
};

// ── judges on the API side ───────────────────────────────────────────────────────────
await resetJudges(c, m);
const si = await signIn(c, m, m.judgeNumbers.slice(0, 15));
console.log(`\n${si.judges.length} judges signed in for the steady load`);

// ── a real tablet left open the whole time ───────────────────────────────────────────
const browser = await launch();
const { ctx, page } = await newJudgePage(browser, DEVICES.iPad);
await page.goto(`${BASE}/s/stress-test-fair`, { waitUntil: "domcontentloaded" });
await page.locator(".role-card").first().click();
await page.locator('input[placeholder="e.g. 7"]').fill("25");
await page.locator('input[placeholder="Event invite code"]').fill("STRESS26");
await page.getByRole("button", { name: /Enter as Judge/ }).click();
await page.locator(".proj-item").first().waitFor({ timeout: 30000 });
const cdp = await ctx.newCDPSession(page);
await cdp.send("Performance.enable");
console.log(`A judge's tablet is open and will stay open for the whole run`);

// ── an admin-style Realtime subscriber, like a dashboard left on a laptop ────────────
const supabase = createClient(c.url, c.key);
let events = 0, rtStatus = "none";
const channel = supabase
  .channel(`school-${m.schoolId}`)
  .on("postgres_changes", { event: "*", schema: "public", table: "scores", filter: `school_id=eq.${m.schoolId}` }, () => { events++; });
await new Promise((res) => { channel.subscribe((s) => { rtStatus = s; if (s === "SUBSCRIBED") res(); }); setTimeout(res, 10000); });
console.log(`Realtime dashboard: ${rtStatus}\n`);

const metrics = async () => {
  const got = await cdp.send("Performance.getMetrics");
  const map = Object.fromEntries(got.metrics.map((x) => [x.name, x.value]));
  const sockets = await page.evaluate(() => (window.__wsCount === undefined ? -1 : window.__wsCount)).catch(() => -1);
  return {
    heapMB: +(map.JSHeapUsedSize / 1048576).toFixed(1),
    nodes: map.Nodes, listeners: map.JSEventListeners, docs: map.Documents, sockets,
  };
};

// Count live WebSockets inside the page so a leaking channel would show up.
await page.evaluate(() => {
  window.__wsCount = 0;
  const W = window.WebSocket;
  window.WebSocket = function (...a) {
    const s = new W(...a);
    window.__wsCount++;
    s.addEventListener("close", () => { window.__wsCount--; });
    return s;
  };
  window.WebSocket.prototype = W.prototype;
});

// ── the steady load ──────────────────────────────────────────────────────────────────
// Each judge submits roughly every 25 s, which is faster than a real 7-minute round but
// keeps a continuous trickle of writes and Realtime traffic for the whole window.
const started = Date.now();
const endAt = started + MINUTES * 60000;
const latencies = [];
let writes = 0, errors = 0, minute = 0;

const workers = si.judges.map(async (sess, i) => {
  await new Promise((r) => setTimeout(r, i * 900));         // stagger the start
  let k = 0;
  while (Date.now() < endAt) {
    const pid = sess.projects[k++ % sess.projects.length];
    const r = await submitOne(c, m, sess, pid, 0.4 + ((k % 5) * 0.1));
    latencies.push({ t: Date.now() - started, ms: r.ms, ok: r.ok });
    if (r.ok) writes++; else errors++;
    await new Promise((res) => setTimeout(res, 25000));
  }
});

const sampler = (async () => {
  const first = await metrics();
  report.samples.push({ minute: 0, ...first, writes: 0, events: 0 });
  console.log(`  min  0   heap ${String(first.heapMB).padStart(6)} MB   nodes ${String(first.nodes).padStart(5)}   listeners ${String(first.listeners).padStart(4)}   sockets ${first.sockets}`);
  while (Date.now() < endAt) {
    await new Promise((r) => setTimeout(r, 60000));
    if (Date.now() > endAt + 1000) break;
    minute++;
    const s = await metrics().catch(() => null);
    if (!s) continue;
    report.samples.push({ minute, ...s, writes, events });
    if (minute % 5 === 0 || minute === 1) {
      console.log(`  min ${String(minute).padStart(2)}   heap ${String(s.heapMB).padStart(6)} MB   nodes ${String(s.nodes).padStart(5)}   listeners ${String(s.listeners).padStart(4)}   sockets ${s.sockets}   writes ${writes}   rt-events ${events}`);
    }
  }
})();

await Promise.all([...workers, sampler]);
await page.waitForTimeout(3000);
const final = await metrics();
report.samples.push({ minute: MINUTES, ...final, writes, events });

// ── verdicts: a leak is a TREND, so compare the first third with the last third ──────
console.log(`\n${"─".repeat(72)}\nResults after ${MINUTES} minutes`);
const third = Math.max(1, Math.floor(report.samples.length / 3));
const head = report.samples.slice(0, third), tail = report.samples.slice(-third);
const avg = (arr, k) => arr.reduce((a, b) => a + (b[k] || 0), 0) / arr.length;

const heap0 = avg(head, "heapMB"), heap1 = avg(tail, "heapMB");
const nodes0 = avg(head, "nodes"), nodes1 = avg(tail, "nodes");
const lis0 = avg(head, "listeners"), lis1 = avg(tail, "listeners");

const early = latencies.filter((l) => l.t < MINUTES * 60000 / 3 && l.ok).map((l) => l.ms);
const late = latencies.filter((l) => l.t > MINUTES * 60000 * 2 / 3 && l.ok).map((l) => l.ms);
const sE = stats(early), sL = stats(late);

console.log(`  writes        ${writes} ok, ${errors} failed`);
console.log(`  realtime      ${events} events delivered to the dashboard`);
console.log(`  latency early ${fmt(sE)}`);
console.log(`  latency late  ${fmt(sL)}`);
console.log(`  heap          ${heap0.toFixed(1)} MB -> ${heap1.toFixed(1)} MB`);
console.log(`  dom nodes     ${nodes0.toFixed(0)} -> ${nodes1.toFixed(0)}`);
console.log(`  listeners     ${lis0.toFixed(0)} -> ${lis1.toFixed(0)}`);
console.log(`  sockets       ${final.sockets} open at the end\n`);

check("no write errors over the whole run", errors === 0, `${errors} of ${writes + errors}`);
check("memory did not climb more than 50 %", heap1 <= heap0 * 1.5, `${heap0.toFixed(1)} -> ${heap1.toFixed(1)} MB`);
check("DOM nodes did not climb more than 50 %", nodes1 <= nodes0 * 1.5, `${nodes0.toFixed(0)} -> ${nodes1.toFixed(0)}`);
check("event listeners did not climb more than 50 %", lis1 <= lis0 * 1.5, `${lis0.toFixed(0)} -> ${lis1.toFixed(0)}`);
check("WebSocket connections did not accumulate", final.sockets <= 2, `${final.sockets} open`);
check("write latency did not drift upward", sL.p50 <= Math.max(sE.p50 * 2, sE.p50 + 200), `median ${sE.p50} -> ${sL.p50} ms`);
check("the Realtime dashboard kept receiving events", events > 0, `${events} events`);
const dev = await deviceState(page);
check("the open tablet has nothing stranded", dev.queue.length === 0, `queue ${dev.queue.length}`);

await supabase.removeChannel(channel);
await browser.close();
report.fails = fails;
report.writes = writes; report.errors = errors; report.realtimeEvents = events;
report.latencyEarly = sE; report.latencyLate = sL;
report.finishedAt = new Date().toISOString();
writeFileSync(new URL("./out/test3-endurance.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(`\n${fails === 0 ? "TEST 3 PASS" : `TEST 3 - ${fails} check(s) FAILED`}`);
console.log(`Raw numbers: tests/stress/out/test3-endurance.json`);
console.log(`Production (evrupqnhgrfltfhafeyj) was not contacted.`);
process.exit(0);
