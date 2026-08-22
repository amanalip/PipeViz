# PipeViz Project Plan

A browser based tool that turns Jenkins pipeline definitions into an interactive visual graph.

| | |
|---|---|
| Created | Saturday, 22 August 2026 at 01:36 EDT |
| Last updated | Saturday, 22 August 2026 at 01:36 EDT |
| Status | Planning complete, implementation not started |
| Owner | Aman Ali |

## Table of Contents

1. [Overview](#1-overview)
2. [Goals and Non Goals](#2-goals-and-non-goals)
3. [Background Research](#3-background-research)
4. [Tech Stack](#4-tech-stack)
5. [Architecture](#5-architecture)
6. [Parser Design](#6-parser-design)
7. [Data Model](#7-data-model)
8. [Layout Algorithm](#8-layout-algorithm)
9. [Rendering with React Flow](#9-rendering-with-react-flow)
10. [UI Specification](#10-ui-specification)
11. [Sample Pipeline Corpus](#11-sample-pipeline-corpus)
12. [Testing Strategy](#12-testing-strategy)
13. [Deployment](#13-deployment)
14. [Milestones](#14-milestones)
15. [Risks and Mitigations](#15-risks-and-mitigations)
16. [Open Questions](#16-open-questions)
17. [Sources Checked](#17-sources-checked)

## 1. Overview

PipeViz is a static single page application. A user pastes a Jenkinsfile or uploads one, the app parses it in the browser, builds a model of the pipeline structure, lays the stages out as a directed graph, and renders it with React Flow. No backend is involved at any point, which keeps hosting on GitHub Pages trivial and keeps user code on their own machine.

The visual language follows the horizontal flow made familiar by Jenkins Blue Ocean: stages run left to right, parallel branches stack vertically inside a shared column, and each stage card carries badges for conditions such as `when` or `parallel`. Clicking a card opens a detail panel listing its steps.

## 2. Goals and Non Goals

### Goals

- G1: Parse declarative Jenkinsfiles (the `pipeline { ... }` form) covering stages, parallel blocks, matrix blocks, sequential nested stages, `when` conditions, `post` handlers, `agent`, `environment`, `options`, `parameters`, and `triggers`.
- G2: Provide basic support for scripted pipelines by detecting `stage('name') { ... }` calls anywhere in Groovy code and nesting them by brace containment.
- G3: Render an interactive graph: pan, zoom, node selection, minimap, fit to view.
- G4: Show stage details (steps, raw condition text) in a side panel when a node is selected.
- G5: Accept input three ways: paste into an editor pane, upload a file, pick a built-in sample.
- G6: Degrade gracefully. Any parse failure produces diagnostics with line numbers plus a partial graph of whatever did parse, never a blank screen or a thrown error.
- G7: Deploy automatically to GitHub Pages on push to main.

### Non Goals

- NG1: Executing pipelines or connecting to a live Jenkins controller. Static analysis only.
- NG2: Full Groovy language support. Shared library resolution, arbitrary closure semantics, and class definitions are out of scope.
- NG3: Editing and writing back to Jenkins. The app reads, never writes.
- NG4: Run history or build status visualization. That requires API access and credentials.
- NG5: Mobile layout. The tool targets desktop browsers.

## 3. Background Research

Claims below were verified on Saturday, 22 August 2026.

**Blue Ocean status.** Jenkins documents that Blue Ocean will be deprecated in July 2026 and receives no new functionality or security fixes. The actively maintained successor for execution visualization is the Pipeline Graph View plugin (jenkins.io/projects/blueocean/about). This matters for positioning: PipeViz does not compete with live execution views. It occupies the niche Blue Ocean's editor occupied, understanding the structure of a pipeline definition from source text, without needing a Jenkins server.

**Declarative syntax surface.** Per the Jenkins Pipeline syntax reference (jenkins.io/doc/book/pipeline/syntax), a declarative pipeline has three top level sections (`agent`, `stages`, `post`) and supports these directives inside `stage`: `agent`, `environment`, `tools`, `input`, `when`, plus three structural children: `steps`, `parallel`, and `matrix`, and one more: nested `stages` (sequential groups). A declarative `parallel` block contains only `stage` entries; failFast can be set via `options { parallelsAlwaysUseFresh() }` style options or the `failFast true` argument. Common `when` conditions include `branch`, `tag`, `environment`, `equals`, `expression`, `allOf`, `anyOf`, `not`, `regex`, `buildingTag`, `changeset`, and `changelog`.

**React Flow package name.** React Flow ships as `@xyflow/react` for version 12.x. The older `reactflow` package serves version 11 and is legacy. Verified via npm registry: latest `@xyflow/react` is 12.11.3.

## 4. Tech Stack

Versions recorded from the npm registry on Saturday, 22 August 2026. Exact versions get pinned in package.json at scaffold time.

| Layer | Choice | Version | Why |
|---|---|---|---|
| Build tool | Vite | 8.2.2 | Fast dev server, zero config static output |
| UI framework | React | 19.2.8 | Component model fits graph nodes well |
| Language | TypeScript | 7.0.2 | Current stable line. Fallback plan exists if tooling lags (see Risks) |
| Graph rendering | @xyflow/react | 12.11.3 | Pan/zoom/selection/minimap out of the box, custom node components |
| Test runner | Vitest | 4.1.11 | Native TS, pairs with Vite config |
| Linting | ESLint | 10.9.0 | Standard choice |
| Runtime | Node.js | 24.18.1 (installed locally) | LTS line, matches CI |

Deliberately excluded: state management libraries (component state suffices at this scale), CSS frameworks (hand written CSS keeps the bundle small and avoids fighting defaults), syntax highlighting editors like CodeMirror (a plain textarea with monospace styling is enough for v1; swapping in CodeMirror later touches only one component).

## 5. Architecture

```
Jenkinsfile text
      |
      v
[Tokenizer]        strips comments, tracks line numbers, handles
      |            quoted strings including '''...''' and ${} interpolation
      v
[Block Tree]       balanced brace matching produces a tree of
      |            { header text -> children } blocks
      v
[Interpreter]      walks the tree, recognizes declarative vocabulary,
      |            falls back to scripted stage scanning
      v
PipelineModel      plain data: stages tree + metadata + diagnostics
      |
      +--> [Diagnostics panel]   errors and warnings with line numbers
      |
      +--> [Layout engine]       assigns x/y to every stage node
                 |
                 v
          [React Flow canvas]    custom stage cards + edges
                 |
                 v
          [Details panel]        steps and conditions of selected node
```

Every arrow is a pure function from input to output except the two UI panels. This makes the parser and layout engine unit testable without rendering anything.

File layout under `src/`:

```
src/
  main.tsx              entry
  App.tsx               top level layout and state wiring
  parser/
    tokenize.ts         string/comment aware tokenizer
    blockTree.ts        brace matching into a block tree
    interpret.ts        block tree -> PipelineModel (declarative)
    scripted.ts         fallback scan for scripted pipelines
    index.ts            public parseJenkinsfile(text): PipelineModel
    knownSteps.ts       dictionary of common step names for icons/kinds
  model/
    types.ts            PipelineModel, StageNode, Step, Diagnostic
  layout/
    computeLayout.ts    model -> positioned nodes + edges
  graph/
    StageNodeCard.tsx   custom React Flow node
    FlowCanvas.tsx      React Flow wrapper
  ui/
    EditorPane.tsx      textarea, upload button, sample picker
    DetailsPanel.tsx    selected node inspector
    DiagnosticsBar.tsx  parse errors/warnings summary
  samples/
    index.ts            built-in example Jenkinsfiles
  styles/
    global.css
```

## 6. Parser Design

Hand rolled recursive descent tuned to Jenkinsfile structure rather than a general Groovy parser. Rationale: real world declarative Jenkinsfiles are regular, dependency free parsing keeps the site fast, and a lenient custom parser can produce partial results where a strict grammar parser would just fail.

### 6.1 Tokenizer

- Preserves original line numbers on every token for diagnostics.
- Recognizes Groovy string forms: `'...'`, `"..."`, `'''...'''`, `"""..."""` with backslash escapes. Inside double quoted forms, `${ ... }` interpolation is consumed with brace counting so braces inside expressions do not confuse the matcher.
- Strips `//` line comments and `/* */` block comments outside strings.
- Emits identifiers, strings, numbers, and punctuation `{ } ( ) [ ] , : =`.

### 6.2 Block tree

A single pass over tokens matches braces into `BlockNode { header: Token[], children: BlockNode[], startLine, endLine }`. The header is everything before the opening brace, e.g. `stage('Build')` or `when`. Unmatched braces become diagnostics, and the pass recovers by treating the remainder of input as children of a synthetic root.

### 6.3 Interpreter

Walks the tree against the declarative vocabulary:

- Root check: a top level `pipeline` block means declarative mode. Its `agent`, `environment`, `options`, `parameters`, `triggers`, and `post` sections are read into metadata.
- `stages` contains an ordered list of `stage('Name')` blocks. Order of appearance defines sequence order.
- Inside a stage, exactly one structural child drives the graph shape:
  - `steps`: every statement becomes a `Step` record (name plus raw argument text).
  - `parallel`: child stages fan out into lanes. A boolean `failFast` argument is captured if present.
  - `matrix`: captured as a matrix stage with axes summarized in badges. Expanding one node per axis combination is deferred (see Open Questions).
  - nested `stages`: treated as a sequential sub chain inside this stage.
  - `when`: raw condition text stored for display, not interpreted semantically.
- Unknown blocks are kept as generic steps rather than dropped, so plugins and shared library calls remain visible.

### 6.4 Scripted fallback

If no top level `pipeline` block exists but the text contains `node` or `stage(` calls, scripted mode runs: all `stage('X')` calls are located in document order, nesting derived from block containment ranges, and each stage's body statements are recorded as steps. Output uses the same `PipelineModel` type with `kind: 'scripted'`, so downstream code is identical.

### 6.5 Error handling contract

`parseJenkinsfile` never throws. It always returns a model, possibly empty of stages, plus `Diagnostic[] { severity, message, line }`. Severity levels: `error` (unbalanced braces, unterminated string), `warning` (recognized but unsupported constructs such as exotic when syntax).

## 7. Data Model

```typescript
type StepKind = 'known' | 'unknown' | 'script';

interface Step {
  name: string;        // e.g. 'sh', 'checkout', 'myLibStep'
  args?: string;       // raw text inside parens, trimmed
  kind: StepKind;
  line: number;
}

interface StageNode {
  id: string;                // stable, derived from path e.g. 's2/p1'
  name: string;
  line: number;
  steps: Step[];
  when?: string[];           // raw condition summaries
  agent?: string;
  hasInput?: boolean;
  // structural children, mutually exclusive in practice
  parallelBranches?: StageNode[];
  matrixAxes?: string[];     // axis names when matrix
  sequentialChildren?: StageNode[];
}

interface PostHandler {
  condition: string;         // always, success, failure, unstable, ...
  steps: Step[];
}

interface PipelineModel {
  kind: 'declarative' | 'scripted';
  agent?: string;
  environmentEntries: { key: string; value: string; line: number }[];
  parameters: { name: string; type: string }[];
  triggers: string[];
  postHandlers: PostHandler[];
  rootStages: StageNode[];
  diagnostics: Diagnostic[];
}

interface Diagnostic {
  severity: 'error' | 'warning';
  message: string;
  line: number;
}
```

IDs are path based (`s0`, `s0/p0`, `s0/p0/sq1`) which makes them deterministic across parses of identical input, a requirement for stable React Flow keys and for tests.

## 8. Layout Algorithm

Horizontal flow, Blue Ocean style.

- Sequential siblings occupy successive columns: column index increments left to right.
- A `parallel` group places every branch's first stage in the same column, stacked vertically in lanes. Each branch then continues rightward within its own lane.
- Nested structures recurse: a branch containing its own parallel group gets sub lanes offset vertically within that branch's band.
- The algorithm computes each subtree's bounding box bottom up, then positions parents centered vertically relative to their children. Concretely:

```
layout(subtree) -> { width, height, place(x, y) }
  for a leaf stage: width = NODE_W, height = NODE_H
  for sequential list: sum widths + H_GAP per link; height = max child height
  for parallel group: width = sum of widest per-column widths; height = sum of branch heights + V_GAP
```

Constants for v1: `NODE_W = 220`, `NODE_H = 72`, `H_GAP = 90`, `V_GAP = 36`.

Edges:

- Chain edge between consecutive sequential stages.
- Fan-out edges from the last node before a parallel group to each branch head; fan-in edges from each branch tail to the next sequential stage.
- React Flow edge type `smoothstep`, no animation.

Sanity properties asserted by tests: no two nodes overlap, columns are monotonic along any chain, total canvas size grows linearly with stage count.

## 9. Rendering with React Flow

- One custom node component `StageNodeCard`: title, badge row (step count, `when` marker, `parallel n` marker, `input` marker), colored left border by category (build/test/deploy guessed from name keywords, neutral otherwise).
- Handles: target on the left, source on the right, hidden visually but present for edge attachment.
- Canvas features enabled: `fitView` on load, `<Controls />`, `<MiniMap />` pannable zoomable, dotted `<Background />`.
- Selection: clicking a card selects it in flow and opens the details panel showing full step list with arguments and raw `when` text.
- Node/edge objects are memoized; re-parse creates a fresh graph object keyed by an incrementing revision so stale selections clear cleanly.

## 10. UI Specification

Single screen, three regions:

```
+------------------------------------------------------------------+
| Header: PipeViz | sample picker | Upload | Export PNG | GitHub    |
+------------------+-----------------------------------------------+
| Editor pane      |  Flow canvas                                  |
| (textarea)       |  (React Flow fills remaining space)           |
| line count       |                                               |
| status footer    |                    +------------------+       |
|                  |                    | Details panel    |       |
|                  |                    | (on selection)   |       |
+------------------+-----------------------------------------------+
| Diagnostics bar: "2 errors, 1 warning" click to expand           |
+------------------------------------------------------------------+
```

- Editor pane: fixed 380px wide, resizable via drag handle if cheap. Monospace font, tab inserts spaces. Debounced re-parse 400ms after typing stops.
- Upload accepts `.jenkinsfile`, `Jenkinsfile`, `.groovy`, `.txt` via file input styled as a button.
- Sample picker loads bundled examples without wiping the editor until the user confirms? No: samples replace immediately, undo is out of scope for v1, but a "revert" affordance keeps last manually typed content in memory.
- Export PNG: serialize the canvas using the SVG-in-foreignObject technique is fragile; v1 ships "Copy JSON" of the model instead, PNG export moves to backlog.
- Empty states: no input shows a short how-to card on the canvas; unparseable input shows diagnostics prominently with the partial graph behind them.
- Dark theme only for v1. Light theme is a variable swap later, colors defined as CSS custom properties from day one.

## 11. Sample Pipeline Corpus

Bundled examples double as documentation and parser fixtures:

1. **Simple CI**: checkout, build, test, deploy. Four sequential stages.
2. **Parallel tests**: unit and integration branches converging before deploy.
3. **Matrix**: build across linux/windows with axes declared.
4. **Conditional deploy**: `when { branch 'main' }` and `when { tag pattern: "v*" }` variants, post handlers for success/failure notifications.
5. **Scripted**: node-based classic pipeline with inline stage calls.
6. **Sequential groups**: nested `stages` inside a stage.
7. **Messy real world**: odd indentation, comments mid-block, long step arguments, one deliberately unbalanced brace to exercise diagnostics.

## 12. Testing Strategy

- Parser unit tests in Vitest: each corpus sample asserts exact expected model (stage names, order, parallel grouping, step lists, diagnostic counts). Property checks: parser never throws on random ASCII fuzz inputs; always returns a model.
- Layout unit tests: golden assertions on node positions for the parallel and nested samples; non-overlap property across all corpus files.
- Snapshot tests for the model output only, not rendered DOM.
- No end to end framework in v1; manual smoke checklist lives in this doc section and gets ticked before each release commit: load sample, edit causes re-parse, upload file, export JSON, resize window.

## 13. Deployment

Current `.github/workflows/static.yml` uploads the repository root verbatim. That works for hand written HTML but breaks for a built app. Changes required:

1. Add `actions/setup-node@v4` with `node-version: 24` and npm cache.
2. Run `npm ci && npm run build` before artifact upload.
3. Change artifact path from `'.'` to `'./dist'`.
4. Set `base: './'` in `vite.config.ts` so asset URLs resolve correctly under the project page path `https://<owner>.github.io/PipeViz/`. Relative base is safe here because the app has no client side routing.
5. Keep `permissions: contents: read, pages: write, id-token: write` as already configured.

Verification loop: run the workflow via `workflow_dispatch` after merging, confirm the Pages URL renders and deep refreshes work.

## 14. Milestones

Each milestone ends in one or more commits tracked in commit_tracker.md.

| ID | Scope | Acceptance criteria |
|---|---|---|
| M0 | Docs and scaffold | Repo builds with `npm run dev`; lint passes; both MDs committed |
| M1 | Parser | All 7 corpus samples parse to expected models; fuzz test passes 1000 random inputs without throwing |
| M2 | Layout | Positions computed for all samples; overlap property test green |
| M3 | Canvas | Samples render as graphs; pan/zoom/select/minimap work; details panel populates |
| M4 | Full UI | Paste/upload/sample paths all live; diagnostics bar accurate on messy sample |
| M5 | CI/CD | Pages deploys dist; public URL renders correct app; assets load under /PipeViz/ base |
| M6 | Backlog candidates | PNG export, light theme, matrix axis expansion, URL hash sharing, CodeMirror editor |

Order matters: M1 and M2 are pure logic with tests, M3/M4 make it visible, M5 ships it.

## 15. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Exotic Groovy breaks parser (closures as args, annotations, multiline method chains) | Medium | Partial or wrong graph | Lenient capture of unknown constructs as steps; diagnostics surface what was skipped; corpus grows as users report files |
| TypeScript 7 toolchain friction (editor plugins, ESLint parsers lagging the new major) | Low | Dev experience pain | If friction appears, downgrade devDependency to typescript 5.9.x; app code targets ES2022 either way, no rewrite needed |
| Deeply nested parallel layouts collide or look cramped | Medium | Ugly but correct graph | Bounding box recursion with lane offsets; clamp minimum lane height; test nested fixture explicitly |
| React Flow breaking changes across majors | Low | Rendering regressions | Version pinned in package.json; upgrades deliberate, checked against changelog |
| Users paste secrets into the editor expecting server round trip | Low | Trust concern | Architecture has no network calls beyond static hosting; state stays in memory; note this in README |

## 16. Open Questions

- Q1: Should `matrix` expand into one node per axis combination now or later? Default plan: summarize in badges first, expand behind a toggle in M6.
- Q2: Do we want diff view (paste two versions, highlight structural changes)? Interesting but heavy. Deferred, noted for backlog discussion.
- Q3: Filename conventions: accept any pasted text regardless of filename. Upload filter list may need widening if users have unconventional setups.

## 17. Sources Checked

All accessed Saturday, 22 August 2026:

- jenkins.io/projects/blueocean/about : deprecation July 2026 statement, Pipeline Graph View named successor
- plugins.jenkins.io/blueocean : deprecation banner confirming no further development
- jenkins.io/doc/book/pipeline/syntax : declarative sections, directives, when conditions, matrix structure (long standing reference, re-checked)
- npm registry (via `npm view`): vite 8.2.2, react 19.2.8, react-dom 19.2.8, typescript 7.0.2 (latest tag; beta line 6.0.0-beta), @vitejs/plugin-react 6.1.0, @xyflow/react 12.11.3, vitest 4.1.11, eslint 10.9.0, @types/react 19.2.18, @types/react-dom 19.2.4
- Local environment: node 24.18.1, npm 12.0.2, git history (`git log --format=...`) for existing commits
