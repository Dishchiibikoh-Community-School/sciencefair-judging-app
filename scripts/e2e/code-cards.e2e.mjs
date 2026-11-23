// Browser E2E — booth code cards (Projects tab, 2026-11-19).
//   • One card per project, printed from the LIVE list: code, title, category · grade, students, adviser.
//   • Two per page with a cut line; every value HTML-escaped; names can be left off.
//   • Nothing is recorded until the admin says the cards printed; "Not printed" records nothing;
//     a blocked pop-up records nothing.
//   • The record (app_settings, anon-readable) holds codes / titles / timestamps — NEVER names.
//   • After printing, a change to a project (category → its CODE changes, title, students) is listed
//     as out of date with what changed, a banner shows at the top of the tab, "Only changed & new"
//     prints exactly those cards, and confirming clears the warning.
//   • A removed project's printed card is listed for throwing away.
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
const now = new Date(Date.now() - 3600e3).toISOString();
store.projects = [
  { id: "pa", school_id: SID, num: "001", title: "Magic Milk Experiment", cat: "Chemistry & Material Science", grade: "2", locked: false, department_id: DEPTS.D_ELEM, room: "", description: "", motivation: "", created_at: now },
  { id: "pb", school_id: SID, num: "002", title: "Bean <b>Sprouts</b> & \"Light\"", cat: "Life Science", grade: "4", locked: false, department_id: DEPTS.D_ELEM, room: "12", description: "", motivation: "", created_at: now },
  { id: "pc", school_id: SID, num: "003", title: "Galaxy Shapes", cat: "Physics, Math & Astronomy", grade: "8", locked: false, department_id: DEPTS.D_MID, room: "", description: "", motivation: "", created_at: now },
];
store.project_private = [
  { project_id: "pa", school_id: SID, advisor_name: "Ms. Teacher One", group_members: [{ name: "Ana Uno", grade: "2" }, { name: "Ben Dos", grade: "2" }], updated_at: now },
  { project_id: "pb", school_id: SID, advisor_name: "Mr. Two", group_members: [{ name: "Cara Tres", grade: "4" }], updated_at: now },
  { project_id: "pc", school_id: SID, advisor_name: "Mx. Three", group_members: [{ name: "Dev Cuatro", grade: "8" }], updated_at: now },
];
const record = () => {
  const r = store.app_settings.find(x => x.school_id === SID && x.key === "code_cards_printed");
  return r ? JSON.parse(r.value) : null;
};

const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
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
await page.locator(".nav-it", { hasText: "Projects" }).first().click();
const sec = page.locator("[data-testid=code-cards]");
await sec.waitFor();
const printBtn = page.locator("[data-testid=cc-print]");
// The session is restored a moment after the landing page renders (CLAUDE.md Known gaps).
const reloadAdmin = async () => {
  await page.reload();
  try { await page.locator(".adm-side").waitFor({ timeout: 2500 }); }
  catch { await page.locator(".role-card.adm").click(); await page.locator(".adm-side").waitFor({ timeout: 8000 }); }
  await page.locator(".nav-it", { hasText: "Projects" }).first().click();
  await sec.waitFor();
};
const openCards = async () => {
  const [popup] = await Promise.all([ctx.waitForEvent("page"), printBtn.click()]);
  await popup.waitForLoadState();
  const html = await popup.content();
  const codes = await popup.locator(".card .code").allInnerTexts();
  const pages = await popup.locator(".page").count();
  const cuts = await popup.locator(".cut").count();
  const text = await popup.locator("body").innerText();
  await popup.close();
  return { html, codes, pages, cuts, text };
};

console.log("\n── First print: every card, from the live list");
await check("never printed: no banner, status says so, button offers 3 cards", async () => {
  assert.equal(await page.locator("[data-testid=cc-banner]").count(), 0);
  assert.match(await page.locator("[data-testid=cc-status]").innerText(), /No cards printed yet/);
  assert.match(await printBtn.innerText(), /Print 3 cards/);
});
let first;
await check("the card page has 3 cards in department + number order, 2 pages, 1 cut line", async () => {
  first = await openCards();
  assert.deepEqual(first.codes, ["Elem-CMS-001", "Elem-LS-002", "JHS-PMA-003"]);
  assert.equal(first.pages, 2); assert.equal(first.cuts, 1);
});
await check("a card carries title, category • grade, students, adviser and booth", async () => {
  assert.match(first.text, /Magic Milk Experiment/);
  assert.match(first.text, /Chemistry & Material Science • Grade 2/);
  assert.match(first.text, /Ana Uno • Ben Dos/);
  assert.match(first.text, /Adviser · Ms\. Teacher One/);
  assert.match(first.text, /BOOTH\s*12/);
  assert.match(first.text, /PROJECT CODE/);
});
await check("every value is escaped (a <b> in a title is text, not markup)", async () => {
  assert.ok(first.html.includes("Bean &lt;b&gt;Sprouts&lt;/b&gt;"), "title not escaped");
  assert.ok(!first.html.includes("<b>Sprouts</b>"));
});
await check("opening the print page records NOTHING until the admin confirms", async () => {
  assert.equal(record(), null);
  await page.locator("[data-testid=cc-confirm]").waitFor();
  assert.match(await page.locator("[data-testid=cc-confirm]").innerText(), /Did the 3 cards print\?/);
});
await check("'Not printed' records nothing", async () => {
  await page.locator("[data-testid=cc-no]").click();
  assert.equal(await page.locator("[data-testid=cc-confirm]").count(), 0);
  assert.equal(record(), null);
  assert.match(await page.locator("[data-testid=cc-status]").innerText(), /No cards printed yet/);
});
await check("a blocked pop-up shows a message and records nothing", async () => {
  await page.evaluate(() => { window.__open = window.open; window.open = () => null; });
  await printBtn.click();
  assert.match(await page.locator("[data-testid=cc-msg]").innerText(), /blocked/);
  assert.equal(await page.locator("[data-testid=cc-confirm]").count(), 0);
  assert.equal(record(), null);
  await page.evaluate(() => { window.open = window.__open; });
});
await check("print + 'Yes, they printed' records 3 cards — and the record holds NO names", async () => {
  await openCards();
  await page.locator("[data-testid=cc-yes]").click();
  await page.locator("[data-testid=cc-confirm]").waitFor({ state: "detached" });
  const r = record();
  assert.ok(r && r.at, "no record");
  assert.deepEqual(Object.keys(r.cards).sort(), ["pa", "pb", "pc"]);
  assert.equal(r.cards.pa.code, "Elem-CMS-001");
  const raw = JSON.stringify(r);
  for (const n of ["Ana Uno", "Ben Dos", "Cara Tres", "Dev Cuatro", "Teacher One", "Mr. Two", "Mx. Three"])
    assert.ok(!raw.includes(n), `record contains a name: ${n}`);
});
await check("after printing: up to date, 'Only changed & new' offers 0 cards", async () => {
  assert.match(await page.locator("[data-testid=cc-status]").innerText(), /still matches/);
  await page.locator("[data-testid=cc-which]").selectOption("changed");
  assert.match(await printBtn.innerText(), /Print 0 cards/);
  assert.ok(await printBtn.isDisabled());
  assert.equal(await page.locator("[data-testid=cc-banner]").count(), 0);
});
await check("IT log CODE_CARDS_PRINTED with counts only", async () => {
  for (let i = 0; i < 30 && !store.it_logs.some(l => l.event === "CODE_CARDS_PRINTED"); i++) await page.waitForTimeout(100);
  const e = store.it_logs.find(l => l.event === "CODE_CARDS_PRINTED");
  assert.ok(e, "no IT log");
  assert.equal(e.payload.cards, 3);
  assert.ok(!JSON.stringify(e.payload).includes("Ana Uno"));
});

console.log("\n── A project changes after printing");
// Edit #001: category Chemistry → Engineering (code changes) and title.
const cardOf = (title) => page.locator(".proj-mgmt-card", { hasText: title });
await cardOf("Magic Milk Experiment").getByRole("button", { name: /Edit/ }).click();
await page.locator(".proj-form").waitFor();
await page.locator(".proj-form input").first().fill("Magic Milk Colours");
await page.locator(".proj-form select", { has: page.locator("option", { hasText: "Engineering, Robotics & Technology" }) }).first()
  .selectOption("Engineering, Robotics & Technology");
await page.getByRole("button", { name: "Save Changes" }).click();
await page.locator(".proj-form").waitFor({ state: "detached" });

await check("the banner at the top of the tab says 1 printed card no longer matches", async () => {
  const b = page.locator("[data-testid=cc-banner]");
  await b.waitFor();
  assert.match(await b.innerText(), /1 printed code card no longer matches/);
});
await check("the list names the card, old → new code, and what changed", async () => {
  const t = await page.locator("[data-testid=cc-stale]").innerText();
  assert.match(t, /Elem-ERT-001/);
  assert.match(t, /code Elem-CMS-001 → Elem-ERT-001/);
  assert.match(t, /title changed/);
  assert.match(t, /category → Engineering, Robotics & Technology/);
  assert.ok(!/students or adviser/.test(t), "a title/category edit was reported as a names change");
  assert.ok(!/Elem-LS-002|JHS-PMA-003/.test(t), "an unchanged card is listed");
});
await check("'Only changed & new' prints exactly that one card, with the NEW code and title", async () => {
  assert.match(await printBtn.innerText(), /Print 1 card\b/);
  const r = await openCards();
  assert.deepEqual(r.codes, ["Elem-ERT-001"]);
  assert.match(r.text, /Magic Milk Colours/);
  await page.locator("[data-testid=cc-yes]").click();
  await page.locator("[data-testid=cc-confirm]").waitFor({ state: "detached" });
});
await check("confirming clears the warning and keeps the other two cards on record", async () => {
  assert.equal(await page.locator("[data-testid=cc-banner]").count(), 0);
  assert.equal(await page.locator("[data-testid=cc-stale]").count(), 0);
  const r = record();
  assert.equal(r.cards.pa.code, "Elem-ERT-001");
  assert.equal(r.cards.pb.code, "Elem-LS-002");
});

console.log("\n── Students change; a department code changes; a project is removed");
await cardOf("Galaxy Shapes").getByRole("button", { name: /Edit/ }).click();
await page.locator(".proj-form").waitFor();
await page.waitForTimeout(1100);   // the names' saved-at timestamp must move
await page.locator(".proj-form input[value='Dev Cuatro']").fill("Dev Cinco");
await page.getByRole("button", { name: "Save Changes" }).click();
await page.locator(".proj-form").waitFor({ state: "detached" });
await check("a student-name change flags that card ('students or adviser edited')", async () => {
  const t = await page.locator("[data-testid=cc-stale]").innerText();
  assert.match(t, /JHS-PMA-003 — students or adviser edited/);
});
await check("a card printed WITHOUT names is not flagged by a names change", async () => {
  // Reprint #003 without names, then edit its students again.
  await page.locator("[data-testid=cc-names]").uncheck();
  const r = await openCards();
  assert.deepEqual(r.codes, ["JHS-PMA-003"]);
  assert.ok(!/Dev Cinco|Adviser/.test(r.text), "names printed although unticked");
  await page.locator("[data-testid=cc-yes]").click();
  await page.locator("[data-testid=cc-confirm]").waitFor({ state: "detached" });
  await cardOf("Galaxy Shapes").getByRole("button", { name: /Edit/ }).click();
  await page.locator(".proj-form").waitFor();
  await page.waitForTimeout(1100);
  await page.locator(".proj-form input[value='Dev Cinco']").fill("Dev Seis");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await page.locator(".proj-form").waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-testid=cc-stale]").count(), 0);
  await page.locator("[data-testid=cc-names]").check();
});
await check("a removed project's card is listed to throw away; Done clears it", async () => {
  // Another admin removes #002 (straight in the store), then this screen reloads.
  store.projects = store.projects.filter(p => p.id !== "pb");
  store.project_private = store.project_private.filter(p => p.project_id !== "pb");
  await reloadAdmin();
  const g = page.locator("[data-testid=cc-gone]");
  await g.waitFor();
  assert.match(await g.innerText(), /Elem-LS-002/);
  assert.match(await page.locator("[data-testid=cc-banner]").innerText(), /1 card for a removed project/);
  await g.getByRole("button", { name: /Done/ }).click();
  await g.waitFor({ state: "detached" });
  assert.ok(!("pb" in record().cards));
});
await check("renaming a department code in the database flags every card of that department", async () => {
  store.departments.find(d => d.id === DEPTS.D_ELEM).code = "K5";
  await reloadAdmin();
  const t = await page.locator("[data-testid=cc-stale]").innerText();
  assert.match(t, /code Elem-ERT-001 → K5-ERT-001/);
  assert.ok(!/JHS-PMA-003/.test(t));
});
await check("a failed record keeps the confirm box and says NOT recorded", async () => {
  store.failWrites = ["app_settings"];
  await page.locator("[data-testid=cc-which]").selectOption("changed");
  await openCards();
  await page.locator("[data-testid=cc-yes]").click();
  assert.match(await page.locator("[data-testid=cc-msg]").innerText(), /NOT recorded/);
  assert.equal(await page.locator("[data-testid=cc-confirm]").count(), 1);
  assert.equal(record().cards.pa.code, "Elem-ERT-001");
  for (let i = 0; i < 30 && !store.it_logs.some(l => l.event === "CODE_CARDS_RECORD_FAILED"); i++) await page.waitForTimeout(100);
  assert.ok(store.it_logs.some(l => l.event === "CODE_CARDS_RECORD_FAILED"), "no CODE_CARDS_RECORD_FAILED");
  store.failWrites = [];
});

await check("no console errors", async () => {
  const real = errs.filter(e => !/simulated|Failed to load resource|net::ERR|favicon/.test(e));
  assert.deepEqual(real, []);
});
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILED:", failures); process.exit(1); }
