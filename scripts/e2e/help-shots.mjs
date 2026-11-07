// Screenshots for the illustrated guides (in-app Help & FAQ, the judge guide, AdminInstructions.md,
// JudgeInstructions.md). Drives the REAL app against the mocked backend (mock.mjs) with a made-up
// school — no production data, no real student names — and writes WebP files to public/help/.
//
//   1) VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5199
//   2) npm run help:shots              (all)      ·   node scripts/e2e/help-shots.mjs judge-3   (one)
//
// Re-run it whenever a screen shown in the guides changes (CLAUDE.md rule 84). The numbered red
// markers are drawn by this script; the matching numbered text lives in JUDGE_GUIDE / ADMIN_GUIDE
// in src/ScienceFairJudging.jsx — keep the numbers in step.
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync } from "node:fs";
import { freshStore, installMock, SID } from "./mock.mjs";

const BASE = "http://localhost:5199";
const OUT = new URL("../../public/help/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
mkdirSync(OUT, { recursive: true });
const ONLY = process.argv.slice(2);
const want = (name) => !ONLY.length || ONLY.some(o => name.startsWith(o));
const sizes = [];

// ── A made-up school, shaped like the 2026-27 fair ─────────────────────────────────────────────
const now = new Date().toISOString();
const store = freshStore();
store.schools[0].name = "Sample School";
const D = { PK: "d_pk", K5: "d_k5", MS: "d_68", HS: "d_912", SP: "d_sped" };
const dept = (id, name, code, ord) => ({ id, school_id: SID, name, code, max_judges: 5, ord, scoring_mode: "scored",
  award_grouping: "department", locked: false, finalized_at: null, rubric_id: null });
store.departments = [dept(D.PK, "PreK", "PK", 0), dept(D.K5, "K-5", "K5", 1), dept(D.MS, "6-8", "G68", 2),
  dept(D.HS, "9-12", "G912", 3), dept(D.SP, "SPED", "SPED", 4)];
store.categories = [
  ["Life, Health & Behavior", "LS"], ["Earth & Environmental Science", "EES"], ["Chemistry & Material Science", "CMS"],
  ["Physics, Math & Astronomy", "PMA"], ["Engineering, Robotics & Technology", "ERT"], ["Energy, Sustainable Forms & Design", "ESD"],
].map(([name, code], i) => ({ id: `c${i}`, school_id: SID, name, code, ord: i }));
const CAT = Object.fromEntries(store.categories.map(c => [c.code, c.name]));
store.rubrics = [{ id: "rub_default", school_id: SID, name: "Default", is_active: true, criteria: [] }];
const PROJ = [
  ["p01", "001", "Sink or Float?",                         "PMA", "PreK", D.PK, "1"],
  ["p02", "002", "Which Ball Bounces Highest?",            "PMA", "PreK", D.PK, "2"],
  ["p04", "004", "Which Paper Towel Soaks Up the Most?",   "CMS", "3",    D.K5, "4"],
  ["p06", "006", "Do Plants Grow Toward the Light?",       "LS",  "4",    D.K5, "6"],
  ["p07", "007", "Rolling Marbles Down Ramps",             "PMA", "2",    D.K5, "7"],
  ["p12", "012", "Earthquake-Proof Bridges",               "ERT", "7",    D.MS, "12"],
  ["p14", "014", "Solar Oven Temperatures",                "ESD", "8",    D.MS, "14"],
  ["p15", "015", "Does Music Help Plants Grow?",           "LS",  "6",    D.MS, "15"],
  ["p18", "018", "Rust and Salt Water",                    "CMS", "7",    D.MS, "18"],
  ["p21", "021", "Water Filters from Local Sand",          "EES", "10",   D.HS, "21"],
  ["p23", "023", "Wind Turbine Blade Shapes",              "ESD", "11",   D.HS, "23"],
  ["p25", "025", "Bacteria on School Door Handles",        "LS",  "12",   D.HS, "25"],
  ["p31", "031", "Colors in a Rainbow Jar",                "CMS", "9",    D.SP, "31"],
];
store.projects = PROJ.map(([id, num, title, cat, grade, department_id, room]) => ({ id, school_id: SID, num, title,
  cat: CAT[cat], grade, locked: false, department_id, room, created_at: now,
  description: "The students describe what they set out to test and how they measured it.", motivation: "" }));
store.project_private = PROJ.map(([id], i) => ({ project_id: id, school_id: SID, advisor_name: "Ms. Teacher",
  group_members: [{ name: `Student ${String.fromCharCode(65 + (i % 26))}`, grade: "" }] }));

// A short timed schedule (2026-10p): rounds with times, a break, a wrap-up.
const SLOTS = [
  { kind: "round", no: 1, label: "R1", start: "8:30", end: "8:37" },
  { kind: "round", no: 2, label: "R2", start: "8:38", end: "8:45" },
  { kind: "round", no: 3, label: "R3", start: "8:46", end: "8:53" },
  { kind: "break", label: "BREAK", start: "8:54", end: "9:00" },
  { kind: "round", no: 4, label: "R4", start: "9:00", end: "9:07" },
  { kind: "round", no: 5, label: "R5", start: "9:08", end: "9:15" },
  { kind: "break", label: "WRAP-UP", start: "9:16", end: "9:30" },
];
const SCHED = {   // judge number → project per round (null = free)
  1: ["p14", "p12", "p18", "p15", "p25"],
  2: ["p15", "p18", "p12", "p14", "p23"],
  3: ["p12", "p14", "p21", "p15", null],     // the judge in the screenshots
  4: ["p04", "p06", "p07", "p01", null],     // the elementary judge
  5: ["p06", "p07", "p04", "p02", "p31"],
  6: ["p21", "p23", "p25", "p31", "p01"],
};
store.judge_schedule = Object.entries(SCHED).flatMap(([n, ps]) => ps.map((pid, i) => pid &&
  ({ school_id: SID, judge_number: Number(n), round_no: i + 1, project_id: pid })).filter(Boolean));
store.judge_roster = Object.entries(SCHED).flatMap(([n, ps]) => [...new Set(ps.filter(Boolean)
  .map(pid => store.projects.find(p => p.id === pid).department_id))]
  .map(department_id => ({ school_id: SID, judge_number: Number(n), department_id })));
store.app_settings.push({ school_id: SID, key: "judging_schedule", value: JSON.stringify(SLOTS) });
store.app_settings.push({ school_id: SID, key: "judge_max", value: "15" });

// ── Browser + helpers ──────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
const errs = [];
const conv = await (await browser.newContext()).newPage();
await conv.goto("about:blank");

async function newPage(vp, dsf) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dsf });
  const page = await ctx.newPage();
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  // A fake realtime server (as realtime-reconnect.e2e.mjs): accepts joins, so screens show "Live".
  await page.routeWebSocket(/realtime/, ws => {
    ws.onMessage(raw => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      const arr = Array.isArray(m);
      const [joinRef, ref, topic, event, payload] = arr ? m : [m.join_ref, m.ref, m.topic, m.event, m.payload];
      const reply = (response) => ws.send(JSON.stringify(arr
        ? [joinRef ?? null, ref, topic, "phx_reply", { status: "ok", response }]
        : { join_ref: joinRef, ref, topic, event: "phx_reply", payload: { status: "ok", response } }));
      if (event === "phx_join") reply({ postgres_changes: (payload?.config?.postgres_changes || []).map((c, i) => ({ ...c, id: 1000 + i })) });
      else if (event === "heartbeat" || event === "access_token" || event === "phx_leave") reply({});
    });
  });
  await page.addInitScript(() => { window.__printed = []; window.open = () => ({ document: { write: (h) => window.__printed.push(h), close() {} } }); });
  return { ctx, page, vp };
}
// PNG → WebP in the browser itself (no image library needed).
async function toWebp(png, q = 0.86) {
  const b64 = await conv.evaluate(async ({ b64, q }) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    return c.toDataURL("image/webp", q).split(",")[1];
  }, { b64: png.toString("base64"), q });
  return Buffer.from(b64, "base64");
}
// The guides show the real address, not the dev server's.
const scrub = (page) => page.evaluate(() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) if (w.currentNode.nodeValue.includes("localhost:5199"))
    w.currentNode.nodeValue = w.currentNode.nodeValue.replace(/https?:\/\/localhost:5199/g, "https://qritiko.com");
  document.querySelectorAll("input, textarea").forEach(el => {
    if (el.value.includes("localhost:5199")) el.value = el.value.replace(/https?:\/\/localhost:5199/g, "https://qritiko.com");
  });
});
const box = async (loc) => { const b = await loc.first().boundingBox(); if (!b) throw new Error("not visible: " + loc); return b; };

/**
 * One screenshot: the union of `region` locators (+pad), with numbered markers.
 * marks: [[locator, number, corner?]] — corner "tl" (default) | "tr" | "l" | "r".
 * The page is made tall enough that nothing scrolls, so element boxes are page coordinates.
 */
async function shot(P, name, { region, marks = [], pad = 14, tall = 2600, q } = {}) {
  if (!want(name)) return;
  const { page, vp } = P;
  await page.setViewportSize({ width: vp.width, height: tall });
  const full = await page.evaluate(() => document.documentElement.scrollHeight);
  if (full > tall) await page.setViewportSize({ width: vp.width, height: full + 40 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  await scrub(page);
  const regs = Array.isArray(region) ? region : [region];
  const bs = [];
  for (const r of regs) bs.push(await box(r));
  const x0 = Math.max(0, Math.min(...bs.map(b => b.x)) - pad), y0 = Math.max(0, Math.min(...bs.map(b => b.y)) - pad);
  const x1 = Math.min(vp.width, Math.max(...bs.map(b => b.x + b.width)) + pad), y1 = Math.max(...bs.map(b => b.y + b.height)) + pad;
  const ms = [];
  for (const [loc, n, corner = "tl"] of marks) ms.push({ ...(await box(loc)), n, corner });
  await page.evaluate(({ ms, x0, y0, x1 }) => {
    for (const m of ms) {
      const ring = document.createElement("div"); ring.className = "__hm";
      Object.assign(ring.style, { position: "absolute", left: `${m.x - 5}px`, top: `${m.y - 5}px`, width: `${m.width + 10}px`,
        height: `${m.height + 10}px`, border: "3px solid #e11d48", borderRadius: "10px", zIndex: 99998, pointerEvents: "none",
        boxShadow: "0 0 0 2px rgba(255,255,255,.9)" });
      const b = document.createElement("div"); b.className = "__hm"; b.textContent = String(m.n);
      let bx = m.corner === "tr" || m.corner === "r" ? m.x + m.width - 6 : m.x - 22;
      let by = m.corner === "l" || m.corner === "r" ? m.y + m.height / 2 - 15 : m.y - 22;
      bx = Math.min(Math.max(bx, x0 + 2), x1 - 34); by = Math.max(by, y0 + 2);
      Object.assign(b.style, { position: "absolute", left: `${bx}px`, top: `${by}px`, width: "30px", height: "30px",
        borderRadius: "50%", background: "#e11d48", color: "#fff", font: "700 17px/26px 'Segoe UI',Arial,sans-serif",
        textAlign: "center", border: "2px solid #fff", boxShadow: "0 2px 6px rgba(0,0,0,.35)", zIndex: 99999, pointerEvents: "none" });
      document.body.append(ring, b);
    }
  }, { ms, x0, y0, x1 });
  const png = await page.screenshot({ clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
  await page.evaluate(() => document.querySelectorAll(".__hm").forEach(e => e.remove()));
  const webp = await toWebp(png, q);
  writeFileSync(OUT + name + ".webp", webp);
  sizes.push(`${name}.webp ${Math.round(webp.length / 1024)} KB`);
  console.log("  ✓", name, `${Math.round(webp.length / 1024)} KB`);
  await page.setViewportSize(vp);
}

async function adminIn() {
  const A = await newPage({ width: 1280, height: 900 }, 1);
  await A.page.goto(`${BASE}/s/test`);
  await A.page.locator(".role-card.adm").click();
  await A.page.locator("input[type=email]").fill("admin@test.edu");
  await A.page.locator("input[type=password]").fill("correct-horse");
  await A.page.keyboard.press("Enter");
  await A.page.locator(".adm-side").waitFor({ timeout: 20000 });
  return A;
}
const tab = async (A, label) => { await A.page.locator(".nav-it", { hasText: label }).first().click(); await A.page.waitForTimeout(500); };
// Rate every item on the open scoring screen (`pick(i, n)` → step index), then optionally submit.
async function rateAll(page, pick) {
  const rows = page.locator(".rub-item");
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const btns = rows.nth(i).locator(".rub-step-btn");
    await btns.nth(Math.min(pick(i, n), (await btns.count()) - 1)).click();
  }
}

// ── 1. The admin gives each department its 2026-27 form (exactly what the organiser did) ─────────
console.log("Setup");
const A = await adminIn();
await tab(A, "Setup");
const rubricOf = (deptId) => store.rubrics.find(r => r.id === store.departments.find(d => d.id === deptId).rubric_id);
// A preset already added moves to "Your rubrics" — the second department picks that rubric.
for (const [name, preset, sameAs] of [["PreK", "prek-sped-2627"], ["K-5", "elementary-2627"], ["6-8", "isef-ms-hs-2627"],
  ["9-12", null, D.MS], ["SPED", null, D.PK]]) {
  await A.page.getByLabel(`How ${name} is judged`).selectOption(preset ? `preset:${preset}` : rubricOf(sameAs).id);
  await A.page.waitForTimeout(500);
}
if (!rubricOf(D.MS)?.criteria?.length || !rubricOf(D.K5)?.criteria?.length) throw new Error("presets were not assigned");

// ── 2. The judge's morning (tablet, portrait) ────────────────────────────────────────────────────
console.log("Judge");
const TAB = { width: 800, height: 1100 };
const J = await newPage(TAB, 1.25);
await J.page.goto(`${BASE}/s/test`);
await J.page.locator(".role-card").first().waitFor();
await shot(J, "judge-1-open", { region: [J.page.locator(".role-grid")], pad: 18,
  marks: [[J.page.locator(".role-card").first(), 1]] });

await J.page.locator(".role-card").first().click();
await J.page.locator('input[placeholder="e.g. 7"]').fill("3");
await J.page.locator('input[placeholder="Event invite code"]').fill("ABC123");
await shot(J, "judge-2-signin", { region: J.page.locator(".card").first(),
  marks: [[J.page.locator('input[placeholder="e.g. 7"]'), 1, "r"], [J.page.locator(".judge-num-hit"), 2, "r"],
    [J.page.locator('input[placeholder="Event invite code"]'), 3, "r"], [J.page.getByRole("button", { name: /Enter as Judge/ }), 4]] });

await J.page.getByRole("button", { name: /Enter as Judge/ }).click();
await J.page.locator('[data-testid="js-next"]').waitFor({ timeout: 10000 });
await shot(J, "judge-3-schedule", { region: [J.page.locator(".jh-top"), J.page.locator(".proj-list")],
  marks: [[J.page.locator(".alias-tag"), 1, "tr"], [J.page.locator('[data-testid="js-next"]'), 2],
    [J.page.locator(".js-item").first(), 3], [J.page.locator(".js-break").first(), 4, "r"]] });

// First visit: the scoring screen
await J.page.locator('[data-testid="js-next"]').click();
await J.page.locator(".rub-steps").first().waitFor();
await J.page.locator(".rub-item").nth(0).locator(".rub-step-btn").nth(3).click();
await J.page.locator(".rub-item").nth(1).locator(".rub-step-btn").nth(4).click();
await shot(J, "judge-4-score", { region: [J.page.locator(".sc-header"), J.page.locator(".rub-item").nth(2)],
  marks: [[J.page.locator(".sc-code"), 1, "tr"], [J.page.locator('[data-testid="sc-guide"]'), 2, "tr"],
    [J.page.locator(".rub-item").nth(1).locator(".rub-steps"), 3, "tr"]] });
await rateAll(J.page, (i) => [3, 4, 3, 2, 4][i % 5]);
await J.page.locator("textarea").first().fill("Clear question and careful measurements. Next time, test each bridge three times.");
await shot(J, "judge-5-submit", { region: [J.page.locator(".rub-item").last(), J.page.locator(".btn", { hasText: /Submit Score/ })],
  marks: [[J.page.locator("textarea").first(), 1, "tr"], [J.page.locator(".sc-total"), 2, "tr"],
    [J.page.locator(".btn", { hasText: /Submit Score/ }), 3, "tr"]] });
await J.page.locator(".btn", { hasText: /Submit Score/ }).click();
await J.page.locator('[data-testid="js-next"]').waitFor();

// Second visit: start, leave → a draft
await J.page.locator('[data-testid="js-next"]').click();
await J.page.locator(".rub-steps").first().waitFor();
for (let i = 0; i < 6; i++) await J.page.locator(".rub-item").nth(i).locator(".rub-step-btn").nth(3).click();
await J.page.locator(".back").first().click();
await J.page.locator(".st-draft").first().waitFor();
await shot(J, "judge-6-progress", { region: [J.page.locator(".jh-top"), J.page.locator(".js-item").nth(1)],
  marks: [[J.page.locator(".st-done").first(), 1, "tr"], [J.page.locator(".st-draft").first(), 2, "tr"],
    [J.page.locator(".card").filter({ hasText: "Your Progress" }), 3, "tr"]] });

// Offline: finish the draft with no connection → kept on the tablet, sent later
await J.ctx.setOffline(true); store.offline = true;
await J.page.locator(".offline-banner").first().waitFor({ timeout: 8000 });
await J.page.locator('[data-testid="js-next"]').click();
await J.page.locator(".rub-steps").first().waitFor();
await rateAll(J.page, (i) => [2, 3, 4, 3][i % 4]);
await J.page.locator(".btn", { hasText: /Submit Score/ }).click();
await J.page.locator('[data-testid="st-queued"]').first().waitFor({ timeout: 25000 });
await shot(J, "judge-7-offline", { region: [J.page.locator(".jh-top"), J.page.locator(".js-item").nth(1)],
  marks: [[J.page.locator(".offline-banner").first(), 1, "tr"], [J.page.locator('[data-testid="st-queued"]').first(), 2, "tr"]] });
store.offline = false; await J.ctx.setOffline(false);
await J.page.locator('[data-testid="st-queued"]').first().waitFor({ state: "detached", timeout: 30000 });

// The last two visits, then validation
for (const pick of [(i) => [4, 3, 4, 4, 3][i % 5], (i) => [2, 3, 3, 2, 3][i % 5]]) {
  await J.page.locator('[data-testid="js-next"]').click();
  await J.page.locator(".rub-steps").first().waitFor();
  await rateAll(J.page, pick);
  await J.page.locator(".btn", { hasText: /Submit Score/ }).click();
  await J.page.locator(".jh-top").waitFor();
  await J.page.waitForTimeout(400);
}
await J.page.locator(".all-done").waitFor({ timeout: 10000 });
const valSec = J.page.locator(".delib-section").filter({ hasText: "Validate Computed Results" });
await shot(J, "judge-8-validate", { region: [J.page.locator(".all-done"), valSec],
  marks: [[valSec.getByRole("button", { name: /Approve Results/ }), 1, "tr"], [valSec.getByRole("button", { name: /Flag a Concern/ }), 2, "tr"]] });
await valSec.getByRole("button", { name: /Approve Results/ }).click();
await J.page.locator(".val-status-pill.approved").waitFor();

// Elementary judge: the Strength / Next step boxes and the safety question
const K = await newPage(TAB, 1.25);
await K.page.goto(`${BASE}/s/test`);
await K.page.locator(".role-card").first().click();
await K.page.locator('input[placeholder="e.g. 7"]').fill("4");
await K.page.locator('input[placeholder="Event invite code"]').fill("ABC123");
await K.page.getByRole("button", { name: /Enter as Judge/ }).click();
await K.page.locator('[data-testid="js-next"]').click();
await K.page.locator(".rub-steps").first().waitFor();
await rateAll(K.page, (i) => [3, 4, 2, 3][i % 4]);
await K.page.locator('[data-testid="sc-feedback"] textarea').nth(0).fill("You measured each towel the same way and kept a neat table.");
await K.page.locator('[data-testid="sc-feedback"] textarea').nth(1).fill("Try each towel three times and take the average.");
await shot(K, "judge-5b-elementary", { region: [K.page.locator('[data-testid="sc-feedback"]'), K.page.locator(".btn", { hasText: /Submit Score/ })],
  marks: [[K.page.locator('[data-testid="sc-feedback"] textarea').nth(0), 1, "tr"], [K.page.locator('[data-testid="sc-feedback"] textarea').nth(1), 2, "tr"],
    [K.page.locator('[data-testid="sc-safety"] .sc-safety'), 3, "tr"], [K.page.locator('[data-testid="sc-working"]'), 4, "tr"]] });
await K.page.locator(".btn", { hasText: /Submit Score/ }).click();
await K.page.locator(".jh-top").waitFor();

// ── 3. The rest of the judges' work, straight into the fake database ───────────────────────────
// Every project gets its own quality level, so the averages differ (no accidental ties).
const aliasNum = (a) => Number(String(a).replace(/\D/g, ""));
for (const [n, ps] of Object.entries(SCHED)) {
  if (n === "3" || n === "4") continue;
  const id = `j_${n}`;
  const projs = ps.filter(Boolean);
  store.judges.push({ id, school_id: SID, alias: `Judge${n}`, projects: projs,
    department_id: store.projects.find(p => p.id === projs[0]).department_id,
    department_ids: [...new Set(projs.map(pid => store.projects.find(p => p.id === pid).department_id))], joined_at: now });
}
const QUALITY = { p01: 4.6, p02: 3.4, p04: 4.4, p06: 3.1, p07: 3.8, p12: 4.2, p14: 3.6, p15: 2.9, p18: 3.3,
  p21: 4.5, p23: 3.0, p25: 3.9, p31: 4.1 };
store.judges.forEach(j => {
  const n = aliasNum(j.alias);
  (SCHED[n] || []).filter(Boolean).forEach((pid, k) => {
    if (n === 3 || (n === 4 && k === 0)) return;              // scored in the browser above
    if (n === 2 && k === 4) return;                           // still to come (shows on the boards)
    const p = store.projects.find(x => x.id === pid);
    const crit = rubricOf(p.department_id).criteria;
    const q = QUALITY[pid] + (n % 3 - 1) * 0.15;
    store.scores.push({ school_id: SID, judge_id: j.id, project_id: pid, submitted_at: now, notes: "", commendation: "",
      feedback: null, safety_concern: false,
      criteria: Object.fromEntries(crit.map((c, ci) => {
        const r = Math.max(1, Math.min(5, Math.round(q + ((ci * 7 + n * 3) % 5 - 2) * 0.45)));
        return [c.id, c.steps[r - 1]];
      })) });
  });
  if (n !== 3 && n !== 2) store.validations.push({ school_id: SID, judge_id: j.id, approved: true, comment: "", validated_at: now });
});

// ── 4. The admin's event day ─────────────────────────────────────────────────────────────────────
console.log("Admin");
await A.page.reload();                     // reload to load the judges' work from the fake database
await A.page.locator(".role-card.adm").click();
// Still signed in → the dashboard; but a click before the saved session has loaded opens the
// login form instead, so sign in again when it shows.
await Promise.race([A.page.locator(".adm-side").waitFor({ timeout: 20000 }), A.page.locator("input[type=email]").waitFor({ timeout: 20000 })]);
if (await A.page.locator("input[type=email]").isVisible()) {
  await A.page.locator("input[type=email]").fill("admin@test.edu");
  await A.page.locator("input[type=password]").fill("correct-horse");
  await A.page.keyboard.press("Enter");
}
await A.page.locator(".adm-side").waitFor({ timeout: 20000 });
const main = (A) => [A.page.locator(".adm-main > *").first(), A.page.locator(".adm-main > *").last()];
await tab(A, "Overview");
const guide = A.page.locator(".setup-guide").first();
await shot(A, "admin-1-signin", { region: guide,
  marks: [[guide.locator(".setup-share-row").nth(0), 1, "tr"], [guide.locator(".setup-share-row").nth(1), 2, "tr"],
    [guide.locator(".setup-share-row").nth(2), 3, "tr"]] });

await tab(A, "Setup");
const deptCard = A.page.locator(".card").filter({ has: A.page.getByLabel("How 6-8 is judged") }).first();
await shot(A, "admin-2-departments", { region: [deptCard.locator(".lbl").first(), deptCard.locator(".setup-row").last()],
  marks: [[A.page.getByLabel("How 6-8 is judged"), 1, "tr"], [A.page.getByLabel("Places for 6-8"), 2, "tr"]] });

const schedCard = A.page.locator("#schedule");
await shot(A, "admin-3-schedule", { region: schedCard,
  marks: [[schedCard.locator("label.btn", { hasText: /Import a new version|Import schedule/ }), 1, "tr"],
    [schedCard.locator("label.btn", { hasText: /Import booth numbers/ }), 2, "tr"],
    [schedCard.getByRole("button", { name: /Judge sheets/ }), 3, "tr"], [schedCard.getByRole("button", { name: /Booth visit times/ }), 4, "tr"],
    [schedCard.locator('[data-testid="sched-tpl"] summary'), 5, "tr"]] });

await tab(A, "Projects");
const projHead = A.page.locator(".adm-main > div").filter({ hasText: "Projects Overview" }).first();
await shot(A, "admin-4-projects", { region: [projHead, A.page.locator(".proj-mgmt-card").nth(1)],
  marks: [[projHead.getByRole("button", { name: /Scan forms/ }), 1, "tr"], [projHead.getByRole("button", { name: /Add Project/ }), 2, "tr"],
    [A.page.locator(".proj-mgmt-card").first().locator(".proj-mgmt-actions"), 3, "tr"]] });

await tab(A, "Alerts");
const card = (t) => A.page.locator(".adm-main .card").filter({ hasText: t }).first();
await shot(A, "admin-5-alerts", { region: main(A), tall: 1500,
  marks: [[card("Connection (this screen)"), 1, "tr"], [card("Scores stuck on a device"), 2, "tr"], [card("Scoring progress by department"), 3, "tr"]] });

await tab(A, "Judges");
await shot(A, "admin-6-judges", { region: [A.page.locator(".adm-main .adm-h1").first(), A.page.locator(".adm-main tr").nth(4)],
  marks: [[A.page.getByRole("button", { name: /Allow Transfer/ }).first(), 1, "tr"], [A.page.getByRole("button", { name: /^Remove$/ }).first(), 2, "tr"]] });

await shot(A, "admin-7-lock", { region: A.page.locator(".adm-side"), tall: 1000, pad: 0,
  marks: [[A.page.locator(".adm-side .nav-it", { hasText: "Lock Judging" }), 1, "r"]] });

await tab(A, "Awards");
await shot(A, "admin-8-awards", { region: [A.page.locator(".adm-main > *").first(), A.page.locator(".adm-main .card").nth(2)], tall: 1800,
  marks: [[A.page.getByRole("button", { name: /Confirm all ready groups/ }), 1, "tr"],
    [A.page.getByRole("button", { name: /Print awards list/ }), 2, "tr"]] });
await A.page.getByRole("button", { name: /Confirm all ready groups/ }).click();
await A.page.waitForTimeout(800);

await tab(A, "Validation");
await A.page.locator(".adm-main").getByRole("button", { name: /Approve Results/ }).click();
await A.page.getByRole("button", { name: /Finalize Results/ }).waitFor();
await A.page.waitForTimeout(500);
await shot(A, "admin-9-validation", { region: main(A), tall: 2200,
  marks: [[A.page.locator(".adm-main .card").filter({ hasText: "Judge Validations" }).first(), 1, "tr"],
    [A.page.locator(".adm-main .card").filter({ hasText: "Your Validation" }).first(), 2, "tr"],
    [A.page.getByRole("button", { name: /Finalize Results/ }), 3, "tr"]] });
await A.page.getByRole("button", { name: /Finalize Results/ }).click();
await A.page.waitForTimeout(800);

await tab(A, "Share");
await A.page.getByRole("button", { name: /Generate Live Results Link/ }).click();
await A.page.waitForTimeout(800);
await shot(A, "admin-10-share", { region: main(A), tall: 2000,
  marks: [[A.page.locator(".adm-main button", { hasText: /^\W*Copy$/ }).first(), 1, "tr"],
    [A.page.getByRole("button", { name: /Preview Page/ }), 2, "tr"], [A.page.getByRole("button", { name: /Download Results CSV/ }), 3, "tr"]] });

await tab(A, "Score Export");
await shot(A, "admin-11-export", { region: main(A), tall: 2000,
  marks: [[A.page.getByRole("button", { name: /Save Score Backup/ }), 1, "tr"], [A.page.getByRole("button", { name: /Download Judge Scores CSV/ }), 2, "tr"]] });

console.log(`\n${sizes.length} screenshot(s) → public/help/`);
if (errs.length) { console.log("Page errors:"); errs.forEach(e => console.log("  ", e)); }
await browser.close();
