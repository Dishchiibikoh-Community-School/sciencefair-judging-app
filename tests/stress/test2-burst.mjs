// TEST 2 - BURST: every judge submits inside the same few seconds (the end-of-round rush),
// while an admin dashboard is watching over Realtime.
//
//   node tests/stress/test2-burst.mjs
//
// Two bursts:
//   A. 30 judges each submit ONE score at the same instant - the realistic rush when a round
//      ends and every judge taps Submit at once.
//   B. 30 judges each dump their whole remaining list at once - the worst case, e.g. a row of
//      tablets coming back online together and flushing their offline queues.
//
// Alongside the write numbers this measures the part the app depends on but never tests:
// one Realtime channel per school fans EVERY score insert out to EVERY connected device, so
// the question is not only "were the writes accepted" but "did the dashboard see them all,
// and how far behind did it fall".
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { banner } from "./env.mjs";
import { manifest, signIn, resetJudges, submitOne, clearScores, verify, stats, fmt } from "./loadlib.mjs";

const c = banner("TEST 2 - BURST (simultaneous submits + Realtime fan-out)");
const m = manifest();
if (m.ref !== c.ref) throw new Error(`manifest was seeded against ${m.ref}, not ${c.ref}`);

// ── an "admin dashboard" watching the same channel the app opens ─────────────────────
const supabase = createClient(c.url, c.key, { realtime: { params: { eventsPerSecond: 100 } } });
const seen = new Map();                 // `${judge}_${project}` -> time the event arrived
let channelState = "none";

const channel = supabase
  .channel(`school-${m.schoolId}`)
  .on("postgres_changes", { event: "*", schema: "public", table: "scores", filter: `school_id=eq.${m.schoolId}` },
    (payload) => {
      const r = payload.new || {};
      if (r.judge_id && r.project_id) seen.set(`${r.judge_id}_${r.project_id}`, performance.now());
    });

await new Promise((resolve) => {
  channel.subscribe((status) => { channelState = status; if (status === "SUBSCRIBED") resolve(); });
  setTimeout(resolve, 10000);           // do not hang the test if Realtime never joins
});
console.log(`\nRealtime channel: ${channelState}`);
if (channelState !== "SUBSCRIBED") console.log(`  (fan-out numbers below are unreliable - the channel never joined)`);

// ── fresh sessions for all 30 ────────────────────────────────────────────────────────
await resetJudges(c, m);
const si = await signIn(c, m, m.judgeNumbers);
console.log(`Signed in ${si.judges.length} judges${si.errors.length ? ` (${si.errors.length} errors)` : ""}`);

const report = { test: "2-burst", ref: c.ref, startedAt: new Date().toISOString(), channelState, bursts: [] };

async function burst(name, pairs) {
  console.log(`\n${"─".repeat(72)}\n${name}  (${pairs.length} submits fired together)`);
  seen.clear();
  await clearScores(c, m);
  await new Promise((r) => setTimeout(r, 500));   // let the DELETE events drain

  const t0 = performance.now();
  const res = await Promise.all(pairs.map(({ sess, pid }) => submitOne(c, m, sess, pid)));
  const wall = (performance.now() - t0) / 1000;

  // Give Realtime a fair chance to deliver before judging it.
  await new Promise((r) => setTimeout(r, 4000));

  const ok = res.filter((r) => r.ok);
  const failed = res.filter((r) => !r.ok);
  const s = stats(ok.map((r) => r.ms));
  const integrity = await verify(c, m, res);
  const delivered = ok.filter((r) => seen.has(`${r.judgeId}_${r.pid}`)).length;

  console.log(`  submits     ${fmt(s)}`);
  console.log(`  burst time  ${wall.toFixed(2)} s   peak ${(pairs.length / wall).toFixed(1)} writes/sec`);
  console.log(`  errors      ${failed.length} of ${res.length}  (${((failed.length / res.length) * 100).toFixed(2)} %)`);
  if (failed.length) {
    const kinds = {};
    for (const f of failed) { const k = `${f.status} ${String(f.data?.message || f.data?.error || "").slice(0, 55)}`; kinds[k] = (kinds[k] || 0) + 1; }
    for (const [k, v] of Object.entries(kinds)) console.log(`                ${v} x  ${k}`);
  }
  console.log(`  integrity   missing ${integrity.missing.length} | altered ${integrity.altered.length} | duplicates ${integrity.duplicates}`);
  console.log(`  REALTIME    dashboard saw ${delivered} of ${ok.length} accepted writes` +
    `${ok.length ? `  (${((delivered / ok.length) * 100).toFixed(1)} %)` : ""}`);

  const writesOk = failed.length === 0 && integrity.missing.length === 0 && integrity.altered.length === 0 && integrity.duplicates === 0;
  const rtOk = channelState === "SUBSCRIBED" ? delivered === ok.length : null;
  console.log(`  VERDICT     writes ${writesOk ? "PASS" : "FAIL"}   realtime ${rtOk === null ? "NOT MEASURED" : rtOk ? "PASS" : "FAIL"}`);

  report.bursts.push({
    name, submits: res.length, wallSec: +wall.toFixed(2), peakPerSec: +(pairs.length / wall).toFixed(1),
    submit: s, errors: failed.length,
    errorKinds: failed.slice(0, 5).map((f) => ({ status: f.status, msg: String(f.data?.message || f.data?.error || "").slice(0, 120) })),
    integrity: { missing: integrity.missing.length, altered: integrity.altered.length, duplicates: integrity.duplicates },
    realtime: { accepted: ok.length, delivered, pct: ok.length ? +((delivered / ok.length) * 100).toFixed(1) : null },
    verdict: { writes: writesOk ? "PASS" : "FAIL", realtime: rtOk === null ? "NOT MEASURED" : rtOk ? "PASS" : "FAIL" },
  });
}

// A: one submit each, all at the same moment.
await burst("BURST A - end-of-round rush (1 score per judge)",
  si.judges.filter((j) => j.projects.length).map((sess) => ({ sess, pid: sess.projects[0] })));

// B: everything at once - the worst case.
await burst("BURST B - all queues flush at once (every judge's whole list)",
  si.judges.flatMap((sess) => sess.projects.map((pid) => ({ sess, pid }))));

await supabase.removeChannel(channel);
report.finishedAt = new Date().toISOString();
writeFileSync(new URL("./out/test2-burst.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(`\n${"─".repeat(72)}\nRaw numbers: tests/stress/out/test2-burst.json`);
console.log(`Production (evrupqnhgrfltfhafeyj) was not contacted.`);
process.exit(0);
