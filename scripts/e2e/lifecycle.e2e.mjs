// Browser E2E — the full judging lifecycle on the real UI (mock backend, see mock.mjs):
// judge scores (incl. grade<5 abstract rule, zero rule, edit), offline queue + sync,
// judging lock, validate / revise, admin leaderboard, lock toggle, admin validation,
// finalize, share link → public results (no judge names), CSV export, IT-logs PIN and
// Reset — with a 6-digit admin PIN (4–8 digits are allowed).
// Run: see scan.e2e.mjs header (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { freshStore, installMock, DEPTS, SID } from "./mock.mjs";

const BASE = "http://localhost:5199";
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
const errs = [];

const store = freshStore();
store.pin = "482193";                                  // 6-digit PIN
const now = new Date().toISOString();
store.projects.push(
  { id: "p_young", school_id: SID, num: "002", title: "Young Plants", cat: "Life Science", grade: "4", locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now },
  { id: "p_old8",  school_id: SID, num: "003", title: "Eighth Grade Rockets", cat: "Physics, Math & Astronomy", grade: "8", locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now },
);
store.rubrics.push({ id: "rub1", school_id: SID, name: "Default", is_active: true, criteria: [] }); // DB default "[]" → app must fall back to DEFAULT_RUBRIC

async function newPage(vp = { width: 820, height: 1180 }) {
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  const log = [];
  await installMock(page, store, log);
  return { ctx, page, log };
}
const scoreOf = (pid) => store.scores.filter(s => s.project_id === pid);
const maxAll = async (page) => { const groups = page.locator(".rub-steps"); for (let i = 0; i < await groups.count(); i++) await groups.nth(i).locator("button").last().click(); };

console.log("\n── Judge: sign in + score");
const J = await newPage();
await J.page.goto(`${BASE}/s/test`);
await J.page.locator(".role-card").first().click();
await J.page.getByRole("button", { name: /Middle School/ }).click();
await J.page.locator('input[placeholder="e.g. Judge1"]').fill("Judge1");
await J.page.locator('input[placeholder="Event invite code"]').fill("abc123");
await J.page.getByRole("button", { name: /Enter as Judge/ }).click();
await J.page.locator(".proj-item").first().waitFor({ timeout: 6000 });
await check("judge sees all 3 Middle School projects", async () => assert.equal(await J.page.locator(".proj-item").count(), 3));

// Grade 4 project: no Abstract criterion, max = 36
await J.page.locator(".proj-item", { hasText: "Young Plants" }).click();
await check("grade-4 project hides the Abstract criterion (9 criteria)", async () => assert.equal(await J.page.locator(".rub-steps").count(), 9));
await check("submit disabled until every criterion is scored", async () =>
  assert.equal(await J.page.getByRole("button", { name: /Submit Score/ }).isDisabled(), true));
await maxAll(J.page);
await check("grade-4 total shows 36 / 36", async () => {
  assert.equal((await J.page.locator(".sc-total-num").innerText()).trim(), "36");
  await J.page.getByText("Out of 36 points").waitFor();
});
await J.page.getByRole("button", { name: /Submit Score/ }).click();
await J.page.locator(".proj-item").first().waitFor();
await check("score saved to the database with criteria JSON (no abstract key)", async () => {
  const s = scoreOf("p_young"); assert.equal(s.length, 1);
  assert.equal(s[0].criteria.presentation, 6); assert.equal(s[0].criteria.abstract, undefined);
});

// Grade 6 project: zero rule
await J.page.locator(".proj-item", { hasText: "Existing Volcano Study" }).click();
await maxAll(J.page);
await J.page.locator(".rub-steps").first().locator("button").first().click();   // presentation = 0
await check("grade 5+: a zero blocks submission with a warning", async () => {
  await J.page.getByText(/must have no zeroes/).waitFor();
  assert.equal(await J.page.getByRole("button", { name: /Submit Score/ }).isDisabled(), true);
});
await J.page.locator(".rub-steps").first().locator("button").last().click();
await check("grade-6 total 42 / 42", async () => assert.equal((await J.page.locator(".sc-total-num").innerText()).trim(), "42"));
await J.page.getByRole("button", { name: /Submit Score/ }).click();
await J.page.locator(".proj-item").first().waitFor();

// Edit an existing score
await J.page.locator(".proj-item", { hasText: "Existing Volcano Study" }).click();
await check("re-opening a scored project shows the saved values", async () =>
  assert.equal((await J.page.locator(".sc-total-num").innerText()).trim(), "42"));
await J.page.locator(".rub-steps").first().locator("button").nth(2).click();       // presentation 6 → 4
await J.page.getByRole("button", { name: /Submit Score/ }).click();
await J.page.locator(".proj-item").first().waitFor();
await check("editing updates the SAME row (no duplicate)", async () => {
  const s = scoreOf("p_seed"); assert.equal(s.length, 1); assert.equal(s[0].criteria.presentation, 4);
});

console.log("\n── Judge: offline scoring + sync");
await J.ctx.setOffline(true); store.offline = true;
await J.page.locator(".proj-item", { hasText: "Eighth Grade Rockets" }).click();
await maxAll(J.page);
await J.page.getByRole("button", { name: /Submit Score/ }).click();
await J.page.locator(".proj-item").first().waitFor();
await check("offline: score kept on the device, not lost", async () => {
  assert.equal(scoreOf("p_old8").length, 0);
  const q = await J.page.evaluate(() => JSON.parse(localStorage.getItem("sf_offline_queue") || "[]"));
  assert.equal(q.length, 1); assert.equal(q[0].data.project_id, "p_old8");
});
await check("offline: judge sees the offline / pending warning", () => J.page.locator(".offline-banner").first().waitFor({ timeout: 4000 }));
store.offline = false; await J.ctx.setOffline(false);
await J.page.waitForTimeout(2500);
await check("back online: queued score syncs automatically and the queue empties", async () => {
  assert.equal(scoreOf("p_old8").length, 1);
  const q = await J.page.evaluate(() => JSON.parse(localStorage.getItem("sf_offline_queue") || "[]"));
  assert.equal(q.length, 0);
});

console.log("\n── Judge: validate + revise");
await check("after 3/3 the judge is asked to validate", () => J.page.getByRole("button", { name: /Approve Results/ }).waitFor({ timeout: 4000 }));
await J.page.getByRole("button", { name: /Approve Results/ }).click();
await check("approval saved", async () => { await J.page.waitForTimeout(400); assert.equal(store.validations.filter(v => v.approved === true && v.judge_id !== "admin").length, 1); });
await check("validated judge can no longer open projects to re-score", async () => {
  await J.page.locator(".proj-item").first().click(); await J.page.waitForTimeout(300);
  assert.equal(await J.page.locator(".rub-steps").count(), 0);
});
await J.page.getByRole("button", { name: /Revise my validation/ }).click();
await check("revise deletes the validation in the database and unlocks", async () => {
  await J.page.getByRole("button", { name: /Approve Results/ }).waitFor({ timeout: 4000 });
  assert.equal(store.validations.filter(v => v.judge_id !== "admin").length, 0);
});
await J.page.getByRole("button", { name: /Approve Results/ }).click();
await J.page.waitForTimeout(400);

console.log("\n── Judge: judging lock");
store.app_settings.find(r => r.key === "locked").value = "true";
await J.page.reload();
await check("locked: judge sees the lock banner", () => J.page.locator(".locked-banner").waitFor({ timeout: 6000 }));
store.app_settings.find(r => r.key === "locked").value = "false";

console.log("\n── Admin: results, lock, validation, finalize");
const A = await newPage({ width: 1280, height: 900 });
await A.page.goto(`${BASE}/s/test`);
await A.page.locator(".role-card.adm").click();
await A.page.locator('input[type=email]').fill("admin@test.edu");
await A.page.locator('input[type=password]').fill("correct-horse");
await A.page.keyboard.press("Enter");
await A.page.locator(".adm-side").waitFor({ timeout: 6000 });
await check("overview leaderboard shows the scored projects with averages", async () => {
  const t = await A.page.locator(".adm-main").innerText();
  for (const s of ["Young Plants", "Existing Volcano Study", "Eighth Grade Rockets"]) assert.ok(t.includes(s), s);
  assert.ok(t.includes("40.0") || t.includes("40"), "volcano avg 40 (42 − 2) not shown");
});
await A.page.locator(".nav-it", { hasText: "Lock Judging" }).click();
await check("lock toggle saves to the database and flips the label", async () => {
  await A.page.locator(".nav-it", { hasText: "Unlock Judging" }).waitFor({ timeout: 4000 });
  assert.equal(store.app_settings.find(r => r.key === "locked").value, "true");
});
await A.page.locator(".nav-it", { hasText: "Unlock Judging" }).click();
await A.page.locator(".nav-it", { hasText: "Lock Judging" }).waitFor();

await A.page.locator(".nav-it", { hasText: "Validation" }).click();
await check("validation tab shows Judge1 approved", () => A.page.getByText(/Judge1/).first().waitFor({ timeout: 4000 }));
await A.page.getByRole("button", { name: /Approve Results/ }).click();
await check("admin approval saved as judge_id 'admin'", async () => { await A.page.waitForTimeout(400); assert.ok(store.validations.some(v => v.judge_id === "admin" && v.approved)); });
const fin = A.page.getByRole("button", { name: /Finalize Results/ });
await check("Finalize becomes available after consensus", async () => assert.equal(await fin.isDisabled(), false));
await fin.click();
await check("finalize saved", async () => { await A.page.waitForTimeout(400); assert.equal(store.app_settings.find(r => r.key === "results_finalized")?.value, "true"); });

console.log("\n── Admin: share link → public results");
await A.page.locator(".nav-it", { hasText: "Share" }).click();
await A.page.getByRole("button", { name: /Generate Live Results Link/ }).click();
await A.page.waitForTimeout(500);
const link = store.share_links[0];
await check("share link stored", async () => assert.ok(link?.token));
const P = await newPage({ width: 390, height: 844 });
await P.page.goto(`${BASE}/s/test?token=${link.token}`);
await check("public results page opens from the link", () => P.page.getByText("Existing Volcano Study").first().waitFor({ timeout: 8000 }));
await check("public results never show judge names or student names", async () => {
  const t = await P.page.locator("body").innerText();
  for (const n of ["Judge1", "Ana Ruiz", "Ms. Lee"]) assert.ok(!t.includes(n), n);
});
await P.page.goto(`${BASE}/s/test?token=WRONG-TOKEN`);
await check("a wrong token shows 'Link Unavailable'", () => P.page.getByText(/Unavailable/i).first().waitFor({ timeout: 8000 }));

console.log("\n── Admin: exports");
await A.page.locator(".nav-it", { hasText: "Score Export" }).click();
const [dl] = await Promise.all([A.page.waitForEvent("download"), A.page.getByRole("button", { name: /Download Judge Scores CSV/ }).click()]);
const csv = readFileSync(await dl.path(), "utf8");
await check("judge-score CSV has per-criterion values (was empty before Sept fix)", async () => {
  assert.match(csv, /Presentation/); assert.match(csv, /Judge1/); assert.match(csv, /"6"|,6,|"4"/);
});

console.log("\n── Admin: IT logs + Reset with a 6-digit PIN");
await A.page.locator(".nav-it", { hasText: "IT Logs" }).click();
await A.page.locator('input[placeholder="••••"]').fill("4821");
await A.page.getByRole("button", { name: "Unlock" }).click();
await check("wrong PIN refused", () => A.page.getByText(/Incorrect PIN/).waitFor({ timeout: 4000 }));
await A.page.locator('input[placeholder="••••"]').fill("482193");
await A.page.keyboard.press("Enter");
await check("6-digit PIN unlocks IT Logs (was impossible: box stopped at 4 digits)", () => A.page.getByText("IT Diagnostic Logs").first().waitFor({ timeout: 4000 }));
await A.page.locator(".nav-it", { hasText: "Reset All Data" }).click();
await A.page.locator('.modal-box input[type=password]').fill("482193");
await A.page.getByRole("button", { name: "Reset everything" }).click();
await A.page.waitForTimeout(1200);
await check("reset clears scores, judges, validations, share links — keeps projects", async () => {
  assert.equal(store.scores.length, 0); assert.equal(store.judges.length, 0);
  assert.equal(store.validations.length, 0); assert.equal(store.share_links.length, 0);
  assert.equal(store.projects.length, 3);
  assert.equal(store.app_settings.find(r => r.key === "results_finalized")?.value, "false");
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
