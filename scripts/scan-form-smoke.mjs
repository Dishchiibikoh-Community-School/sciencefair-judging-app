// Smoke test for participation-form scanning — calls the REAL Gemini API with the exact
// request code api/scan-form.js uses (callGemini + normaliseForm), skipping only the
// Supabase admin check. Use it after changing the prompt/schema, the model, or the key.
//
//   PowerShell:  $env:GEMINI_API_KEY="..."; node scripts/scan-form-smoke.mjs path\to\form.jpg
//   bash:        GEMINI_API_KEY=... node scripts/scan-form-smoke.mjs path/to/form.jpg
//   optional:    GEMINI_MODEL=gemini-3.8-flash
//
// Prints the normalised forms exactly as the admin review card would receive them.
// Costs one Gemini request. Never commit real student forms or the key.
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { callGemini, normaliseForm } from "../api/scan-form.js";

const file = process.argv[2];
const key = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
if (!file || !key) {
  console.error("Usage: GEMINI_API_KEY=... node scripts/scan-form-smoke.mjs <image-or-pdf>");
  process.exit(2);
}
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".heic": "image/heic", ".heif": "image/heif", ".pdf": "application/pdf" };
const mimeType = MIME[extname(file).toLowerCase()];
if (!mimeType) { console.error("Unsupported file type:", extname(file)); process.exit(2); }

const depts = [
  { id: "elem", name: "Elementary" },
  { id: "mid",  name: "Middle School" },
  { id: "high", name: "High School" },
];
const data = readFileSync(file).toString("base64");
console.log(`model ${model} · ${mimeType} · ${(data.length * 0.75 / 1024).toFixed(0)} KB`);

const t0 = Date.now();
let r = await callGemini({ key, model, mimeType, data, deptNames: depts.map(d => d.name), withStore: true });
if (r.status === 400 && /store/i.test(await r.clone().text())) {
  console.log("note: API rejected `store` — retrying without it (the server does the same)");
  r = await callGemini({ key, model, mimeType, data, deptNames: depts.map(d => d.name), withStore: false });
}
if (r.fetchError) { console.error("FAIL fetch:", r.fetchError.message); process.exit(1); }
if (!r.ok) { console.error("FAIL", r.status, (await r.text()).slice(0, 800)); process.exit(1); }

const out = await r.json();
const text = (out?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
let parsed;
try { parsed = JSON.parse(text); } catch {
  console.error("FAIL: response was not JSON. finishReason:", out?.candidates?.[0]?.finishReason);
  console.error(text.slice(0, 800));
  process.exit(1);
}
const forms = (parsed.forms || []).map(f => normaliseForm(f, depts));
console.log(`OK in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${forms.length} form(s)`);
console.log(JSON.stringify(forms, null, 2));
