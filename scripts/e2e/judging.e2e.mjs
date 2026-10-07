// Browser E2E — judging scenarios the lifecycle test does not reach (mock backend, see mock.mjs):
// two judges → averages + per-department ranking, a double-tapped Submit Score, a judge's
// concern, a tie → deliberation → judge notes → admin awards → finalize → award badges on the
// public page, a scored project re-graded below 5, device transfer (PIN, one-time allowance,
// failed save), session isolation between schools, and removed / reset judges' devices.
// Run: see scan.e2e.mjs header (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { freshStore, installMock, DEPTS, SID } from "./mock.mjs";

const BASE = "http://localhost:5199";
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n").slice(0, 5).join(" | ")); if (process.env.DBG) console.log(JSON.stringify(store.validations), store.it_logs.filter(r => /TRANSFER/.test(r.event)).map(r => r.event)); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
const errs = [];

const store = freshStore();
const now = new Date().toISOString();
const SID2 = "22222222-2222-2222-2222-222222222222";
store.schools.push({ id: SID2, name: "Other Academy", slug: "other", created_at: now });
store.projects.push(
  { id: "p_alpha", school_id: SID, num: "002", title: "Alpha Algae", cat: "Life Science", grade: "7", locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now },
  { id: "p_beta",  school_id: SID, num: "003", title: "Beta Bridges", cat: "Physics, Math & Astronomy", grade: "8", locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now },
  { id: "p_hydro", school_id: SID, num: "004", title: "Hydro Rocket", cat: "Physics, Math & Astronomy", grade: "10", locked: false, department_id: DEPTS.D_HIGH, room: "", description: "", motivation: "", created_at: now },
);

async function newPage(vp = { width: 820, height: 1180 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  const log = [];
  await installMock(page, store, log);
  return { ctx, page, log };
}
const setting = (k) => store.app_settings.find(r => r.key === k)?.value;
const itEvents = (ev) => store.it_logs.filter(r => r.event === ev);
const ls = (page, k) => page.evaluate((key) => localStorage.getItem(key), k);

async function signInJudge(page, alias) {
  await page.goto(`${BASE}/s/test`);
  await page.locator(".role-card").first().click();
  await page.getByRole("button", { name: /Middle School/ }).click();
  await page.locator('input[placeholder="e.g. Judge1"]').fill(alias);
  await page.locator('input[placeholder="Event invite code"]').fill("abc123");
  await page.getByRole("button", { name: /Enter as Judge/ }).click();
}
// Every criterion at its maximum, then presentation (first criterion) on step `presIdx`.
async function score(page, title, presIdx = null) {
  await page.locator(".proj-item", { hasText: title }).click();
  const groups = page.locator(".rub-steps");
  for (let i = 0; i < await groups.count(); i++) await groups.nth(i).locator("button").last().click();
  if (presIdx != null) await groups.first().locator("button").nth(presIdx).click();
  await page.getByRole("button", { name: /Submit Score/ }).click();
  await page.locator(".proj-item").first().waitFor();
}
async function adminLogin(page) {
  await page.goto(`${BASE}/s/test`);
  await page.locator(".role-card.adm").click();
  await page.locator("input[type=email]").fill("admin@test.edu");
  await page.locator("input[type=password]").fill("correct-horse");
  await page.keyboard.press("Enter");
  await page.locator(".adm-side").waitFor({ timeout: 6000 });
}
// After a reload the admin may land on the school page; the admin card goes straight back in.
async function adminReload(page) {
  await page.reload();
  const side = page.locator(".adm-side");
  try { await side.waitFor({ timeout: 2500 }); } catch { await page.locator(".role-card.adm").click(); await side.waitFor({ timeout: 6000 }); }
}
const tab = (page, label) => page.locator(".nav-it", { hasText: label }).first().click();

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Two judges score the same department");
const J1 = await newPage();
await signInJudge(J1.page, "Judge1");
await J1.page.locator(".proj-item").first().waitFor({ timeout: 6000 });

// Double tap: hold the scores request so both taps land while the first is in flight.
await J1.page.route("https://mock.supabase.co/rest/v1/scores**", async (r) => {
  if (r.request().method() === "POST") await new Promise(res => setTimeout(res, 700));
  return r.fallback();
});
await J1.page.locator(".proj-item", { hasText: "Existing Volcano Study" }).click();
{ const g = J1.page.locator(".rub-steps"); for (let i = 0; i < await g.count(); i++) await g.nth(i).locator("button").last().click(); }
const postsBefore = J1.log.filter(l => l.startsWith("POST /rest/v1/scores")).length;
await J1.page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /Submit Score/.test(x.textContent));
  b.click(); b.click();
});
await check("a second tap while saving shows 'Saving…'", () => J1.page.getByRole("button", { name: "Saving…" }).waitFor({ timeout: 2000 }));
await J1.page.locator(".proj-item").first().waitFor({ timeout: 6000 });
await J1.page.unroute("https://mock.supabase.co/rest/v1/scores**");
await check("double-tapped Submit Score sends ONE save and writes ONE audit entry", async () => {
  await J1.page.waitForTimeout(500);
  assert.equal(J1.log.filter(l => l.startsWith("POST /rest/v1/scores")).length - postsBefore, 1, "upserts sent");
  assert.equal(itEvents("SCORE_SUBMITTED").filter(r => r.payload?.projectId === "p_seed").length, 1, "SCORE_SUBMITTED rows");
  assert.equal(store.scores.filter(s => s.project_id === "p_seed").length, 1);
});
await score(J1.page, "Alpha Algae", 2);       // 40
await score(J1.page, "Beta Bridges");         // 42

const J2 = await newPage();
await signInJudge(J2.page, "Judge2");
await J2.page.locator(".proj-item").first().waitFor({ timeout: 6000 });
await score(J2.page, "Existing Volcano Study"); // 42
await score(J2.page, "Alpha Algae");            // 42
await score(J2.page, "Beta Bridges", 2);        // 40
await check("each judge's scores are stored separately (2 per project)", async () => {
  for (const pid of ["p_seed", "p_alpha", "p_beta"]) assert.equal(store.scores.filter(s => s.project_id === pid).length, 2, pid);
});

console.log("\n── Judges validate: one approves, one raises a concern");
// The mock has no realtime: reload so Judge1 sees Judge2's scores (Supabase Realtime does this live).
await J1.page.reload();
await J1.page.getByRole("button", { name: /Approve Results/ }).waitFor({ timeout: 6000 });
await check("the judge's validation list ranks by the AVERAGE of both judges (41.0, not their own 40)", async () => {
  await J1.page.locator(".delib-section").first().getByText("Alpha Algae").waitFor({ timeout: 6000 });
  await J1.page.waitForTimeout(800);
  const t = await J1.page.locator(".delib-section").first().innerText();
  assert.match(t, /1\.\s*Existing Volcano Study\s*42\.0 pts/);
  assert.match(t, /Alpha Algae\s*41\.0 pts/); assert.match(t, /Beta Bridges\s*41\.0 pts/);
});
await J1.page.getByRole("button", { name: /Approve Results/ }).click();
await J1.page.waitForTimeout(400);
await J2.page.getByRole("button", { name: /Flag a Concern/ }).click();
await J2.page.locator("textarea").first().fill("Alpha and Beta look tied — please discuss");
await J2.page.getByRole("button", { name: "Submit Concern" }).click();
await check("a concern is stored as approved=false with the judge's comment", async () => {
  await J2.page.waitForTimeout(400);
  const j2 = store.judges.find(j => j.alias === "Judge2");
  const v = store.validations.find(x => x.judge_id === j2.id);
  assert.equal(v?.approved, false); assert.match(v.comment, /tied/);
  assert.equal(itEvents("RESULTS_CONCERN").length, 1);
});

console.log("\n── Admin: leaderboard, concern, tie → deliberation");
const A = await newPage({ width: 1280, height: 900 });
await adminLogin(A.page);
await check("leaderboard: Middle School ranks Volcano (42.0) above the two 41.0s; High School project shown as unscored", async () => {
  const t = await A.page.locator(".adm-main").innerText();
  const iV = t.indexOf("Existing Volcano Study"), iA = t.indexOf("Alpha Algae"), iB = t.indexOf("Beta Bridges");
  assert.ok(iV >= 0 && iV < iA && iV < iB, "order");
  assert.ok(t.includes("41.0") && t.includes("42.0"));
  assert.ok(t.includes("Hydro Rocket"), "unscored project missing from the leaderboard");
});
await tab(A.page, "Validation");
await check("Validation tab: 1 approved, 1 concerned, with the concern's comment", async () => {
  await A.page.getByText("1 Approved").waitFor({ timeout: 4000 });
  await A.page.getByText("1 Concerned").waitFor();
  await A.page.getByText("⚠ Concern").waitFor();
  await A.page.getByText(/Alpha and Beta look tied/).waitFor();
});
await check("consensus is NOT reached while a judge has a concern", () => A.page.getByText("⏳ Awaiting consensus").waitFor());
await check("tie detected: Alpha and Beta share 41.0 within Middle School", () => A.page.getByText("Tie detected in rankings").waitFor());
await A.page.getByRole("button", { name: "Open Deliberation" }).click();
await check("Open Deliberation saves deliberation_open=true with reason 'tie'", async () => {
  await A.page.getByText(/Open · Reason: Tied scores/).waitFor({ timeout: 4000 });
  assert.equal(setting("deliberation_open"), "true"); assert.equal(setting("deliberation_reason"), "tie");
});

console.log("\n── Judge: deliberation notes");
await J1.page.reload();
await check("judge sees the Deliberation Notes form once deliberation is open", () => J1.page.getByText("💬 Deliberation Notes").waitFor({ timeout: 6000 }));
const alphaNote = J1.page.locator(".delib-proj", { hasText: "Alpha Algae" });
await alphaNote.locator("select").selectOption("Recommend for Award");
await alphaNote.locator("textarea").fill("Clear data, strong conclusion");
await alphaNote.locator("input[type=checkbox]").check();
await alphaNote.getByRole("button", { name: "Submit Note" }).click();
await check("the note is stored (recommendation, comment, flag) and shown as submitted", async () => {
  await alphaNote.getByText("✓ Submitted").waitFor({ timeout: 4000 });
  const n = store.deliberation_notes.find(x => x.project_id === "p_alpha");
  assert.equal(n?.recommendation, "Recommend for Award"); assert.equal(n.flagged, true); assert.match(n.comment, /strong conclusion/);
});
store.failWrites = ["deliberation_notes"];
const betaNote = J1.page.locator(".delib-proj", { hasText: "Beta Bridges" });
await betaNote.locator("select").selectOption("Good Work");
await betaNote.getByRole("button", { name: "Submit Note" }).click();
await check("a failed note save says 'NOT saved' and is not shown as submitted", async () => {
  await J1.page.getByText(/note for Project #003 was NOT saved/).waitFor({ timeout: 4000 });
  assert.equal(await betaNote.getByText("✓ Submitted").count(), 0);
  assert.equal(store.deliberation_notes.filter(x => x.project_id === "p_beta").length, 0);
});
store.failWrites = [];

console.log("\n── Admin: awards + finalize");
await adminReload(A.page);
await tab(A.page, "Validation");
const alphaBlock = A.page.locator("div", { has: A.page.getByText("Alpha Algae", { exact: true }) })
  .filter({ has: A.page.locator("select.delib-rec-select") }).last();
await check("admin sees the judge's note, recommendation, flag and each judge's total (40/42, 42/42)", async () => {
  await alphaBlock.getByText(/Clear data, strong conclusion/).waitFor({ timeout: 4000 });
  await alphaBlock.getByText("Recommend for Award").waitFor();
  await alphaBlock.getByText(/1 flag for discussion/).waitFor();
  const t = await alphaBlock.innerText();
  assert.ok(t.includes("40/42") && t.includes("42/42"), t);
});
await alphaBlock.locator("select.delib-rec-select").selectOption("1st Place");
await alphaBlock.getByRole("button", { name: "Save Award" }).click();
await check("the award is saved as a finalized decision", async () => {
  await alphaBlock.getByRole("button", { name: "✓ Saved" }).waitFor({ timeout: 4000 });
  const d = store.final_decisions.find(x => x.project_id === "p_alpha");
  assert.equal(d?.award, "1st Place"); assert.equal(d.finalized, true);
});
await A.page.getByRole("button", { name: /Approve Results/ }).click();
const fin = A.page.getByRole("button", { name: /Finalize Results/ });
await check("Finalize stays disabled while deliberation is open", async () => {
  await A.page.getByText("Close deliberation before finalizing.").waitFor({ timeout: 4000 });
  assert.equal(await fin.isDisabled(), true);
});
await A.page.getByRole("button", { name: "Close Deliberation" }).click();
await A.page.getByRole("button", { name: "Open Manually" }).waitFor({ timeout: 4000 });
// Until 2026-10-07 a concern was advisory: Finalize only needed the admin's approval while the
// screen told admins that judges "must approve".
await check("Finalize is blocked while a judge's concern is open, and the screen names the judge", async () => {
  assert.equal(await fin.isDisabled(), true, "Finalize is ENABLED although Judge2 raised a concern");
  await A.page.getByText(/Judge2 raised a concern/).waitFor({ timeout: 2000 });
});
const j2row = A.page.locator("div", { has: A.page.getByText("⚠ Concern") }).filter({ has: A.page.getByRole("button", { name: "Clear concern" }) }).last();
store.failWrites = ["validations"];
await j2row.getByRole("button", { name: "Clear concern" }).click();
await check("a failed Clear concern says NOT cleared and changes nothing", async () => {
  await A.page.getByText(/concern from Judge2 was NOT cleared/).waitFor({ timeout: 4000 });
  assert.equal(store.validations.filter(v => v.approved === false).length, 1);
  assert.equal(await fin.isDisabled(), true);
});
store.failWrites = [];
await j2row.getByRole("button", { name: "Clear concern" }).click();
await check("Clear concern puts the judge back to Pending, logs it, and unblocks Finalize", async () => {
  await A.page.getByText("1 Pending").waitFor({ timeout: 4000 });
  await A.page.waitForTimeout(500);   // the IT-log insert is not awaited by the UI
  assert.equal(store.validations.filter(v => v.approved === false).length, 0);
  assert.equal(itEvents("JUDGE_CONCERN_CLEARED").length, 1);
  assert.equal(await fin.isDisabled(), false, "a judge who has not validated must not block Finalize");
});
// Continue as the event would: Judge2 validates again and approves.
await J2.page.reload();
await J2.page.locator(".proj-item").first().waitFor({ timeout: 6000 });
await J2.page.waitForTimeout(1500);   // let the server load land (the cached screen comes first)
await J2.page.getByRole("button", { name: /Approve Results/ }).click();
await J2.page.waitForTimeout(400);
await adminReload(A.page);
await tab(A.page, "Validation");
await check("once every judge approves, consensus is reached", () => A.page.getByText("✅ Consensus reached").waitFor({ timeout: 4000 }));
await A.page.getByRole("button", { name: /Finalize Results/ }).click();
await check("finalize saved", async () => { await A.page.waitForTimeout(400); assert.equal(setting("results_finalized"), "true"); });

await J1.page.reload();
await J1.page.locator(".proj-item").first().waitFor({ timeout: 6000 });
await check("judges no longer see the notes form once deliberation is closed", async () => {
  await J1.page.waitForTimeout(800);
  assert.equal(await J1.page.getByText("💬 Deliberation Notes").count(), 0);
});

console.log("\n── Public results with awards");
await tab(A.page, "Share");
await A.page.getByRole("button", { name: /Generate Live Results Link/ }).click();
await A.page.waitForTimeout(500);
const P = await newPage({ width: 390, height: 844 });
await P.page.goto(`${BASE}/s/test?token=${store.share_links[0]?.token}`);
await P.page.getByText("Existing Volcano Study").first().waitFor({ timeout: 8000 });
await check("public page shows the 1st Place award badge on Alpha", async () => {
  const badges = await P.page.locator(".award-badge").allInnerTexts();
  assert.ok(badges.some(b => /1st Place/.test(b)), JSON.stringify(badges));
});
await check("public page never shows judge names, judges' notes or the concern", async () => {
  const t = await P.page.locator("body").innerText();
  for (const s of ["Judge1", "Judge2", "strong conclusion", "look tied", "Ms. Lee", "Ana Ruiz"]) assert.ok(!t.includes(s), s);
});

console.log("\n── A scored project re-graded below 5");
store.projects.find(p => p.id === "p_seed").grade = "4";   // scored at grade 6 with abstract = 6
await adminReload(A.page);
await check("Volcano now shows 36.0 (abstract no longer counts), never 42.0 out of 36", async () => {
  const t = await A.page.locator(".adm-main").innerText();
  assert.ok(t.includes("36.0"), "36.0 not shown"); assert.ok(!t.includes("42.0"), "42.0 still shown");
});
store.projects.find(p => p.id === "p_seed").grade = "6";

console.log("\n── Device transfer");
const T = await newPage({ width: 390, height: 844 });
await signInJudge(T.page, "Judge1");
await check("a second device cannot take Judge1 without the admin", () => T.page.getByText(/Judge1 is already signed in/).waitFor({ timeout: 4000 }));
await tab(A.page, "Judges");
const row1 = A.page.locator("tr", { hasText: "Judge1" });
// A failed save must not show the transfer as approved (rule 55).
store.failWrites = ["app_settings"];
await row1.getByRole("button", { name: /Allow Transfer|Approved/ }).click();
await A.page.locator(".modal-box input").fill("4821");
await A.page.getByRole("button", { name: "Approve transfer" }).click();
await check("a transfer that could not be saved says NOT approved, is not shown as approved, and is logged", async () => {
  await A.page.getByText(/transfer was NOT approved/).waitFor({ timeout: 4000 });
  await A.page.waitForTimeout(500);
  assert.equal(JSON.parse(setting("judge_transfer_allowances") || "{}").Judge1, undefined, "the mock saved it?");
  assert.equal(itEvents("JUDGE_TRANSFER_SAVE_FAILED").length, 1);
  assert.equal(itEvents("JUDGE_TRANSFER_APPROVED").length, 0, "success was logged for a failed save");
  assert.equal(await row1.getByRole("button", { name: "Approved (active)" }).count(), 0, "button says 'Approved (active)' but nothing was saved");
});
store.failWrites = [];
await A.page.keyboard.press("Escape").catch(() => {});
if (await A.page.locator(".modal-box").count()) await A.page.getByRole("button", { name: "Cancel" }).last().click();
await row1.getByRole("button", { name: /Allow Transfer|Approved/ }).click();
await A.page.locator(".modal-box input").fill("9999");
await A.page.getByRole("button", { name: "Approve transfer" }).click();
await check("wrong PIN: transfer refused, nothing stored", async () => {
  await A.page.getByText(/Incorrect PIN/).waitFor({ timeout: 4000 });
  assert.equal(JSON.parse(setting("judge_transfer_allowances") || "{}").Judge1, undefined);
});
await A.page.locator(".modal-box input").fill("4821");
await A.page.getByRole("button", { name: "Approve transfer" }).click();
await check("right PIN: a ~10-minute allowance is stored for Judge1", async () => {
  await A.page.waitForTimeout(500);
  const until = JSON.parse(setting("judge_transfer_allowances") || "{}").Judge1;
  assert.ok(until > Date.now() + 9 * 60e3 && until < Date.now() + 11 * 60e3, String(until));
});
const judgesBefore = store.judges.length;
const j1id = store.judges.find(j => j.alias === "Judge1").id;
await T.page.getByRole("button", { name: /Enter as Judge/ }).click();
await check("the new device gets the SAME Judge1 (no second row) with their work intact", async () => {
  await T.page.getByRole("button", { name: /Revise my validation/ }).waitFor({ timeout: 6000 });
  assert.equal(store.judges.length, judgesBefore);
  assert.equal(await ls(T.page, "sf_judge_id"), j1id);
  assert.equal(itEvents("JUDGE_SESSION_TRANSFERRED").length, 1);
});
await check("the allowance is used up: a third device is refused again", async () => {
  assert.equal(JSON.parse(setting("judge_transfer_allowances") || "{}").Judge1, undefined);
  const X = await newPage({ width: 390, height: 844 });
  await signInJudge(X.page, "Judge1");
  await X.page.getByText(/Judge1 is already signed in/).waitFor({ timeout: 4000 });
  await X.ctx.close();
});

console.log("\n── Sessions belong to one school");
await T.page.goto(`${BASE}/s/other`);
await check("Judge1's session is not used on another school's page", async () => {
  await T.page.getByText("Other Academy").first().waitFor({ timeout: 6000 });
  await T.page.waitForTimeout(800);
  assert.equal(await T.page.locator(".proj-item").count(), 0);
  assert.equal(await ls(T.page, "sf_judge_id"), j1id, "visiting another school wiped the session");
});
await T.page.goto(`${BASE}/s/test`);
await check("…and is still there back on its own school", () => T.page.locator(".proj-item").first().waitFor({ timeout: 6000 }));

console.log("\n── Removed judges' devices");
store.judges = store.judges.filter(j => j.alias !== "Judge2");
await J2.page.reload();
await check("a removed judge's device returns to the landing page and forgets the session", async () => {
  await J2.page.locator(".role-card").first().waitFor({ timeout: 6000 });
  assert.equal(await J2.page.locator(".proj-item").count(), 0);
  assert.equal(await ls(J2.page, "sf_judge_id"), null);
});
store.judges = [];          // what Reset All Data leaves behind
store.scores = []; store.validations = [];
await J1.page.reload();
await check("after Reset All Data (no judges left) a judge's device also returns to the landing page", async () => {
  await J1.page.waitForTimeout(2500);
  assert.equal(await J1.page.locator(".proj-item").count(), 0, "still showing the judge's project list for a judge that no longer exists");
  assert.equal(await ls(J1.page, "sf_judge_id"), null);
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
