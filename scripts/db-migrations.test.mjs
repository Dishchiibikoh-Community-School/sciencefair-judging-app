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

// ── Static guard: Supabase's API sessions load pg-safeupdate ──
// It rejects any DELETE/UPDATE without a WHERE clause (even on a temp table) with
// "DELETE requires a WHERE clause". PGlite does not load it, so this suite cannot catch it by
// running the SQL — set_judge_numbers() shipped `DELETE FROM _jn;` and failed on every save
// in production (2026-10-06). Scan every migration statement instead.
{
  const { readdirSync } = await import("node:fs");
  const bad = [];
  for (const f of readdirSync(new URL("supabase/", REPO)).filter(n => /^migration-.*\.sql$/.test(n))) {
    const sql = file(new URL(`supabase/${f}`, REPO)).replace(/--[^\n]*/g, "");
    for (const stmt of sql.split(";")) {
      const t = stmt.trim();
      if (/^(DELETE\s+FROM|UPDATE)\b/i.test(t) && !/\bWHERE\b/i.test(t)) bad.push(`${f}: ${t.slice(0, 60).replace(/\s+/g, " ")}`);
    }
  }
  assert.deepEqual(bad, [], "DELETE/UPDATE without WHERE (fails on Supabase):\n" + bad.join("\n"));
  ok("every DELETE/UPDATE in every migration has a WHERE clause (pg-safeupdate on Supabase)");
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
  -- Supabase Storage, reduced to what migration 2026-10l touches: buckets, objects (RLS on,
  -- anon/authenticated granted — policies are the gate, as on Supabase).
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
    file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id),
    name text NOT NULL, owner uuid, metadata jsonb, created_at timestamptz DEFAULT now(), UNIQUE (bucket_id, name));
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA storage TO anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
  GRANT SELECT ON storage.buckets TO anon, authenticated;
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
  await db.exec(mig("migration-2026-10e-categories-and-department-codes.sql"));
  await db.exec(mig("migration-2026-10f-scoring-modes.sql"));
  await db.exec(mig("migration-2026-10g-school-judge-numbers.sql"));
  await db.exec(mig("migration-2026-10h-shared-judges.sql"));
  await db.exec(mig("migration-2026-10i-judge-max.sql"));
  await db.exec(mig("migration-2026-10j-department-rubrics.sql"));
  await db.exec(mig("migration-2026-10k-judge-roster-and-panels.sql"));
  await db.exec(mig("migration-2026-10l-school-branding.sql"));
  ok(`migrations 2026-10 … 10l applied (round ${round} — re-runnable)`);
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

// ── PART 3b: per-school categories (migration 2026-10e) ──
const catNames = async (sid) =>
  (await db.query("SELECT name FROM categories WHERE school_id=$1 ORDER BY ord", [sid])).rows.map(r => r.name);
assert.deepEqual(await catNames(SID), [
  "Life Science", "Earth & Environmental Science", "Chemistry & Material Science",
  "Physics, Math & Astronomy", "Engineering, Robotics & Technology", "Energy, Sustainability & Design",
]);
ok("categories: the six shipped categories were seeded for the existing school, in order");
assert.equal((await db.query("SELECT code FROM categories WHERE school_id=$1 AND name='Life Science'", [SID])).rows[0].code, "LS");
ok("categories: registration codes (LS/EES/…) came across");

// A school created AFTER the migration has none — the app's ensureSeedData()
// seeds it on first admin load, and falls back to its built-in list until then.
assert.equal((await catNames(nsid)).length, 0);
ok("categories: a school created later starts empty (app ensureSeedData seeds it)");

// Re-running the migration must not resurrect a category the admin deleted,
// but it SHOULD seed a school that has none yet (self-healing for schools
// created between the migration and the app deploy).
await as("authenticated", ADMIN, "DELETE FROM categories WHERE school_id=$1 AND name='Physics, Math & Astronomy'", [SID]);
await db.exec(mig("migration-2026-10e-categories-and-department-codes.sql"));
assert.ok(!(await catNames(SID)).includes("Physics, Math & Astronomy"));
assert.equal((await catNames(SID)).length, 5);
ok("categories: re-running the migration does NOT resurrect a deleted category");
assert.equal((await catNames(nsid)).length, 6);
ok("categories: …but a re-run DOES seed a school that had none (self-healing)");

// RLS: everyone reads (public registration form + judges), only admins write.
assert.equal((await as("anon", "", "SELECT name FROM categories WHERE school_id=$1", [SID])).rows.length, 5);
ok("categories: anon can read (public registration form needs them)");
await fails("anon", "", "INSERT INTO categories (school_id, name) VALUES ($1, 'Hacked')", /row-level security/,
  "categories: anon cannot add one", [SID]);
await fails("authenticated", OTHER, "INSERT INTO categories (school_id, name) VALUES ($1, 'Hacked')", /row-level security/,
  "categories: a non-admin of this school cannot add one", [SID]);
assert.equal((await as("authenticated", OTHER, "UPDATE categories SET name='x' WHERE school_id=$1 RETURNING 1", [SID])).rows.length, 0);
assert.equal((await as("authenticated", OTHER, "DELETE FROM categories WHERE school_id=$1 RETURNING 1", [SID])).rows.length, 0);
ok("categories: a non-admin's update/delete affects 0 rows");

await as("authenticated", ADMIN, "INSERT INTO categories (school_id, name, code, ord) VALUES ($1, 'Autonomous Robotics', 'AR', 9)", [SID]);
await as("authenticated", ADMIN, "UPDATE categories SET name='Robotics — Autonomous' WHERE school_id=$1 AND code='AR'", [SID]);
assert.ok((await catNames(SID)).includes("Robotics — Autonomous"));
ok("categories: admin can add and rename (a robotics fair can define its own)");
await fails("authenticated", ADMIN, "INSERT INTO categories (school_id, name) VALUES ($1, 'Life Science')",
  /duplicate key|unique/i, "categories: duplicate name in the same school rejected", [SID]);
await fails("authenticated", ADMIN, "INSERT INTO categories (school_id, name) VALUES ($1, 'Robotics — Autonomous')", /row-level security/,
  "categories: an admin of school A cannot add a category to school B", [nsid]);
await as("authenticated", NEWU, "INSERT INTO categories (school_id, name) VALUES ($1, 'Robotics — Autonomous')", [nsid]);
ok("categories: the same name in a DIFFERENT school is fine (per-school isolation)");

// Removing a category must never touch projects already saved under it.
assert.equal((await db.query("SELECT cat FROM projects WHERE id='p_old'")).rows[0].cat, "Life Science");
await as("authenticated", ADMIN, "DELETE FROM categories WHERE school_id=$1 AND name='Life Science'", [SID]);
assert.equal((await db.query("SELECT cat FROM projects WHERE id='p_old'")).rows[0].cat, "Life Science");
ok("categories: deleting one leaves existing projects' category text untouched (no FK, non-destructive)");
await as("authenticated", ADMIN, "INSERT INTO categories (school_id, name, code, ord) VALUES ($1, 'Life Science', 'LS', 0)", [SID]);

assert.equal((await db.query("SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='categories'")).rows.length, 1);
ok("categories: in the realtime publication");

// ── PART 3c: per-department scoring mode (migration 2026-10f) ──
// SID has no departments of its own until PART 4, so make one — an UPDATE that
// matches 0 rows would never reach the CHECK constraint and the test would pass
// for the wrong reason.
const DPK = "d9999999-9999-9999-9999-999999999999";
await as("authenticated", ADMIN,
  `INSERT INTO departments (id, school_id, name, max_judges, ord) VALUES ($1, $2, 'PreK', 2, 9)`, [DPK, SID]);
assert.equal((await db.query("SELECT count(*)::int n FROM departments WHERE scoring_mode <> 'scored'")).rows[0].n, 0);
ok("scoring_mode: every department (new and pre-existing) defaults to 'scored' — behaviour unchanged");
await fails("authenticated", ADMIN,
  `UPDATE departments SET scoring_mode = 'nonsense' WHERE id = $1`, /check constraint/i,
  "scoring_mode: only 'scored' or 'feedback' is accepted", [DPK]);
await as("authenticated", ADMIN, `UPDATE departments SET scoring_mode = 'feedback' WHERE id = $1`, [DPK]);
assert.equal((await db.query("SELECT scoring_mode FROM departments WHERE id=$1", [DPK])).rows[0].scoring_mode, "feedback");
ok("scoring_mode: an admin can switch a department to 'feedback'");
assert.equal((await as("anon", "", "SELECT scoring_mode FROM departments WHERE id=$1", [DPK])).rows[0].scoring_mode, "feedback");
ok("scoring_mode: anon can READ it (it decides which scoring form a judge is shown)");
const anonMode = await as("anon", "", `UPDATE departments SET scoring_mode='scored' WHERE id=$1 RETURNING 1`, [DPK]);
assert.equal(anonMode.rows.length, 0);
assert.equal((await db.query("SELECT scoring_mode FROM departments WHERE id=$1", [DPK])).rows[0].scoring_mode, "feedback");
ok("scoring_mode: a judge cannot change it (0 rows, value untouched)");

// Phase 3 columns exist with behaviour-preserving defaults, but nothing reads them yet.
const d3 = (await db.query(`SELECT column_name, column_default FROM information_schema.columns
  WHERE table_schema='public' AND table_name='departments'
    AND column_name IN ('locked','finalized_at','award_grouping') ORDER BY column_name`)).rows;
assert.equal(d3.length, 3);
assert.match(d3.find(r => r.column_name === "locked").column_default, /false/i);
assert.equal(d3.find(r => r.column_name === "finalized_at").column_default, null);
assert.match(d3.find(r => r.column_name === "award_grouping").column_default, /department/);
ok("Phase 3 columns (locked / finalized_at / award_grouping) exist with safe defaults");
await fails("authenticated", ADMIN,
  `UPDATE departments SET award_grouping = 'nope' WHERE id = $1`, /check constraint/i,
  "award_grouping: only 'category' or 'department' is accepted", [DPK]);

const commCol = (await db.query(`SELECT column_default FROM information_schema.columns
  WHERE table_schema='public' AND table_name='scores' AND column_name='commendation'`)).rows;
assert.equal(commCol.length, 1);
ok("scores.commendation exists for feedback-mode judging");

// departments.code — added now, wired up when registration numbers are unified.
const dcode = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='departments' AND column_name='code'")).rows;
assert.equal(dcode.length, 1);
assert.equal((await db.query("SELECT code FROM departments WHERE school_id=$1 AND name='Elementary'", [nsid])).rows[0].code, "Elem");
ok("departments.code exists and the three default departments were backfilled (Elem/JHS/SHS)");

// ── PART 4: the judging lifecycle, as the app calls it (anon judges, signed-in admin) ──
// This school keeps the pre-2026-10g numbering (Judge1..N restart in every department),
// so the legacy path stays covered. School-wide numbering is PART 5.
await as("authenticated", ADMIN, "INSERT INTO app_settings (school_id, key, value) VALUES ($1, 'judge_numbering', 'department')", [SID]);
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

// ── PART 5: one judge list for the whole school (migration 2026-10g, the DEFAULT) ──
const S2 = "22222222-2222-2222-2222-222222222222";
const XPK = "e0000000-0000-0000-0000-000000000001", XK2 = "e0000000-0000-0000-0000-000000000002", XMS = "e0000000-0000-0000-0000-000000000003";
await db.exec(`
  INSERT INTO schools (id, name, slug, invite_code, admin_pin) VALUES ('${S2}', 'Two', 'two', 'CODE2', '4821');
  INSERT INTO school_admins (school_id, user_id) VALUES ('${S2}', '${ADMIN}');
  INSERT INTO departments (id, school_id, name, max_judges, ord) VALUES
    ('${XPK}', '${S2}', 'PreK', 2, 0), ('${XK2}', '${S2}', 'K-2', 2, 1), ('${XMS}', '${S2}', '6-8', 3, 2);
  INSERT INTO projects (id, school_id, num, title, cat, grade, department_id) VALUES
    ('p_k1', '${S2}', '001', 'Kinder one', 'Life Science', '1', '${XK2}'),
    ('p_k2', '${S2}', '002', 'Kinder two', 'Life Science', '2', '${XK2}');
`);
const ranges = async (sid) => Object.fromEntries((await db.query(
  "SELECT name, judge_from f, judge_to t, max_judges m FROM departments WHERE school_id=$1 ORDER BY ord", [sid])).rows
  .map(r => [r.name, r.f == null ? null : `${r.f}-${r.t}`]));
assert.deepEqual(await ranges(S2), { "PreK": "1-2", "K-2": "3-4", "6-8": "5-7" });
ok("judge numbers: new departments are numbered one after another (PreK 1-2, K-2 3-4, 6-8 5-7)");
assert.equal((await as("anon", "", "SELECT judge_numbering_mode($1) m", [S2])).rows[0].m, "school");
ok("judge numbers: a school with no setting uses the school-wide list (the default)");

// Backfill: a school whose departments predate the migration gets numbered in order.
const S3 = "33333333-3333-3333-3333-333333333333";
await db.exec(`INSERT INTO schools (id, name, slug, invite_code, admin_pin) VALUES ('${S3}', 'Three', 'three', 'C3', '4821');
  INSERT INTO departments (school_id, name, max_judges, ord) VALUES ('${S3}', 'B', 4, 1), ('${S3}', 'A', 15, 0);
  UPDATE departments SET judge_from = NULL, judge_to = NULL WHERE school_id = '${S3}';`);
await db.exec(mig("migration-2026-10g-school-judge-numbers.sql"));
await db.exec(mig("migration-2026-10h-shared-judges.sql"));
await db.exec(mig("migration-2026-10i-judge-max.sql"));
await db.exec(mig("migration-2026-10j-department-rubrics.sql"));
await db.exec(mig("migration-2026-10k-judge-roster-and-panels.sql"));
assert.deepEqual(await ranges(S3), { "A": "1-15", "B": "16-19" });
ok("judge numbers: backfill numbers an existing school's departments in their order, sized by max judges");

const RJ2 = (n, hint = XPK, code = "CODE2") => as("anon", "", RJ, [S2, hint, n, code]);
const k3 = (await RJ2("Judge3")).rows[0].j;
assert.equal(k3.department_id, XK2);
assert.deepEqual([...k3.projects].sort(), ["p_k1", "p_k2"]);
ok("judge numbers: Judge3 lands in K-2 from the number alone — the department the client sent is ignored");
await fails("anon", "", RJ, /already signed in/, "judge numbers: Judge3 cannot sign in a second time", [S2, XMS, "Judge3", "CODE2"]);
await fails("anon", "", RJ, /already signed in/, "judge numbers: 'Judge03' is the same judge as Judge3", [S2, XK2, "Judge03", "CODE2"]);
await fails("anon", "", RJ, /not on this school's judge list/, "judge numbers: Judge8 is outside every range → rejected", [S2, XMS, "Judge8", "CODE2"]);
await fails("anon", "", RJ, /Enter your judge number/, "judge numbers: a non-number name is rejected", [S2, XMS, "Bob", "CODE2"]);
await fails("anon", "", RJ, /Invalid invite code/i, "judge numbers: invite code is still checked first", [S2, XMS, "Judge5", "WRONG"]);

// set_judge_numbers — admin only, validated
const SJN = "SELECT set_judge_numbers($1, $2::jsonb)";
const R = (...xs) => JSON.stringify(xs.map(([id, f, t]) => ({ department_id: id, from: f, to: t })));
await fails("anon", "", SJN, /Not authorised/, "set_judge_numbers: anon refused", [S2, R([XPK, 1, 1])]);
await fails("authenticated", OTHER, SJN, /Not authorised/, "set_judge_numbers: another school's admin refused", [S2, R([XPK, 1, 1])]);
await fails("authenticated", ADMIN, SJN, /Judge3 is signed in to K-2 and would lose it/, "set_judge_numbers: refuses to take a department away from a signed-in judge", [S2, R([XK2, 5, 6], [XMS, 7, 9])]);
await fails("authenticated", ADMIN, SJN, /lowest first/, "set_judge_numbers: backwards range refused", [S2, R([XMS, 9, 5])]);
await as("authenticated", ADMIN, SJN, [S2, R([XPK, 1, 1], [XK2, 2, 4], [XMS, 5, 9])]);
assert.deepEqual(await ranges(S2), { "PreK": "1-1", "K-2": "2-4", "6-8": "5-9" });
assert.deepEqual((await db.query("SELECT max_judges m FROM departments WHERE school_id=$1 ORDER BY ord", [S2])).rows.map(r => r.m), [1, 3, 5]);
ok("set_judge_numbers: admin saves PreK 1-1, K-2 2-4, 6-8 5-9; max judges follow the ranges");
await as("authenticated", ADMIN, SJN, [S2, R([XMS, null, null])]);
await fails("anon", "", RJ, /not on this school's judge list/, "judge numbers: a department with no numbers takes no judges", [S2, XMS, "Judge6", "CODE2"]);
await as("authenticated", ADMIN, SJN, [S2, R([XMS, 5, 9])]);
await db.exec(mig("migration-2026-10g-school-judge-numbers.sql"));
await db.exec(mig("migration-2026-10h-shared-judges.sql"));
await db.exec(mig("migration-2026-10i-judge-max.sql"));
await db.exec(mig("migration-2026-10j-department-rubrics.sql"));
await db.exec(mig("migration-2026-10k-judge-roster-and-panels.sql"));
assert.deepEqual(await ranges(S2), { "PreK": "1-1", "K-2": "2-4", "6-8": "5-9" });
ok("judge numbers: re-running the migration never overwrites the admin's list");

// remove_judge
await as("anon", "", UPSERT_SCORE, [S2, k3.id, "p_k1", JSON.stringify({ presentation: 4 }), ""]);
await as("anon", "", UPSERT_VAL, [S2, k3.id, true]);
const RMJ = "SELECT remove_judge($1, $2) r";
await fails("anon", "", RMJ, /Not authorised/, "remove_judge: anon refused", [S2, k3.id]);
await fails("authenticated", OTHER, RMJ, /Not authorised/, "remove_judge: another school's admin refused", [S2, k3.id]);
const rm = (await as("authenticated", ADMIN, RMJ, [S2, k3.id])).rows[0].r;
assert.deepEqual(rm, { alias: "Judge3", scores: 1 });
for (const t of ["judges", "scores", "validations"])
  assert.equal((await db.query(`SELECT count(*)::int n FROM ${t} WHERE school_id=$1`, [S2])).rows[0].n, 0, t);
ok("remove_judge: admin removes Judge3 with their score + validation, nothing orphaned");
assert.equal((await RJ2("Judge3")).rows[0].j.department_id, XK2);
ok("remove_judge: the number is free again — Judge3 can sign in afresh");

// Opting back into the old numbering
await as("authenticated", ADMIN, SET, [S2, "judge_numbering", "department"]);
assert.equal((await RJ2("Judge1", XMS)).rows[0].j.department_id, XMS);
ok("judge numbering 'department': numbers restart per department again (Judge1 registers in 6-8)");

// ── PART 6: departments share judges (migration 2026-10h) ──
const S4 = "44444444-4444-4444-4444-444444444444";
const YPK = "f0000000-0000-0000-0000-000000000001", YK2 = "f0000000-0000-0000-0000-000000000002", Y35 = "f0000000-0000-0000-0000-000000000003";
await db.exec(`
  INSERT INTO schools (id, name, slug, invite_code, admin_pin) VALUES ('${S4}', 'Four', 'four', 'CODE4', '4821');
  INSERT INTO school_admins (school_id, user_id) VALUES ('${S4}', '${ADMIN}');
  INSERT INTO departments (id, school_id, name, max_judges, ord) VALUES
    ('${YPK}', '${S4}', 'PreK', 2, 0), ('${YK2}', '${S4}', 'K-2', 2, 1), ('${Y35}', '${S4}', '3-5', 2, 2);
  INSERT INTO projects (id, school_id, num, title, cat, grade, department_id) VALUES
    ('q_pk', '${S4}', '001', 'PreK one', 'Life Science', 'K', '${YPK}'),
    ('q_k2', '${S4}', '002', 'K-2 one',  'Life Science', '1', '${YK2}'),
    ('q_35', '${S4}', '003', '3-5 one',  'Life Science', '4', '${Y35}');
`);
const deptsOf = async (alias) => (await db.query("SELECT department_id, department_ids, projects FROM judges WHERE school_id=$1 AND alias=$2", [S4, alias])).rows[0];
// PreK and K-2 share Judge 1-2; 3-5 has Judge 3-4.
await as("authenticated", ADMIN, SJN, [S4, R([YPK, 1, 2], [YK2, 1, 2], [Y35, 3, 4])]);
assert.deepEqual(await ranges(S4), { "PreK": "1-2", "K-2": "1-2", "3-5": "3-4" });
ok("sharing: overlapping ranges are accepted (PreK and K-2 both Judge 1-2)");
const s1 = (await as("anon", "", RJ, [S4, Y35, "Judge1", "CODE4"])).rows[0].j;
assert.equal(s1.department_id, YPK);
assert.deepEqual(s1.department_ids, [YPK, YK2]);
assert.deepEqual(s1.projects, ["q_pk", "q_k2"]);
ok("sharing: Judge1 covers PreK + K-2 and gets both departments' projects (first department = PreK)");
const s3 = (await as("anon", "", RJ, [S4, YPK, "Judge3", "CODE4"])).rows[0].j;
assert.deepEqual(s3.department_ids, [Y35]); assert.deepEqual(s3.projects, ["q_35"]);
ok("sharing: Judge3 (not shared) covers only 3-5");
await fails("anon", "", RJ, /already signed in/, "sharing: a shared number is still one person", [S4, YK2, "Judge1", "CODE4"]);

// Admin widens 3-5 to also cover Judge1 → Judge1 GAINS 3-5, projects re-synced.
await as("authenticated", ADMIN, SJN, [S4, R([Y35, 1, 4])]);
let d1 = await deptsOf("Judge1");
assert.deepEqual(d1.department_ids, [YPK, YK2, Y35]);
assert.deepEqual(d1.projects, ["q_pk", "q_k2", "q_35"]);
assert.equal(d1.department_id, YPK);
ok("sharing: widening a range after sign-in adds the department + its projects to the judge");
// Taking K-2 away from Judge1 is refused (they may have been told to sit there).
await fails("authenticated", ADMIN, SJN, /Judge1 is signed in to K-2 and would lose it/,
  "sharing: narrowing a range so a signed-in judge loses a department is refused", [S4, R([YK2, 2, 2])]);
// …even if they have not scored there yet, and the stored ranges are untouched.
assert.deepEqual(await ranges(S4), { "PreK": "1-2", "K-2": "1-2", "3-5": "1-4" });
ok("sharing: a refused save changes nothing");
// Judge2 has not signed in, so moving 2 out of K-2 is fine.
await as("authenticated", ADMIN, SJN, [S4, R([YPK, 1, 1], [YK2, 1, 1])]);
assert.deepEqual(await ranges(S4), { "PreK": "1-1", "K-2": "1-1", "3-5": "1-4" });
assert.deepEqual((await deptsOf("Judge1")).department_ids, [YPK, YK2, Y35]);
ok("sharing: ranges can shrink around numbers nobody has signed in with");
// remove_judge still cleans up a multi-department judge completely.
await as("anon", "", UPSERT_SCORE, [S4, s1.id, "q_k2", "{}", "kind words"]);
const rm4 = (await as("authenticated", ADMIN, RMJ, [S4, s1.id])).rows[0].r;
assert.equal(rm4.scores, 1);
assert.equal((await db.query("SELECT count(*)::int n FROM judges WHERE school_id=$1 AND alias='Judge1'", [S4])).rows[0].n, 0);
ok("sharing: removing a shared judge removes their scores in every department");
// Rows created before 2026-10h (no department_ids yet) are backfilled to [department_id].
await db.exec(`INSERT INTO judges (id, school_id, alias, projects, department_id, department_ids)
  VALUES ('j_old', '${S4}', 'Judge4', '[]', '${Y35}', '[]')`);
await db.exec(mig("migration-2026-10h-shared-judges.sql"));
await db.exec(mig("migration-2026-10i-judge-max.sql"));
await db.exec(mig("migration-2026-10j-department-rubrics.sql"));
await db.exec(mig("migration-2026-10k-judge-roster-and-panels.sql"));
assert.deepEqual((await deptsOf("Judge4")).department_ids, [Y35]);
ok("sharing: a pre-2026-10h judge row is backfilled to department_ids = [department_id]");

// ── PART 7: maximum judge number (migration 2026-10i) — default 15, up to 90 ──
const S5 = "55555555-5555-5555-5555-555555555555";
const Z = (n) => `a0000000-0000-0000-0000-00000000000${n}`;
await db.exec(`
  INSERT INTO schools (id, name, slug, invite_code, admin_pin) VALUES ('${S5}', 'Five', 'five', 'CODE5', '4821');
  INSERT INTO school_admins (school_id, user_id) VALUES ('${S5}', '${ADMIN}');
  INSERT INTO departments (id, school_id, name, max_judges, ord) VALUES
    ('${Z(1)}', '${S5}', 'Elementary', 5, 0), ('${Z(2)}', '${S5}', 'Middle', 5, 1), ('${Z(3)}', '${S5}', 'High', 5, 2);
`);
assert.equal((await as("anon", "", "SELECT judge_max($1) m", [S5])).rows[0].m, 15);
assert.deepEqual(await ranges(S5), { "Elementary": "1-5", "Middle": "6-10", "High": "11-15" });
ok("judge max: a new school defaults to 15 — three departments of 5 fill Judge 1-15");
await as("authenticated", ADMIN, `INSERT INTO departments (id, school_id, name, max_judges, ord) VALUES ('${Z(4)}', '${S5}', 'SPED', 5, 3)`);
assert.equal((await ranges(S5))["SPED"], null);
ok("judge max: a department that would go past 15 starts with no judge numbers");
await fails("anon", "", RJ, /not on this school's judge list/, "judge max: Judge16 cannot sign in", [S5, Z(1), "Judge16", "CODE5"]);
await fails("authenticated", ADMIN, SJN, /SPED would use judge numbers up to 20, but the maximum is 15/,
  "judge max: saving a range past the maximum is refused", [S5, R([Z(4), 16, 20])]);
const SJM = "SELECT set_judge_max($1, $2)";
await fails("anon", "", SJM, /Not authorised/, "set_judge_max: anon refused", [S5, 30]);
await fails("authenticated", OTHER, SJM, /Not authorised/, "set_judge_max: another school's admin refused", [S5, 30]);
await fails("authenticated", ADMIN, SJM, /between 1 and 90/, "set_judge_max: 91 refused", [S5, 91]);
await fails("authenticated", ADMIN, SJM, /between 1 and 90/, "set_judge_max: 0 refused", [S5, 0]);
await fails("authenticated", ADMIN, SJM, /already go up to 15 \(High\)/, "set_judge_max: cannot go below a number in use", [S5, 10]);
await as("authenticated", ADMIN, SJM, [S5, 90]);
assert.equal((await as("anon", "", "SELECT judge_max($1) m", [S5])).rows[0].m, 90);
await as("authenticated", ADMIN, SJN, [S5, R([Z(4), 16, 20])]);
assert.equal((await ranges(S5))["SPED"], "16-20");
assert.equal((await as("anon", "", RJ, [S5, Z(1), "Judge18", "CODE5"])).rows[0].j.department_id, Z(4));
ok("judge max: raised to 90 → SPED gets Judge 16-20 and Judge18 signs in to SPED");
await as("authenticated", ADMIN, SET, [S5, "judge_max", "500"]);
assert.equal((await as("anon", "", "SELECT judge_max($1) m", [S5])).rows[0].m, 90);
ok("judge max: a stored value above 90 is still capped at 90");
assert.equal((await db.query("SELECT value FROM app_settings WHERE school_id=$1 AND key='judge_max'", [S3])).rows[0]?.value, "19");
ok("judge max: backfill keeps an existing school at the size it already uses (Judge 1-19 → 19)");

// ── PART 8: each department picks its rubric (migration 2026-10j) ──
const S6 = "66666666-6666-6666-6666-666666666666";
const RB = (n) => `b0000000-0000-0000-0000-00000000000${n}`;
const DD = (n) => `c0000000-0000-0000-0000-00000000000${n}`;
await db.exec(`
  INSERT INTO schools (id, name, slug, invite_code, admin_pin) VALUES ('${S6}', 'Six', 'six', 'CODE6', '4821');
  INSERT INTO school_admins (school_id, user_id) VALUES ('${S6}', '${ADMIN}');
  INSERT INTO rubrics (id, school_id, name, criteria, is_active) VALUES
    ('${RB(1)}', '${S6}', 'Northeast AZ', '[{"id":"presentation","max":6,"steps":[0,2,4,6]}]', true),
    ('${RB(2)}', '${S6}', 'Cibecue 100',  '[{"id":"title","max":15,"steps":[3,6,9,12,15]}]', false),
    ('${RB(3)}', '${S6}', 'Detailed 20',  '[{"id":"t1","max":5,"steps":[1,2,3,4,5]}]', false),
    ('${RB(4)}', '${S6}', 'Spare',        '[{"id":"x","max":3,"steps":[0,3]}]', false);
  INSERT INTO departments (id, school_id, name, max_judges, ord) VALUES
    ('${DD(1)}', '${S6}', 'Lower', 2, 0), ('${DD(2)}', '${S6}', 'Upper', 2, 1);
  INSERT INTO projects (id, school_id, num, title, cat, grade, department_id) VALUES
    ('r_lo', '${S6}', '001', 'Lower one', 'Life Science', '3', '${DD(1)}'),
    ('r_up', '${S6}', '002', 'Upper one', 'Life Science', '8', '${DD(2)}');
`);
await fails("authenticated", ADMIN, `INSERT INTO rubrics (school_id, name, criteria, is_active) VALUES ('${S6}', 'Second default', '[]', true)`,
  /rubrics_one_default_per_school/, "rubrics: a school cannot have two default rubrics");
const setDeptRub = (d, r) => as("authenticated", ADMIN, "UPDATE departments SET rubric_id = $2 WHERE id = $1 RETURNING rubric_id", [d, r]);
await setDeptRub(DD(2), RB(2));
assert.equal((await db.query("SELECT rubric_id FROM departments WHERE id=$1", [DD(2)])).rows[0].rubric_id, RB(2));
ok("rubrics: admin gives Upper the Cibecue rubric (Lower keeps the default)");
const OTHER_RUB = "b0000000-0000-0000-0000-000000000099";
await db.exec(`INSERT INTO rubrics (id, school_id, name, criteria, is_active) VALUES ('${OTHER_RUB}', '${S5}', 'Five default', '[]', true)
  ON CONFLICT DO NOTHING`);
await fails("authenticated", ADMIN, "UPDATE departments SET rubric_id = $2 WHERE id = $1", /does not belong to this school/,
  "rubrics: a department cannot use another school's rubric", [DD(1), OTHER_RUB]);
await fails("anon", "", "UPDATE departments SET rubric_id = $2 WHERE id = $1 RETURNING 1", null,
  "rubrics: anon cannot change a department's rubric", [DD(2), RB(3)]).catch(async () => {
  const r = await as("anon", "", "UPDATE departments SET rubric_id = $2 WHERE id = $1 RETURNING 1", [DD(2), RB(3)]);
  assert.equal(r.rows.length, 0); ok("rubrics: anon cannot change a department's rubric (0 rows)");
});

// A judge scores in both departments.
const rj = (await as("anon", "", RJ, [S6, DD(1), "Judge1", "CODE6"])).rows[0].j;
await as("anon", "", UPSERT_SCORE, [S6, rj.id, "r_up", JSON.stringify({ title: 12 }), ""]);
await fails("authenticated", ADMIN, "UPDATE departments SET rubric_id = $2 WHERE id = $1", /Upper already has scores/,
  "rubrics: a scored department's rubric cannot change", [DD(2), RB(3)]);
await fails("authenticated", ADMIN, "UPDATE departments SET scoring_mode = 'feedback' WHERE id = $1", /Upper already has scores/,
  "rubrics: a scored department cannot switch to comment-only (now enforced on the server)", [DD(2)]);
await setDeptRub(DD(2), RB(2));
ok("rubrics: saving the SAME rubric on a scored department is fine");
await as("authenticated", ADMIN, "UPDATE departments SET name = 'Upper grades' WHERE id = $1", [DD(2)]);
ok("rubrics: renaming a scored department is still allowed");

// Delete guards
await fails("authenticated", ADMIN, "DELETE FROM rubrics WHERE id = $1", /is used by Upper grades/, "rubrics: a rubric in use cannot be deleted", [RB(2)]);
await fails("authenticated", ADMIN, "DELETE FROM rubrics WHERE id = $1", /is the default rubric/, "rubrics: the default rubric cannot be deleted", [RB(1)]);
assert.equal((await as("authenticated", ADMIN, "DELETE FROM rubrics WHERE id = $1 RETURNING 1", [RB(4)])).rows.length, 1);
ok("rubrics: an unused rubric can be deleted");

// Default switching
const SDR = "SELECT set_default_rubric($1, $2)";
await fails("anon", "", SDR, /Not authorised/, "set_default_rubric: anon refused", [S6, RB(3)]);
await as("anon", "", UPSERT_SCORE, [S6, rj.id, "r_lo", JSON.stringify({ presentation: 4 }), ""]);
await fails("authenticated", ADMIN, SDR, /Lower follows the default rubric and already has scores/,
  "set_default_rubric: refused while a scored department follows the default", [S6, RB(3)]);
await setDeptRub(DD(1), RB(1));
ok("rubrics: pinning Lower to the rubric it already uses is allowed even with scores");
await as("authenticated", ADMIN, SDR, [S6, RB(3)]);
assert.deepEqual((await db.query("SELECT id FROM rubrics WHERE school_id=$1 AND is_active", [S6])).rows.map(r => r.id), [RB(3)]);
ok("set_default_rubric: switches the default in one step (exactly one default)");
assert.equal((await as("anon", "", "SELECT name, rubric_id FROM departments WHERE id=$1", [DD(2)])).rows[0].rubric_id, RB(2));
ok("rubrics: judges (anon) can read each department's rubric_id");

// Deleting the whole school is not blocked by the guards.
await db.exec(`DELETE FROM scores WHERE school_id = '${S6}'; DELETE FROM judges WHERE school_id = '${S6}'; DELETE FROM schools WHERE id = '${S6}'`);
assert.equal((await db.query("SELECT count(*)::int n FROM rubrics WHERE school_id=$1", [S6])).rows[0].n, 0);
ok("rubrics: deleting a school still cascades through its rubrics");

// ── PART 9: judge roster grid + "N judges per project" panels (migration 2026-10k) ──
const S7 = "77777777-7777-7777-7777-777777777777";
const G = (n) => `d7000000-0000-0000-0000-00000000000${n}`;
await db.exec(`
  INSERT INTO schools (id, name, slug, invite_code, admin_pin) VALUES ('${S7}', 'Seven', 'seven', 'CODE7', '4821');
  INSERT INTO school_admins (school_id, user_id) VALUES ('${S7}', '${ADMIN}');
  INSERT INTO departments (id, school_id, name, max_judges, ord) VALUES
    ('${G(1)}', '${S7}', 'Alpha', 3, 0), ('${G(2)}', '${S7}', 'Beta', 3, 1), ('${G(3)}', '${S7}', 'Gamma', 3, 2);
`);
const roster = async (sid) => (await db.query(
  "SELECT r.judge_number n, d.name FROM judge_roster r JOIN departments d ON d.id = r.department_id WHERE r.school_id=$1 ORDER BY 1, d.ord", [sid])).rows
  .map(r => `${r.n}:${r.name}`);
assert.deepEqual(await roster(S7), ["1:Alpha","2:Alpha","3:Alpha","4:Beta","5:Beta","6:Beta","7:Gamma","8:Gamma","9:Gamma"]);
ok("roster: new departments get their default block of numbers in the roster too (1-3, 4-6, 7-9)");

const SJR = "SELECT set_judge_roster($1, $2::jsonb)";
const RG = (...xs) => JSON.stringify(xs.map(([n, ...ds]) => ({ number: n, department_ids: ds })));
await fails("anon", "", SJR, /Not authorised/, "set_judge_roster: anon refused", [S7, RG([1, G(1)])]);
await fails("authenticated", OTHER, SJR, /Not authorised/, "set_judge_roster: another school's admin refused", [S7, RG([1, G(1)])]);
await fails("authenticated", ADMIN, "INSERT INTO judge_roster (school_id, judge_number, department_id) VALUES ($1, 50, $2)",
  /row-level security/, "roster: even an admin cannot write the table directly (RPC only)", [S7, G(1)]);
// Any pattern: Alpha = {1, 2, 5, 8} (not a range), Judge 5 shared by Alpha + Gamma.
await as("authenticated", ADMIN, SJR, [S7, RG([1, G(1), G(2)], [2, G(1)], [5, G(1), G(3)], [8, G(1), G(2)], [9, G(3)])]);
assert.deepEqual(await roster(S7), ["1:Alpha","1:Beta","2:Alpha","5:Alpha","5:Gamma","8:Alpha","8:Beta","9:Gamma"]);
ok("roster: any pattern saves — Alpha judged by 1, 2, 5 and 8 (not a range)");
const R7 = (n, hint = G(2)) => as("anon", "", RJ, [S7, hint, `Judge${n}`, "CODE7"]);
const j5 = (await R7(5)).rows[0].j;
assert.deepEqual(j5.department_ids, [G(1), G(3)]); assert.equal(j5.department_id, G(1));
ok("roster: Judge5 covers Alpha + Gamma, straight from the grid");
await fails("anon", "", RJ, /not on this school's judge list/, "roster: a number nobody ticked cannot sign in", [S7, G(1), "Judge3", "CODE7"]);
await fails("authenticated", ADMIN, SJR, /outside 1–15/, "roster: a number above the maximum is refused", [S7, RG([16, G(1)])]);
await fails("authenticated", ADMIN, SJR, /Judge5 is signed in to Gamma and would lose it/,
  "roster: un-ticking a signed-in judge's department is refused", [S7, RG([1, G(1)], [5, G(1)])]);
assert.ok((await roster(S7)).includes("5:Gamma"));
ok("roster: a refused save changes nothing");
await as("authenticated", ADMIN, SJR, [S7, RG([1, G(1), G(2)], [2, G(1)], [5, G(1), G(2), G(3)], [8, G(1), G(2)], [9, G(3)])]);
assert.deepEqual((await db.query("SELECT department_ids FROM judges WHERE school_id=$1 AND alias='Judge5'", [S7])).rows[0].department_ids, [G(1), G(2), G(3)]);
ok("roster: ticking another department for a signed-in judge adds it to them");
await fails("authenticated", ADMIN, "SELECT set_judge_max($1, 4)", /already go up to 9 \(Gamma\)/, "set_judge_max: checks the roster's highest number", [S7]);

// Private names
await as("authenticated", ADMIN, "INSERT INTO judge_labels (school_id, judge_number, label) VALUES ($1, 5, 'Ms. Rabah')", [S7]);
assert.equal((await as("authenticated", ADMIN, "SELECT label FROM judge_labels WHERE school_id=$1", [S7])).rows[0].label, "Ms. Rabah");
ok("labels: an admin can name judge numbers");
await fails("anon", "", "SELECT label FROM judge_labels", /permission denied/, "labels: anon cannot read judge names at all");
assert.equal((await as("authenticated", OTHER, "SELECT label FROM judge_labels WHERE school_id=$1", [S7])).rows.length, 0);
ok("labels: another school's admin sees none of them");
await fails("anon", "", "INSERT INTO judge_labels (school_id, judge_number, label) VALUES ($1, 1, 'x')", /permission denied/, "labels: anon cannot write", [S7]);

// ── Panels: Panel dept, 4 judges, 7 projects, 3 judges per project ──
const PD = G(4);
await as("authenticated", ADMIN, `INSERT INTO departments (id, school_id, name, max_judges, ord) VALUES ('${PD}', '${S7}', 'Panel', 1, 3)`);
await as("authenticated", ADMIN, `INSERT INTO projects (id, school_id, num, title, cat, grade, department_id) VALUES
  ('q1','${S7}','101','P1','Life Science','7','${PD}'), ('q2','${S7}','102','P2','Life Science','7','${PD}'),
  ('q3','${S7}','103','P3','Life Science','7','${PD}'), ('q4','${S7}','104','P4','Life Science','7','${PD}'),
  ('q5','${S7}','105','P5','Life Science','7','${PD}'), ('q6','${S7}','106','P6','Life Science','7','${PD}'),
  ('q7','${S7}','107','P7','Life Science','7','${PD}')`);
await as("authenticated", ADMIN, SJR, [S7, RG([1, G(1), G(2)], [2, G(1)], [5, G(1), G(2), G(3)], [8, G(1), G(2)], [9, G(3)],
  [11, PD], [12, PD], [13, PD], [14, PD])]);
const pj = async () => (await db.query("SELECT project_id p, judge_number n FROM project_judges WHERE school_id=$1 ORDER BY 1, 2", [S7])).rows;
const SPP = "SELECT set_judges_per_project($1, $2, $3) r";
await fails("anon", "", SPP, /Not authorised/, "panels: anon cannot set judges per project", [S7, PD, 3]);
const res = (await as("authenticated", ADMIN, SPP, [S7, PD, 3])).rows[0].r;
assert.equal(res.short, 0);
const a1 = await pj();
const perProj = {}, perSeat = {};
for (const r of a1) { perProj[r.p] = (perProj[r.p] || 0) + 1; perSeat[r.n] = (perSeat[r.n] || 0) + 1; }
assert.deepEqual(Object.values(perProj), [3,3,3,3,3,3,3]);
const loads = Object.values(perSeat);
assert.equal(loads.reduce((a, b) => a + b, 0), 21); assert.ok(Math.max(...loads) - Math.min(...loads) <= 1, JSON.stringify(perSeat));
ok("panels: 3 judges per project → every project has 3 different judges, loads balanced (5-6 each of 4)");
const j11 = (await R7(11, PD)).rows[0].j;
assert.deepEqual([...j11.projects].sort(), a1.filter(r => r.n === 11).map(r => r.p).sort());
ok("panels: Judge11 signs in and gets ONLY their assigned projects");
assert.equal((await db.query("SELECT projects FROM judges WHERE school_id=$1 AND alias='Judge5'", [S7])).rows[0].projects.length >= 0, true);

// Judge11 scores one of theirs; a rebuild never takes it away.
const scoredP = j11.projects[0];
await as("anon", "", UPSERT_SCORE, [S7, j11.id, scoredP, JSON.stringify({ x: 3 }), ""]);
await as("authenticated", ADMIN, "SELECT assign_panels($1, $2, 'rebuild')", [S7, PD]);
assert.ok((await pj()).some(r => r.p === scoredP && r.n === 11));
ok("panels: rebuild keeps every scored assignment");

// A late project is filled in without reshuffling anyone.
const before = JSON.stringify((await pj()).filter(r => r.p !== "q8"));
await as("authenticated", ADMIN, `INSERT INTO projects (id, school_id, num, title, cat, grade, department_id) VALUES ('q8','${S7}','108','P8','Life Science','7','${PD}')`);
await as("authenticated", ADMIN, "SELECT sync_judge_projects($1, $2::uuid[])", [S7, `{${PD}}`]);
const after = await pj();
assert.equal(after.filter(r => r.p === "q8").length, 3);
assert.equal(JSON.stringify(after.filter(r => r.p !== "q8")), before);
ok("panels: a late project gets 3 judges and nobody else's list changes");
const j11now = (await db.query("SELECT projects FROM judges WHERE school_id=$1 AND alias='Judge11'", [S7])).rows[0].projects;
assert.deepEqual([...j11now].sort(), after.filter(r => r.n === 11).map(r => r.p).sort());
ok("panels: signed-in judges' lists are re-synced");

// No-shows: only 11 and 12 signed in → rebalance moves unscored work off 13 and 14.
const j12 = (await R7(12, PD)).rows[0].j;
await fails("authenticated", OTHER, "SELECT assign_panels($1, $2, 'rebalance')", /Not authorised/, "panels: another school's admin cannot rebalance", [S7, PD]);
const rb = (await as("authenticated", ADMIN, "SELECT assign_panels($1, $2, 'rebalance') r", [S7, PD])).rows[0].r;
const afterRb = await pj();
assert.ok(afterRb.every(r => r.n === 11 || r.n === 12), JSON.stringify(afterRb.filter(r => r.n > 12)));
assert.ok(afterRb.some(r => r.p === scoredP && r.n === 11));
assert.equal(rb.short, 8, "with only 2 judges present every project is short of 3");
ok("panels: rebalance moves unscored work from absent judges to present ones and reports the shortfall");
{
  const keep = JSON.stringify(await pj());
  await as("authenticated", ADMIN, `INSERT INTO projects (id, school_id, num, title, cat, grade, department_id) VALUES ('q9','${S7}','109','P9','Life Science','7','${PD}')`);
  await as("authenticated", ADMIN, "SELECT sync_judge_projects($1, $2::uuid[])", [S7, `{${PD}}`]);
  const now9 = await pj();
  assert.equal(JSON.stringify(now9.filter(r => r.p !== "q9")), keep, "a late project must not top up projects left short by a rebalance");
  assert.equal(now9.filter(r => r.p === "q9").length, 3);
  await as("authenticated", ADMIN, "DELETE FROM projects WHERE school_id=$1 AND id='q9'", [S7]);
  ok("panels: after a rebalance, a late project gets judges WITHOUT handing work back to absent judges");
}
assert.ok((await db.query("SELECT projects FROM judges WHERE school_id=$1 AND alias='Judge12'", [S7])).rows[0].projects.length > 0);

// Guard: no change once the department has scores.
await fails("authenticated", ADMIN, SPP, /Panel already has scores/, "panels: judges-per-project locks once the department has scores", [S7, PD, 2]);
// Removing a project cascades its assignments.
await as("authenticated", ADMIN, "DELETE FROM projects WHERE school_id=$1 AND id='q8'", [S7]);
assert.equal((await pj()).filter(r => r.p === "q8").length, 0);
ok("panels: deleting a project deletes its assignments");
await fails("anon", "", "INSERT INTO project_judges (school_id, project_id, judge_number) VALUES ($1, 'q1', 99)", /row-level security/,
  "panels: assignments cannot be written directly", [S7]);

// Back to "every judge scores every project" (fresh department, no scores).
const PD2 = G(5);
await as("authenticated", ADMIN, `INSERT INTO departments (id, school_id, name, max_judges, ord) VALUES ('${PD2}', '${S7}', 'Panel2', 1, 4)`);
await as("authenticated", ADMIN, `INSERT INTO projects (id, school_id, num, title, cat, grade, department_id) VALUES
  ('r1','${S7}','201','R1','Life Science','9','${PD2}'), ('r2','${S7}','202','R2','Life Science','9','${PD2}')`);
const rosterNow = (await db.query("SELECT judge_number n, array_agg(department_id::text) ds FROM judge_roster WHERE school_id=$1 GROUP BY 1", [S7])).rows;
await as("authenticated", ADMIN, SJR, [S7, JSON.stringify(rosterNow.map(r => ({ number: r.n, department_ids: r.n === 12 ? [...r.ds, PD2] : r.ds })))]);
await as("authenticated", ADMIN, SPP, [S7, PD2, 1]);
assert.equal((await pj()).filter(r => r.p.startsWith("r")).length, 2);
await as("authenticated", ADMIN, SPP, [S7, PD2, null]);
assert.equal((await pj()).filter(r => r.p.startsWith("r")).length, 0);
const j12p = (await db.query("SELECT projects FROM judges WHERE school_id=$1 AND alias='Judge12'", [S7])).rows[0].projects;
assert.ok(j12p.includes("r1") && j12p.includes("r2"));
ok("panels: clearing judges-per-project goes back to every judge scoring every project");

// The old range editor (cached app) still works — it now writes the roster.
await as("authenticated", ADMIN, "SELECT set_judge_numbers($1, $2::jsonb)", [S7, JSON.stringify([{ department_id: G(3), from: 5, to: 9 }])]);
assert.ok((await roster(S7)).filter(x => x.endsWith(":Gamma")).map(x => +x.split(":")[0]).join() === "5,6,7,8,9");
ok("compat: set_judge_numbers (old range editor) writes the roster");

// ── PART 10: per-school branding (migration 2026-10l) ──
{
  const LEG = "5667eba1-2f45-4830-96b7-6a6467113dfc";   // Dishchii'bikoh on the live project
  const SB = "SELECT set_school_branding($1, $2, $3, $4) AS r";
  const brand = async (sid) => (await db.query("SELECT * FROM school_branding WHERE school_id=$1", [sid])).rows[0];
  const upload = (uid, name) => as("authenticated", uid,
    "INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('school-branding', $1, $2) RETURNING name", [name, uid]);

  await db.exec(`INSERT INTO schools (id, name, slug, invite_code, admin_pin)
    VALUES ('${LEG}', 'Dishchii''bikoh', 'dishchiibikoh-community-school', 'LEGCODE1', '4821')`);
  await db.exec(mig("migration-2026-10l-school-branding.sql"));
  assert.equal((await brand(LEG))?.logo_path, "builtin:dishchiibikoh");
  assert.equal(await brand(SID), undefined);
  ok("branding: the existing logo is kept for Dishchii'bikoh only (id + slug); other schools get no row");

  await db.exec(`DELETE FROM school_branding WHERE school_id = '${LEG}'`);
  await db.exec(`UPDATE schools SET slug = 'someone-else' WHERE id = '${LEG}'`);
  await db.exec(mig("migration-2026-10l-school-branding.sql"));
  assert.equal(await brand(LEG), undefined);
  await db.exec(`UPDATE schools SET slug = 'dishchiibikoh-community-school' WHERE id = '${LEG}'`);
  await db.exec(mig("migration-2026-10l-school-branding.sql"));
  assert.equal((await brand(LEG))?.logo_path, "builtin:dishchiibikoh");
  ok("branding: the seed needs BOTH the id and the slug to match");

  const bucket = (await db.query("SELECT * FROM storage.buckets WHERE id='school-branding'")).rows[0];
  assert.equal(bucket.public, true);
  assert.equal(Number(bucket.file_size_limit), 2097152);
  assert.deepEqual(bucket.allowed_mime_types, ["image/webp", "image/png", "image/jpeg"]);
  ok("branding: public bucket, 2 MB limit, WebP/PNG/JPEG only");

  assert.equal((await as("anon", "", "SELECT logo_path FROM school_branding WHERE school_id=$1", [LEG])).rows.length, 1);
  ok("branding: anon can READ a school's branding (landing / registration / results pages)");
  await fails("anon", "", `INSERT INTO school_branding (school_id, logo_path) VALUES ('${SID}', 'x')`, /permission denied/, "branding: anon cannot write the table");
  await fails("authenticated", ADMIN, `INSERT INTO school_branding (school_id, logo_path) VALUES ('${SID}', 'x')`, /permission denied/, "branding: even an admin cannot write the table directly (RPC only)");
  await fails("authenticated", ADMIN, `UPDATE school_branding SET logo_path = NULL WHERE school_id = '${LEG}'`, /permission denied/, "branding: …nor change another school's row");
  await fails("anon", "", SB, /permission denied for function/, "branding: anon cannot call set_school_branding", [SID, "logo", null, null]);
  await fails("authenticated", OTHER, SB, /Not authorised/, "branding: a signed-in NON-admin is refused", [SID, "logo", null, null]);
  await fails("authenticated", ADMIN, SB, /Not authorised/, "branding: an admin cannot change ANOTHER school's branding", [LEG, "logo", null, null]);

  // Storage: only into your own school's folder, only names the app generates.
  const LP = `${SID}/logo-abcdef123456.webp`;
  assert.equal((await upload(ADMIN, LP)).rows[0].name, LP);
  ok("storage: an admin can upload into their own school's folder");
  await fails("authenticated", ADMIN, "INSERT INTO storage.objects (bucket_id, name) VALUES ('school-branding', $1)", /row-level security/,
    "storage: …but NOT into another school's folder", [`${LEG}/logo-abcdef123456.webp`]);
  await fails("authenticated", OTHER, "INSERT INTO storage.objects (bucket_id, name) VALUES ('school-branding', $1)", /row-level security/,
    "storage: a signed-in non-admin cannot upload", [`${SID}/logo-zzzzzz123456.webp`]);
  await fails("anon", "", "INSERT INTO storage.objects (bucket_id, name) VALUES ('school-branding', $1)", /row-level security/,
    "storage: anon cannot upload", [`${SID}/logo-yyyyyy123456.webp`]);
  for (const bad of [`${SID}/page.html`, `${SID}/logo-abcdef123456.svg`, `${SID}/x/logo-abcdef123456.webp`, `${SID}/logo-short.webp`, `../${SID}/logo-abcdef123456.webp`]) {
    await fails("authenticated", ADMIN, "INSERT INTO storage.objects (bucket_id, name) VALUES ('school-branding', $1)", /row-level security/,
      `storage: name refused — ${bad.replace(SID, "<sid>")}`, [bad]);
  }

  // set_school_branding: path rules
  await fails("authenticated", ADMIN, SB, /does not belong/, "rpc: another school's file is refused", [SID, "logo", `${LEG}/logo-abcdef123456.webp`, null]);
  await fails("authenticated", ADMIN, SB, /does not belong/, "rpc: the built-in logo cannot be claimed by another school", [SID, "logo", "builtin:dishchiibikoh", null]);
  await fails("authenticated", ADMIN, SB, /does not belong/, "rpc: a poster file cannot be used as the logo", [SID, "logo", `${SID}/poster-abcdef123456.webp`, null]);
  await fails("authenticated", ADMIN, SB, /was not uploaded/, "rpc: a file that was never uploaded is refused", [SID, "logo", `${SID}/logo-neveruploaded.webp`, null]);
  const r1 = (await as("authenticated", ADMIN, SB, [SID, "logo", LP, null])).rows[0].r;
  assert.equal(r1.logo_path, LP); assert.equal(r1.old_path, null);
  const LP2 = `${SID}/logo-bbbbbb123456.png`;
  await upload(ADMIN, LP2);
  const r2 = (await as("authenticated", ADMIN, SB, [SID, "logo", LP2, null])).rows[0].r;
  assert.equal(r2.logo_path, LP2); assert.equal(r2.old_path, LP);
  ok("rpc: upload → set logo; replacing it returns the old path so the app can delete that file");

  const PP = `${SID}/poster-cccccc123456.jpg`;
  await upload(ADMIN, PP);
  await fails("authenticated", ADMIN, SB, /Describe the poster/, "rpc: a poster needs a description", [SID, "poster", PP, " "]);
  await fails("authenticated", ADMIN, SB, /too long/, "rpc: description is capped at 250 characters", [SID, "poster", PP, "x".repeat(251)]);
  const r3 = (await as("authenticated", ADMIN, SB, [SID, "poster", PP, "  Science fair 2026 poster  "])).rows[0].r;
  assert.equal(r3.poster_path, PP); assert.equal(r3.poster_alt, "Science fair 2026 poster"); assert.equal(r3.logo_path, LP2);
  const r4 = (await as("authenticated", ADMIN, SB, [SID, "poster_alt", null, "Poster: volcano and planets"])).rows[0].r;
  assert.equal(r4.poster_path, PP); assert.equal(r4.poster_alt, "Poster: volcano and planets");
  ok("rpc: poster with description; the description can be changed on its own");
  const r5 = (await as("authenticated", ADMIN, SB, [SID, "poster", null, null])).rows[0].r;
  assert.equal(r5.poster_path, null); assert.equal(r5.poster_alt, ""); assert.equal(r5.old_path, PP); assert.equal(r5.logo_path, LP2);
  await fails("authenticated", ADMIN, SB, /Upload a poster first/, "rpc: no description without a poster", [SID, "poster_alt", null, "words"]);
  ok("rpc: removing the poster clears its description and keeps the logo");

  // Storage delete / read: own school only.
  await db.exec(`INSERT INTO storage.objects (bucket_id, name) VALUES ('school-branding', '${LEG}/logo-legacy123456.webp')`);
  assert.equal((await as("authenticated", ADMIN, "DELETE FROM storage.objects WHERE name=$1 RETURNING 1", [`${LEG}/logo-legacy123456.webp`])).rows.length, 0);
  assert.equal((await as("authenticated", ADMIN, "SELECT name FROM storage.objects WHERE bucket_id='school-branding'")).rows.every(r => r.name.startsWith(SID)), true);
  assert.equal((await as("anon", "", "SELECT name FROM storage.objects")).rows.length, 0);
  ok("storage: an admin cannot see or delete another school's files; anon cannot list any");
  assert.equal((await as("authenticated", ADMIN, "DELETE FROM storage.objects WHERE name=$1 RETURNING 1", [LP])).rows.length, 1);
  ok("storage: an admin can delete their own school's replaced file");

  // Removing the built-in logo is permanent — a re-run of the migration must not bring it back.
  await db.exec(`INSERT INTO school_admins (school_id, user_id) VALUES ('${LEG}', '${OTHER}')`);
  const r6 = (await as("authenticated", OTHER, SB, [LEG, "logo", null, null])).rows[0].r;
  assert.equal(r6.logo_path, null); assert.equal(r6.old_path, "builtin:dishchiibikoh");
  await db.exec(mig("migration-2026-10l-school-branding.sql"));
  assert.equal((await brand(LEG)).logo_path, null);
  ok("branding: removing the built-in logo is permanent (a re-run does not restore it)");

  const TMP = "99999999-9999-9999-9999-999999999990";
  await db.exec(`INSERT INTO schools (id, name, slug, invite_code, admin_pin) VALUES ('${TMP}', 'Tmp', 'tmp-brand', 'TMPCODE1', '4821');
    INSERT INTO school_admins (school_id, user_id) VALUES ('${TMP}', '${ADMIN}');`);
  await upload(ADMIN, `${TMP}/logo-tmptmp123456.webp`);
  await as("authenticated", ADMIN, SB, [TMP, "logo", `${TMP}/logo-tmptmp123456.webp`, null]);
  await db.exec(`DELETE FROM schools WHERE id = '${TMP}'`);
  assert.equal(await brand(TMP), undefined);
  ok("branding: deleting a school deletes its branding row");
}

console.log(`\nALL ${pass} CHECKS PASSED`);
