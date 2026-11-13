// One fake judge, end to end, through the PUBLISHABLE key only - exactly the path a real
// tablet takes. Proves the harness can sign in, read its assigned list and have a score
// accepted before any load test is written. ~10 requests, a couple of seconds.
//
//   node tests/stress/smoke.mjs
import { readFileSync } from "node:fs";
import { banner, rest } from "./env.mjs";
import { PRESETS, criteriaFor } from "./fixtures.mjs";

const c = banner("SMOKE - one fake judge signs in and scores (publishable key only)");
const m = JSON.parse(readFileSync(new URL("./out/seeded.json", import.meta.url), "utf8"));
if (m.ref !== c.ref) throw new Error(`manifest was seeded against ${m.ref}, not ${c.ref}`);

const rpc = (fn, body, opts = {}) => rest(c, `/rpc/${fn}`, { method: "POST", body, ...opts });
let fails = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
  if (!ok) fails++;
};

// -- 1. Sign in as judge 9 (a 6-8 judge, the 20-item middle/high form) ---------------
const JN = 9;
console.log(`\nJudge ${JN} (department ${m.judgeDept[JN]}):`);
const reg = await rpc("register_judge_secure", {
  p_school_id: m.schoolId, p_department_id: null,
  p_alias: `Judge${JN}`, p_invite_code: m.invite, p_device: "smoke-device-1",
});
const judge = Array.isArray(reg.data) ? reg.data[0] : reg.data;
check("sign-in accepted", reg.ok && !!judge?.judge_secret, reg.ok ? `${reg.ms.toFixed(0)} ms` : JSON.stringify(reg.data));
if (!judge?.judge_secret) { console.log("\nCannot continue without a judge secret."); process.exit(1); }

// -- 2. The server filled the list from the schedule, in round order -----------------
const list = judge.projects || [];
const expected = m.projects.filter((p) => p.dept === m.judgeDept[JN]);
check("list came from the schedule", list.length === Math.min(m.rounds, expected.length),
  `${list.length} projects (expected ${Math.min(m.rounds, expected.length)})`);
check("every assigned project is real", list.every((pid) => m.projects.some((p) => p.id === pid)));

// -- 3. Submit one score with values valid for THAT project's rubric ------------------
const pid = list[0];
const proj = m.projects.find((p) => p.id === pid);
const preset = PRESETS[m.rubricByDept[proj.dept]];
const criteria = criteriaFor(preset.criteria, 0.75);
const sub = await rpc("submit_score", {
  p_school_id: m.schoolId, p_judge_id: judge.id, p_secret: judge.judge_secret,
  p_project_id: pid, p_criteria: criteria,
  p_notes: "Smoke test - synthetic score.", p_commendation: "", p_feedback: {}, p_safety_concern: false,
});
check("score accepted", sub.ok, sub.ok ? `${sub.ms.toFixed(0)} ms` : JSON.stringify(sub.data));

// -- 4. It is really in the database, with the values sent ---------------------------
const back = await rest(c, `/scores?school_id=eq.${m.schoolId}&project_id=eq.${pid}&select=judge_id,criteria,notes`);
const row = back.data?.[0];
const same = row && Object.entries(criteria).every(([k, v]) => Number(row.criteria?.[k]) === Number(v));
check("stored criteria match what was sent", !!same,
  same ? `${Object.keys(criteria).length} criteria, total ${Object.values(criteria).reduce((a, b) => a + b, 0)}` : JSON.stringify(row?.criteria));

// -- 5. A wrong secret must be refused (the F1 protection still on in staging) --------
const bad = await rpc("submit_score", {
  p_school_id: m.schoolId, p_judge_id: judge.id, p_secret: "not-the-right-secret",
  p_project_id: list[1], p_criteria: criteria,
  p_notes: "", p_commendation: "", p_feedback: {}, p_safety_concern: false,
});
const refused = !bad.ok || /not signed in/i.test(JSON.stringify(bad.data));
check("a wrong judge secret is refused", refused, String(bad.data?.message || bad.status).slice(0, 48));

console.log(`\n${fails === 0 ? "All checks passed - the harness works." : `${fails} check(s) failed.`}`);
console.log(`Production (evrupqnhgrfltfhafeyj) was not contacted.`);
process.exit(fails === 0 ? 0 : 1);
