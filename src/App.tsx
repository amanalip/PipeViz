// ---------------------------------------------------------------------------
// App.tsx - top level layout and state wiring (plan section 5).
//
// M0 shipped the shell; M3 wires the data path through it:
//
//   editor text --(400ms debounce)--> parseJenkinsfile --> computeLayout
//        --> FlowCanvas (stage cards, containers, minimap, selection)
//
// UX principles applied here:
//   - Debounced re-parse: the graph refreshes 400ms after typing stops
//     (mockup §13), so mid-word keystrokes never thrash the canvas.
//   - Every re-parse bumps a `revision`; FlowCanvas remounts keyed on it,
//     which also clears stale selections exactly as mockup §17 promises.
//   - The status bar tells the truth about app state: busy while the
//     debounce settles, ready with kind/stage/step counts once parsed,
//     diagnostic counts as soon as the parser reports any (mockup §15).
//   - The privacy promise ("nothing leaves your browser") stays visible.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'

import { FlowCanvas } from './graph/FlowCanvas'
import { computeLayout } from './layout/computeLayout'
import { parseJenkinsfile } from './parser'

// Repository URL for the header link; same repo this code lives in.
const REPO_URL = 'https://github.com/amanalip/PipeViz'

// Mockup §13: re-parse fires 400ms after typing stops.
const REPARSE_DEBOUNCE_MS = 400

/**
 * App renders the three-region layout from the UI spec (plan section 10):
 * header / workspace (editor + canvas) / diagnostics-style status bar.
 */
export default function App() {
  // Live editor contents; single source of truth for the whole app.
  const [source, setSource] = useState('')
  // The most recent input we actually parsed; trails `source` by the debounce.
  const [settledSource, setSettledSource] = useState('')
  // Bumped each time a fresh graph lands; keys the flow remount.
  const [revision, setRevision] = useState(0)
  // Currently selected card id, mirrored up from the canvas (details panel
  // hangs off this at M4). Null means nothing selected.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  /**
   * Debounce gate between typing and parsing. Each keystroke resets the
   * timer; only when the keyboard rests for 400ms do we commit the new
   * source, bump the revision (fresh graph + cleared selection), and let
   * the memoized parse/layout below run.
   */
  useEffect(() => {
    if (source === settledSource) return
    const timer = window.setTimeout(() => {
      setSettledSource(source)
      setRevision((current) => current + 1)
      setSelectedId(null)
    }, REPARSE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [source, settledSource])

  // Pure derived pipeline: parse then lay out. Both are cheap enough to run
  // synchronously on settle, and memoizing keeps renders side-effect free.
  const model = useMemo(() => parseJenkinsfile(settledSource), [settledSource])
  const layout = useMemo(() => computeLayout(model), [model])

  // True between a keystroke and the debounce settling (status bar "busy").
  const parsing = source !== settledSource

  // Editor footer counters; memoized so typing stays cheap.
  const stats = useMemo(() => {
    const trimmed = source.trim()
    return {
      lines: source.length === 0 ? 0 : source.split('\n').length,
      words: trimmed === '' ? 0 : trimmed.split(/\s+/).length,
    }
  }, [source])

  // Canvas summary numbers use the same semantics as mockup §8's status
  // line: every rendered card counts as a stage, steps summed across them.
  const canvasStats = useMemo(() => {
    let steps = 0
    for (const node of layout.nodes) steps += node.steps.length
    return { stages: layout.nodes.length, steps }
  }, [layout])

  // Diagnostic tallies drive the error status variant (full bar arrives M4).
  const problems = useMemo(() => {
    let errors = 0
    let warnings = 0
    for (const diagnostic of model.diagnostics) {
      if (diagnostic.severity === 'error') errors += 1
      else warnings += 1
    }
    return { errors, warnings }
  }, [model])

  // Display name for the selection segment of the status line (§9).
  const selectedName = selectedId
    ? (layout.nodes.find((node) => node.id === selectedId)?.name ?? null)
    : null

  /**
   * Insert two spaces on Tab instead of moving focus: Jenkinsfiles indent,
   * and fighting a textarea over the Tab key is a daily-driver annoyance.
   */
  function handleTabKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const el = event.currentTarget
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = `${el.value.slice(0, start)}  ${el.value.slice(end)}`
    setSource(next)
    requestAnimationFrame(() => {
      el.selectionStart = start + 2
      el.selectionEnd = start + 2
    })
  }

  // ---- Render -------------------------------------------------------------
  return (
    <div className="app">
      {/* ---- Region 1: header with brand and repo link --------------------- */}
      <header className="app-header">
        <div className="brand">
          <img src="./logo.svg" alt="" aria-hidden="true" className="brand-mark" />
          <span className="brand-name">PipeViz</span>
          <span className="brand-tagline">Jenkinsfile → graph</span>
        </div>
        <nav className="header-nav">
          <a className="repo-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub ↗
          </a>
        </nav>
      </header>

      {/* ---- Region 2: workspace = editor pane + canvas area --------------- */}
      <main className="workspace">
        <section className="editor-pane" aria-label="Pipeline source editor">
          <label className="pane-title" htmlFor="pipeline-source">
            Pipeline source
          </label>
          <textarea
            id="pipeline-source"
            className="editor-textarea"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={handleTabKey}
            placeholder={'# Paste a declarative or scripted Jenkinsfile here.\n\nExample:\npipeline {\n  agent any\n  stages {\n    stage(\'Build\') {\n      steps {\n        sh \'make build\'\n      }\n    }\n  }\n}'}
            spellCheck={false}
            autoFocus
          />
          <footer className="editor-stats">
            <span>{stats.lines} lines</span>
            <span>{stats.words} words</span>
          </footer>
        </section>

        {/* Canvas area: the live graph once anything parsed, otherwise the
            how-to card. FlowCanvas fills the pane absolutely; React Flow
            provides its own dotted background and floating controls. */}
        <section className="canvas-area" aria-label="Pipeline graph canvas">
          {canvasStats.stages > 0 ? (
            <FlowCanvas
              model={model}
              layout={layout}
              revision={revision}
              onSelect={setSelectedId}
            />
          ) : (
            <div className="empty-state">
              <img src="./logo.svg" alt="" aria-hidden="true" className="empty-mark" />
              <h2>Paste a Jenkinsfile. See your pipeline.</h2>
              <p>
                PipeViz reads a Jenkinsfile and draws its stages as a horizontal graph — parallel
                branches stacked in lanes, steps one click away. The graph redraws as you type.
              </p>
              <ul className="path-chips">
                <li className="chip chip-ready">Paste — live now</li>
                <li className="chip">Upload — coming soon</li>
                <li className="chip">Samples — coming soon</li>
              </ul>
              <p className="empty-footnote">Everything runs locally in your browser.</p>
            </div>
          )}
        </section>
      </main>

      {/* ---- Region 3: status bar (grows into DiagnosticsBar at M4) --------
          Four appearances per mockup §14/§15: busy pulse while debouncing,
          ready with honest counts, diagnostic tallies when present, and a
          selection echo whenever a card is clicked. Color never works alone:
          every state changes both the icon and the words. */}
      <footer className="status-bar">
        <span className="status-item">
          {parsing ? (
            <>
              <span className="status-dot status-busy" aria-hidden="true" />
              Parsing…
            </>
          ) : problems.errors > 0 || problems.warnings > 0 ? (
            <>
              <span className="status-problem-icon" aria-hidden="true">⚠</span>
              {problems.errors} {problems.errors === 1 ? 'error' : 'errors'}
              {' · '}
              {problems.warnings} {problems.warnings === 1 ? 'warning' : 'warnings'}
              {canvasStats.stages > 0 && <> · {canvasStats.stages} {canvasStats.stages === 1 ? 'stage' : 'stages'} rendered</>}
            </>
          ) : (
            <>
              <span className="status-dot" aria-hidden="true" />
              Ready
              {canvasStats.stages > 0 && (
                <>
                  {' · '}
                  {model.kind}
                  {' · '}
                  {canvasStats.stages} {canvasStats.stages === 1 ? 'stage' : 'stages'}
                  {' · '}
                  {canvasStats.steps} {canvasStats.steps === 1 ? 'step' : 'steps'}
                </>
              )}
            </>
          )}
          {selectedName && <> · selection: {selectedName}</>}
        </span>
        <span className="status-item status-note">No backend — your code stays in this tab</span>
        <span className="status-item status-version">v0.1.0</span>
      </footer>
    </div>
  )
}
