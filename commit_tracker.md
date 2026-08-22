# PipeViz Commit Tracker

Human readable log of every commit on main, plus the planned sequence ahead. Update this file in the same commit series it describes.

| | |
|---|---|
| Created | Saturday, 22 August 2026 at 01:36 EDT |
| Last updated | Saturday, 22 August 2026 at 02:51 EDT |
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
| planned | test(parser) | M1 | Corpus fixtures for 7 samples, never-throw fuzz test, model snapshots |
| planned | feat(layout) | M2 | Column/lane layout engine with bounding box recursion, overlap property tests |
| planned | feat(graph) | M3 | React Flow canvas: StageNodeCard, edges, minimap, fitView, selection wiring |
| planned | feat(ui) | M4 | Editor pane, upload, sample picker, details panel, diagnostics bar |
| planned | style | M4 | Dark theme polish, empty states, responsive split panes |
| planned | ci | M5 | Rework static.yml: setup-node, npm build, upload dist/, vite base './' |
| planned | docs(readme) | M5 | README rewrite describing app, usage, local dev, deployment |
