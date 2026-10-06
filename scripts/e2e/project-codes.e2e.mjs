// Browser E2E — project codes ("PK-LS-001"), real UI + mock backend.
// Default {DEPT}-{CAT}-{NUM} built from the department and category codes; judges see it on
// their list and the scoring form; the admin can set their own format (validated, previewed
// live, saved to app_settings), duplicates are flagged, exports carry a Code column, and
// Reset restores the default.
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
// PreK / Life Science, project 001 → PK-LS-001 (the example from the organiser).
Object.assign(store.departments.find(d => d.id === DEPTS.D_ELEM), { name: "PreK", code: "PK" });
const now = new Date().toISOString();
store.projects.push({ id: "p_pk", school_id: SID, num: "002", title: "Growing Beans", cat: "Life Science", grade: "K",
  locked: false, department_id: DEPTS.D_ELEM, room: "", description: "", motivation: "", created_at: now });

async function newPage(vp = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  return { ctx, page };
}

console.log("\n── Judges see project codes");
const J = await newPage({ width: 820, height: 1180 });
await J.page.goto(`${BASE}/s/test`);
await J.page.locator(".role-card").first().click();
await J.page.getByRole("button", { name: /PreK/ }).click();
await J.page.locator('input[placeholder="e.g. Judge1"]').fill("Judge1");
await J.page.locator('input[placeholder="Event invite code"]').fill("ABC123");
await J.page.getByRole("button", { name: /Enter as Judge/ }).click();
await check("the judge's list shows PK-LS-002 (PreK · Life Science · 002)", async () =>
  assert.equal((await J.page.locator(".proj-num").first().innerText()).trim(), "PK-LS-002"));
await J.page.getByText("Growing Beans").click();
await check("the scoring form header says PROJECT PK-LS-002", () => J.page.getByText("PROJECT PK-LS-002").waitFor({ timeout: 4000 }));

console.log("\n── Admin: Setup → Project codes");
const A = await newPage();
await A.page.goto(`${BASE}/s/test`);
await A.page.locator(".role-card.adm").click();
await A.page.locator("input[type=email]").fill("admin@test.edu");
await A.page.locator("input[type=password]").fill("correct-horse");
await A.page.keyboard.press("Enter");
await A.page.locator(".adm-side").waitFor({ timeout: 6000 });
await A.page.locator(".nav-it", { hasText: "Setup" }).click();
const fmtBox = A.page.getByLabel("Project code format");
await check("default format is {DEPT}-{CAT}-{NUM} with live examples", async () => {
  assert.equal(await fmtBox.inputValue(), "{DEPT}-{CAT}-{NUM}");
  const ex = await A.page.locator(".code-ex").allInnerTexts();
  assert.ok(ex.includes("JHS-EES-001") && ex.includes("PK-LS-002"), ex.join(" | "));
});
await fmtBox.fill("{DEPT}-{CAT}");
await check("a format without {NUM} is refused and cannot be saved", async () => {
  await A.page.getByText(/must include \{NUM\}/).waitFor({ timeout: 3000 });
  assert.equal(await A.page.getByRole("button", { name: "Save format" }).isDisabled(), true);
});
await fmtBox.fill("SF26/");
await A.page.locator(".code-token", { hasText: "{DEPT}" }).click();
await fmtBox.fill((await fmtBox.inputValue()) + "/");
await A.page.locator(".code-token", { hasText: "{NUM}" }).click();
await check("token buttons build the format and the preview follows it (SF26/PK/002)", async () => {
  assert.equal(await fmtBox.inputValue(), "SF26/{DEPT}/{NUM}");
  assert.ok((await A.page.locator(".code-ex").allInnerTexts()).includes("SF26/PK/002"));
});
await A.page.getByRole("button", { name: "Save format" }).click();
await check("the custom format is saved for the school", async () => {
  await A.page.waitForTimeout(500);
  assert.equal(store.app_settings.find(r => r.key === "project_code_format")?.value, "SF26/{DEPT}/{NUM}");
});
await J.page.reload();
await check("judges see the new format after it is saved", async () =>
  assert.equal((await J.page.locator(".proj-num").first().innerText()).trim(), "SF26/PK/002"));

console.log("\n── Duplicates and exports");
store.projects.push({ id: "p_dup", school_id: SID, num: "002", title: "Other Beans", cat: "Life Science", grade: "1",
  locked: false, department_id: DEPTS.D_ELEM, room: "", description: "", motivation: "", created_at: now });
await A.page.reload();
await A.page.locator(".role-card.adm").click();
await A.page.locator(".adm-side, input[type=email]").first().waitFor({ timeout: 6000 });
if (await A.page.locator("input[type=email]").count()) {
  await A.page.locator("input[type=email]").fill("admin@test.edu");
  await A.page.locator("input[type=password]").fill("correct-horse");
  await A.page.keyboard.press("Enter");
}
await A.page.locator(".adm-side").waitFor({ timeout: 6000 });
await A.page.locator(".nav-it", { hasText: "Setup" }).click();
await check("two projects with the same code are flagged", () =>
  A.page.getByText(/Some projects share a code \(SF26\/PK\/002\)/).waitFor({ timeout: 4000 }));
await A.page.locator(".nav-it", { hasText: "Projects" }).first().click();
const [dl] = await Promise.all([A.page.waitForEvent("download"), A.page.getByRole("button", { name: /Download Projects CSV/ }).click()]);
const csv = readFileSync(await dl.path(), "utf8");
await check("the projects CSV starts with a Code column", async () => {
  assert.match(csv.split("\n")[0], /^﻿?"Code","Project #"/);
  assert.match(csv, /"SF26\/JHS\/001","001","Existing Volcano Study"/);
});
await A.page.locator(".nav-it", { hasText: "Setup" }).click();
await A.page.getByRole("button", { name: /Reset to \{DEPT\}-\{CAT\}-\{NUM\}/ }).click();
await check("Reset restores the default format", async () => {
  await A.page.waitForTimeout(500);
  assert.equal(store.app_settings.find(r => r.key === "project_code_format")?.value, "{DEPT}-{CAT}-{NUM}");
  assert.ok((await A.page.locator(".code-ex").allInnerTexts()).includes("JHS-EES-001"));
});

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
