// Clears judge sessions and scores in STAGING so a test run starts from a known state.
// The fake fair itself (school, projects, schedule, roster) is left in place.
//
//   node tests/stress/reset.mjs
import { banner, rest } from "./env.mjs";
import { manifest } from "./loadlib.mjs";
const c = banner("RESET - clear judge sessions and scores (fake fair kept)");
const m = manifest();
for (const t of ["scores", "validations", "deliberation_notes", "final_decisions", "judges"]) {
  const r = await rest(c, `/${t}?school_id=eq.${m.schoolId}`, { method: "DELETE", admin: true });
  console.log(`  cleared ${t}${r.ok ? "" : `  (${r.status})`}`);
}
console.log("\nReady. Production (evrupqnhgrfltfhafeyj) was not contacted.");
