# Graph Report - .  (2026-05-05)

## Corpus Check
- 16 files · ~251,108 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 127 nodes · 132 edges · 16 communities detected
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.86)
- Token cost: 230,679 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_OfflinePWA & Supabase Realtime|Offline/PWA & Supabase Realtime]]
- [[_COMMUNITY_App Component & Data Mappers|App Component & Data Mappers]]
- [[_COMMUNITY_Build Tooling & Email API|Build Tooling & Email API]]
- [[_COMMUNITY_Validation & Deliberation Workflow|Validation & Deliberation Workflow]]
- [[_COMMUNITY_Project & Department Management|Project & Department Management]]
- [[_COMMUNITY_Social Icon Sprite Sheet|Social Icon Sprite Sheet]]
- [[_COMMUNITY_School Logo & Brand Identity|School Logo & Brand Identity]]
- [[_COMMUNITY_Rubric Scoring & Export|Rubric Scoring & Export]]
- [[_COMMUNITY_Favicon & Qritiko Brand|Favicon & Qritiko Brand]]
- [[_COMMUNITY_Deliberation Notes & Final Decisions|Deliberation Notes & Final Decisions]]
- [[_COMMUNITY_App Entry Points|App Entry Points]]
- [[_COMMUNITY_Registration Link Generation|Registration Link Generation]]
- [[_COMMUNITY_IT Diagnostic Logging|IT Diagnostic Logging]]
- [[_COMMUNITY_Project Documentation|Project Documentation]]
- [[_COMMUNITY_Public Share Links Table|Public Share Links Table]]
- [[_COMMUNITY_Score Backups Table|Score Backups Table]]

## God Nodes (most connected - your core abstractions)
1. `projects table` - 8 edges
2. `scores table` - 7 edges
3. `icons.svg (SVG sprite sheet)` - 7 edges
4. `Favicon SVG` - 6 edges
5. `Wildcat Mascot Illustration` - 6 edges
6. `executeReset()` - 5 edges
7. `judges table` - 5 edges
8. `app_settings table` - 5 edges
9. `validations table` - 5 edges
10. `registration_submissions table` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Judge Instructions` --references--> `submitScore()`  [INFERRED]
  JudgeInstructions.md → src/ScienceFairJudging.jsx
- `Critical Rules (CLAUDE.md)` --references--> `executeReset()`  [EXTRACTED]
  CLAUDE.md → src/ScienceFairJudging.jsx
- `Admin Instructions` --references--> `finalizeResults()`  [INFERRED]
  AdminInstructions.md → src/ScienceFairJudging.jsx
- `Validation & Deliberation Workflow` --references--> `hasTie()`  [EXTRACTED]
  CLAUDE.md → src/ScienceFairJudging.jsx
- `Bug Fix Log` --rationale_for--> `flushOfflineQueue()`  [EXTRACTED]
  CLAUDE.md → src/ScienceFairJudging.jsx

## Hyperedges (group relationships)
- **Validation & Deliberation Workflow** — sciencefairjudging_submitjudgevalidation, sciencefairjudging_submitadminvalidation, sciencefairjudging_consensusreached, sciencefairjudging_hastie, sciencefairjudging_opendeliberation, sciencefairjudging_finalizeresults, schema_validations [EXTRACTED 1.00]
- **Offline score submission and sync** — sciencefairjudging_submitscore, sciencefairjudging_flushofflinequeue, concept_offline_queue, schema_scores [EXTRACTED 1.00]
- **Project removal cascade** — sciencefairjudging_removeproject, schema_projects, schema_scores, schema_deliberation_notes, schema_final_decisions, schema_judges [EXTRACTED 1.00]
- **** — file:vite.config.js, file:index.html, file:src/main.jsx, concept:PWA [INFERRED 0.95]

## Communities

### Community 0 - "Offline/PWA & Supabase Realtime"
Cohesion: 0.17
Nodes (15): Bug Fix Log, Critical Rules (CLAUDE.md), Offline & PWA Support, sf_offline_queue (localStorage), app-realtime Supabase channel, Judge Instructions, activity_log table, judges table (+7 more)

### Community 1 - "App Component & Data Mappers"
Cohesion: 0.14
Nodes (3): App(), fmtFull(), getDivision()

### Community 2 - "Build Tooling & Email API"
Cohesion: 0.18
Nodes (7): logo.png (PWA icon), Vite Env Vars, PWA Service Worker, Resend Email API, Supabase Client Singleton, send-registration-email handler, registerSW({immediate:true})

### Community 3 - "Validation & Deliberation Workflow"
Cohesion: 0.2
Nodes (8): Admin Instructions, Security & Access Control, Validation & Deliberation Workflow, app_settings table, allowJudgeTransfer(), completedJudges(), consensusReached(), finalizeResults()

### Community 4 - "Project & Department Management"
Cohesion: 0.2
Nodes (5): registration_submissions table, departments table, projects table, exportProjListPDF(), REG_CATEGORIES constant

### Community 5 - "Social Icon Sprite Sheet"
Cohesion: 0.25
Nodes (9): Bluesky icon symbol, Discord icon symbol, Documentation icon symbol, GitHub icon symbol, icons.svg (SVG sprite sheet), Purple accent color #aa3bff, Social icon symbol, SVG <symbol> sprite pattern (+1 more)

### Community 6 - "School Logo & Brand Identity"
Cohesion: 0.28
Nodes (9): Black Outline/Background, Blue Color Scheme, White Accent, Dishchiibikoh Community School, logo.png (School Logo), PWA App Icon, Science Fair Judging App, Snarling/Roaring Profile Pose (+1 more)

### Community 7 - "Rubric Scoring & Export"
Cohesion: 0.25
Nodes (8): Northeast AZ Regional Rubric, exportRegCSV(), exportResultsCSV(), getTotal(), hasTie(), projAvg(), rankedProjects(), RUBRIC constant (10 criteria, 42pt)

### Community 8 - "Favicon & Qritiko Brand"
Cohesion: 0.29
Nodes (7): Blue Accent (#47bfff), Browser Tab Icon Purpose, Favicon SVG, Gaussian Blur Filters, Lightning Bolt / Z-Shape Icon, Purple Color Scheme (#863bff / #7e14ff), Qritiko Brand Identity

### Community 9 - "Deliberation Notes & Final Decisions"
Cohesion: 0.4
Nodes (3): deliberation_notes table, final_decisions table, removeProject()

### Community 10 - "App Entry Points"
Cohesion: 0.67
Nodes (2): AnimatedBackdrop component, App (ScienceFairJudging.jsx)

### Community 11 - "Registration Link Generation"
Cohesion: 0.67
Nodes (1): registration_links table

### Community 13 - "IT Diagnostic Logging"
Cohesion: 1.0
Nodes (1): it_logs table

### Community 14 - "Project Documentation"
Cohesion: 1.0
Nodes (2): Project Overview (CLAUDE.md), QA Assessment

### Community 20 - "Public Share Links Table"
Cohesion: 1.0
Nodes (1): share_links table

### Community 21 - "Score Backups Table"
Cohesion: 1.0
Nodes (1): score_backups table

## Knowledge Gaps
- **29 isolated node(s):** `AnimatedBackdrop component`, `REG_CATEGORIES constant`, `it_logs table`, `share_links table`, `score_backups table` (+24 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `App Entry Points`** (3 nodes): `AnimatedBackdrop component`, `App (ScienceFairJudging.jsx)`, `supabaseClient.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Registration Link Generation`** (3 nodes): `registration_links table`, `generateRegLink()`, `loadRegLinks()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `IT Diagnostic Logging`** (2 nodes): `it_logs table`, `addItLog()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Project Documentation`** (2 nodes): `Project Overview (CLAUDE.md)`, `QA Assessment`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Public Share Links Table`** (1 nodes): `share_links table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Score Backups Table`** (1 nodes): `score_backups table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `scores table` connect `Offline/PWA & Supabase Realtime` to `Deliberation Notes & Final Decisions`, `Rubric Scoring & Export`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `executeReset()` connect `Offline/PWA & Supabase Realtime` to `Validation & Deliberation Workflow`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `app_settings table` connect `Validation & Deliberation Workflow` to `Offline/PWA & Supabase Realtime`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Favicon SVG` (e.g. with `Browser Tab Icon Purpose` and `Qritiko Brand Identity`) actually correct?**
  _`Favicon SVG` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AnimatedBackdrop component`, `REG_CATEGORIES constant`, `it_logs table` to the rest of the system?**
  _29 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Component & Data Mappers` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._