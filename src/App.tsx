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
//   - double-clicking a structural card expands it; leaf cards jump to source
//
// UX principles applied here:
//   - Debounced re-parse: the graph refreshes 400ms after typing stops
//     (mockup §13), so mid-word keystrokes never thrash the canvas.
//   - FlowCanvas updates its graph in place (no remount), so camera and
//     compatible selection survive re-parses, shape changes, and theme flips.
//   - The status bar tells the truth about app state: busy while the
//     debounce settles, ready with kind/stage/step counts once parsed,
//     diagnostic counts as soon as the parser reports any (mockup §15).
//   - The privacy promise ("nothing leaves your browser") stays visible -
//     it only yields its slot to the partial-graph note when errors exist.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'

import { loadSessionDraft, storeSessionDraft } from './draft'
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
import { PipelineDetailsPanel } from './ui/PipelineDetailsPanel'
import type { EditorApi } from './ui/EditorPane'
import { SamplePicker } from './ui/SamplePicker'
import type { SamplePickerApi } from './ui/SamplePicker'
import { candidateStageCount, partialGraphNote, stageForDiagnostic } from './ui/diagnosticsSupport'
import {
  DEFAULT_EDITOR_WIDTH,
  EDITOR_WIDTH_STEP,
  MIN_CANVAS_WIDTH,
  MIN_EDITOR_WIDTH,
  clampEditorWidth,
  loadStoredEditorWidth,
  storeEditorWidth,
} from './ui/editorResize'
import { pipelineStats } from './ui/pipelineStats'
import { pipelineMetadataBadges } from './ui/pipelineMetadata'

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
function bootFromHash(): {
  source: string
  sampleName: string | null
  shareInvalid: boolean
  draftRecovered: boolean
} {
  const hash = typeof window === 'undefined' ? '' : window.location.hash
  const shared = readHashSource(hash)
  if (shared !== null) {
    const sample = SAMPLES.find((entry) => entry.source === shared)
    return {
      source: shared,
      sampleName: sample?.name ?? null,
      shareInvalid: false,
      draftRecovered: false,
    }
  }

  const draft =
    typeof window === 'undefined'
      ? null
      : loadSessionDraft(window.sessionStorage, SOURCE_LENGTH_LIMIT)
  const sample = draft === null ? undefined : SAMPLES.find((entry) => entry.source === draft)
  return {
    source: draft ?? '',
    sampleName: sample?.name ?? null,
    shareInvalid: isShareHash(hash),
    // A bundled sample is reproducible and therefore not unsaved work.
    draftRecovered: draft !== null && sample === undefined,
  }
}

// Mockup §13: re-parse fires 400ms after typing stops.
const REPARSE_DEBOUNCE_MS = 400

/**
 * Ceiling on synchronously parsed source. Parsing runs on the UI thread;
 * past ~256 KB of Jenkinsfile the pause becomes a freeze, so oversized
 * input refuses to parse (with a visible notice) until it shrinks. Any
 * real Jenkinsfile sits orders of magnitude below this.
 */
export const SOURCE_LENGTH_LIMIT = 262_144

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

/** Filenames accepted after the unrestricted native picker returns. */
function isAcceptedUploadName(name: string): boolean {
  const normalized = name.toLowerCase()
  return (
    normalized === 'jenkinsfile' ||
    normalized.endsWith('.jenkinsfile') ||
    normalized.endsWith('.groovy') ||
    normalized.endsWith('.txt')
  )
}

/** Remove an inbound share payload once local content diverges from it. */
function clearDivergentShareHash(nextSource: string): void {
  const hash = window.location.hash
  if (!isShareHash(hash) || readHashSource(hash) === nextSource) return
  clearShareHash()
}

/** Remove any current share payload without creating a history entry. */
function clearShareHash(): void {
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`,
  )
}

/** Collect every parser-owned nested-stage parent across recursive shapes. */
function sequentialGroupIds(stages: readonly StageNode[], sink = new Set<string>()): Set<string> {
  for (const stage of stages) {
    if (stage.sequentialChildren?.length) sink.add(stage.id)
    sequentialGroupIds(stage.parallelBranches ?? [], sink)
    sequentialGroupIds(stage.sequentialChildren ?? [], sink)
    sequentialGroupIds(stage.matrixCellStages ?? [], sink)
  }
  return sink
}

/** Collect every parser-owned stage carrying graph-expandable commands. */
function stageStepIds(stages: readonly StageNode[], sink = new Set<string>()): Set<string> {
  for (const stage of stages) {
    if (stage.steps.length) sink.add(stage.id)
    stageStepIds(stage.parallelBranches ?? [], sink)
    stageStepIds(stage.sequentialChildren ?? [], sink)
    stageStepIds(stage.matrixCellStages ?? [], sink)
  }
  return sink
}

/**
 * App renders the three-region layout from the UI spec (plan section 10):
 * header / workspace (editor + canvas) / diagnostics bar.
 */
export default function App() {
  // Shared-link boot state, resolved once per mount.
  const boot = useRef(bootFromHash()).current
  // Live editor contents; single source of truth for the whole app.
  const [source, setSource] = useState(boot.source)
  // A deliberate source load is a recovery point. Manual changes diverging
  // from it are the only state that warrants a close-tab warning.
  const baselineSourceRef = useRef(boot.draftRecovered ? '' : boot.source)
  // The most recent input we actually parsed; trails `source` by the debounce
  // (except on a shared-link boot, which settles immediately).
  const [settledSource, setSettledSource] = useState(boot.source)
  // Currently selected card id, mirrored up from the canvas. Null means
  // nothing selected, which also means no details panel.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pipelineDetailsOpen, setPipelineDetailsOpen] = useState(false)
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
  // Nested stages start compact. Stable path ids preserve each user's local
  // expansion choices through theme changes and compatible source edits.
  const [expandedSequentialIds, setExpandedSequentialIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(() => new Set())
  // Whole-source replacements and matrix shape changes request a fresh fit.
  // Ordinary debounced edits preserve the user's current camera.
  const [fitGraphVersion, setFitGraphVersion] = useState(0)
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
  // Session storage restores work after an accidental reload. The banner is
  // informational and clears once the recovered text is edited or replaced.
  const [draftRecovered, setDraftRecovered] = useState(boot.draftRecovered)
  // M6 color scheme (mockups §2 shipped dark-only v1): persisted choice,
  // dark unless the visitor explicitly picked light.
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window === 'undefined' ? 'dark' : loadStoredTheme(window.localStorage),
  )
  // Desktop source/canvas split. Narrow layouts stack panes and hide the
  // horizontal divider, while the desktop width persists locally.
  const [editorWidth, setEditorWidth] = useState(() =>
    typeof window === 'undefined'
      ? DEFAULT_EDITOR_WIDTH
      : clampEditorWidth(loadStoredEditorWidth(window.localStorage), window.innerWidth),
  )
  const [workspaceWidth, setWorkspaceWidth] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  )

  // Imperative handles into the two interactive regions.
  const editorApi = useRef<EditorApi | null>(null)
  const flowApi = useRef<FlowApi | null>(null)
  const samplePickerApi = useRef<SamplePickerApi | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const workspaceRef = useRef<HTMLElement>(null)

  // Session-only recovery protects work from reloads without retaining
  // pipeline source after the tab's session ends.
  useEffect(() => {
    storeSessionDraft(window.sessionStorage, source, SOURCE_LENGTH_LIMIT)
  }, [source])

  useEffect(() => {
    storeEditorWidth(window.localStorage, editorWidth)
  }, [editorWidth])

  // Track live workspace bounds so the CSS width, stored preference, and
  // separator ARIA values cannot disagree after a browser resize.
  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) return
    const updateWidth = () => {
      const nextWidth = workspace.getBoundingClientRect().width
      setWorkspaceWidth(nextWidth)
      if (window.matchMedia('(min-width: 901px)').matches) {
        setEditorWidth((current) => clampEditorWidth(current, nextWidth))
      }
    }
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(workspace)
    return () => observer.disconnect()
  }, [])

  const hasUnsavedWork = source.length > 0 && source !== baselineSourceRef.current

  // Browsers show their standard confirmation when closing or reloading a
  // tab that contains edits not represented by a loaded sample, file, or
  // share link. No custom text is used because modern browsers ignore it.
  useEffect(() => {
    if (!hasUnsavedWork) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [hasUnsavedWork])

  /**
   * Debounce gate between typing and parsing. Each keystroke resets the
   * timer; only when the keyboard rests for 400ms do we commit the new
   * source, and let the memoized
   * parse/layout below run.
   */
  useEffect(() => {
    if (source === settledSource) return
    const timer = window.setTimeout(() => {
      setSettledSource(source)
      // Privacy (M6 sharing): the address bar is nobody's storage. A share
      // payload only sits there because a link was opened, so once edits
      // diverge from it, strip it back to the bare page URL. Encoded links
      // exist solely in the clipboard, built fresh by Copy Link.
      clearDivergentShareHash(source)
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
        // explicit notice a cold boot would. Leaving a share hash clears any
        // stale warning without replacing the current editor contents.
        setShareInvalid(isShareHash(hash))
        return
      }
      setShareInvalid(false)
      setDraftRecovered(false)
      baselineSourceRef.current = shared
      const sample = SAMPLES.find((entry) => entry.source === shared)
      setSource(shared)
      setSettledSource(shared) // settle immediately, like a shared-link boot
      setSelectedId(null)
      setExpandedSequentialIds(new Set())
      setExpandedStepIds(new Set())
      setPipelineDetailsOpen(false)
      setSampleName(sample?.name ?? null)
      setFitGraphVersion((version) => version + 1)
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
  // Oversized sources skip parsing entirely (see SOURCE_LENGTH_LIMIT) - the
  // banner below explains, instead of freezing the tab. Parse duration is
  // measured for the status bar's issue-report tooltip; the ref write is an
  // idempotent measurement, not render state.
  const parseMsRef = useRef(0)
  const model = useMemo(() => {
    const withinLimit = settledSource.length <= SOURCE_LENGTH_LIMIT
    const started = performance.now()
    const parsed = parseJenkinsfile(withinLimit ? settledSource : '')
    parseMsRef.current = Math.round(performance.now() - started)
    return parsed
  }, [settledSource])
  // True while the live editor holds more than PipeViz will parse.
  const sourceTooLarge = source.length > SOURCE_LENGTH_LIMIT
  const layout = useMemo(
    () => computeLayout(model, { expandMatrix, expandedSequentialIds, expandedStepIds }),
    [model, expandMatrix, expandedSequentialIds, expandedStepIds],
  )
  const availableSequentialIds = useMemo(() => {
    const ids = sequentialGroupIds(model.rootStages)
    // Expanded matrix lanes are layout-time clones. Once visible, include
    // their stable clone ids in the same bulk-control system.
    for (const stage of layout.nodes) {
      if (stage.sequentialChildren?.length) ids.add(stage.id)
    }
    for (const container of layout.containers) {
      if (container.kind === 'sequential') ids.add(container.id)
    }
    return ids
  }, [layout, model])
  const availableStepIds = useMemo(() => {
    const ids = stageStepIds(model.rootStages)
    for (const stage of layout.nodes) {
      if (stage.steps.length) ids.add(stage.id)
    }
    return ids
  }, [layout, model])

  // Selection is controlled by App so a card can become a group container
  // without dismissing its inspector. Only remove it when its stable id no
  // longer exists in the rendered graph.
  useEffect(() => {
    if (!selectedId) return
    const stillRendered =
      layout.nodes.some((node) => node.id === selectedId) ||
      layout.containers.some((container) => container.id === selectedId)
    if (!stillRendered) setSelectedId(null)
  }, [layout, selectedId])

  // True between a keystroke and the debounce settling (status bar "busy").
  const parsing = source !== settledSource

  // Status numbers describe the source's compact graph and therefore stay
  // stable when a matrix is expanded. Matrix cells and their shared step
  // declarations are named separately instead of appearing as zero steps.
  const canvasStats = useMemo(() => pipelineStats(model.rootStages), [model])
  const metadataBadges = useMemo(() => pipelineMetadataBadges(model), [model])

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
  const selectedContainer = selectedId && !selectedStage
    ? (layout.containers.find((container) => container.id === selectedId)?.stage ?? null)
    : null
  const selectedName = selectedStage?.name ?? selectedContainer?.name ?? null

  /** Close the details panel and drop the canvas selection ring with it. */
  const closeDetailsPanel = useCallback(() => {
    flowApi.current?.clearSelection()
    setSelectedId(null)
  }, [])

  const selectCanvasNode = useCallback((id: string | null) => {
    if (id !== null) setPipelineDetailsOpen(false)
    setSelectedId(id)
  }, [])

  // ---- Header actions ------------------------------------------------------

  /**
   * Sample pick replaces and settles the editor immediately. A whole-source
   * replacement intentionally resets selection and structural preferences.
   * Provenance records which sample the text came from.
   */
  function pickSample(sample: Sample) {
    clearDivergentShareHash(sample.source)
    baselineSourceRef.current = sample.source
    setSampleName(sample.name)
    setDraftRecovered(false)
    setSource(sample.source)
    setSettledSource(sample.source)
    setSelectedId(null)
    setExpandedSequentialIds(new Set())
    setExpandedStepIds(new Set())
    setPipelineDetailsOpen(false)
    setFitGraphVersion((version) => version + 1)
  }

  /**
   * Manual edits (typing, Tab, paste into the textarea) diverge the content
   * from any named sample, so provenance drops and the caption goes quiet.
   */
  function changeSource(next: string) {
    clearDivergentShareHash(next)
    setSampleName(null)
    setDraftRecovered(false)
    setPipelineDetailsOpen(false)
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
        setExpandedSequentialIds(new Set())
        setExpandedStepIds(new Set())
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
    if (!isAcceptedUploadName(file.name)) {
      setUploadError(`"${file.name}" is not a supported Jenkinsfile or text file`)
      flashEditorPane()
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`"${file.name}" is over 1 MB; that is not a Jenkinsfile`)
      flashEditorPane()
      return
    }
    try {
      const text = await file.text()
      if (text.length > SOURCE_LENGTH_LIMIT) {
        setUploadError(`"${file.name}" exceeds the 256 KB visualization limit`)
        flashEditorPane()
        return
      }
      clearDivergentShareHash(text)
      baselineSourceRef.current = text
      setSampleName(null)
      setDraftRecovered(false)
      setSource(text)
      setSettledSource(text)
      setSelectedId(null)
      setExpandedSequentialIds(new Set())
      setExpandedStepIds(new Set())
      setPipelineDetailsOpen(false)
      setFitGraphVersion((version) => version + 1)
      setUploadError(null)
    } catch {
      setUploadError(`"${file.name}" could not be read`)
      flashEditorPane()
    }
  }

  /**
   * Serialize the settled model to the clipboard (§12). A fast click right
   * after typing must never export the previous parse: the pending debounce
   * settles first, then the model for the text currently in the editor is
   * what gets copied. Compatible selection remains controlled by stable ids.
   */
  async function copyModelJson() {
    if (source.length > SOURCE_LENGTH_LIMIT) {
      setCopyState('failed')
      return
    }
    const pending = source !== settledSource
    if (pending) {
      clearDivergentShareHash(source)
      setSettledSource(source)
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
  const revealLine = useCallback((line: number) => {
    editorApi.current?.revealLine(line)
  }, [])
  const jumpStageToSource = useCallback((stage: StageNode) => {
    revealLine(stage.line)
  }, [revealLine])

  // Keyboard path for §17's jump-to-source (a11y audit #22): pressing `j`
  // jumps the caret to the selected card/container's source line, so the
  // feature never depends on a double-click. Typing targets (editor, any
  // text field) are ignored.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'j' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      const node = layout.nodes.find((candidate) => candidate.id === selectedId)
      const containerStage = selectedContainer
      const line = node?.line ?? containerStage?.line
      if (line !== undefined) revealLine(line)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, selectedContainer, layout, revealLine])

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

  /** Matrix expansion changes graph geometry enough to warrant a fresh fit. */
  function toggleMatrixExpansion() {
    setExpandMatrix((value) => !value)
    setFitGraphVersion((version) => version + 1)
  }

  /**
   * Turn one compact nested-stage card into a reusable React Flow group, or
   * collapse it back. Expansion only reframes when the new group would be
   * clipped; otherwise the user's camera stays exactly where it was.
   */
  const toggleSequentialExpansion = useCallback((stageId: string) => {
    setExpandedSequentialIds((current) => {
      const next = new Set(current)
      if (next.has(stageId)) next.delete(stageId)
      else next.add(stageId)
      return next
    })
    flowApi.current?.revealGroup(stageId)
  }, [])

  const toggleStepExpansion = useCallback((stageId: string) => {
    setExpandedStepIds((current) => {
      const next = new Set(current)
      if (next.has(stageId)) next.delete(stageId)
      else next.add(stageId)
      return next
    })
    flowApi.current?.revealGroup(stageId)
  }, [])

  const expandAllSequential = useCallback(() => {
    setExpandedSequentialIds(new Set(availableSequentialIds))
    setExpandedStepIds(new Set(availableStepIds))
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => flowApi.current?.fitGraph()))
  }, [availableSequentialIds, availableStepIds])

  const collapseAllSequential = useCallback(() => {
    setExpandedSequentialIds(new Set())
    setExpandedStepIds(new Set())
  }, [])

  /** Current editor maximum, preserving a useful canvas beside it. */
  function editorWidthMax(): number {
    return Math.max(MIN_EDITOR_WIDTH, Math.round(workspaceWidth - MIN_CANVAS_WIDTH))
  }

  /** Fit only after the resize transaction commits and layout is measurable. */
  function refitGraphAfterResize() {
    window.requestAnimationFrame(() => flowApi.current?.fitGraph())
  }

  /** Pointer drag uses the workspace's left edge as the width origin. */
  function resizeEditorAt(clientX: number) {
    const workspace = workspaceRef.current
    if (!workspace) return
    const bounds = workspace.getBoundingClientRect()
    setEditorWidth(clampEditorWidth(clientX - bounds.left, bounds.width))
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeEditorAt(event.clientX)
  }

  function handleResizePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    resizeEditorAt(event.clientX)
  }

  function handleResizePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    refitGraphAfterResize()
  }

  function handleResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    let requested: number | null = null
    if (event.key === 'ArrowLeft') requested = editorWidth - EDITOR_WIDTH_STEP
    else if (event.key === 'ArrowRight') requested = editorWidth + EDITOR_WIDTH_STEP
    else if (event.key === 'Home') requested = MIN_EDITOR_WIDTH
    else if (event.key === 'End') requested = editorWidthMax()
    if (requested === null) return
    event.preventDefault()
    const workspaceWidth = workspaceRef.current?.getBoundingClientRect().width ?? window.innerWidth
    setEditorWidth(clampEditorWidth(requested, workspaceWidth))
    refitGraphAfterResize()
  }

  function resetEditorWidth() {
    const width = workspaceRef.current?.getBoundingClientRect().width ?? window.innerWidth
    setEditorWidth(clampEditorWidth(DEFAULT_EDITOR_WIDTH, width))
    refitGraphAfterResize()
  }

  // ---- Render -------------------------------------------------------------
  return (
    <div className="app">
      {/* ---- Region 1: header with brand and input actions ------------------ */}
      <header className="app-header">
        <div className="brand">
          <img src="./logo.svg" alt="" aria-hidden="true" className="brand-mark" />
          <span className="brand-name">PipeViz</span>
          <span className="brand-tagline" aria-label="Jenkinsfile to graph">
            <span>Jenkinsfile</span>
            <svg className="brand-flow-mark" viewBox="0 0 14 12" aria-hidden="true">
              <path d="M1 6h10M8 2.5 11.5 6 8 9.5" />
            </svg>
            <span>graph</span>
          </span>
        </div>
        <nav className="header-nav" aria-label="Input actions">
          <div className="header-actions">
            <SamplePicker samples={SAMPLES} onPick={pickSample} apiRef={samplePickerApi} />
            <input
              ref={fileInputRef}
              type="file"
              className="upload-input"
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
              disabled={source.length === 0 || sourceTooLarge}
              onClick={copyModelJson}
              title={
                source.length === 0
                  ? 'Unavailable until the editor contains a Jenkinsfile'
                  : sourceTooLarge
                  ? 'Unavailable because this source exceeds the visualization limit'
                  : 'Copy the parsed pipeline model as JSON'
              }
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
            not be decoded. {draftRecovered ? 'Your recovered tab draft is still open.' : 'The editor starts empty.'}
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              clearShareHash()
              setShareInvalid(false)
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {draftRecovered && !shareInvalid && (
        <div className="draft-recovered" role="status">
          <span>
            <strong>Recovered your draft after reload.</strong> It is stored only for this browser
            tab session.
          </span>
          <button type="button" className="btn" onClick={() => setDraftRecovered(false)}>
            Dismiss
          </button>
        </div>
      )}

      {/* ---- Oversized-source banner: the parse guard must explain
           itself - an empty canvas is otherwise indistinguishable from a
           silent failure. */}
      {sourceTooLarge && (
        <div className="share-invalid" role="alert">
          <span>
            <strong>This pipeline is too large to visualize.</strong> PipeViz parses sources up to
            256 KB; trim or split the Jenkinsfile and the graph will return.
          </span>
        </div>
      )}

      {/* ---- Region 2: workspace = editor pane + canvas area --------------- */}
      <main
        ref={workspaceRef}
        className="workspace"
        style={{ '--editor-width': `${editorWidth}px` } as CSSProperties}
      >
        <EditorPane value={source} onChange={changeSource} apiRef={editorApi} />
        <div
          className="editor-resizer"
          role="separator"
          aria-label="Resize pipeline source editor"
          aria-orientation="vertical"
          aria-valuemin={MIN_EDITOR_WIDTH}
          aria-valuemax={editorWidthMax()}
          aria-valuenow={editorWidth}
          tabIndex={0}
          title="Drag to resize the editor. Use arrow keys for precise adjustment."
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
          onDoubleClick={resetEditorWidth}
          onKeyDown={handleResizeKeyDown}
        />

        {/* Canvas area: the live graph once anything parsed, otherwise the
            how-to card. FlowCanvas fills the pane absolutely; React Flow
            provides its own dotted background and floating controls. */}
        <section
          className={caption !== null || showMatrixToggle || metadataBadges.length > 0 ? 'canvas-area has-toolbar' : 'canvas-area'}
          aria-label="Pipeline graph canvas"
        >
          {/* Canvas caption (§5/§8/§11) plus the M6 matrix toggle share one
              floating toolbar: the pill names the loaded sample while the
              text still is that sample and swaps to the honest parse-failed
              line whenever errors exist; the toggle only appears when the
              model actually carries an expandable matrix (§10). */}
          {(caption !== null || showMatrixToggle || metadataBadges.length > 0) && (
            <div className="canvas-toolbar">
              {caption !== null && <div className="canvas-caption">{caption}</div>}
              {metadataBadges.length > 0 && (
                <button
                  type="button"
                  className={pipelineDetailsOpen ? 'btn pipeline-meta-trigger active' : 'btn pipeline-meta-trigger'}
                  aria-expanded={pipelineDetailsOpen}
                  onClick={() => {
                    flowApi.current?.clearSelection()
                    setSelectedId(null)
                    setPipelineDetailsOpen((open) => !open)
                  }}
                  title="Open pipeline-level metadata inherited by stages"
                >
                  {metadataBadges.map((badge) => (
                    <span key={badge.label} className="pipeline-meta-chip" title={badge.title}>{badge.label}</span>
                  ))}
                </button>
              )}
              {showMatrixToggle && (
                <button
                  type="button"
                  className={expandMatrix ? 'btn canvas-toggle active' : 'btn canvas-toggle'}
                  disabled={!matrixExpandable}
                  onClick={toggleMatrixExpansion}
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
              onSelect={selectCanvasNode}
              apiRef={flowApi}
              onStageDoubleClick={jumpStageToSource}
              expandMatrix={expandMatrix}
              expandedSequentialIds={expandedSequentialIds}
              expandedStepIds={expandedStepIds}
              onToggleSequential={toggleSequentialExpansion}
              onToggleSteps={toggleStepExpansion}
              selectedId={selectedId}
              onExpandAllSequential={expandAllSequential}
              onCollapseAllSequential={collapseAllSequential}
              sequentialGroupCount={availableSequentialIds.size}
              stepExpandableCount={availableStepIds.size}
              theme={theme}
              fitKey={fitGraphVersion}
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
              pipeline={model}
              onClose={closeDetailsPanel}
              onJumpToSource={revealLine}
            />
          )}
          {pipelineDetailsOpen && (
            <PipelineDetailsPanel model={model} onClose={() => setPipelineDetailsOpen(false)} />
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
        hasMatrix={canvasStats.hasMatrix}
        matrixCells={canvasStats.matrixCells}
        matrixCellsOverLimit={canvasStats.matrixCellsOverLimit}
        sharedMatrixSteps={canvasStats.sharedMatrixSteps}
        diagnostics={model.diagnostics}
        selectionName={selectedName}
        partialNote={partialNote}
        parseMs={parseMsRef.current}
        onSelectDiagnostic={handleDiagnosticClick}
      />
    </div>
  )
}
