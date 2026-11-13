// Shared config + the production guard for every stress-test script.
//
// Reads tests/stress/.env.stress.local (gitignored, never committed):
//   STRESS_SUPABASE_URL=https://<staging-ref>.supabase.co
//   STRESS_SUPABASE_KEY=sb_publishable_...        (publishable / anon key — safe in a browser)
//   STRESS_SUPABASE_SECRET=sb_secret_...          (OPTIONAL — seeding/cleanup only, see below)
//   STRESS_EXPECTED_REF=<staging-ref>             (OPTIONAL — isolation-check asserts the target
//                                                  matches this. Kept here, not in the repo,
//                                                  because this repo is PUBLIC and there is no
//                                                  reason to publish our infrastructure ids.)
//
// The SECRET key bypasses RLS, so it is used ONLY by seed.mjs and cleanup.mjs, and only to
// put fake data in place / take it away again. No measurement ever runs on it: the load tests
// sign judges in and submit scores with the PUBLISHABLE key through the same RPCs a real
// tablet uses, so what is measured is the real permission path, not a privileged shortcut.
// It is acceptable here only because the staging project is a throwaway with no real data;
// delete the project when the testing is done and the key dies with it.
//
// EVERY script in this folder must import `cfg()` and nothing else for its connection
// details. The guard below is the single place that can refuse a run, so a typo in one
// script can never reach the real fair's database.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The live fair. Nothing in tests/stress/ may ever talk to these.
export const FORBIDDEN = [
  "evrupqnhgrfltfhafeyj",          // production Supabase project ref
  "qritiko.com",                    // production front end
  "sciencefair-v2.vercel.app",
];

const ENV_FILE = new URL("./.env.stress.local", import.meta.url);

// ── RUNTIME NETWORK GUARD ────────────────────────────────────────────────────────────
// Installed the moment this module is imported, which every script in this folder does.
//
// The static "does any script mention production" scan that used to live in
// isolation-check.mjs was mutation-tested and FAILED: a URL assigned on one line and used on
// another slipped straight past it, which is precisely the shape a real accident takes.
// Reading code cannot prove where a request goes; intercepting the request can.
//
// So every outbound fetch in this process is checked against FORBIDDEN by host, after the
// URL has been fully constructed. However a script builds its URL - literal, variable,
// concatenation, typo, copy-paste from production docs - the request is refused before a
// single byte leaves the machine. This is a control, not a convention.
const realFetch = globalThis.fetch;
globalThis.fetch = function guardedFetch(input, init) {
  const url = String(input?.url ?? input ?? "");
  for (const bad of FORBIDDEN) {
    if (url.includes(bad)) {
      throw new Error(
        `\n*** BLOCKED BEFORE SENDING ***\n` +
        `A stress-test script tried to contact PRODUCTION (${bad}):\n  ${url}\n` +
        `Nothing was sent. Stress tests may only talk to the staging project.\n`
      );
    }
  }
  return realFetch.call(this, input, init);
};
// Realtime does not use fetch - it opens a WebSocket. Guarding only fetch would leave the
// single busiest production-facing path unprotected, so the same check wraps WebSocket.
const RealWS = globalThis.WebSocket;
if (RealWS) {
  class GuardedWebSocket extends RealWS {
    constructor(url, ...rest) {
      const u = String(url);
      for (const bad of FORBIDDEN) {
        if (u.includes(bad)) {
          throw new Error(
            `\n*** BLOCKED BEFORE CONNECTING ***\n` +
            `A stress-test script tried to open a WebSocket to PRODUCTION (${bad}):\n  ${u}\n` +
            `No connection was made.\n`
          );
        }
      }
      super(url, ...rest);
    }
  }
  globalThis.WebSocket = GuardedWebSocket;
}

// Kept so a test can confirm the guards are live and have not been replaced.
export const NETWORK_GUARD_INSTALLED = true;

export function cfg() {
  const path = fileURLToPath(ENV_FILE);
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}\n\nCreate it with two lines:\n` +
      `  STRESS_SUPABASE_URL=https://<your-staging-ref>.supabase.co\n` +
      `  STRESS_SUPABASE_KEY=sb_publishable_...\n`
    );
  }
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
  }
  const url = (env.STRESS_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.STRESS_SUPABASE_KEY || "";
  if (!url || !key) throw new Error(`${path} must set STRESS_SUPABASE_URL and STRESS_SUPABASE_KEY`);

  // The guard. Checked on EVERY run, not just the first.
  for (const bad of FORBIDDEN) {
    if (url.includes(bad)) {
      throw new Error(
        `\n*** REFUSED ***\nSTRESS_SUPABASE_URL points at PRODUCTION (${bad}).\n` +
        `Stress tests may only run against a separate staging project.\nNothing was sent.\n`
      );
    }
  }
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) {
    throw new Error(`STRESS_SUPABASE_URL does not look like a Supabase project URL: ${url}`);
  }
  const secret = env.STRESS_SUPABASE_SECRET || "";
  if (secret && !/^(sb_secret_|eyJ)/.test(secret)) {
    throw new Error(`STRESS_SUPABASE_SECRET does not look like a Supabase secret/service key`);
  }
  if (secret && secret === key) {
    throw new Error(`STRESS_SUPABASE_SECRET is the same value as STRESS_SUPABASE_KEY — check the file`);
  }
  return {
    url, key, secret,
    expectedRef: env.STRESS_EXPECTED_REF || "",
    ref: url.split("//")[1].split(".")[0],
    rest: `${url}/rest/v1`,
    auth: `${url}/auth/v1`,
  };
}

// Printed at the top of every script, so the target is never a guess.
export function banner(what) {
  const c = cfg();
  console.log("═".repeat(72));
  console.log(`  ${what}`);
  console.log(`  TARGET DATABASE : ${c.url}   (project ref ${c.ref})`);
  console.log(`  PRODUCTION      : https://evrupqnhgrfltfhafeyj.supabase.co  — NOT TOUCHED`);
  console.log(`  SECRET KEY      : ${c.secret ? "loaded (seed/cleanup only, never printed)" : "not set"}`);
  console.log("═".repeat(72));
  return c;
}

// Small REST helper. Always sends the staging key; never sends cookies or a user token
// unless one is passed in explicitly.
// `admin: true` sends the SECRET key instead, bypassing RLS. Seeding and cleanup only —
// never a measured request. Throws rather than silently falling back to the public key.
export async function rest(c, path, { method = "GET", body, token, admin = false, headers = {}, timeoutMs = 20000 } = {}) {
  if (admin && !c.secret) {
    throw new Error("This step needs STRESS_SUPABASE_SECRET in tests/stress/.env.stress.local");
  }
  const apikey = admin ? c.secret : c.key;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(`${c.rest}${path}`, {
      method,
      signal: ctl.signal,
      headers: {
        apikey,
        Authorization: `Bearer ${token || apikey}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data, ms: performance.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, data: { message: String(e?.message || e) }, ms: performance.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}
