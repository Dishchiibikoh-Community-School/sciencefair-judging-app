// TEST 1 - LOAD RAMP: 10, then 20, then 30 judges scoring simultaneously.
//
//   node tests/stress/test1-ramp.mjs
//
// Measures, per wave: sign-in latency, score-submit latency (median and slowest 5%), error
// rate, and - separately - whether any acknowledged write is actually missing or altered in
// the database afterwards. An error rate of zero is not the same as no lost writes, so both
// are reported.
//
// Each wave: every judge works through their own scheduled list back to back, all judges
// running concurrently. Scores are cleared between waves so row counts are unambiguous.
import { writeFileSync } from "node:fs";
import { banner } from "./env.mjs";
import { manifest, signIn, scoreWave, clearScores, verify, stats, fmt } from "./loadlib.mjs";

const c = banner("TEST 1 - LOAD RAMP (10 / 20 / 30 judges scoring at once)");
const m = manifest();
if (m.ref !== c.ref) throw new Error(`manifest was seeded against ${m.ref}, not ${c.ref}`);

const WAVES = [10, 20, 30];
const report = { test: "1-ramp", ref: c.ref, startedAt: new Date().toISOString(), waves: [] };

for (const n of WAVES) {
  const numbers = m.judgeNumbers.slice(0, n);
  console.log(`\n${"─".repeat(72)}\nWAVE: ${n} judges`);

  const si = await signIn(c, m, numbers);
  if (si.errors.length) console.log(`  sign-in errors: ${JSON.stringify(si.errors.slice(0, 3))}`);
  if (si.times.length) console.log(`  sign-in     ${fmt(stats(si.times))}`);
  else console.log(`  sign-in     (sessions reused from the previous wave)`);

  await clearScores(c, m);

  const t0 = performance.now();
  const res = await scoreWave(c, m, si.judges);
  const wall = (performance.now() - t0) / 1000;

  const okMs = res.filter((r) => r.ok).map((r) => r.ms);
  const failed = res.filter((r) => !r.ok);
  const s = stats(okMs);
  const integrity = await verify(c, m, res);

  console.log(`  submits     ${fmt(s)}`);
  console.log(`  throughput  ${(res.length / wall).toFixed(1)} writes/sec over ${wall.toFixed(1)} s  (${res.length} submits)`);
  console.log(`  errors      ${failed.length} of ${res.length}  (${((failed.length / res.length) * 100).toFixed(2)} %)`);
  if (failed.length) {
    const byStatus = {};
    for (const f of failed) { const k = `${f.status} ${f.data?.message || f.data?.error || ""}`.slice(0, 60); byStatus[k] = (byStatus[k] || 0) + 1; }
    for (const [k, v] of Object.entries(byStatus)) console.log(`                ${v} x  ${k}`);
  }
  console.log(`  integrity   stored ${integrity.storedRows} rows for ${integrity.acknowledged} acknowledged writes`);
  console.log(`              missing ${integrity.missing.length} | altered ${integrity.altered.length} | duplicates ${integrity.duplicates}`);

  const verdict = failed.length === 0 && integrity.missing.length === 0
    && integrity.altered.length === 0 && integrity.duplicates === 0;
  console.log(`  VERDICT     ${verdict ? "PASS" : "FAIL"}`);

  report.waves.push({
    judges: n, submits: res.length, wallSec: +wall.toFixed(1),
    throughputPerSec: +(res.length / wall).toFixed(1),
    signIn: stats(si.times), submit: s,
    errors: failed.length, errorPct: +((failed.length / res.length) * 100).toFixed(2),
    errorKinds: failed.slice(0, 5).map((f) => ({ status: f.status, msg: String(f.data?.message || f.data?.error || "").slice(0, 120) })),
    integrity: {
      storedRows: integrity.storedRows, acknowledged: integrity.acknowledged,
      missing: integrity.missing.length, altered: integrity.altered.length, duplicates: integrity.duplicates,
    },
    verdict: verdict ? "PASS" : "FAIL",
  });
}

report.finishedAt = new Date().toISOString();
writeFileSync(new URL("./out/test1-ramp.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(`\n${"─".repeat(72)}`);
console.log(`Raw numbers: tests/stress/out/test1-ramp.json`);
console.log(`Production (evrupqnhgrfltfhafeyj) was not contacted.`);
