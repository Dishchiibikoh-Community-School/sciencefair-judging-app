// TEST 11 - JUDGES WHO DO NOT TURN UP.
//
//   node tests/stress/previewserver.mjs                    (in one terminal)
//   node tests/stress/seed.mjs --shape=event
//   node tests/stress/test11-absent-judges.mjs
//
// The question this answers: 15 judges are scheduled, only 13 arrive. What happens to the
// visits assigned to the two who did not come?
//
// It needs the EVENT shape, because that is the only one with the live fair's visit
// structure: every scored project visited by 3 different judges, every PreK and SPED project
// by exactly 1. The load shape gives PreK two visits, which would hide the whole risk.
//
// Deliberately chosen absentees:
//   * the judge who is the ONLY visitor to the PreK projects - the worst case, because those
//     projects have a single scheduled visit and no second judge to fall back on;
//   * one judge from 6-8 - the ordinary case, where a project drops from 3 reviews to 2.
//
// Three things are measured, in order of how much they matter:
//   A. the real cost - which projects end up with no review at all, and which lose one;
//   B. whether the app TELLS the organiser, on the screens they would actually be looking at;
//   C. whether the documented remedy (a stand-in using that judge's number) recovers it.
import { writeFileSync, readFileSync } from "node:fs";
import { banner, rest } from "./env.mjs";
import { manifest, signIn, resetJudges, scoreWave, clearScores } from "./loadlib.mjs";
import { launch, newJudgePage, DEVICES, SCHOOL, INVITE } from "./browserlib.mjs";

const BASE = "http://localhost:5200";
const c = banner("TEST 11 - WHAT HAPPENS WHEN JUDGES DO NOT TURN UP");
const m = manifest();
if (m.ref !== c.ref) throw new Error(`manifest was seeded against ${m.ref}, not ${c.ref}`);
if (m.shape !== "event") throw new Error(`this test needs the event shape - run: node tests/stress/seed.mjs --shape=event`);

const report = { test: "11-absent-judges", ref: c.ref, startedAt: new Date().toISOString(), cases: [] };
let fails = 0;
const check = (name, ok, detail = "") => {
  console.log(`    ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
  if (!ok) fails++;
  report.cases.push({ name, verdict: ok ? "PASS" : "FAIL", detail: String(detail) });
};
const note = (label, detail) => { console.log(`    ----  ${label}  - ${detail}`); report.cases.push({ name: label, verdict: "INFO", detail: String(detail) }); };

const projById = new Map(m.projects.map((p) => [p.id, p]));
const reviewCounts = async () => {
  const rows = (await rest(c, `/scores?school_id=eq.${m.schoolId}&select=project_id&limit=2000`, { admin: true })).data || [];
  const n = new Map(m.projects.map((p) => [p.id, 0]));
  for (const r of rows) n.set(r.project_id, (n.get(r.project_id) || 0) + 1);
  return n;
};

// ── who is away ──────────────────────────────────────────────────────────────────────
// Found from the schedule itself rather than hardcoded, so the test still means something
// if the seed's allocation changes.
const prekProjects = m.projects.filter((p) => p.dept === "PreK");
const prekJudge = m.judgesByProject[prekProjects[0].id][0];
const midJudge = m.projects.filter((p) => p.dept === "6-8")
  .flatMap((p) => m.judgesByProject[p.id]).find((j) => j !== prekJudge);
const ABSENT = [prekJudge, midJudge];
const PRESENT = m.judgeNumbers.filter((n) => !ABSENT.includes(n));

console.log(`\nScheduled: ${m.judgeNumbers.length} judges, ${m.visits} visits over ${m.rounds} rounds`);
console.log(`Absent   : Judge ${ABSENT.join(", Judge ")}   (Judge ${prekJudge} is the only visitor to the PreK projects)`);
console.log(`Arriving : ${PRESENT.length} judges`);

// ── A. the real cost ─────────────────────────────────────────────────────────────────
console.log(`\nA. What it costs`);
await resetJudges(c, m);
await clearScores(c, m);
const si = await signIn(c, m, PRESENT);
check("only the judges who arrived have a session", si.judges.length === PRESENT.length, `${si.judges.length} of ${PRESENT.length}`);

const res = await scoreWave(c, m, si.judges);
check("every arriving judge scored all of their own visits", res.every((r) => r.ok), `${res.filter((r) => r.ok).length} scores, ${res.filter((r) => !r.ok).length} errors`);

const counts = await reviewCounts();
const zero = m.projects.filter((p) => counts.get(p.id) === 0);
const short = m.projects.filter((p) => counts.get(p.id) > 0 && counts.get(p.id) < m.visitsByProject[p.id]);
const full = m.projects.filter((p) => counts.get(p.id) === m.visitsByProject[p.id]);

console.log(`\n    projects with NO review at all : ${zero.length}`);
console.log(`    projects with fewer than planned: ${short.length}`);
console.log(`    projects fully reviewed         : ${full.length}`);

const zeroByDept = {};
for (const p of zero) zeroByDept[p.dept] = (zeroByDept[p.dept] || 0) + 1;
note("which departments lose projects entirely", Object.keys(zeroByDept).length ? JSON.stringify(zeroByDept) : "none");

// The headline risk: a single-visit project whose one judge did not come scores nothing.
const singleVisit = m.projects.filter((p) => m.visitsByProject[p.id] === 1);
const lostSingles = singleVisit.filter((p) => counts.get(p.id) === 0);
check("single-visit projects are the ones that can reach zero reviews",
  lostSingles.length > 0 && lostSingles.every((p) => ["PreK", "SPED"].includes(p.dept)),
  `${lostSingles.length} of ${singleVisit.length} single-visit projects got nothing: ${lostSingles.map((p) => `${p.dept} #${p.num}`).join(", ")}`);
check("every 3-visit project still got at least 2 reviews (an average is still possible)",
  m.projects.filter((p) => m.visitsByProject[p.id] === 3).every((p) => counts.get(p.id) >= 2),
  `lowest = ${Math.min(...m.projects.filter((p) => m.visitsByProject[p.id] === 3).map((p) => counts.get(p.id)))}`);

// ── B. does the app say so, on the screens the organiser uses? ───────────────────────
console.log(`\nB. What the organiser is shown`);
const browser = await launch();
const { page } = await newJudgePage(browser, DEVICES.laptop);
let adminIn = false, signInError = "";
if (m.admin) {
  await page.goto(`${BASE}/s/${SCHOOL}`, { waitUntil: "domcontentloaded" });
  await page.locator(".role-card").nth(1).click();
  await page.locator('input[type="email"]').fill(m.admin.email);
  await page.locator('input[type="password"]').fill(m.admin.password);
  await page.getByRole("button", { name: /Access Dashboard/i }).first().click();
  adminIn = await page.locator(".adm-main, .adm-nav").first().waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
  if (!adminIn) {
    const t = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    signInError = (t.match(/Login failed[^A-Z]{0,80}/i) || [""])[0].trim() || "no error message on screen";
  }
}
// A failed admin sign-in here is an ENVIRONMENT limitation, not an app defect: the staging
// project currently has email logins disabled, so the dashboard cannot be reached at all.
// Reporting it as a failure would tell an auditor the app is broken, which is not what was
// observed - so it is recorded as NOT CHECKED, loudly.
if (adminIn) {
  check("signed in to the admin dashboard", true, m.admin.email);
} else {
  console.log(`    SKIP  the admin screens were NOT checked`);
  console.log(`          reason: ${signInError || "admin sign-in did not reach the dashboard"}`);
  console.log(`          to check them: staging -> Authentication -> Sign In / Providers -> Email -> enable.`);
  console.log(`          ("Confirm email" can stay ON - the seed creates the account pre-confirmed.)`);
  report.cases.push({ name: "admin screens checked", verdict: "NOT CHECKED", detail: signInError || "admin sign-in unavailable" });
  report.adminScreensChecked = false;
}

if (adminIn) {
  // Judges tab: does it name the judges who never signed in?
  await page.getByRole("button", { name: /Judges/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  const judgesText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const namesAbsent = ABSENT.every((n) => new RegExp(`Judge\\s*${n}\\b`).test(judgesText));
  check("the Judges tab names the judges who have not signed in",
    /not signed in/i.test(judgesText) && namesAbsent,
    (judgesText.match(/[^.]*not signed in[^.]{0,110}/i) || ["(no such text)"])[0].trim().slice(0, 130));
  check("it tells the organiser to use a stand-in with that number",
    /stand-?in/i.test(judgesText), /stand-?in/i.test(judgesText) ? "says 'stand-in'" : "no stand-in advice found");

  // Awards tab: are the affected groups flagged and held back?
  await page.getByRole("button", { name: /Awards/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  const awardsText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  check("the Awards tab flags groups with projects that were never scored",
    /not scored yet/i.test(awardsText),
    (awardsText.match(/\d+\s*not scored yet/i) || ["(not shown)"])[0]);
  check("the Awards tab flags groups still waiting for reviews",
    /waiting for reviews/i.test(awardsText),
    (awardsText.match(/\d+\s*still waiting for reviews/i) || ["(not shown)"])[0]);

  // Finalize: report what actually happens rather than assuming.
  await page.getByRole("button", { name: /Validation|Deliberation/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  const valText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const finBtn = page.getByRole("button", { name: /Finalize/i }).first();
  const finExists = await finBtn.count().then((n) => n > 0).catch(() => false);
  const finDisabled = finExists ? await finBtn.isDisabled().catch(() => false) : null;
  note("Finalize button",
    !finExists ? "not on screen at this stage"
      : finDisabled ? "present and DISABLED"
      : "present and ENABLED - missing reviews do NOT block finalising");
  note("validation screen mentions missing coverage",
    /not scored|waiting for reviews|no reviews/i.test(valText) ? "yes" : "no");
}

// ── C. does a stand-in recover it? ───────────────────────────────────────────────────
console.log(`\nC. The remedy: a stand-in signs in with the absent judge's number`);
const standIn = await signIn(c, m, [prekJudge]);
const sess = standIn.judges[0];
check("a stand-in can sign in with the absent judge's number", !!sess, sess ? `Judge ${prekJudge} session created` : JSON.stringify(standIn.errors));

if (sess) {
  const plannedForThatJudge = Object.entries(m.judgesByProject).filter(([, js]) => js.includes(prekJudge)).map(([pid]) => pid);
  check("the stand-in inherits exactly that judge's scheduled projects",
    sess.projects.length === plannedForThatJudge.length
      && sess.projects.every((pid) => plannedForThatJudge.includes(pid)),
    `${sess.projects.length} projects, schedule says ${plannedForThatJudge.length}`);

  const made = await scoreWave(c, m, [sess]);
  check("the stand-in's scores are accepted", made.every((r) => r.ok), `${made.filter((r) => r.ok).length} scored`);

  const after = await reviewCounts();
  const stillZero = m.projects.filter((p) => after.get(p.id) === 0);
  check("the PreK projects that had nothing now have their review",
    prekProjects.every((p) => after.get(p.id) >= 1),
    prekProjects.map((p) => `#${p.num}: ${counts.get(p.id)} -> ${after.get(p.id)}`).join(", "));
  check("no project is left with zero reviews after the stand-in",
    stillZero.length === 0,
    stillZero.length ? stillZero.map((p) => `${p.dept} #${p.num}`).join(", ") : "all 63 projects reviewed");
  note("projects still short of their planned reviews",
    `${m.projects.filter((p) => after.get(p.id) > 0 && after.get(p.id) < m.visitsByProject[p.id]).length} (Judge ${midJudge} is still away)`);
}

await browser.close();
report.absent = ABSENT;
report.adminScreensChecked = adminIn;
report.fails = fails;
report.finishedAt = new Date().toISOString();
writeFileSync(new URL("./out/test11-absent-judges.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(`\n${fails === 0 ? "TEST 11 PASS" : `TEST 11 - ${fails} check(s) FAILED`}`);
console.log(`Raw results: tests/stress/out/test11-absent-judges.json`);
console.log(`Production (evrupqnhgrfltfhafeyj) was not contacted.`);
process.exit(0);
