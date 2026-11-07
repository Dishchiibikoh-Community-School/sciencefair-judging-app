// Browser E2E — the judging-schedule TEMPLATE and the booth template (2026-11).
// Setup → 📅 Judging schedule → "📄 Make a blank schedule template": the times are worked out from a
// few numbers (the defaults reproduce the 2026-27 day exactly), the file is in the layout the importer
// reads, every project code is listed under the grid, and a filled-in template imports cleanly.
// "⬇ Booth template" → fill the Booth # column → ⬆ Import booth numbers saves the booths.
// Run: see scan.e2e.mjs header (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
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
  P("p10", "010", "Bean Plants", "Life Science", "3", DEPTS.D_ELEM),
  P("p11", "011", "Egg Enamel", "Chemistry & Material Science", "4", DEPTS.D_ELEM),
  P("p12", "012", "Earthquake Bridges", "Engineering, Robotics & Technology", "7", DEPTS.D_MID),
  P("p13", "013", "Magnet Cars", "Physics, Math & Astronomy", "8", DEPTS.D_MID),
];
store.project_private = [{ project_id: "p10", school_id: SID, advisor_name: "Ms. Secret", group_members: [{ name: "Ana Ruiz", grade: "3" }] }];
store.app_settings.push({ school_id: SID, key: "judge_max", value: "4" });

const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
await installMock(page, store, []);
await page.goto(`${BASE}/s/test`);
await page.locator(".role-card.adm").click();
await page.locator("input[type=email]").fill("admin@test.edu");
await page.locator("input[type=password]").fill("correct-horse");
await page.keyboard.press("Enter");
await page.locator(".adm-side").waitFor({ timeout: 10000 });
await page.locator(".nav-it", { hasText: "Setup" }).click();
const tpl = page.getByTestId("sched-tpl");
await tpl.locator("summary").click();
const download = async (name) => {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name }).click()]);
  const p = DIR + (await dl.suggestedFilename()); await dl.saveAs(p);
  return { path: p, name: await dl.suggestedFilename(), text: readFileSync(p, "utf8") };
};
const parse = (t) => { const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; } else f += ch; }
  if (f || row.length) { row.push(f); rows.push(row); } return rows; };
const toCsv = (rows) => "﻿" + rows.map(r => r.map(c => /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(",")).join("\r\n");

console.log("\n── The template maker");
await check("the defaults reproduce the 2026-27 day: R1 8:30–8:37 … BREAK 9:02–9:07, R5 9:07 … BREAK 9:39–9:44 … WRAP-UP 10:16–10:30", async () => {
  const t = await page.getByTestId("tpl-preview").innerText();
  for (const s of ["R1 8:30–8:37", "R4 8:54–9:01", "BREAK 9:02–9:07", "R5 9:07–9:14", "R8 9:31–9:38", "BREAK 9:39–9:44", "R9 9:44–9:51", "R12 10:08–10:15", "WRAP-UP 10:16–10:30"])
    assert.ok(t.includes(s), s);
});
await check("a bad value is explained and the download is disabled", async () => {
  await page.getByLabel("Break after rounds", { exact: true }).fill("4, 12");
  await page.getByText(/Breaks go after a round from 1 to 11/).waitFor();
  assert.equal(await page.getByRole("button", { name: "⬇ Download template" }).isDisabled(), true);
  await page.getByLabel("Break after rounds", { exact: true }).fill("2");
  await page.getByLabel("Rounds", { exact: true }).fill("4");
  await page.getByLabel("Wrap-up minutes", { exact: true }).fill("0");
  assert.equal(await page.getByTestId("tpl-preview").innerText(), "R1 8:30–8:37 · R2 8:38–8:45 · BREAK 8:46–8:51 · R3 8:51–8:58 · R4 8:59–9:06");
});
let T;
await check("the file: header in the import layout, one row per judge (Judge 1–4), every project code listed, no names", async () => {
  T = await download("⬇ Download template");
  assert.match(T.name, /^judging-schedule-template-test\.csv$/);
  const rows = parse(T.text.replace(/^﻿/, ""));
  const head = rows.find(r => r[0] === "Judge");
  assert.deepEqual(head.slice(3), ["R1\n8:30–8:37", "R2\n8:38–8:45", "BREAK\n8:46–8:51", "R3\n8:51–8:58", "R4\n8:59–9:06"]);
  assert.deepEqual(rows.filter(r => /^Judge \d+$/.test(r[0])).map(r => r[0]), ["Judge 1", "Judge 2", "Judge 3", "Judge 4"]);
  for (const c of ["Elem-LS-010", "Elem-CMS-011", "JHS-ERT-012", "JHS-PMA-013"]) assert.ok(T.text.includes(c), c);
  for (const n of ["Ana Ruiz", "Ms. Secret"]) assert.ok(!T.text.includes(n), n);
});
await check("filled in like an organiser would, it imports cleanly: 4 judges · 4 rounds · the break · 8 visits", async () => {
  const rows = parse(T.text.replace(/^﻿/, ""));
  const plan = { "Judge 1": ["Elem-LS-010", "JHS-ERT-012", "", "JHS-PMA-013", "—"], "Judge 2": ["JHS-ERT-012", "Elem-LS-010", "", "Elem-CMS-011", "JHS-PMA-013"],
    "Judge 3": ["", "", "", "", ""], "Judge 4": ["Elem-CMS-011", "", "", "", ""] };
  for (const r of rows) if (plan[r[0]]) plan[r[0]].forEach((v, i) => { if (i !== 2) r[3 + i] = v; });
  const filled = DIR + "tpl-filled.csv"; writeFileSync(filled, toCsv(rows));
  await page.getByLabel("Import judging schedule").setInputFiles(filled);
  const rev = page.getByTestId("sched-review"); await rev.waitFor();
  const t = await rev.innerText();
  assert.match(t, /4\s*judges · 4 rounds \(8:30–9:06\) · BREAK 8:46–8:51/);
  assert.match(t, /8\s*visits/);
  assert.equal(await page.getByTestId("sched-unknown").count(), 0);
  await rev.getByRole("button", { name: "Save schedule" }).click();
  await page.getByTestId("sched-active").waitFor();
  assert.equal(store.judge_schedule.length, 8);
  assert.deepEqual(store.judge_schedule.filter(v => v.judge_number === 1).sort((a, b) => a.round_no - b.round_no).map(v => v.project_id), ["p10", "p12", "p13"]);
});
await check("the activity is logged without names (SCHEDULE_TEMPLATE_DOWNLOADED: judges, rounds, projects)", async () => {
  const e = store.it_logs.find(l => l.event === "SCHEDULE_TEMPLATE_DOWNLOADED");
  assert.ok(e); assert.equal(e.payload.judges, 4); assert.equal(e.payload.rounds, 4); assert.equal(e.payload.projects, 4);
});

console.log("\n── The booth template");
await check("⬇ Booth template → Booth # | Project code | Department | Title for every project, no names", async () => {
  const B = await download("⬇ Booth template");
  const rows = parse(B.text.replace(/^﻿/, ""));
  assert.deepEqual(rows[0], ["Booth # (fill in)", "Project code", "Department", "Title"]);
  assert.deepEqual(rows.slice(1).map(r => r[1]), ["Elem-LS-010", "Elem-CMS-011", "JHS-ERT-012", "JHS-PMA-013"]);
  assert.ok(!B.text.includes("Ana Ruiz"));
  rows.slice(1).forEach((r, i) => { r[0] = `A${i + 1}`; });
  const filled = DIR + "booth-filled.csv"; writeFileSync(filled, toCsv(rows));
  await page.getByLabel("Import booth numbers").setInputFiles(filled);
  await page.getByTestId("sched-msg").waitFor();
  assert.deepEqual(store.projects.map(p => p.room), ["A1", "A2", "A3", "A4"]);
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
