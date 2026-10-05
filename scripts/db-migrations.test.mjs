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
  CREATE TABLE auth.users (id uuid primary key);
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
const leak = await as("anon", "", "SELECT group_members FROM projects");
assert.deepEqual(leak.rows[0].group_members, ["Amos", "Noah"]);
ok("BEFORE fix: anon CAN read projects.group_members (the leak is real)");

for (const round of [1, 2]) {
  await db.exec(mig("migration-2026-10-project-details.sql"));
  await db.exec(mig("migration-2026-10b-private-members-and-registration.sql"));
  ok(`migrations 2026-10 + 2026-10b applied (round ${round} — re-runnable)`);
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

console.log(`\nALL ${pass} CHECKS PASSED`);
