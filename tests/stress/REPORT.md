# Stress test report — Qritiko, ahead of the 2026-12-11 fair

**Run date:** 2026-11-13
**Tested against:** a separate, empty staging Supabase project created for this work. Its id is
in the gitignored `.env.stress.local` and is deliberately not recorded here, because this
repository is public.
**Production (`evrupqnhgrfltfhafeyj` / qritiko.com): never contacted.** See *Isolation* below.
**App code changed: none.** Everything added lives in `tests/stress/` on branch `stress-test`.

---

## 1. Isolation — the two databases could not mix

Because a mistake here would be worse than anything the testing could find, isolation was built
as an enforced control rather than a convention, and the control was mutation-tested.

| Control | Evidence |
|---|---|
| One place reads connection details (`env.mjs`); every script imports from it | — |
| `cfg()` refuses any URL containing a production identifier | `isolation-check.mjs` checks 1–2 |
| **Runtime guard** wraps `fetch` *and* `WebSocket`, refusing production URLs before sending | checks 6a–6d |
| No `.env` exists on this machine — only `.env.example` placeholders | check 3 |
| Dev/preview servers inject credentials in-process; **no env file is written** | `devserver.mjs`, `previewserver.mjs` |
| Staging contained only the fake fair, with no real names | checks 4–5 |

**The first isolation check was wrong and was caught by mutation-testing it.** It scanned source
code for production identifiers. A deliberately planted script that built the production URL on
one line and used it on the next passed the scan — exactly the shape a real accident takes. It
was replaced with the runtime guard above, which blocks the fully-formed URL; the same mutant is
now blocked before a byte leaves the machine. A safety check nobody has seen fail is not evidence.

Served-bundle check: the app served to the browser contained **0 occurrences** of
`evrupqnhgrfltfhafeyj` or `qritiko.com`.

## 2. The fake fair

Shaped like the real event so the numbers mean something: 63 projects (PreK 2 · K-5 8 · 6-8 31 ·
9-12 19 · SPED 3), the three real 2026-27 forms, a 12-round timed schedule, 306 scheduled visits —
scaled to **30 judge numbers** rather than 15, as asked.

Rubric definitions are **extracted from `src/ScienceFairJudging.jsx` at runtime**, not hand-copied,
because migration 2026-11a makes the server validate every criterion id and value against the
project's rubric. A hand-written approximation would have been rejected and the tests would have
been measuring rejections instead of scoring.

No real student, teacher or judge name entered staging at any point; `project_private` stayed empty.

---

## 3. Results

| # | Test | Verdict | Headline |
|---|---|---|---|
| 1 | Load ramp 10/20/30 judges | **PASS** | median 120–130 ms, 0 errors, 0 lost or altered writes |
| 2 | Burst (end-of-round rush) | **PASS** | 306 simultaneous submits, 0 errors, 100 % Realtime delivery |
| 3 | Endurance, 30 min | **PASS** | 1 065 writes, 0 errors, **no memory/listener/socket leak** |
| 4 | Network trouble | **PASS** | 11/11 — nothing lost or duplicated through outages |
| 5 | Device emulation | **PASS** | 28/28 — no overflow, all targets ≥ 44 px, 34–53 ms tap |
| 6 | Conflict & integrity | **PASS** | 13/13 — no duplicates, no overwrites, no lost rows |
| 7 | Sleep/wake (10 min) | **PASS** | 10/10 — session and draft survived, submit in 1.8 s |
| 8 | Results accuracy | **PASS** | 11/11 — 55/55 averages identical to independent recomputation |
| 9 | Breaking point | **PASS** | no failure found at 600 concurrent writes (~300/sec) |
| 10 | Realtime connections* | **PASS to 30** | 30 devices: 100 % fan-out. Degrades at 60 |

\* Not in the original brief. Tests 1, 2 and 9 drove many judges from one process, which proves
the database takes the writes but says nothing about how many **separate devices** can each hold
a Realtime subscription. On the free tier that is the limit most likely to be hit first.

### 3.1 Load ramp

| Judges | Submits | Median | Slowest 5 % | Max | Throughput | Errors | Missing | Duplicates |
|---|---|---|---|---|---|---|---|---|
| 10 | 72 | 130 ms | 205 ms | 250 ms | 43/s | 0 | 0 | 0 |
| 20 | 192 | 120 ms | 212 ms | 320 ms | 111/s | 0 | 0 | 0 |
| 30 | 294 | 122 ms | 480 ms | 780 ms | 145/s | 0 | 0 | 0 |

Integrity was verified independently of the error rate: every acknowledged write was read back
and its criteria compared value by value. Zero errors is not the same as zero lost writes, so
both were measured.

*(294 not 306 submits: judge 9's number was still bound to the smoke test's device, and the server
correctly refused the second device. That refusal is the device-transfer protection working.)*

### 3.2 Burst

| Burst | Submits | Median | Peak rate | Errors | Realtime delivered |
|---|---|---|---|---|---|
| A — end-of-round rush, 1 per judge | 30 | 400 ms | 70/s | 0 | **30/30 (100 %)** |
| B — every queue flushes at once | 306 | 2 235 ms | 121/s | 0 | **306/306 (100 %)** |

Burst B is the worst realistic case: a row of tablets reconnecting together and flushing their
offline queues. Everything arrived; the cost was latency, not loss.

### 3.3 Endurance (30 minutes) — 8/8 PASS, with one number worth reading closely

15 judges scoring continuously for 30 minutes (**1 065 writes, 0 errors**), with a real tablet
and a Realtime dashboard open the whole time.

| | Start | End |
|---|---|---|
| JS heap (open tablet) | 4.8 MB | 5.2 MB |
| DOM nodes | 405 | 390 |
| Event listeners | 188 | 186 |
| New WebSockets opened during the run | — | 0 |
| Realtime events delivered | — | **1 065 of 1 065** |

**No leak of any kind.** Memory, DOM and listeners were flat or slightly down over half an hour;
nothing accumulated. A tablet left open all morning will be fine.

**But latency drifted, and the summary check nearly missed it:**

| | Min | Median | Slowest 5 % | p99 | Max |
|---|---|---|---|---|---|
| First 10 minutes | 108 ms | 152 ms | 333 ms | 823 ms | 923 ms |
| Last 10 minutes | 105 ms | 304 ms | **3 039 ms** | 3 850 ms | 3 853 ms |

The median doubled; the **tail degraded 9×**. My automated check only looked at the median and
passed by a hair — reported here because the tail is the number that matters to a judge waiting
on a Submit button. See finding **S-06**.

The fast path never changed (minimum stayed ~105 ms), so this is periodic stalling under
sustained load, not general slowdown. **It recovers:** a probe one minute after the load stopped
was back to baseline (median 153 ms, slowest 5 % 234 ms, against a pre-test baseline of 197/208 ms).

### 3.4 Network trouble — 11/11 PASS

| Scenario | Result |
|---|---|
| Slow 3G (500 kbps, 400 ms) | score went through, 1.3 s |
| 5 s outage mid-submit | queued on device, judge told "not sent yet", synced on reconnect, exactly 1 row |
| 60 s outage mid-submit | held on device through the whole minute, never shown as saved, exactly 1 row after |
| Flapping Wi-Fi, 9 on/off cycles across 3 submits | 6/6 scores survived, 0 duplicates, nothing stranded, all 20 criteria intact |

This is the F2/F3 offline machinery from the 2026-11 fixes doing its job under real conditions.

### 3.5 Devices — 28/28 PASS

| Device | Load (cached) | Tap response | H-overflow | Targets < 44 px |
|---|---|---|---|---|
| Low-end Android (6× CPU throttle) | 1.92 s | 53 ms | 0 px | 0 |
| iPhone viewport (2×) | 0.99 s | 34 ms | 0 px | 0 |
| iPad (2×) | 0.98 s | 34 ms | 0 px | 0 |
| Laptop | 0.91 s | 36 ms | 0 px | 0 |

**True first-visit load**, measured separately with a fresh profile, caches off and the service
worker blocked — because the figures above are a *warm* PWA cache and would have overstated things:

| | Low-end Android | iPad |
|---|---|---|
| School Wi-Fi / 4G | 1.9 s | 1.6 s |
| Slow 3G | **7.6 s** | **6.9 s** |

Measured against the **production build**, not the dev server — dev ships hundreds of unbundled
modules and any load time from it would be meaningless.

### 3.6 Conflict & integrity — 13/13 PASS

- Two judges scoring the same project simultaneously → two rows, two judges, **neither overwrote
  the other** (totals 80 and 40 preserved).
- Same judge number on a second device → refused, with a message naming the remedy
  ("Ask the admin to approve a device transfer").
- Double-tapping Submit → **exactly one** row.
- Refresh mid-submit (request held in flight 3 s) → not lost, no duplicate for that judge.
- Browser Back straight after submit → no second score, judge stays in the app.
- Whole-database sweep → no duplicate `(judge, project)` anywhere, no row with empty criteria.

### 3.7 Sleep/wake — 10/10 PASS

Tab hidden behind another tab **and** frozen via CDP for 10 minutes — what a tablet actually does.
On waking: still signed in, session intact, the half-finished score (10 of 20 criteria) still in
drafts, submit completed in 1.8 s, no duplicates, nothing stranded.

### 3.8 Results accuracy — 11/11 PASS

306 scores written under concurrent load, then results published through a real share link and
the **rendered page** compared against a recomputation done here from the raw rows, using maxima
derived from the rubric definitions rather than the app's own arithmetic.

- **55 of 55 project averages identical.**
- Displayed averages never increase down a department list (checked tie-safely across all 5
  departments).
- No judge name anywhere on the public page.

### 3.9 Breaking point — not found

| Concurrent writes | Median | Slowest 5 % | Rate | Errors | Realtime |
|---|---|---|---|---|---|
| 25 | 197 ms | 208 ms | 117/s | 0 | full |
| 50 | 302 ms | 416 ms | 117/s | 0 | full |
| 100 | 383 ms | 450 ms | 217/s | 0 | full |
| 200 | 670 ms | 812 ms | 240/s | 0 | full |
| 400 | 1 425 ms | 1 754 ms | 223/s | 0 | full |
| 600 | 1 598 ms | 1 985 ms | 295/s | 0 | full |

**No level failed.** Latency grows linearly with queueing, which is the expected shape, but
nothing errored and nothing was dropped. The ramp was stopped at 600 by choice, not by failure —
that is already ~200× the fair's peak demand, and hammering a free project further proves nothing
useful. **The ceiling is above anything this event can generate; it was not located.**

### 3.10 Realtime connections — ceiling found at 60

Each connection is an independent Supabase client with its own WebSocket and its own channel,
as a separate tablet would have.

| Connections | All joined? | Join time | Fan-out received | Delivery lag (median) | Verdict |
|---|---|---|---|---|---|
| 10 | 10/10 | 0.4 s | **10/10 (100 %)** | 251 ms | PASS |
| 30 | 30/30 | 0.6 s | **30/30 (100 %)** | 308 ms | PASS |
| 60 | **59/60** | **10.0 s** | 59/60 (98.3 %) | 759 ms | **DEGRADED** |

**30 simultaneous devices — your planned maximum — is clean, with every device receiving every
update.** At 60 the join time jumped from 0.6 s to 10 s and one client never subscribed.

⚠️ **Caveat:** all 60 clients ran from one Node process on one machine, so some of that
degradation may be local (sockets, CPU) rather than a Supabase limit. Treat 60 as "the point
where this setup stopped being clean", not as a proven server ceiling. The useful fact is the
one below it: **30 held perfectly.**

---

## 4. Findings

Nothing found rises to Critical or High. Severities below are about **event-day consequence**,
not code tidiness.

| ID | Severity | Test | What happened | Likely cause | Suggested fix |
|---|---|---|---|---|---|
| **S-01** | Medium | 5 | First-ever load takes **6.9–7.6 s** on a weak connection | The whole app is one **915 KB** JavaScript file (247 KB gzipped). Vite warns about it at build time. There is no code splitting, so a judge's first visit downloads everything before anything appears | **Operational, costs nothing:** open the app once on every tablet before the event — the PWA then caches it and later loads take ~2 s. Code-splitting is the real fix but is not worth touching before a fair |
| **S-02** | Medium | 6b | A judge number is locked to one device; moving to a spare tablet needs an admin with the PIN | By design, and correct — it is what stops anyone claiming a judge's identity | **Operational:** make sure someone with the admin PIN is in the room all morning, and that judges know a dead tablet means "find the organiser", not "sign in again". Already in the help text |
| **S-03** | Low | 2 | When 306 queued scores flush at once, median submit latency rises to **2.2 s** (max 2.5 s) | Queueing, not failure. Every write succeeded | None. Worth knowing so a 2–3 s pause after a mass reconnect is not mistaken for a hang |
| **S-04** | Low | — | Every score insert is broadcast to **every** connected device on the school channel | One Realtime channel per school, by design | None at this size. It is why Test 10 was added — the cost scales with devices × writes, so it matters at a much larger fair, not this one |
| **S-05** | Info | 5 | Public pages log a **401 on `project_private`** | Correct and intended: that table is admin-only and anon has no privileges | None. Recorded so it is not mistaken for a fault when reading logs on the day |
| **S-06** | Low | 3 | Under 30 minutes of sustained load, **slowest-5 % latency grew 333 ms → 3 039 ms** (median 152 → 304 ms). Zero errors throughout | Periodic stalling under sustained concurrent writes — the *minimum* never changed (108 → 105 ms), so the fast path is unaffected. Most likely free-tier CPU burst credits depleting, possibly with some contention from my own machine running the browser and 15 workers at once. **It recovers fully within a minute of load stopping** | None needed for this event. The test ran at ~35 writes/min; your fair generates about **1 write/min**, roughly 35× lighter. Worth re-checking only if the fair grows several-fold or moves to continuous all-day use |
| **S-07** | Low | 10 | At **60** simultaneous device connections, join time rose from 0.6 s to 10 s and one client never subscribed | Realtime connection handling at the free tier, and/or the single test machine holding 60 sockets | None for this event — **30 devices was flawless** and you plan at most 30. If the fair ever exceeds ~50 simultaneous devices, re-test from more than one machine before relying on it |

### Things that were explicitly checked and found sound

Worth stating plainly, because these are the failure modes that actually lose a fair:

- No score was lost, duplicated or altered in **any** test, including every network-failure case.
- Two judges on one project never overwrote each other.
- A double-tapped Submit never produced two rows.
- The per-judge secret (2026-11a, F1) was active throughout: a wrong secret was refused.
- Published results matched an independent recomputation exactly.

---

## 5. Safe capacity

| | |
|---|---|
| **Your event** | 15 judges, 63 projects, ~179 visits spread over ~3 hours |
| **Measured comfortable** | 30 judges scoring continuously, 0 errors |
| **Measured without failure** | 600 concurrent writes, ~300 writes/sec |
| **Realtime devices tested clean** | **30 simultaneous connections, 100 % fan-out** (degrades at 60) |
| **Sustained** | 1 065 writes over 30 min with no leak and no errors |
| **Recommended safe maximum** | **30 concurrent judges.** This is a measured limit, not an extrapolation: it is the most that was exercised end to end, every part of it was clean, and the first sign of strain anywhere was at 60 devices — double that |

Put plainly: the fair needs roughly **one write every 60 seconds** at its busiest. The system
absorbed **300 writes per second** without an error. The scoring path is not where risk lives.

---

## 6. Event-day risks, ranked

1. **The venue network, not the app.** Everything above ran over a healthy connection to
   Supabase. A saturated access point in a gym is the single most likely failure, and it is the
   one thing that could not be tested remotely. The offline queue handles it well — but only
   once the app has loaded on each tablet (see S-01).
2. **First load on the day** (S-01). Judges arriving and loading the app cold, together, on
   venue Wi-Fi is the worst-case moment. Pre-loading every tablet removes this risk entirely.
3. **Sign-in congestion at the briefing.** Not load-related: five wrong invite codes lock that
   device, and thirty across the school lock everyone for a period. With 15 judges typing a code
   at once this is a plausible disruption. **Not tested here** — it is a documented behaviour
   (migration 2026-11b), and the mitigation is to display the code where everyone can read it.
4. **A tablet dying mid-round** (S-02). Recoverable, but only with an admin present.
5. **Everything else measured.** Writes, bursts, ties, accuracy, offline sync, sleep/wake — all
   clean with large margins.

---

## 7. Go / no-go

**GO**, on the evidence gathered.

Across 10 scenarios and **3 706 score writes**, there were **zero errors, zero lost writes,
zero duplicates and zero incorrect results.** No breaking point was found at 200× the event's
peak demand. The resilience work from 2026-11 (F1–F17) held up under conditions harsher than the
fair will produce.

The two Medium findings are both addressable **without touching code**: pre-load the tablets, and
keep an admin with the PIN in the room. The three Low findings (S-03, S-06, S-07) all sit far
outside the load this event will generate and need no action.

Stated the other way round: the measured headroom is roughly **200× on write throughput, 2× on
device count, and 35× on sustained write rate.**

---

## 8. What could NOT be tested remotely — check these in person

1. **The venue Wi-Fi.** Access-point capacity with 15–30 devices plus phones in the room, client
   isolation, and any captive portal. Emulated throttling models latency and packet loss; it does
   not model a saturated AP. **Do a dry run in the actual room, on the actual network.**
2. **Real Safari and real Firefox.** All browser testing used Chromium (Edge) — the iPhone and
   iPad results used Apple **viewports and user agents, but not Apple's engine**. Safari differs
   in service-worker behaviour, storage eviction and back/forward cache, all of which this app
   depends on. If judges will use iPads, open the app on one real iPad and score one project.
3. **The actual tablets.** Available RAM, OS version, whether the PWA is installed, and whether
   the screen sleeps aggressively.
4. **Judge behaviour.** Mis-taps, walking out of range mid-submit, two people sharing a tablet.
5. **The invite-code lockout under a real briefing** (risk 3 above).

---

## 9. Reproducing this

Everything is in `tests/stress/` with a README covering isolation, setup, and how to run each
test. Raw per-test numbers are in `tests/stress/out/*.json` alongside the console logs.

**The staging project is being kept** for further testing (decision 2026-11-13); the fake fair
itself was removed and the removal verified. Delete the project when testing is finished for
good — the secret key in `.env.stress.local` dies with it. That file is gitignored and was never
committed, and neither the keys nor the project id appear in any tracked file.

`tests/stress/SESSION-LOG.md` records what was done, what was decided, which of my own test bugs
were caught on the way, and what remains untested.
