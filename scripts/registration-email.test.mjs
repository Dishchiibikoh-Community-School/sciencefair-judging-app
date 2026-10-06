// Mocked tests for api/send-registration-email.js — no network, no email sent.
// Fakes Supabase + Resend via globalThis.fetch. Checks that the email carries ONLY the
// requesting school's own name and logo (migration 2026-10l), never another school's, and
// that everything typed by a student is HTML-escaped.
//   node scripts/registration-email.test.mjs
import assert from "node:assert/strict";

process.env.VITE_SUPABASE_URL = "https://db.example.co";
process.env.VITE_SUPABASE_ANON_KEY = "anon-key";
process.env.RESEND_API_KEY = "re_test";
const { default: handler, loadSchoolBranding } = await import(new URL("../api/send-registration-email.js", import.meta.url));

const A = "aaaaaaaa-1111-2222-3333-444444444444";        // a school with an uploaded logo
const B = "bbbbbbbb-1111-2222-3333-444444444444";        // another school
const LEG = "5667eba1-2f45-4830-96b7-6a6467113dfc";      // the one school with a bundled logo
let pass = 0;
const ok = (m) => { pass++; console.log("  ✓", m); };

let db = {}, sent = [], resendStatus = 200, supabaseDown = false;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  const j = (status, body) => new Response(JSON.stringify(body), { status });
  if (url.startsWith("https://api.resend.com/")) { sent.push(JSON.parse(opts.body)); return j(resendStatus, { id: "e1" }); }
  if (url.startsWith("https://db.example.co/rest/v1/")) {
    assert.equal(opts.headers.apikey, "anon-key");
    if (supabaseDown) throw new TypeError("fetch failed");
    const id = (url.match(/(?:id|school_id)=eq\.([0-9a-f-]+)/) || [])[1];
    if (url.includes("/schools?")) return j(200, db.schools.filter(s => s.id === id));
    if (url.includes("/school_branding?")) return db.brandingMissing ? j(404, { code: "PGRST205" }) : j(200, db.branding.filter(b => b.school_id === id));
  }
  throw new Error("unexpected fetch " + url);
};
const call = async (body) => {
  let status, payload; const res = { status(s) { status = s; return this; }, json(p) { payload = p; return this; } };
  await handler({ method: "POST", body }, res); return { status, payload };
};
const reg = (over = {}) => ({ studentEmail: "kid@example.com", studentName: "Lena Begay", regNumber: "JHS-LS-004",
  projectTitle: "Plant growth", category: "Life Science", division: "Middle", schoolId: A, ...over });
const reset = () => {
  sent = []; resendStatus = 200; supabaseDown = false;
  db = {
    schools: [
      { id: A, name: "Lincoln Middle School", slug: "lincoln" },
      { id: B, name: "Other School", slug: "other" },
      { id: LEG, name: "Dishchii'bikoh Community School", slug: "dishchiibikoh-community-school" },
    ],
    branding: [
      { school_id: A, logo_path: `${A}/logo-abcdef123456.webp` },
      { school_id: B, logo_path: `${B}/logo-zzzzzz123456.webp` },
      { school_id: LEG, logo_path: "builtin:dishchiibikoh" },
    ],
  };
};

reset();
let r = await call(reg());
assert.equal(r.status, 200);
let html = sent[0].html;
assert.ok(html.includes("Lincoln Middle School"));
assert.ok(html.includes(`https://db.example.co/storage/v1/object/public/school-branding/${A}/logo-abcdef123456.webp`));
assert.ok(!html.includes(B) && !html.includes("Other School"));
assert.ok(!/Dishchii?bikoh/i.test(html), "another school's name must never appear");
ok("email shows the requesting school's own name and logo — nothing from any other school");

reset();
db.branding[0].logo_path = `${B}/logo-zzzzzz123456.webp`;   // a row pointing into another school's folder
html = (await call(reg()), sent[0].html);
assert.ok(!html.includes("<img") && html.includes("🔬") && html.includes("Lincoln Middle School"));
ok("a logo path outside the school's own folder is ignored (neutral header)");

reset();
html = (await call(reg({ schoolId: LEG })), sent[0].html);
assert.ok(html.includes("https://qritiko.com/branding/dishchiibikoh-logo.png"));
ok("Dishchii'bikoh keeps its bundled logo");

reset();
db.branding.push({ school_id: A, logo_path: "builtin:dishchiibikoh" });
db.branding.shift();
html = (await call(reg()), sent[0].html);
assert.ok(!html.includes("dishchiibikoh-logo"));
ok("the bundled logo cannot be borrowed by another school");

reset();
html = (await call(reg({ schoolId: undefined })), sent[0].html);
assert.ok(!html.includes("<img") && !/Lincoln|Dishchii?bikoh/i.test(html));
html = (await call(reg({ schoolId: "not-a-uuid" })), sent[1].html);
assert.ok(!html.includes("<img"));
ok("no / bad schoolId → unbranded email, still sent");

reset();
supabaseDown = true;
r = await call(reg());
assert.equal(r.status, 200);
assert.ok(!sent[0].html.includes("<img"));
ok("database unreachable → email is still sent, unbranded");

reset();
db.brandingMissing = true;
html = (await call(reg()), sent[0].html);
assert.ok(html.includes("Lincoln Middle School") && !html.includes("<img"));
ok("migration 2026-10l not run → school name only");

reset();
db.schools[0].name = `Evil <img src=x onerror=alert(1)> School`;
html = (await call(reg({ studentName: "<script>alert(1)</script>", projectTitle: `"><b>x</b>`, category: "<i>c</i>" })), sent[0].html);
assert.ok(!html.includes("<script>") && !html.includes("<b>x</b>") && !html.includes("<i>c</i>") && !html.includes("<img src=x"));
assert.ok(html.includes("&lt;script&gt;") && html.includes("Evil &lt;img"));
ok("every typed value (and the school name) is HTML-escaped");

assert.deepEqual(await loadSchoolBranding(A, {}), { name: "", logoUrl: "" });
ok("without Supabase env vars the lookup is skipped");

console.log(`\nALL ${pass} CHECKS PASSED`);
