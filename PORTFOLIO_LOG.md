# Portfolio Log — Qritiko (Science Fair Judging App)

Honest, specific notes on work done, for later portfolio/interview use.

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
