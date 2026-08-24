// ---------------------------------------------------------------------------
// layout/computeLayout.ts - PipelineModel -> positioned nodes + edges (plan §8).
//
// Horizontal, Blue Ocean style flow:
//   - Sequential siblings occupy successive columns.
//   - A parallel group becomes a container: the parent stage renders as the
//     container's header bar rather than its own card (mockup §8), branches
//     stack vertically in lanes sharing one column, and every branch keeps
//     flowing rightward inside its lane. Fan-out edges run from the last node
//     before the group into each branch head; fan-in edges run from each
//     branch tail into the next sequential stage.
//   - Nested `stages` groups can stay compact as one parent card or expand
//     into a vertical sequential container. The vertical shape saves width
//     without implying parallel execution.
//   - Matrix stages render as single cards by default; passing
//     `{ expandMatrix: true }` swaps each expandable matrix into a container
//     holding one card per axis combination (M6 toggle, mockups §10).
//
// The algorithm is a pure two-pass recursion: bottom-up bounding boxes
// (`measure`), then top-down placement (`placeStage`) where every subtree is
// vertically centered inside whatever band its parent allocated - the plan's
// "parents centered against their children" rule falls out of that centering.
// Output is plain data: tests need no renderer and FlowCanvas (M3) maps it
// straight onto React Flow nodes/edges.
// ---------------------------------------------------------------------------

import type { PipelineModel, StageNode } from '../model/types'
import { canExpandMatrix, comboLabel, computeMatrixCombos } from './matrixCombos'

/** Options steering layout variants. */
export interface LayoutOptions {
  /**
   * Expand matrix stages into one combination card per cell inside a
   * container (default false: compact MATRIX cards, mockups §10 default).
   */
  expandMatrix?: boolean
  /**
   * Stable ids of nested-stage parents expanded into sequential containers.
   * Omitting the set produces the compact default. Callers opt into only the
   * groups they want materialized, which is safe for very deep graphs.
   */
  expandedSequentialIds?: ReadonlySet<string>
  /** Stable stage ids whose commands are visible inside enlarged cards. */
  expandedStepIds?: ReadonlySet<string>
}

/** Card size and inter-column / inter-lane gaps for v1 (mockups §19). */
export const NODE_W = 220
export const NODE_H = 72
export const H_GAP = 90
export const V_GAP = 36

/**
 * Chrome around parallel containers: a label bar on top ("PARALLEL · failFast")
 * plus breathing room above the first lane and below the last one. Values are
 * internal to layout; mockups pin only card sizes and gaps.
 */
export const CONTAINER_HEADER = 52
export const CONTAINER_PAD_X = 18
export const CONTAINER_PAD_Y = 14
export const GROUP_MIN_WIDTH = 300
export const GROUP_MAX_WIDTH = 720
export const STEP_CARD_MIN_WIDTH = 360
export const STEP_CARD_MAX_WIDTH = 640
export const STEP_CARD_CHROME_HEIGHT = 86
export const STEP_ROW_BASE_HEIGHT = 32
export const STEP_ROW_GAP = 6
export const STEP_WRAP_LINE_HEIGHT = 16

/** Why an edge exists; drives styling at render time, never geometry. */
export type EdgeKind = 'chain' | 'fan-out' | 'fan-in'

/** Structural presentation shared by current and future pipeline adapters. */
export type GroupKind = 'parallel' | 'matrix' | 'sequential'

/** A stage copy carrying its top-left position on the canvas. */
export interface PositionedStage extends StageNode {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Bounding rectangle of a parallel group, keyed by the parent stage id.
 * Renderers draw the double-line container from this and attach the parent's
 * badges (PAR ×n, failFast) to its header.
 */
export interface GroupBox {
  id: string
  x: number
  y: number
  width: number
  height: number
  kind: GroupKind
  /** The structural stage represented by this cardless container. */
  stage: StageNode
  /** Branch, cell, or nested-stage count shown in the group header. */
  itemCount: number
}

/** Compatibility alias retained for existing layout consumers. */
export type ParallelBox = GroupBox

export interface LayoutEdge {
  /** Deterministic `${source}->${target}`; ids are unique across the graph. */
  id: string
  source: string
  target: string
  kind: EdgeKind
  /** Vertical only for links inside an expanded sequential container. */
  orientation?: 'vertical'
}

export interface LayoutResult {
  /** Every rendered stage card; parallel parents appear only via containers. */
  nodes: PositionedStage[]
  edges: LayoutEdge[]
  containers: GroupBox[]
  /** Bounding box of all content including container chrome, ≥0. */
  width: number
  height: number
}

interface Box {
  width: number
  height: number
}

interface WalkContext {
  nodes: PositionedStage[]
  containers: GroupBox[]
  edges: LayoutEdge[]
}

/**
 * Deep-copy of a matrix's relative-id cell chain under one expanded lane.
 * Cell ids are already unique paths relative to the matrix (`c0`, `c1/p1`,
 * …), so prefixing with the lane head id keeps every descendant stable and
 * collision-free across combinations.
 */
function cloneCellStages(stages: readonly StageNode[], lanePrefix: string): StageNode[] {
  return stages.map((stage) => ({
    ...stage,
    id: `${lanePrefix}/${stage.id}`,
    originId: stage.originId ?? stage.id,
    ...(stage.parallelBranches
      ? { parallelBranches: cloneCellStages(stage.parallelBranches, lanePrefix) }
      : {}),
    ...(stage.sequentialChildren
      ? { sequentialChildren: cloneCellStages(stage.sequentialChildren, lanePrefix) }
      : {}),
  }))
}

/**
 * The lanes a stage fans out into: its own parallel branches, or (when
 * matrix expansion is on) one synthesized lane per axis combination.
 * Synthesized lanes keep the matrix's line/when/agent so combo cards still
 * badge and jump to source honestly; ids derive from the parent
 * (`<id>/m<i>`), deterministic across re-parses like every other id.
 *
 * When the matrix declares real nested stages they ride along as the lane's
 * sequential children (mockups §10 fidelity: Build → Test → Deploy stays a
 * chain per cell); only step-less matrices fall back to one flat card
 * carrying the collected cell steps.
 */
interface ResolvedLayoutOptions {
  expandMatrix: boolean
  expandedSequentialIds?: ReadonlySet<string>
  expandedStepIds?: ReadonlySet<string>
}

function branchesOf(stage: StageNode, options: ResolvedLayoutOptions): StageNode[] | undefined {
  if (stage.parallelBranches && stage.parallelBranches.length > 0) return stage.parallelBranches
  if (!options.expandMatrix || !stage.matrixAxes) return undefined
  // Expansion ceiling: a product beyond MATRIX_CELL_LIMIT stays a summary
  // card instead of materializing enough nodes to freeze the browser.
  if (!canExpandMatrix(stage)) return undefined
  const combos = computeMatrixCombos(stage)
  const inherited = {
    line: stage.line,
    ...(stage.when ? { when: stage.when } : {}),
    ...(stage.agent ? { agent: stage.agent } : {}),
    ...(stage.hasInput ? { hasInput: true } : {}),
  }
  const cellStages = stage.matrixCellStages ?? []
  if (cellStages.length === 0) {
    const cellSteps = stage.matrixCellSteps ?? []
    return combos.map((combo, index) => ({
      id: `${stage.id}/m${index}`,
      name: comboLabel(combo),
      steps: cellSteps,
      ...inherited,
    }))
  }
  return combos.map((combo, index) => {
    const laneId = `${stage.id}/m${index}`
    return {
      id: laneId,
      name: comboLabel(combo),
      steps: [],
      sequentialChildren: cloneCellStages(cellStages, laneId),
      ...inherited,
    }
  })
}

function branchKind(stage: StageNode, options: ResolvedLayoutOptions): 'parallel' | 'matrix' {
  return options.expandMatrix && stage.matrixAxes ? 'matrix' : 'parallel'
}

function sequentialExpanded(stage: StageNode, options: ResolvedLayoutOptions): boolean {
  if (!stage.sequentialChildren?.length) return false
  return options.expandedSequentialIds?.has(stage.id) ?? false
}

function textLength(value: string): number {
  return Array.from(value).length
}

/** Conservative browser-like wrapping estimate with long-token support. */
function wrappedLineCount(value: string, usableWidth: number, characterWidth: number): number {
  const capacity = Math.max(8, Math.floor(usableWidth / characterWidth))
  const words = value.trim().split(/\s+/u).filter(Boolean)
  if (words.length === 0) return 1

  let lines = 1
  let column = 0
  for (const word of words) {
    let remaining = textLength(word)
    if (column > 0) {
      if (column + 1 + remaining <= capacity) {
        column += 1 + remaining
        continue
      }
      lines += 1
    }
    while (remaining > capacity) {
      lines += 1
      remaining -= capacity
    }
    column = remaining
  }
  return lines
}

/** Conservative compact metadata copy used only for expanded-card sizing. */
function badgeSizingLabel(stage: StageNode): string {
  const labels = [`${stage.steps.length} ${stage.steps.length === 1 ? 'step' : 'steps'}`]
  if (stage.when?.length) labels.push('WHEN')
  if (stage.failFast) labels.push('failFast')
  if (stage.agent) labels.push(`AGENT: ${stage.agent}`)
  if (stage.environmentEntries?.length) labels.push(`ENV ×${stage.environmentEntries.length}`)
  if (stage.tools?.length) labels.push(`TOOLS ×${stage.tools.length}`)
  if (stage.options?.length) labels.push(`OPT ×${stage.options.length}`)
  if (stage.hasInput) labels.push('IN')
  for (const fact of stage.metadata ?? []) {
    if (fact.visibility !== 'details') labels.push(`${fact.label}${fact.value ? `: ${fact.value}` : ''}`)
  }
  return labels.join(' · ')
}

/** Deterministic expanded-card dimensions for complete, wrapping step text. */
export function stageCardSize(stage: StageNode, options: LayoutOptions = {}): Box {
  if (!stage.steps.length || !options.expandedStepIds?.has(stage.id)) {
    return { width: NODE_W, height: NODE_H }
  }
  const labels = stage.steps.map((step) => `${step.name}${step.args ? ` ${step.args}` : ''}`)
  const longest = Math.max(textLength(stage.name), ...labels.map(textLength))
  const width = Math.ceil(
    Math.min(STEP_CARD_MAX_WIDTH, Math.max(STEP_CARD_MIN_WIDTH, 72 + longest * 7.1)),
  )
  const commandWidth = width - 68
  const wrappedLines = labels.reduce(
    (total, label) => total + wrappedLineCount(label, commandWidth, 7.1),
    0,
  )
  const titleLines = wrappedLineCount(stage.name, width - 88, 7.2)
  const badgeLines = wrappedLineCount(badgeSizingLabel(stage), width - 36, 6.6)
  return {
    width,
    height:
      STEP_CARD_CHROME_HEIGHT +
      stage.steps.length * STEP_ROW_BASE_HEIGHT +
      Math.max(0, stage.steps.length - 1) * STEP_ROW_GAP +
      (wrappedLines - stage.steps.length) * STEP_WRAP_LINE_HEIGHT +
      (titleLines - 1) * 18 +
      (badgeLines - 1) * 16,
  }
}

/**
 * Reserve enough header width for the complete owner name and compact facts.
 * React Flow nodes cannot measure their DOM before layout, so this deterministic
 * estimate uses the UI font sizes with conservative character widths.
 */
export function groupHeaderWidth(stage: StageNode, kind: GroupKind, itemCount: number): number {
  const kindWidth = kind === 'sequential' ? 78 : kind === 'parallel' ? 62 : 48
  const titleWidth = 24 + kindWidth + 8 + stage.name.length * 7 + (kind === 'sequential' ? 34 : 0)
  let badgeWidth = 24 + 62
  if (kind === 'matrix' && stage.matrixAxes?.length) {
    badgeWidth += stage.matrixAxes.join(' × ').length * 7 + 20
  }
  if (stage.failFast) badgeWidth += 72
  if (stage.when?.length) badgeWidth += 54
  if (stage.agent) badgeWidth += 112
  if (stage.environmentEntries?.length) badgeWidth += 62
  if (stage.tools?.length) badgeWidth += 68
  if (stage.options?.length) badgeWidth += 62
  if (stage.hasInput) badgeWidth += 40
  for (const fact of stage.metadata ?? []) {
    if (fact.visibility !== 'details') {
      badgeWidth += 26 + `${fact.label}${fact.value ? `: ${fact.value}` : ''}`.length * 6.5
    }
  }
  badgeWidth += String(itemCount).length * 7
  return Math.min(GROUP_MAX_WIDTH, Math.max(GROUP_MIN_WIDTH, Math.ceil(titleWidth), Math.ceil(badgeWidth)))
}

/**
 * Bottom-up pass: bounding box of one stage's whole subtree. Sequential lists
 * sum widths per link and take max height; parallel/matrix groups take the
 * widest lane plus horizontal padding and stack lane heights with V_GAP.
 */
function measure(stage: StageNode, options: ResolvedLayoutOptions): Box {
  const branches = branchesOf(stage, options)
  if (branches && branches.length > 0) {
    let lanes = 0
    let widest = 0
    for (const branch of branches) {
      const inner = measure(branch, options)
      widest = Math.max(widest, inner.width)
      lanes += inner.height
    }
    const kind = branchKind(stage, options)
    return {
      width: Math.max(CONTAINER_PAD_X * 2 + widest, groupHeaderWidth(stage, kind, branches.length)),
      height:
        CONTAINER_HEADER +
        CONTAINER_PAD_Y +
        lanes +
        V_GAP * (branches.length - 1) +
        CONTAINER_PAD_Y,
    }
  }

  if (sequentialExpanded(stage, options) && stage.sequentialChildren) {
    const stack = measureStack(stage.sequentialChildren, options)
    return {
      width: Math.max(
        CONTAINER_PAD_X * 2 + stack.width,
        groupHeaderWidth(stage, 'sequential', stage.sequentialChildren.length),
      ),
      height: CONTAINER_HEADER + CONTAINER_PAD_Y + stack.height + CONTAINER_PAD_Y,
    }
  }

  return stageCardSize(stage, options)
}

/** Bounding box of a sequential list: width sums with gaps, height is tallest. */
function measureChain(stages: readonly StageNode[], options: ResolvedLayoutOptions): Box {
  let width = 0
  let height = 0
  for (const stage of stages) {
    const inner = measure(stage, options)
    width += inner.width
    height = Math.max(height, inner.height)
  }
  return { width: width + H_GAP * Math.max(0, stages.length - 1), height }
}

/** Bounding box of a vertical sequential list inside a group container. */
function measureStack(stages: readonly StageNode[], options: ResolvedLayoutOptions): Box {
  let width = 0
  let height = 0
  for (const stage of stages) {
    const inner = measure(stage, options)
    width = Math.max(width, inner.width)
    height += inner.height
  }
  return { width, height: height + V_GAP * Math.max(0, stages.length - 1) }
}

/**
 * Emit one edge per source/target pair, classifying fan-out (>1 target),
 * fan-in (>1 source), or plain chain by shape alone.
 */
function connect(
  ctx: WalkContext,
  sources: readonly string[],
  targets: readonly string[],
  orientation?: 'vertical',
): void {
  for (const source of sources) {
    for (const target of targets) {
      ctx.edges.push({
        id: `${source}->${target}`,
        source,
        target,
        kind: sources.length > 1 ? 'fan-in' : targets.length > 1 ? 'fan-out' : 'chain',
        ...(orientation ? { orientation } : {}),
      })
    }
  }
}

/** Ids of the first rendered card(s) flow touches when entering a subtree. */
function headIds(stage: StageNode, options: ResolvedLayoutOptions): string[] {
  const branches = branchesOf(stage, options)
  if (branches && branches.length > 0) {
    return branches.flatMap((branch) => headIds(branch, options))
  }
  if (sequentialExpanded(stage, options) && stage.sequentialChildren?.[0]) {
    return headIds(stage.sequentialChildren[0], options)
  }
  return [stage.id]
}

/**
 * Top-down pass: place one stage's subtree inside band `[top, top+bandH]`
 * starting at column `x`. `entries` are tail ids feeding this subtree;
 * returns the tail ids downstream siblings should connect from.
 *
 * Invariant (guaranteed by `measure` everywhere this is called):
 * `measure(stage).height <= bandH`.
 */
function placeStage(
  stage: StageNode,
  x: number,
  top: number,
  bandH: number,
  entries: readonly string[],
  ctx: WalkContext,
  options: ResolvedLayoutOptions,
  entryOrientation?: 'vertical',
): string[] {
  const box = measure(stage, options)
  // Center this subtree's band within whatever the parent allocated.
  const ownTop = top + (bandH - box.height) / 2

  const branches = branchesOf(stage, options)
  if (branches && branches.length > 0) {
    // Container instead of a card: lanes start one shared column in, stacked
    // under the header bar. Incoming edges fan out straight to branch heads,
    // skipping the cardless parent exactly like mockup §7 draws it. Matrix
    // stages take the same shape when expanded; toFlow reads `.matrixAxes`
    // off the parent stage to label the container MATRIX instead of PARALLEL.
    ctx.containers.push({
      id: stage.id,
      x,
      y: ownTop,
      ...box,
      kind: branchKind(stage, options),
      stage,
      itemCount: branches.length,
    })
    connect(ctx, entries, branches.flatMap((branch) => headIds(branch, options)), entryOrientation)

    const widestLane = Math.max(...branches.map((branch) => measure(branch, options).width))
    const laneX = x + (box.width - widestLane) / 2
    let laneTop = ownTop + CONTAINER_HEADER + CONTAINER_PAD_Y
    const exits: string[] = []
    for (const branch of branches) {
      const laneHeight = measure(branch, options).height
      exits.push(...placeChain([branch], laneX, laneTop, laneHeight, [], ctx, options))
      laneTop += laneHeight + V_GAP
    }
    return exits
  }

  if (sequentialExpanded(stage, options) && stage.sequentialChildren) {
    ctx.containers.push({
      id: stage.id,
      x,
      y: ownTop,
      ...box,
      kind: 'sequential',
      stage,
      itemCount: stage.sequentialChildren.length,
    })
    return placeStack(
      stage.sequentialChildren,
      x + (box.width - measureStack(stage.sequentialChildren, options).width) / 2,
      ownTop + CONTAINER_HEADER + CONTAINER_PAD_Y,
      entries,
      ctx,
      options,
      entryOrientation,
    )
  }

  // Card y: centered inside the subtree's own band, which centers parents
  // against taller children automatically. A compact sequential parent is a
  // normal card and intentionally hides its descendants from this layout.
  const cardSize = stageCardSize(stage, options)
  const cardY = ownTop + (box.height - cardSize.height) / 2
  ctx.nodes.push({ ...stage, x, y: cardY, ...cardSize })
  connect(ctx, entries, [stage.id], entryOrientation)
  return [stage.id]
}

/**
 * Lay a sequential list out left→right inside band `[top, top+bandH]`,
 * chaining each sibling to the previous sibling's tails.
 */
function placeChain(
  stages: readonly StageNode[],
  x: number,
  top: number,
  bandH: number,
  entries: readonly string[],
  ctx: WalkContext,
  options: ResolvedLayoutOptions,
): string[] {
  let cursorX = x
  let sources: readonly string[] = entries
  for (const stage of stages) {
    sources = placeStage(stage, cursorX, top, bandH, sources, ctx, options)
    cursorX += measure(stage, options).width + H_GAP
  }
  return [...sources]
}

/**
 * Lay a sequential group top-to-bottom. The first child accepts the outer
 * flow direction; every later sibling connects through bottom/top handles.
 */
function placeStack(
  stages: readonly StageNode[],
  x: number,
  y: number,
  entries: readonly string[],
  ctx: WalkContext,
  options: ResolvedLayoutOptions,
  entryOrientation?: 'vertical',
): string[] {
  let cursorY = y
  let sources: readonly string[] = entries
  for (const [index, stage] of stages.entries()) {
    const inner = measure(stage, options)
    sources = placeStage(
      stage,
      x,
      cursorY,
      inner.height,
      sources,
      ctx,
      options,
      index === 0 ? entryOrientation : 'vertical',
    )
    cursorY += inner.height + V_GAP
  }
  return [...sources]
}

/**
 * Compute positions for every stage of a parsed model plus the edges between
 * cards. Pure: identical input yields byte-identical output. Never throws on
 * any PipelineModel shape, including empty ones.
 *
 * Unparsed regions (mockups §11) join the root chain as synthesized ghost
 * leaves, so they reserve real space and inherit normal chain/fan edges -
 * toFlow styles those edges dashed and renders the cards dimmed.
 */
export function computeLayout(model: PipelineModel, options: LayoutOptions = {}): LayoutResult {
  const resolved: ResolvedLayoutOptions = {
    expandMatrix: options.expandMatrix === true,
    ...(options.expandedSequentialIds !== undefined
      ? { expandedSequentialIds: options.expandedSequentialIds }
      : {}),
    ...(options.expandedStepIds !== undefined ? { expandedStepIds: options.expandedStepIds } : {}),
  }
  const ctx: WalkContext = { nodes: [], containers: [], edges: [] }

  // Ghost leaves: one per unparsed region, stable ids (`u<i>`). They merge
  // into the root chain by SOURCE POSITION (a stage demoted from the middle
  // of the file ghosts where it fell, not at the graph's end); the stable
  // sort keeps equal keys and same-line ties in document order.
  const ghostLeaves: StageNode[] = model.unparsedRegions.map((region, index) => ({
    id: `u${index}`,
    name: region.label ?? 'unparsed',
    line: region.startLine,
    steps: [],
    ghost: true,
    unparsedRange: { startLine: region.startLine, endLine: region.endLine },
  }))
  const roots: StageNode[] = [...model.rootStages, ...ghostLeaves].sort(
    (a, b) => a.line - b.line,
  )

  if (roots.length === 0) {
    return { nodes: [], edges: [], containers: [], width: 0, height: 0 }
  }

  const whole = measureChain(roots, resolved)
  placeChain(roots, 0, 0, whole.height, [], ctx, resolved)

  return { nodes: ctx.nodes, edges: ctx.edges, containers: ctx.containers, ...whole }
}
