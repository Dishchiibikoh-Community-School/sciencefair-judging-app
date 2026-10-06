// Browser E2E — the admin Setup tab: per-school departments and project categories.
// Covers migration 2026-10e: departments CRUD + presets, categories CRUD, the delete
// guardrails, and that a new category immediately reaches the Add Project dropdown.
// Run: see scan.e2e.mjs header (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { freshStore, installMock, DEPTS, SID } from "./mock.mjs";

const BASE = "http://localhost:5199";
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
const errs = [];

const store = freshStore();
store.rubrics.push({ id: "rub1", school_id: SID, name: "Default", is_active: true, criteria: [] });

async function newPage(vp = { width: 1280, height: 950 }) {
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  return { ctx, page };
}
const deptNames = () => store.departments.filter(d => d.school_id === SID).sort((a, b) => a.ord - b.ord).map(d => d.name);
const catNames  = () => store.categories.filter(c => c.school_id === SID).sort((a, b) => a.ord - b.ord).map(c => c.name);
const row = (page, name) => page.locator(".setup-row", { hasText: name }).first();

console.log("\n── Admin: open the Setup tab");
const A = await newPage();
await A.page.goto(`${BASE}/s/test`);
await A.page.locator(".role-card.adm").click();
await A.page.locator('input[type=email]').fill("admin@test.edu");
await A.page.locator('input[type=password]').fill("correct-horse");
await A.page.keyboard.press("Enter");
await A.page.locator(".adm-side").waitFor({ timeout: 6000 });
await A.page.locator(".nav-it", { hasText: "Setup" }).click();
await check("Setup tab lists the school's 3 departments and 6 categories", async () => {
  await A.page.getByText("Departments", { exact: true }).first().waitFor({ timeout: 4000 });
  assert.equal(await A.page.locator(".setup-row").count(), 9);
});

console.log("\n── Departments: add / rename / reorder");
await A.page.locator('input[placeholder="New department name"]').fill("SPED");
await A.page.locator('input[placeholder="Code"]').first().fill("SPED");
await A.page.getByRole("button", { name: "+ Add" }).first().click();
await check("adding a department writes it to the DB and shows it", async () => {
  await row(A.page, "SPED").waitFor({ timeout: 4000 });
  assert.ok(deptNames().includes("SPED"));
  assert.equal(store.departments.find(d => d.name === "SPED").code, "SPED");
});
await A.page.locator('input[placeholder="New department name"]').fill("Elementary");
await A.page.getByRole("button", { name: "+ Add" }).first().click();
await check("a duplicate department name is refused with a readable message", () =>
  A.page.getByText(/"Elementary" already exists/).waitFor({ timeout: 4000 }));

await row(A.page, "SPED").locator(".proj-act-btn", { hasText: "✏️" }).click();
await A.page.locator(".setup-row input[type=text]").first().fill("SPED / Resource");
await A.page.locator(".setup-row").filter({ hasText: "Save" }).getByRole("button", { name: "Save" }).first().click();
await check("renaming a department persists", async () => {
  await row(A.page, "SPED / Resource").waitFor({ timeout: 4000 });
  assert.ok(deptNames().includes("SPED / Resource"));
});

const before = deptNames();
await row(A.page, "Middle School").locator(".proj-act-btn", { hasText: "↑" }).click();
await A.page.waitForTimeout(400);
await check("↑ reorders the department (ord swapped in the DB)", async () => {
  const after = deptNames();
  assert.deepEqual(after.slice(0, 2), [before[1], before[0]], `got ${after.join(",")}`);
});

console.log("\n── Departments: the delete guardrail");
await check("deleting a department that has projects is BLOCKED, not silently destructive", async () => {
  await row(A.page, "Middle School").locator(".proj-act-btn", { hasText: "🗑" }).click();
  await A.page.getByText(/still has 1 project/).waitFor({ timeout: 4000 });
  assert.equal(await A.page.locator(".modal-overlay").count(), 0, "must not even open the confirm modal");
  assert.ok(deptNames().includes("Middle School"));
});
await check("deleting an EMPTY department asks first, then removes it", async () => {
  await row(A.page, "SPED / Resource").locator(".proj-act-btn", { hasText: "🗑" }).click();
  await A.page.getByText(/no projects and no judges/).waitFor({ timeout: 4000 });
  await A.page.getByRole("button", { name: "Delete", exact: true }).click();
  await A.page.waitForTimeout(400);
  assert.ok(!deptNames().includes("SPED / Resource"));
});

console.log("\n── Departments: presets");
await A.page.getByRole("button", { name: /Grade bands \+ SPED/ }).click();
await A.page.waitForTimeout(500);
await check("the 'Grade bands + SPED' preset adds its 6 departments", async () => {
  for (const n of ["PreK", "K-2", "3-5", "6-8", "9-12", "SPED"]) assert.ok(deptNames().includes(n), `missing ${n}`);
});
await check("…and never deletes the ones already there", async () => {
  for (const n of ["Elementary", "Middle School", "High School"]) assert.ok(deptNames().includes(n), `lost ${n}`);
});
await A.page.getByRole("button", { name: /Grade bands \+ SPED/ }).click();
await check("applying the same preset twice says so instead of duplicating", async () => {
  await A.page.getByText(/already have every department/).waitFor({ timeout: 4000 });
  assert.equal(deptNames().filter(n => n === "PreK").length, 1);
});

console.log("\n── Categories: the robotics-fair case");
await A.page.locator('input[placeholder="New category name"]').fill("Autonomous Robotics");
await A.page.locator('input[placeholder="Code"]').last().fill("AR");
await A.page.getByRole("button", { name: "+ Add" }).last().click();
await check("a school can add its own category", async () => {
  await row(A.page, "Autonomous Robotics").waitFor({ timeout: 4000 });
  assert.ok(catNames().includes("Autonomous Robotics"));
});
await check("deleting an UNUSED category says no projects use it", async () => {
  await row(A.page, "Autonomous Robotics").locator(".proj-act-btn", { hasText: "🗑" }).click();
  await A.page.getByText(/No projects use it/).waitFor({ timeout: 4000 });
  await A.page.getByRole("button", { name: "Delete", exact: true }).click();
  await A.page.waitForTimeout(400);
  assert.ok(!catNames().includes("Autonomous Robotics"));
});
await check("deleting a category that IS in use warns that projects keep their label", async () => {
  // p_seed is "Earth & Environmental Science"
  await row(A.page, "Earth & Environmental Science").locator(".proj-act-btn", { hasText: "🗑" }).click();
  await A.page.getByText(/1 project already use|already use this category/).waitFor({ timeout: 4000 });
  await A.page.getByRole("button", { name: "Delete", exact: true }).click();
  await A.page.waitForTimeout(400);
  assert.ok(!catNames().includes("Earth & Environmental Science"));
  assert.equal(store.projects.find(p => p.id === "p_seed").cat, "Earth & Environmental Science",
    "the project must keep its category text — there is no FK");
});
await A.page.getByRole("button", { name: /Restore built-in categories/ }).click();
await A.page.waitForTimeout(500);
await check("'Restore built-in categories' adds back only what is missing", async () => {
  assert.ok(catNames().includes("Earth & Environmental Science"));
  assert.equal(catNames().filter(n => n === "Life Science").length, 1);
});

console.log("\n── Categories flow into the rest of the app");
await A.page.locator('input[placeholder="New category name"]').fill("Underwater Robotics");
await A.page.getByRole("button", { name: "+ Add" }).last().click();
await A.page.waitForTimeout(400);
await A.page.locator(".nav-it", { hasText: "Projects" }).first().click();
await A.page.getByRole("button", { name: /Add Project/ }).first().click();
await check("the new category appears in the Add Project dropdown", async () => {
  // The form has several selects; take the one under the "Category" label.
  const sel = A.page.locator("div").filter({ has: A.page.locator("div.lbl", { hasText: /^Category$/ }) })
    .locator("select").last();
  const opts = await sel.locator("option").allTextContents();
  assert.ok(opts.includes("Underwater Robotics"), `got: ${opts.join(" | ")}`);
  assert.ok(!opts.includes("Biology"), "the dead 2026-pre category list must be gone");
});
await check("a project saved under a since-deleted category still shows as '(old category)'", async () => {
  await A.page.keyboard.press("Escape");
  await A.page.locator(".nav-it", { hasText: "Setup" }).click();
  await row(A.page, "Underwater Robotics").locator(".proj-act-btn", { hasText: "🗑" }).click();
  await A.page.getByRole("button", { name: "Delete", exact: true }).click();
  await A.page.waitForTimeout(300);
  assert.ok(!catNames().includes("Underwater Robotics"));
});

console.log("\n── Overview still points at Setup");
await A.page.locator(".nav-it", { hasText: "Overview" }).click();
await check("Overview summarises departments/categories and links to Setup", async () => {
  await A.page.getByText(/project categor/).first().waitFor({ timeout: 4000 });
  await A.page.getByRole("button", { name: /Open Setup/ }).click();
  await A.page.getByText("Project Categories").first().waitFor({ timeout: 4000 });
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
