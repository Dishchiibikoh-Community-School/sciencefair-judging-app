// Shared browser helpers for the stress tests that need the REAL app (network trouble,
// devices, conflicts, sleep/wake, results accuracy).
//
// These drive the same screens a judge taps. Nothing is mocked: the page talks to the
// staging Supabase project through the dev server started by devserver.mjs.
import { chromium } from "playwright-core";

export const BASE = "http://localhost:5199";
export const SCHOOL = "stress-test-fair";
export const INVITE = "STRESS26";

// Device profiles for Test 5. Widths and user agents matter for layout and input handling;
// `cpu` is applied via CDP throttling where the test asks for it.
export const DEVICES = {
  "low-end Android phone": {
    viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (Linux; Android 11; SM-A127F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    cpu: 6,
  },
  "iPhone (Safari viewport)": {
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    cpu: 2,
  },
  "iPad": {
    viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    cpu: 2,
  },
  "laptop": { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, cpu: 1 },
};

export async function launch() {
  return chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
}

export async function newJudgePage(browser, device = DEVICES.laptop) {
  const { cpu, ...ctxOpts } = device;
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => page.__errors?.push(String(e.message)));
  page.__errors = [];
  page.on("pageerror", (e) => page.__errors.push(String(e.message)));
  return { ctx, page };
}

// Signs a judge in by NUMBER (the school is in school-numbering mode, so no department pick).
export async function signInJudge(page, number, { invite = INVITE, timeout = 20000 } = {}) {
  await page.goto(`${BASE}/s/${SCHOOL}`, { waitUntil: "domcontentloaded" });
  await page.locator(".role-card").first().click();
  await page.locator('input[placeholder="e.g. 7"]').fill(String(number));
  await page.locator('input[placeholder="Event invite code"]').fill(invite);
  await page.getByRole("button", { name: /Enter as Judge/ }).click();
  await page.locator(".proj-item").first().waitFor({ timeout });
}

export const projectCount = (page) => page.locator(".proj-item").count();

// Opens the Nth project in the judge's list and waits for the scoring form.
export async function openProject(page, index = 0, { timeout = 15000 } = {}) {
  await page.locator(".proj-item").nth(index).click();
  await page.locator(".rub-steps").first().waitFor({ timeout });
  await page.waitForTimeout(250);
}

// Taps one button in every criterion group. `pick` is 0..1 across the available steps, so the
// same call works for a 4-criterion, an 8-criterion and a 20-criterion form.
export async function fillAllCriteria(page, pick = 0.6) {
  const groups = page.locator(".rub-steps");
  const n = await groups.count();
  for (let i = 0; i < n; i++) {
    const g = groups.nth(i);
    const buttons = await g.locator("button").count();
    const idx = Math.min(buttons - 1, Math.max(0, Math.round(pick * (buttons - 1))));
    await g.locator("button").nth(idx).click();
  }
  return n;
}

export async function submitScore(page, { timeout = 20000 } = {}) {
  const btn = page.getByRole("button", { name: /Submit Score/ });
  await btn.click();
  // Back on the list means the submit resolved one way or the other.
  await page.locator(".proj-item").first().waitFor({ timeout }).catch(() => {});
  await page.waitForTimeout(400);
}

// Everything the judge's own device believes, straight out of localStorage - the offline
// queue, drafts and unsent scores are the machinery most likely to lose work.
export async function deviceState(page) {
  return page.evaluate(() => {
    const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return localStorage.getItem(k); } };
    return {
      judgeId: localStorage.getItem("sf_judge_id"),
      queue: read("sf_offline_queue") || [],
      drafts: read("sf_score_drafts") || {},
      unsent: read("sf_unsent_scores") || [],
      scoresCache: read("sf_scores_cache") || {},
      lastSync: localStorage.getItem("sf_last_sync_at"),
    };
  });
}

// What the judge can see about each project: used to check the UI never claims a score is
// saved when it is still sitting on the device.
export async function listRows(page) {
  return page.locator(".proj-item").evaluateAll((els) =>
    els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
}
