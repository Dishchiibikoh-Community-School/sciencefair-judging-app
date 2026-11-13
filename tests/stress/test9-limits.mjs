// TEST 9 - BREAKING POINT: push concurrency up until something degrades, and name which
// limit is hit first.
//
//   node tests/stress/test9-limits.mjs
//
// Tests 1 and 2 showed the event-sized load is comfortable, so this deliberately goes past
// anything the fair could produce. Each level fires N score writes with no pacing at all and
// records latency, errors and - through a subscribed Realtime channel - how much of the
// resulting fan-out actually arrives.
//
// Levels stop early once a level is clearly broken (>10 % errors), so the free-tier project
// is not hammered pointlessly.
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { banner } from "./env.mjs";
import { manifest, signIn, resetJudges, submitOne, clearScores, stats, fmt } from "./loadlib.mjs";

const c = banner("TEST 9 - BREAKING POINT (concurrency ramp past event scale)");
const m = manifest();
if (m.ref !== c.ref) throw new Error(`manifest was seeded against ${m.ref}, not ${c.ref}`);

const supabase = createClient(c.url, c.key, { realtime: { params: { eventsPerSecond: 1000 } } });
const seen = new Set();
let channelState = "none";
const channel = supabase
  .channel(`school-${m.schoolId}`)
  .on("postgres_changes", { event: "*", schema: "public", table: "scores", filter: `school_id=eq.${m.schoolId}` },
    (p) => { const r = p.new || {}; if (r.judge_id) seen.add(`${r.judge_id}_${r.project_id}`); });
await new Promise((res) => { channel.subscribe((s) => { channelState = s; if (s === "SUBSCRIBED") res(); }); setTimeout(res, 10000); });
console.log(`\nRealtime channel: ${channelState}`);

await resetJudges(c, m);
const si = await signIn(c, m, m.judgeNumbers);
console.log(`Signed in ${si.judges.length} judges`);

// Every (judge, project) pair the schedule allows; cycled to build each level. Repeats become
// UPDATEs of the same row, which is what a judge changing a score does, so it stays realistic.
const pairs = si.judges.flatMap((sess) => sess.projects.map((pid) => ({ sess, pid })));
console.log(`${pairs.length} valid judge/project pairs available\n`);

const LEVELS = [25, 50, 100, 200, 400, 600];
const report = { test: "9-limits", ref: c.ref, startedAt: new Date().toISOString(), channelState, levels: [] };
let brokeAt = null;

for (const n of LEVELS) {
  await clearScores(c, m);
  seen.clear();
  await new Promise((r) => setTimeout(r, 800));

  const batch = Array.from({ length: n }, (_, i) => pairs[i % pairs.length]);
  const t0 = performance.now();
  const res = await Promise.all(batch.map(({ sess, pid }) => submitOne(c, m, sess, pid)));
  const wall = (performance.now() - t0) / 1000;
  await new Promise((r) => setTimeout(r, 3000));   // let fan-out land

  const ok = res.filter((r) => r.ok);
  const failed = res.filter((r) => !r.ok);
  const s = stats(ok.map((r) => r.ms));
  const errPct = (failed.length / res.length) * 100;
  // Distinct rows this level should have produced (duplicate pairs collapse to one row).
  const distinct = new Set(ok.map((r) => `${r.judgeId}_${r.pid}`)).size;
  const delivered = [...seen].length;

  console.log(`${String(n).padStart(4)} concurrent  ${fmt(s)}`);
  console.log(`               ${(n / wall).toFixed(0).padStart(5)} writes/sec   errors ${failed.length} (${errPct.toFixed(1)} %)   realtime ${delivered}/${distinct}`);
  if (failed.length) {
    const kinds = {};
    for (const f of failed) { const k = `${f.status} ${String(f.data?.message || f.data?.error || "").slice(0, 50)}`; kinds[k] = (kinds[k] || 0) + 1; }
    for (const [k, v] of Object.entries(kinds)) console.log(`                 ${String(v).padStart(4)} x  ${k}`);
  }

  report.levels.push({
    concurrent: n, wallSec: +wall.toFixed(2), perSec: +(n / wall).toFixed(0), submit: s,
    errors: failed.length, errorPct: +errPct.toFixed(1),
    errorKinds: Object.entries(failed.reduce((a, f) => { const k = `${f.status} ${String(f.data?.message || f.data?.error || "").slice(0, 80)}`; a[k] = (a[k] || 0) + 1; return a; }, {})),
    realtime: { expected: distinct, delivered, pct: distinct ? +((delivered / distinct) * 100).toFixed(1) : null },
  });

  if (errPct > 10) { brokeAt = n; console.log(`\n  >10 % errors at ${n} concurrent - stopping the ramp.`); break; }
}

report.brokeAt = brokeAt;
report.finishedAt = new Date().toISOString();
await supabase.removeChannel(channel);
writeFileSync(new URL("./out/test9-limits.json", import.meta.url), JSON.stringify(report, null, 2));

console.log(`\n${brokeAt ? `First level with >10 % errors: ${brokeAt} concurrent writes.`
  : `No level in the ramp broke - survived ${LEVELS.at(-1)} concurrent writes with under 10 % errors.`}`);
console.log(`Raw numbers: tests/stress/out/test9-limits.json`);
console.log(`Production (evrupqnhgrfltfhafeyj) was not contacted.`);
process.exit(0);
