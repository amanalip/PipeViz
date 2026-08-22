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
//   - Nested `stages` groups unfold inline: the parent card stays (SEQ badge)
//     and its children continue in successive columns after it.
//   - Matrix stages stay single cards; axis-combo expansion is deferred to M6
//     (plan Q1), so layout treats them as leaves.
//
// The algorithm is a pure two-pass recursion: bottom-up bounding boxes
// (`measure`), then top-down placement (`placeStage`) where every subtree is
// vertically centered inside whatever band its parent allocated - the plan's
// "parents centered against their children" rule falls out of that centering.
// Output is plain data: tests need no renderer and FlowCanvas (M3) maps it
// straight onto React Flow nodes/edges.
// ---------------------------------------------------------------------------

import type { PipelineModel, StageNode } from '../model/types'

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
export const CONTAINER_HEADER = 28
export const CONTAINER_PAD_X = 18
export const CONTAINER_PAD_Y = 14

/** Why an edge exists; drives styling at render time, never geometry. */
export type EdgeKind = 'chain' | 'fan-out' | 'fan-in'

/** A stage copy carrying its top-left position on the canvas. */
export interface PositionedStage extends StageNode {
  x: number
  y: number
}

/**
 * Bounding rectangle of a parallel group, keyed by the parent stage id.
 * Renderers draw the double-line container from this and attach the parent's
 * badges (PAR ×n, failFast) to its header.
 */
export interface ParallelBox {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutEdge {
  /** Deterministic `${source}->${target}`; ids are unique across the graph. */
  id: string
  source: string
  target: string
  kind: EdgeKind
}

export interface LayoutResult {
  /** Every rendered stage card; parallel parents appear only via containers. */
  nodes: PositionedStage[]
  edges: LayoutEdge[]
  containers: ParallelBox[]
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
  containers: ParallelBox[]
  edges: LayoutEdge[]
}

/**
 * Bottom-up pass: bounding box of one stage's whole subtree. Sequential lists
 * sum widths per link and take max height; parallel groups take the widest
 * lane plus horizontal padding and stack lane heights with V_GAP between.
 */
function measure(stage: StageNode): Box {
  const branches = stage.parallelBranches
  if (branches && branches.length > 0) {
    let lanes = 0
    let widest = 0
    for (const branch of branches) {
      const inner = measure(branch)
      widest = Math.max(widest, inner.width)
      lanes += inner.height
    }
    return {
      width: CONTAINER_PAD_X * 2 + widest,
      height:
        CONTAINER_HEADER +
        CONTAINER_PAD_Y +
        lanes +
        V_GAP * (branches.length - 1) +
        CONTAINER_PAD_Y,
    }
  }

  if (stage.sequentialChildren && stage.sequentialChildren.length > 0) {
    const chain = measureChain(stage.sequentialChildren)
    return { width: NODE_W + H_GAP + chain.width, height: Math.max(NODE_H, chain.height) }
  }

  return { width: NODE_W, height: NODE_H }
}

/** Bounding box of a sequential list: width sums with gaps, height is tallest. */
function measureChain(stages: readonly StageNode[]): Box {
  let width = 0
  let height = 0
  for (const stage of stages) {
    const inner = measure(stage)
    width += inner.width
    height = Math.max(height, inner.height)
  }
  return { width: width + H_GAP * Math.max(0, stages.length - 1), height }
}

/**
 * Emit one edge per source/target pair, classifying fan-out (>1 target),
 * fan-in (>1 source), or plain chain by shape alone.
 */
function connect(ctx: WalkContext, sources: readonly string[], targets: readonly string[]): void {
  for (const source of sources) {
    for (const target of targets) {
      ctx.edges.push({
        id: `${source}->${target}`,
        source,
        target,
        kind: sources.length > 1 ? 'fan-in' : targets.length > 1 ? 'fan-out' : 'chain',
      })
    }
  }
}

/** Ids of the first rendered card(s) flow touches when entering a subtree. */
function headIds(stage: StageNode): string[] {
  const branches = stage.parallelBranches
  if (branches && branches.length > 0) {
    return branches.flatMap((branch) => headIds(branch))
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
): string[] {
  const box = measure(stage)
  // Center this subtree's band within whatever the parent allocated.
  const ownTop = top + (bandH - box.height) / 2

  const branches = stage.parallelBranches
  if (branches && branches.length > 0) {
    // Container instead of a card: lanes start one shared column in, stacked
    // under the header bar. Incoming edges fan out straight to branch heads,
    // skipping the cardless parent exactly like mockup §7 draws it.
    ctx.containers.push({ id: stage.id, x, y: ownTop, ...box })
    connect(ctx, entries, branches.flatMap((branch) => headIds(branch)))

    const laneX = x + CONTAINER_PAD_X
    let laneTop = ownTop + CONTAINER_HEADER + CONTAINER_PAD_Y
    const exits: string[] = []
    for (const branch of branches) {
      const laneHeight = measure(branch).height
      exits.push(...placeChain([branch], laneX, laneTop, laneHeight, [], ctx))
      laneTop += laneHeight + V_GAP
    }
    return exits
  }

  // Card y: centered inside the subtree's own band, which centers parents
  // against taller children automatically.
  const cardY = ownTop + (box.height - NODE_H) / 2

  if (stage.sequentialChildren && stage.sequentialChildren.length > 0) {
    ctx.nodes.push({ ...stage, x, y: cardY })
    connect(ctx, entries, [stage.id])
    return placeChain(
      stage.sequentialChildren,
      x + NODE_W + H_GAP,
      ownTop,
      box.height,
      [stage.id],
      ctx,
    )
  }

  ctx.nodes.push({ ...stage, x, y: cardY })
  connect(ctx, entries, [stage.id])
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
): string[] {
  let cursorX = x
  let sources: readonly string[] = entries
  for (const stage of stages) {
    sources = placeStage(stage, cursorX, top, bandH, sources, ctx)
    cursorX += measure(stage).width + H_GAP
  }
  return [...sources]
}

/**
 * Compute positions for every stage of a parsed model plus the edges between
 * cards. Pure: identical input yields byte-identical output. Never throws on
 * any PipelineModel shape, including empty ones.
 */
export function computeLayout(model: PipelineModel): LayoutResult {
  const ctx: WalkContext = { nodes: [], containers: [], edges: [] }

  if (model.rootStages.length === 0) {
    return { nodes: [], edges: [], containers: [], width: 0, height: 0 }
  }

  const whole = measureChain(model.rootStages)
  placeChain(model.rootStages, 0, 0, whole.height, [], ctx)

  return { nodes: ctx.nodes, edges: ctx.edges, containers: ctx.containers, ...whole }
}
