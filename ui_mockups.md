# PipeViz UI Mockups

ASCII reference for every screen and state of the app. This document is the
source of truth for building the UI (milestones M3 and M4). Desktop-first:
the tool targets laptop/web browsers at ≥1280px; everything below 900px
degrades gracefully (see §16).

| | |
|---|---|
| Created | Saturday, 22 August 2026 |
| Status | Reference for M2–M4 implementation |
| Owner | Aman Ali |

## Table of Contents

1. [How To Read These Mockups](#1-how-to-read-these-mockups)
2. [Design Language](#2-design-language)
3. [Application Shell](#3-application-shell)
4. [State 01 · First Load (Empty)](#4-state-01--first-load-empty)
5. [State 02 · Sequential Pipeline Loaded](#5-state-02--sequential-pipeline-loaded)
6. [Stage Card Anatomy](#6-stage-card-anatomy)
7. [Edges & Containers](#7-edges--containers)
8. [State 03 · Parallel Pipeline + Selection](#8-state-03--parallel-pipeline--selection)
9. [Details Panel](#9-details-panel)
10. [State 04 · Matrix & Conditional Stages](#10-state-04--matrix--conditional-stages)
11. [State 05 · Parse Errors](#11-state-05--parse-errors)
12. [Header Anatomy](#12-header-anatomy)
13. [Editor Pane Anatomy](#13-editor-pane-anatomy)
14. [Diagnostics Bar States](#14-diagnostics-bar-states)
15. [Status Bar Variants](#15-status-bar-variants)
16. [Narrow Window Fallback](#16-narrow-window-fallback)
17. [Interaction Model](#17-interaction-model)
18. [Region → Component Map](#18-region--component-map)
19. [Dimension Cheat Sheet](#19-dimension-cheat-sheet)

---

## 1. How To Read These Mockups

| Glyph | Meaning |
|---|---|
| `┌─┐ │ └─┘` | Single-line box — static chrome (header, panes, bars) |
| `╔═╗ ║ ╚═╝` | Double-line box — elevated surfaces: floating panels, **selected** nodes, parallel/matrix/sequential containers |
| `╭─╮ ╰─╯` | Round box — marketing / empty-state cards |
| `█` | Colored category stripe on the left edge of a stage card |
| `[chip]` | Button, pill, or badge |
| `(chip)` | Disabled / coming-soon chip |
| `──▶` | Edge (smoothstep in the real app); flow direction |
| `--▶` | Dashed edge into an unparsed region |
| `░░░` | Ghost / dimmed fill (unparsed material) |

Colors cannot render in ASCII; hex values live in §2. Where a mockup shows
`██`, read "accent color here".

---

## 2. Design Language

Dark theme is the default. Every value below already exists as a CSS custom
property in `src/styles/global.css` — the mockups consume them verbatim.
M6 added an opt-in light scheme as a `[data-theme='light']` override of the
same tokens (header toggle, persisted in localStorage), so this table stays
the dark-truth reference and the light palette lives beside it in one file.

### Color tokens

| Token | Value | Used for |
|---|---|---|
| `--bg-0` | `#0f172a` | Page gradient start |
| `--bg-1` | `#1e293b` | Page gradient end |
| `--surface` | `rgba(30,41,59,.55)` | Panels over canvas |
| `--surface-strong` | `rgba(30,41,59,.85)` | Cards, floating panels |
| `--border` | `rgba(148,163,184,.16)` | Hairlines |
| `--border-strong` | `rgba(148,163,184,.30)` | Hover borders |
| `--ink` | `#f1f5f9` | Primary text |
| `--ink-secondary` | `#94a3b8` | Secondary text |
| `--ink-muted` | `#64748b` | Metadata, placeholders |
| `--accent` | `#22d3ee` | Selection, focus, brand lanes |
| `--accent-2` | `#38bdf8` | Gradient partner |
| `--success` | `#34d399` | Ready dot, deploy stripe |
| `--warning` | `#fbbf24` | Warning diagnostics |
| `--danger` | `#f87171` | Error diagnostics |

Stage category stripes (proposed mapping, derived from the accent family):

| Category | Stripe | Guessed from name containing |
|---|---|---|
| build | `#22d3ee` cyan | build, compile, package |
| test | `#a78bfa` violet | test, spec, verify |
| deploy | `#34d399` emerald | deploy, release, ship, publish |
| neutral | `#94a3b8` slate | anything else |

### Type & shape

| Role | Font | Size |
|---|---|---|
| UI chrome | system-ui stack | 13–15px |
| Editor / code args | ui-monospace stack | 13px, tab-size 2 |
| Card titles | UI stack, weight 650 | 13px |
| Badges/chips | UI stack | 11–12px |

Radii: 6px controls · 10px panels · 16px big cards. One soft ambient shadow
(`--shadow-card`) floats panels above the canvas. Focus ring: 2px `--accent`.

---

## 3. Application Shell

Single screen, three regions. Editor pane is a fixed 380px; the canvas eats
everything else. The bottom bar is the status bar at M0–M3 and grows into the
diagnostics bar at M4.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ REGION 1 · HEADER                                                        height ≈ 52px │
├────────────────────────────┬───────────────────────────────────────────────────────────┤
│ REGION 2A · EDITOR PANE    │ REGION 2B · FLOW CANVAS                                   │
│ width 380px, fixed         │ React Flow fills the remainder                            │
│ scrolls vertically         │ pans + zooms infinitely, dotted grid background           │
├────────────────────────────┴───────────────────────────────────────────────────────────┤
│ REGION 3 · STATUS / DIAGNOSTICS BAR                 ≈34px collapsed, expands ≤240px    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. State 01 · First Load (Empty)

Editor shows its placeholder; canvas shows the how-to card. Privacy promise is
always visible in the status bar.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ◉ PipeViz  ⟨ Jenkinsfile → graph ⟩         [ Samples ▾ ]  [ Upload ]  [ Copy JSON ]  [ GitHub ↗ ] │
├────────────────────────────┬───────────────────────────────────────────────────────────┤
│ PIPELINE SOURCE            │                                                           │
│                            │            ╭─────────────────────────────────────╮        │
│ # Paste a Jenkinsfile here.│            │                ●───┓                │        │
│ #                          │            │                    │                │        │
│ # Example:                 │            │                ●───┼──▶             │        │
│ pipeline {                 │            │                    │                │        │
│   agent any                │            │                ●───┛                │        │
│   stages {                 │            │                                     │        │
│     stage('Build') {       │            │         Paste a Jenkinsfile.        │        │
│       steps {              │            │           See your pipeline.        │        │
│         sh 'make build'    │            │                                     │        │
│       }                    │            │    [ Paste ]   ( Upload )   ( Samples )      │
│     }                      │            │                                     │        │
│   }                        │            │      Nothing leaves your browser.   │        │
│ }                          │            ╰─────────────────────────────────────╯        │
│                            │                                                           │
│ 0 lines · 0 words          │                                                           │
├────────────────────────────┴───────────────────────────────────────────────────────────┤
│ ● Ready · 0 errors, 0 warnings          No backend: your code stays in this tab   v0.1.0 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- Chips communicate honest availability: `Paste` is live from day one,
  `Upload` and `Samples` arrive with M4 (round parens = coming soon).
- The round-corner card uses `--surface-strong`, radius-lg, shadow-card, and
  a subtle rise-in animation (disabled under prefers-reduced-motion).
- Tab inserts two spaces in the textarea; caret never leaves the editor.

---

## 5. State 02 · Sequential Pipeline Loaded

User pasted the "Simple CI" sample. Four stage cards flow left to right,
joined by chain edges. Debounced re-parse runs 400ms after typing stops.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ◉ PipeViz  ⟨ Jenkinsfile → graph ⟩         [ Samples ▾ ]  [ Upload ]  [ Copy JSON ]  [ GitHub ↗ ] │
├────────────────────────────┬───────────────────────────────────────────────────────────┤
│ PIPELINE SOURCE            │  sample · Simple CI                                       │
│                            │                                                           │
│ pipeline {                 │  ┌────────────┐   ┌────────────┐   ┌────────────┐         │
│   agent any                │  │█ Checkout  │──▶│█ Build     │──▶│█ Test     │──▶│
│                            │  │█ 2 steps   │   │█ 3 steps   │   │█ 4 steps   │  ┌─────│
│   stages {                 │  └────────────┘   └────────────┘   └────────────┘   │█Dep│
│     stage('Checkout') {    │                                                     │█ 2s│
│       steps {              │                                                    └─────│
│         checkout scm      │
│       }                    │                                                    ┌────────┐
│     }                      │                                                    │ fit│
│                            │                                                    └────────┘
│   }                       │
├────────────────────────────┴───────────────────────────────────────────────────────────┤
│ ● Ready · declarative · 4 stages        No backend: your code stays in this tab   v0.1.0 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

Hmm — the fourth card got clipped above. Corrected, this is how the full row
actually lays out:

```
  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
  │█ Checkout  │──▶│█ Build     │──▶│█ Test      │──▶│█ Deploy    │
  │█ 2 steps   │   │█ 3 steps   │   │█ 4 steps   │   │█ 2 steps   │
  └────────────┘   └────────────┘   └────────────┘   └────────────┘
```

Reading the cards: bold title, quiet badge row beneath, colored category
stripe down the left edge (cyan build / violet test / emerald deploy here).

---

## 6. Stage Card Anatomy

Zoomed view of one node (`NODE_W = 220px`, `NODE_H = 72px` in the real app):

```
                    target                 source
                      │                      │
                      ▼                      ▼
        ┌─────────────────────────────────────────┐
        │██ Test                                  │
        │██ 4 steps · WHEN · IN                   │
        └─────────────────────────────────────────┘
         ↑
         category stripe, 3px, full card height
```

- Handles exist on both sides but are invisible; edges attach to them.
- Title row: stage name, weight 650, ink color.
- Badge row: quiet chips separated by middots (glossary below).

Badge glossary:

| Chip | Appears when | Source construct |
|---|---|---|
| `4 steps` | always | number of entries in `steps` |
| `WHEN` | stage has conditions | `when { ... }` |
| `PAR ×n` | parallel group | `parallel { }` with n branches |
| `IN` | stage waits for approval | `input { ... }` |
| `MATRIX` | axis build | `matrix { axes { ... } }` |
| `SEQ` | nested stage group | `stages { }` inside a stage |

Interaction states (left → right): default · hover · selected · ghost:

```
┌────────────┐  ┌────────────┐  ╔════════════╗  ┌────────────┐
│█ Build     │  │█ Build     │  ║█ Build     ║  │░░░░░░░░░░░░│
│█ 3 steps   │  │█ 3 steps   │  ║█ 3 steps   ║  │░ unparsed ░│
└────────────┘  └────────────┘  ╚════════════╝  └────────────┘
                border brightens  double ring,     dimmed fill,
                (--border-strong) glow (--accent)  dashed edges in
```

Selection additionally opens the Details Panel (§9).

---

## 7. Edges & Containers

```
chain edge          ┌────────┐      ┌────────┐
                    │ Build  │─────▶│  Test  │          smoothstep
                    └────────┘      └────────┘

fan-out / fan-in    ┌────────┐     ╔══════════════╗     ┌────────┐
(parallel group)    │ Build  │────▶║ PARALLEL     ║────▶│ Deploy │
                    └────────┘     ║ ┌──────────┐ ║     └────────┘
                                   ║ │ Unit     │ ║
                                   ║ └──────────┘ ║
                                   ║ ┌──────────┐ ║
                                   ║ │ Integr.  │ ║
                                   ║ └──────────┘ ║
                                   ╚══════════════╝
                                   container carries the
                                   PAR ×2 badge + failFast

sequential group    ┌────────┐     ╔══════════════════╗     ┌────────┐
                    │ Build  │────▶║ SEQUENTIAL · QA  ║────▶│ Deploy │
                    └────────┘     ║ ① Static checks  ║     └────────┘
                                   ║       │          ║
                                   ║       ▼          ║
                                   ║ ② Tests          ║
                                   ╚══════════════════╝
                                   one entry, one exit;
                                   vertical edges preserve order

partial (unparsed)  ┌────────┐      ┌────────────┐
                    │ Build  │── - -│░ unparsed ░│       dashed stroke
                    └────────┘  - - └────────────┘
```

Layout constants (v1): `NODE_W 220 · NODE_H 72 · H_GAP 90 · V_GAP 36`.
Outer sequential siblings occupy successive columns. Parallel branches stack
in lanes. Nested `stages` stay compact until expanded into a vertical,
numbered container. Parents center against their structural children.
Expanded container headers use a two-row title and metadata layout. Container
width grows deterministically with the complete owner name and visible chips,
so structural labels do not collapse into ambiguous ellipses.

---

## 8. State 03 · Parallel Pipeline + Selection

The hero shot. "Parallel tests" sample loaded; user clicked **Unit tests**
(double ring). Controls sit bottom-left, minimap bottom-right.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ◉ PipeViz  ⟨ Jenkinsfile → graph ⟩         [ Samples ▾ ]  [ Upload ]  [ Copy JSON ]  [ GitHub ↗ ] │
├────────────────────────────┬───────────────────────────────────────────────────────────┤
│ PIPELINE SOURCE            │  sample · Parallel tests                                  │
│                            │                                                           │
│ pipeline {                 │  ┌──────────────┐     ╔════════════════════╗              │
│   agent any                │  │█ Build       │ ──▶ ║ PARALLEL failFast  ║              │
│                            │  │█ 3 steps     │     ╚════════════════════╝              │
│   stages {                 │  └──────────────┘    ┌──────────────────────┐│
│     stage('Build') {       │                       │ ╔══════════════════╗││
│       steps {              │                       │ ║█ Unit tests      ║││
│         sh 'make build'    │                       │ ║█ 4 steps         ║││
│       }                    │                       │ ╚══════════════════╝││
│     }                      │                       │ ┌──────────────────┐││
│                            │                       │ │█ Integration     │││
│     stage('Tests') {       │                       │ │█ 6 steps         │││
│       parallel {           │                       │ └──────────────────┘││
│         stage('Unit') {... │                      └──────────────────────┘│
│         stage('Integr.…    │                                                           │
│ 41 lines · 168 words       │  ┌──────┐                                ┌────────────┐│
├────────────────────────────┤  │  +   │                                 │ ░▓▓░ ▪▪▪   │   │
│ ● Ready · declarative      │  │  -   │                                 │ ░░▓░ ▪▪   ││
│ · 4 stages · 15 steps      │  │ fit  │                                └────────────┘│
└────────────────────────────┘  └──────┘                                                  │
```

(The frame above squeezes the bottom row for print; in the app the controls
and minimap float over the canvas corner while the status bar runs the full
window width, exactly as in §5.)

What M3 wires up here:

- Click card → selects it in flow, opens details panel, dims nothing else.
- `fitView` on load; Controls = zoom in / out / fit-view; drag background pans.
- Minimap is pannable; viewport rectangle tracks the main camera.
- Dotted `Background` (22px grid) sits behind everything, `--ink-muted` dots.

---

## 9. Details Panel

Clicking any card floats this panel over the canvas, right-aligned
(`--surface-strong`, radius-md, shadow-card, 320px wide). Escape, the ✕, or
clicking empty canvas closes it.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ◉ PipeViz  ⟨ Jenkinsfile → graph ⟩         [ Samples ▾ ]  [ Upload ]  [ Copy JSON ]  [ GitHub ↗] │
├────────────────────────────┬───────────────────────────────────────────────────────────┤
│ PIPELINE SOURCE            │  ╔════════════════════════════════╗                       │
│ pipeline {                 │  ║ STAGE · Unit tests           ✕ ║                       │
│   agent any                │  ║ line 14 · category test        ║                       │
│   stages {                 │  ╠════════════════════════════════╣                       │
│     stage('Build') {...    │  ║ STEPS (4)                      ║                       │
│     stage('Tests') {       │  ║ ▸ sh 'npm test --coverage'     ║                       │
│       parallel {           │  ║ ▸ sh 'npm run lint'            ║                       │
│         stage('Unit') {…   │  ║ ▸ junit 'reports/*.xml'        ║                       │
│                            │  ║ ▸ slackSend '#ci'              ║                       │
│                            │  ╠════════════════════════════════╣                       │
│                            │  ║ WHEN                           ║                       │
│                            │  ║ branch 'main'                  ║                       │
│                            │  ╠════════════════════════════════╣                       │
│                            │  ║ AGENT                          ║                       │
│                            │  ║ docker 'node:20-bookworm'      ║                       │
│                            │  ╠════════════════════════════════╣                       │
│                            │  ║ POST · failure                 ║                       │
│                            │  ║ ▸ mail to:'oncall@acme.dev'    ║                       │
│                            │  ╚════════════════════════════════╝                       │
├────────────────────────────┴───────────────────────────────────────────────────────────┤
│ ● Ready · selection: Unit tests         No backend: your code stays in this tab  v0.1.0 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

Panel field rules:

| Section | Content |
|---|---|
| Header | `STAGE · <name>`, close affordance always reachable |
| Subline | source line number + guessed category (ties card ↔ code) |
| STEPS | every step: name + raw argument text in mono, scrollable |
| WHEN | raw condition text, verbatim, never interpreted |
| AGENT | stage-level agent override if present |
| POST | handler condition + its steps. Stage-scoped handlers render as `POST · condition`; pipeline-level post waits for a selectable root surface, which v1 does not have (visible in Copy JSON instead) |

Sections hide entirely when empty — no stub rows.

---

## 10. State 04 · Matrix & Conditional Stages

**Matrix** renders as a container summarizing its axes; one-node-per-combo
expansion is the M6 **Expand matrix** toggle on the canvas toolbar, not the
default. Collapsed stays exactly what the frame below draws:

```
  ┌────────────┐   ╔═════════════════╗   ┌────────────┐
  │█ Build     │──▶║ MATRIX os × jdk ║──▶│█ Publish   │
  │█ 3 steps   │   ╚═════════════════╝   │█ 2 steps   │
  └────────────┘   ║ ┌───────────┐     ║   └────────────┘
                   ║ │linux/jdk17│     ║
                   ║ └───────────┘     ║
                   ║ ┌───────────┐     ║
                   ║ │windows/jdk│     ║
                   ║ └───────────┘     ║
                   ║    + 2 more       ║
                   ╚═══════════════════╝
```

**Conditional deploy**: `when` badges on the card; clicking reveals the raw
condition text in the details panel.

```
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │█ Deploy      │────▶│█ Production  │────▶│█ Notify      │
  │█ 2 steps     │     │█ 3 steps     │     │█ 1 step      │
  └──────────────┘     │█ WHEN        │     │█ POST        │
                       └──────────────┘     └──────────────┘
                              ▲ only runs on
                                branch 'main' / v* tags
```

---

## 11. State 05 · Parse Errors

The contract: **never a blank screen**. Whatever parsed renders as usual;
unparsed regions become ghosts joined by dashed edges; the status bar expands
into the diagnostics list. Clicking a diagnostic jumps the editor caret to
that line.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ◉ PipeViz  ⟨ Jenkinsfile → graph ⟩         [ Samples ▾ ]  [ Upload ]  [ Copy JSON ]  [ GitHub ↗ ] │
├────────────────────────────┬───────────────────────────────────────────────────────────┤
│ PIPELINE SOURCE            │  parse failed: showing what parsed                       │
│ // nightly (draft)         │                                                           │
│ pipeline {                 │  ┌────────────┐   ┌────────────┐   ┌────────────┐         │
│   agent any                │  │█ Checkout  │──▶│█ Build     │--▶│░░░░░░░░░░░░│         │
│   stages {                 │  │█ 2 steps   │   │█ 3 steps   │   │░ unparsed ░│         │
│     stage('Checkout') {... │  └────────────┘   └────────────┘   └────────────┘         │
│     stage('Build') {       │                                          ┌────────────┐   │
│       steps {              │                                          │░░░░░░░░░░░░│   │
│         sh 'make build'    │                                          │░ unparsed ░│   │
│       }                    │                                          └────────────┘   │
│     stage('Test') {        │                                                           │
│       xray scan ./out      │  --▶ dashed = edge into unparsed material                 │
│ 58 lines · 210 words       │                                                           │
├────────────────────────────┴───────────────────────────────────────────────────────────┤
│ ⚠ 2 errors · 1 warning · click a row to jump to its line               [ Collapse ▴ ]  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  ✕ 42   error     Unbalanced '}' — expected closing brace for stage 'Test'             │
│  ▲ 17   warning   Unknown directive 'xray'; captured as generic step                   │
│  ✕ 58   error     Unterminated string literal opened at line 58                        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Partial graph: 3 of 5 stages rendered                                                  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

Rules:

- Severity icons: `✕` error (danger red) · `▲` warning (amber). Line number
  right-aligned, severity word, message. Hover highlights the row; click
  focuses the editor line and flashes the related node if one exists.
- Ghost cards are laid out by the normal algorithm (they reserve real space),
  filled `░`, non-clickable. Shipped at M7: a ghost titles itself with the
  recovered stage name when the demoted call carried one
  (`░ Never Reached ░`), subline `unparsed · lines <start>-<end>`;
  nameless regions fall back to `░ unparsed ░`.
- Fixing the last error collapses the bar back to a one-line summary.

---

## 12. Header Anatomy

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ ◉ PipeViz  ⟨ Jenkinsfile → graph ⟩  [ Samples ▾ ] [ Upload ] [ Copy JSON ]                   │
│                                     [ Copy link ] [ Export PNG ] [ Light mode ] [ GitHub ↗ ] │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
   │    │        │                          │         │          │           │           │
   │    │        │                          │         │          │           │           └ external link, new tab
   │    │        │                          │         │          │           └ M6 theme toggle (Light mode ⇄ Dark mode), persisted
   │    │        │                          │         │          └ M6: downloads the graph as PNG; disabled while nothing parses
   │    │        │                          │         └ M6: copies the page URL whose hash reopens this pipeline
   │    │        │                          └ copies PipelineModel JSON to clipboard
   │    │        └ file input styled as button (.groovy/.txt/Jenkinsfile)
   │    └ dropdown of bundled samples (below)
   └ logo mark (The Branch), 28px, links nowhere; wordmark is plain HTML text, tagline is the quiet pitch pill
```

(The ASCII frames elsewhere in this document predate M6 and draw the shorter
four-chip header; the anatomy above is the authoritative chip set. The header
wraps under the brand on tight windows rather than shrinking chips.)

Sample picker open state — native-feeling menu, keyboard navigable:

```
                                            ┌─────────────────────────┐
                                            │ Simple CI               │
                                            │ Parallel tests          │
                                            │ Matrix                  │
                                            │ Conditional deploy      │
                                            │ Scripted (classic)      │
                                            │ Sequential groups       │
                                            │ Messy real world   ⚠ 1  │
                                            └─────────────────────────┘
```

Choosing a sample replaces the editor contents immediately (undo is out of
scope for v1); "Messy real world" intentionally ships a broken brace so the
diagnostics story demos itself.

---

## 13. Editor Pane Anatomy

Fixed 380px column, three stacked parts. M6 note: the plain textarea is now
a CodeMirror 6 editor (Groovy highlighting, line numbers, active-line
marker, undo history, line wrapping) behind the same component API — the
anatomy and behaviors below are unchanged:

```
┌────────────────────────────┐
│ PIPELINE SOURCE            │  label bar, uppercase micro-caps
├────────────────────────────┤
│                            │
│ pipeline {                 │  editor: mono 13px, tab = 2 spaces,
│   agent any                │  spellcheck off, focused by default,
│   stages {                 │  debounced re-parse 400ms after typing
│     stage('Build') {       │
│       steps {              │
│         sh 'make build'    │
│       }                    │
│     }                      │
│   }                        │
│ }                          │
│                            │
├────────────────────────────┤
│ 14 lines · 42 words        │  footer counters, quiet metadata
└────────────────────────────┘
```

- Upload accepts `.jenkinsfile`, `Jenkinsfile`, `.groovy`, `.txt` via a
  hidden file input triggered from the header button.
- The pane keeps its own scroll; the canvas never scrolls with it.

---

## 14. Diagnostics Bar States

One region, four appearances (left dot/icon encodes state, text confirms it —
color never works alone):

```
healthy     │ ● Ready · declarative · 4 stages · 11 steps                    │ success green
busy        │ ◐ Parsing… · 3 stages so far                                   │ accent pulse
warn        │ ▲ 1 warning · click to expand                                  │ amber
error       │ ⚠ 2 errors · 1 warning · click a row to jump   [ Collapse ▴ ]  │ danger red, expanded
```

Expanded anatomy is shown in §11. Collapse/expand persists during the session.

---

## 15. Status Bar Variants

Right-hand version chip reflects the deployed build (helps issue reports):

```
● Ready · declarative · 4 stages · 11 steps    No backend: your code stays in this tab    v0.1.0
● Ready · scripted · 3 stages                  No backend: your code stays in this tab    v0.1.0
◐ Parsing…                                     No backend: your code stays in this tab    v0.1.0
⚠ 2 errors · 1 warning                         Partial graph: 3 of 5 stages rendered       v0.1.0
```

`scripted` appears when the parser falls back to `stage()` scanning (no
`pipeline {}` root) — same graph language, honest about the mode.

---

## 16. Narrow Window Fallback

Below 900px the workspace stacks (desktop remains the target; this is
graceful degradation, not a mobile layout):

```
┌──────────────────────────────────────┐
│ HEADER                               │
├──────────────────────────────────────┤
│ EDITOR PANE      max-height 44dvh    │
├──────────────────────────────────────┤
│                                      │
│ FLOW CANVAS          fills remainder │
│                                      │
├──────────────────────────────────────┤
│ STATUS BAR   (privacy note hidden)   │
└──────────────────────────────────────┘
```

---

## 17. Interaction Model

| Trigger | Feedback |
|---|---|
| Type in editor | status flips to `Parsing…`, debounce 400ms, graph re-renders in place |
| Click stage card | select ring + details panel opens; click bg or Esc closes |
| Double-click nested-stage card | expands it into a sequential React Flow subflow |
| Double-click expanded sequential group | collapses it to one summary card |
| Double-click leaf card | selects the stage's first line in the editor |
| Click selected-node toolbar | expand/collapse the structure or jump to source |
| Press `/` outside an editor/input | focuses graph search; matching nodes glow while context remains visible |
| Toggle Focus path | directed predecessors and successors brighten; unrelated sibling lanes dim |
| Expand All / Collapse All | materializes or summarizes every available sequential group |
| Scroll / pinch on canvas | zoom toward cursor; Controls buttons mirror it |
| Drag background | pan; minimap viewport rectangle follows |
| Click minimap | recenters main camera there |
| Pick sample | editor replaced instantly, structural preferences and stale selection clear |
| Upload file | same path as paste |
| Copy JSON | model serialized to clipboard; button flashes "Copied ✓" for 1.5s |
| Click diagnostic | caret jumps to line; related node flashes once if rendered |
| Toggle Expand matrix | matrix stage swaps between compact card and one combo card per cell inside a MATRIX container; view refits while stable selection is preserved when possible (M6, §10) |
| Toggle theme chip | dark ⇄ light via token override; canvas dots/minimap/edges swap palettes; choice persists across visits (M6) |
| Copy link | URL with `#p=<source>` hash lands on the clipboard; "Copied ✓" flash; opening it restores editor + graph + sample caption (M6) |
| Export PNG | graph framed by React Flow camera math renders to a downloaded PNG; button flashes "Export failed" on renderer errors (M6) |
| Keyboard | Tab edits safely inside the editor; focus ring visible on all chrome |
| Window < 900px | panes stack vertically (§16) |

---

## 18. Region → Component Map

| Mockup region | Component (planned) | File |
|---|---|---|
| Header | App shell | `src/App.tsx` |
| Header · Samples ▾ | SamplePicker | `src/ui/SamplePicker.tsx` |
| Editor pane | EditorPane | `src/ui/EditorPane.tsx` |
| Flow canvas | FlowCanvas | `src/graph/FlowCanvas.tsx` |
| Stage cards | StageNodeCard | `src/graph/StageNodeCard.tsx` |
| Details panel | DetailsPanel | `src/ui/DetailsPanel.tsx` |
| Bottom bar | DiagnosticsBar | `src/ui/DiagnosticsBar.tsx` |
| Card data | computeLayout output | `src/layout/computeLayout.ts` |

M6 additions to the map:

| Concern | Module | File |
|---|---|---|
| Matrix combos behind §10's toggle | pure combination math | `src/layout/matrixCombos.ts` |
| Export PNG chip | canvas renderer + framing math | `src/graph/exportPng.ts` |
| Copy link / shared URLs | base64url source ⇄ hash codec | `src/share/hash.ts` |
| Theme toggle palettes | scheme plumbing + canvas colors | `src/theme.ts` |

Reusable graph-system additions:

| Concern | Module | File |
|---|---|---|
| Compact/expanded sequential geometry | recursive group layout | `src/layout/computeLayout.ts` |
| Parent-child grouping and directional handles | React Flow conversion | `src/graph/toFlow.ts` |
| Search, Focus Path, minimap semantics, bulk controls | canvas toolkit | `src/graph/FlowCanvas.tsx` |
| Selected-node actions | NodeToolbar renderers | `src/graph/StageNodeCard.tsx`, `src/graph/FlowCanvas.tsx` |
| Provider-neutral metadata | normalized model contract | `src/model/types.ts` |

Implementation notes, kept true to the reference:

- The §15 "Partial graph: N of M stages rendered" line computes M as an
  upper bound: a count of `stage(` call sites in the raw source (the parser
  cannot know how many stages broken source should contain). Ghost cards
  count toward what rendered: once every stage call is a card or a ghost,
  the graph itself accounts for the whole file and the note steps aside.
  It only appears when error diagnostics exist and the bound still exceeds
  rendered surfaces. The canvas also mounts on unparsed material alone -
  a broken file with zero parsed stages shows its ghost plus diagnostics,
  never the cheerful how-to card (§11: never a blank screen).
- Shipped at M7 (previously deferred): stage calls that brace recovery
  demoted - an unclosed brace swallowing later stages, or a stray `}`
  dropping one out of scope - become ghost cards joined by dashed edges.
  parser/unparsed.ts reports every stage-shaped block whose source line
  never rendered as an UnparsedRegion (matrix cell stages are excluded:
  their MATRIX card accounts for them); layout chains one dimmed ░ card
  per region after whatever parsed; ghosts are non-selectable, so no
  details panel ever opens for them and they stay out of stage/step
  tallies.

---

## 19. Dimension Cheat Sheet

| Constant | Value | Where |
|---|---|---|
| Header height | ≈52px (12px padding + 28px mark) | `.app-header` |
| Editor width | 380px default, drag/keyboard resizable | `.editor-pane`, `.editor-resizer` |
| Card size | 220 × 72px | layout constants |
| Horizontal gap | 90px | between columns |
| Vertical gap | 36px | between lanes |
| Details panel | 320px wide, floats right | §9 |
| Diagnostics collapsed | ≈34px; expanded ≤240px | §11, §14 |
| Background dots | 22px grid, 1px radius | canvas |
| Narrow breakpoint | 900px | §16 |

---

*End of mockups. When implementation deviates for good reason, update this
file in the same commit so the reference stays true.*
