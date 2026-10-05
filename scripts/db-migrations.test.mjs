// Database migration + RLS tests on a real Postgres (PGlite, in-process — no Supabase needed).
// Applies supabase/schema-v2.sql + every migration in order (twice: they must be re-runnable)
// and checks grants / RLS / submit_registration as anon, a signed-in non-admin, and an admin.
//   node scripts/db-migrations.test.mjs
// Run it after ANY change to supabase/*.sql. Supabase defaults (anon/authenticated roles,
// default table grants, auth.uid(), realtime publication) are simulated below.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const REPO = new URL("..", import.meta.url);
const LIVE_SCHEMA = new URL("supabase/schema-v2.sql", REPO);
const file = (p) => readFileSync(p, "utf8");
const mig = (n) => file(new URL(`supabase/${n}`, REPO));

const db = new PGlite({ extensions: { pgcrypto } });
let pass = 0;
const ok = (m) => { pass++; console.log("  ✓", m); };

async function as(role, uid, q, params) {
  await db.exec(`RESET ROLE; SELECT set_config('test.uid', '${uid || ""}', false); SET ROLE ${role};`);
  let res, err;
  try { res = await db.query(q, params); } catch (e) { err = e; }
  await db.exec("RESET ROLE");
  if (err) throw err;
  return res;
}
async function fails(role, uid, q, re, msg, params) {
  let err = null;
  try { await as(role, uid, q, params); } catch (e) { err = e; }
  assert.ok(err, `${msg} — expected an error`);
  if (re) assert.match(err.message, re, msg);
  ok(`${msg}  [${err.message.slice(0, 80)}]`);
}

// ── Supabase-like environment ──
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
  CREATE SCHEMA auth; CREATE SCHEMA extensions;
  CREATE TABLE auth.users (id uuid primary key, created_at timestamptz NOT NULL DEFAULT now());
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth, public, extensions TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
  CREATE PUBLICATION supabase_realtime;
  -- Supabase grants anon/authenticated full table privileges by default; RLS is the gate.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
  CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
`);
await db.exec("SET search_path = public, extensions;");

// ── Live state: schema-v2 as deployed + the September migrations ──
await db.exec(file(LIVE_SCHEMA));
await db.exec(mig("migration-2026-09-project-adviser.sql"));
await db.exec(mig("migration-2026-09-security-hardening.sql"));
await db.exec(mig("migration-2026-09b-pin-and-judge-auth.sql"));
ok("live-equivalent schema + 3 September migrations applied");

const SID = "11111111-1111-1111-1111-111111111111";
const ADMIN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
await db.exec(`
  INSERT INTO auth.users VALUES ('${ADMIN}'), ('${OTHER}');
  INSERT INTO schools (id, name, slug, invite_code, admin_pin) VALUES ('${SID}', 'Test', 'test', 'CODE', '4821');
  INSERT INTO school_admins (school_id, user_id) VALUES ('${SID}', '${ADMIN}');
  INSERT INTO projects (id, school_id, num, title, cat, grade, advisor_name, group_members)
    VALUES ('p_old', '${SID}', '007', 'Old project', 'Life Science', '8', 'Mr. Agan', '["Amos","Noah"]');
  INSERT INTO registration_links (school_id, token, active) VALUES ('${SID}', 'GOOD-TOKEN', true);
  INSERT INTO registration_links (school_id, token, active) VALUES ('${SID}', 'OFF-TOKEN', false);
  INSERT INTO registration_links (school_id, token, active, expires_at) VALUES ('${SID}', 'OLD-TOKEN', true, now() - interval '1 day');
`);
const HIJACK = await as("authenticated", OTHER,
  `INSERT INTO school_admins (school_id, user_id) VALUES ('${SID}', '${OTHER}') RETURNING 1`);
assert.equal(HIJACK.rows.length, 1);
ok("BEFORE fix: a random signed-in user CAN make themselves admin of an existing school (the hole is real)");
await db.exec(`DELETE FROM school_admins WHERE user_id = '${OTHER}'`);
const leak = await as("anon", "", "SELECT group_members FROM projects");
assert.deepEqual(leak.rows[0].group_members, ["Amos", "Noah"]);
ok("BEFORE fix: anon CAN read projects.group_members (the leak is real)");

for (const round of [1, 2]) {
  await db.exec(mig("migration-2026-10-project-details.sql"));
  await db.exec(mig("migration-2026-10b-private-members-and-registration.sql"));
  await db.exec(mig("migration-2026-10c-secure-school-signup.sql"));
  await db.exec(mig("migration-2026-10d-judge-revise-validation.sql"));
  ok(`migrations 2026-10, 10b, 10c, 10d applied (round ${round} — re-runnable)`);
}

// ── PART 1: names are private ──
const cols = (await db.query(`SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='projects'`)).rows.map(r => r.column_name);
assert.ok(!cols.includes("group_members") && !cols.includes("advisor_name"));
assert.ok(cols.includes("room") && cols.includes("description") && cols.includes("motivation"));
ok("projects: group_members/advisor_name dropped; room/description/motivation present");

const back = (await db.query("SELECT * FROM project_private WHERE project_id='p_old'")).rows[0];
assert.equal(back.advisor_name, "Mr. Agan");
assert.deepEqual(back.group_members, ["Amos", "Noah"]);
ok("existing names backfilled into project_private");

await fails("anon", "", "SELECT group_members FROM projects", /does not exist/, "anon: projects.group_members is gone");
await fails("anon", "", "SELECT * FROM project_private", /permission denied/, "anon: project_private SELECT denied");
await fails("anon", "", `INSERT INTO project_private (project_id, school_id) VALUES ('p_old', '${SID}')`, /permission denied/, "anon: project_private INSERT denied");
const anonProj = await as("anon", "", "SELECT id, title, room, description FROM projects");
assert.equal(anonProj.rows.length, 1);
ok("anon (judges/public) still read project titles, room, description");

assert.equal((await as("authenticated", OTHER, "SELECT * FROM project_private")).rows.length, 0);
ok("signed-in NON-admin: project_private returns 0 rows");
const upd = await as("authenticated", OTHER, `UPDATE project_private SET advisor_name='x' WHERE project_id='p_old' RETURNING 1`);
assert.equal(upd.rows.length, 0);
ok("signed-in NON-admin: update affects 0 rows");
await fails("authenticated", OTHER, `INSERT INTO project_private (project_id, school_id) VALUES ('p_old', '${SID}')`,
  /row-level security/, "signed-in NON-admin: insert blocked by RLS");

assert.equal((await as("authenticated", ADMIN, "SELECT advisor_name FROM project_private")).rows[0].advisor_name, "Mr. Agan");
ok("admin: reads names");
await as("authenticated", ADMIN, `INSERT INTO projects (id, school_id, num, title, cat, grade) VALUES ('p_new', '${SID}', '009', 'New', 'Life Science', '7')`);
const upsert = (name) => as("authenticated", ADMIN, `INSERT INTO project_private (project_id, school_id, advisor_name, group_members)
  VALUES ('p_new', '${SID}', '${name}', '[{"name":"Ana","grade":"7"}]')
  ON CONFLICT (project_id, school_id) DO UPDATE SET advisor_name = EXCLUDED.advisor_name, group_members = EXCLUDED.group_members`);
await upsert("Ms. X"); await upsert("Ms. Y");
assert.equal((await db.query("SELECT advisor_name FROM project_private WHERE project_id='p_new'")).rows[0].advisor_name, "Ms. Y");
ok("admin: insert + upsert (the app's onConflict path) works");
await as("authenticated", ADMIN, `DELETE FROM projects WHERE id='p_new' AND school_id='${SID}'`);
assert.equal((await db.query("SELECT count(*)::int n FROM project_private WHERE project_id='p_new'")).rows[0].n, 0);
ok("deleting a project cascades its private row");
await fails("authenticated", ADMIN, `INSERT INTO project_private (project_id, school_id) VALUES ('p_ghost', '${SID}')`,
  /foreign key/, "private row for a non-existent project is rejected");
assert.equal((await db.query("SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='project_private'")).rows.length, 1);
ok("project_private is in the realtime publication");

// ── PART 2: registration ──
const form = (over = {}) => JSON.stringify({
  student_name: "Lena Begay", grade_level: "8", division: "Junior High School", school_name: "DCS",
  student_email: "lena@example.com", contact_number: "555", project_title: "Solar Ovens",
  category: "Energy, Sustainability & Design", project_type: "Group", group_members: ["Kai Yazzie", "lena begay", "  "],
  advisor_name: "Mr. Agan", advisor_email: "a@example.com", school_department: "Science",
  description: "Build a solar oven", research_question: "q", hypothesis: "h",
  needs_electricity: true, special_equipment: "", has_trifold: true,
  is_original_work: true, agrees_to_rules: true, guardian_name: "G", guardian_signature: "G",
  reg_prefix: "JHS-ESD", ...over,
});
const reg = (token, f) => as("anon", "", "SELECT submit_registration($1, $2::jsonb) AS r", [token, f]);

const r1 = (await reg("GOOD-TOKEN", form())).rows[0].r;
assert.equal(r1.reg_number, "JHS-ESD-001");
assert.equal(r1.project_num, "008");
ok(`anon registration works → ${r1.reg_number}, project #${r1.project_num} (after highest existing #007)`);
const sub = (await db.query("SELECT * FROM registration_submissions WHERE project_id=$1", [r1.project_id])).rows[0];
assert.equal(sub.group_members, "Kai Yazzie, lena begay");
assert.equal(sub.needs_electricity, true);
assert.equal(sub.guardian_signature, "G");
ok("submission row has all form fields (incl. the 12 previously-missing columns)");
const pp = (await db.query("SELECT * FROM project_private WHERE project_id=$1", [r1.project_id])).rows[0];
assert.deepEqual(pp.group_members.map(m => m.name), ["Kai Yazzie", "lena begay"]);
ok("student already listed in members is not duplicated (case-insensitive)");
assert.equal((await db.query("SELECT description FROM projects WHERE id=$1", [r1.project_id])).rows[0].description, "Build a solar oven");
ok("project carries the description (judges see it)");

const r2 = (await reg("GOOD-TOKEN", form({ group_members: [], reg_prefix: "<script>" }))).rows[0].r;
assert.equal(r2.reg_number, "UNK-OTH-002");
const pp2 = (await db.query("SELECT group_members FROM project_private WHERE project_id=$1", [r2.project_id])).rows[0];
assert.deepEqual(pp2.group_members, [{ name: "Lena Begay", grade: "8" }]);
ok("2nd registration numbered 002; bad prefix sanitised; registrant added as member");

await fails("anon", "", "SELECT submit_registration('OFF-TOKEN', '{}'::jsonb)", /not active/, "inactive link rejected");
await fails("anon", "", "SELECT submit_registration('OLD-TOKEN', '{}'::jsonb)", /not active/, "expired link rejected");
await fails("anon", "", "SELECT submit_registration('NOPE', '{}'::jsonb)", /not active/, "unknown token rejected");
await fails("anon", "", "SELECT submit_registration('GOOD-TOKEN', $1::jsonb)", /required fields/, "missing consent rejected", [form({ agrees_to_rules: false })]);
await fails("anon", "", "SELECT submit_registration('GOOD-TOKEN', $1::jsonb)", /valid email/, "bad email rejected", [form({ student_email: "nope" })]);
await fails("anon", "", `INSERT INTO registration_submissions (school_id, reg_number) VALUES ('${SID}', 'X')`, /row-level security/, "direct anon insert into submissions blocked");
await fails("anon", "", `INSERT INTO projects (id, school_id, num, title) VALUES ('p_x', '${SID}', '1', 't')`, /row-level security/, "direct anon insert into projects still blocked");
assert.equal((await db.query("SELECT count(*)::int n FROM registration_submissions")).rows[0].n, 2);
ok("failed attempts left no partial rows (2 submissions total)");

// ── PART 3: school sign-up (migration 2026-10c) ──
await fails("authenticated", OTHER, `INSERT INTO school_admins (school_id, user_id) VALUES ('${SID}', '${OTHER}')`,
  /row-level security/, "AFTER fix: signed-in user can NOT make themselves admin of an existing school");
await fails("anon", "", `INSERT INTO school_admins (school_id, user_id) VALUES ('${SID}', '${OTHER}')`,
  /row-level security|permission denied/, "anon can NOT insert school_admins");
await fails("anon", "", `INSERT INTO schools (name, slug, invite_code) VALUES ('Junk', 'junk', 'abcd')`,
  /permission denied|row-level security/, "anon can NOT insert schools directly");
await fails("authenticated", OTHER, `INSERT INTO schools (name, slug, invite_code) VALUES ('Junk', 'junk', 'abcd')`,
  /permission denied|row-level security/, "signed-in user can NOT insert schools directly");

const NEWU = "cccccccc-cccc-cccc-cccc-cccccccccccc", OLDU = "dddddddd-dddd-dddd-dddd-dddddddddddd";
await db.exec(`INSERT INTO auth.users (id, created_at) VALUES ('${NEWU}', now()), ('${OLDU}', now() - interval '3 days')`);
const rubric = JSON.stringify([{ id: "x", label: "X", max: 3, steps: [0, 1, 2, 3] }]);
const CS = "SELECT create_school($1, $2, $3, 'INV12345', $4, NULL) AS r";

await fails("anon", "", CS, /2–120/, "create_school: too-short name rejected", [NEWU, "N", "new-school", "4821"]);
await fails("anon", "", CS, /lowercase/, "create_school: bad URL rejected", [NEWU, "New School", "Bad Slug!", "4821"]);
await fails("anon", "", CS, /already taken/, "create_school: taken URL rejected", [NEWU, "New School", "test", "4821"]);
for (const pin of ["1111", "1234", "12a4", "123", "123456789"])
  await fails("anon", "", CS, /PIN/, `create_school: weak/invalid PIN "${pin}" rejected`, [NEWU, "New School", "new-school", pin]);
await fails("anon", "", CS, /too old/, "create_school: cannot attach an old existing account", [OLDU, "New School", "old-school", "4821"]);
await fails("authenticated", OTHER, CS, /own account/, "create_school: signed-in user cannot create for someone else", [NEWU, "New School", "other-school", "4821"]);
await fails("anon", "", CS, /already manages/, "create_school: an existing admin cannot grab a second school", [ADMIN, "New School", "admin-again", "4821"]);

const created = (await as("anon", "", "SELECT create_school($1, 'New School', 'new-school', 'INV12345', '4821', $2::jsonb) AS r", [NEWU, rubric])).rows[0].r;
assert.equal(created.slug, "new-school");
ok("create_school (no session, email-confirm path) creates the school");
const nsid = created.id;
const n = async (q) => (await db.query(q, [nsid])).rows[0].n;
assert.equal(await n("SELECT count(*)::int n FROM school_admins WHERE school_id=$1 AND role='owner'"), 1);
assert.equal(await n("SELECT count(*)::int n FROM departments WHERE school_id=$1"), 3);
assert.equal(await n("SELECT count(*)::int n FROM app_settings WHERE school_id=$1"), 3);
assert.equal(await n("SELECT count(*)::int n FROM rubrics WHERE school_id=$1 AND is_active"), 1);
ok("…with its owner, 3 departments, 3 settings and the active rubric — one transaction");
const hash = (await db.query("SELECT admin_pin FROM schools WHERE id=$1", [nsid])).rows[0].admin_pin;
assert.match(hash, /^\$2[aby]\$/);
ok("…and the PIN is stored bcrypt-hashed, not plaintext");
await fails("anon", "", CS, /already manages/, "the same account cannot create a second school", [NEWU, "Second", "second-school", "4821"]);
assert.equal((await as("authenticated", NEWU, "SELECT is_school_admin($1) AS a", [nsid])).rows[0].a, true);
assert.equal((await as("authenticated", NEWU, "SELECT is_school_admin($1) AS a", [SID])).rows[0].a, false);
ok("new owner is admin of their own school only");
const SIGNED = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
await db.exec(`INSERT INTO auth.users (id) VALUES ('${SIGNED}')`);
const c2 = (await as("authenticated", SIGNED, "SELECT create_school($1, 'Signed School', 'signed-school', 'INV12345', '4821', NULL) AS r", [SIGNED])).rows[0].r;
assert.equal(c2.slug, "signed-school");
ok("create_school (signed-in path) works for your own account");

// ── PART 4: the judging lifecycle, as the app calls it (anon judges, signed-in admin) ──
const D = "d1111111-1111-1111-1111-111111111111";
await as("authenticated", ADMIN, `INSERT INTO departments (id, school_id, name, max_judges, ord) VALUES ('${D}', '${SID}', 'Middle School', 2, 0)`);
await as("authenticated", ADMIN, `INSERT INTO projects (id, school_id, num, title, cat, grade, department_id) VALUES
  ('p_a', '${SID}', '010', 'Alpha', 'Life Science', '7', '${D}'), ('p_b', '${SID}', '011', 'Beta', 'Life Science', '8', '${D}')`);
ok("admin creates a department + 2 projects");

const RJ = "SELECT register_judge($1, $2, $3, $4) AS j";
await fails("anon", "", RJ, /Invalid invite code/i, "judge: wrong invite code rejected", [SID, D, "Judge1", "WRONG"]);
await fails("anon", "", RJ, null, "judge: alias above the department's max_judges rejected", [SID, D, "Judge3", "CODE"]);
const j1 = (await as("anon", "", RJ, [SID, D, "Judge1", "CODE"])).rows[0].j;
assert.ok(j1.id); assert.deepEqual([...j1.projects].sort(), ["p_a", "p_b"]);
ok("judge: Judge1 registers and is assigned every project in the department");
await fails("anon", "", RJ, null, "judge: the same alias cannot register twice (needs admin transfer)", [SID, D, "Judge1", "CODE"]);
const j2 = (await as("anon", "", RJ, [SID, D, "Judge2", "code"])).rows[0].j;
ok("judge: invite code is case-insensitive (Judge2 with 'code')");

// Scores: exactly what submitScore() / the offline flush send (PostgREST upsert = INSERT … ON CONFLICT DO UPDATE)
const UPSERT_SCORE = `INSERT INTO scores (school_id, judge_id, project_id, criteria, notes) VALUES ($1, $2, $3, $4::jsonb, $5)
  ON CONFLICT (judge_id, project_id) DO UPDATE SET criteria = EXCLUDED.criteria, notes = EXCLUDED.notes`;
await as("anon", "", UPSERT_SCORE, [SID, j1.id, "p_a", JSON.stringify({ presentation: 4, data: 6 }), "good"]);
await as("anon", "", UPSERT_SCORE, [SID, j1.id, "p_a", JSON.stringify({ presentation: 6, data: 6 }), "better"]);
const sc = (await db.query("SELECT criteria, notes FROM scores WHERE judge_id=$1 AND project_id='p_a'", [j1.id])).rows;
assert.equal(sc.length, 1); assert.equal(sc[0].criteria.presentation, 6); assert.equal(sc[0].notes, "better");
ok("scores: judge submits, then edits → one row, updated in place");
await fails("anon", "", UPSERT_SCORE, /row-level security/, "scores: a made-up judge id cannot submit", [SID, "j_fake", "p_a", "{}", ""]);
await as("anon", "", UPSERT_SCORE, [SID, j1.id, "p_b", JSON.stringify({ presentation: 2 }), ""]);
await as("anon", "", UPSERT_SCORE, [SID, j2.id, "p_a", JSON.stringify({ presentation: 4 }), ""]);
ok("scores: multiple judges × projects coexist");
assert.equal((await as("anon", "", "SELECT count(*)::int n FROM scores WHERE school_id=$1", [SID])).rows[0].n, 3);
ok("scores: readable by judges/public pages (needed for averages)");

// Deliberation notes
await as("anon", "", `INSERT INTO deliberation_notes (school_id, judge_id, project_id, comment, recommendation, flagged) VALUES ($1,$2,'p_a','tie?','Strong Contender',true)
  ON CONFLICT (judge_id, project_id) DO UPDATE SET comment = EXCLUDED.comment`, [SID, j1.id]);
await as("anon", "", `INSERT INTO deliberation_notes (school_id, judge_id, project_id, comment, recommendation, flagged) VALUES ($1,$2,'p_a','edited','Strong Contender',true)
  ON CONFLICT (judge_id, project_id) DO UPDATE SET comment = EXCLUDED.comment`, [SID, j1.id]);
assert.equal((await db.query("SELECT comment FROM deliberation_notes WHERE judge_id=$1", [j1.id])).rows[0].comment, "edited");
ok("deliberation notes: judge submits + edits");

// Validations — judge approve, judge REVISE (delete), admin approve
const UPSERT_VAL = `INSERT INTO validations (school_id, judge_id, approved, comment) VALUES ($1,$2,$3,'')
  ON CONFLICT (school_id, judge_id) DO UPDATE SET approved = EXCLUDED.approved`;
await as("anon", "", UPSERT_VAL, [SID, j1.id, true]);
ok("validation: judge approves");
const del = await as("anon", "", "DELETE FROM validations WHERE school_id=$1 AND judge_id=$2 RETURNING 1", [SID, j1.id]);
assert.equal(del.rows.length, 1, "Revise my validation: the anon DELETE removed nothing — RLS has no DELETE policy for judges");
ok("validation: judge can REVISE (delete own row) — the button now really works end to end");
await fails("anon", "", UPSERT_VAL, /row-level security/, "validation: anon cannot write the admin's validation", [SID, "admin", true]);
await as("authenticated", ADMIN, UPSERT_VAL, [SID, "admin", true]);
ok("validation: admin approves");

// Admin-only writes
const SET = `INSERT INTO app_settings (school_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (school_id, key) DO UPDATE SET value = EXCLUDED.value`;
await fails("anon", "", SET, /row-level security/, "lock: a judge cannot unlock/lock judging", [SID, "locked", "false"]);
await as("authenticated", ADMIN, SET, [SID, "locked", "true"]);
await as("authenticated", ADMIN, SET, [SID, "locked", "false"]);
await as("authenticated", ADMIN, SET, [SID, "deliberation_open", "true"]);
await as("authenticated", ADMIN, SET, [SID, "results_finalized", "true"]);
ok("admin: lock / unlock / open deliberation / finalize all write");
await as("anon", "", UPSERT_VAL, [SID, j2.id, true]);
const lateRevise = await as("anon", "", "DELETE FROM validations WHERE school_id=$1 AND judge_id=$2 RETURNING 1", [SID, j2.id]);
assert.equal(lateRevise.rows.length, 0);
ok("validation: once results are FINALIZED a judge can no longer revise");
const adminRowDel = await as("anon", "", "DELETE FROM validations WHERE school_id=$1 AND judge_id='admin' RETURNING 1", [SID]);
assert.equal(adminRowDel.rows.length, 0);
ok("validation: a judge can never delete the admin's validation");
const FD = `INSERT INTO final_decisions (school_id, project_id, award, admin_notes, finalized) VALUES ($1,'p_a','1st Place','',true)
  ON CONFLICT (school_id, project_id) DO UPDATE SET award = EXCLUDED.award`;
await fails("anon", "", FD, /row-level security/, "awards: a judge cannot set awards", [SID]);
await as("authenticated", ADMIN, FD, [SID]);
ok("awards: admin sets final decision");
await fails("anon", "", "INSERT INTO share_links (school_id, token) VALUES ($1, 'T-ANON')", /row-level security/, "share link: anon cannot create one", [SID]);
await as("authenticated", ADMIN, "INSERT INTO share_links (school_id, token, expiry) VALUES ($1, 'T-OK', 'never')", [SID]);
assert.equal((await as("anon", "", "SELECT token FROM share_links WHERE token='T-OK'")).rows.length, 1);
ok("share link: admin creates; the public page can validate the token");

// Remove a project (admin) — cascade the app performs, then RESET
await as("authenticated", ADMIN, "DELETE FROM scores WHERE school_id=$1 AND project_id='p_b'", [SID]);
await as("authenticated", ADMIN, "DELETE FROM projects WHERE school_id=$1 AND id='p_b'", [SID]);
assert.equal((await db.query("SELECT count(*)::int n FROM scores WHERE project_id='p_b'")).rows[0].n, 0);
ok("remove project: admin deletes its scores + the project");
await fails("anon", "", "DELETE FROM projects WHERE id='p_a' RETURNING 1", null, "a judge cannot delete projects").catch(async () => {
  const r = await as("anon", "", "DELETE FROM projects WHERE id='p_a' RETURNING 1"); assert.equal(r.rows.length, 0); ok("a judge cannot delete projects (0 rows)");
});
for (const t of ["scores", "judges", "share_links", "deliberation_notes", "final_decisions", "validations"])
  await as("authenticated", ADMIN, `DELETE FROM ${t} WHERE school_id = $1`, [SID]);
for (const t of ["scores", "judges", "share_links", "deliberation_notes", "final_decisions", "validations"])
  assert.equal((await db.query(`SELECT count(*)::int n FROM ${t} WHERE school_id=$1`, [SID])).rows[0].n, 0, t + " not cleared");
assert.ok((await db.query("SELECT count(*)::int n FROM projects WHERE school_id=$1", [SID])).rows[0].n > 0);
ok("RESET (admin): clears judges/scores/notes/awards/validations/share links, keeps projects");
for (const t of ["scores", "judges"]) {
  const r = await as("anon", "", `DELETE FROM ${t} WHERE school_id = $1 RETURNING 1`, [SID]);
  assert.equal(r.rows.length, 0);
}
ok("RESET is impossible for a judge (anon deletes affect 0 rows)");

console.log(`\nALL ${pass} CHECKS PASSED`);
