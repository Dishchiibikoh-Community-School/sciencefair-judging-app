// Browser E2E — the judging schedule (migration 2026-10p, 2026-10-21).
// The organiser's grid (Judge × R1…R12 with project CODES, breaks, wrap-up, "—" = free), saved
// from Excel as CSV, becomes the single source of who judges what: each judge's tablet lists the
// visits in round order with the times and a NEXT card; the grid / panels / Suggested setup are
// locked; booth numbers come from the booth template; printouts carry no names and no scores.
// The fixture file below copies the real file's layout exactly (title rows, line breaks inside the
// header cells, "COMMON BREAK" filler, the legend under the grid).
// Run: see scan.e2e.mjs header (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { freshStore, installMock, DEPTS, SID } from "./mock.mjs";

const BASE = "http://localhost:5199";
const DIR = new URL("./out/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
mkdirSync(DIR, { recursive: true });
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
const errs = [];

const store = freshStore();
store.rubrics.push({ id: "rub1", school_id: SID, name: "Default", is_active: true, criteria: [] });
const now = new Date().toISOString();
const P = (id, num, title, cat, grade, dept) => ({ id, school_id: SID, num, title, cat, grade, locked: false,
  department_id: dept, room: "", description: "", motivation: "", created_at: now });
store.projects = [
  P("p10", "010", "Bean Plants", "Life Science", "3", DEPTS.D_ELEM),                                  // Elem-LS-010
  P("p11", "011", "Egg Enamel", "Chemistry & Material Science", "4", DEPTS.D_ELEM),                    // Elem-CMS-011
  P("p12", "012", "Earthquake Bridges", "Engineering, Robotics & Technology", "7", DEPTS.D_MID),       // JHS-ERT-012
  P("p13", "013", "Magnet Cars", "Physics, Math & Astronomy", "8", DEPTS.D_MID),                       // JHS-PMA-013
];
store.project_private = [{ project_id: "p10", school_id: SID, advisor_name: "Ms. Secret", group_members: [{ name: "Ana Ruiz", grade: "3" }] }];

const csv = (rows) => "﻿" + rows.map(r => r.map(c => /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(",")).join("\r\n");
const HEAD = ["Judge", "Judge Name\n(type here)", "Interviews", "R1\n8:30–8:37", "R2\n8:38–8:45", "BREAK\n8:46–8:51", "R3\n8:51–8:58", "R4\n8:59–9:06", "WRAP-UP\n9:07–9:20"];
const TOP = [["2026–2027 SCIENCE FAIR  |  JUDGING SCHEDULE"], ["Judging starts 8:30 AM  |  7-minute interviews"], [""]];
const FOOT = [[""], ["Green = PreK & SPED visit  |  \"—\" = judge is free"], ["Disclaimer: built on SARSEF rounds."]];
const GOOD = csv([...TOP, HEAD,
  ["Judge 1", "", "3", "Elem-LS-010", "JHS-ERT-012", "COMMON BREAK", "JHS-PMA-013", "—", "WRAP-UP & DEBRIEF"],
  ["Judge 2", "", "4", "JHS-ERT-012", "Elem-LS-010", "", "Elem-CMS-011", "JHS-PMA-013", ""],
  ["Judge 3", "", "4", "JHS-PMA-013", "Elem-CMS-011", "", "JHS-ERT-012", "Elem-LS-010", ""],
  ...FOOT]);
const BAD = csv([...TOP, HEAD,
  ["Judge 1", "", "3", "Elem-LS-010", "JHS-ERT-999", "", "JHS-PMA-013", "—", ""],
  ["Judge 2", "", "4", "Elem-LS-010", "JHS-ERT-012", "", "Elem-CMS-011", "JHS-PMA-013", ""],
  ...FOOT]);
// Judge 1 no longer visits Elem-LS-010 — which they will already have scored.
const DROPS_SCORED = csv([...TOP, HEAD,
  ["Judge 1", "", "2", "JHS-ERT-012", "JHS-PMA-013", "", "—", "—", ""],
  ["Judge 2", "", "4", "Elem-LS-010", "Elem-CMS-011", "", "JHS-PMA-013", "—", ""],
  ...FOOT]);
const BOOTHS = csv([["Booth # (fill in)", "Project code", "Department", "Title"],
  ["A1", "Elem-LS-010", "Elementary", "Bean Plants"], ["A2", "Elem-CMS-011", "Elementary", "Egg Enamel"],
  ["B1", "JHS-ERT-012", "Middle School", "Earthquake Bridges"], ["B2", "JHS-PMA-013", "Middle School", "Magnet Cars"],
  ["Z9", "JHS-XYZ-999", "", "nope"]]);
const file = (name, text) => { const p = DIR + name; writeFileSync(p, text); return p; };
const F = { good: file("sched-good.csv", GOOD), bad: file("sched-bad.csv", BAD), drop: file("sched-drop.csv", DROPS_SCORED), booths: file("booths.csv", BOOTHS) };

async function newPage(vp = { width: 1280, height: 950 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  // Capture printouts instead of opening windows.
  await page.addInitScript(() => { window.__printed = []; window.open = () => ({ document: { write: (h) => window.__printed.push(h), close() {} } }); });
  return { ctx, page };
}
async function adminPage() {
  const A = await newPage();
  await A.page.goto(`${BASE}/s/test`);
  await A.page.locator(".role-card.adm").click();
  await A.page.locator("input[type=email]").fill("admin@test.edu");
  await A.page.locator("input[type=password]").fill("correct-horse");
  await A.page.keyboard.press("Enter");
  await A.page.locator(".adm-side").waitFor({ timeout: 10000 });
  await A.page.locator(".nav-it", { hasText: "Setup" }).click();
  return A;
}
async function judgeIn(n, vp = { width: 820, height: 1180 }) {
  const J = await newPage(vp);
  await J.page.goto(`${BASE}/s/test`);
  await J.page.locator(".role-card").first().click();
  await J.page.locator('input[placeholder="e.g. 7"]').fill(String(n));
  await J.page.locator('input[placeholder="Event invite code"]').fill("ABC123");
  await J.page.getByRole("button", { name: /Enter as Judge/ }).click();
  await J.page.locator(".proj-item").first().waitFor({ timeout: 8000 });
  return J;
}
const pick = (page, label, path) => page.getByLabel(label).setInputFiles(path);

console.log("\n── Import: a file with problems is refused before anything is saved");
let A = await adminPage();
await pick(A.page, "Import judging schedule", F.bad);
await check("an unknown code blocks saving and names the judge + round", async () => {
  const t = await A.page.locator("[data-testid=sched-unknown]").innerText({ timeout: 5000 });
  assert.match(t, /JHS-ERT-999 \(Judge 1, R2\)/);
  assert.equal(await A.page.getByRole("button", { name: "Save schedule" }).isDisabled(), true);
});
await check("two judges at one booth in one round is flagged (Elem-LS-010 in R1: Judges 1 + 2)", async () =>
  assert.match(await A.page.locator("[data-testid=sched-clash]").innerText(), /Elem-LS-010 in R1 \(Judges 1 \+ 2\)/));
await A.page.getByRole("button", { name: "Cancel" }).click();
assert.equal(store.judge_schedule.length, 0);

console.log("\n── Import the real layout");
await pick(A.page, "Import judging schedule", F.good);
await check("the review reads the organiser's layout: 3 judges, 4 rounds 8:30–9:06, the break, 11 visits", async () => {
  const t = await A.page.locator("[data-testid=sched-review]").innerText({ timeout: 5000 });
  assert.match(t, /3 judges · 4 rounds \(8:30–9:06\)/); assert.match(t, /BREAK 8:46–8:51/); assert.match(t, /11 visits/);
  assert.match(t, /3 projects × 3 · 1 project × 2/);
  assert.match(t, /Every code matches a project, every project is visited/);
});
await A.page.getByRole("button", { name: "Save schedule" }).click();
await A.page.locator("[data-testid=sched-active]").waitFor({ timeout: 5000 });
await check("saved: 11 visits, the slots stored, and the grid follows the schedule (Judge 1 → Elementary + Middle School)", async () => {
  assert.equal(store.judge_schedule.length, 11);
  assert.equal(JSON.parse(store.app_settings.find(r => r.key === "judging_schedule").value).length, 6);   // 4 rounds + break + wrap-up
  const d1 = store.judge_roster.filter(r => r.judge_number === 1).map(r => r.department_id).sort();
  assert.deepEqual(d1, [DEPTS.D_ELEM, DEPTS.D_MID].sort());
});
await check("the card says it is in use: 3 judges · 4 rounds · 11 visits · 4 of 4 projects", async () =>
  assert.match(await A.page.locator("[data-testid=sched-active]").innerText(), /3 judges · 4 rounds .*11 visits · 4 of 4 projects/s));
await check("the judge grid is locked and the Suggested setup is hidden while the schedule rules", async () => {
  await A.page.locator("[data-testid=grid-locked]").waitFor();
  assert.equal(await A.page.getByLabel("Judge 1 judges Elementary").isDisabled(), true);
  assert.equal(await A.page.getByText("💡 Suggested setup").count(), 0);
});

console.log("\n── Booth numbers from the booth template");
await pick(A.page, "Import booth numbers", F.booths);
await check("4 booths saved to the projects; the unknown code is reported, not guessed", async () => {
  const t = await A.page.locator("[data-testid=sched-msg]").innerText({ timeout: 5000 });
  assert.match(t, /4 booth numbers saved/); assert.match(t, /JHS-XYZ-999/);
  assert.deepEqual(store.projects.map(p => p.room), ["A1", "A2", "B1", "B2"]);
});

console.log("\n── Printouts");
await A.page.getByRole("button", { name: "🖨 Judge sheets" }).click();
await check("judge sheets: one page per judge, rounds with times, code, booth, the break, 'free' — no student or adviser names", async () => {
  const h = (await A.page.evaluate(() => window.__printed)).at(-1);
  assert.equal((h.match(/judging schedule<\/h1>/g) || []).length, 3);
  assert.match(h, /Judge 1 — judging schedule/); assert.match(h, /Elem-LS-010/); assert.match(h, />A1</); assert.match(h, /BREAK · 8:46–8:51/);
  assert.match(h, /<i>free<\/i>/);
  assert.ok(!/Ana Ruiz|Ms\. Secret/.test(h), "a name leaked into the printout");
});
await A.page.getByRole("button", { name: "🖨 Booth visit times" }).click();
await check("booth sheet: each booth with its three visit times and judges", async () => {
  const h = (await A.page.evaluate(() => window.__printed)).at(-1);
  assert.match(h, /Elem-LS-010<\/td><td>A1<\/td>/);
  assert.match(h, /R1 8:30–8:37 · Judge 1<br>R2 8:38–8:45 · Judge 2<br>R4 8:59–9:06 · Judge 3/);
});
await A.ctx.close();

console.log("\n── Judge 1's tablet follows the schedule");
const J = await judgeIn(1);
await check("NEXT card: R1 · 8:30–8:37, the code in large type, the booth", async () => {
  const t = await J.page.locator("[data-testid=js-next]").innerText();
  assert.match(t, /NEXT · R1 · 8:30–8:37/); assert.match(t, /Elem-LS-010/); assert.match(t, /Booth A1/);
});
await check("the list is the morning in order: R1, R2, the break, R3, R4 free — across two departments", async () => {
  const t = (await J.page.locator("[data-testid=js-list]").innerText()).replace(/\s+/g, " ");
  const order = ["Elem-LS-010", "JHS-ERT-012", "BREAK", "JHS-PMA-013", "free"].map(s => t.indexOf(s));
  assert.ok(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), t);
});
await J.page.locator("[data-testid=js-next]").click();
for (let i = 0; i < await J.page.locator(".rub-item").count(); i++)
  await J.page.locator(".rub-item").nth(i).locator(".rub-step-btn").last().click();
await J.page.getByRole("button", { name: /Submit Score/ }).click();
await J.page.locator("[data-testid=js-next]").waitFor({ timeout: 5000 });
await check("after submitting, NEXT moves to R2 (JHS-ERT-012) and R1 shows as scored", async () => {
  assert.match(await J.page.locator("[data-testid=js-next]").innerText(), /NEXT · R2 · 8:38–8:45[\s\S]*JHS-ERT-012/);
  assert.match(await J.page.locator(".js-item").first().innerText(), /✓/);
});
await J.ctx.close();

console.log("\n── Admin on event day");
A = await adminPage();
await A.page.locator(".nav-it", { hasText: "Judges" }).click();
await check("Judges tab: who has not signed in yet, and the stand-in advice (no Rebalance)", async () => {
  const t = await A.page.locator("[data-testid=sched-judges]").innerText({ timeout: 5000 });
  assert.match(t, /Not signed in yet: Judge 2, Judge 3/); assert.match(t, /stand-in/);
  assert.equal(await A.page.getByRole("button", { name: /Rebalance/ }).count(), 0);
});
await A.page.locator(".nav-it", { hasText: "Setup" }).click();
await pick(A.page, "Import judging schedule", F.drop);
await A.page.getByRole("button", { name: "Replace the schedule" }).click();
await check("a new version that takes away a visit Judge 1 already scored is refused, and nothing changes", async () => {
  await A.page.getByText(/Judge1 has already scored project #010/).waitFor({ timeout: 5000 });
  assert.equal(store.judge_schedule.length, 11);
});
await A.page.getByRole("button", { name: "Cancel" }).click();
// A project added after the import is visited by nobody — the Alerts board must say so.
store.projects.push(P("p14", "014", "Late Entry", "Life Science", "6", DEPTS.D_MID));
await A.ctx.close();
A = await adminPage();
await A.page.locator(".nav-it", { hasText: "Alerts" }).click();
await check("Alerts: a project added after the import is 'not in the judging schedule'", async () =>
  assert.match(await A.page.locator("[data-testid=hb-notscheduled]").innerText({ timeout: 5000 }), /JHS-LS-014/));
store.projects = store.projects.filter(p => p.id !== "p14");

console.log("\n── Removing the schedule");
await A.page.locator(".nav-it", { hasText: "Setup" }).click();
await A.page.getByRole("button", { name: "Remove schedule" }).click();
await A.page.getByRole("button", { name: "Yes, remove" }).click();
await check("removed: no visits, no slots, the grid editable again, Judge 1's score kept", async () => {
  await A.page.getByText(/Schedule removed/).waitFor({ timeout: 5000 });
  assert.equal(store.judge_schedule.length, 0);
  assert.ok(!store.app_settings.some(r => r.key === "judging_schedule"));
  assert.equal(await A.page.getByLabel("Judge 1 judges Elementary").isDisabled(), false);
  assert.equal(store.scores.length, 1);
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
