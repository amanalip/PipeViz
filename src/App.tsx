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
//   - FlowCanvas updates its graph in place (no remount), so the camera
//     survives re-parses and theme flips, while fresh graph data still
//     clears stale selections exactly as mockup §17 promises.
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
import { hasExpandableMatrix, hasMatrixStage } from './layout/matrixCombos'
import type { Diagnostic, StageNode } from './model/types'
import { parseJenkinsfile } from './parser'
import { SAMPLES } from './samples'
import type { Sample } from './samples'
import { readHashSource, isShareHash, sourceToHash, pageUrlWithHash } from './share/hash'
import { loadStoredTheme, storeTheme } from './theme'
import type { Theme } from './theme'
import { DiagnosticsBar } from './ui/DiagnosticsBar'
import { DetailsPanel } from './ui/DetailsPanel'
import { EditorPane } from './ui/EditorPane'
import type { EditorApi } from './ui/EditorPane'
import { SamplePicker } from './ui/SamplePicker'
import type { SamplePickerApi } from './ui/SamplePicker'
import { candidateStageCount, partialGraphNote, stageForDiagnostic } from './ui/diagnosticsSupport'

// Repository URL for the header link; same repo this code lives in.
const REPO_URL = 'https://github.com/amanalip/PipeViz'

/**
 * Boot state honors a shared link (M6): a `#p=…` hash seeds the editor with
 * its decoded source, settled immediately so the first paint shows the
 * graph, and sample provenance is restored when the payload is exactly a
 * bundled sample. A hash that carries the share key but fails to decode is
 * reported as invalid instead of silently booting empty. Anything else
 * boots clean.
 */
function bootFromHash(): { source: string; sampleName: string | null; shareInvalid: boolean } {
  const hash = typeof window === 'undefined' ? '' : window.location.hash
  const shared = readHashSource(hash)
  if (shared === null) {
    return { source: '', sampleName: null, shareInvalid: isShareHash(hash) }
  }
  const sample = SAMPLES.find((entry) => entry.source === shared)
  return { source: shared, sampleName: sample?.name ?? null, shareInvalid: false }
}

// Mockup §13: re-parse fires 400ms after typing stops.
const REPARSE_DEBOUNCE_MS = 400

/** How long the Copy JSON button flashes feedback before resetting. */
const COPY_FLASH_MS = 1500

/** How long the empty-state paste hint stays up before fading out. */
const PASTE_HINT_MS = 6000

/** How long the share notices stay up after copying (§8) or refusing:
 * readable warning beats a 1.5s flash for a full sentence of advice. */
const SHARE_NOTICE_MS = 5000

/**
 * Ceiling on shareable source, in characters. Encoding inflates ~4×3 into
 * the URL hash and browsers/terminals degrade on very long URLs; any real
 * Jenkinsfile sits far below this, so refusal is the honest outcome for
 * pathologically huge input instead of a link some apps silently truncate.
 */
export const MAX_SHARE_SOURCE_LENGTH = 40_000

/** How long the upload-error notice stays up before fading out. */
const UPLOAD_ERROR_MS = 5000

/**
 * Ceiling on accepted uploads. Jenkinsfiles are tiny; anything bigger is
 * almost certainly not one, and feeding megabytes into the synchronous
 * parser would freeze the tab - refuse up front with a readable message.
 */
export const MAX_UPLOAD_BYTES = 1024 * 1024

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
  // Currently selected card id, mirrored up from the canvas. Null means
  // nothing selected, which also means no details panel.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Copy JSON button feedback: idle -> copied/failed -> idle after a flash.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  // Copy link button feedback (M6 URL hash sharing): same flash pattern.
  const [linkState, setLinkState] = useState<'idle' | 'copied' | 'failed'>('idle')
  // Share notice flavor: privacy advice after a successful copy, or the
  // too-large refusal when the source exceeds MAX_SHARE_SOURCE_LENGTH.
  const [shareNotice, setShareNotice] = useState<'privacy' | 'too-large' | null>(null)
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
  // Empty-state Paste chip guidance (§4): shown when the clipboard could
  // not be read, pointing at the manual Ctrl+V path. Auto-clears.
  const [pasteHint, setPasteHint] = useState(false)
  // Upload failure notice: names why a picked file was refused (too big,
  // unreadable) instead of failing silently. Auto-clears like pasteHint.
  const [uploadError, setUploadError] = useState<string | null>(null)
  // A shared link arrived carrying the #p= payload key but its payload is
  // corrupt (bad base64, broken UTF-8). The editor still boots empty, but
  // an explicit banner says so instead of leaving a silent mystery.
  const [shareInvalid, setShareInvalid] = useState(boot.shareInvalid)
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
   * source (fresh graph + cleared selection), and let the memoized
   * parse/layout below run.
   */
  useEffect(() => {
    if (source === settledSource) return
    const timer = window.setTimeout(() => {
      setSettledSource(source)
      setSelectedId(null)
      // Privacy (M6 sharing): the address bar is nobody's storage. A share
      // payload only sits there because a link was opened, so once edits
      // diverge from it, strip it back to the bare page URL. Encoded links
      // exist solely in the clipboard, built fresh by Copy Link.
      const nextHash = sourceToHash(source)
      if (window.location.hash !== '' && window.location.hash !== nextHash) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
      }
    }, REPARSE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [source, settledSource])

  // Copy JSON flash reset (§17: "Copied ✓" for 1.5s).
  useEffect(() => {
    if (copyState === 'idle') return
    const timer = window.setTimeout(() => setCopyState('idle'), COPY_FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [copyState])

  // Paste hint reset: the manual-path guidance outlives a glance but not
  // the visit; any successful clipboard insert clears it immediately.
  useEffect(() => {
    if (!pasteHint) return
    const timer = window.setTimeout(() => setPasteHint(false), PASTE_HINT_MS)
    return () => window.clearTimeout(timer)
  }, [pasteHint])

  // Upload error reset: same readable-lifetime pattern as the share notice.
  useEffect(() => {
    if (uploadError === null) return
    const timer = window.setTimeout(() => setUploadError(null), UPLOAD_ERROR_MS)
    return () => window.clearTimeout(timer)
  }, [uploadError])

  // Copy link flash reset; identical pattern to the JSON button.
  useEffect(() => {
    if (linkState === 'idle') return
    const timer = window.setTimeout(() => setLinkState('idle'), COPY_FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [linkState])

  // Share notice reset: outlives the copied flash on purpose.
  useEffect(() => {
    if (shareNotice === null) return
    const timer = window.setTimeout(() => setShareNotice(null), SHARE_NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [shareNotice])

  // Inbound shared links land as hashchange events after mount: opening a
  // second share URL in the same tab, or back/forward across two share
  // URLs, must swap the editor and canvas just like a cold boot would.
  // Only a valid #p=… payload syncs; foreign or cleared hashes never wipe
  // current work. The app never pushes share hashes into the address bar
  // itself (Copy Link builds the URL in the clipboard), so this listener
  // only ever reacts to real navigations.
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash
      const shared = readHashSource(hash)
      if (shared === null) {
        // A corrupt share payload navigating in mid-session gets the same
        // explicit notice a cold boot would; foreign hashes stay ignored.
        if (isShareHash(hash)) setShareInvalid(true)
        return
      }
      setShareInvalid(false)
      const sample = SAMPLES.find((entry) => entry.source === shared)
      setSource(shared)
      setSettledSource(shared) // settle immediately, like a shared-link boot
      setSelectedId(null)
      setSampleName(sample?.name ?? null)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [settledSource])

  // Export PNG failure flash reset; success needs no timer (download fires).
  useEffect(() => {
    if (pngState !== 'failed') return
    const timer = window.setTimeout(() => setPngState('idle'), COPY_FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [pngState])

  // Matrix toggle and theme flips no longer remount the canvas: the graph
  // data (and its palette) flows into the live React Flow instance, and the
  // viewport stays put. Only the selection is dropped, since expanded ids
  // (`<stage>/m<i>`) appear and vanish with the toggle. The ref skips the
  // mount run.
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
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

  // The §10 expansion toggle exists whenever the model carries a matrix
  // that survives exclusion - even one too big to expand, which then shows
  // up disabled with an explanation instead of vanishing (or worse, lying).
  const showMatrixToggle = useMemo(
    () => canvasStats.stages > 0 && hasMatrixStage(model.rootStages),
    [canvasStats.stages, model],
  )
  // Expandable means canExpandMatrix() holds somewhere in the model: at
  // least one combination AND within the MATRIX_CELL_LIMIT safety ceiling,
  // matching exactly what computeLayout will do when the toggle turns on.
  const matrixExpandable = useMemo(() => hasExpandableMatrix(model.rootStages), [model])

  // Display name for the selection segment of the status line (§9), plus the
  // resolved stage that feeds the details panel. Container group nodes share
  // ids with their model stage but have no layout leaf; resolving them gives
  // their selection a real inspector instead of a dead ring.
  const selectedStage = selectedId
    ? (layout.nodes.find((node) => node.id === selectedId) ?? null)
    : null
  const selectedName = selectedStage?.name ?? null
  const selectedContainer = useMemo(() => {
    if (!selectedId || selectedStage) return null
    const find = (stages: readonly StageNode[]): StageNode | null => {
      for (const stage of stages) {
        if (stage.id === selectedId) return stage
        const nested = find([
          ...(stage.parallelBranches ?? []),
          ...(stage.sequentialChildren ?? []),
        ])
        if (nested) return nested
      }
      return null
    }
    return find(model.rootStages)
  }, [model, selectedId, selectedStage])

  /** Close the details panel and drop the canvas selection ring with it. */
  function closeDetailsPanel() {
    flowApi.current?.clearSelection()
    setSelectedId(null)
  }

  // ---- Header actions ------------------------------------------------------

  /**
   * Sample pick replaces the editor immediately (§12) and settles just as
   * immediately (§17: "fresh parse clears stale selection") - no reason to
   * make the user wait out the typing debounce for a whole-file swap.
   * Provenance records which sample the text came from.
   */
  function pickSample(sample: Sample) {
    setSampleName(sample.name)
    setSource(sample.source)
    setSettledSource(sample.source)
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

  /**
   * Empty-state Paste chip: be literal about the label. Read the clipboard
   * and drop its text straight into the editor, then leave a focused caret
   * so typing continues seamlessly. When the browser refuses (permission
   * denied, API unsupported on insecure contexts) or the clipboard holds no
   * text, say so out loud: flash the editor pane and show a hint naming the
   * manual path, so the click can never look like it did nothing.
   */
  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (text.length > 0) {
        setPasteHint(false)
        changeSource(text)
        editorApi.current?.focus()
        return
      }
    } catch {
      // Clipboard unavailable; the guided fallback below takes over.
    }
    setPasteHint(true)
    flashEditorPane()
    editorApi.current?.focus()
  }

  /**
   * Same path as paste (§17): read the file as text, swap the editor. Never
   * silent on failure - oversized files are refused before reading (the
   * synchronous parser would choke), read errors surface with the file's
   * name, and both leave a role="alert" notice under the Upload button.
   */
  async function handleUploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`"${file.name}" is over 1 MB — that is not a Jenkinsfile`)
      flashEditorPane()
      return
    }
    try {
      const text = await file.text()
      setSampleName(null)
      setSource(text)
      setUploadError(null)
    } catch {
      setUploadError(`"${file.name}" could not be read`)
      flashEditorPane()
    }
  }

  /**
   * Serialize the settled model to the clipboard (§12). A fast click right
   * after typing must never export the previous parse: the pending debounce
   * settles first (same contract as the timer - fresh graph, stale
   * selection dropped), then the model for the text currently in the editor
   * is what gets copied.
   */
  async function copyModelJson() {
    const pending = source !== settledSource
    if (pending) {
      setSettledSource(source)
      setSelectedId(null)
    }
    // After a flush the memoized `model` still trails one render behind, so
    // the settled text is parsed directly; otherwise reuse the settled memo.
    const snapshot = pending ? parseJenkinsfile(source) : model
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2))
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
   * Copy the page URL carrying the current source, encoded into the hash
   * (M6 sharing). The address bar is never touched: normal editing URLs
   * stay clean and the encoded link exists only in the clipboard. The URL
   * is assembled from location parts (not by resolving the hash against
   * the origin) so the /PipeViz/ deployment subpath survives into copied
   * links. Sources past MAX_SHARE_SOURCE_LENGTH are refused with explicit
   * feedback instead of producing a URL some apps would silently truncate.
   */
  async function copyShareLink() {
    if (source.length === 0) return
    if (source.length > MAX_SHARE_SOURCE_LENGTH) {
      setShareNotice('too-large')
      return
    }
    try {
      const url = pageUrlWithHash(
        window.location.origin,
        window.location.pathname,
        window.location.search,
        sourceToHash(source),
      )
      await navigator.clipboard.writeText(url)
      setLinkState('copied')
      setShareNotice('privacy')
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

  /**
   * One-shot highlight on the editor pane: same restart-safe pattern as
   * flashNode, used by the empty-state Paste chip to point eyes at the
   * source column when the clipboard could not be read.
   */
  function flashEditorPane() {
    const el = document.querySelector('.editor-pane')
    if (!(el instanceof HTMLElement)) return
    el.classList.remove('editor-flash')
    void el.offsetWidth // restart the animation if it is already flashing
    el.classList.add('editor-flash')
    window.setTimeout(() => el.classList.remove('editor-flash'), 1000)
  }

  /** Diagnostic row click: jump the caret, flash the related card if any.
      Matching goes beyond exact source-line equality: a diagnostic landing
      mid-stage maps to its containing (innermost) stage card, so errors on
      body lines still point somewhere useful. */
  function handleDiagnosticClick(diagnostic: Diagnostic) {
    revealLine(diagnostic.line)
    flashNode(stageForDiagnostic(layout.nodes, diagnostic.line)?.id ?? null)
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
            <span className="upload-wrap">
              <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
                Upload
              </button>
              {uploadError && (
                <span className="upload-error" role="alert">
                  {uploadError}
                </span>
              )}
            </span>
            <button
              type="button"
              className={copyState === 'copied' ? 'btn btn-copied' : 'btn'}
              onClick={copyModelJson}
            >
              {copyState === 'copied' ? 'Copied ✓' : copyState === 'failed' ? 'Copy failed' : 'Copy JSON'}
            </button>
            <span className="share-wrap">
              {/* Standing privacy disclosure (§8): the warning must not be
                  a post-hoc surprise - it lives beside the button always. */}
              <span className="share-hint" aria-hidden="true">
                embeds source
              </span>
              <button
                type="button"
                className={linkState === 'copied' ? 'btn btn-copied' : 'btn'}
                disabled={source.length === 0}
                onClick={copyShareLink}
                title="Copy a link that reopens this exact pipeline - the link text embeds your Jenkinsfile"
              >
                {linkState === 'copied' ? 'Copied ✓' : linkState === 'failed' ? 'Copy failed' : 'Copy link'}
              </button>
              {shareNotice === 'privacy' && (
                <span className="share-warning" role="status">
                  <strong>Shared links contain your pipeline source.</strong> Review
                  sensitive information before sharing.
                </span>
              )}
              {shareNotice === 'too-large' && (
                <span className="share-warning share-too-large" role="alert">
                  <strong>Pipeline too large for a URL link.</strong> Shrink the Jenkinsfile or
                  use Upload-style file sharing instead.
                </span>
              )}
            </span>
            <button
              type="button"
              className={pngState === 'failed' ? 'btn btn-export-failed' : 'btn'}
              disabled={parsing || pngState === 'working' || canvasStats.stages === 0}
              onClick={exportGraphPng}
              title={
                parsing
                  ? 'Unavailable while edits settle - the canvas renders the last settled parse'
                  : 'Download the current graph as a PNG image'
              }
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

      {/* ---- Invalid share link banner (M6): a #p=… payload that fails
           to decode is called out explicitly - never a silent empty boot. */}
      {shareInvalid && (
        <div className="share-invalid" role="alert">
          <span>
            <strong>This PipeViz link is invalid or corrupted.</strong> The embedded pipeline could
            not be decoded, so the editor starts empty.
          </span>
          <button type="button" className="btn" onClick={() => setShareInvalid(false)}>
            Dismiss
          </button>
        </div>
      )}

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
                  disabled={!matrixExpandable}
                  onClick={() => setExpandMatrix((value) => !value)}
                  aria-pressed={expandMatrix}
                  title={
                    matrixExpandable
                      ? 'Toggle between the compact matrix card and one card per axis combination'
                      : 'This matrix has 1000+ surviving cells - expansion unavailable'
                  }
                >
                  {!matrixExpandable
                    ? '1000+ cells · expansion unavailable'
                    : expandMatrix
                      ? 'Collapse matrix'
                      : 'Expand matrix'}
                </button>
              )}
            </div>
          )}
          {hasCanvasContent ? (
            <FlowCanvas
              model={model}
              layout={layout}
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
                    onClick={pasteFromClipboard}
                    title="Paste the Jenkinsfile on your clipboard straight into the editor"
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
              {pasteHint && (
                <p className="empty-hint" role="status">
                  Clipboard not readable here — click in the editor and press Ctrl+V / ⌘V.
                </p>
              )}
              <p className="empty-footnote">Nothing leaves your browser.</p>
            </div>
          )}

          {/* Details panel floats over the canvas, right-aligned (§9).
              Cards get the step inspector; selected parallel/matrix group
              containers get a shape inspector instead of a dead ring. */}
          {(selectedStage || selectedContainer) && (
            <DetailsPanel
              stage={selectedStage ?? undefined}
              container={selectedContainer ?? undefined}
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
