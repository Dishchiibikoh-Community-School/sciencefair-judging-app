# Concurrency audit — 15 judges on 15 devices (2026-11-12)

Audit of the app at `main` 75860d0. **No code was changed.** Live Supabase was only read (anonymous probes
for the configuration); it was never written to — live still holds 0 judges / 0 scores.

## Rig

- The real app served by `vite` on :5199, Supabase faked by `scripts/e2e/mock.mjs` loaded with a read-only
  copy of the LIVE configuration: 63 projects, 5 departments, the 3 forms (K-5 8 × 12.5, 6-8 / 9-12 20 × 5,
  PreK / SPED 4 × 5), roster 1–15, the head's 179-visit / 12-round schedule, `judge_max` 15. No student names.
- 16 headless Edge browser contexts: 1 admin dashboard (never reloaded until the end) + 15 judge tablets.
- Per device: 10–120 ms latency on reads, 40–540 ms on score saves; a fake Supabase Realtime server
  (`page.routeWebSocket`) pushes every row change to every connected device with 60–400 ms delay.
- Harness (gitignored, `scripts/e2e/out/`): `concurrency-audit.mjs <dataDir> <seedTag>` (Scenario A),
  `mixup-audit.mjs` (Scenario B). Not part of `npm run test:e2e`.
- Independent oracle: expected totals computed from the rubric JSON with integer arithmetic (totals × 2),
  averages rounded half-up to 1 decimal, places and ribbons by the fair's rules — never through app code.

## Scenario A — 12 rounds, every judge with a visit scoring at the same moment (two random seeds)

Per round, 15 tablets open the project, tap every item, type a tagged comment and submit together. Mixed in:

- 35 double-tapped Submit buttons; 17 "score an earlier project again" edits while others were submitting
- 5 visits + 1 edit done offline (Wi-Fi off before Submit), tablet back online next round
- 2 server 503s on Submit (automatic retry); 2 tablets with a 4–6 s slow save
- 2 tablets refreshed while "Saving…"; 8 tablets refreshed with a half-filled form (draft restore)
- 15 simultaneous "Approve Results" at the end

Results, identical on both seeds (22 of 23 checks):

- 15 judge rows, 15 distinct ids and secrets; every device kept its own session for the whole run.
- 179 score rows: no duplicates, none missing, none for an unscheduled project; every row under the right judge,
  project, school and FORM (correct criterion ids per department); every row holds the judge's LATEST values
  and own comments (edits included). 0 overwritten, 0 lost.
- Every double-tap sent exactly ONE request. Offline / 503 / reload-mid-save scores were queued and reached the
  server by themselves (503s within ~16 s; offline on reconnect within 1 s). Drafts restored after restart (8/8).
- Totals on the scoring screen, "✓ NNpts" on every tablet, the Judge Scores CSV (179 rows, every criterion,
  total, out-of, comment), the admin leaderboards LIVE (built from realtime events only) and after a full reload:
  all 63 averages, review counts, rank order, medals and PreK / SPED ribbons equal the oracle. Live == reloaded.
- Admin dashboard caught up after every round: 4 ms – 5 s after the last server write.
- 15 validation rows, one per judge. No JavaScript errors on any device.

## Scenario B — mix-ups, stand-in, lock, edit during scoring (19 of 19)

- Two tablets, Judge 7, same instant → one in, one told "already signed in… approve a device transfer"; one row.
- Allow Transfer → the stand-in signs in on the SAME row with a NEW secret, sees R1 already ✓, scores under Judge 7.
- The old tablet revives: its score and its attempt to overwrite the stand-in's score are refused by the server,
  stay queued, and still do not get through after the automatic retry (finding 1).
- Lock Judging while a form is open → submit refused, judge sent to the list with the lock notice, taps kept as a
  draft, submitted fine after Unlock.
- Organiser edits a project's title / booth while its 3 judges submit → 3 rows under 3 judges; lists update live.
- Judges tab shows Judge7 2/12 = the server.

## Findings

| # | Severity | Finding | Evidence | Suggested fix (not applied) |
|---|---|---|---|---|
| 1 | **Medium** (event day) | After **Allow Transfer**, the original tablet keeps accepting scores, shows "⏳ 60pts — not sent yet", retries forever and never says why. If that tablet comes back to life and the judge keeps using it, every score entered there is lost until someone reads the IT log. (The known gap from 2026-11-05, now confirmed end to end.) | B3: server refused the write; tablet queue = 1; IT log `SCORE_QUEUED:server_error` → `OFFLINE_SYNC_FAILED`; still "not sent yet" after a 20 s retry cycle. | On the 42501 "This device is not signed in as that judge" reply do NOT queue: show a blocking notice ("This tablet is no longer signed in as Judge 7 — scores here will not be sent; ask the organiser for Allow Transfer"), keep the draft, log `JUDGE_SECRET_REJECTED`, list it on Alerts. |
| 2 | Low | A tablet refreshed while "Saving…" keeps the **score** (queued, then synced; the in-flight request also landed — 200 server writes for 198 submits, identical values, a harmless upsert) but the `SCORE_SUBMITTED` IT entry and the "JudgeN submitted score for Project #" activity line are never written. | 196 of 198 entries in both runs — exactly the 2 reload-mid-save cases. | Write the activity / IT entry when a queued score is flushed (per item), or log `SCORE_SUBMITTED` before awaiting the save with a "queued" marker. |
| 3 | Info | Random data produced medal-deciding ties in 6-8 (92.3 / 92.3 for 3rd) and 9-12 (95 / 95 for 1st); the oracle skipped medal checks there. By design the organiser decides (covered by `awards.e2e`). | — | None. |

## Not verified

- **Real Postgres / PostgREST / Supabase Realtime** — the backend was the in-memory mock. Row-level upsert
  concurrency, realtime ordering / drops and the reconnect catch-up were SIMULATED (the DB suite covers the
  single-row RPC logic on real Postgres).
- **Real tablets, iOS / Android PWA, real Wi-Fi, battery, the production bundle** — the rig ran the Vite dev
  server. Two 50 s reloads in Round 2 were traced to dev-server module fetches (10 s per module) plus a live
  Google Fonts request under 16 pages — a rig artefact, not the app.
- Tied medal placement (finding 3); the judge-side validation ranking list (only the approval rows were checked).

## Re-running

```
# dev server with the mocked backend
VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite --port 5199
# dataDir holds depts/cats/projects/rubrics/roster/sched/settings .json — public columns only
node scripts/e2e/out/concurrency-audit.mjs <dataDir> a
node scripts/e2e/out/mixup-audit.mjs <dataDir>
```

Outputs `audit-<tag>.json` and `judge-scores-<tag>.csv` next to the harness.

---

## Addendum 2026-11-16 — winners per category

The organiser asked for a 1st, 2nd and 3rd in **every category** of a department (e.g. K-5), changeable
between per department and per category. The option already existed in Setup; it is now also on the
Awards tab ("How winners are chosen"), with the organiser's rules applied (CLAUDE.md rule 86).

### Organiser's decisions on the gaps found

| Gap found | Decision | Status |
|---|---|---|
| A category with one project gets an uncontested 1st (live K-5: 4 of 5 categories) | Intended | Flagged on the Awards tab ("Only 1 project — 1st is uncontested") |
| "Best in Category" given to a category's winner removed its 1st place | No Best in Category per category — 1st–3rd are the category winners | **Fixed:** not offered, refused by the save handler, a saved one blocks the switch to per category |
| Leaderboard and judge list showed a department-wide rank beside per-category medals | Restart the rank per category | **Fixed:** a heading per category, numbered from 1 |
| A renamed category's old text forms a separate award group | Accepted for now | Open (CLAUDE.md Known gaps) |

### Tests

| Run | Result |
|---|---|
| `scripts/e2e/awards-category.e2e.mjs` (new, live-shaped K-5) | 23 / 23; every new rule mutation-tested (removing each one fails its check) |
| Full browser suite `npm run test:e2e` | **690 checks across 38 files, 0 failures** |
| `npm test` (real Postgres migrations / RLS, scan + email APIs) | 311 / 311 |
| Lint (React Compiler baseline 28 purity / 5 immutability) and build | Unchanged / clean |
| 15 judges on 16 devices, **every department per category** (two runs) | 18 award groups; 17 tie-free groups' 1st–3rd = the oracle; ties flagged (6-8 ERT 3rd; 6-8 CMS 2nd); Confirm all = ONE write of exactly the oracle's 41 places; live and reloaded leaderboards, with ranks restarting per category, = the oracle. 25 / 26 |
| Same harness, per department (regression) | 22 / 23 |

The single fail in every harness run is **finding 2 above** (a tablet reloaded during "Saving…" keeps
its score but loses the SCORE_SUBMITTED log line). It exists on main as well and is unrelated to awards.

### Still not verified

The same limits as the main report: real Supabase / Realtime, real tablets and Safari, the venue Wi-Fi.
