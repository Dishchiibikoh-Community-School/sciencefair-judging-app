// Read-only check of the STAGING project. Sends no writes and creates nothing —
// every request below is a GET, or an RPC probe with deliberately invalid arguments
// that is rejected before it can write.
//   node tests/stress/preflight.mjs
//
// Reports: which database it is talking to, whether the schema bundle has been applied,
// whether any data exists, and whether email confirmation would block the seed step.
import { banner, rest } from "./env.mjs";

const c = banner("PREFLIGHT — read-only check of the staging project");

const TABLES = ["schools", "departments", "categories", "projects", "judges", "scores",
  "judge_roster", "judge_schedule", "app_settings", "rubrics", "final_decisions", "validations"];

// A table that exists but is closed to anon answers 42501 (permission denied) — that is a
// PASS, not a failure. Only PGRST205 / 404 means the table is not there at all.
const CLOSED_OK = ["judge_secrets", "project_private", "judge_labels"];
const missing = [], present = [];
for (const t of [...TABLES, ...CLOSED_OK]) {
  const sel = t === "schools" ? "id,name,slug" : "*";
  const r = await rest(c, `/${t}?select=${sel}&limit=1`);
  if (r.status === 404 || r.data?.code === "PGRST205") missing.push(t);
  else if (r.data?.code === "42501") present.push(`${t}=closed to anon (correct)`);
  else present.push(`${t}=${Array.isArray(r.data) && r.data.length ? "HAS ROWS" : "empty"}`);
}

console.log(`\nSchema: ${present.length}/${TABLES.length + CLOSED_OK.length} expected tables present`);
if (missing.length) console.log(`  MISSING: ${missing.join(", ")}\n  → apply tests/stress/out/staging-schema.sql in the staging SQL editor`);
if (present.length) console.log(`  ${present.join("\n  ")}`);

// Functions the stress tests call. PostgREST matches on ARGUMENT NAMES, so probing with {}
// returns PGRST202 ("no such function without parameters") even when the function exists —
// each probe therefore sends the real parameter names with values that cannot succeed.
// A present function answers with its own validation error or a 4xx; an absent one: PGRST202.
const FN_PROBES = {
  create_school: { p_user_id: "00000000-0000-0000-0000-000000000000", p_name: "", p_slug: "", p_invite_code: "", p_admin_pin: "", p_rubric: [] },
  register_judge_secure: { p_school_id: "00000000-0000-0000-0000-000000000000", p_department_id: null, p_alias: "", p_invite_code: "", p_device: "preflight" },
  submit_score: { p_school_id: "00000000-0000-0000-0000-000000000000", p_judge_id: "", p_secret: "", p_project_id: "", p_criteria: {} },
  submit_validation: { p_school_id: "00000000-0000-0000-0000-000000000000", p_judge_id: "", p_secret: "", p_approved: true },
  set_judge_schedule: { p_school_id: "00000000-0000-0000-0000-000000000000", p_slots: [], p_entries: [] },
  set_judge_roster: { p_school_id: "00000000-0000-0000-0000-000000000000", p_roster: [] },
};
if (!missing.length) {
  console.log("\nRequired functions:");
  for (const [fn, body] of Object.entries(FN_PROBES)) {
    const r = await rest(c, `/rpc/${fn}`, { method: "POST", body });
    const absent = r.data?.code === "PGRST202" || r.status === 404;
    const why = absent ? "" : `  (rejected as expected: ${r.data?.message?.slice(0, 48) || r.status})`;
    console.log(`  ${absent ? "MISSING  " : "present  "}${fn}${why}`);
  }
}

// Read-only: GoTrue reports its own settings. No account is created.
const s = await fetch(`${c.auth}/settings`, { headers: { apikey: c.key } }).catch(() => null);
const sj = s ? await s.json().catch(() => ({})) : {};

// Seeding needs ONE of these two routes to work:
//   (a) the secret key  — preferred: no email account needed at all
//   (b) email sign-up   — needs the email provider ON and "Confirm email" OFF
console.log(`
Seeding route:`);
if (c.secret) {
  // Proof the secret really is privileged: read a table anon is forbidden to touch.
  const probe = await rest(c, "/judge_secrets?select=judge_id&limit=1", { admin: true });
  const works = probe.status === 200;
  console.log(`  secret key     : ${works ? "WORKS — seeding can create data directly" : `PRESENT BUT REJECTED (${probe.status} ${probe.data?.message || ""})`}`);
  if (works) console.log(`  → Email provider settings do not matter. Seeding is unblocked.`);
} else {
  console.log(`  secret key     : not set`);
  console.log(`  email provider : ${sj.external?.email === true ? "on" : "OFF — sign-up impossible"}`);
  console.log(`  auto-confirm   : ${sj.mailer_autoconfirm === true ? "ON" : "OFF — cannot sign in as the fake admin"}`);
  console.log(`  → Add STRESS_SUPABASE_SECRET to .env.stress.local, or fix both settings above.`);
}

console.log(`
Nothing was written. Production (evrupqnhgrfltfhafeyj) was not contacted.`);
