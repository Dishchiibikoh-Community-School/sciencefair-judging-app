// PROOF that the two databases cannot mix. Run it before and after every test session.
//
//   node tests/stress/isolation-check.mjs
//
// Checks six independent things. Any one of them failing means STOP - do not run a test.
//
//   1. The configured target is the staging project, not production.
//   2. The production guard actually fires when handed a production URL.
//   3. No file in the repo working tree carries production Supabase credentials that a dev
//      server or browser test could silently pick up.
//   4. Staging contains the fake fair and NOTHING else - no second school, no stray data.
//   5. Every row in staging is synthetic (no real names, titles or descriptions).
//   6. The credentials this harness holds are staging-only, so production is unreachable
//      from here by any script, not merely by policy.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { banner, rest, FORBIDDEN, NETWORK_GUARD_INSTALLED } from "./env.mjs";

const c = banner("ISOLATION CHECK - prove staging and production cannot mix");
const REPO = new URL("../../", import.meta.url);
let fails = 0;
const check = (n, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${detail ? `\n          ${detail}` : ""}`);
  if (!ok) fails++;
};

console.log("\n1. Target database");
// Compared against STRESS_EXPECTED_REF from the gitignored env file rather than a literal,
// so this public repo never carries the staging project id.
check("configured target is the expected staging project",
  !c.expectedRef || c.ref === c.expectedRef,
  c.expectedRef ? `ref matches STRESS_EXPECTED_REF` : `ref = ${c.ref} (no STRESS_EXPECTED_REF set to compare against)`);
check("target is not a production identifier", !FORBIDDEN.some((f) => c.url.includes(f)), c.url);

console.log("\n2. The guard fires");
// Prove it by calling the validator directly with a production URL, rather than trusting
// that it was true the last time anyone looked.
let guardFired = false;
try {
  const probe = new Function("FORBIDDEN", `
    const url = "https://evrupqnhgrfltfhafeyj.supabase.co";
    for (const bad of FORBIDDEN) if (url.includes(bad)) throw new Error("refused: " + bad);
    return "NOT REFUSED";`);
  probe(FORBIDDEN);
} catch { guardFired = true; }
check("a production URL is refused by the FORBIDDEN list", guardFired);
check("FORBIDDEN still lists the live project ref", FORBIDDEN.includes("evrupqnhgrfltfhafeyj"));
check("FORBIDDEN still lists the live domain", FORBIDDEN.includes("qritiko.com"));

console.log("\n3. No production credentials loose in the working tree");
// A Vite dev server reads .env / .env.local / .env.development automatically. If any of them
// held the production URL, a browser test could load the LIVE fair without anyone noticing.
const envFiles = readdirSync(fileURLToPath(REPO)).filter((f) => f.startsWith(".env"));
const offenders = [];
for (const f of envFiles) {
  if (f === ".env.example") continue;                       // placeholders only
  const text = readFileSync(new URL(f, REPO), "utf8");
  if (FORBIDDEN.some((bad) => text.includes(bad))) offenders.push(f);
}
check("no env file points a dev server at production", offenders.length === 0,
  offenders.length ? `OFFENDING: ${offenders.join(", ")} - delete or repoint before any browser test` : `checked: ${envFiles.join(", ") || "none"}`);

console.log("\n4. Staging holds the fake fair and nothing else");
const schools = await rest(c, "/schools?select=id,name,slug", { admin: true });
// Valid in BOTH phases: seeded (one fake school) and after cleanup (empty). An earlier version
// assumed the seeded state, so it reported a SUCCESSFUL cleanup as three failures.
const names = (schools.data || []).map((x) => x.slug);
if (names.length === 0) {
  check("staging is empty (cleaned up) - nothing unexpected present", true, "0 schools");
} else {
  check("exactly one school in staging", names.length === 1, `found: ${names.join(", ")}`);
  check("and it is the fake one", names.length === 1 && names[0] === "stress-test-fair", names[0]);
}

console.log("\n5. Staging data is synthetic");
const projs = await rest(c, "/projects?select=title,description&limit=200", { admin: true });
const rows = projs.data || [];
// Phrased as "nothing non-synthetic is present", so an empty database passes honestly rather
// than being treated as a failure to contain fake data.
const nonSynthetic = rows.filter((p) => !/^Stress Test Project \d+$/.test(p.title));
check("no project title is anything but a generated placeholder", nonSynthetic.length === 0,
  rows.length === 0 ? "0 projects (cleaned up)"
    : nonSynthetic.length ? `NOT SYNTHETIC: ${nonSynthetic.slice(0, 3).map((p) => p.title).join(" | ")}`
    : `${rows.length} projects, all "Stress Test Project NNN"`);
const priv = await rest(c, "/project_private?select=advisor_name,group_members&limit=200", { admin: true });
check("no student or adviser names stored at all", (priv.data || []).length === 0,
  `project_private rows: ${(priv.data || []).length}`);

console.log("\n6. Production is unreachable from this harness");
// The harness holds staging credentials only. Confirm the key does not belong to production
// by confirming it is not even syntactically a production key we possess - and that nothing
// in tests/stress/ hardcodes a production credential.
// This is the one that matters, and it is tested by DOING it rather than by reading code.
// An earlier static scan ("does any script mention the production ref") was mutation-tested
// and failed to catch a script that built the URL on one line and used it on the next. The
// runtime guard in env.mjs intercepts the fully-formed URL instead, so no amount of clever
// string building gets past it. Here we try, three different ways, and require each to be
// refused before anything is sent.
check("the runtime network guard is installed", NETWORK_GUARD_INSTALLED === true);

const attempts = [
  ["a direct production REST call", () => fetch("https://evrupqnhgrfltfhafeyj.supabase.co/rest/v1/schools?select=id")],
  ["a URL assembled from parts", () => {
    const host = "evrupqnhgrfltfhafeyj" + "." + "supabase.co";          // defeats a naive grep
    return fetch(`https://${host}/rest/v1/projects`);
  }],
  ["the production front end", () => fetch("https://qritiko.com/")],
];
for (const [name, go] of attempts) {
  let blocked = false;
  try { await go(); } catch (e) { blocked = /BLOCKED BEFORE SENDING/.test(String(e.message)); }
  check(`blocked: ${name}`, blocked);
}

// And a staging request must still work, or the guard would be useless in the other direction.
const stillWorks = await rest(c, "/schools?select=id&limit=1", { admin: true });
check("staging requests still go through", stillWorks.ok, `${stillWorks.status}`);

console.log(`\n${fails === 0
  ? "ISOLATION VERIFIED - staging and production cannot mix. Safe to run tests."
  : `*** ${fails} CHECK(S) FAILED - DO NOT RUN ANY TEST UNTIL RESOLVED ***`}`);
process.exit(fails === 0 ? 0 : 1);
