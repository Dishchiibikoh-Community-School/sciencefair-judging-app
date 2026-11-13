// TEST 5 - DEVICE EMULATION, against the REAL PRODUCTION BUILD (port 5200).
//
//   node tests/stress/previewserver.mjs      (in one terminal)
//   node tests/stress/reset.mjs && node tests/stress/test5-devices.mjs
//
// Measures per device: cold load time to a usable screen, input lag on the scoring form, and
// layout faults (horizontal scroll, tap targets under 44 px, overlapping controls).
//
// Deliberately NOT run against the dev server: that ships hundreds of unbundled modules, so
// load times there say nothing about what a judge's phone will experience. This uses the same
// bundle Vercel deploys.
import { writeFileSync } from "node:fs";
import { banner } from "./env.mjs";
import { launch, newJudgePage, DEVICES, SCHOOL, INVITE } from "./browserlib.mjs";

const BASE = "http://localhost:5200";
const c = banner("TEST 5 - DEVICE EMULATION (production build)");
const report = { test: "5-devices", ref: c.ref, base: BASE, startedAt: new Date().toISOString(), devices: [] };
let fails = 0;
const check = (name, ok, detail = "") => {
  console.log(`    ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
  if (!ok) fails++;
  return { name, verdict: ok ? "PASS" : "FAIL", detail: String(detail) };
};

const SLOW_3G = { offline: false, downloadThroughput: (500 * 1024) / 8, uploadThroughput: (500 * 1024) / 8, latency: 400 };
const browser = await launch();
let judgeNum = 12;

for (const [name, device] of Object.entries(DEVICES)) {
  console.log(`\n${"─".repeat(72)}\n${name}  ${device.viewport.width}x${device.viewport.height}` +
    `${device.cpu > 1 ? `  (CPU throttled ${device.cpu}x)` : ""}`);
  const results = [];
  const { ctx, page } = await newJudgePage(browser, device);
  const cdp = await ctx.newCDPSession(page);
  if (device.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: device.cpu });

  // ── cold load on a normal connection ──────────────────────────────────────────────
  const t0 = Date.now();
  await page.goto(`${BASE}/s/${SCHOOL}`, { waitUntil: "load" });
  await page.locator(".role-card").first().waitFor({ timeout: 60000 });
  const loadMs = Date.now() - t0;
  results.push(check("loads to a usable screen in under 5 s", loadMs < 5000, `${(loadMs / 1000).toFixed(2)} s`));

  // ── cold load on slow 3G, cache cleared ───────────────────────────────────────────
  await ctx.clearCookies();
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await cdp.send("Network.emulateNetworkConditions", SLOW_3G);
  const t1 = Date.now();
  await page.goto(`${BASE}/s/${SCHOOL}?cachebust=${Date.now()}`, { waitUntil: "load", timeout: 120000 }).catch(() => {});
  await page.locator(".role-card").first().waitFor({ timeout: 120000 }).catch(() => {});
  const slowMs = Date.now() - t1;
  results.push(check("cold load on slow 3G under 15 s", slowMs < 15000, `${(slowMs / 1000).toFixed(1)} s`));
  await cdp.send("Network.emulateNetworkConditions", { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 });

  // ── sign in and open a scoring form ───────────────────────────────────────────────
  const jn = judgeNum++;
  await page.goto(`${BASE}/s/${SCHOOL}`, { waitUntil: "domcontentloaded" });
  await page.locator(".role-card").first().click();
  await page.locator('input[placeholder="e.g. 7"]').fill(String(jn));
  await page.locator('input[placeholder="Event invite code"]').fill(INVITE);
  await page.getByRole("button", { name: /Enter as Judge/ }).click();
  await page.locator(".proj-item").first().waitFor({ timeout: 60000 });

  // ── layout faults on the LIST ─────────────────────────────────────────────────────
  const listOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  results.push(check("project list has no horizontal scroll", listOverflow <= 1, `${listOverflow} px overflow`));

  await page.locator(".proj-item").first().click();
  await page.locator(".rub-steps").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(400);

  // ── input lag: tap a rubric button, time until it shows as selected ───────────────
  const lags = [];
  const groups = page.locator(".rub-steps");
  const nGroups = await groups.count();
  for (let i = 0; i < Math.min(5, nGroups); i++) {
    const btn = groups.nth(i).locator("button").nth(2);
    const t = Date.now();
    await btn.click();
    await groups.nth(i).locator("button.selected").first().waitFor({ timeout: 10000 });
    lags.push(Date.now() - t);
  }
  const medianLag = lags.sort((a, b) => a - b)[Math.floor(lags.length / 2)];
  results.push(check("tap feels immediate (median under 300 ms)", medianLag < 300, `${medianLag} ms median of ${lags.length}`));

  // ── layout faults on the SCORING FORM ─────────────────────────────────────────────
  const formOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  results.push(check("scoring form has no horizontal scroll", formOverflow <= 1, `${formOverflow} px overflow`));

  const smallTargets = await page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll(".rub-step-btn, button")) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.height < 44) out.push(`${(b.innerText || b.className).slice(0, 22)}:${Math.round(r.height)}px`);
    }
    return out;
  });
  results.push(check("every visible control is at least 44 px tall",
    smallTargets.length === 0, smallTargets.length ? `${smallTargets.length} small: ${smallTargets.slice(0, 4).join(", ")}` : "all >= 44 px"));

  const offscreen = await page.evaluate(() => {
    const w = document.documentElement.clientWidth, out = [];
    for (const b of document.querySelectorAll(".rub-step-btn")) {
      const r = b.getBoundingClientRect();
      if (r.right > w + 1 || r.left < -1) out.push(`${b.innerText.slice(0, 14)}`);
    }
    return out;
  });
  results.push(check("no scoring button is pushed off the screen edge",
    offscreen.length === 0, offscreen.length ? offscreen.slice(0, 5).join(", ") : "all within the viewport"));

  report.devices.push({
    device: name, viewport: device.viewport, cpuThrottle: device.cpu || 1,
    loadMs, slow3gMs: slowMs, medianTapLagMs: medianLag,
    listOverflowPx: listOverflow, formOverflowPx: formOverflow,
    smallTargets: smallTargets.length, offscreenButtons: offscreen.length,
    checks: results,
  });
  await ctx.close();
}

await browser.close();
report.fails = fails;
report.finishedAt = new Date().toISOString();
writeFileSync(new URL("./out/test5-devices.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(`\n${"─".repeat(72)}`);
console.log(`${fails === 0 ? "TEST 5 PASS" : `TEST 5 - ${fails} check(s) FAILED`}`);
console.log(`Raw results: tests/stress/out/test5-devices.json`);
console.log(`Production (evrupqnhgrfltfhafeyj) was not contacted.`);
process.exit(0);
