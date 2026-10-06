// Responsive / functionality audit against the 2026-27 target configuration:
// 6 departments (PreK + K-2 comment-only), the 100-point rubric, ~60 projects,
// real scores. Walks every major view at phone / tablet / laptop width and reports
// horizontal overflow, off-viewport elements and too-small tap targets.
//   node scripts/e2e/ui-audit.mjs            (dev server on :5199, see scan.e2e.mjs)
//   node scripts/e2e/ui-audit.mjs --shots    (also writes screenshots to e2e/out/)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { freshStore, installMock, SID } from "./mock.mjs";

const BASE = "http://localhost:5199";
const SHOTS = process.argv.includes("--shots");
const DIR = "scripts/e2e/out/";
if (SHOTS) mkdirSync(DIR, { recursive: true });

const RATING = ["Needs improvement", "Fair", "Good", "Very Good", "Excellent"];
const CIBECUE = [
  { id:"title", label:"Project Title", max:15, steps:[3,6,9,12,15], stepLabels:RATING, desc:"Is meaningful · reflects the student's creativity · has a clear and focused purpose · relates to real-life experimentation · is appropriate for the student's grade level." },
  { id:"inquiry", label:"Scientific Inquiry", max:25, steps:[5,10,15,20,25], stepLabels:RATING, desc:"Proposes a scientific question · follows the correct order and steps of the scientific method · has a testable hypothesis · the experiment/investigation is well organized." },
  { id:"data_conclusion", label:"Data and Conclusion", max:20, steps:[4,8,12,16,20], stepLabels:RATING, desc:"Provides enough quantitative and qualitative data · data collected from the students' own experiment · data are accurate · the conclusion is reliable and answers the scientific question." },
  { id:"presentation", label:"Presentation", max:20, steps:[4,8,12,16,20], stepLabels:RATING, desc:"Information is well presented (verbally and written) · display/trifold is neat and organized · the project is clearly presented · students show strong understanding · students answer questions about their investigation." },
  { id:"further_research", label:"Further Research", max:20, steps:[4,8,12,16,20], stepLabels:RATING, desc:"The investigation and presentation reflect teamwork · students adhere to safety rules and restrictions." },
];
const CATS = ["Life Science","Earth & Environmental Science","Chemistry & Material Science",
  "Physics, Math & Astronomy","Engineering, Robotics & Technology","Energy, Sustainability & Design"];
// name, code, mode, project count, judges — the real planned shape of the fair
const PLAN = [
  ["PreK",  "PK",   "feedback",  6, 2],
  ["K-2",   "K2",   "feedback", 10, 2],
  ["3-5",   "G35",  "scored",   12, 3],
  ["6-8",   "G68",  "scored",   20, 4],
  ["9-12",  "G912", "scored",    8, 2],
  ["SPED",  "SPED", "scored",    4, 2],
];
const COMMEND = ["Great Scientific Thinking","Creative Idea","Excellent Teamwork","Wonderful Presentation"];

const store = freshStore();
const now = new Date().toISOString();
store.departments = PLAN.map(([name, code, mode], i) =>
  ({ id: `d_${i}`, school_id: SID, name, code, scoring_mode: mode, max_judges: 8, ord: i,
     locked: false, finalized_at: null, award_grouping: name === "6-8" ? "category" : "department" }));
store.categories = CATS.map((name, i) => ({ id: `c${i}`, school_id: SID, name, code: name.slice(0,2).toUpperCase(), ord: i }));
store.rubrics = [{ id: "rub1", school_id: SID, name: "Cibecue / ISEF-style", is_active: true, criteria: CIBECUE }];
store.projects = []; store.project_private = []; store.judges = []; store.scores = [];

let pn = 0;
const TITLES = ["Solar Oven Heat Trap","Which Soil Grows Tallest Beans","Mealworm Maze Learning","Bridge Truss Strength",
  "Homemade Water Filter","Static Electricity and Hair","Sound Through Materials","Mold on Bread Over Time",
  "Rocket Fin Shapes","Crystal Growth and Temperature","Erosion in a Stream Table","Magnet Strength vs Distance"];
PLAN.forEach(([name,,mode,count,nJudges], di) => {
  const deptId = `d_${di}`;
  for (let i = 0; i < count; i++) {
    pn++;
    store.projects.push({ id: `p_${pn}`, school_id: SID, num: String(pn).padStart(3,"0"),
      title: `${TITLES[(pn-1) % TITLES.length]}${i >= TITLES.length ? " II" : ""}`,
      cat: CATS[i % CATS.length], grade: name === "PreK" ? "K" : String((di*2)+1),
      locked: false, department_id: deptId, room: `R${100+pn}`,
      description: "A short description of what the students set out to investigate and build.",
      motivation: "", created_at: now });
    store.project_private.push({ project_id: `p_${pn}`, school_id: SID,
      advisor_name: "Ms. Nakai", group_members: [{ name: "Student One", grade: "5" }, { name: "Student Two", grade: "5" }] });
  }
  const pids = store.projects.filter(p => p.department_id === deptId).map(p => p.id);
  for (let j = 1; j <= nJudges; j++) {
    const id = `j_${di}_${j}`;
    store.judges.push({ id, school_id: SID, alias: `Judge${j}`, projects: pids, department_id: deptId, joined_at: now });
    pids.forEach((pid, k) => {
      const feedback = mode === "feedback";
      store.scores.push({ school_id: SID, judge_id: id, project_id: pid,
        criteria: feedback ? {} : Object.fromEntries(CIBECUE.map((c, ci) =>
          [c.id, c.steps[(k + j + ci) % c.steps.length]])),
        notes: k % 4 === 0 ? "Clear board and the students explained their variables well." : "",
        commendation: feedback ? COMMEND[(k + j) % COMMEND.length] : "",
        submitted_at: now });
    });
  }
});
store.app_settings = store.app_settings.map(r => r.key === "results_finalized" ? { ...r, value: "true" } : r);
store.share_links = [{ id: "sl1", school_id: SID, token: "AUDIT-TOKEN", expiry: "never", created_at: now, revoked_at: null }];

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
const findings = [];
const WIDTHS = [["phone", 390, 844], ["tablet", 820, 1180], ["laptop", 1280, 900]];

async function probe(page, label, width) {
  const r = await page.evaluate((w) => {
    const out = { docOverflow: 0, off: [], tiny: [] };
    const de = document.documentElement;
    out.docOverflow = Math.max(0, de.scrollWidth - de.clientWidth);
    const seen = new Set();
    document.querySelectorAll("button, input, select, textarea, table, .card, .setup-row, .rub-item, .proj-item").forEach(el => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) return;
      if (b.right > w + 1 || b.left < -1) {
        const k = el.className + "|" + (el.innerText || "").slice(0, 28);
        if (!seen.has(k)) { seen.add(k); out.off.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} "${(el.innerText||"").replace(/\n/g," ").slice(0,32)}" right=${Math.round(b.right)}`); }
      }
      if (/^(BUTTON|SELECT)$/.test(el.tagName) && b.height > 0 && b.height < 30) {
        const k = "tiny:" + (el.innerText || el.className).slice(0, 24);
        if (!seen.has(k)) { seen.add(k); out.tiny.push(`${(el.innerText||el.className).replace(/\n/g," ").slice(0,26)} h=${Math.round(b.height)}`); }
      }
    });
    return out;
  }, width);
  if (r.docOverflow > 0) findings.push(`[${width}px] ${label}: page scrolls sideways by ${r.docOverflow}px`);
  r.off.slice(0, 4).forEach(d => findings.push(`[${width}px] ${label}: element past right edge — ${d}`));
  if (width === 390) r.tiny.slice(0, 3).forEach(d => findings.push(`[390px] ${label}: tap target under 30px — ${d}`));
  return r;
}

for (const [wname, w, h] of WIDTHS) {
  const jsErrs = [];
  // Every role gets its OWN context: localStorage is shared within a context, so
  // an admin session or a restored sf_judge_id would send the next page straight
  // past the screen we are trying to measure.
  const fresh = async () => {
    const c = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await c.newPage();
    p.on("pageerror", e => jsErrs.push(e.message));
    await installMock(p, store, []);
    return { c, p };
  };
  const { c: ctx, p: page } = await fresh();

  // ── Admin ──
  await page.goto(`${BASE}/s/test`);
  await page.locator(".role-card.adm").click();
  await page.locator("input[type=email]").fill("admin@test.edu");
  await page.locator("input[type=password]").fill("correct-horse");
  await page.keyboard.press("Enter");
  await page.locator(".adm-side").waitFor({ timeout: 10000 });
  for (const tab of ["Overview","Setup","Judges","Projects","Alerts","Validation","Rubric","Help & FAQ"]) {
    await page.locator(".nav-it", { hasText: tab }).first().click();
    await page.waitForTimeout(450);
    await probe(page, `admin/${tab}`, w);
    if (SHOTS) await page.screenshot({ path: `${DIR}audit-${wname}-admin-${tab.replace(/\W+/g,"")}.png`, fullPage: true });
  }

  // ── Judge: scored department (6-8) ──
  const { c: jc, p: jp } = await fresh();
  await jp.goto(`${BASE}/s/test`);
  await jp.locator(".role-card").first().click();
  await jp.locator("button").filter({ hasText: "6-8" }).first().click();
  await jp.locator('input[placeholder="e.g. Judge1"]').fill("Judge7");
  await jp.locator('input[placeholder="Event invite code"]').fill("abc123");
  await jp.getByRole("button", { name: /Enter as Judge/ }).click();
  await jp.locator(".proj-item").first().waitFor({ timeout: 10000 });
  await probe(jp, "judge/home (20 projects)", w);
  if (SHOTS) await jp.screenshot({ path: `${DIR}audit-${wname}-judge-home.png`, fullPage: true });
  await jp.locator(".proj-item").first().click();
  await jp.locator(".rub-steps").first().waitFor({ timeout: 8000 });
  await probe(jp, "judge/scoring 100-pt", w);
  if (SHOTS) await jp.screenshot({ path: `${DIR}audit-${wname}-judge-scoring.png`, fullPage: true });

  // ── Judge: comment-only department (PreK) ──
  const { c: fc, p: fp } = await fresh();
  await fp.goto(`${BASE}/s/test`);
  await fp.locator(".role-card").first().click();
  await fp.locator("button").filter({ hasText: "PreK" }).first().click();
  await fp.locator('input[placeholder="e.g. Judge1"]').fill("Judge6");
  await fp.locator('input[placeholder="Event invite code"]').fill("abc123");
  await fp.getByRole("button", { name: /Enter as Judge/ }).click();
  await fp.locator(".proj-item").first().click();
  await fp.locator(".fb-chip").first().waitFor({ timeout: 8000 });
  await probe(fp, "judge/scoring comment-only", w);
  if (SHOTS) await fp.screenshot({ path: `${DIR}audit-${wname}-judge-feedback.png`, fullPage: true });

  // ── Public results ──
  const { c: pc, p: pp } = await fresh();
  await pp.goto(`${BASE}/s/test?token=AUDIT-TOKEN`);
  await pp.locator(".card, .res-row, .podium-card").first().waitFor({ timeout: 10000 });
  await pp.waitForTimeout(600);
  await probe(pp, "public results", w);
  if (SHOTS) await pp.screenshot({ path: `${DIR}audit-${wname}-public.png`, fullPage: true });

  jsErrs.forEach(e => findings.push(`[${w}px] JS ERROR: ${e.slice(0, 120)}`));
  await Promise.all([ctx.close(), jc.close(), fc.close(), pc.close()]);
  console.log(`  checked ${wname} (${w}px)`);
}
await browser.close();

console.log(`\n${findings.length ? findings.length + " FINDING(S):" : "No layout findings."}`);
findings.forEach(f => console.log("  •", f));
