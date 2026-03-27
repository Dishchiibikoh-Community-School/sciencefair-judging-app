# QA & Developer Assessment — Science Fair Judging App

> Full code review conducted 2026-03-27.
> **All 18 items resolved as of 2026-03-26.** This file is kept for historical reference.

---

## Status: COMPLETE ✅

| # | Issue | Priority | Status |
|---|-------|----------|--------|
| 1 | `JUDGE_NAMES` hardcoded to 15 | Critical | ✅ Fixed — extended to 100 entries |
| 2 | `openDeliberation`/`closeDeliberation` not persisted | Critical | ✅ Fixed — upserts to `app_settings` |
| 3 | Judge can re-score after validating | Critical | ✅ Fixed — `proj-item` gated on `!judgeValidations[judge.id]` |
| 4 | `window.prompt` for transfer PIN | Critical | ✅ Fixed — custom modal using `modal-overlay` pattern |
| 5 | Alerts tab wrong max score / deviation text | Critical | ✅ Fixed — `/42`, `Deviation > 8 pts` |
| 6 | `buildDelibReport` reports `/ 100` | Critical | ✅ Fixed — `/ 42` |
| 7 | Validations + `resultsFinalized` not persisted | High | ✅ Fixed — `validations` table + `app_settings.results_finalized` |
| 8 | Judges can submit delib notes when closed | High | ✅ Fixed — early return if `!deliberationOpen` |
| 9 | No admin brute-force protection | High | ✅ Fixed — 5 attempts → 30s lockout |
| 10 | No judge sign-out button | High | ✅ Already existed in codebase |
| 11 | Activity log shows time only (`HH:MM`) | High | ✅ Fixed — uses `fmtFull()` |
| 12 | `window.confirm` for project deletion | Medium | ✅ Fixed — custom confirmation modal |
| 13 | Missing IT log for invalid judge name | Medium | ✅ Fixed — `INVALID_JUDGE_NAME` warn log added |
| 14 | Abstract visible for grades < 5 | Medium | ✅ Already existed in codebase |
| 15 | No search/filter on Activity Log | Medium | ✅ Fixed — keyword filter added |
| 16 | No results export (CSV) | Medium | ✅ Fixed — `exportResultsCSV()` on Share tab |
| 17 | Leaderboard mixes scored/unscored | Medium | ✅ Fixed — divider row separates them |
| 18 | Dead code (`genAlias`, `ADJ`, `ANIM`) | Medium | ✅ Fixed — removed entirely |
