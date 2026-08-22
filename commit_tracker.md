# PipeViz Commit Tracker

Human readable log of every commit on main, plus the planned sequence ahead. Update this file in the same commit series it describes.

| | |
|---|---|
| Created | Saturday, 22 August 2026 at 01:36 EDT |
| Last updated | Saturday, 22 August 2026 at 05:30 PM EDT |
| Branch tracked | main |
| Owner | Aman Ali |

## Table of Contents

1. [Purpose](#1-purpose)
2. [Conventions](#2-conventions)
3. [Commit Log Format](#3-commit-log-format)
4. [History](#4-history)
5. [Planned Commits](#5-planned-commits)

## 1. Purpose

- Keep a readable narrative of what changed and why, independent of git tooling.
- Map planned work (project_plan.md milestones) to actual commits so scope drift is visible.
- Give every markdown file a clear record of when it was last touched and by which commit.

## 2. Conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/):

```
<type>(<optional scope>): <imperative summary, max ~72 chars>
```

Types used here:

| Type | Meaning |
|---|---|
| feat | user visible functionality |
| fix | bug fix |
| docs | markdown or comments only |
| refactor | code movement/structure, no behavior change |
| test | tests only |
| style | formatting, CSS |
| chore | build, deps, configs |
| ci | workflow files |

Rules of thumb:

- One logical change per commit; parser + its tests may share a commit.
- Never mix generated files (package-lock.json) into feature commits without the feature itself.
- Markdown updates that document a change ride along in the same commit when practical; standalone doc commits use `docs:`.

## 3. Commit Log Format

History table columns:

| Column | Content |
|---|---|
| Hash | short hash from `git log --oneline` |
| Date | human readable, e.g. `Sat, 22 Aug 2026 01:40 EDT` |
| Type/scope | conventional commit type and optional scope |
| Summary | what changed and, when non obvious, why |

Status column for planned items: `planned`, `in progress`, `done` (moved into History once committed).

## 4. History

Newest first.

| Hash | Date | Type/scope | Summary |
|---|---|---|---|
| 6ee0e83 | Sat, 22 Aug 2026 at 05:28 PM EDT | fix(ui) | Copy link no longer drops the /PipeViz/ deployment subpath: pageUrlWithHash assembles share URLs from location parts instead of resolving the raw hash against the origin (regression-tested); nine effect tints (selection ring, chip/pill borders, copied/failed flashes, dot glow, row hover) tokenized with byte-identical dark values and deeper light-theme counterparts; header nav JSX indentation tidy |
| e75d9ec | Sat, 22 Aug 2026 at 05:20 PM EDT | feat(graph) | M7 ghost cards for unparsed source regions (mockups §11): parser/unparsed.ts reports stage-shaped blocks whose line never rendered as UnparsedRegions (matrix cells excluded, nested demotions collapsed); layout chains one dimmed ░ leaf per region with stable u<i> ids; toFlow renders inert non-selectable ghost nodes, dashes edges into them, fainter minimap swatch; App keeps ghosts out of stage/step tallies while counting them toward the partial-graph bound, and mounts the canvas on unparsed material alone instead of the how-to card when errors hold content; messy sample now draws Checkout → Smoke Test → Broken Tail → ghost 'Never Reached' |
| c93630c | Sat, 22 Aug 2026 at 04:16 PM EDT | style(ui) | purge em dashes from shipped copy |
| ce9a126 | Sat, 22 Aug 2026 at 04:15 PM EDT | docs(plan) | M6 complete: record the five feature commits, update plan/mockups/README to match shipped reality (hash backfilled by the M7 tracker pass) |
| bf72dd0 | Sat, 22 Aug 2026 at 04:08 PM EDT | feat(editor) | CodeMirror 6 source editor behind EditorPane's unchanged API: Groovy highlighting via StreamLanguage with token-bound colors (theme flips restyle it for free), line numbers, active line, bracket matching, history, wrapping; Tab still indents two spaces; controlled shell over uncontrolled view with echo guard; revealLine now selects + centers the line. Six exact-pinned @codemirror/@lezer packages; chunkSizeWarningLimit raised to 900 with rationale |
| 03cf9be | Sat, 22 Aug 2026 at 03:58 PM EDT | feat(ui) | Light color scheme behind a persisted header toggle: [data-theme='light'] token overrides, hardcoded chrome rgba values moved onto tokens, theme.ts (sanitize/load/store + CANVAS_PALETTES for dots/minimap/edges that CSS cannot reach), ReactFlow colorMode follows, index.html pre-paint script kills the dark flash on reload; dark palette byte-identical to pre-theme values |
| 6742bd5 | Sat, 22 Aug 2026 at 03:44 PM EDT | feat(ui) | URL hash sharing: pipeline source as base64url UTF-8 under #p=, dependency-free codec whose decode never throws (bad payloads boot empty); App boots settled from the hash with sample-provenance restore; replaceState sync keeps typing out of history; Copy link button flushes unsaved edits before writing the clipboard |
| 2fd9b86 | Sat, 22 Aug 2026 at 03:34 PM EDT | feat(ui) | Export PNG via html-to-image 1.11.13: pure frameFor sizing math (2400px cap / 640px floor / degenerate guard), getNodesBounds + getViewportForBounds framing so only .react-flow__viewport renders (no controls/minimap/caption leakage), FlowApi.exportPng bridge, header button with Rendering.../Export failed states disabled while nothing parses |
| d62c3c9 | Sat, 22 Aug 2026 at 03:29 PM EDT | feat(graph) | Matrix axis expansion behind canvas toggle: parser captures matrixAxisValues/matrixExcludes/matrixCellSteps, layout/matrixCombos computes deterministic combos minus Jenkins-style exclude rules, computeLayout({expandMatrix}) reuses parallel container machinery for synthesized combo lanes, toFlow containers gain kind parallel/matrix with axis chips, App adds Expand/Collapse matrix pill shown only when a matrix exists; snapshots updated for extended model |
| a968a0c | Sat, 22 Aug 2026 at 03:03 PM EDT | docs(readme) | M5 README rewrite: live-site link and v0.1.0 status (M0–M5), features/usage sections for the shipped app (samples, upload, details panel, Copy JSON, diagnostics jump-to-line), deployment section documenting the build-and-deploy workflow, repository layout expanded to the real src/ tree, ui_mockups.md added to doc index |
| 3b590ae | Sat, 22 Aug 2026 at 03:00 PM EDT | ci(static) | M5 Pages deploy fix — site previously blank because static.yml uploaded the repo root verbatim, serving unbuilt source. Workflow now splits into build + deploy jobs: setup-node@v4 (node 24, npm cache), npm ci, npm run build (typecheck included), artifact path ./dist; vite base './' was already in place from scaffold so dist assets resolve under /PipeViz/. Verified locally: npm ci clean, 212 tests green, lint/typecheck/build pass, dist/index.html emits relative ./assets URLs |
| (pending) | Sat, 22 Aug 2026 at 02:55 PM EDT | docs(tracker) | M4 style row complete: record style(ui) commit 82a32bf, backfill pending hashes |
| 82a32bf | Sat, 22 Aug 2026 at 02:54 PM EDT | style(ui) | M4 polish closeout: canvas caption pill top-left showing `sample · <name>` while editor content matches a bundled sample and flipping to "parse failed — showing what parsed" whenever errors exist over rendered stages (§5/§8/§11); sample picks now settle instantly with revision bump + stale-selection clear per §17 instead of riding the 400ms typing debounce, provenance drops on edit/upload/paste; empty-state footnote aligned to §4 wording ("Nothing leaves your browser."); hardcoded details-head hex tokenized as --surface-solid. 212 tests green, lint/typecheck/build clean |
| c3e7d6e | Sat, 22 Aug 2026 at 02:38 PM EDT | docs(tracker) | M4 complete: record feat(ui) commit e7ff7cd, mark milestone done |
| e7ff7cd | Sat, 22 Aug 2026 at 02:33 PM EDT | feat(ui) | Full input + inspection layer: EditorPane extraction with revealLine() caret API; header sample picker (keyboard menu, defect badges from real parses), upload via hidden file input, Copy JSON with Copied-✓ flash; DetailsPanel (STEPS/WHEN/AGENT/stage POST, hide-empty, Escape/✕ close through FlowApi selection bridge); DiagnosticsBar with busy/ready/warn/error states, expandable ✕/▲ rows auto-expanding on new problems, click-to-jump caret + node flash, partial-graph note from a stage-call upper bound (messy sample: 3 of 4); double-click card jumps editor line; empty-state chips now all-live; 16 new helper tests |
| 8faa877 | Sat, 22 Aug 2026 at 02:07 PM EDT | docs(tracker) | M3 complete: record feat(graph) commit ad1cef1, mark milestone done |
| ad1cef1 | Sat, 22 Aug 2026 at 02:06 PM EDT | feat(graph) | React Flow canvas wired end to end on a 400ms debounced re-parse: StageNodeCard (220x72, category stripe, badge row), parallel parents rebuilt as subflow containers with relative-coordinate math from geometric containment, dotted background, controls, pannable/zoomable category-colored minimap, smoothstep arrow edges, click-to-select reporting to App; status bar grows Parsing/Ready/diagnostics/selection states; 21 converter/category tests |
| (pending) | Sat, 22 Aug 2026 at 01:25 PM EDT | docs(tracker) | M2 complete: record feat(layout) commit 193397c, mark milestone done |
| 193397c | Sat, 22 Aug 2026 at 01:25 PM EDT | feat(layout) | Column/lane bounding-box layout engine: sequential columns, parallel containers with stacked lanes and fan-out/fan-in edges, inline unfolding of nested stages, matrix leaves; 46 golden/property tests (overlap, bounds, monotonic chains, determinism, linear growth, risk-R3 nested fixture) |
| (pending) | Sat, 22 Aug 2026 at 03:20 EDT | docs(tracker) | M1 complete: record fix(parser) and test(parser) commits, mark milestone done |
| b5e5b7f | Sat, 22 Aug 2026 at 03:20 EDT | test(parser) | Seven-sample corpus fixtures (src/samples), 129-test suite: tokenizer/blockTree/statements/interpret/scripted units, exact per-sample model assertions, model snapshots, seeded 1000-input never-throw fuzz |
| 55937a2 | Sat, 22 Aug 2026 at 03:20 EDT | fix(parser) | Three correctness gaps surfaced by corpus probing: steps block no longer overwrites sibling generic-step capture; failFast captured in documented placements (adjacent to parallel and inside the group); unterminated string literals now emit error diagnostics and keep their full recovered text |
| 2b597fb | Sat, 22 Aug 2026 at 02:51 EDT | feat(parser) | Declarative interpreter plus scripted fallback producing PipelineModel with diagnostics; knownSteps dictionary, parseJenkinsfile never-throw entry point |
| f694517 | Sat, 22 Aug 2026 at 02:40 EDT | feat(parser) | Tokenizer and block tree with line tracking, Groovy string/interpolation handling, comment stripping, statement splitting, brace-recovery diagnostics |
| 59bf7da | Sat, 22 Aug 2026 at 02:17 EDT | docs(tracker) | M0 complete: record scaffold commit 7376885 in tracker |
| 7376885 | Sat, 22 Aug 2026 at 02:17 EDT | chore(scaffold) | M0 complete: Vite + React + TypeScript app shell (header, editor pane, canvas empty state, status bar); TS pinned to 5.9.3 per plan risk fallback; lint/typecheck/build/dev smoke all green |
| f22f201 | Sat, 22 Aug 2026 at 01:55 EDT | docs(branding) | Add logo assets (public/logo.svg, public/favicon.svg) and Branding section in project_plan.md |
| 2d3bae3 | Sat, 22 Aug 2026 at 01:40 EDT | docs | Add project_plan.md and commit_tracker.md with TOCs and timestamps |
| 9e6a01f | Sat, 22 Aug 2026 | ci | Create static.yml GitHub Pages deploy workflow (repo root upload) |
| 4b1f14a | Sat, 22 Aug 2026 | chore | Initial commit: README, LICENSE, .gitattributes |

## 5. Planned Commits

Mapped to milestones in project_plan.md section 14. Order is sequential; hashes get filled in after each push.

| Status | Planned type/scope | Milestone | Summary |
|---|---|---|---|
| done (recorded in History) | docs(branding) | M0 | Add logo assets (The Branch concept) and branding section in plan |
| done (recorded in History) | docs(readme) | M0 | Rewrite README with logo, TOC, status, stack links, doc index |
| done (recorded in History) | chore(scaffold) | M0 | Vite + React + TypeScript scaffold: package.json, tsconfig, vite config, index.html, minimal App, .gitignore. TypeScript pinned to 5.9.3 per plan risk fallback (typescript-eslint peer range blocks 7.x); stack table and README updated to match. **Milestone M0 complete.** |
| done (recorded in History) | feat(parser) | M1 | Tokenizer and block tree with line tracking and string/comment handling |
| done (recorded in History) | feat(parser) | M1 | Declarative interpreter plus scripted fallback producing PipelineModel with diagnostics |
| done (recorded in History) | fix(parser) | M1 | Correctness gaps surfaced by the test suite: steps-block overwrite, failFast placements, unterminated-string diagnostics |
| done (recorded in History) | test(parser) | M1 | Corpus fixtures for 7 samples, never-throw fuzz test, model snapshots. **Milestone M1 complete: 129 tests green, lint/typecheck/build clean, acceptance criteria met** |
| done (193397c) | feat(layout) | M2 | Column/lane layout engine with bounding box recursion (measure + band-centered placement), parallel containers and fan-out/fan-in edges, inline nested-stage unfolding; overlap/bounds/monotonicity/linearity property tests plus corpus goldens. **Milestone M2 complete: 175 tests green (129 parser + 46 layout), lint/typecheck/build clean** |
| done (ad1cef1) | feat(graph) | M3 | React Flow canvas: StageNodeCard, parallel subflow containers, smoothstep arrow edges, dotted background, controls, pannable/zoomable minimap, fitView-per-revision and selection wiring; 400ms debounced re-parse in App with honest status bar states. **Milestone M3 canvas acceptance met: samples render as graphs via paste, pan/zoom/select/minimap work, converter covered by 21 tests (196 total green), lint/typecheck/build clean** |
| done (e7ff7cd) | feat(ui) | M4 | Editor pane extraction with revealLine caret API; header sample picker (keyboard menu, parse-derived defect badges), upload (.jenkinsfile/Jenkinsfile/.groovy/.txt), Copy JSON flash; DetailsPanel (STEPS/WHEN/AGENT/stage-scoped POST, hide-empty rules); DiagnosticsBar (busy/ready/warn/error, expandable rows, jump-to-line + node flash, partial-graph note). **Milestone M4 acceptance met: paste/upload/sample paths all live, diagnostics bar accurate on the messy sample (2 errors + partial graph), 212 tests green, lint/typecheck/build clean**. Ghost cards/dashed edges deferred until the parser emits unparsed markers; ui_mockups.md §18 updated in-commit |
| done (82a32bf) | style | M4 | Dark theme polish, empty states, responsive split panes. Delivered incrementally across the scaffold/M3/M4 commits (tokens, how-to card, 900px stacking); closed out by 82a32bf: canvas sample/parse-failed captions, instant sample settle, --surface-solid token, §4 footnote wording. **Milestone M4 fully complete** |
| done (3b590ae) | ci | M5 | Rework static.yml: setup-node, npm build, upload dist/, vite base './'. **Milestone M5 complete: workflow builds on node 24 and deploys dist/; public URL renders the built app** |
| done (a968a0c) | docs(readme) | M5 | README rewrite describing app, usage, local dev, deployment |
| done (d62c3c9) | feat(graph) | M6 | Matrix axis expansion: parser captures axis values/excludes/cell steps, pure combo math with Jenkins exclude semantics, layout toggle reusing container machinery, MATRIX container headers, canvas toolbar pill; snapshots updated for the richer model |
| done (2fd9b86) | feat(ui) | M6 | PNG export via html-to-image: React Flow camera framing, viewport-only rendering, header button with honest busy/failure states, framing math unit-tested |
| done (6742bd5) | feat(ui) | M6 | URL hash sharing: never-throw base64url codec, hash-boot with sample provenance restore, replaceState sync, Copy link button |
| done (03cf9be) | feat(ui) | M6 | Light theme: token overrides + chrome tokens extracted, canvas palette module, persisted toggle, pre-paint script against dark flash |
| done (bf72dd0) | feat(editor) | M6 | CodeMirror 6 editor swap behind the unchanged EditorPane API; Groovy highlighting themed via CSS variables; six exact-pinned packages. **Milestone M6 complete: all five backlog candidates shipped, 253 tests green, lint/typecheck/build clean** |
| done (e75d9ec) | feat(graph) | M7 | Unparsed-region ghosts (mockups §11): parser unparsed-region markers from demoted stage calls (matrix cells excluded), layout ghost leaves with stable ids, inert ghost node type + dashed edges + minimap swatch, App tallies/bound/canvas-gating updates, hatched card styling; 20 new tests (273 total). **Milestone M7 complete: lint/typecheck/build clean** |
| done (6ee0e83) | fix(ui) | M7 | Share-link subpath regression fixed (pageUrlWithHash keeps /PipeViz/ in copied URLs, regression-tested); effect tints tokenized for theme coherence with byte-identical dark values; JSX/whitespace tidies |
| done (this commit) | docs(plan/tracker/mockups) | M7 | Sync all three MDs to shipped reality: plan gains the M7 milestone and parser/unparsed.ts in the layout tree, mockups §11/§18 replace the deferral note with the implementation contract, tracker records both M7 commits plus backfilled ce9a126/c93630c history rows |
