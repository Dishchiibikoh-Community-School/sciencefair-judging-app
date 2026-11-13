# Stress-testing session log

A running record of what was done, what was found, and what was decided — so a later session
(or a later person) can pick this up without re-deriving any of it.

**The staging Supabase project is being KEPT** for further testing in the coming days. Do not
delete it, and do not run `cleanup.mjs` expecting to re-seed from nothing without reading
*Resuming* below.

---

## Session 1 — 2026-11-13

### Goal
Stress test the app before the 2026-12-11 fair: 10+ judges (plan for 30), mixed devices, shared
school Wi-Fi, 3–4 hours, scores syncing live. Report only — fix nothing without approval.

### Ground rules agreed
- **Never touch production.** Show which database every test hits, first.
- **No app code changes.** New files only, under `tests/stress/`, on branch `stress-test`.
- **Fake data only**, cleaned up afterwards with the cleanup verified.
- Announce each test and its duration beforehand; nothing over 5 minutes without an explicit OK.

### What was built

| Step | Outcome |
|---|---|
| Separate staging Supabase project created | Empty project, free tier, same as production's tier |
| Schema applied | `build-schema-bundle.mjs` concatenated `schema-v2.sql` + 21 migrations **in the order `scripts/db-migrations.test.mjs` proves** (the CLAUDE.md table is not run order — SF-41). 22 files, 228 042 chars, split into 4 parts for the SQL editor |
| Verified | `preflight.mjs`: 15/15 tables, 6/6 required functions present and correctly refusing unauthorised calls |
| Isolation controls | `env.mjs` guard + runtime `fetch`/`WebSocket` interception; `isolation-check.mjs` proves it |
| Fake fair seeded | 63 projects (PreK 2 · K-5 8 · 6-8 31 · 9-12 19 · SPED 3), three real 2026-27 forms, 12-round schedule, 306 visits, **30 judge numbers** |
| Harness proven | `smoke.mjs`: one judge signs in, scores, value read back, wrong secret refused |

### Decisions made and why

1. **A separate staging project, not a local Postgres.** The things most likely to break at the
   fair — Realtime fan-out, connection limits, free-tier behaviour under load — do not exist in
   a local database. PGlite (what `npm test` uses) cannot test any of them.
2. **The secret key is used only for seeding, reset and row counting.** Every judge action in
   every test goes through the **publishable** key and the same RPCs a real tablet calls, so the
   measurements exercise the real permission path rather than a privileged shortcut.
3. **Rubric fixtures are extracted from `src/ScienceFairJudging.jsx` at runtime**, not copied.
   Migration 2026-11a makes `submit_score()` validate criterion ids and values against the
   project's rubric, so a hand-written approximation would have been rejected and the tests would
   have measured rejections instead of scoring. Extraction also means they cannot drift.
4. **Device and load-time numbers come from the production build** (`previewserver.mjs`, port
   5200), not the dev server. Dev ships hundreds of unbundled modules; load times from it are
   meaningless.
5. **Test 10 was added** (not in the original brief). Tests 1, 2 and 9 drove many judges from one
   process, which proves the database takes the writes but says nothing about how many separate
   devices can each hold a Realtime subscription — the free-tier limit most likely to be hit first.
6. **Staging kept, not deleted** (user's decision, 2026-11-13) for further testing.

### Mistakes made during this session, and how they were caught

Recorded because each one would have put a false statement in the report.

| What was wrong | How it surfaced | Fix |
|---|---|---|
| **The isolation check was useless.** It scanned source for production identifiers. A planted script that built the URL on one line and used it on the next passed it | Mutation-tested it on purpose; the mutant was *not* caught | Replaced with a **runtime guard** wrapping `fetch` and `WebSocket`. Same mutant now blocked before any byte is sent. Re-mutation-tested: blocked |
| The guard covered `fetch` but **not WebSocket** — leaving Realtime, the busiest path, unprotected | Noticed when about to use Realtime | Wrapped `WebSocket` too; mutation-tested both directions (production blocked, staging allowed) |
| Test 8 reported **55 mismatched averages** | Looked implausible, so checked the page HTML instead of believing it | My scraper took the first decimal in each row, which was a **rubric chip** (a criterion worth 7.5), not the average. Corrected → 55/55 identical |
| Test 8's ranking check **passed vacuously** on an empty list | The debug line printed an empty sample | Read the order in-page; then found the comparison was tie-unsafe and would fail spuriously whenever two projects share an average. Rewrote as "averages never increase down the list" |
| Test 6 reported a **duplicate score row** | The whole-database sweep in the same test said "5 rows, 5 distinct" — a contradiction | The check counted *all judges'* rows for a project. Scoped it to the one judge |
| Test 4's "slow 3G" looked too fast (1.3 s) | Suspected CDP throttling had not applied | Verified it had (an un-throttled control timed out at 30 s). The 1.3 s was real — throttling was applied after page load, so only the small POST was affected |
| Test 5's "cold load on slow 3G: 2.0 s" was **not cold** | 247 KB cannot arrive in 2 s at 500 kbps | The service worker was serving a warm cache. Re-measured with a fresh profile, caches off, SW blocked: **7.6 s** on slow 3G. That number is in the report |
| Test 3's latency check **nearly missed a 9× tail regression** | Read the raw numbers rather than the PASS | Check only looked at the median (passed by a hair) while slowest-5 % went 333 ms → 3 039 ms. Reported as **S-06** with a follow-up probe showing it recovers |
| Appending to `.env.stress.local` **corrupted the secret** — the previous line had no trailing newline | Checked the file structure with `cat -A` after the ref check read empty | Split the line back apart with `sed`; verified the secret still authenticates |

### Results

Full report: **[REPORT.md](REPORT.md)**. Ten tests, **3 706 score writes**, zero errors, zero
lost/duplicated/altered scores, zero incorrect results. No breaking point found at 600 concurrent
writes (~300/sec). Verdict: **GO**.

Findings S-01 … S-07 are in the report. The two Medium ones need no code change:
pre-load the tablets, and keep an admin with the PIN in the room.

### State at end of session
- Fake fair **removed** (`cleanup.mjs` verified 0 rows across 20 tables).
- Staging project **kept, empty**, schema applied and ready to re-seed.
- Isolation re-verified after cleanup: all checks pass.
- Dev server (:5199) and preview server (:5200) were left running; stop them with Ctrl-C.

---

## Resuming in a later session

```
node tests/stress/isolation-check.mjs    # confirm the target and the guards     (read-only)
node tests/stress/preflight.mjs          # confirm schema is still applied        (read-only)
node tests/stress/seed.mjs               # re-create the fake fair (idempotent)
node tests/stress/smoke.mjs              # confirm the harness still works
```

Then any test. `reset.mjs` before each one — a judge number stays bound to its device until an
admin approves a transfer, so leftover sessions are refused (correctly).

Tests 4 and 6 need `devserver.mjs` (:5199). Tests 5, 7 and 8 need `previewserver.mjs` (:5200).

### Things worth testing next, not covered yet

1. **The invite-code lockout under a realistic briefing.** Five wrong codes lock that device,
   thirty across the school lock everyone (migration 2026-11b). With 15 judges typing at once this
   is a plausible disruption and it has **not** been tested.
2. **Real Safari and real Firefox.** All browser work used Chromium (Edge). The iPhone/iPad runs
   used Apple viewports and user agents but **not Apple's engine**, and Safari differs in
   service-worker behaviour, storage eviction and back/forward cache — all of which this app leans
   on. One real iPad scoring one project would close most of this gap.
3. **Realtime connections from more than one machine.** Test 10 degraded at 60 connections, but all
   60 came from a single Node process, so part of that may be local rather than a server limit.
4. **The admin side under load** — Alerts, Awards and the deliberation screens were not exercised
   while judging was running.
5. **A dry run on the venue Wi-Fi.** The one thing that cannot be done from here at all.
