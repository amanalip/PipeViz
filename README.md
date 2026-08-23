<p align="center">
  <img src="public/logo.svg" width="140" alt="PipeViz logo: three pipeline lanes merging into one flow ending in an arrowhead">
</p>

<h1 align="center">PipeViz</h1>

<p align="center">Paste a Jenkinsfile. See your pipeline.</p>

<p align="center">
  <a href="https://amanalip.github.io/PipeViz/">Live site</a> ·
  <a href="#5-usage">Usage</a> ·
  <a href="#6-local-development">Local development</a>
</p>

| | |
|---|---|
| Created | Saturday, 22 August 2026 at 01:36 EDT |
| Last updated | Saturday, 22 August 2026 at 04:10 PM EDT |
| Status | M0–M6 complete: parser, layout, canvas, full UI, Pages auto-deploy, plus the whole M6 batch (matrix expansion, PNG export, share links, light theme, CodeMirror editor). The app version lives only in [package.json](package.json) and is injected into the UI at build time. |
| License | [GPL-3.0](LICENSE) |

## Table of Contents

1. [What Is PipeViz](#1-what-is-pipeviz)
2. [Current Status](#2-current-status)
3. [Features](#3-features)
4. [Tech Stack](#4-tech-stack)
5. [Usage](#5-usage)
6. [Local Development](#6-local-development)
7. [Deployment](#7-deployment)
8. [Repository Layout](#8-repository-layout)
9. [Documentation](#9-documentation)
10. [Branding](#10-branding)
11. [License](#11-license)

## 1. What Is PipeViz

PipeViz is a browser based tool that turns Jenkins pipeline definitions into an interactive visual graph. You paste or upload a Jenkinsfile, the app parses it entirely client side, and renders stages, parallel branches, matrix axes, conditions, and steps as a horizontal stage graph in the style made familiar by Jenkins Blue Ocean.

No backend, no accounts, no pipeline code leaving your machine. The whole thing is a static site hosted on GitHub Pages.

## 2. Current Status

Shipped:

- **Parser** (M1): hand rolled tokenizer + block tree + declarative interpreter, with a scripted `stage()` fallback; never throws, always returns a model plus line-numbered diagnostics
- **Layout engine** (M2): Blue Ocean style column/lane layout with parallel fan-out/fan-in and nested stage unfolding
- **Canvas** (M3): React Flow rendering with pan, zoom, minimap, selection, and category-colored stage cards
- **Full UI** (M4): editor pane with debounced re-parse, file upload, seven bundled samples, details panel, Copy JSON export, expandable diagnostics bar with click-to-jump
- **CI/CD** (M5): every push to main builds `dist/` and deploys it to GitHub Pages automatically
- **M6 batch**: matrix axis expansion behind a canvas toggle, Export PNG of the graph, share links that encode the pipeline in the URL, a persisted light/dark theme toggle, and a CodeMirror 6 editor with Groovy highlighting

## 3. Features

- Declarative pipeline support: stages, `parallel` blocks (with failFast), `matrix` blocks with axis values and excludes, sequential nested stages, `when` conditions, `input`, stage/pipeline `post` handlers, agent and environment metadata
- Matrix expansion toggle: one card per axis combination (exclude rules applied), or the compact MATRIX summary card
- Share links: the pipeline rides in the URL hash, so a pasted Jenkinsfile is one "Copy link" away from being shared; opening such a link restores editor, graph, and even sample provenance
- Export PNG: download the current graph as an image, framed by React Flow's own camera math (no controls or minimap in the shot)
- Light and dark color schemes: dark is the default, the toggle persists locally
- Scripted pipeline fallback: detects `stage('name')` calls anywhere in Groovy and nests them by brace containment
- Graceful failure: parse errors produce line-numbered diagnostics alongside a partial graph of whatever parsed — never a blank screen
- Category stripes guessed from stage names: cyan build/test-violet/emerald-deploy/slate neutral
- Everything runs in your browser; nothing is uploaded anywhere

## 4. Tech Stack

Versions verified against the npm registry on Saturday, 22 August 2026:

| Layer | Choice | Version |
|---|---|---|
| Build tool | [Vite](https://www.npmjs.com/package/vite) | 8.2.2 |
| UI framework | [React](https://www.npmjs.com/package/react) | 19.2.8 |
| Language | [TypeScript](https://www.npmjs.com/package/typescript) | 5.9.3 |
| Graph rendering | [@xyflow/react](https://www.npmjs.com/package/@xyflow/react) (React Flow 12) | 12.11.3 |
| Code editor | [@codemirror/*](https://www.npmjs.com/package/codemirror) 6 + [@codemirror/legacy-modes](https://www.npmjs.com/package/@codemirror/legacy-modes) Groovy | see package.json (exact-pinned) |
| PNG export | [html-to-image](https://www.npmjs.com/package/html-to-image) | 1.11.13 |
| Test runner | [Vitest](https://www.npmjs.com/package/vitest) | 4.1.11 |
| Linting | [ESLint](https://www.npmjs.com/package/eslint) | 10.9.0 |
| Runtime | [Node.js](https://nodejs.org/) | 24 LTS |

## 5. Usage

1. Open <https://amanalip.github.io/PipeViz/>.
2. Get a pipeline in via any of:
   - **Paste** a Jenkinsfile into the editor pane (focused by default),
   - **Upload** a `.jenkinsfile`, `Jenkinsfile`, `.groovy`, or `.txt` file from the header,
   - **Samples ▾** pick one of the seven bundled examples (including a deliberately broken one that demos diagnostics).
3. The graph re-renders ~400ms after you stop typing.
4. Interact:
   - **Click a card** for its steps, `when` text, agent override, and post handlers,
   - **Double-click** a card to jump to its source line in the editor,
   - Pan/zoom the canvas; the minimap tracks the viewport,
   - **Expand matrix** swaps a matrix stage between the compact summary card and one card per axis combination,
   - **Copy JSON** exports the parsed model to your clipboard,
   - **Copy link** shares the exact pipeline via the URL (it rides in the hash),
   - **Export PNG** downloads the graph as an image,
   - **Light mode / Dark mode** flips and remembers the color scheme.
5. Parse problems appear in the bottom bar; click a row to jump to that line.

Your code never leaves the browser tab — there is no backend at all.

## 6. Local Development

Requires Node.js 24+ and npm 12+.

```bash
npm install      # install dependencies
npm run dev      # start dev server at http://localhost:5173 with hot reload
npm run test     # run the unit test suite (parser, layout, graph, ui helpers)
npm run build    # typecheck + production build into dist/
npm run lint     # ESLint across the repo
```

Note on the TypeScript version: the stack research pinned TS 7.0.2, but `typescript-eslint` 8.x declares a peer range below 6.1.0, so the project uses the plan's documented fallback of 5.9.3. Application code targets ES2022 either way; upgrading to the native line later is a dependency swap.

## 7. Deployment

Deploys are fully automatic:

- Pushes to `main` trigger [.github/workflows/static.yml](.github/workflows/static.yml), which installs dependencies with `npm ci`, builds with `npm run build` (typecheck included), and uploads `dist/` to GitHub Pages.
- The Vite build uses `base: './'` so all asset URLs resolve under the project page path `/PipeViz/`.
- You can re-run a deploy manually from the Actions tab via *workflow_dispatch*.

The site lives at <https://amanalip.github.io/PipeViz/>.

## 8. Repository Layout

```
PipeViz/
  .github/workflows/   GitHub Pages deploy workflow (build + deploy dist/)
  public/              logo.svg, favicon.svg (static assets)
   src/
     parser/            tokenizer, block tree, interpreter, scripted fallback
     model/             PipelineModel / StageNode / Step / Diagnostic types
     layout/            computeLayout engine + matrix combination math
     graph/             FlowCanvas, StageNodeCard, flow conversion, PNG export
     ui/                EditorPane (CodeMirror), SamplePicker, DetailsPanel, DiagnosticsBar
     share/             URL hash codec for shareable pipeline links
     samples/           seven bundled example Jenkinsfiles
     theme.ts           color scheme plumbing and canvas palettes
     styles/            global.css design tokens (dark + light)
  index.html           Vite entry document
  vite.config.ts       dev server and build config (relative base for Pages)
  tsconfig.json        strict TypeScript configuration
  eslint.config.js     ESLint 10 flat config
  package.json         exact-pinned dependencies and npm scripts
  project_plan.md      architecture, milestones, risks, sources
  commit_tracker.md    commit conventions and running log
  ui_mockups.md        ASCII reference for every screen and state
  LICENSE              GNU GPL v3
```

## 9. Documentation

| Document | Contents |
|---|---|
| [project_plan.md](project_plan.md) | Full plan: goals, architecture, parser and layout design, data model, milestones, risks, verified sources |
| [commit_tracker.md](commit_tracker.md) | Conventional commit conventions, complete history, planned commit sequence mapped to milestones |
| [ui_mockups.md](ui_mockups.md) | ASCII reference for every screen, state, and dimension in the app |

## 10. Branding

Logo concept: **The Branch**, three parallel lanes merging into one flow, drawn as a cyan gradient on a dark rounded badge with a white output arrow. Files live in [`public/`](public/):

- `public/logo.svg` : header mark and social preview base
- `public/favicon.svg` : browser tab icon

Design tokens and usage rules are documented in [project_plan.md, Branding section](project_plan.md#branding).

## 11. License

Released under the [GNU General Public License v3.0](LICENSE).
