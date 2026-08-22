// ---------------------------------------------------------------------------
// App.tsx - top level layout and state wiring (plan section 5).
//
// M0 scope: the application shell. Header, source editor pane, canvas area
// with an honest empty state, and a status bar. The parser (M1), layout
// engine (M2), and React Flow canvas (M3) will slot into this frame without
// reshaping it, which is exactly why the shell exists first.
//
// UX principles applied here:
//   - The user can type immediately: the editor is focused-by-default.
//   - The empty state explains what WILL happen instead of looking broken.
//   - The privacy promise ("nothing leaves your browser") is always visible,
//     addressing plan risk R5 (users expecting a server round trip).
// ---------------------------------------------------------------------------

// useState holds editor text; useMemo derives counters without recompute churn.
import { useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'

// Repository URL for the header link; same repo this code lives in.
const REPO_URL = 'https://github.com/amanalip/PipeViz'

/**
 * App renders the three-region layout from the UI spec (plan section 10):
 * header / workspace (editor + canvas) / diagnostics-style status bar.
 */
export default function App() {
  // Source text of the pipeline; single source of truth for the whole app later.
  const [source, setSource] = useState('')

  // Derived stats for the editor footer; memoized so typing stays cheap.
  const stats = useMemo(() => {
    // Trimmed view decides whether to count "words" of pure whitespace.
    const trimmed = source.trim()
    return {
      // Line count: an empty buffer is 0 lines, not 1.
      lines: source.length === 0 ? 0 : source.split('\n').length,
      // Words: split on whitespace runs; empty input yields no words.
      words: trimmed === '' ? 0 : trimmed.split(/\s+/).length,
    }
  }, [source])

  /**
   * Insert two spaces on Tab instead of moving focus: Jenkinsfiles indent,
   * and fighting a textarea over the Tab key is a daily-driver annoyance.
   */
  function handleTabKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Only intercept plain Tab; Shift+Tab etc. keep native behavior.
    if (event.key !== 'Tab') return
    // Stop the browser from tabbing away mid-edit.
    event.preventDefault()
    // Current selection bounds and value come from the textarea itself.
    const el = event.currentTarget
    const start = el.selectionStart
    const end = el.selectionEnd
    // Splice two spaces over whatever is selected (or at the caret).
    const next = `${el.value.slice(0, start)}  ${el.value.slice(end)}`
    // Update React state; the DOM catches up on re-render.
    setSource(next)
    // Restore caret/selection AFTER React commits the new value.
    requestAnimationFrame(() => {
      el.selectionStart = start + 2
      el.selectionEnd = start + 2
    })
  }

  // ---- Render -------------------------------------------------------------
  return (
    // .app is a full-viewport column: header, workspace, status bar.
    <div className="app">
      {/* ---- Region 1: header with brand and repo link --------------------- */}
      <header className="app-header">
        <div className="brand">
          {/* Decorative image: the wordmark right next to it carries meaning. */}
          <img src="./logo.svg" alt="" aria-hidden="true" className="brand-mark" />
          <span className="brand-name">PipeViz</span>
          {/* Tagline doubles as the product pitch inside the app. */}
          <span className="brand-tagline">Jenkinsfile → graph</span>
        </div>
        <nav className="header-nav">
          {/* External link opens in a new tab; noopener prevents tab-nabbing. */}
          <a className="repo-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub ↗
          </a>
        </nav>
      </header>

      {/* ---- Region 2: workspace = editor pane + canvas area --------------- */}
      <main className="workspace">
        {/* Editor pane: fixed 380px per spec, textarea drives everything. */}
        <section className="editor-pane" aria-label="Pipeline source editor">
          {/* Visible label wired to the textarea via htmlFor/id (a11y). */}
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
          {/* Footer stats give the pane a sense of place and progress. */}
          <footer className="editor-stats">
            <span>{stats.lines} lines</span>
            <span>{stats.words} words</span>
          </footer>
        </section>

        {/* Canvas area: React Flow takes over here at M3. Until then, an
            intentional empty state beats a grey void. */}
        <section className="canvas-area" aria-label="Pipeline graph canvas">
          <div className="empty-state">
            {/* Small brand echo ties the promise to the product. */}
            <img src="./logo.svg" alt="" aria-hidden="true" className="empty-mark" />
            <h2>Your pipeline graph will appear here</h2>
            <p>
              PipeViz reads a Jenkinsfile and draws its stages as a horizontal graph — parallel
              branches stacked in lanes, steps one click away. Everything runs locally in your
              browser.
            </p>
            {/* Input paths with honest availability labels (see milestones). */}
            <ul className="path-chips">
              <li className="chip chip-ready">Paste — ready now</li>
              <li className="chip">Upload — coming</li>
              <li className="chip">Samples — coming</li>
            </ul>
            {/* Sets expectations about what M0 does and does not do yet. */}
            <p className="empty-footnote">Parser engine lands with milestone M1.</p>
          </div>
        </section>
      </main>

      {/* ---- Region 3: status bar (grows into DiagnosticsBar at M4) -------- */}
      <footer className="status-bar">
        <span className="status-item">
          {/* Green dot = healthy idle state; color never works alone, hence text. */}
          <span className="status-dot" aria-hidden="true" />
          Ready
        </span>
        {/* Privacy promise lives where eyes rest: the bottom of the screen. */}
        <span className="status-item status-note">No backend — your code stays in this tab</span>
        {/* Build identity; helps when reporting issues against a deployed page. */}
        <span className="status-item status-version">M0 scaffold · v0.1.0</span>
      </footer>
    </div>
  )
}
