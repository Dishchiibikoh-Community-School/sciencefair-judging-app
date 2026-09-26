# Graph Report - sciencefair-judging-app  (2026-09-25)

## Corpus Check
- 12 files · ~267,798 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 129 nodes · 134 edges · 15 communities detected
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]

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

### Community 0 - "Community 0"
Cohesion: 0.13
Nodes (18): Bug Fix Log, Critical Rules (CLAUDE.md), Offline & PWA Support, Northeast AZ Regional Rubric, sf_offline_queue (localStorage), app-realtime Supabase channel, Judge Instructions, activity_log table (+10 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (3): App(), fmtFull(), getDivision()

### Community 2 - "Community 2"
Cohesion: 0.18
Nodes (7): logo.png (PWA icon), Vite Env Vars, PWA Service Worker, Resend Email API, Supabase Client Singleton, send-registration-email handler, registerSW({immediate:true})

### Community 3 - "Community 3"
Cohesion: 0.15
Nodes (7): registration_submissions table, deliberation_notes table, final_decisions table, projects table, exportProjListPDF(), REG_CATEGORIES constant, removeProject()

### Community 4 - "Community 4"
Cohesion: 0.2
Nodes (8): Admin Instructions, Security & Access Control, Validation & Deliberation Workflow, app_settings table, allowJudgeTransfer(), completedJudges(), consensusReached(), finalizeResults()

### Community 5 - "Community 5"
Cohesion: 0.25
Nodes (9): Bluesky icon symbol, Discord icon symbol, Documentation icon symbol, GitHub icon symbol, icons.svg (SVG sprite sheet), Purple accent color #aa3bff, Social icon symbol, SVG <symbol> sprite pattern (+1 more)

### Community 6 - "Community 6"
Cohesion: 0.28
Nodes (9): Black Outline/Background, Blue Color Scheme, White Accent, Dishchiibikoh Community School, logo.png (School Logo), PWA App Icon, Science Fair Judging App, Snarling/Roaring Profile Pose (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.29
Nodes (7): Blue Accent (#47bfff), Browser Tab Icon Purpose, Favicon SVG, Gaussian Blur Filters, Lightning Bolt / Z-Shape Icon, Purple Color Scheme (#863bff / #7e14ff), Qritiko Brand Identity

### Community 8 - "Community 8"
Cohesion: 0.33
Nodes (6): exportRegCSV(), exportResultsCSV(), getTotal(), hasTie(), projAvg(), rankedProjects()

### Community 9 - "Community 9"
Cohesion: 0.67
Nodes (2): AnimatedBackdrop component, App (ScienceFairJudging.jsx)

### Community 10 - "Community 10"
Cohesion: 0.67
Nodes (1): registration_links table

### Community 12 - "Community 12"
Cohesion: 1.0
Nodes (1): it_logs table

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (2): Project Overview (CLAUDE.md), QA Assessment

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (1): share_links table

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (1): score_backups table

## Knowledge Gaps
- **29 isolated node(s):** `AnimatedBackdrop component`, `REG_CATEGORIES constant`, `it_logs table`, `share_links table`, `score_backups table` (+24 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 9`** (3 nodes): `AnimatedBackdrop component`, `App (ScienceFairJudging.jsx)`, `supabaseClient.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 10`** (3 nodes): `registration_links table`, `generateRegLink()`, `loadRegLinks()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (2 nodes): `it_logs table`, `addItLog()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (2 nodes): `Project Overview (CLAUDE.md)`, `QA Assessment`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (1 nodes): `share_links table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (1 nodes): `score_backups table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `scores table` connect `Community 0` to `Community 3`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `executeReset()` connect `Community 0` to `Community 4`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `app_settings table` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Favicon SVG` (e.g. with `Browser Tab Icon Purpose` and `Qritiko Brand Identity`) actually correct?**
  _`Favicon SVG` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AnimatedBackdrop component`, `REG_CATEGORIES constant`, `it_logs table` to the rest of the system?**
  _29 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._