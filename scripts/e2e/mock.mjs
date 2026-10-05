// In-memory fake of Supabase (PostgREST + Auth + RPCs) and /api/scan-form for Playwright.
// Mirrors the RLS that matters: project_private is admin-only, anon can't write projects.
export const SID = "11111111-1111-1111-1111-111111111111";
export const ADMIN_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const D_ELEM = "d0000000-0000-0000-0000-000000000001";
const D_MID  = "d0000000-0000-0000-0000-000000000002";
const D_HIGH = "d0000000-0000-0000-0000-000000000003";
export const DEPTS = { D_ELEM, D_MID, D_HIGH };

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export const ADMIN_TOKEN = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
  sub: ADMIN_ID, role: "authenticated", aud: "authenticated", email: "admin@test.edu",
  exp: Math.floor(Date.now() / 1000) + 86400, iat: Math.floor(Date.now() / 1000), session_id: "s1",
})}.sig`;

export function freshStore() {
  const now = new Date().toISOString();
  return {
    schools: [{ id: SID, name: "Dishchii'bikoh Test", slug: "test", created_at: now }],
    school_admins: [{ school_id: SID, user_id: ADMIN_ID }],
    departments: [
      { id: D_ELEM, school_id: SID, name: "Elementary", max_judges: 5, ord: 0 },
      { id: D_MID,  school_id: SID, name: "Middle School", max_judges: 5, ord: 1 },
      { id: D_HIGH, school_id: SID, name: "High School", max_judges: 5, ord: 2 },
    ],
    projects: [{ id: "p_seed", school_id: SID, num: "001", title: "Existing Volcano Study", cat: "Earth & Environmental Science",
      grade: "6", locked: false, department_id: D_MID, room: "B12", description: "How lava cools", motivation: "", created_at: now }],
    // Legacy 2026-09 shape (array of strings) on purpose — normMembers must cope.
    project_private: [{ project_id: "p_seed", school_id: SID, advisor_name: "Ms. Lee", group_members: ["Ana Ruiz", "Ben Ortiz"] }],
    judges: [], scores: [], deliberation_notes: [], final_decisions: [], validations: [], score_backups: [],
    share_links: [], activity_log: [], it_logs: [],
    app_settings: [
      { school_id: SID, key: "locked", value: "false" },
      { school_id: SID, key: "deliberation_open", value: "false" },
      { school_id: SID, key: "results_finalized", value: "false" },
      { school_id: SID, key: "judge_transfer_allowances", value: "{}" },
    ],
    rubrics: [],
    registration_links: [{ id: "rl1", school_id: SID, token: "REG-TOKEN", active: true, expires_at: null, created_at: now }],
    registration_submissions: [],
  };
}

function matches(row, params) {
  for (const [k, raw] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    const v = row[k];
    const [op, ...rest] = raw.split(".");
    const val = rest.join(".");
    if (op === "eq" && String(v) !== val) return false;
    if (op === "neq" && String(v) === val) return false;
    if (op === "is" && val === "null" && v != null) return false;
    if (op === "in") {
      const list = val.replace(/^\(|\)$/g, "").split(",").map(s => s.replace(/^"|"$/g, ""));
      if (!list.includes(String(v))) return false;
    }
  }
  return true;
}

export function installMock(page, store, log) {
  const json = (route, status, body, headers = {}) =>
    route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", ...headers },
      body: body === undefined ? "" : JSON.stringify(body) });

  const user = { id: ADMIN_ID, aud: "authenticated", role: "authenticated", email: "admin@test.edu",
    app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString() };

  return page.route("https://mock.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (store.offline) return route.abort("internetdisconnected");   // simulate no network
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: {
      "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    const auth = req.headers()["authorization"] || "";
    const isAdmin = auth.includes(ADMIN_TOKEN);
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const path = url.pathname;
    log.push(`${method} ${path}${url.search} ${isAdmin ? "[admin]" : "[anon]"}`);

    // ── Auth ──
    if (path === "/auth/v1/token") {
      if (body?.email === "admin@test.edu" && body?.password === "correct-horse") {
        return json(route, 200, { access_token: ADMIN_TOKEN, token_type: "bearer", expires_in: 86400,
          expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "r1", user });
      }
      return json(route, 400, { error: "invalid_grant", error_description: "Invalid login credentials", msg: "Invalid login credentials" });
    }
    if (path === "/auth/v1/signup") {
      store.signupCalls = (store.signupCalls || 0) + 1;
      if (store.authUsers?.includes(body.email)) return json(route, 422, { code: "user_already_exists", msg: "User already registered" });
      (store.authUsers ||= []).push(body.email);
      const nu = { ...user, id: "f0000000-0000-0000-0000-00000000000" + store.signupCalls, email: body.email };
      store.lastSignupUserId = nu.id;
      // "confirm" = Supabase "Confirm email" ON → user but no session (the common production setup).
      if (store.signupMode === "confirm") return json(route, 200, nu);
      return json(route, 200, { access_token: ADMIN_TOKEN, token_type: "bearer", expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "r2", user: nu });
    }
    if (path === "/auth/v1/user") return isAdmin ? json(route, 200, user) : json(route, 401, { msg: "no" });
    if (path === "/auth/v1/logout") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });

    // ── RPC ──
    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.split("/").pop();
      if (fn === "school_invite_code") return isAdmin ? json(route, 200, "ABC123") : json(route, 400, { code: "P0001", message: "Not authorised" });
      if (fn === "verify_school_pin") return json(route, 200, body.p_pin === (store.pin || "4821"));
      if (fn === "registration_count") return json(route, 200, store.registration_submissions.length);
      if (fn === "register_judge") {
        if (body.p_invite_code !== "ABC123") return json(route, 400, { code: "P0001", message: "Invalid invite code." });
        const row = { id: "j_" + Math.random().toString(36).slice(2, 8), school_id: SID, alias: body.p_alias,
          department_id: body.p_department_id, joined_at: new Date().toISOString(),
          projects: store.projects.filter(p => p.department_id === body.p_department_id).map(p => p.id) };
        store.judges.push(row);
        return json(route, 200, row);
      }
      if (fn === "create_school") {
        store.createSchoolCalls = (store.createSchoolCalls || []).concat([body]);
        if (store.failCreateOnce) { store.failCreateOnce = false; return json(route, 400, { code: "P0001", message: "That school URL is already taken. Choose another." }); }
        if (!/^[0-9]{4,8}$/.test(body.p_admin_pin)) return json(route, 400, { code: "P0001", message: "Admin PIN must be 4–8 digits and not easy to guess (0000, 1111, 1234…)." });
        if (store.schools.some(x => x.slug === body.p_slug)) return json(route, 400, { code: "P0001", message: "That school URL is already taken. Choose another." });
        const id = "5c000000-0000-0000-0000-00000000000" + store.createSchoolCalls.length;
        store.schools.push({ id, name: body.p_name, slug: body.p_slug, created_at: new Date().toISOString() });
        store.school_admins.push({ school_id: id, user_id: body.p_user_id, role: "owner" });
        return json(route, 200, { id, name: body.p_name, slug: body.p_slug });
      }
      if (fn === "submit_registration") {
        const link = store.registration_links.find(l => l.token === body.p_token && l.active);
        if (!link) return json(route, 400, { code: "P0001", message: "This registration link is not active. Ask the organizer for a new link." });
        const f = body.p_form;
        if (!f.student_name || !f.is_original_work || !f.agrees_to_rules)
          return json(route, 400, { code: "P0001", message: "Please fill in all required fields and check both consent boxes." });
        const n = store.registration_submissions.length + 1;
        const pnum = String(Math.max(0, ...store.projects.map(p => parseInt(p.num) || 0)) + 1).padStart(3, "0");
        const pid = "p_reg_" + n;
        store.projects.push({ id: pid, school_id: SID, num: pnum, title: f.project_title, cat: f.category, grade: f.grade_level,
          locked: false, department_id: null, room: "", description: f.description || "", motivation: "", created_at: new Date().toISOString() });
        store.project_private.push({ project_id: pid, school_id: SID, advisor_name: f.advisor_name,
          group_members: [{ name: f.student_name, grade: f.grade_level }, ...(f.group_members || []).map(x => ({ name: x, grade: "" }))] });
        const reg = `${f.reg_prefix}-${String(n).padStart(3, "0")}`;
        store.registration_submissions.push({ id: "rs" + n, school_id: SID, project_id: pid, reg_number: reg, ...f });
        store.lastRegForm = f;
        return json(route, 200, { reg_number: reg, project_id: pid, project_num: pnum });
      }
      return json(route, 200, null);
    }

    // ── Tables ──
    const table = path.replace("/rest/v1/", "");
    if (!(table in store)) { store[table] = []; }
    const rows = store[table];
    const params = [...url.searchParams.entries()];
    const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    const prefer = req.headers()["prefer"] || "";

    // RLS that matters for these tests.
    if (table === "project_private" && !isAdmin)
      return json(route, 401, { code: "42501", message: "permission denied for table project_private" });
    if (["projects", "registration_submissions", "judges"].includes(table) && method !== "GET" && !isAdmin)
      return json(route, 401, { code: "42501", message: `new row violates row-level security policy for table "${table}"` });

    if (method === "GET" || method === "HEAD") {
      let out = rows.filter(r => matches(r, params));
      if (single) {
        if (out.length !== 1) return json(route, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
        return json(route, 200, out[0]);
      }
      return json(route, 200, out, { "content-range": `0-${Math.max(out.length - 1, 0)}/${out.length}` });
    }
    if (method === "POST") {
      const items = Array.isArray(body) ? body : [body];
      // PostgREST upserts on the PRIMARY KEY when on_conflict is not given.
      const PK = { app_settings: "school_id,key", validations: "school_id,judge_id", project_private: "project_id,school_id" };
      const conflict = url.searchParams.get("on_conflict") || (prefer.includes("merge-duplicates") ? PK[table] : null);
      const out = [];
      for (const it of items) {
        if (table === "project_private" && !store.projects.some(p => p.id === it.project_id))
          return json(route, 409, { code: "23503", message: "violates foreign key constraint" });
        const keys = conflict ? conflict.split(",") : null;
        const existing = keys && rows.find(r => keys.every(k => String(r[k]) === String(it[k])));
        if (existing && prefer.includes("merge-duplicates")) { Object.assign(existing, it); out.push(existing); }
        else { const row = { id: it.id ?? "row_" + Math.random().toString(36).slice(2, 8), created_at: new Date().toISOString(), ...it }; rows.push(row); out.push(row); }
      }
      if (prefer.includes("return=representation")) return json(route, 201, single ? out[0] : out);
      return route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" } });
    }
    if (method === "PATCH" && table === "rubrics" && store.failRubricSave)
      return json(route, 401, { code: "42501", message: "JWT expired" });
    if (method === "PATCH") {
      const out = rows.filter(r => matches(r, params));
      out.forEach(r => Object.assign(r, body));
      if (prefer.includes("return=representation")) return json(route, 200, single ? out[0] : out);
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    }
    if (method === "DELETE") {
      const gone = rows.filter(r => matches(r, params));
      const keep = rows.filter(r => !matches(r, params));
      const removed = rows.length - keep.length;
      store[table] = keep;
      if (table === "projects") store.project_private = store.project_private.filter(x => store.projects.some(p => p.id === x.project_id));
      log.push(`  deleted ${removed} from ${table}`);
      if (prefer.includes("return=representation")) return json(route, 200, gone);
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    }
    return json(route, 405, { message: "unsupported" });
  });
}

// ── /api/scan-form fake. Scenario = marker text inside the uploaded (fake) PDF. ──
const T = (value, confidence = "high") => ({ value, confidence });
const form = (o = {}) => ({
  isForm: true, title: T("Modeling Adaptive Surfaces"), advisor_name: T("Mr. Agan"), room: T("T25"),
  description: T("Build a surface that changes with light"), motivation: T("We like robots"),
  department_id: { value: D_MID, confidence: "high", raw: "Middle School" },
  cat: { value: "Engineering, Robotics & Technology", confidence: "high", notSure: false },
  workMode: "In groups of three",
  students: [
    { name: T("Amos Lope"), grade: T("8") }, { name: T("Tommy Greyeyes"), grade: T("8") }, { name: T("Noah Jones"), grade: T("7") },
  ],
  notes: "", ...o,
});
export const SCENARIOS = {
  good: () => ({ status: 200, body: { forms: [form()], model: "mock" } }),
  messy: () => ({ status: 200, body: { forms: [form({
    title: T("Plant grwth in sa1t water", "low"), room: T("", "unreadable"),
    department_id: { value: "", confidence: "low", raw: "Jr High" },
    cat: { value: "", confidence: "low", notSure: true },
    students: [{ name: T("Kai Yazz?e", "low"), grade: T("8", "high") }, { name: T("Lena Begay"), grade: T("", "unreadable") }],
    notes: "Two category boxes look ticked; title partly crossed out.",
  })], model: "mock" } }),
  multi: () => ({ status: 200, body: { forms: [
    form({ title: T("Solar Oven Efficiency"), students: [{ name: T("Rosa Tso"), grade: T("4") }], workMode: "Individually",
      department_id: { value: D_ELEM, confidence: "high", raw: "Elementary" }, cat: { value: "Energy, Sustainability & Design", confidence: "high", notSure: false } }),
    form({ title: T("Bridge Load Testing"), students: [{ name: T("Eli Watchman"), grade: T("11") }, { name: T("Mia Nez"), grade: T("12") }],
      workMode: "In pairs", department_id: { value: D_HIGH, confidence: "high", raw: "High School" } }),
  ], model: "mock" } }),
  dup: () => ({ status: 200, body: { forms: [form({ title: T("Existing Volcano Study"),
    students: [{ name: T("Ana Ruiz"), grade: T("6") }, { name: T("Ben Ortiz"), grade: T("6") }], workMode: "In pairs" })], model: "mock" } }),
  notform: () => ({ status: 200, body: { forms: [form({ isForm: false, title: T(""), students: [], advisor_name: T(""), room: T(""),
    description: T(""), motivation: T(""), department_id: { value: "", confidence: "high", raw: "None" },
    cat: { value: "", confidence: "high", notSure: false }, workMode: "" })], model: "mock" } }),
  html: () => ({ status: 200, body: { forms: [form({ title: T(`<img src=x onerror="window.__xss=1">Danger`),
    students: [{ name: T("<b>Bold</b> Kid"), grade: T("9") }], department_id: { value: D_HIGH, confidence: "high", raw: "High School" } })], model: "mock" } }),
  ratelimit: (n) => n === 1 ? { status: 429, body: { error: "AI rate limit reached. Wait a minute and retry.", code: "RATE_LIMIT" } } : SCENARIOS.good(),
  notconfigured: () => ({ status: 503, body: { error: "Form scanning is not set up yet (GEMINI_API_KEY is missing in Vercel).", code: "NOT_CONFIGURED" } }),
  image: () => ({ status: 200, body: { forms: [form({ title: T("From A Photo") })], model: "mock" } }),
};

export function installScanMock(page, calls) {
  const seen = {};
  return page.route("**/api/scan-form", async (route) => {
    const req = route.request();
    const body = JSON.parse(req.postData() || "{}");
    const authed = (req.headers()["authorization"] || "").includes(ADMIN_TOKEN);
    let scenario = "image";
    if (body.mimeType === "application/pdf") scenario = (Buffer.from(body.data, "base64").toString().match(/SCENARIO:(\w+)/) || [])[1] || "good";
    seen[scenario] = (seen[scenario] || 0) + 1;
    calls.push({ scenario, mimeType: body.mimeType, authed, schoolId: body.schoolId, bytes: body.data?.length || 0 });
    if (!authed) return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Sign in", code: "AUTH" }) });
    const r = SCENARIOS[scenario](seen[scenario]);
    await new Promise(res => setTimeout(res, 150 + Math.random() * 300)); // realistic latency, shuffles completion order
    return route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
  });
}
