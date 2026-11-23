# Handoff between computers — READ THIS FIRST

> For Claude (or Codex) on ANY computer of this project. Read this before pulling, merging or pushing.
> When the steps below are done, update the "Status" line and the log at the bottom, and commit it.

**Status (2026-11-23, home PC):** merged and **pushed to `main`** — no-show projects (rule 87) on top of the booth
code cards. Full browser suite 741/741 across 40 files, `npm test` 311/311, lint 28/5, build clean. Both computers:
`git pull` before starting any new work.

---

## 1. What is on `main` now (pushed 2026-11-23 from the work PC)

| Commit | What |
|---|---|
| `0b2f592` feat(projects): booth code cards with reprint tracking | Projects tab → 🏷️ Booth code cards. See CLAUDE.md → Change History "2026-11-19 — Booth code cards" |
| (this file) docs: HANDOFF.md | This note + a pointer at the top of CLAUDE.md |

Files the code-cards commit touched — **these are where a conflict can happen**:

| File | Exactly what changed | Conflict likelihood |
|---|---|---|
| `src/ScienceFairJudging.jsx` | `ADMIN_HELP_UPDATED` → `"2026-11-19"`; 4 new Q&As at the END of the "Project codes" help section; 1 new line in the "Before the event — checklist" (just above "The day before: ⬇ Download Projects CSV…"); new state block after `importBusy` (`codeCardsPrinted`, `cardDept`, `cardWhich`, `cardNames`, `cardPending`, `cardMsg`); `loadProjects()` selects `updated_at` from project_private and sets `privAt`; `loadSettings()` parses `code_cards_printed`; new functions after `printBoothSheet()` (`cardFingerprint` … `dismissRemovedCards`); `writeProjectPrivate()` gained a 4th `stamp` argument; `createProject()` and `updateProject()` pass it (`privStamp`, `namesChanged`); Projects tab JSX: an amber banner just before the `{/* Participation-form scanner …` comment and a new "Booth code cards" section just before `{/* Export Project List */}` | **High** for `ADMIN_HELP_UPDATED` and help text if the other change also edited help. Medium if it edited `loadProjects`, `createProject`, `updateProject`, `writeProjectPrivate` or the Projects tab. Low elsewhere |
| `CLAUDE.md` | The "Last reviewed" line at the top; a new Change History entry at the top of that list; Admin tabs → `projects` row; `app_settings` row (`code_cards_printed`); Key Functions (code-cards block); rule 37 (new bullet: impure default parameter); Known gaps ("Printouts and codes can go stale" + "Code-card tracking limits"); Browser tests row | **High** — both computers almost certainly edited "Last reviewed" and the top of Change History |
| `AdminInstructions.md` | New "🏷️ Booth code cards" block after "Rubric Breakdown (Expandable)" in the Projects Tab section; one line in Pre-Event Checklist | Medium |
| `package.json` | `test:e2e`: `node scripts/e2e/code-cards.e2e.mjs &&` inserted after `validate-queued.e2e.mjs &&` | Medium if the other change added a test too |
| `scripts/e2e/code-cards.e2e.mjs` | New file | None |

No SQL migration. No new environment variable.

## 2. Steps on the OTHER computer (the one with the unpushed 2026-11-22 changes)

Do these in order. **Never `git push --force`, never `git reset --hard`, never discard either side.**

1. `git status` — see what is uncommitted. Commit it on a branch, NOT on main:
   `git switch -c home-2026-11-22` then `git add <the changed files>` and `git commit`.
   (If the work is already committed on `main` locally, run `git branch home-2026-11-22` to keep a pointer
   to it, then `git switch home-2026-11-22`.)
2. `git fetch origin`
3. Dry-run the merge to see conflicts WITHOUT changing anything:
   `git merge-tree --write-tree origin/main home-2026-11-22` — exit code 0 and no "CONFLICT" lines = clean.
   Also list overlaps: `git diff --stat $(git merge-base origin/main home-2026-11-22) home-2026-11-22`
   and compare with the table in section 1.
4. Merge: `git switch home-2026-11-22` → `git merge origin/main`.
   - **Conflicts in CLAUDE.md "Last reviewed" / Change History:** keep BOTH entries, newest date first.
   - **`ADMIN_HELP_UPDATED`:** keep the LATER date (or today's).
   - **Help Q&As / checklist lines:** keep both.
   - **`package.json` test list:** keep every test from both sides, one `&&` chain.
   - **Code (`src/ScienceFairJudging.jsx`):** read both sides; keep both behaviours. Do not delete the
     code-cards functions or the `privStamp`/`namesChanged` lines in `updateProject`/`createProject`.
5. Checks — all must pass before pushing (see CLAUDE.md):
   - `npx eslint src/ScienceFairJudging.jsx -f json` → still **28 `react-hooks/purity` + 5 `react-hooks/immutability`**
     (0/0 = React Compiler bailout, rule 37 — fix before pushing).
   - `npm run build` clean.
   - Dev server on :5199 with the mock (`VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=x`),
     then at least: `code-cards`, `proj-edit`, `import`, `scan`, `lifecycle`, `help-guide`, plus every e2e file
     that covers what the home change touched. Ideally the full `npm run test:e2e`.
   - `npm test` if anything under `supabase/` or `api/` changed.
6. Only then: `git switch main` → `git merge --ff-only home-2026-11-22` (or merge) → `git push origin main`
   (this DEPLOYS). If push is refused ("non-fast-forward"), someone pushed meanwhile: fetch and repeat from 3.
7. Update this file: Status line + a log row below. Commit with the merge.

## 3. Rules that still apply

- The repo is PUBLIC: never commit student names, the real project CSV, keys, or the staging project id.
  `AGENTS.md`, `.codex/`, `AUDIT_REPORT_*.md`, `ARCHITECTURE_SCALE_REVIEW.md`,
  `CLAUDE_ARCHITECTURE_REVIEW_PROMPT.md` are local-only — do not commit them.
- Push to `main` = production deploy. One implementer at a time (AI_COLLABORATION.md).

## Log

| Date | Computer | What |
|---|---|---|
| 2026-11-19 | work PC | Code cards built on `feat/code-cards` |
| 2026-11-23 | work PC | `feat/code-cards` pushed, merged to `main`, deployed. This file added |
| 2026-11-22 | home PC | No-show projects (rule 87) built + tested (31 checks, 12/12 mutants caught); not pushed |
| 2026-11-23 | home PC | Work committed on `home-2026-11-22`; origin/main merged in (3 files conflicted, both sides kept); lint 28/5, build clean; code-cards, no-show, proj-edit, import, scan, lifecycle, help-guide all pass. Not pushed |
| 2026-11-23 | home PC | setup.e2e fixed (its Category-dropdown locator picked up the code-cards selects — test only); full suite 741/741; pushed to `main` |
