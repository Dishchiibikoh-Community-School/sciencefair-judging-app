// TEST 10 - CONCURRENT REALTIME CONNECTIONS (added after Test 1 revealed a gap).
//
//   node tests/stress/test10-connections.mjs
//
// Why this exists: tests 1, 2 and 9 drove many judges from ONE process, which proves the
// database can take the writes but says nothing about how many SEPARATE devices can hold a
// Realtime subscription at the same time. On the free tier that connection count - not write
// throughput - is the limit most likely to be reached first, because the app opens one
// channel per device and every score insert fans out to all of them.
//
// So: open N independent Supabase clients, each with its own WebSocket and its own channel on
// the school, exactly as N tablets would. Then write a score and measure how many of the N
// actually receive it, and how long the slowest one waits.
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { banner, rest } from "./env.mjs";
import { manifest, signIn, resetJudges, submitOne, stats, fmt } from "./loadlib.mjs";

const c = banner("TEST 10 - CONCURRENT REALTIME CONNECTIONS (one per simulated device)");
const m = manifest();
const report = { test: "10-connections", ref: c.ref, startedAt: new Date().toISOString(), levels: [] };

await resetJudges(c, m);
const si = await signIn(c, m, [m.judgeNumbers[0], m.judgeNumbers[10]]);
const writer = si.judges.find((j) => j.projects.length) || si.judges[0];

const LEVELS = [10, 30, 60, 100];
let firstFailure = null;

for (const n of LEVELS) {
  console.log(`\n${"─".repeat(72)}\n${n} simultaneous device connections`);
  const clients = [];
  const joined = [];
  const arrivals = new Map();                  // client index -> time the event landed

  const t0 = performance.now();
  await Promise.all(Array.from({ length: n }, async (_, i) => {
    const sb = createClient(c.url, c.key, { realtime: { params: { eventsPerSecond: 20 } } });
    clients.push(sb);
    const ch = sb.channel(`school-${m.schoolId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "scores", filter: `school_id=eq.${m.schoolId}` },
        () => { if (!arrivals.has(i)) arrivals.set(i, performance.now()); });
    await new Promise((res) => {
      ch.subscribe((status) => { if (status === "SUBSCRIBED") { joined.push(i); res(); } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") res(); });
      setTimeout(res, 25000);
    });
  }));
  const joinMs = performance.now() - t0;
  console.log(`  joined      ${joined.length} of ${n}  in ${(joinMs / 1000).toFixed(1)} s`);

  // Clear and write one score; every joined client should see it.
  await rest(c, `/scores?school_id=eq.${m.schoolId}`, { method: "DELETE", admin: true });
  await new Promise((r) => setTimeout(r, 1500));
  arrivals.clear();

  const sent = performance.now();
  const w = await submitOne(c, m, writer, writer.projects[0], 0.6);
  await new Promise((r) => setTimeout(r, 6000));

  const delivered = arrivals.size;
  const lags = [...arrivals.values()].map((t) => t - sent);
  const s = stats(lags);
  console.log(`  write       ${w.ok ? "accepted" : `FAILED ${w.status}`} in ${w.ms.toFixed(0)} ms`);
  console.log(`  fan-out     ${delivered} of ${joined.length} subscribed clients received it` +
    `${joined.length ? `  (${((delivered / joined.length) * 100).toFixed(1)} %)` : ""}`);
  if (lags.length) console.log(`  lag         ${fmt(s)}`);

  const ok = joined.length === n && delivered === joined.length;
  console.log(`  VERDICT     ${ok ? "PASS" : "DEGRADED"}`);
  if (!ok && !firstFailure) firstFailure = { level: n, joined: joined.length, delivered };

  report.levels.push({
    connections: n, joined: joined.length, joinSec: +(joinMs / 1000).toFixed(1),
    delivered, deliveredPct: joined.length ? +((delivered / joined.length) * 100).toFixed(1) : null,
    lag: s, writeOk: w.ok, verdict: ok ? "PASS" : "DEGRADED",
  });

  await Promise.all(clients.map((sb) => sb.removeAllChannels().catch(() => {})));
  await new Promise((r) => setTimeout(r, 2000));
  if (!ok) { console.log(`\n  Degraded at ${n} connections - stopping.`); break; }
}

report.firstFailure = firstFailure;
report.finishedAt = new Date().toISOString();
writeFileSync(new URL("./out/test10-connections.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(`\n${"─".repeat(72)}`);
console.log(firstFailure
  ? `First degradation at ${firstFailure.level} simultaneous connections (${firstFailure.joined} joined, ${firstFailure.delivered} received).`
  : `All levels up to ${LEVELS.at(-1)} simultaneous connections held, with full fan-out.`);
console.log(`Raw numbers: tests/stress/out/test10-connections.json`);
console.log(`Production (evrupqnhgrfltfhafeyj) was not contacted.`);
process.exit(0);
