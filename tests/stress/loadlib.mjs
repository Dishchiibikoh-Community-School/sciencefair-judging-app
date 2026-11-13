// Shared machinery for the load tests. Every judge action goes through the PUBLISHABLE key
// and the same RPCs a real tablet calls, so what is measured is the real permission path.
// The SECRET key is used only to reset scores between waves and to count rows for integrity.
import { readFileSync } from "node:fs";
import { rest } from "./env.mjs";
import { PRESETS, criteriaFor } from "./fixtures.mjs";

export const manifest = () => JSON.parse(readFileSync(new URL("./out/seeded.json", import.meta.url), "utf8"));

export const rpc = (c, fn, body) => rest(c, `/rpc/${fn}`, { method: "POST", body });

// ── statistics ───────────────────────────────────────────────────────────────────────
// p95 is reported as "slowest 5%" in the brief. Nearest-rank on a sorted copy; with small
// samples that is the honest reading - no interpolation pretending to precision we lack.
export function stats(ms) {
  if (!ms.length) return { n: 0 };
  const s = [...ms].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
  return {
    n: s.length,
    min: Math.round(s[0]),
    p50: Math.round(at(50)),
    p95: Math.round(at(95)),
    p99: Math.round(at(99)),
    max: Math.round(s[s.length - 1]),
    mean: Math.round(s.reduce((a, b) => a + b, 0) / s.length),
  };
}
export const fmt = (s) => s.n
  ? `n=${String(s.n).padStart(4)}  median ${String(s.p50).padStart(5)} ms   slowest5% ${String(s.p95).padStart(6)} ms   max ${String(s.max).padStart(6)} ms`
  : "n=0";

// ── judges ───────────────────────────────────────────────────────────────────────────
// A judge number can only be signed in on ONE device; a second device needs an admin
// transfer allowance. So sessions are created once and reused across every wave, exactly as
// a real tablet keeps its session all morning.
const sessions = new Map();

export async function signIn(c, m, numbers) {
  const out = [], times = [], errors = [];
  await Promise.all(numbers.map(async (jn) => {
    if (sessions.has(jn)) { out.push(sessions.get(jn)); return; }
    const r = await rpc(c, "register_judge_secure", {
      p_school_id: m.schoolId, p_department_id: null,
      p_alias: `Judge${jn}`, p_invite_code: m.invite, p_device: `stress-device-${jn}`,
    });
    times.push(r.ms);
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    if (!row?.judge_secret) { errors.push({ jn, status: r.status, msg: row?.error || r.data?.message }); return; }
    const sess = { jn, id: row.id, secret: row.judge_secret, projects: row.projects || [], dept: m.judgeDept[jn] };
    sessions.set(jn, sess); out.push(sess);
  }));
  return { judges: out.sort((a, b) => a.jn - b.jn), times, errors };
}

// ── scoring ──────────────────────────────────────────────────────────────────────────
// One submit, with criteria valid for THAT project's rubric (the server checks ids and
// values against the rubric steps since migration 2026-11a).
export async function submitOne(c, m, sess, pid, pick = 0.7) {
  const proj = m.projects.find((p) => p.id === pid);
  const preset = PRESETS[m.rubricByDept[proj?.dept] || "isef-ms-hs-2627"];
  const criteria = criteriaFor(preset.criteria, pick);
  const r = await rpc(c, "submit_score", {
    p_school_id: m.schoolId, p_judge_id: sess.id, p_secret: sess.secret,
    p_project_id: pid, p_criteria: criteria,
    p_notes: `stress ${sess.jn}/${pid}`, p_commendation: "",
    p_feedback: {}, p_safety_concern: false,
  });
  return { ok: r.ok, ms: r.ms, status: r.status, pid, jn: sess.jn, judgeId: sess.id, criteria, data: r.data };
}

// Every judge works through their own list; all judges run concurrently. `gapMs` paces each
// judge between submits so the shape is "many judges scoring", not "one client hammering".
export async function scoreWave(c, m, judges, { gapMs = 0, max = Infinity, pick = 0.7 } = {}) {
  const results = [];
  await Promise.all(judges.map(async (sess) => {
    const list = sess.projects.slice(0, max);
    for (const pid of list) {
      results.push(await submitOne(c, m, sess, pid, pick));
      if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
    }
  }));
  return results;
}

// ── integrity ────────────────────────────────────────────────────────────────────────
export async function clearScores(c, m) {
  await rest(c, `/scores?school_id=eq.${m.schoolId}`, { method: "DELETE", admin: true });
}

export async function readScores(c, m) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const r = await rest(c, `/scores?school_id=eq.${m.schoolId}&select=judge_id,project_id,criteria,notes&order=project_id`, {
      admin: true, headers: { Range: `${from}-${from + 999}` },
    });
    const rows = r.data || [];
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  return all;
}

// Compares what the server stored against what the client believes it sent. Catches a lost
// write, a duplicate, and a value that arrived altered - the three failures that matter most.
export async function verify(c, m, sent) {
  const rows = await readScores(c, m);
  const key = (j, p) => `${j}_${p}`;
  const stored = new Map(rows.map((r) => [key(r.judge_id, r.project_id), r]));
  const okSent = sent.filter((s) => s.ok);

  const missing = [], altered = [];
  for (const s of okSent) {
    const row = stored.get(key(s.judgeId, s.pid));
    if (!row) { missing.push(s); continue; }
    const same = Object.entries(s.criteria).every(([k, v]) => Number(row.criteria?.[k]) === Number(v));
    if (!same) altered.push({ pid: s.pid, jn: s.jn });
  }
  const dupKeys = rows.length - new Set(rows.map((r) => key(r.judge_id, r.project_id))).size;
  return { storedRows: rows.length, acknowledged: okSent.length, missing, altered, duplicates: dupKeys };
}

// Clears every judge session so a run can sign all 30 in fresh. A judge number is bound to
// one device until an admin approves a transfer (correct, and proven by Test 1 refusing a
// second device), which would otherwise leave earlier sessions stranded between runs.
export async function resetJudges(c, m) {
  sessions.clear();
  await rest(c, `/judges?school_id=eq.${m.schoolId}`, { method: "DELETE", admin: true });
}
