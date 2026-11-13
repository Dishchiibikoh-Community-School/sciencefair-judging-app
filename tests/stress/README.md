# Stress tests — staging only

Pre-event load and reliability testing for the 2026-12-11 fair. Everything here runs against a
**separate, throwaway Supabase project**. Nothing in this folder may touch the live fair.

---

## 1. Isolation — how the two databases are kept apart

This is the part to read first. Mixing staging and production data would be worse than any
performance problem this suite could find.

| | |
|---|---|
| Production — **never touched** | `https://evrupqnhgrfltfhafeyj.supabase.co` · `https://qritiko.com` |
| Staging — everything here | the project named in `.env.stress.local` (`<staging-ref>`) |

Five independent controls, each verifiable:

1. **One source of connection details.** `env.mjs` is the only place a URL or key is read.
   Every other script imports `cfg()` / `banner()` from it, so a typo in one script cannot
   reach the live database.
2. **A config guard.** `cfg()` refuses to return if the URL contains any string in
   `FORBIDDEN` (the production project ref and its domains). Checked on *every* run.
3. **A runtime network guard.** `env.mjs` wraps `globalThis.fetch` **and** `WebSocket` the
   moment it is imported, and refuses any request whose fully-formed URL mentions production
   — before a byte leaves the machine.
   *Why both:* a static scan of the source was tried first, mutation-tested, and **failed** —
   a URL built on one line and used on the next went straight past it. Reading code cannot
   prove where a request goes; intercepting the request can.
4. **No production credentials on this machine.** There is no `.env` here, only
   `.env.example` with placeholders. A dev server started by accident cannot reach
   production; it would log "Missing env vars" and talk to nothing.
5. **Credentials are never written to disk by the test harness.** `devserver.mjs` and
   `previewserver.mjs` inject the staging URL and key as in-process environment variables.
   No `.env` / `.env.local` file is created, so nothing is left behind that could point a
   later dev server or build at the wrong project.

Run the proof at any time — it is read-only and takes a few seconds:

```
node tests/stress/isolation-check.mjs
```

It verifies all of the above, **actively attempts three production connections and requires
each to be blocked**, confirms staging still works, and confirms staging holds only the fake
fair with no real names in it.

**No app code is changed by anything in this folder.** The only files touched outside
`tests/stress/` are the build outputs in `dist/`, produced by `previewserver.mjs`.

### The secret key

`.env.stress.local` holds a `STRESS_SUPABASE_SECRET`. It bypasses RLS and is used **only** by
`seed.mjs`, `reset.mjs` and `cleanup.mjs`, to put fake data in place and take it away again,
and by the tests to count rows when verifying integrity. No measurement is taken through it:
every judge action in every test goes through the **publishable** key and the same RPCs a real
tablet calls, so what is measured is the real permission path.

It is acceptable here only because the staging project is a throwaway containing nothing real.
**When the testing is finished, delete the staging project** — the key dies with it.

---

## 2. Files

| File | What it does |
|---|---|
| `env.mjs` | Connection details, production guard, runtime fetch/WebSocket guards, REST helper with timing |
| `isolation-check.mjs` | **Read-only.** Proves staging and production cannot mix. Run before and after a session |
| `preflight.mjs` | **Read-only.** Which database, is the schema applied, is there data, can seeding run |
| `build-schema-bundle.mjs` | Reads `../../supabase/*.sql` → `out/staging-schema.sql` (+ parts). Connects to nothing |
| `fixtures.mjs` | Extracts the **real** rubric presets and categories from `src/ScienceFairJudging.jsx` |
| `seed.mjs` | Creates the fake fair (63 projects, 30 judges, 12-round schedule) |
| `reset.mjs` | Clears judge sessions and scores between tests; keeps the fake fair |
| `cleanup.mjs` | Removes the fake fair entirely, then verifies 0 rows survive across 20 tables |
| `smoke.mjs` | One fake judge signs in and scores, through the public key — proves the harness works |
| `loadlib.mjs` | Sign-in, scoring waves, statistics, integrity verification |
| `browserlib.mjs` | Real-browser helpers: sign in, open a project, fill the form, read device state |
| `devserver.mjs` | Serves the app (dev mode) on :5199 against staging |
| `previewserver.mjs` | Builds the **production bundle** and serves it on :5200 against staging |
| `test1-ramp.mjs` | 10 / 20 / 30 judges scoring at once |
| `test2-burst.mjs` | Simultaneous submits + Realtime fan-out |
| `test3-endurance.mjs` | 30 minutes of steady scoring, watching for drift |
| `test4-network.mjs` | Slow 3G, 5 s and 60 s outages, flapping Wi-Fi |
| `test5-devices.mjs` | Low-end Android, iPhone, iPad, laptop — load time, input lag, layout |
| `test6-conflict.mjs` | Two judges one project, one judge two devices, double-tap, refresh, back |
| `test7-sleep.mjs` | Ten minutes backgrounded, then resume and submit |
| `test8-accuracy.mjs` | App's displayed results vs an independent recomputation |
| `test9-limits.mjs` | Concurrency ramp past event scale to find the breaking point |

`out/` and `.env.stress.local` are gitignored — the generated SQL bundle, the raw results and
the credentials are never committed.

**This repository is public.** No key, and not even the staging project's id, is written into a
tracked file: `isolation-check.mjs` compares the target against `STRESS_EXPECTED_REF` read from
the gitignored env file rather than against a literal.

### Why fixtures are extracted, not copied

Migration 2026-11a makes `submit_score()` validate every criterion id and value against that
project's rubric. A hand-copied rubric would be rejected by the server and the tests would be
measuring rejections. `fixtures.mjs` therefore reads the preset definitions out of the app
source at runtime, so they cannot drift.

---

## 3. Setup (once)

1. **Create a separate Supabase project** for staging. Put its details in
   `tests/stress/.env.stress.local`:
   ```
   STRESS_SUPABASE_URL=https://<staging-ref>.supabase.co
   STRESS_SUPABASE_KEY=sb_publishable_...
   STRESS_SUPABASE_SECRET=sb_secret_...
   ```
2. **Apply the schema:**
   ```
   node tests/stress/build-schema-bundle.mjs
   ```
   Paste `out/staging-schema.sql` into the **staging** project's SQL editor and run it. If the
   editor balks at the size, run `out/staging-schema-part1..4.sql` in order. The order comes
   from `scripts/db-migrations.test.mjs` — the table in CLAUDE.md is *not* in run order (SF-41).
3. **Check, then seed:**
   ```
   node tests/stress/isolation-check.mjs
   node tests/stress/preflight.mjs
   node tests/stress/seed.mjs
   node tests/stress/smoke.mjs
   ```

## 4. Running the tests

```
node tests/stress/devserver.mjs        # terminal 1 — for tests 4 and 6
node tests/stress/previewserver.mjs    # terminal 1 — for tests 5, 7, 8 (production bundle)

node tests/stress/reset.mjs && node tests/stress/test1-ramp.mjs
...
```

`reset.mjs` before each test: a judge number is bound to one device until an admin approves a
transfer, so sessions left over from a previous test would be refused — correctly.

Tests 5, 7 and 8 use the **production build** on :5200. Load times measured against the dev
server are meaningless, because it ships hundreds of unbundled modules.

## 5. Between sessions

```
node tests/stress/cleanup.mjs          # removes the fake fair, then verifies it is gone
node tests/stress/isolation-check.mjs  # confirm production was never touched
```

`cleanup.mjs` removes the **fake fair**, not the project: the schema stays applied, so
`seed.mjs` re-creates everything in seconds. Both are safe to run repeatedly.

⚠️ **The staging project is currently being KEPT** for further testing (decision 2026-11-13).
Delete it only when the testing is finished for good — the secret key dies with it, which is
the point. Until then it holds nothing but synthetic data, which `isolation-check.mjs` asserts
on every run.

See **[SESSION-LOG.md](SESSION-LOG.md)** for what has been done so far, what was decided and
why, mistakes made and how they were caught, and what is still untested.

## 6. Test data

Fake school, fake projects, fake judges, fake scores. Every project is
`Stress Test Project NNN`; every judge is a number. No real student, teacher or judge name
ever goes into staging, and `project_private` (the table that would hold names) is left empty —
`isolation-check.mjs` asserts both.
