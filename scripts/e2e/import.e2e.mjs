// Browser E2E — Projects CSV import (Projects tab → ⬆ Import projects), real UI + mock backend.
// Round trip: download the CSV from school A, import it into an empty school B whose
// department has a different name, and check every field survives — quotes, commas,
// formula-looking titles, accented names, per-student grades. Also: re-import marks
// duplicates, Excel ';' + Windows-1252 files, .xlsx refused, a failed save is retried.
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

async function adminPage(store) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  await page.goto(`${BASE}/s/test`);
  await page.locator(".role-card.adm").click();
  await page.locator("input[type=email]").fill("admin@test.edu");
  await page.locator("input[type=password]").fill("correct-horse");
  await page.keyboard.press("Enter");
  await page.locator(".adm-side").waitFor({ timeout: 6000 });
  await page.locator(".nav-it", { hasText: "Projects" }).first().click();
  return page;
}
const fileInput = (p) => p.locator('input[type=file][accept=".csv,text/csv"]');
const importBtn = (p) => p.getByRole("button", { name: /^⬆ Import \d+ project/ });

// ── School A: projects with awkward content ──
const A = freshStore();
const now = new Date().toISOString();
A.projects.push(
  { id: "p_q", school_id: SID, num: "002", title: 'Salt "Water", Ice & Snow', cat: "Chemistry & Material Science", grade: "8",
    locked: false, department_id: DEPTS.D_MID, room: "C4", description: "Line one,\nline two", motivation: "Because", created_at: now },
  { id: "p_f", school_id: SID, num: "003", title: "=1+1 Rockets", cat: "Physics, Math & Astronomy", grade: "11",
    locked: false, department_id: DEPTS.D_HIGH, room: "", description: "", motivation: "", created_at: now },
);
A.project_private.push(
  { project_id: "p_q", school_id: SID, advisor_name: "Mr. Begay", group_members: [{ name: "José Ñez", grade: "8" }, { name: "Mary Yazzie", grade: "7" }] },
  { project_id: "p_f", school_id: SID, advisor_name: "", group_members: [{ name: "Lee Tso", grade: "11" }] },
);

console.log("\n── School A: download the projects CSV");
const PA = await adminPage(A);
const [dl] = await Promise.all([PA.waitForEvent("download"), PA.getByRole("button", { name: /Download Projects CSV/ }).click()]);
const csvPath = await dl.path();
const csv = readFileSync(csvPath, "utf8");
await check("downloaded CSV has all 3 projects", async () => {
  for (const t of ["Existing Volcano Study", '"Salt ""Water"", Ice & Snow"', "'=1+1 Rockets"]) assert.ok(csv.includes(t), t);
});

// ── School B: empty, and its middle department is called "6-8" ──
const B = freshStore();
B.projects = []; B.project_private = [];
B.departments.find(d => d.id === DEPTS.D_MID).name = "6-8";

console.log("\n── School B: import it");
const PB = await adminPage(B);
await fileInput(PB).setInputFiles(csvPath);
await check("review table lists every row before anything is saved", async () => {
  await PB.getByText(/Import from/).waitFor({ timeout: 4000 });
  assert.equal(await PB.locator(".imp-tbl tbody tr").count(), 3);
  assert.equal(B.projects.length, 0, "something was saved before pressing Import");
});
await check("the unknown department 'Middle School' is offered for mapping", () =>
  PB.locator(".imp-map-row", { hasText: "Middle School" }).waitFor({ timeout: 3000 }));
await PB.locator(".imp-map-row", { hasText: "Middle School" }).locator("select").selectOption({ label: "6-8" });
await check("after mapping, rows show department 6-8", async () =>
  assert.equal(await PB.locator(".imp-tbl tbody tr", { hasText: "Volcano" }).locator("td").nth(4).innerText(), "6-8"));

// A failed save must show NOT saved and be retryable.
B.failWrites = ["projects"];
await importBtn(PB).click();
await check("server failure: rows marked NOT saved, nothing half-written", async () => {
  await PB.getByText(/could NOT be saved/).waitFor({ timeout: 6000 });
  assert.equal(B.projects.length, 0); assert.equal(B.project_private.length, 0);
  assert.ok(await PB.locator("tr.imp-err").count() >= 1);
});
B.failWrites = [];
await importBtn(PB).click();
await check("retry imports all 3 projects", async () => {
  await PB.getByText(/^Imported 3 projects\.$/).waitFor({ timeout: 8000 });
  assert.equal(B.projects.length, 3);
});
const byTitle = (t) => B.projects.find(p => p.title === t);
const priv = (p) => B.project_private.find(x => x.project_id === p?.id);
await check("numbers, departments, rooms and text survive the round trip", async () => {
  const v = byTitle("Existing Volcano Study"), q = byTitle('Salt "Water", Ice & Snow'), f = byTitle("=1+1 Rockets");
  assert.ok(v && q && f, "a title was mangled");
  assert.deepEqual([v.num, q.num, f.num], ["001", "002", "003"]);
  assert.equal(v.department_id, DEPTS.D_MID); assert.equal(f.department_id, DEPTS.D_HIGH);
  assert.equal(q.room, "C4"); assert.equal(q.description, "Line one,\nline two"); assert.equal(q.cat, "Chemistry & Material Science");
});
await check("names go to the private table with their grades (accents intact)", async () => {
  const q = priv(byTitle('Salt "Water", Ice & Snow'));
  assert.equal(q.advisor_name, "Mr. Begay");
  assert.deepEqual(q.group_members, [{ name: "José Ñez", grade: "8" }, { name: "Mary Yazzie", grade: "7" }]);
  assert.deepEqual(priv(byTitle("Existing Volcano Study")).group_members.map(m => m.name), ["Ana Ruiz", "Ben Ortiz"]);
  for (const p of B.projects) for (const k of ["advisor_name", "group_members"]) assert.ok(!(k in p) || !p[k], "name on public row");
});
await check("one PROJECTS_IMPORTED log entry, without names", async () => {
  const rows = B.it_logs.filter(r => r.event === "PROJECTS_IMPORTED");
  assert.ok(rows.some(r => r.payload.imported === 3));
  assert.ok(!JSON.stringify(rows).includes("Ñez"));
});

console.log("\n── Re-import the same file");
await PB.getByRole("button", { name: "Close" }).click();
await fileInput(PB).setInputFiles(csvPath);
await check("every row is flagged as already existing and starts unticked", async () => {
  await PB.getByText(/Import from/).waitFor({ timeout: 4000 });
  assert.equal(await PB.getByText("A project with this title already exists").count(), 3);
  assert.equal(await importBtn(PB).isDisabled(), true);
});
await PB.getByRole("button", { name: "Close" }).click();

console.log("\n── Excel variants");
const semi = "Project #;Title;Department;Category;Grade;Students (grade)\r\n010;Cañón Erosion;High School;Earth & Environmental Science;10;Zoë Ruíz (Gr 10)\r\n";
await fileInput(PB).setInputFiles({ name: "excel.csv", mimeType: "text/csv", buffer: Buffer.from(semi, "latin1") });
await check("';'-separated Windows-1252 file (Excel's plain CSV) reads accents correctly", async () => {
  await PB.getByText("Cañón Erosion").waitFor({ timeout: 4000 });
  await PB.getByText("Zoë Ruíz (Gr 10)").waitFor();
});
await importBtn(PB).click();
await check("…and imports with number 010", async () => {
  await PB.getByText(/^Imported 1 project\.$/).waitFor({ timeout: 6000 });
  assert.equal(byTitle("Cañón Erosion")?.num, "010");
});
await PB.getByRole("button", { name: "Close" }).click();
await fileInput(PB).setInputFiles({ name: "projects.xlsx", mimeType: "application/vnd.ms-excel", buffer: Buffer.from("PK") });
await check(".xlsx is refused with Save-As-CSV instructions", () => PB.getByText(/CSV UTF-8/).waitFor({ timeout: 3000 }));
await fileInput(PB).setInputFiles({ name: "x.csv", mimeType: "text/csv", buffer: Buffer.from("Name,Score\nA,1\n") });
await check("a CSV without a Title column is refused", () => PB.getByText(/No "Title" column found/).waitFor({ timeout: 3000 }));

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
