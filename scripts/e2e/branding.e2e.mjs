// Browser E2E — per-school branding (migration 2026-10l): Setup → School branding, real UI +
// mock backend (Supabase REST, RPCs and Storage faked in mock.mjs).
//   • neutral monogram when a school has no logo — and never another school's file, a
//     "builtin:" logo it does not own, or a path outside its own folder
//   • upload (shrunk + re-encoded in the browser), preview before saving, replace (old file
//     deleted), remove (confirmation), poster with a required description, description edit
//   • failed upload / failed save change nothing and leave no orphan file
//   • branding on the landing page, registration form, public results, public project list,
//     the project-list printout; never on judges' screens
//   • layouts: phone / tablet / laptop, portrait + landscape — no overflow, posters keep their
//     proportions and stay below the sign-in buttons
// Run: see scan.e2e.mjs header (dev server on :5199 with mock Supabase env).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { freshStore, installMock, SID } from "./mock.mjs";

const BASE = "http://localhost:5199";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
mkdirSync(OUT, { recursive: true });
const OTHER = "22222222-2222-2222-2222-222222222222";
const LEG = "5667eba1-2f45-4830-96b7-6a6467113dfc";
let pass = 0; const failures = [];
const ok = (m) => { pass++; console.log("  ✓", m); };
const check = async (m, fn) => { try { await fn(); ok(m); } catch (e) { failures.push(m); console.log("  ✗", m, "\n     ", String(e.message).split("\n")[0]); } };
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "msedge", headless: true });
const errs = [];

const store = freshStore();
const now = new Date().toISOString();
store.share_links.push({ id: "sl1", school_id: SID, token: "PUB-TOKEN", expiry: "never", created_at: now, revoked_at: null, title: "Final Results" });
store.app_settings.push({ school_id: SID, key: "project_list_token", value: "PL-TOKEN" });
// Rows that must NEVER reach this school's pages.
store.school_branding.push({ school_id: OTHER, logo_path: `${OTHER}/logo-otherschool1234.webp`, poster_path: null, poster_alt: "" });
store.storage[`${OTHER}/logo-otherschool1234.webp`] = { type: "image/webp", bytes: Buffer.from("x") };

async function newPage(vp = { width: 1280, height: 900 }, s = store) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  const reqs = [];
  page.on("request", r => reqs.push(r.url()));
  await installMock(page, s, []);
  return { page, ctx, reqs };
}
async function admin(page) {
  await page.goto(`${BASE}/s/test`);
  await page.locator(".role-card.adm").click();
  await page.locator("input[type=email]").fill("admin@test.edu");
  await page.locator("input[type=password]").fill("correct-horse");
  await page.keyboard.press("Enter");
  await page.locator(".adm-side").waitFor({ timeout: 6000 });
  await page.locator(".nav-it", { hasText: "Setup" }).click();
  await page.locator("#branding").scrollIntoViewIfNeeded();
}
// Real images, drawn in a browser canvas (alpha, gradients, text — not a 1-pixel stub).
async function makeImage(page, w, h, type = "image/png", label = "") {
  const dataUrl = await page.evaluate(([w, h, type, label]) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#0ea5e9"); g.addColorStop(1, "#7c3aed");
    if (type === "image/png") x.clearRect(0, 0, w, h); else { x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); }
    x.fillStyle = g; x.beginPath(); x.ellipse(w / 2, h / 2, w * 0.45, h * 0.45, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#fff"; x.font = `bold ${Math.round(Math.min(w, h) / 6)}px sans-serif`; x.textAlign = "center";
    x.fillText(label || `${w}x${h}`, w / 2, h / 2);
    return c.toDataURL(type, 0.95);
  }, [w, h, type, label]);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}
const pick = (page, which, file) => page.locator(`#branding input[type=file]`).nth(which === "logo" ? 0 : 1).setInputFiles(file);
const logoFiles = () => Object.keys(store.storage).filter(k => k.startsWith(`${SID}/logo-`));
const posterFiles = () => Object.keys(store.storage).filter(k => k.startsWith(`${SID}/poster-`));
const row = () => store.school_branding.find(r => r.school_id === SID);
const storageUrl = (p) => `https://mock.supabase.co/storage/v1/object/public/school-branding/${p}`;

console.log("\n── No branding yet: neutral fallback, never another school's logo");
{
  const { page, reqs } = await newPage();
  await page.goto(`${BASE}/s/test`);
  await page.locator(".school-banner .school-mono").waitFor({ timeout: 6000 });
  await check("landing shows the school's initials (monogram), no <img>", async () => {
    assert.equal((await page.locator(".school-banner .school-mono").innerText()).trim(), "DT");
    assert.equal(await page.locator(".school-banner img").count(), 0);
  });
  await check("no request for another school's logo or the bundled Dishchii'bikoh logo", async () => {
    assert.ok(!reqs.some(u => u.includes(OTHER) || u.includes("dishchiibikoh-logo")), reqs.filter(u => /branding|storage/.test(u)).join(", "));
  });
  await check("the platform homepage is branded Qritiko with the platform icon, not a school's", async () => {
    await page.goto(`${BASE}/`);
    await page.locator(".mkt-nav-brand").getByText("Qritiko").waitFor({ timeout: 4000 });
    assert.equal(await page.locator("link[rel=icon][type='image/svg+xml']").getAttribute("href"), "/favicon.svg");
    assert.equal(await page.locator("link[rel=apple-touch-icon]").getAttribute("href"), "/icons/apple-touch-icon.png");
    assert.equal(await page.locator("img[src*='branding'], img[src*='storage']").count(), 0);
    assert.match(await page.title(), /Qritiko/);
  });
  await page.context().close();
}

console.log("\n── Rows that point at something this school does not own are ignored");
for (const [what, path] of [["a path in another school's folder", `${OTHER}/logo-otherschool1234.webp`], ["the bundled logo of another school", "builtin:dishchiibikoh"]]) {
  store.school_branding.push({ school_id: SID, logo_path: path, poster_path: path.replace("logo", "poster"), poster_alt: "x" });
  const { page, reqs } = await newPage();
  await page.goto(`${BASE}/s/test`);
  await page.locator(".school-banner .school-mono").waitFor({ timeout: 6000 });
  await check(`${what} → monogram, no poster, file never requested`, async () => {
    assert.equal(await page.locator(".brand-poster").count(), 0);
    assert.ok(!reqs.some(u => u.includes(OTHER) || u.includes("dishchiibikoh-logo")));
  });
  store.school_branding = store.school_branding.filter(r => r.school_id !== SID);
  await page.context().close();
}

console.log("\n── The bundled logo stays with Dishchii'bikoh only (id AND slug)");
{
  const legStore = freshStore();
  legStore.schools = [{ id: LEG, name: "Dishchii'bikoh Community School", slug: "dishchiibikoh-community-school", created_at: now }];
  legStore.school_branding = [{ school_id: LEG, logo_path: "builtin:dishchiibikoh", poster_path: null, poster_alt: "" }];
  const { page } = await newPage(undefined, legStore);
  await page.goto(`${BASE}/s/dishchiibikoh-community-school`);
  await check("Dishchii'bikoh's landing page shows its wildcat logo", async () => {
    const img = page.locator(".school-banner img.school-logo");
    await img.waitFor({ timeout: 6000 });
    assert.equal(await img.getAttribute("src"), "/branding/dishchiibikoh-logo.png");
    assert.ok(await img.evaluate(i => i.complete && i.naturalWidth === 512));
  });
  // Migration not run yet: the bundled logo is still used for that school, and only that school.
  legStore.brandingTableMissing = true;
  await page.reload();
  await check("before migration 2026-10l runs, Dishchii'bikoh still shows its logo", async () => {
    await page.locator(".school-banner img.school-logo[src='/branding/dishchiibikoh-logo.png']").waitFor({ timeout: 6000 });
  });
  legStore.schools[0].slug = "test";
  await page.goto(`${BASE}/s/test`);
  await check("same id but a different slug → monogram (both must match)", async () => {
    await page.locator(".school-banner .school-mono").waitFor({ timeout: 6000 });
  });
  await page.context().close();
}

console.log("\n── Admin: upload, preview, save the logo");
const A = await newPage();
await admin(A.page);
await check("Setup shows the branding card with the monogram and Upload buttons", async () => {
  await A.page.locator("#branding .brand-preview.logo .school-mono").waitFor({ timeout: 4000 });
  await A.page.getByRole("button", { name: "⬆ Upload logo" }).waitFor();
  await A.page.getByRole("button", { name: "⬆ Upload poster" }).waitFor();
});
const bigLogo = await makeImage(A.page, 1200, 900, "image/png", "LOGO");
await pick(A.page, "logo", { name: "logo.png", mimeType: "image/png", buffer: bigLogo });
await check("a picked logo is shrunk to 512 px and previewed — nothing uploaded yet", async () => {
  await A.page.getByText(/New logo · 512×384 · \d+ KB (WebP|PNG)/).waitFor({ timeout: 6000 });
  assert.equal(store.storageLog.length, 0);
  assert.equal(row(), undefined);
});
await A.page.getByRole("button", { name: "✓ Save logo" }).click();
await check("Save uploads ONE small re-encoded file into the school's own folder and records it", async () => {
  await A.page.getByText("Logo saved.").waitFor({ timeout: 6000 });
  const up = store.storageLog.filter(l => l.op === "upload");
  assert.equal(up.length, 1);
  assert.match(up[0].name, new RegExp(`^${SID}/logo-[a-f0-9]{20}\\.(webp|png)$`));
  assert.ok(["image/webp", "image/png"].includes(up[0].type), up[0].type);
  assert.ok(up[0].size > 0 && up[0].size < 1.5 * 1024 * 1024, String(up[0].size));
  assert.equal(up[0].upsert, "false");
  assert.equal(row().logo_path, up[0].name);
});
const firstLogo = row()?.logo_path;
await check("the Setup preview now shows the saved logo from storage", async () => {
  assert.equal(await A.page.locator("#branding .brand-preview.logo img.school-logo").getAttribute("src"), storageUrl(firstLogo));
});

console.log("\n── Replace: the old file is deleted");
await pick(A.page, "logo", { name: "logo2.jpg", mimeType: "image/jpeg", buffer: await makeImage(A.page, 800, 800, "image/jpeg", "NEW") });
await A.page.getByText(/New logo · 512×512/).waitFor({ timeout: 6000 });
await A.page.getByRole("button", { name: "✓ Save logo" }).click();
await check("replacing the logo points at a NEW file name and deletes the old file", async () => {
  await A.page.getByText("Logo saved.").waitFor({ timeout: 6000 });
  for (let i = 0; i < 30 && logoFiles().length !== 1; i++) await A.page.waitForTimeout(100);
  assert.notEqual(row().logo_path, firstLogo);
  assert.deepEqual(logoFiles(), [row().logo_path]);
});

console.log("\n── Failures change nothing");
const before = row().logo_path;
store.failBrandingRpc = true;
await pick(A.page, "logo", { name: "logo3.png", mimeType: "image/png", buffer: await makeImage(A.page, 300, 300) });
await A.page.getByRole("button", { name: "✓ Save logo" }).click();
await check("save fails → 'NOT saved', the uploaded file is deleted again, the logo is unchanged", async () => {
  await A.page.getByText(/NOT saved/).waitFor({ timeout: 6000 });
  for (let i = 0; i < 30 && logoFiles().length !== 1; i++) await A.page.waitForTimeout(100);
  assert.equal(row().logo_path, before);
  assert.deepEqual(logoFiles(), [before]);
  // The IT-log row is written in the background after the message appears — wait for it.
  for (let i = 0; i < 30 && !store.it_logs.some(l => l.event === "BRANDING_SAVE_FAILED"); i++) await A.page.waitForTimeout(100);
  assert.ok(store.it_logs.some(l => l.event === "BRANDING_SAVE_FAILED"), "BRANDING_SAVE_FAILED not logged");
});
store.failBrandingRpc = false;
store.failStorage = true;
await A.page.getByRole("button", { name: "✓ Save logo" }).click();
await check("upload fails → 'NOT saved', nothing recorded, the draft is kept for a retry", async () => {
  await A.page.getByText(/NOT saved/).waitFor({ timeout: 6000 });
  assert.equal(row().logo_path, before);
  await A.page.getByRole("button", { name: "✓ Save logo" }).waitFor();
});
store.failStorage = false;
await A.page.getByRole("button", { name: "Cancel" }).first().click();
for (const [what, file, re] of [
  ["a text file", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }, /Use a PNG, JPG or WebP image/],
  ["an iPhone HEIC photo", { name: "IMG_0001.HEIC", mimeType: "image/heic", buffer: Buffer.from("x") }, /HEIC photos can't be used/],
  ["an SVG", { name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") }, /Use a PNG, JPG or WebP image/],
  ["a 30 px image", { name: "tiny.png", mimeType: "image/png", buffer: await makeImage(A.page, 30, 30) }, /too small \(30×30\)/],
  ["a broken PNG", { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not really a png") }, /could not be read as an image/],
]) {
  const n = store.storageLog.length;
  await pick(A.page, "logo", file);
  await check(`refused before upload: ${what}`, async () => {
    await A.page.locator("#branding .brand-err").filter({ hasText: re }).waitFor({ timeout: 4000 });
    assert.equal(store.storageLog.length, n);
  });
}

console.log("\n── Poster with a required description");
const poster = await makeImage(A.page, 3000, 1500, "image/jpeg", "SCIENCE FAIR 2026");
await pick(A.page, "poster", { name: "poster.jpg", mimeType: "image/jpeg", buffer: poster });
await check("poster is shrunk to 1600 px; Save stays disabled until it is described", async () => {
  await A.page.getByText(/New poster · 1600×800/).waitFor({ timeout: 6000 });
  assert.equal(await A.page.getByRole("button", { name: "✓ Save poster" }).isDisabled(), true);
});
await A.page.getByLabel(/Describe the poster/).fill("Science fair 2026 poster: a rocket over the mesa");
await A.page.getByRole("button", { name: "✓ Save poster" }).click();
await check("poster saved with its description", async () => {
  await A.page.getByText("Poster saved.").waitFor({ timeout: 6000 });
  assert.equal(posterFiles().length, 1);
  assert.equal(row().poster_alt, "Science fair 2026 poster: a rocket over the mesa");
});
await A.page.getByRole("button", { name: "Edit description" }).click();
await A.page.getByLabel(/Describe the poster/).fill("Poster: rocket over the mesa, March 12, gym");
await A.page.getByRole("button", { name: "✓ Save description" }).click();
await check("the description can be changed without re-uploading", async () => {
  await A.page.getByText("Description saved.").waitFor({ timeout: 4000 });
  assert.equal(row().poster_alt, "Poster: rocket over the mesa, March 12, gym");
  assert.equal(posterFiles().length, 1);
});
await A.page.screenshot({ path: `${OUT}/branding-setup.png`, fullPage: false, clip: await A.page.locator("#branding").boundingBox() });

console.log("\n── Public pages carry this school's branding");
{
  const { page } = await newPage({ width: 1280, height: 900 });
  await page.goto(`${BASE}/s/test`);
  await check("landing: the logo from storage, the school name, and the poster below the sign-in cards", async () => {
    const img = page.locator(".school-banner img.school-logo");
    await img.waitFor({ timeout: 6000 });
    assert.equal(await img.getAttribute("src"), storageUrl(row().logo_path));
    const p = page.locator(".land-poster .brand-poster img");
    await p.waitFor({ timeout: 6000 });
    assert.equal(await p.getAttribute("alt"), "Poster: rocket over the mesa, March 12, gym");
    const grid = await page.locator(".role-grid").boundingBox(), pb = await p.boundingBox();
    assert.ok(pb.y >= grid.y + grid.height, "poster must sit below the role cards");
  });
  await page.goto(`${BASE}/s/test?register=REG-TOKEN`);
  await check("registration form: logo, school name (not Dishchiibikoh), poster", async () => {
    await page.locator(".reg-hero img.school-logo").waitFor({ timeout: 6000 });
    assert.equal(await page.locator(".reg-hero .school-name").innerText(), "Dishchii'bikoh Test");
    await page.locator(".brand-poster img[alt^='Poster: rocket']").waitFor({ timeout: 6000 });
  });
  await page.goto(`${BASE}/s/test?token=PUB-TOKEN`);
  await check("public results: logo + school name in the header, poster under it", async () => {
    await page.locator(".pub-hero img.school-logo").waitFor({ timeout: 6000 });
    await page.locator(".pub-hero .school-name", { hasText: "Dishchii'bikoh Test" }).waitFor();
    await page.locator(".brand-poster img").waitFor({ timeout: 6000 });
  });
  await page.goto(`${BASE}/s/test?projects=PL-TOKEN`);
  await check("public project list: logo, school name, 'Powered by Qritiko'", async () => {
    await page.locator(".pub-hero img.school-logo").waitFor({ timeout: 6000 });
    await page.getByText("Powered by Qritiko").waitFor();
    assert.equal(await page.getByText(/Dishchiibikoh Community School/).count(), 0);
  });
  await page.context().close();
}

console.log("\n── Printout: the project-list PDF");
{
  await A.page.locator(".nav-it", { hasText: "Projects" }).first().click();
  const [popup] = await Promise.all([A.ctx.waitForEvent("page"), A.page.getByRole("button", { name: /Export Project List PDF/ }).click()]);
  await popup.waitForLoadState();
  const html = await popup.content();
  await check("the printout carries this school's name and logo (absolute storage URL)", async () => {
    assert.ok(html.includes("Dishchii'bikoh Test") || html.includes("Dishchii&#39;bikoh Test"));
    assert.ok(html.includes(storageUrl(row().logo_path)));
    assert.ok(!html.includes("/logo.png"));
  });
  await popup.close();
  await A.page.locator(".nav-it", { hasText: "Setup" }).click();
}

console.log("\n── Judges never see the poster");
{
  const { page } = await newPage({ width: 820, height: 1180 });
  await page.goto(`${BASE}/s/test`);
  await page.locator(".role-card").first().click();
  await page.getByRole("button", { name: /Middle School/ }).click();
  await page.locator('input[placeholder="e.g. Judge1"]').fill("Judge1");
  await page.locator('input[placeholder="Event invite code"]').fill("ABC123");
  await page.getByRole("button", { name: /Enter as Judge/ }).click();
  await check("judge home and the scoring form have no poster", async () => {
    await page.locator(".proj-item").first().waitFor({ timeout: 6000 });
    assert.equal(await page.locator(".brand-poster").count(), 0);
    await page.locator(".proj-item").first().click();
    await page.locator(".rub-step-btn").first().waitFor({ timeout: 6000 });
    assert.equal(await page.locator(".brand-poster").count(), 0);
  });
  await page.context().close();
}

console.log("\n── Layouts (phones, tablets, laptops; portrait + landscape)");
// A tall portrait poster is the hardest case for small landscape screens.
await A.page.locator("#branding").scrollIntoViewIfNeeded();
await pick(A.page, "poster", { name: "tall.png", mimeType: "image/png", buffer: await makeImage(A.page, 900, 1600, "image/png", "TALL") });
await A.page.getByText(/New poster · 900×1600/).waitFor({ timeout: 6000 });
await A.page.getByRole("button", { name: "✓ Save poster" }).click();
await A.page.getByText("Poster saved.").waitFor({ timeout: 6000 });
const VIEWPORTS = [
  ["phone-portrait", 360, 740], ["phone-landscape", 740, 360], ["tablet-portrait", 820, 1180],
  ["tablet-landscape", 1180, 820], ["chromebook", 1366, 768], ["laptop", 1536, 864],
];
async function layoutOk(page, name, sel, maxFrac) {
  const r = await page.evaluate(([sel]) => {
    const img = document.querySelector(sel);
    const rect = img?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      vw: window.innerWidth, vh: window.innerHeight,
      w: rect?.width, h: rect?.height, left: rect?.left, right: rect?.right,
      ratio: img ? img.naturalWidth / img.naturalHeight : 0, done: !!img?.complete && img?.naturalWidth > 0,
    };
  }, [sel]);
  assert.ok(r.overflow <= 0, `${name}: page scrolls sideways by ${r.overflow}px`);
  assert.ok(r.done, `${name}: poster not loaded`);
  assert.ok(Math.abs(r.w / r.h - r.ratio) < 0.02 * r.ratio, `${name}: poster distorted ${(r.w / r.h).toFixed(3)} vs ${r.ratio.toFixed(3)}`);
  assert.ok(r.left >= -0.5 && r.right <= r.vw + 0.5, `${name}: poster wider than the screen`);
  assert.ok(r.h <= r.vh * maxFrac + 1, `${name}: poster ${r.h}px is taller than ${maxFrac * 100}% of ${r.vh}px`);
}
for (const [name, w, h] of VIEWPORTS) {
  const { page } = await newPage({ width: w, height: h });
  await page.goto(`${BASE}/s/test`);
  await page.locator(".land-poster .brand-poster img").waitFor({ timeout: 6000 });
  await page.locator(".land-poster .brand-poster img").evaluate(i => i.decode?.().catch(() => {}));
  await check(`${name} ${w}×${h}: landing — no overflow, poster proportional, below the sign-in cards`, async () => {
    await layoutOk(page, name, ".land-poster .brand-poster img", 0.75);
    const cards = await page.locator(".role-grid").boundingBox(), pb = await page.locator(".land-poster img").boundingBox();
    assert.ok(pb.y >= cards.y + cards.height, "poster overlaps the role cards");
    const logo = await page.locator(".school-banner img.school-logo").boundingBox();
    assert.ok(Math.abs(logo.width - 88) < 1 && Math.abs(logo.height - 88) < 1);
  });
  await page.screenshot({ path: `${OUT}/branding-landing-${name}.png`, fullPage: true });
  await page.goto(`${BASE}/s/test?register=REG-TOKEN`);
  await page.locator(".brand-poster img").waitFor({ timeout: 6000 });
  await page.locator(".brand-poster img").evaluate(i => i.decode?.().catch(() => {}));
  await check(`${name}: registration — no overflow, poster ≤ 45% of the screen, form still reachable`, async () => {
    await layoutOk(page, name, ".brand-poster img", 0.45);
    await page.locator('input[placeholder="e.g. Maria Santos"]').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('input[placeholder="e.g. Maria Santos"]').isVisible());
  });
  await page.screenshot({ path: `${OUT}/branding-register-${name}.png`, fullPage: false });
  await page.goto(`${BASE}/s/test?token=PUB-TOKEN`);
  await page.locator(".pub-hero img.school-logo").waitFor({ timeout: 6000 });
  await page.locator(".brand-poster img").evaluate(i => i.decode?.().catch(() => {}));
  await check(`${name}: public results — no overflow, poster proportional`, async () => {
    await layoutOk(page, name, ".brand-poster img", 0.45);
  });
  await page.context().close();
}
{
  const { page } = await newPage({ width: 360, height: 740 });
  await admin(page);
  await check("phone: the Setup branding card fits (no sideways scroll)", async () => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const card = await page.locator("#branding").boundingBox();
    assert.ok(card.x >= 0 && card.x + card.width <= 360.5);
  });
  await page.locator("#branding").screenshot({ path: `${OUT}/branding-setup-phone.png` });
  await page.context().close();
}

console.log("\n── Remove (with confirmation)");
await A.page.locator("#branding").scrollIntoViewIfNeeded();
await A.page.locator("#branding .brand-item").nth(1).getByRole("button", { name: "Remove" }).click();
await check("removing asks first and changes nothing until confirmed", async () => {
  await A.page.getByText("Remove the poster?").waitFor({ timeout: 3000 });
  assert.ok(row().poster_path);
});
await A.page.locator("#branding .brand-confirm").getByRole("button", { name: "Remove" }).click();
await check("poster removed: row cleared, file deleted", async () => {
  await A.page.getByText("Poster removed.").waitFor({ timeout: 6000 });
  for (let i = 0; i < 30 && posterFiles().length; i++) await A.page.waitForTimeout(100);
  assert.equal(row().poster_path, null); assert.equal(row().poster_alt, ""); assert.deepEqual(posterFiles(), []);
});
await A.page.locator("#branding .brand-item").nth(0).getByRole("button", { name: "Remove" }).click();
await A.page.locator("#branding .brand-confirm").getByRole("button", { name: "Remove" }).click();
await check("logo removed: monogram again, file deleted, logged", async () => {
  await A.page.getByText(/Logo removed/).waitFor({ timeout: 6000 });
  for (let i = 0; i < 30 && logoFiles().length; i++) await A.page.waitForTimeout(100);
  assert.equal(row().logo_path, null); assert.deepEqual(logoFiles(), []);
  await A.page.locator("#branding .brand-preview.logo .school-mono").waitFor();
  for (let i = 0; i < 30 && !(store.it_logs.some(l => l.event === "BRANDING_REMOVED")
    && store.activity_log.some(l => /removed the school logo/.test(l.message))); i++) await A.page.waitForTimeout(100);
  assert.ok(store.it_logs.some(l => l.event === "BRANDING_REMOVED"));
  assert.ok(store.activity_log.some(l => /removed the school logo/.test(l.message)));
});
{
  const { page } = await newPage();
  await page.goto(`${BASE}/s/test`);
  await check("landing after removal: monogram, no poster", async () => {
    await page.locator(".school-banner .school-mono").waitFor({ timeout: 6000 });
    assert.equal(await page.locator(".brand-poster").count(), 0);
  });
  await page.context().close();
}

console.log("\n── School year (Setup → School year, app_settings.school_year)");
{
  const d = new Date(), y = d.getFullYear();
  const AUTO = d.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  const syRow = () => store.app_settings.find(r => r.school_id === SID && r.key === "school_year");
  const card = A.page.locator("#school-year");
  await card.scrollIntoViewIfNeeded();
  await check("by default the school year follows the calendar (automatic)", async () => {
    await card.locator(".brand-acts b", { hasText: `SY ${AUTO}` }).waitFor({ timeout: 4000 });
    await card.getByText("(automatic)").waitFor();
  });
  await card.getByRole("button", { name: "✏️ Change" }).click();
  await card.getByLabel("School year").fill("<b>2027</b>");
  await card.getByRole("button", { name: "Save" }).click();
  await check("odd characters are refused and nothing is saved", async () => {
    await card.getByText(/Use only letters, numbers/).waitFor({ timeout: 3000 });
    assert.equal(syRow(), undefined);
  });
  store.failWrites = ["app_settings"];
  await card.getByLabel("School year").fill("2027-2028");
  await card.getByRole("button", { name: "Save" }).click();
  await check("a failed save says NOT saved and changes nothing", async () => {
    await card.getByText(/NOT saved/).waitFor({ timeout: 4000 });
    assert.equal(syRow(), undefined);
  });
  store.failWrites = [];
  await card.getByLabel("School year").fill("SY 2027-2028");
  await card.getByRole("button", { name: "Save" }).click();
  await check("saved without the 'SY' prefix; the card and the dashboard show SY 2027-2028", async () => {
    await card.getByText(/Saved — your pages now show SY 2027-2028/).waitFor({ timeout: 4000 });
    assert.equal(syRow()?.value, "2027-2028");
    await A.page.locator(".nav-it", { hasText: "Overview" }).first().click();
    await A.page.locator(".adm-sub", { hasText: "Science Fair SY 2027-2028" }).waitFor({ timeout: 3000 });
    await A.page.locator(".nav-it", { hasText: "Setup" }).click();
  });
  {
    const { page } = await newPage({ width: 390, height: 844 });
    await page.goto(`${BASE}/s/test?register=REG-TOKEN`);
    await check("the registration form shows the school's year, not 2025-2026", async () => {
      await page.getByText(/SY 2027-2028 · Required fields/).waitFor({ timeout: 6000 });
      assert.equal(await page.getByText(/2025-2026/).count(), 0);
    });
    await page.context().close();
  }
  await A.page.locator("#school-year").getByRole("button", { name: "✏️ Change" }).click();
  await A.page.locator("#school-year").getByLabel("School year").fill("");
  await A.page.locator("#school-year").getByRole("button", { name: "Save" }).click();
  await check("clearing it goes back to automatic", async () => {
    await A.page.locator("#school-year").getByText(/follows the calendar \(SY \d{4}-\d{4}\)/).waitFor({ timeout: 4000 });
    assert.equal(syRow()?.value, "");
    await A.page.locator("#school-year").getByText("(automatic)").waitFor();
  });
}

console.log("\n── Migration not run");
{
  const s2 = freshStore(); s2.brandingTableMissing = true;
  const { page } = await newPage(undefined, s2);
  await admin(page);
  await check("Setup says the migration is needed and disables uploads", async () => {
    await page.getByText(/run .*migration-2026-10l-school-branding\.sql/).waitFor({ timeout: 4000 });
    assert.equal(await page.getByRole("button", { name: "⬆ Upload logo" }).isDisabled(), true);
  });
  await page.context().close();
}

const real = errs.filter(e => !/WebSocket|realtime|ERR_NAME_NOT_RESOLVED|Failed to load resource|mock\.supabase\.co|Failed to fetch/i.test(e));
await check("no React/JS errors in the console", async () => assert.deepEqual(real, []));
if (real.length) console.log(real.slice(0, 8).join("\n"));
await browser.close();
console.log(`\n${pass} passed, ${failures.length} failed${failures.length ? ":\n - " + failures.join("\n - ") : ""}`);
process.exit(failures.length ? 1 : 0);
