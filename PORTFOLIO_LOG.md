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
