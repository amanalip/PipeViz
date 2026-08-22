// ---------------------------------------------------------------------------
// App.tsx - top level layout and state wiring (plan section 5).
//
// M0 shipped the shell; M3 wired the data path through it:
//
//   editor text --(400ms debounce)--> parseJenkinsfile --> computeLayout
//        --> FlowCanvas (stage cards, containers, minimap, selection)
//
// M4 completes the interaction layer (mockups §12/§9/§11/§17):
//   - header actions: sample picker, file upload, Copy JSON, GitHub link
//   - DetailsPanel floats over the canvas for the selected card
//   - DiagnosticsBar replaces the bare status line: expandable rows,
//     click-to-jump caret + node flash, partial-graph honesty
//   - double-clicking a card jumps the editor to its source line
//
// UX principles applied here:
//   - Debounced re-parse: the graph refreshes 400ms after typing stops
//     (mockup §13), so mid-word keystrokes never thrash the canvas.
//   - Every re-parse bumps a `revision`; FlowCanvas remounts keyed on it,
//     which also clears stale selections exactly as mockup §17 promises.
//   - The status bar tells the truth about app state: busy while the
//     debounce settles, ready with kind/stage/step counts once parsed,
//     diagnostic counts as soon as the parser reports any (mockup §15).
//   - The privacy promise ("nothing leaves your browser") stays visible -
//     it only yields its slot to the partial-graph note when errors exist.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

import { FlowCanvas } from './graph/FlowCanvas'
import type { FlowApi } from './graph/FlowCanvas'
import { computeLayout } from './layout/computeLayout'
import type { PositionedStage } from './layout/computeLayout'
import { hasExpandableMatrix } from './layout/matrixCombos'
import type { Diagnostic } from './model/types'
import { parseJenkinsfile } from './parser'
import { SAMPLES } from './samples'
import type { Sample } from './samples'
import { readHashSource, sourceToHash, pageUrlWithHash } from './share/hash'
import { loadStoredTheme, storeTheme } from './theme'
import type { Theme } from './theme'
import { DiagnosticsBar } from './ui/DiagnosticsBar'
import { DetailsPanel } from './ui/DetailsPanel'
import { EditorPane } from './ui/EditorPane'
import type { EditorApi } from './ui/EditorPane'
import { SamplePicker } from './ui/SamplePicker'
import type { SamplePickerApi } from './ui/SamplePicker'
import { candidateStageCount, partialGraphNote } from './ui/diagnosticsSupport'

// Repository URL for the header link; same repo this code lives in.
const REPO_URL = 'https://github.com/amanalip/PipeViz'

/**
 * Boot state honors a shared link (M6): a `#p=…` hash seeds the editor with
 * its decoded source, settled immediately so the first paint shows the
 * graph, and sample provenance is restored when the payload is exactly a
 * bundled sample. Anything else boots empty.
 */
function bootFromHash(): { source: string; sampleName: string | null } {
  const shared = typeof window === 'undefined' ? null : readHashSource(window.location.hash)
  if (shared === null) return { source: '', sampleName: null }
  const sample = SAMPLES.find((entry) => entry.source === shared)
  return { source: shared, sampleName: sample?.name ?? null }
}

// Mockup §13: re-parse fires 400ms after typing stops.
const REPARSE_DEBOUNCE_MS = 400

/** How long the Copy JSON button flashes feedback before resetting. */
const COPY_FLASH_MS = 1500

/**
 * App renders the three-region layout from the UI spec (plan section 10):
 * header / workspace (editor + canvas) / diagnostics bar.
 */
export default function App() {
  // Shared-link boot state, resolved once per mount.
  const boot = useRef(bootFromHash()).current
  // Live editor contents; single source of truth for the whole app.
  const [source, setSource] = useState(boot.source)
  // The most recent input we actually parsed; trails `source` by the debounce
  // (except on a shared-link boot, which settles immediately).
  const [settledSource, setSettledSource] = useState(boot.source)
  // Bumped each time a fresh graph lands; keys the flow remount.
  const [revision, setRevision] = useState(0)
  // Currently selected card id, mirrored up from the canvas. Null means
  // nothing selected, which also means no details panel.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Copy JSON button feedback: idle -> copied/failed -> idle after a flash.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  // Copy link button feedback (M6 URL hash sharing): same flash pattern.
  const [linkState, setLinkState] = useState<'idle' | 'copied' | 'failed'>('idle')
  // Export PNG button feedback: idle -> working/failed -> idle (M6).
  const [pngState, setPngState] = useState<'idle' | 'working' | 'failed'>('idle')
  // Name of the bundled sample the editor currently holds (§5/§8 caption).
  // Cleared as soon as the content diverges via edit/upload/paste, so the
  // label only ever names text that really is that sample. A shared link
  // whose payload is byte-identical to a bundled sample restores it.
  const [sampleName, setSampleName] = useState<string | null>(boot.sampleName)
  // M6 view preference: expand matrix stages into one card per axis combo
  // (mockups §10). Session-only; flipping it re-fits and clears selection.
  const [expandMatrix, setExpandMatrix] = useState(false)
  // M6 color scheme (mockups §2 shipped dark-only v1): persisted choice,
  // dark unless the visitor explicitly picked light.
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window === 'undefined' ? 'dark' : loadStoredTheme(window.localStorage),
  )

  // Imperative handles into the two interactive regions.
  const editorApi = useRef<EditorApi | null>(null)
  const flowApi = useRef<FlowApi | null>(null)
  const samplePickerApi = useRef<SamplePickerApi | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Copy JSON flash reset (§17: "Copied ✓" for 1.5s).
  useEffect(() => {
    if (copyState === 'idle') return
    const timer = window.setTimeout(() => setCopyState('idle'), COPY_FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [copyState])

  // Copy link flash reset; identical pattern to the JSON button.
  useEffect(() => {
    if (linkState === 'idle') return
    const timer = window.setTimeout(() => setLinkState('idle'), COPY_FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [linkState])

  // URL hash mirrors the settled source (M6 sharing): replaceState keeps
  // typing out of browser history. Empty source clears the hash entirely.
  useEffect(() => {
    const nextHash = sourceToHash(settledSource)
    if (window.location.hash === nextHash) return
    const url = nextHash === '' ? `${window.location.pathname}${window.location.search}` : nextHash
    window.history.replaceState(null, '', url)
  }, [settledSource])

  // Export PNG failure flash reset; success needs no timer (download fires).
  useEffect(() => {
    if (pngState !== 'failed') return
    const timer = window.setTimeout(() => setPngState('idle'), COPY_FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [pngState])

  // Matrix toggle rides the same revision path as a fresh parse: remount
  // re-fits the view and drops any selection pointing at pre-toggle ids.
  // Theme flips join the ride so canvas palettes swap through the same
  // remount. The ref skips the mount run so revision stays 0 until then.
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    setRevision((current) => current + 1)
    setSelectedId(null)
  }, [expandMatrix, theme])

  // Reflect the theme on <html>, persist it, and keep browser chrome in
  // step (widget colors + mobile status bar).
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    storeTheme(window.localStorage, theme)
    document
      .querySelector('meta[name="color-scheme"]')
      ?.setAttribute('content', theme === 'light' ? 'light' : 'dark')
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#e7edf5' : '#0f172a')
  }, [theme])

  // Pure derived pipeline: parse then lay out. Both are cheap enough to run
  // synchronously on settle, and memoizing keeps renders side-effect free.
  const model = useMemo(() => parseJenkinsfile(settledSource), [settledSource])
  const layout = useMemo(
    () => computeLayout(model, { expandMatrix }),
    [model, expandMatrix],
  )

  // True between a keystroke and the debounce settling (status bar "busy").
  const parsing = source !== settledSource

  // Canvas summary numbers use the same semantics as mockup §8's status
  // line: every rendered card counts as a stage, steps summed across them.
  // Ghost cards (§11 unparsed material) are honest about not being stages,
  // so they stay out of these tallies while still occupying the canvas.
  const canvasStats = useMemo(() => {
    let stages = 0
    let steps = 0
    for (const node of layout.nodes) {
      if (node.ghost) continue
      stages += 1
      steps += node.steps.length
    }
    return { stages, steps }
  }, [layout])

  // Diagnostic tallies drive the error state of the diagnostics bar.
  const problems = useMemo(() => {
    let errors = 0
    let warnings = 0
    for (const diagnostic of model.diagnostics) {
      if (diagnostic.severity === 'error') errors += 1
      else warnings += 1
    }
    return { errors, warnings }
  }, [model])

  // Partial-graph note (§15): only when errors exist AND the source seems to
  // contain more stage calls than rendered surfaces can account for. Ghost
  // cards count toward the rendered bound: once every stage call is either a
  // card or a ghost, the graph itself carries the full story.
  const partialNote = useMemo(() => {
    if (problems.errors === 0) return null
    const surfaces = layout.nodes.length + layout.containers.length
    return partialGraphNote(surfaces, candidateStageCount(settledSource))
  }, [problems.errors, layout, settledSource])

  // Canvas caption pill (§5/§8/§11): provenance while it holds, honest
  // parse-failed line whenever errors exist, quiet when nothing applies.
  // Ghost-only graphs (nothing parsed but unparsed material on canvas)
  // still deserve the parse-failed line.
  const hasCanvasContent = layout.nodes.length > 0
  const caption = useMemo(() => {
    if (!hasCanvasContent) return null
    if (problems.errors > 0) return 'parse failed: showing what parsed'
    if (sampleName !== null) return `sample · ${sampleName}`
    return null
  }, [hasCanvasContent, problems.errors, sampleName])

  // The §10 expansion toggle only exists when there is a matrix to expand.
  const showMatrixToggle = useMemo(
    () => canvasStats.stages > 0 && hasExpandableMatrix(model.rootStages),
    [canvasStats.stages, model],
  )

  // Display name for the selection segment of the status line (§9), plus the
  // resolved stage that feeds the details panel (containers resolve to null:
  // they have no card data yet, so no panel opens for them).
  const selectedStage = selectedId
    ? (layout.nodes.find((node) => node.id === selectedId) ?? null)
    : null
  const selectedName = selectedStage?.name ?? null

  /** Close the details panel and drop the canvas selection ring with it. */
  function closeDetailsPanel() {
    flowApi.current?.clearSelection()
    setSelectedId(null)
  }

  // ---- Header actions ------------------------------------------------------

  /**
   * Sample pick replaces the editor immediately (§12) and settles just as
   * immediately (§17: "fresh parse, revision bump clears stale selection") -
   * no reason to make the user wait out the typing debounce for a whole-file
   * swap. Provenance records which sample the text came from.
   */
  function pickSample(sample: Sample) {
    setSampleName(sample.name)
    setSource(sample.source)
    setSettledSource(sample.source)
    setRevision((current) => current + 1)
    setSelectedId(null)
  }

  /**
   * Manual edits (typing, Tab, paste into the textarea) diverge the content
   * from any named sample, so provenance drops and the caption goes quiet.
   */
  function changeSource(next: string) {
    setSampleName(null)
    setSource(next)
  }

  /** Same path as paste (§17): read the file as text, swap the editor. */
  async function handleUploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setSampleName(null)
    setSource(await file.text())
  }

  /** Serialize the settled model to the clipboard (§12). */
  async function copyModelJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(model, null, 2))
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  /**
   * Render the live graph to a downloadable PNG (M6). The background bakes
   * in whatever `--bg-0` resolves to right now, so exports match the active
   * theme without the renderer knowing about themes.
   */
  async function exportGraphPng() {
    if (canvasStats.stages === 0) return
    setPngState('working')
    try {
      const background =
        window.getComputedStyle(document.documentElement).getPropertyValue('--bg-0').trim() ||
        '#0f172a'
      await flowApi.current?.exportPng({ backgroundColor: background })
      setPngState('idle')
    } catch {
      setPngState('failed')
    }
  }

  /**
   * Copy the page URL with its up-to-date share hash (M6). The hash effect
   * keeps the address bar in sync with the settled source, but a user may
   * copy before the debounce settles - flush the current text into the hash
   * first so the clipboard never trails the editor. The URL is assembled
   * from location parts (not by resolving the hash against the origin) so
   * the /PipeViz/ deployment subpath survives into copied links.
   */
  async function copyShareLink() {
    if (source.length === 0) return
    try {
      const hash = source !== settledSource ? sourceToHash(source) : window.location.hash
      const url = pageUrlWithHash(
        window.location.origin,
        window.location.pathname,
        window.location.search,
        hash,
      )
      await navigator.clipboard.writeText(url)
      setLinkState('copied')
    } catch {
      setLinkState('failed')
    }
  }

  // ---- Cross-region interactions --------------------------------------------

  /** Editor caret to a source line; shared by rows and card double-click. */
  function revealLine(line: number) {
    editorApi.current?.revealLine(line)
  }

  /** One-shot highlight on a rendered card (§11 diagnostic click). */
  function flashNode(stageId: string | null) {
    if (!stageId) return
    const el = document.querySelector(
      `.react-flow__node[data-id="${CSS.escape(stageId)}"] .stage-card`,
    )
    if (!(el instanceof HTMLElement)) return
    el.classList.remove('node-flash')
    void el.offsetWidth // restart the animation if it is already flashing
    el.classList.add('node-flash')
    window.setTimeout(() => el.classList.remove('node-flash'), 1000)
  }

  /** Diagnostic row click: jump the caret, flash the related card if any. */
  function handleDiagnosticClick(diagnostic: Diagnostic) {
    revealLine(diagnostic.line)
    const hit: PositionedStage | undefined = layout.nodes.find(
      (node) => node.line === diagnostic.line,
    )
    flashNode(hit?.id ?? null)
  }

  // ---- Render -------------------------------------------------------------
  return (
    <div className="app">
      {/* ---- Region 1: header with brand and input actions ------------------ */}
      <header className="app-header">
        <div className="brand">
          <img src="./logo.svg" alt="" aria-hidden="true" className="brand-mark" />
          <span className="brand-name">PipeViz</span>
          <span className="brand-tagline">Jenkinsfile → graph</span>
        </div>
        <nav className="header-nav" aria-label="Input actions">
          <div className="header-actions">
            <SamplePicker samples={SAMPLES} onPick={pickSample} apiRef={samplePickerApi} />
            <input
              ref={fileInputRef}
              type="file"
              className="upload-input"
              accept=".jenkinsfile,Jenkinsfile,.groovy,.txt"
              onChange={handleUploadFile}
              aria-hidden="true"
              tabIndex={-1}
            />
            <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
              Upload
            </button>
            <button
              type="button"
              className={copyState === 'copied' ? 'btn btn-copied' : 'btn'}
              onClick={copyModelJson}
            >
              {copyState === 'copied' ? 'Copied ✓' : copyState === 'failed' ? 'Copy failed' : 'Copy JSON'}
            </button>
            <button
              type="button"
              className={linkState === 'copied' ? 'btn btn-copied' : 'btn'}
              disabled={source.length === 0}
              onClick={copyShareLink}
              title="Copy a link that reopens this exact pipeline"
            >
              {linkState === 'copied' ? 'Copied ✓' : linkState === 'failed' ? 'Copy failed' : 'Copy link'}
            </button>
            <button
              type="button"
              className={pngState === 'failed' ? 'btn btn-export-failed' : 'btn'}
              disabled={pngState === 'working' || canvasStats.stages === 0}
              onClick={exportGraphPng}
              title="Download the current graph as a PNG image"
            >
              {pngState === 'working' ? 'Rendering…' : pngState === 'failed' ? 'Export failed' : 'Export PNG'}
            </button>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            aria-pressed={theme === 'light'}
            title={theme === 'dark' ? 'Switch to the light color scheme' : 'Switch to the dark color scheme'}
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <a className="repo-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub ↗
          </a>
        </nav>
      </header>

      {/* ---- Region 2: workspace = editor pane + canvas area --------------- */}
      <main className="workspace">
        <EditorPane value={source} onChange={changeSource} apiRef={editorApi} />

        {/* Canvas area: the live graph once anything parsed, otherwise the
            how-to card. FlowCanvas fills the pane absolutely; React Flow
            provides its own dotted background and floating controls. */}
        <section className="canvas-area" aria-label="Pipeline graph canvas">
          {/* Canvas caption (§5/§8/§11) plus the M6 matrix toggle share one
              floating toolbar: the pill names the loaded sample while the
              text still is that sample and swaps to the honest parse-failed
              line whenever errors exist; the toggle only appears when the
              model actually carries an expandable matrix (§10). */}
          {(caption !== null || showMatrixToggle) && (
            <div className="canvas-toolbar">
              {caption !== null && <div className="canvas-caption">{caption}</div>}
              {showMatrixToggle && (
                <button
                  type="button"
                  className={expandMatrix ? 'btn canvas-toggle active' : 'btn canvas-toggle'}
                  onClick={() => setExpandMatrix((value) => !value)}
                  aria-pressed={expandMatrix}
                  title="Toggle between the compact matrix card and one card per axis combination"
                >
                  {expandMatrix ? 'Collapse matrix' : 'Expand matrix'}
                </button>
              )}
            </div>
          )}
          {hasCanvasContent ? (
            <FlowCanvas
              model={model}
              layout={layout}
              revision={revision}
              onSelect={setSelectedId}
              apiRef={flowApi}
              onStageDoubleClick={(stage) => revealLine(stage.line)}
              expandMatrix={expandMatrix}
              theme={theme}
            />
          ) : (
            <div className="empty-state">
              <img src="./logo.svg" alt="" aria-hidden="true" className="empty-mark" />
              <h2>Paste a Jenkinsfile. See your pipeline.</h2>
              <p>
                PipeViz reads a Jenkinsfile and draws its stages as a horizontal graph: parallel
                branches stacked in lanes, steps one click away. The graph redraws as you type.
              </p>
              <ul className="path-chips">
                {/* Each chip is a live control for its input path (mockup §4):
                    Paste hands the user a caret in the editor, Upload opens
                    the file picker, Samples drops the bundled menu down. */}
                <li>
                  <button
                    type="button"
                    className="chip chip-ready"
                    onClick={() => editorApi.current?.focus()}
                    title="Focus the editor, then paste your Jenkinsfile"
                  >
                    Paste
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="chip chip-ready"
                    onClick={() => fileInputRef.current?.click()}
                    title="Open a Jenkinsfile from disk"
                  >
                    Upload
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="chip chip-ready"
                    onClick={() => samplePickerApi.current?.openMenu()}
                    title="Load one of the bundled sample pipelines"
                  >
                    Samples
                  </button>
                </li>
              </ul>
              <p className="empty-footnote">Nothing leaves your browser.</p>
            </div>
          )}

          {/* Details panel floats over the canvas, right-aligned (§9). */}
          {selectedStage && (
            <DetailsPanel
              stage={selectedStage}
              postHandlers={model.postHandlers}
              onClose={closeDetailsPanel}
            />
          )}
        </section>
      </main>

      {/* ---- Region 3: diagnostics bar (mockups §14/§15) --------------------
          Four appearances per §14: busy pulse while debouncing, ready with
          honest counts, warn/error tallies with an expandable row list whose
          clicks jump the editor caret and flash related cards (§11). Color
          never works alone: every state changes both icon and words. */}
      <DiagnosticsBar
        parsing={parsing}
        kind={model.kind}
        stagesRendered={canvasStats.stages}
        stepsCount={canvasStats.steps}
        diagnostics={model.diagnostics}
        selectionName={selectedName}
        partialNote={partialNote}
        onSelectDiagnostic={handleDiagnosticClick}
      />
    </div>
  )
}
