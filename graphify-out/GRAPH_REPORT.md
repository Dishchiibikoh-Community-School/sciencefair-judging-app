# Graph Report - sciencefair-judging-app  (2026-11-04)

## Corpus Check
- 73 files · ~296,881 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 567 nodes · 785 edges · 37 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 51 edges (avg confidence: 0.83)
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
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]

## God Nodes (most connected - your core abstractions)
1. `installMock()` - 64 edges
2. `freshStore()` - 38 edges
3. `App()` - 11 edges
4. `as()` - 9 edges
5. `projects table` - 8 edges
6. `scores table` - 7 edges
7. `icons.svg (SVG sprite sheet)` - 7 edges
8. `Favicon SVG` - 6 edges
9. `Wildcat Mascot Illustration` - 6 edges
10. `callGemini()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `newPage()` --calls--> `installMock()`  [INFERRED]
  scripts\e2e\alerts.e2e.mjs → scripts\e2e\mock.mjs
- `newPage()` --calls--> `installMock()`  [INFERRED]
  scripts\e2e\branding.e2e.mjs → scripts\e2e\mock.mjs
- `adminPage()` --calls--> `installMock()`  [INFERRED]
  scripts\e2e\judge-suggest.e2e.mjs → scripts\e2e\mock.mjs
- `newPage()` --calls--> `installMock()`  [INFERRED]
  scripts\e2e\judging.e2e.mjs → scripts\e2e\mock.mjs
- `newPage()` --calls--> `installMock()`  [INFERRED]
  scripts\e2e\lifecycle.e2e.mjs → scripts\e2e\mock.mjs

## Hyperedges (group relationships)
- **Validation & Deliberation Workflow** — sciencefairjudging_submitjudgevalidation, sciencefairjudging_submitadminvalidation, sciencefairjudging_consensusreached, sciencefairjudging_hastie, sciencefairjudging_opendeliberation, sciencefairjudging_finalizeresults, schema_validations [EXTRACTED 1.00]
- **Offline score submission and sync** — sciencefairjudging_submitscore, sciencefairjudging_flushofflinequeue, concept_offline_queue, schema_scores [EXTRACTED 1.00]
- **Project removal cascade** — sciencefairjudging_removeproject, schema_projects, schema_scores, schema_deliberation_notes, schema_final_decisions, schema_judges [EXTRACTED 1.00]
- **** — file:vite.config.js, file:index.html, file:src/main.jsx, concept:PWA [INFERRED 0.95]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (49): adminPage(), check(), newPage(), ok(), check(), judgePage(), ok(), check() (+41 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (38): App(), blankProjForm(), cachedRead(), cacheGet(), cacheSet(), canvasBlob(), cleanSchoolYear(), decodeBrandImage() (+30 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (39): Admin Instructions, Bug Fix Log, Critical Rules (CLAUDE.md), Offline & PWA Support, Security & Access Control, Validation & Deliberation Workflow, Northeast AZ Regional Rubric, sf_offline_queue (localStorage) (+31 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (13): as(), fails(), file(), mig(), ok(), R7(), reg(), regForm() (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (7): adminPage(), check(), lbRow(), newPage(), ok(), place(), rib()

### Community 5 - "Community 5"
Cohesion: 0.18
Nodes (7): adminIn(), box(), newPage(), scrub(), shot(), toWebp(), want()

### Community 6 - "Community 6"
Cohesion: 0.18
Nodes (7): logo.png (PWA icon), Vite Env Vars, PWA Service Worker, Resend Email API, Supabase Client Singleton, send-registration-email handler, registerSW({immediate:true})

### Community 7 - "Community 7"
Cohesion: 0.16
Nodes (4): check(), chips(), group(), ok()

### Community 8 - "Community 8"
Cohesion: 0.16
Nodes (4): check(), layoutOk(), newPage(), ok()

### Community 9 - "Community 9"
Cohesion: 0.19
Nodes (7): adminPage(), awardSelectFor(), check(), inBlockFor(), newPage(), ok(), saveAwardBtnFor()

### Community 10 - "Community 10"
Cohesion: 0.19
Nodes (5): check(), chips(), group(), ok(), placeCell()

### Community 11 - "Community 11"
Cohesion: 0.17
Nodes (3): check(), newPage(), ok()

### Community 12 - "Community 12"
Cohesion: 0.29
Nodes (9): buildPrompt(), buildSchema(), callGemini(), clip(), conf(), fail(), handler(), normaliseForm() (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.21
Nodes (5): adminPage(), check(), judgeIn(), newPage(), ok()

### Community 14 - "Community 14"
Cohesion: 0.25
Nodes (7): check(), maxAll(), ok(), queue(), scoreWith(), submit(), waitQueue()

### Community 15 - "Community 15"
Cohesion: 0.27
Nodes (6): check(), it(), judgeRow(), newPage(), ok(), T()

### Community 16 - "Community 16"
Cohesion: 0.27
Nodes (6): check(), judge(), midRows(), mine1(), newPage(), ok()

### Community 17 - "Community 17"
Cohesion: 0.27
Nodes (5): adminPage(), check(), judgeIn(), newPage(), ok()

### Community 18 - "Community 18"
Cohesion: 0.28
Nodes (4): check(), judgeOpens(), newPage(), ok()

### Community 19 - "Community 19"
Cohesion: 0.25
Nodes (9): Bluesky icon symbol, Discord icon symbol, Documentation icon symbol, GitHub icon symbol, icons.svg (SVG sprite sheet), Purple accent color #aa3bff, Social icon symbol, SVG <symbol> sprite pattern (+1 more)

### Community 20 - "Community 20"
Cohesion: 0.28
Nodes (9): Black Outline/Background, Blue Color Scheme, White Accent, Dishchiibikoh Community School, logo.png (School Logo), PWA App Icon, Science Fair Judging App, Snarling/Roaring Profile Pose (+1 more)

### Community 21 - "Community 21"
Cohesion: 0.29
Nodes (3): check(), newPage(), ok()

### Community 22 - "Community 22"
Cohesion: 0.36
Nodes (6): activeRubric(), adminPage(), check(), newPage(), ok(), totalOf()

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (3): adminPage(), check(), ok()

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (3): installScanMock(), check(), ok()

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (4): check(), deptNames(), newPage(), ok()

### Community 26 - "Community 26"
Cohesion: 0.29
Nodes (7): Blue Accent (#47bfff), Browser Tab Icon Purpose, Favicon SVG, Gaussian Blur Filters, Lightning Bolt / Z-Shape Icon, Purple Color Scheme (#863bff / #7e14ff), Qritiko Brand Identity

### Community 28 - "Community 28"
Cohesion: 0.53
Nodes (5): check(), ok(), opts(), presetValue(), sel()

### Community 29 - "Community 29"
Cohesion: 0.6
Nodes (4): card(), check(), ok(), remove()

### Community 30 - "Community 30"
Cohesion: 0.4
Nodes (1): ErrorBoundary

### Community 31 - "Community 31"
Cohesion: 0.83
Nodes (3): esc(), handler(), loadSchoolBranding()

### Community 33 - "Community 33"
Cohesion: 0.67
Nodes (2): AnimatedBackdrop component, App (ScienceFairJudging.jsx)

### Community 34 - "Community 34"
Cohesion: 0.67
Nodes (1): registration_links table

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (1): it_logs table

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (2): Project Overview (CLAUDE.md), QA Assessment

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (1): share_links table

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (1): score_backups table

## Knowledge Gaps
- **29 isolated node(s):** `AnimatedBackdrop component`, `REG_CATEGORIES constant`, `it_logs table`, `share_links table`, `score_backups table` (+24 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 30`** (5 nodes): `ErrorBoundary`, `.constructor()`, `.getDerivedStateFromError()`, `.render()`, `main.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (3 nodes): `AnimatedBackdrop component`, `App (ScienceFairJudging.jsx)`, `supabaseClient.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (3 nodes): `registration_links table`, `generateRegLink()`, `loadRegLinks()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (2 nodes): `it_logs table`, `addItLog()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (2 nodes): `Project Overview (CLAUDE.md)`, `QA Assessment`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `share_links table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `score_backups table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `installMock()` connect `Community 0` to `Community 4`, `Community 5`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 21`, `Community 22`, `Community 23`, `Community 24`, `Community 25`, `Community 28`, `Community 29`?**
  _High betweenness centrality (0.190) - this node is a cross-community bridge._
- **Why does `deptNames()` connect `Community 25` to `Community 1`?**
  _High betweenness centrality (0.169) - this node is a cross-community bridge._
- **Why does `App()` connect `Community 1` to `Community 25`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **Are the 26 inferred relationships involving `installMock()` (e.g. with `newPage()` and `newPage()`) actually correct?**
  _`installMock()` has 26 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AnimatedBackdrop component`, `REG_CATEGORIES constant`, `it_logs table` to the rest of the system?**
  _29 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._