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
  await db.exec(mig("migration-2026-10e-categories-and-department-codes.sql"));
  await db.exec(mig("migration-2026-10f-scoring-modes.sql"));
  await db.exec(mig("migration-2026-10g-school-judge-numbers.sql"));
  ok(`migrations 2026-10, 10b, 10c, 10d, 10e, 10f, 10g applied (round ${round} — re-runnable)`);
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
await fails("authenticated", ADMIN, SJN, /would share judge numbers/, "set_judge_numbers: overlapping ranges refused", [S2, R([XPK, 1, 3])]);
await fails("authenticated", ADMIN, SJN, /Judge3 is signed in to K-2/, "set_judge_numbers: refuses to strand a signed-in judge outside their range", [S2, R([XK2, 5, 6], [XMS, 7, 9])]);
await fails("authenticated", ADMIN, SJN, /lowest first/, "set_judge_numbers: backwards range refused", [S2, R([XMS, 9, 5])]);
await as("authenticated", ADMIN, SJN, [S2, R([XPK, 1, 1], [XK2, 2, 4], [XMS, 5, 9])]);
assert.deepEqual(await ranges(S2), { "PreK": "1-1", "K-2": "2-4", "6-8": "5-9" });
assert.deepEqual((await db.query("SELECT max_judges m FROM departments WHERE school_id=$1 ORDER BY ord", [S2])).rows.map(r => r.m), [1, 3, 5]);
ok("set_judge_numbers: admin saves PreK 1-1, K-2 2-4, 6-8 5-9; max judges follow the ranges");
await as("authenticated", ADMIN, SJN, [S2, R([XMS, null, null])]);
await fails("anon", "", RJ, /not on this school's judge list/, "judge numbers: a department with no numbers takes no judges", [S2, XMS, "Judge6", "CODE2"]);
await as("authenticated", ADMIN, SJN, [S2, R([XMS, 5, 9])]);
await db.exec(mig("migration-2026-10g-school-judge-numbers.sql"));
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

console.log(`\nALL ${pass} CHECKS PASSED`);
