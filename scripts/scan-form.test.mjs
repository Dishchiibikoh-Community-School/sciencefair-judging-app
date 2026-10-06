// Mocked tests for api/scan-form.js — no network, no Gemini cost.
// Fakes Supabase + Gemini via globalThis.fetch and checks auth, validation, the exact
// Gemini request (no sampling params, store:false, enums) and error mapping.
//   node scripts/scan-form.test.mjs
import assert from "node:assert/strict";
const { default: handler } = await import(new URL("../api/scan-form.js", import.meta.url));

const SID = "11111111-2222-3333-4444-555555555555";
const DEPTS = [{id:"d-elem",name:"Elementary"},{id:"d-mid",name:"Middle School"},{id:"d-high",name:"High School"}];
const BUILTIN_CATS = ["Life Science","Earth & Environmental Science","Chemistry & Material Science",
  "Physics, Math & Astronomy","Engineering, Robotics & Technology","Energy, Sustainability & Design"];
let geminiCalls = [], scenario = {};
globalThis.fetch = async (url, opts={}) => {
  url = String(url);
  const j = (status, body) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  if (url.includes("/auth/v1/user")) return scenario.badToken ? j(401,{}) : j(200,{id:"u1"});
  if (url.includes("/school_admins")) return j(200, scenario.notAdmin ? [] : [{school_id:SID}]);
  if (url.includes("/departments")) return j(200, DEPTS);
  // Per-school categories (migration 2026-10e). scenario.cats overrides them;
  // scenario.catsMissing simulates a project where the migration has not run.
  if (url.includes("/categories")) {
    if (scenario.catsMissing) return j(404, { message: "relation does not exist" });
    return j(200, (scenario.cats ?? BUILTIN_CATS).map(name => ({ name })));
  }
  if (url.includes("generativelanguage")) {
    const body = JSON.parse(opts.body); geminiCalls.push({ url, body, headers: opts.headers });
    if (scenario.gemini) return scenario.gemini(body, geminiCalls.length);
  }
  throw new Error("unexpected fetch " + url);
};
const call = async (body, headers={authorization:"Bearer tok"}, method="POST") => {
  let status, payload; const res = { status(s){ status=s; return this; }, json(p){ payload=p; return this; } };
  await handler({ method, headers, body }, res); return { status, payload };
};
const good = { schoolId: SID, mimeType: "image/jpeg", data: Buffer.from("fakejpeg").toString("base64") };
const formJson = { forms: [{
  is_participation_form: true,
  students: [{name:{value:"Amos Lope",confidence:"low"},grade:{value:"8th",confidence:"high"}},
             {name:{value:"",confidence:"high"},grade:{value:"",confidence:"high"}},
             {name:{value:"Noah Jones",confidence:"high"},grade:{value:"8th",confidence:"high"}}],
  teacher:{value:"Mr. Agan",confidence:"high"}, room:{value:"T25",confidence:"low"},
  department:{value:"Middle School",confidence:"high"}, work_mode:{value:"In groups of three",confidence:"high"},
  title:{value:"Modeling natural responses",confidence:"low"}, description:{value:"Build   adaptive\nsurfaces",confidence:"high"},
  motivation:{value:"",confidence:"high"}, category:{value:"Engineering, Robotics & Technology",confidence:"high"}, notes:"" },
  { is_participation_form: true, students: [], teacher:{value:"",confidence:"high"}, room:{value:"",confidence:"high"},
  department:{value:"None",confidence:"high"}, work_mode:{value:"None",confidence:"high"}, title:{value:"X",confidence:"high"},
  description:{value:"",confidence:"high"}, motivation:{value:"",confidence:"high"}, category:{value:"Not sure yet",confidence:"high"}, notes:"two boxes" }]};
const ok = () => new Response(JSON.stringify({ candidates:[{ finishReason:"STOP", content:{ parts:[{ text: JSON.stringify(formJson) }] } }] }), { status:200 });

// 1. not configured
delete process.env.GEMINI_API_KEY;
assert.equal((await call(good)).status, 503);
process.env.GEMINI_API_KEY = "k"; process.env.VITE_SUPABASE_URL = "https://x.supabase.co"; process.env.VITE_SUPABASE_ANON_KEY = "anon";
// 2. method / auth / input
assert.equal((await call(good, {}, "GET")).status, 405);
assert.equal((await call(good, {})).status, 401);
assert.equal((await call({...good, schoolId:"nope"})).status, 400);
assert.equal((await call({...good, mimeType:"text/html"})).status, 415);
assert.equal((await call({...good, data:"not base64!!"})).status, 400);
assert.equal((await call({...good, data:"A".repeat(5_000_000)})).status, 413);
scenario = { badToken:true }; assert.equal((await call(good)).status, 401);
scenario = { notAdmin:true }; assert.equal((await call(good)).status, 403);
assert.equal(geminiCalls.length, 0, "Gemini must not be called before auth passes");

// 3. happy path
scenario = { gemini: ok };
let r = await call(good);
assert.equal(r.status, 200, JSON.stringify(r.payload));
const g = geminiCalls[0].body;
assert.equal(geminiCalls[0].headers["x-goog-api-key"], "k");
assert.match(geminiCalls[0].url, /models\/gemini-3\.8-flash:generateContent$/);
assert.equal(g.store, false);
assert.equal(g.contents[0].parts[0].inlineData.mimeType, "image/jpeg");
assert.ok(!("temperature" in g.generationConfig) && !("topP" in g.generationConfig), "no sampling params for Gemini 3");
assert.deepEqual(g.generationConfig.responseSchema.properties.forms.items.properties.department.properties.value.enum,
  ["Elementary","Middle School","High School","None"]);
assert.deepEqual(g.generationConfig.responseSchema.properties.forms.items.properties.category.properties.value.enum,
  [...BUILTIN_CATS, "Not sure yet", "None"]);
const [f1, f2] = r.payload.forms;
assert.equal(f1.department_id.value, "d-mid");
assert.equal(f1.cat.value, "Engineering, Robotics & Technology");
assert.deepEqual(f1.students.map(s => [s.name.value, s.grade.value]), [["Amos Lope","8"],["Noah Jones","8"]]);
assert.equal(f1.students[0].name.confidence, "low");
assert.equal(f1.description.value, "Build adaptive surfaces");
assert.equal(f1.workMode, "In groups of three");
assert.equal(f2.cat.value, ""); assert.equal(f2.cat.notSure, true);
assert.equal(f2.department_id.value, ""); assert.equal(f2.notes, "two boxes");

// 4. store rejected -> retried without it
geminiCalls = [];
scenario = { gemini: (b, n) => n === 1 ? new Response('{"error":{"message":"Invalid JSON payload received. Unknown name \"store\""}}', {status:400}) : ok() };
r = await call(good); assert.equal(r.status, 200); assert.equal(geminiCalls.length, 2); assert.ok(!("store" in geminiCalls[1].body));

// 5. upstream errors
for (const [st, code] of [[429,"RATE_LIMIT"],[403,"KEY"],[404,"MODEL"],[500,"UPSTREAM"]]) {
  scenario = { gemini: () => new Response("{}", {status:st}) };
  r = await call(good); assert.equal(r.payload.code, code, "status " + st);
}
scenario = { gemini: () => new Response(JSON.stringify({promptFeedback:{blockReason:"SAFETY"}}), {status:200}) };
assert.equal((await call(good)).payload.code, "BLOCKED");
scenario = { gemini: () => new Response(JSON.stringify({candidates:[{finishReason:"MAX_TOKENS",content:{parts:[{text:'{"forms":[{'}]}}]}), {status:200}) };
r = await call(good); assert.equal(r.status, 422); assert.match(r.payload.error, /Split/);
scenario = { gemini: () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; } };
assert.equal((await call(good)).payload.code, "TIMEOUT");

// 6. per-school categories (migration 2026-10e) drive the enum, not a constant
const ROBOTICS = ["Autonomous Robotics", "Remote-Operated", "Innovation & Design"];
geminiCalls = [];
scenario = { cats: ROBOTICS, gemini: () => new Response(JSON.stringify({ candidates:[{ finishReason:"STOP",
  content:{ parts:[{ text: JSON.stringify({ forms: [{ ...formJson.forms[0],
    category: { value: "Autonomous Robotics", confidence: "high" } }] }) }] } }] }), { status:200 }) };
r = await call(good);
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.deepEqual(
  geminiCalls[0].body.generationConfig.responseSchema.properties.forms.items.properties.category.properties.value.enum,
  [...ROBOTICS, "Not sure yet", "None"], "a robotics fair's own categories must reach Gemini");
assert.match(geminiCalls[0].body.contents[0].parts[1].text, /Autonomous Robotics/, "prompt lists this school's categories");
assert.equal(r.payload.forms[0].cat.value, "Autonomous Robotics");

// A category this school does NOT have is rejected, not passed through
geminiCalls = [];
scenario = { cats: ROBOTICS, gemini: ok };
r = await call(good);
assert.equal(r.payload.forms[0].cat.value, "", "a category outside this school's list is blanked for the admin to pick");

// 7. categories table missing (migration not run) → built-in six, still works
geminiCalls = [];
scenario = { catsMissing: true, gemini: ok };
r = await call(good);
assert.equal(r.status, 200);
assert.deepEqual(
  geminiCalls[0].body.generationConfig.responseSchema.properties.forms.items.properties.category.properties.value.enum,
  [...BUILTIN_CATS, "Not sure yet", "None"], "falls back to the built-in list when the table is missing");
assert.equal(r.payload.forms[0].cat.value, "Engineering, Robotics & Technology");

console.log("scan-form: all", "tests passed");
