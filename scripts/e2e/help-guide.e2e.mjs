// Browser E2E — the illustrated guides (2026-11).
//   • Judges: "❓ How to judge" on the sign-in screen and the project list (never the scoring
//     screen) opens JUDGE_GUIDE — 9 pictured steps + quick answers — over the view, which stays
//     mounted (a typed judge number survives).
//   • Admin Help tab: the admin step-by-step guide, the judge guide (+ printable page for the
//     briefing, no student names), and the Q&A with a search box.
//   • Every picture a guide names exists in public/help/ and is served as WebP.
//   • Small truth fixes found while making the pictures: the sign-in text says "judge number", the
//     scoring card says "Booth", the deliberation card no longer claims it opens by itself, the PIN
//     boxes keep digits only (/\D/, not /D/), and every PIN prompt says "Admin PIN".
// Run: see scan.e2e.mjs header (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { freshStore, installMock, DEPTS, SID } from "./mock.mjs";

const BASE = "http://localhost:5199";
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
const errs = [];

const SRC = readFileSync(new URL("../../src/ScienceFairJudging.jsx", import.meta.url), "utf8");
const guideImgs = (name) => {
  const start = SRC.indexOf(`const ${name} = [`);
  const body = SRC.slice(start, SRC.indexOf("\n];", start));
  return [...body.matchAll(/img: "([a-z0-9-]+)"/g)].map(m => m[1]);
};
const JUDGE_IMGS = guideImgs("JUDGE_GUIDE"), ADMIN_IMGS = guideImgs("ADMIN_GUIDE");

const store = freshStore();
store.rubrics.push({ id: "rub1", school_id: SID, name: "Default", is_active: true, criteria: [] });
// School-wide judge numbers (the default): Judge 2 judges Middle School.
store.judge_roster = [{ school_id: SID, judge_number: 2, department_id: DEPTS.D_MID }];

async function newPage(vp = { width: 820, height: 1180 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await installMock(page, store, []);
  await page.addInitScript(() => { window.__printed = []; window.open = () => ({ document: { write: (h) => window.__printed.push(h), close() {} } }); });
  return { ctx, page };
}
// Every <img> in `scope` scrolled into view and decoded (they are loading="lazy").
async function allImagesLoad(page, scope) {
  const imgs = page.locator(`${scope} img.guide-img`);
  const n = await imgs.count();
  for (let i = 0; i < n; i++) {
    await imgs.nth(i).scrollIntoViewIfNeeded();
    await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, await imgs.nth(i).elementHandle(), { timeout: 8000 });
  }
  return n;
}

console.log("\n── Pictures exist");
await check(`every guide picture is in public/help (${JUDGE_IMGS.length} judge + ${ADMIN_IMGS.length} admin)`, async () => {
  assert.equal(JUDGE_IMGS.length, 9); assert.equal(ADMIN_IMGS.length, 11);
  for (const n of [...JUDGE_IMGS, ...ADMIN_IMGS])
    assert.ok(existsSync(new URL(`../../public/help/${n}.webp`, import.meta.url)), `missing public/help/${n}.webp`);
});
await check("the dev server serves them as WebP", async () => {
  const { ctx, page } = await newPage();
  for (const n of [JUDGE_IMGS[0], ADMIN_IMGS[0]]) {
    const r = await page.request.get(`${BASE}/help/${n}.webp`);
    assert.equal(r.status(), 200); assert.match(r.headers()["content-type"] || "", /webp/);
  }
  await ctx.close();
});
await check("the judge pictures are precached for offline use (vite.config.js)", async () => {
  const cfg = readFileSync(new URL("../../vite.config.js", import.meta.url), "utf8");
  assert.match(cfg, /'help\/judge-\*\.webp'/);
});

console.log("\n── Judge: sign-in screen");
const J = await newPage();
await J.page.goto(`${BASE}/s/test`);
await J.page.locator(".role-card").first().click();
await J.page.locator('input[placeholder="e.g. 7"]').fill("2");
await check("the sign-in text asks for a judge NUMBER (school-wide numbering)", async () => {
  await J.page.getByText("Your coordinator gives you a judge number and the invite code").waitFor({ timeout: 5000 });
  assert.equal(await J.page.getByText("judge name and invite code").count(), 0);
});
await check("❓ How to judge opens the guide: 9 steps, each with a picture that loads", async () => {
  await J.page.getByTestId("judge-help-open").click();
  const g = J.page.getByTestId("judge-guide");
  await g.waitFor();
  assert.equal(await g.locator(".guide-step").count(), 9);
  assert.equal(await allImagesLoad(J.page, '[data-testid="judge-guide"]'), 9);
  assert.match(await g.locator(".guide-step").nth(1).innerText(), /Type your judge number/);
});
await check("the numbered points match the pictures' markers (sign-in step has 4)", async () => {
  assert.equal(await J.page.getByTestId("judge-guide").locator(".guide-step").nth(1).locator(".guide-pts li").count(), 4);
});
await check("its quick answers include the per-tablet invite lockout and Allow Transfer", async () => {
  const t = await J.page.getByTestId("judge-guide").locator(".guide-faq").textContent();   // answers are collapsed
  assert.match(t, /Too many attempts/); assert.match(t, /5 wrong invite codes lock this tablet for 5 minutes/);
  assert.match(t, /Allow Transfer/);
});
await check("Close returns to the sign-in screen with the typed number still there", async () => {
  await J.page.getByTestId("judge-guide").getByRole("button", { name: /✕ Close$/ }).click();
  await J.page.getByTestId("judge-guide").waitFor({ state: "detached" });
  assert.equal(await J.page.locator('input[placeholder="e.g. 7"]').inputValue(), "2");
});

console.log("\n── Judge: project list and scoring screen");
await J.page.locator('input[placeholder="Event invite code"]').fill("ABC123");
await J.page.getByRole("button", { name: /Enter as Judge/ }).click();
await J.page.locator(".proj-item").first().waitFor({ timeout: 10000 });
await check("the project list has ❓ How to judge too, and it opens and closes", async () => {
  await J.page.getByTestId("judge-help-open").click();
  await J.page.getByTestId("judge-guide").waitFor();
  await J.page.getByTestId("judge-guide").getByRole("button", { name: /Close — back to the app/ }).click();
  await J.page.getByTestId("judge-guide").waitFor({ state: "detached" });
  await J.page.locator(".proj-item").first().waitFor();
});
await J.page.locator(".proj-item").first().click();
await J.page.locator(".sc-header").waitFor({ timeout: 8000 });
await check("the scoring screen has no help button (a judge stays on the project)", async () => {
  assert.equal(await J.page.getByTestId("judge-help-open").count(), 0);
});
await check("the scoring card calls the room a Booth, like the list and the schedule", async () => {
  const t = await J.page.locator(".sc-header").innerText();
  assert.match(t, /Booth B12/); assert.doesNotMatch(t, /Room B12/);
});
await J.ctx.close();

console.log("\n── Admin: Help & FAQ tab");
const A = await newPage({ width: 1280, height: 950 });
await A.page.goto(`${BASE}/s/test`);
await A.page.locator(".role-card.adm").click();
await A.page.locator("input[type=email]").fill("admin@test.edu");
await A.page.locator("input[type=password]").fill("correct-horse");
await A.page.keyboard.press("Enter");
await A.page.locator(".adm-side").waitFor({ timeout: 10000 });

await check("Change PIN boxes keep digits only (letters, incl. D, are dropped)", async () => {
  const pin = A.page.locator(".card", { hasText: "🔐 Admin PIN" }).locator('input[type="password"]').first();
  await pin.pressSequentially("12aD3x4");
  assert.equal(await pin.inputValue(), "1234");
});

await A.page.locator(".nav-it", { hasText: "Help & FAQ" }).click();
await check("opens on the admin step-by-step guide: 11 steps in three phases, pictures load", async () => {
  await A.page.locator(".guide-step").first().waitFor();
  assert.equal(await A.page.locator(".guide-step").count(), 11);
  assert.deepEqual(await A.page.locator(".guide-phase").allInnerTexts(), ["BEFORE THE EVENT", "JUDGING DAY", "AFTER JUDGING"].map(s => s.toUpperCase()));
  assert.equal(await allImagesLoad(A.page, ".adm-main"), 11);
});
await check("🖨 Print this guide → a printable page with all 11 steps", async () => {
  await A.page.getByRole("button", { name: /Print this guide/ }).click();
  const html = (await A.page.evaluate(() => window.__printed)).at(-1);
  assert.equal((html.match(/<section class="st">/g) || []).length, 11);
});
await check("the Judge guide tab shows what judges see (9 steps + quick answers)", async () => {
  await A.page.getByRole("tab", { name: /Judge guide/ }).click();
  assert.equal(await A.page.locator(".guide-step").count(), 9);
  assert.ok(await A.page.locator(".guide-faq details").count() >= 10);
});
await check("🖨 Print the judge guide → absolute picture URLs, the school link, no student names", async () => {
  await A.page.getByRole("button", { name: /Print the judge guide/ }).click();
  const html = (await A.page.evaluate(() => window.__printed)).at(-1);
  assert.equal((html.match(/<section class="st">/g) || []).length, 9);
  assert.ok(html.includes(`${BASE}/help/judge-2-signin.webp`), "image URL");
  assert.ok(html.includes("/s/test"), "school link");
  assert.match(html, /If something goes wrong/);
  for (const name of ["Ana Ruiz", "Ben Ortiz", "Ms. Lee"]) assert.ok(!html.includes(name), name);
});
await check("Q&A: search narrows the answers and opens them", async () => {
  await A.page.getByRole("tab", { name: /Questions & answers/ }).click();
  const all = await A.page.locator(".help-card").count();
  assert.ok(all >= 15, `sections: ${all}`);
  await A.page.getByLabel("Search the help").fill("invite code");
  const count = Number((await A.page.getByTestId("help-count").innerText()).match(/\d+/)[0]);
  assert.ok(count > 0 && count < 30, `count ${count}`);
  const opened = A.page.locator(".help-faq[open]");
  assert.ok(await opened.count() > 0);
  for (const t of await A.page.locator(".help-card").allInnerTexts()) assert.match(t.toLowerCase(), /invite/);
});
await check("Q&A: a search with no match says so; Clear brings everything back", async () => {
  await A.page.getByLabel("Search the help").fill("zzqxj");
  await A.page.getByTestId("help-none").waitFor();
  assert.equal(await A.page.locator(".help-card").count(), 0);
  await A.page.getByRole("button", { name: "Clear" }).click();
  assert.ok(await A.page.locator(".help-card").count() >= 15);
});
await check("Q&A: words match from their start (\"ompl\" finds nothing; \"(\" does not break it)", async () => {
  await A.page.getByLabel("Search the help").fill("ompl");          // inside "complete", never at a word start
  await A.page.getByTestId("help-none").waitFor();
  await A.page.getByLabel("Search the help").fill("(");
  await A.page.getByTestId("help-count").waitFor();
  await A.page.getByLabel("Search the help").fill("tie");
  assert.ok(await A.page.locator(".help-card").count() > 0);
  await A.page.getByRole("button", { name: "Clear" }).click();
});
await check("Q&A: the invite-code answer states the per-tablet rule, not 'the whole school'", async () => {
  await A.page.getByLabel("Search the help").fill("Invalid invite code");
  const t = await A.page.locator(".help-card").first().innerText();
  assert.match(t, /lock that tablet/i); assert.doesNotMatch(t, /FOR THE WHOLE SCHOOL/);
  await A.page.getByRole("button", { name: "Clear" }).click();
});

await A.page.locator(".nav-it", { hasText: "Validation" }).click();
await check("the deliberation card no longer claims it opens by itself on a tie", async () => {
  await A.page.getByText("Open it from the tie alert above, or any time with Open Manually").waitFor({ timeout: 5000 });
  assert.equal(await A.page.getByText("Triggered automatically").count(), 0);
});
await A.page.locator(".nav-it", { hasText: "IT Logs" }).click();
await check("the IT Logs gate asks for the Admin PIN (one name for one PIN)", async () => {
  await A.page.getByText("Enter the Admin PIN to continue").waitFor({ timeout: 5000 });
  assert.equal(await A.page.getByText("IT PIN").count(), 0);
});
await A.ctx.close();

await browser.close();
if (errs.length) { console.log("\nPage errors:"); errs.forEach(e => console.log("  ", e)); }
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length || errs.length) process.exit(1);
