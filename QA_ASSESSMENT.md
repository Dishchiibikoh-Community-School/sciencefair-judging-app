# QA & Developer Assessment — Science Fair Judging App

> Full code review conducted 2026-03-27.
> Files reviewed: `ScienceFairJudging.jsx` (~2500+ lines), `schema.sql`, `CLAUDE.md`, `AdminInstructions.md`, `JudgeInstructions.md`.
> Work through items in priority order. Items 1–4 are pre-event critical.

---

## CRITICAL BUGS

### 1. `JUDGE_NAMES` hardcoded to 15 — breaks registration when `maxJudges > 15`
- **File:** `src/ScienceFairJudging.jsx` lines 10 and 1533
- Admin can set `maxJudges` to 20 via the UI, but `Judge16`–`Judge20` will always fail registration with "Invalid judge name" because `JUDGE_NAMES` is a fixed array of 15 entries.
- **Fix:** Generate `JUDGE_NAMES` dynamically from `maxJudges`, or increase constant length to 100.

### 2. `openDeliberation` / `closeDeliberation` do NOT persist to Supabase
- **File:** `src/ScienceFairJudging.jsx` lines 1649–1661
- Both functions only call `setDeliberationOpen()` locally — they never update `app_settings.deliberation_open` in Supabase. `loadSettings()` reads from Supabase on load, so any page refresh resets deliberation state silently.
- **Fix:** Add `supabase.from("app_settings").update({ value: "true" }).eq("key", "deliberation_open")` in `openDeliberation`, and `"false"` in `closeDeliberation`.

### 3. Judge can re-score after validating — validation becomes stale
- **File:** `src/ScienceFairJudging.jsx` line 1917
- The `proj-item` click handler is only gated by `locked`. A judge can validate → click a project → re-score → their validation stays "approved" but scores changed. This corrupts the consensus signal.
- **Fix:** Either block scoring after validation, or auto-delete `judgeValidations[judge.id]` when a score is re-submitted.

### 4. `window.prompt` for judge transfer PIN — fails in PWA/standalone mode
- **File:** `src/ScienceFairJudging.jsx` line 1037
- `allowJudgeTransfer()` uses `window.prompt` which can be blocked by iOS Safari and Android browsers in PWA/standalone mode. This flow is most likely used under stress (judge's device died).
- **Fix:** Build a custom modal using the existing PIN gate pattern (`pin-gate` CSS class) instead of `window.prompt`.

### 5. Alerts tab shows wrong max score and wrong deviation threshold
- **File:** `src/ScienceFairJudging.jsx` line 2522
- UI displays `"scored X/100"` and `"Deviation > 20 pts"` — max score is **42**, actual threshold in `getAnomalies()` is **> 8 pts**.
- **Fix:** Update label to `"/42"` and `"Deviation > 8 pts"`.

### 6. `buildDelibReport()` reports `/ 100` — should be `/ 42`
- **File:** `src/ScienceFairJudging.jsx` line 1512
- Copied deliberation report says `Avg Score: X / 100`. This report is distributed as official output.
- **Fix:** Replace `/ 100` with `/ 42`.

---

## HIGH PRIORITY

### 7. `judgeValidations`, `adminValidation`, `resultsFinalized` NOT persisted to Supabase
- **Biggest reliability risk for a live event.** All three are in-memory only.
- If admin refreshes mid-deliberation or post-finalization: all judge validations reset to "Pending", admin must re-approve everything, and the Share tab becomes locked again (even though the share link still exists in Supabase).
- **Fix:** Add a `validations` table `(judge_id, approved, comment, validated_at)` and an `app_settings` row for `results_finalized`. Load and subscribe them the same way other tables are handled. CLAUDE.md already describes this as a planned improvement.

### 8. Judges can submit deliberation notes when deliberation is closed
- `submitDelibNote()` has no check for `deliberationOpen` state.
- **Fix:** Gate `submitDelibNote` on `deliberationOpen === true`.

### 9. No admin brute-force protection
- `handleAdminLogin()` has no rate limiting, no lockout, unlimited password attempts.
- **Fix:** Add attempt counter + lockout after N failures (e.g. 5 attempts → 30s lockout). Log each failed attempt to IT logs (already done) but also enforce a wait.

### 10. No judge sign-out button
- Judges cannot clear their session from a shared tablet without a full admin reset.
- **Fix:** Add a "Sign Out" button on `judge-home` that clears `localStorage` keys (`sf_judge_id`, `sf_judge_data`, `sf_scores_cache`, `sf_offline_queue`) and returns to landing.

### 11. Activity log shows time only (`HH:MM`) — breaks for multi-day events
- **File:** `src/ScienceFairJudging.jsx` lines 2500–2505
- Uses `fmt()` which returns only `"HH:MM"`. `fmtFull()` already exists and should be used here.
- **Fix:** Replace `fmt(e.time)` with `fmtFull(e.time)` in the activity log render.

---

## MEDIUM PRIORITY / UX

### 12. `window.confirm` for project deletion
- **File:** `src/ScienceFairJudging.jsx` line 2451
- Native browser confirm dialogs are inconsistent with the app's design and unreliable in PWA mode.
- **Fix:** Custom confirmation modal using the existing `modal-overlay` / `modal-box` pattern.

### 13. Missing IT log for invalid judge name attempts
- **File:** `src/ScienceFairJudging.jsx` line 1534
- Invalid invite code IS logged (line 1539), but invalid judge name is not.
- **Fix:** Add `addItLog("WARN","AUTH","INVALID_JUDGE_NAME",...)` before returning the name error.

### 14. Abstract criterion visible in scoring form for grades < 5
- `requiresAbstract()` and `allMoved()` handle this correctly in logic, but the Abstract row still appears visually in the scoring form for K–4 projects.
- **Fix:** Conditionally hide the abstract rubric item in the scoring form render with a note like "Not required for grades K–4."

### 15. No search/filter/export on Activity Log
- Large events produce hundreds of entries with no way to filter by judge, project, or date. IT Logs have level filtering — Activity Log has nothing.
- **Fix:** Add keyword/judge filter and optional CSV download.

### 16. No results export (CSV / PDF)
- Final results are view-only. No download for school records or regional fair submission.
- **Fix:** Add export button on the Share tab or Results page that generates a CSV of ranked projects + awards.

### 17. Leaderboard mixes unscored projects with scored ones
- `rankedProjects()` returns all projects sorted by avg descending. Unscored projects sort to 0 and mix with scored projects.
- **Fix:** Split leaderboard into "Scored" and "Not yet scored" sections, or push unscored projects to the bottom explicitly.

### 18. Dead code — `genAlias`, `ADJ`, `ANIM` are never used
- **File:** `src/ScienceFairJudging.jsx` lines 12–13 and 47–49
- Leftover from an earlier design where judges had anonymous aliases. Judges now use `Judge1`–`JudgeN`.
- **Fix:** Remove `genAlias`, `ADJ`, `ANIM`.

---

## RECOMMENDED BUILD ORDER

| # | Fix |
|---|-----|
| 1 | Persist `judgeValidations` + `adminValidation` + `resultsFinalized` to Supabase |
| 2 | Persist `deliberationOpen` to Supabase in `openDeliberation` / `closeDeliberation` |
| 3 | Fix `JUDGE_NAMES` to respect `maxJudges` (use length 100 or dynamic) |
| 4 | Replace `window.prompt` (transfer PIN) with custom modal |
| 5 | Fix scoring after validation — lock or auto-reset |
| 6 | Fix Alerts tab max score label (`/42`) and deviation text (`> 8 pts`) |
| 7 | Fix `buildDelibReport` max score (`/ 42`) |
| 8 | Replace `window.confirm` (project delete) with custom modal |
| 9 | Add admin login rate limiting |
| 10 | Use `fmtFull()` in Activity Log |
| 11 | Hide abstract criterion for grades < 5 in scoring form |
| 12 | Add judge sign-out button |
| 13 | Add CSV/PDF export of final results |
| 14 | Add IT log for invalid judge name attempts |
| 15 | Remove dead code: `genAlias`, `ADJ`, `ANIM` |
