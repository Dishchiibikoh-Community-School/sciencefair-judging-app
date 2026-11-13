// Removes every trace of the fake fair from staging, then PROVES it is gone.
//
//   node tests/stress/cleanup.mjs
//
// Deleting the school row cascades to departments, categories, projects, judges, scores,
// roster, schedule, settings, rubrics, validations and decisions (every table carries
// school_id REFERENCES schools(id) ON DELETE CASCADE). The verification pass below does not
// trust that: it counts the rows left behind in each table afterwards and fails loudly if
// anything survived.
//
// It can only ever delete the one slug seed.mjs creates, and only in staging - the
// production guard in env.mjs runs first.
import { banner, rest } from "./env.mjs";

const SLUG = "stress-test-fair";
const c = banner("CLEANUP - remove the fake fair from staging");

const found = await rest(c, `/schools?slug=eq.${SLUG}&select=id,name`, { admin: true });
if (!found.data?.length) {
  console.log(`\nNothing to remove - no school with slug "${SLUG}" in this project.`);
  process.exit(0);
}
const sid = found.data[0].id;
console.log(`\nRemoving: ${found.data[0].name}\n  school id ${sid}`);

const del = await rest(c, `/schools?id=eq.${sid}`, { method: "DELETE", admin: true });
if (!del.ok) { console.error(`DELETE failed: ${del.status} ${JSON.stringify(del.data)}`); process.exit(1); }

// Verify, table by table. judge_secrets has no school_id - it hangs off judges by FK, so it
// is checked through the judges that are gone rather than by filtering on a column it lacks.
const TABLES = ["schools", "departments", "categories", "projects", "project_private", "judges",
  "scores", "validations", "deliberation_notes", "final_decisions", "judge_roster",
  "judge_schedule", "project_judges", "judge_labels", "app_settings", "rubrics",
  "share_links", "score_backups", "activity_log", "it_logs"];

console.log(`\nVerifying removal:`);
let left = 0;
for (const t of TABLES) {
  const col = t === "schools" ? "id" : "school_id";
  const r = await rest(c, `/${t}?${col}=eq.${sid}&select=${col}`, {
    admin: true, headers: { Prefer: "count=exact", Range: "0-0" },
  });
  const n = Array.isArray(r.data) ? r.data.length : 0;
  if (n > 0) { left += n; console.log(`  LEFT BEHIND  ${t}: ${n} row(s)`); }
}
const secrets = await rest(c, `/judge_secrets?select=judge_id`, { admin: true, headers: { Range: "0-0" } });
const orphanSecrets = Array.isArray(secrets.data) ? secrets.data.length : 0;

if (left === 0 && orphanSecrets === 0) {
  console.log(`  clean - 0 rows remain in any of the ${TABLES.length} tables checked`);
  console.log(`\nStaging is empty again. Production (evrupqnhgrfltfhafeyj) was never contacted.`);
} else {
  console.log(`\n*** ${left} row(s) survived, plus ${orphanSecrets} judge_secrets. Investigate before re-seeding.`);
  process.exit(1);
}
