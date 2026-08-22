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
import type { Diagnostic } from './model/types'
import { parseJenkinsfile } from './parser'
import { SAMPLES } from './samples'
import type { Sample } from './samples'
import { DiagnosticsBar } from './ui/DiagnosticsBar'
import { DetailsPanel } from './ui/DetailsPanel'
import { EditorPane } from './ui/EditorPane'
import type { EditorApi } from './ui/EditorPane'
import { SamplePicker } from './ui/SamplePicker'
import { candidateStageCount, partialGraphNote } from './ui/diagnosticsSupport'

// Repository URL for the header link; same repo this code lives in.
const REPO_URL = 'https://github.com/amanalip/PipeViz'

// Mockup §13: re-parse fires 400ms after typing stops.
const REPARSE_DEBOUNCE_MS = 400

/** How long the Copy JSON button flashes feedback before resetting. */
const COPY_FLASH_MS = 1500

/**
 * App renders the three-region layout from the UI spec (plan section 10):
 * header / workspace (editor + canvas) / diagnostics bar.
 */
export default function App() {
  // Live editor contents; single source of truth for the whole app.
  const [source, setSource] = useState('')
  // The most recent input we actually parsed; trails `source` by the debounce.
  const [settledSource, setSettledSource] = useState('')
  // Bumped each time a fresh graph lands; keys the flow remount.
  const [revision, setRevision] = useState(0)
  // Currently selected card id, mirrored up from the canvas. Null means
  // nothing selected, which also means no details panel.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Copy JSON button feedback: idle -> copied/failed -> idle after a flash.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  // Name of the bundled sample the editor currently holds (§5/§8 caption).
  // Cleared as soon as the content diverges via edit/upload/paste, so the
  // label only ever names text that really is that sample.
  const [sampleName, setSampleName] = useState<string | null>(null)

  // Imperative handles into the two interactive regions.
  const editorApi = useRef<EditorApi | null>(null)
  const flowApi = useRef<FlowApi | null>(null)
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

  // Pure derived pipeline: parse then lay out. Both are cheap enough to run
  // synchronously on settle, and memoizing keeps renders side-effect free.
  const model = useMemo(() => parseJenkinsfile(settledSource), [settledSource])
  const layout = useMemo(() => computeLayout(model), [model])

  // True between a keystroke and the debounce settling (status bar "busy").
  const parsing = source !== settledSource

  // Canvas summary numbers use the same semantics as mockup §8's status
  // line: every rendered card counts as a stage, steps summed across them.
  const canvasStats = useMemo(() => {
    let steps = 0
    for (const node of layout.nodes) steps += node.steps.length
    return { stages: layout.nodes.length, steps }
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
  // contain more stage calls than rendered surfaces can account for.
  const partialNote = useMemo(() => {
    if (problems.errors === 0) return null
    const surfaces = layout.nodes.length + layout.containers.length
    return partialGraphNote(surfaces, candidateStageCount(settledSource))
  }, [problems.errors, layout, settledSource])

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
            <SamplePicker samples={SAMPLES} onPick={pickSample} />
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
          </div>
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
          {/* Canvas caption (§5/§8/§11): names the loaded sample while the
              text still is that sample; swaps to the honest parse-failed
              line whenever errors exist and something rendered. */}
          {canvasStats.stages > 0 && problems.errors > 0 && (
            <div className="canvas-caption">parse failed — showing what parsed</div>
          )}
          {canvasStats.stages > 0 && problems.errors === 0 && sampleName && (
            <div className="canvas-caption">sample · {sampleName}</div>
          )}
          {canvasStats.stages > 0 ? (
            <FlowCanvas
              model={model}
              layout={layout}
              revision={revision}
              onSelect={setSelectedId}
              apiRef={flowApi}
              onStageDoubleClick={(stage) => revealLine(stage.line)}
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
                {/* All three paths are live at M4 (mockup §4 promised this day). */}
                <li className="chip chip-ready">Paste</li>
                <li className="chip chip-ready">Upload</li>
                <li className="chip chip-ready">Samples</li>
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
