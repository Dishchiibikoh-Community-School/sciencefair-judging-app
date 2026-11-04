# Portfolio Log — Qritiko (Science Fair Judging App)

Honest, specific notes on work done, for later portfolio/interview use.

---

### 2026-10-21 — Phase 3: award groups and an Awards screen that confirms instead of typing

- **Project:** Qritiko — multi-tenant science-fair judging SaaS (React + Vite + Supabase, ~11k-line single component)
- **What I built/fixed:** A per-department choice to award places per department or per category, one
  `awardGroups()` definition that every medal on every screen now comes from, and an Awards tab that
  shows each group's computed top three for the organiser to confirm (all clean groups in one batched
  write), with ties, unscored projects and stale confirmations floated to the top, plus a printable
  awards list for the ceremony.
- **Why I built it:** The old flow asked the admin to pick ~70 awards one dropdown at a time, in a list
  ranked across departments ("Rank 4" of everything), and the tie alert fired for ties nowhere near a medal.
- **Problem(s) encountered:**
  - **Confirmed vs computed places can disagree** — after a tie is broken by hand, or when a judge re-scores
    after confirming. Decided that a group's confirmed awards win on the public page, and that the Awards
    tab flags "scores changed since you confirmed" rather than silently overwriting a decision.
  - **A React Compiler bailout from one innocent loop.** A `filter` callback inside a `for` loop closed over
    the loop counter; the compiler gave up on the whole 11k-line component and two lint rules silently went
    from 33 findings to zero — the report looked *better*. Caught because the project tracks those counts per
    commit; bisected by cutting each new function and re-linting.
  - **Empty departments** produced empty award groups — caught by the first run of the new test.
- **Result:** 28-check browser suite, mutation-tested (grouping off → 7 fail; confirmed awards ignored → 2
  fail). No database migration needed — the column had been added in advance in an earlier migration.

---

### 2026-10-21 — PreK & SPED rubric: ribbons for every child, shared places on ties

- **Project:** Qritiko — multi-tenant science-fair judging SaaS (React + Vite + Supabase, ~11k-line single component)
- **What I built/fixed:** A third 2026-27 form (4 criteria × 1–5 = 20) for the youngest and special-education
  divisions, which until then were "comments only". Every child gets a ribbon worked out from the total
  (Gold / Silver / Bright Star Scientist), and tied children share a place, as the organiser's rubric
  sheet says — on that form only.
- **Why I built it:** The organiser decided PreK and SPED should be recognised with places and ribbons
  rather than unranked commendations, and sent the final sheet.
- **Problem(s) encountered:**
  - **"Ties share the same place" is ambiguous** — after two 1sts, is the next child 2nd or 3rd? The
    sheet's own table answered it ("Awarded to: highest / second highest / third highest total score"),
    so places go to the three highest *different* totals: 18, 18, 15 → 1st, 1st, 2nd.
  - **The app had one "top three" function shaped as a list of three projects.** Shared places need
    several projects per place, so I replaced it with a single `placesOf()` Map (project → place) used
    by the podium, the ranked table, the leaderboard and the CSV — keeping one source of truth for medals.
  - **The tie-deliberation alert** would have fired on every shared place; it now skips only rubrics
    whose ties are shared, and a test proves a tie on any other rubric still raises it.
  - **Conflict with the 60% minimum to place** (12 of 20 would have cost a child their 3rd place) —
    raised it with the organiser, who set the minimum back to 0% for every division.
- **Result:** New browser suite (16 checks), mutation-tested: switching shared ties off fails 5 checks,
  switching ribbons off fails 3. No database migration — the rules live in the rubric preset.

---

### 2026-10-20 — "Minimum score to place" (a weak project can be kept off the podium)

- **Project:** Qritiko — multi-tenant science-fair judging SaaS (React + Vite + Supabase, ~10k-line single component)
- **What I built/fixed:** An optional per-school rule: a project must average at least N% of its own
  maximum before it can take 1st, 2nd or 3rd. Below it the project still appears in the results with
  its real score — it just gets no medal, and the medals pass to the next projects that qualify.
- **Why I built it:** The organiser asked "does the judging have a thing where below 50 it won't count
  to 3rd place?" It did not. Ranking was a plain descending sort with no floor and the podium was
  literally `scored.slice(0, 3)`, so the lowest average in a department took bronze whatever it was.
  On their 100-point rubric the scoring floor is 20 (there is no zero step), so this was a real
  possibility at the fair, not a hypothetical.
- **Problem(s) encountered:**
  - **"Below 50" could not be stored as 50 points.** Departments can sit on different rubrics (42 and
    100 points) and a project below grade 5 skips the Abstract criterion, so its maximum is 36, not 42.
    An absolute 50 would have meant "unreachable" on one rubric and "half" on another. Had to store a
    percentage of each project's own `projectMax()`.
  - **Two places decided the top three independently** — the podium and the ranked table each did their
    own `slice(0, 3)`. Filtering only one would have made the podium and the medal column disagree about
    who won. Solved with a single `placeWinners()` + a medal Map shared by both.
  - **The tie detector would have jammed.** `hasTie()` opens an amber "deliberation needed" alert on any
    equal pair; two projects level *below* the line cannot take a medal from each other, so the alert
    would never switch off. Had to gate it on the same eligibility test.
  - **My own test passed for the wrong reason twice.** First version had an `if (!count) return` escape
    hatch in the deliberation check — it would have passed without testing anything. Second version
    grabbed the first "Save Award" button on the page instead of the one in that project's block.
  - **Test-harness bug that looked like a product bug:** I seeded a second `app_settings` row for a key
    the fixture already had. The app reads the *last* row; my later `find()` edited the *first*. The
    deliberation screen silently stayed in its finalized state and the dropdowns never rendered.
- **How I solved it:** One setting (`app_settings.min_place_pct`, 0 = off) — no migration needed, since
  `app_settings` is key/value. Two helpers do all the work: `placesEligible(proj)` (the single test for
  "may this take a medal") and `placeWinners(ranked)` (the top three that qualify, in order). Every
  consumer — podium, ranked table, leaderboard, judge validation list, tie detection — goes through
  those. In the admin's Validation tab the rule **warns but never blocks**: a refusal with no override
  on event day is worse than a clear note. Deliberately not a DB constraint, so scores stay exactly as
  judged and the rule can be switched off mid-event with no data change.
- **Skills/tools demonstrated:** React state/derived-data design in a large single-component app;
  Supabase key/value settings + RLS; Playwright E2E authoring against a hand-written backend mock;
  **mutation testing** (disabled the feature and confirmed 4 of 16 new checks fail, so the suite proves
  something); working inside a strict documented rule set (a React Compiler bailout silently disables
  two lint rules file-wide, so the per-rule baseline 26/5 is compared on every change).
- **Portfolio angle:** "Added an optional scoring-eligibility rule to a live multi-tenant judging
  platform days before its event — designed it as a percentage rather than a point value so it behaves
  correctly across three rubrics and a grade-based exemption, routed every ranking surface through one
  eligibility helper so the podium and results table could not disagree, and mutation-tested the new
  browser suite to prove it actually caught the regression."

### 2026-10-21 — Suggested judge setup: turning "who ticks what" into arithmetic
- **Project:** Qritiko (science-fair judging platform)
- **What I built/fixed:** A "Suggested setup" panel in the admin's judge grid. The organiser types how
  many judges are coming and how many scores they want on each project; it prints how many judges each
  department needs, how many projects each judge reviews, roughly how long that takes, and why — plus an
  "Apply to the grid" button that fills the checkboxes without saving. The grid itself gained an
  **About** (estimated time) column beside each judge's project count.
- **Why I built it:** The organiser asked for "an AI recommendation on what to tick". Reading the live
  roster showed the real problem it needed to solve: with every department left on "every judge scores
  all", one judge was carrying **58 projects (~5.8 h)** while another had 19 — 524 reviews in total for
  a 63-project fair. Turning on panels alone did *not* fix it, because `judges_per_project` balances
  **inside** a department and is blind **across** them, so a judge ticked into three departments
  collects three separate shares.
- **Problem(s) encountered:**
  - **The request was for AI; the right answer was not.** `projects × scores ÷ judges` is exact. A model
    call would be slower, cost money, need network on event day, and could hallucinate a number the
    organiser would act on. I built it as arithmetic and wrote down *why* (rule 73) so nobody "upgrades"
    it later.
  - **My first allocation was fairer-looking and measurably worse.** Splitting spare judges in
    proportion to project count gave 4/6/5 judges on 8/31/19 projects — loads of 6 … 15.5. Allocating
    each spare judge to whichever department is currently *busiest per judge* gives 3/7/5 — loads 8 …
    13.3, and reproduces the plan I had derived by hand.
  - **A displayed total that contradicted itself:** the summary said "11–13 projects" and "1 h 20 min",
    because the real maximum is 13.3 projects. Fixed in the product, not the test — the time is now
    computed from the same rounded count the user is shown.
  - **My new column broke two unrelated test suites.** `judge-panels` and `shared-judges` read that row
    with `td.last()`, so inserting a column silently moved what they asserted on. Fixed the *cause*:
    the cells now carry `.roster-load` / `.roster-time` and all three suites select by class.
  - **An honest test gap I chose to document rather than hide:** I could not build a mutation that fails
    the "Apply writes nothing" check — calling `saveRoster()` inside `applySuggestion()` reads state
    React has not flushed yet, so it saves the *old* roster and writes nothing either way. The
    "grid is now dirty" check is what actually catches a premature save. Both the test and CLAUDE.md say so.
- **How I solved it:** A pure function `suggestRoster(nJudges, panel)`: every scored department gets a
  floor of `panel` judges, each spare judge goes to the busiest department, comment-only departments ride
  along with the lightest block (they are too small to split), and a shortfall is *refused* with the
  number needed rather than fudged. `applySuggestion()` writes the draft only — and unions in each
  signed-in judge's existing departments, because the server refuses to take one away.
- **Skills/tools demonstrated:** Greedy load-levelling (minimise the maximum, not the average) and
  justifying it with measured numbers; Playwright E2E against a hand-written Supabase mock, with a
  fixture deliberately shaped like the real event so the expected output is hand-checkable;
  **mutation testing** (disabling the levelling fails 6 of 15 new checks); diagnosing a test regression
  as a brittle-selector problem and fixing the selector contract instead of the assertions; writing the
  design rationale into a project rule set so the decision survives me.
- **Portfolio angle:** "Asked for an AI feature, I shipped exact arithmetic instead — a planner that cut
  a live science fair's judging workload from 524 reviews (one judge at 5.8 hours) to 189 evenly split
  (~1¼ hours each), explained its own reasoning on screen, never wrote to the database without the
  organiser pressing Save, and came with a mutation-tested browser suite plus a written rule for why it
  must not become a model call."

### 2026-10-21 — The final 2026-27 evaluation forms, scoring drafts, and a safety alert
- **Project:** Qritiko (science-fair judging platform)
- **What I built/fixed:** The committee's two final paper forms as built-in rubrics — a 20-item
  middle/high school form (five sections, 100 points) and an 8-item elementary form rated 1–5 that the
  paper converts with "× 2.5 = out of 100". Elementary judges also write a Strength and a Next step and
  answer "Safety / rule concern? Yes / No"; a Yes lands as a red card on the organiser's live Alerts
  board. Every tap on the scoring screen is now kept on the tablet until it is submitted.
- **Why I built it:** The organiser sent the forms they will use on the day and asked whether the app
  could follow them exactly. With 7-minute rounds and 20 items per form, a judge who left the scoring
  screen before pressing Submit lost everything — that was the most dangerous gap I found.
- **Problem(s) encountered:**
  - **"× 2.5" could have touched every piece of maths in the app.** Instead the factor lives in the
    rubric's *steps* (2.5, 5, 7.5, 10, 12.5): totals, rankings, the 60% minimum and the outlier check
    all just see a 100-point rubric, and the "× 2.5" is only a display ("Ratings 32 / 40 × 2.5 = 80 / 100").
  - **A latent bug that would have rewritten every elementary score.** The rubric editor parsed steps and
    maximums with `parseInt`, so merely opening and saving the elementary rubric turned 7.5 into 7 and
    triggered the "this changes N scores" path. My first test for it passed for the wrong reason (it
    auto-confirmed the warning); I rewrote it so an untouched rubric must save with *no* warning, and
    proved it fails when `parseInt` comes back.
  - **A new database column the live site might not have yet.** Without the migration, PostgREST rejects
    the whole score row — and the offline queue would retry it forever. `upsertScore()` retries without
    the new columns only on a genuine "missing column" error and folds the comments and the safety flag
    into the notes, so nothing a judge writes is ever lost.
  - **The judge's home screen had shown the old 42-point scoring guide to every judge on every rubric.**
  - **Two older tests matched departments by text**, which collided with the new form names ("Middle &
    High School form" contains "High School"); fixed by selecting by accessible label.
- **How I solved it:** Two presets with rubric-level settings matched by criteria (no schema change), one
  additive migration for the feedback and safety columns, drafts in localStorage keyed like scores
  (deleted the moment a score is saved or queued — a draft is never a score), and a written rule for each.
- **Skills/tools demonstrated:** modelling a scale factor without spreading it through the code;
  backward-compatible database changes with a narrowly gated fallback; offline-first state on tablets;
  Playwright E2E with **mutation testing** (drafts off → 3 checks fail, fallback off → 2, `parseInt` → 1).
- **Portfolio angle:** "Turned a school's two paper judging forms into the live app's scoring in a day,
  including the paper's own × 2.5 conversion shown on screen, a safety concern that reaches the organiser
  live, and offline drafts so a judge never loses a half-scored project — and found and fixed a latent
  editor bug that would have silently rewritten every elementary score."

### 2026-10-21 — A timed judging schedule the whole app follows
- **Project:** Qritiko (science-fair judging platform)
- **What I built/fixed:** Import of the organiser's own Excel schedule (15 judges × 12 rounds of 7
  minutes, two breaks, a wrap-up). Each judge's tablet now lists their morning in round order — round,
  time, project code, booth — with a NEXT card that moves on after each submit; the schedule becomes the
  single source of who judges what. Plus booth-number import, printable judge sheets and a booth
  visit-times sheet, and event-day support ("not signed in yet", stand-ins, unscheduled-project alerts).
- **Why I built it:** The fair runs on a fixed rotation. The app could only say "every judge scores the
  whole department" or let the app choose panels — neither reproduces a hand-built schedule, and neither
  had rounds or times, so judges would have hunted through an unordered list every eight minutes.
- **Problem(s) encountered:**
  - **Three features could silently undo a printed schedule** — the judge grid, panel Rebalance and the
    Suggested setup all reassign work. All three are switched off while a schedule exists, and Rebalance
    is replaced by "give a stand-in the absent judge's number" (Rebalance knows nothing about rounds and
    could book one judge for two projects at once).
  - **Overriding a server function safely.** Rather than touch the sign-in function, I redefined the one
    helper it calls (`_judge_projects`), so sign-in and every re-sync follow the schedule with no other
    change — and documented that re-running the older migration would undo it, with a test proving the
    re-run order restores it.
  - **Scored work must never vanish.** A re-imported schedule that drops a visit a judge has already
    scored is refused by the database with a message naming the judge and project.
  - **Parsing the real file**: title rows, line breaks inside quoted header cells ("R1\n8:30–8:37"),
    "COMMON BREAK" filler, a legend under the grid, "—" for free rounds, Excel's two CSV encodings.
  - **A test that had worked for months broke** — not from a bug, but because a fixed 700 ms sleep became
    too short once the screen did more. Replaced the sleep with waiting for the actual result.
- **How I solved it:** One table (`judge_schedule`, RPC-only writes, cascade on project delete), two admin
  functions that validate everything server-side, a review screen that blocks bad files before saving,
  and the organiser's real schedule imported through the UI against the 63 live projects: 15 judges, 179
  visits, every code matched, no booth double-booked.
- **Skills/tools demonstrated:** PostgreSQL schema + RLS + SECURITY DEFINER functions tested on real
  Postgres (PGlite, 19 new checks); designing a feature so that existing automation cannot fight it;
  CSV parsing of real-world spreadsheet exports; Playwright E2E with **mutation testing** (3 key
  safeguards each proven to fail when removed).
- **Portfolio angle:** "Made a school's hand-built judging rotation the source of truth for a live
  judging platform — every judge's tablet follows it round by round, the database refuses any change
  that would orphan already-scored work, and the organiser's actual file was verified end to end against
  the real project list before the event."

### 2026-11-03 — Applying a 14-of-63 data revision to a live event database, safely
- **Project:** Qritiko (science-fair judging platform)
- **What I built/fixed:** A tested, all-or-nothing SQL script that applied an organiser's revised
  entry sheet to a live Postgres database — 14 of 63 projects, across a public table and an
  admin-only one — plus a fix for a flaky browser test the work uncovered.
- **Why I built it:** The app's CSV importer only ever *creates* rows, so a corrected sheet cannot be
  re-imported; doing it by hand meant ~24 separate edits five weeks before the event, with student
  names involved. The changes were also bigger than they looked: five entries were effectively
  different projects reusing the same number.
- **Problem(s) encountered:**
  - **I could not see half the change.** Student names live in an admin-only table that my read access
    can't touch. Solved by diffing the NEW sheet against the PREVIOUS one — not against the database —
    which was the only way to surface ten student-list corrections, including one child moved between
    two projects.
  - **A false alarm I caused myself.** My first comparison reported 21 changed projects. Sixteen were
    an artifact: the sheet still prints a category name we had renamed weeks earlier. I'd also queried
    that table without scoping it to one school and briefly reported phantom duplicates from a second
    tenant. Both caught by re-reading my own output before sending it.
  - **The real trap was spelling.** The sheet carried three variants of one category name and one that
    no longer existed. Writing them verbatim would have stranded projects on dead category text — the
    exact bug we'd spent the previous session fixing. The script resolves to live names instead.
  - **A flaky test that would have cost someone a morning.** The full browser chain failed one check
    that passed in isolation. Rather than re-run until green, I traced it: a row written *after* the
    success message, with the neighbouring check already waiting for the same reason.
- **How I solved it:** Verified the blast radius before writing anything — no project changes
  department (so the 179-visit judging schedule and a guard trigger are both unaffected), no student
  ends up in two places, a grade change is inert under the rubric in use, and nothing depends on the
  projects yet. Then one transaction matched on number AND current title, with five guards that abort
  the whole thing — including "any score exists", because a bulk edit stops being safe the moment
  judging starts. **Tested on PGlite** against the real schema and all 18 migrations with a fixture
  mirroring production: 18 checks, each guard proven to abort, and a second run proven to refuse.
- **Skills/tools demonstrated:** PostgreSQL transactional data migration with pre-flight assertions;
  testing a one-off script against a real engine before touching production; three-way data
  reconciliation under read restrictions; diagnosing a write-ordering race in an E2E suite and
  **mutation-testing the fix** (disabled the write, confirmed the check still fails) so a `wait` can't
  silently become a `skip`; keeping PII out of a public repo as a hard constraint.
- **Portfolio angle:** "Applied a 14-of-63 revision to a live event database five weeks before the
  event: diffed the source against both the prior revision and production to surface changes my access
  couldn't read, proved the blast radius empty before writing, shipped it as a guarded all-or-nothing
  transaction tested on a real Postgres instance first, and fixed a flaky test found along the way —
  with the fix mutation-tested so it couldn't hide a genuine failure."


### 2026-11-04 — Two independent audits reconciled, then 17 fixes shipped test-first (incl. a critical score-forgery hole)
- **Project:** Qritiko — Science Fair Judging App (live fair 2026-12-11)
- **What I built/fixed:** Merged two independent pre-event audits (Codex + Claude) into one verified
  list, then fixed the confirmed problems on a branch — each as its own revertable commit with a new
  test: a critical server-side hole that let anyone with the public API key overwrite any judge's
  scores, offline-sync data loss, a false "School Not Found" offline, the wrong scoring form after a
  failed read, stale screens after reconnect, several award/tie bugs that could publish a wrong
  podium, finalize/lock gaps, a school-wide sign-in lockout, admin actions reporting false success,
  and judge-tablet usability.
- **Why I built it:** 10–15 volunteer judges score on mixed tablets over venue Wi-Fi; a lost or forged
  score, or a wrong medal on the public page, is not recoverable on the day.
- **Problem(s) encountered:** Verifying ~110 audit claims across a 12k-line component and 19 SQL
  migrations — none were pure false positives, ~10 were overstated, and a fresh-eyes pass found 12
  issues both audits missed (e.g. an award dropdown that changed the screen before saving, so the
  database could hold two 1st places while the admin saw one). Several first attempts failed their own
  tests: a reconnect refresh throttle that *dropped* the refresh it should have delayed; a tie rule
  ("every tied project decided") that an existing scenario proved too strict; a late-sync flag read from
  state that is not loaded yet on a tablet that reopens offline. One commit went in with a broken build
  because a shell chain used `;` instead of `&&` — caught on the next build, amended, and every later
  commit gated on lint + build. Tooling friction: an IDE linter dumping kilobytes of pre-existing
  warnings on every Markdown edit (worked around with a small checked find-and-replace script), and
  shell quoting repeatedly eating regex backslashes.
- **How I solved it:** Per fix: a new Playwright test written first and run against the unfixed code
  (mutation check — every new check had to fail before the fix), then the fix, lint per-rule baseline
  (React Compiler purity/immutability 28/5 must hold — a drop to 0/0 means a silent bailout), build,
  the related suites, and a full-suite checkpoint per group. The critical hole: a per-judge secret
  issued at sign-in (stored only as a SHA-256 hash in a table nobody can read) and SECURITY DEFINER
  functions that check the secret, the judge's assignment, every rating against the project's own
  rubric steps, and the Finalize/validated state — with the app falling back to the old path only when
  the function is missing, so it can deploy before the SQL. 40 new DB checks on real Postgres (PGlite),
  a fake realtime server via `page.routeWebSocket` to test reconnect behaviour the mock never could.
- **Skills/tools demonstrated:** Postgres RLS + SECURITY DEFINER design, threat modelling an
  anonymous-client architecture, offline-first queue design (per-revision acknowledgement, retry,
  no silent deletion), React 19 + React Compiler lint constraints, Playwright E2E with network
  interception and WebSocket fakes, mutation testing, coupled app/migration rollout planning,
  writing operator-facing runbooks.
- **Portfolio angle:** "Before a live event, reconciled two independent security/reliability audits into
  one verified list and shipped 17 fixes test-first — including closing a critical hole that let anyone
  with a public API key rewrite any judge's score — each fix proven by a test that failed before it and
  passed after, with a zero-downtime rollout plan the organiser can run."
