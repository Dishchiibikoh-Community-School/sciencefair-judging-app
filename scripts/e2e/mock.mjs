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
      { id: D_ELEM, school_id: SID, name: "Elementary", code: "Elem", max_judges: 5, ord: 0 },
      { id: D_MID,  school_id: SID, name: "Middle School", code: "JHS", max_judges: 5, ord: 1 },
      { id: D_HIGH, school_id: SID, name: "High School", code: "SHS", max_judges: 5, ord: 2 },
    ],
    // Per-school project categories (migration 2026-10e), seeded as the migration does.
    categories: [
      { id: "c1", school_id: SID, name: "Life Science",                       code: "LS",  ord: 0 },
      { id: "c2", school_id: SID, name: "Earth & Environmental Science",      code: "EES", ord: 1 },
      { id: "c3", school_id: SID, name: "Chemistry & Material Science",       code: "CMS", ord: 2 },
      { id: "c4", school_id: SID, name: "Physics, Math & Astronomy",          code: "PMA", ord: 3 },
      { id: "c5", school_id: SID, name: "Engineering, Robotics & Technology", code: "ERT", ord: 4 },
      { id: "c6", school_id: SID, name: "Energy, Sustainability & Design",    code: "ESD", ord: 5 },
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
    // 2026-10l branding: the table, and the Storage bucket as { path: { type, bytes } }.
    school_branding: [], storage: {}, storageLog: [],
  };
}

// Pull the file out of a supabase-js storage upload (multipart: cacheControl + the file part).
function multipartFile(buf, ctype) {
  const m = /boundary=("?)([^";]+)\1/.exec(ctype || "");
  if (!m) return { type: ctype, bytes: buf };
  const b = Buffer.from("--" + m[2]);
  let pos = buf.indexOf(b);
  while (pos !== -1) {
    const start = pos + b.length, next = buf.indexOf(b, start);
    if (next === -1) break;
    const part = buf.subarray(start, next), sep = part.indexOf("\r\n\r\n");
    const head = sep === -1 ? "" : part.subarray(0, sep).toString();
    const t = /content-type:\s*([^\r\n]+)/i.exec(head);
    if (t && /filename=/i.test(head)) return { type: t[1].trim(), bytes: part.subarray(sep + 4, part.length - 2) };
    pos = next;
  }
  return null;
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
  // ── 2026-10k roster / panels, mirrored from the SQL ──
  store.judge_roster = store.judge_roster || [];
  // ── 2026-10l branding: Storage bucket "school-branding" (path → { type, bytes }) ──
  store.storage = store.storage || {};
  store.storageLog = store.storageLog || [];
  store.school_branding = store.school_branding || [];
  store.project_judges = store.project_judges || [];
  const roster = () => store.judge_roster;
  const byOrd = () => [...store.departments].sort((a, b) => a.ord - b.ord);
  const rosterDepts = (n) => byOrd().filter(d => roster().some(r => r.judge_number === n && r.department_id === d.id));
  const seatsOf = (deptId) => roster().filter(r => r.department_id === deptId).map(r => r.judge_number).sort((a, b) => a - b);
  const seatScored = (pid, n) => store.scores.some(sc => sc.project_id === pid && store.judges.some(j => j.id === sc.judge_id && j.alias === `Judge${n}`));
  const judgeProjects = (n, deptIds) => store.projects.filter(p => deptIds.includes(p.department_id)).filter(p => {
    const d = store.departments.find(x => x.id === p.department_id);
    return !d?.judges_per_project || store.project_judges.some(x => x.project_id === p.id && x.judge_number === n);
  }).map(p => p.id);
  const shortOf = (d) => store.projects.filter(p => p.department_id === d.id)
    .filter(p => store.project_judges.filter(x => x.project_id === p.id).length < d.judges_per_project).length;
  const fillPanels = (deptId, seats, onlyEmpty = false) => {
    const d = store.departments.find(x => x.id === deptId);
    if (!d?.judges_per_project) return;
    const inDept = (pid) => store.projects.find(pp => pp.id === pid)?.department_id === deptId;
    store.project_judges = store.project_judges.filter(x => !inDept(x.project_id) || seats.includes(x.judge_number) || seatScored(x.project_id, x.judge_number));
    const load = (n) => store.project_judges.filter(x => x.judge_number === n && inDept(x.project_id)).length;
    store.projects.filter(p => p.department_id === deptId).sort((a, b) => String(a.num).localeCompare(String(b.num))).forEach((p, i) => {
      if (onlyEmpty && store.project_judges.some(x => x.project_id === p.id)) return;
      while (store.project_judges.filter(x => x.project_id === p.id).length < d.judges_per_project) {
        const pick = seats.filter(n => !store.project_judges.some(x => x.project_id === p.id && x.judge_number === n))
          .sort((a, b) => load(a) - load(b) || ((seats.indexOf(a) - i) % seats.length + seats.length) % seats.length - ((seats.indexOf(b) - i) % seats.length + seats.length) % seats.length)[0];
        if (pick == null) break;
        store.project_judges.push({ school_id: SID, project_id: p.id, judge_number: pick });
      }
    });
  };
  const resync = () => {
    if (!roster().length) return;
    for (const j of store.judges) {
      const n = parseInt(j.alias.slice(5)); const ids = rosterDepts(n).map(d => d.id);
      if (!ids.length) continue;
      j.department_ids = ids; if (!ids.includes(j.department_id)) j.department_id = ids[0];
      j.projects = judgeProjects(n, ids);
    }
  };

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
    const path = url.pathname;

    // ── Storage (before the JSON body parse: uploads are multipart) ──
    // Mirrors the 2026-10l policies: an admin may add / delete files only in their own school's
    // folder with app-generated names; files are public to read by URL; nobody overwrites.
    const BR = "/storage/v1/object/";
    if (path.startsWith(BR)) {
      const cors = { "access-control-allow-origin": "*" };
      const nameOk = (n) => new RegExp(`^${SID}/(logo|poster)-[A-Za-z0-9_-]{8,64}\.(webp|png|jpg)$`).test(n);
      if (method === "GET" && path.startsWith(BR + "public/school-branding/")) {
        const f = store.storage[decodeURIComponent(path.slice((BR + "public/school-branding/").length))];
        if (!f) return route.fulfill({ status: 400, contentType: "application/json", headers: cors, body: JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found" }) });
        return route.fulfill({ status: 200, contentType: f.type, headers: { ...cors, "cache-control": "max-age=31536000" }, body: f.bytes });
      }
      if (method === "POST" && path.startsWith(BR + "school-branding/")) {
        const name = decodeURIComponent(path.slice((BR + "school-branding/").length));
        const file = multipartFile(req.postDataBuffer(), req.headers()["content-type"]);
        store.storageLog.push({ op: "upload", name, type: file?.type, size: file?.bytes?.length, admin: isAdmin, upsert: req.headers()["x-upsert"] });
        if (store.failStorage) return json(route, 500, { statusCode: "500", error: "internal", message: "simulated storage outage" });
        if (!isAdmin || !nameOk(name)) return json(route, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
        if (!file || !["image/webp", "image/png", "image/jpeg"].includes(file.type)) return json(route, 400, { statusCode: "415", error: "invalid_mime_type", message: `mime type ${file?.type} is not supported` });
        if (file.bytes.length > 2097152) return json(route, 400, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
        if (store.storage[name]) return json(route, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
        store.storage[name] = { type: file.type, bytes: Buffer.from(file.bytes) };
        return json(route, 200, { Key: `school-branding/${name}`, Id: "obj_" + Object.keys(store.storage).length });
      }
      if (method === "DELETE" && path === BR + "school-branding") {
        const names = JSON.parse(req.postData() || "{}").prefixes || [];
        store.storageLog.push({ op: "remove", names, admin: isAdmin });
        if (store.failStorageDelete) return json(route, 500, { statusCode: "500", error: "internal", message: "simulated storage outage" });
        const gone = isAdmin ? names.filter(n => nameOk(n) && store.storage[n]) : [];   // RLS: others match 0 rows
        for (const n of gone) delete store.storage[n];
        return json(route, 200, gone.map(name => ({ name, bucket_id: "school-branding" })));
      }
      return json(route, 400, { statusCode: "400", error: "unsupported", message: `mock storage: ${method} ${path}` });
    }
    const body = req.postData() ? JSON.parse(req.postData()) : null;
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
      if (fn === "set_school_branding") {
        const { p_school_id: sid, p_kind: kind, p_path: bpath, p_alt } = body;
        const err = (message) => json(route, 400, { code: "P0001", message });
        if (!isAdmin || sid !== SID) return err("Not authorised");
        if (store.failBrandingRpc) return json(route, 503, { code: "PGRST000", message: "simulated database outage" });
        if (!["logo", "poster", "poster_alt"].includes(kind)) return err("Unknown branding item.");
        const alt = String(p_alt ?? "").trim();
        if (kind !== "poster_alt" && bpath != null) {
          if (!new RegExp(`^${sid}/${kind}-[A-Za-z0-9_-]{8,64}\.(webp|png|jpg)$`).test(bpath)) return err("That image does not belong to this school.");
          if (!store.storage[bpath]) return err("The image was not uploaded. Please try again.");
        }
        if (kind === "poster" && bpath != null && alt.length < 3) return err("Describe the poster in a few words (for people using screen readers).");
        if (alt.length > 250) return err("The poster description is too long (250 characters at most).");
        let row = store.school_branding.find(r => r.school_id === sid);
        if (!row) { row = { school_id: sid, logo_path: null, poster_path: null, poster_alt: "" }; store.school_branding.push(row); }
        let old = null;
        if (kind === "logo") { old = row.logo_path; row.logo_path = bpath; }
        else if (kind === "poster") { old = row.poster_path; row.poster_path = bpath; row.poster_alt = bpath == null ? "" : alt; }
        else {
          if (!row.poster_path) return err("Upload a poster first.");
          if (alt.length < 3) return err("Describe the poster in a few words (for people using screen readers).");
          row.poster_alt = alt;
        }
        row.updated_at = new Date().toISOString();
        return json(route, 200, { ...row, old_path: old !== bpath ? old : null });
      }
      if (fn === "school_invite_code") return isAdmin ? json(route, 200, "ABC123") : json(route, 400, { code: "P0001", message: "Not authorised" });
      if (fn === "verify_school_pin") return json(route, 200, body.p_pin === (store.pin || "4821"));
      if (fn === "registration_count") return json(route, 200, store.registration_submissions.length);
      if (fn === "register_judge") {
        // 2026-10m: a wrong code is a 200 RESULT carrying `error`, not a 400 — raising would
        // roll back the lockout counter written in the same transaction. Everything else
        // still rejects with a P0001 error, so both paths stay covered.
        if (body.p_invite_code !== "ABC123") return json(route, 200, { error: "Invalid invite code" });
        // Mirrors migrations 2026-10g/10h: school-wide numbering when departments carry judge
        // numbers (unless the school opted back into per-department numbering); a number may
        // fall in several overlapping ranges → the judge covers all of those departments.
        const school = (store.departments.some(d => d.judge_from != null) || roster().length > 0)
          && !store.app_settings.some(r => r.key === "judge_numbering" && r.value === "department");
        let deptIds = [body.p_department_id];
        if (school) {
          const n = /^Judge\d+$/.test(body.p_alias) ? parseInt(body.p_alias.slice(5)) : null;
          const ds = roster().length ? rosterDepts(n) : [...store.departments].sort((a, b) => a.ord - b.ord)
            .filter(x => x.judge_from != null && n >= x.judge_from && n <= x.judge_to);
          if (!ds.length) return json(route, 400, { code: "P0001", message: `Judge ${n} is not on this school's judge list. Check your number with the coordinator.` });
          if (store.judges.some(j => j.alias === body.p_alias))
            return json(route, 400, { code: "P0001", message: `${body.p_alias} is already signed in. Ask the admin to approve a device transfer.` });
          deptIds = ds.map(d => d.id);
        }
        const num = /^Judge\d+$/.test(body.p_alias) ? parseInt(body.p_alias.slice(5)) : null;
        const row = { id: "j_" + Math.random().toString(36).slice(2, 8), school_id: SID, alias: body.p_alias,
          department_id: deptIds[0], department_ids: deptIds, joined_at: new Date().toISOString(),
          projects: school && roster().length ? judgeProjects(num, deptIds)
            : store.projects.filter(p => deptIds.includes(p.department_id)).map(p => p.id) };
        store.judges.push(row);
        return json(route, 200, row);
      }
      if (fn === "set_judge_roster") {
        if (!isAdmin) return json(route, 400, { code: "P0001", message: "Not authorised" });
        const max = parseInt(store.app_settings.find(r => r.key === "judge_max")?.value || "15", 10);
        const next = [];
        for (const e of body.p_roster) for (const d of e.department_ids || []) next.push({ school_id: SID, judge_number: e.number, department_id: d });
        const over = next.find(r => r.judge_number > max);
        if (over) return json(route, 400, { code: "P0001", message: `Judge ${over.judge_number} is outside 1–${max} (the maximum). Raise the maximum (up to 90) first.` });
        for (const j of store.judges) {
          const n = parseInt(j.alias.slice(5));
          const lost = (j.department_ids?.length ? j.department_ids : [j.department_id])
            .find(d => !next.some(r => r.judge_number === n && r.department_id === d));
          if (lost) { const dn = store.departments.find(d => d.id === lost)?.name;
            return json(route, 400, { code: "P0001", message: `${j.alias} is signed in to ${dn} and would lose it. Remove that judge on the Judges tab first, or keep them ticked for ${dn}.` }); }
        }
        store.judge_roster = next;
        for (const d of store.departments) {
          const ns = next.filter(r => r.department_id === d.id).map(r => r.judge_number);
          d.judge_from = ns.length ? Math.min(...ns) : null; d.judge_to = ns.length ? Math.max(...ns) : null;
          if (ns.length) d.max_judges = ns.length;
          if (d.judges_per_project) fillPanels(d.id, seatsOf(d.id));
        }
        resync();
        return json(route, 200, null);
      }
      if (fn === "set_judges_per_project") {
        if (!isAdmin) return json(route, 400, { code: "P0001", message: "Not authorised" });
        const d = store.departments.find(x => x.id === body.p_department_id);
        if (store.scores.some(sc => store.projects.some(pp => pp.id === sc.project_id && pp.department_id === d.id)))
          return json(route, 400, { code: "P0001", message: `${d.name} already has scores. Changing how it is judged now would make those scores count differently.` });
        d.judges_per_project = body.p_n;
        if (body.p_n == null) {
          store.project_judges = store.project_judges.filter(x => store.projects.find(pp => pp.id === x.project_id)?.department_id !== d.id);
          resync(); return json(route, 200, { judges_per_project: null });
        }
        store.project_judges = store.project_judges.filter(x => store.projects.find(pp => pp.id === x.project_id)?.department_id !== d.id || seatScored(x.project_id, x.judge_number));
        fillPanels(d.id, seatsOf(d.id)); resync();
        return json(route, 200, { judges_per_project: body.p_n, short: shortOf(d) });
      }
      if (fn === "assign_panels") {
        if (!isAdmin) return json(route, 400, { code: "P0001", message: "Not authorised" });
        const d = store.departments.find(x => x.id === body.p_department_id);
        let seats = seatsOf(d.id);
        if (body.p_mode === "rebalance") {
          seats = seats.filter(n => store.judges.some(j => j.alias === `Judge${n}`));
          if (!seats.length) return json(route, 400, { code: "P0001", message: "No judges have signed in to this department yet — nothing to rebalance onto." });
        } else if (body.p_mode === "rebuild") {
          store.project_judges = store.project_judges.filter(x => store.projects.find(pp => pp.id === x.project_id)?.department_id !== d.id || seatScored(x.project_id, x.judge_number));
        }
        fillPanels(d.id, seats); resync();
        return json(route, 200, { judges_per_project: d.judges_per_project, seats: seats.length, short: shortOf(d) });
      }
      if (fn === "sync_judge_projects") {
        if (!isAdmin) return json(route, 400, { code: "P0001", message: "Not authorised" });
        for (const d of store.departments) if (d.judges_per_project && (body.p_department_ids || []).includes(d.id)) fillPanels(d.id, seatsOf(d.id), true);
        resync();
        return json(route, 200, null);
      }
      if (fn === "set_default_rubric") {
        // Mirrors migration 2026-10j (the score guard is covered by the DB suite).
        if (!isAdmin) return json(route, 400, { code: "P0001", message: "Not authorised" });
        if (!store.rubrics.some(r => r.id === body.p_rubric_id)) return json(route, 400, { code: "P0001", message: "That rubric does not belong to this school." });
        store.rubrics.forEach(r => { r.is_active = r.id === body.p_rubric_id; });
        return json(route, 200, null);
      }
      if (fn === "set_judge_max") {
        if (!isAdmin) return json(route, 400, { code: "P0001", message: "Not authorised" });
        const n = body.p_max;
        if (!(n >= 1 && n <= 90)) return json(route, 400, { code: "P0001", message: "The maximum must be between 1 and 90." });
        const top = Math.max(0, ...store.departments.map(d => d.judge_to || 0));
        if (n < top) return json(route, 400, { code: "P0001", message: `Judge numbers already go up to ${top}. Lower the department numbers first, then the maximum.` });
        const row = store.app_settings.find(r => r.key === "judge_max");
        if (row) row.value = String(n); else store.app_settings.push({ school_id: SID, key: "judge_max", value: String(n) });
        return json(route, 200, null);
      }
      if (fn === "set_judge_numbers") {
        if (!isAdmin) return json(route, 400, { code: "P0001", message: "Not authorised" });
        const next = new Map(store.departments.map(d => [d.id, { ...d }]));
        for (const r of body.p_ranges) Object.assign(next.get(r.department_id), { judge_from: r.from, judge_to: r.to });
        // 2026-10i: nothing past the school's maximum (default 15).
        const max = parseInt(store.app_settings.find(r => r.key === "judge_max")?.value || "15", 10);
        const past = [...next.values()].find(d => d.judge_to != null && d.judge_to > max);
        if (past) return json(route, 400, { code: "P0001", message: `${past.name} would use judge numbers up to ${past.judge_to}, but the maximum is ${max}. Raise the maximum (up to 90) first.` });
        const sorted = [...next.values()].sort((a, b) => a.ord - b.ord);
        const newIds = (alias) => { const n = parseInt(alias.slice(5));
          return sorted.filter(d => d.judge_from != null && n >= d.judge_from && n <= d.judge_to).map(d => d.id); };
        // 2026-10h: overlaps are fine; a signed-in judge may gain departments, never lose one.
        for (const j of store.judges) {
          const old = j.department_ids?.length ? j.department_ids : [j.department_id];
          const lost = old.find(id => !newIds(j.alias).includes(id));
          if (lost) { const d = next.get(lost);
            return json(route, 400, { code: "P0001", message: `${j.alias} is signed in to ${d.name} and would lose it. Remove that judge on the Judges tab first, or keep their number in ${d.name}'s range.` }); }
        }
        store.departments.forEach(d => { const n = next.get(d.id); d.judge_from = n.judge_from; d.judge_to = n.judge_to;
          if (n.judge_from != null) d.max_judges = n.judge_to - n.judge_from + 1; });
        for (const j of store.judges) {
          const ids = newIds(j.alias);
          if (!ids.length) continue;
          j.department_ids = ids;
          if (!ids.includes(j.department_id)) j.department_id = ids[0];
          j.projects = store.projects.filter(p => ids.includes(p.department_id)).map(p => p.id);
        }
        return json(route, 200, null);
      }
      if (fn === "remove_judge") {
        if (!isAdmin) return json(route, 400, { code: "P0001", message: "Not authorised" });
        const j = store.judges.find(x => x.id === body.p_judge_id);
        if (!j) return json(route, 400, { code: "P0001", message: "That judge no longer exists." });
        const n = store.scores.filter(s => s.judge_id === j.id).length;
        for (const t of ["scores", "validations", "deliberation_notes"]) store[t] = (store[t] || []).filter(r => r.judge_id !== j.id);
        store.judges = store.judges.filter(x => x.id !== j.id);
        return json(route, 200, { alias: j.alias, scores: n });
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
    if (table === "school_branding" && store.brandingTableMissing)   // migration 2026-10l not run
      return json(route, 404, { code: "PGRST205", message: "Could not find the table 'public.school_branding' in the schema cache" });
    if (table === "school_branding" && method !== "GET" && method !== "HEAD")
      return json(route, 401, { code: "42501", message: "permission denied for table school_branding" });
    if (table === "judge_labels" && !isAdmin)
      return json(route, 401, { code: "42501", message: "permission denied for table judge_labels" });
    if (table === "project_private" && !isAdmin)
      return json(route, 401, { code: "42501", message: "permission denied for table project_private" });
    if (["projects", "registration_submissions", "judges"].includes(table) && method !== "GET" && !isAdmin)
      return json(route, 401, { code: "42501", message: `new row violates row-level security policy for table "${table}"` });

    // Simulated server failure: every write to a listed table fails (tests the "NOT saved" paths).
    if (method !== "GET" && method !== "HEAD" && (store.failWrites || []).includes(table))
      return json(route, 503, { code: "PGRST000", message: "simulated database outage" });

    if (method === "GET" || method === "HEAD") {
      let out = rows.filter(r => matches(r, params));
      if (single) {
        if (out.length !== 1) return json(route, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
        return json(route, 200, out[0]);
      }
      return json(route, 200, out, { "content-range": `0-${Math.max(out.length - 1, 0)}/${out.length}` });
    }
    // 2026-10j: at most one default rubric per school (unique partial index).
    if (method === "POST" && table === "rubrics" && (Array.isArray(body) ? body : [body]).some(r => r.is_active)
        && rows.some(r => r.is_active))
      return json(route, 409, { code: "23505", message: 'duplicate key value violates unique constraint "rubrics_one_default_per_school"' });
    // 2026-10n: a project number is unique within a school (unique index). Fixtures pushed
    // straight into the store bypass this, like rows that predate the migration.
    if (table === "projects" && (method === "POST" || method === "PATCH")) {
      const targets = method === "PATCH" ? rows.filter(r => matches(r, params)) : [];
      const items = method === "PATCH" ? targets.map(t => ({ ...t, ...body })) : (Array.isArray(body) ? body : [body]);
      const touchesNum = method === "POST" || (body && body.num !== undefined);
      const clash = touchesNum && items.some(it => rows.some(r =>
        r.school_id === it.school_id && String(r.num) === String(it.num) && r.id !== it.id));
      if (clash) {
        log.push(`  refused duplicate project number ${items[0]?.num}`);
        return json(route, 409, { code: "23505", message: 'duplicate key value violates unique constraint "projects_school_num_uniq"' });
      }
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
    // 2026-10j guards: the default rubric and a rubric a department uses cannot be deleted.
    if (method === "DELETE" && table === "rubrics") {
      const target = rows.find(r => matches(r, params));
      if (target?.is_active) return json(route, 400, { code: "P0001", message: `"${target.name}" is the default rubric. Make another rubric the default first.` });
      const user = target && store.departments.find(d => d.rubric_id === target.id);
      if (user) return json(route, 400, { code: "P0001", message: `"${target.name}" is used by ${user.name}. Give that department another rubric first.` });
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
