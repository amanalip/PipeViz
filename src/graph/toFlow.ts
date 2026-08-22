// ---------------------------------------------------------------------------
// graph/toFlow.ts - layout output -> React Flow node/edge objects.
//
// Pure data mapping, no rendering: identical input yields byte-identical
// output, which keeps the mapping unit-testable and lets FlowCanvas memoize
// it without fear (plan §9: "node/edge objects are memoized").
//
// The interesting part is parallel containers. Layout reports them as
// absolute-coordinate ParallelBoxes while React Flow subflows want parent
// nodes with children positioned *relative* to their immediate parent
// (`parentId`). This module rebuilds the nesting by geometric containment -
// containers never partially overlap by construction, so "strictly inside"
// is unambiguous - then rewrites every coordinate relative to the nearest
// ancestor box. Cards outside any container keep absolute coordinates.
//
// Parent stage data (name, failFast, branch count) comes straight from the
// PipelineModel via the container id, which equals the parent stage id, so
// the tested layout module stays untouched.
// ---------------------------------------------------------------------------

import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'

import type { LayoutResult, PositionedStage } from '../layout/computeLayout'
import { NODE_H, NODE_W } from '../layout/computeLayout'
import type { PipelineModel, StageNode } from '../model/types'
import { categorize } from './categories'

/** Data payload of a `stage` card node; StageNodeCard renders only this. */
export interface StageCardData extends Record<string, unknown> {
  stage: PositionedStage
  category: ReturnType<typeof categorize>
}

/** Data payload of a `parallelContainer` node (mockups §7/§8). */
export interface ParallelContainerData extends Record<string, unknown> {
  /** Parent stage display name (kept for a11y/title; header shows PARALLEL). */
  label: string
  branchCount: number
  failFast: boolean
}

export type StageCardNode = Node<StageCardData, 'stage'>
export type ParallelContainerNode = Node<ParallelContainerData, 'parallelContainer'>
export type FlowNode = StageCardNode | ParallelContainerNode
export type FlowEdge = Edge

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Strict containment: every corner of `inner` lies within `outer`. */
function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

/** Every stage in the model keyed by id, containers' parents included. */
function indexStages(model: PipelineModel): Map<string, StageNode> {
  const byId = new Map<string, StageNode>()
  const visit = (stages: readonly StageNode[]): void => {
    for (const stage of stages) {
      byId.set(stage.id, stage)
      if (stage.parallelBranches) visit(stage.parallelBranches)
      if (stage.sequentialChildren) visit(stage.sequentialChildren)
    }
  }
  visit(model.rootStages)
  return byId
}

/**
 * Shared edge styling: smoothstep with an arrowhead, muted slate stroke that
 * reads on the dark canvas. Dashed "unparsed" edges arrive with M4 ghosts.
 */
function toFlowEdge(edge: LayoutResult['edges'][number]): FlowEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    animated: false,
    style: { stroke: 'rgba(148, 163, 184, 0.45)', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(148, 163, 184, 0.65)' },
  }
}

/**
 * Convert a parsed model plus its computed layout into React Flow objects.
 * Deterministic and side-effect free; empty layouts map to empty arrays.
 */
export function buildFlowGraph(model: PipelineModel, layout: LayoutResult): FlowGraph {
  if (layout.nodes.length === 0 && layout.containers.length === 0) {
    return { nodes: [], edges: [] }
  }

  const stagesById = indexStages(model)

  // ---- Containers: sort big -> small so parents precede descendants -------
  // Parents always have strictly larger areas than their children, making
  // this ordering a valid top-down pass for relative-coordinate rewriting.
  const boxes = [...layout.containers].sort(
    (a, b) => b.width * b.height - a.width * a.height || a.id.localeCompare(b.id),
  )

  // Nearest bigger containing box per box (or null at top level). The slice
  // keeps the scan to strictly-earlier (larger-or-equal) entries, so the last
  // hit is always the smallest container around `box`.
  const parentOf = new Map<string, string | null>()
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]
    if (!box) continue
    let parent: string | null = null
    for (const candidate of boxes.slice(0, i)) {
      if (contains(candidate, box)) parent = candidate.id
    }
    parentOf.set(box.id, parent)
  }

  // Absolute boxes stay reachable: every coordinate rewrite below offsets by
  // the parent's *absolute* origin, which stays valid at any nesting depth.
  const absBox = new Map(layout.containers.map((box) => [box.id, box as Rect]))

  // Rewrite container coordinates relative to their immediate parents,
  // walking outward-in so each parent's own relative position is settled
  // before React Flow consumes it.
  const relPos = new Map<string, { x: number; y: number }>()
  for (const box of boxes) {
    const parentId = parentOf.get(box.id)
    const parentAbs = parentId ? absBox.get(parentId) : undefined
    relPos.set(box.id, {
      x: parentAbs ? box.x - parentAbs.x : box.x,
      y: parentAbs ? box.y - parentAbs.y : box.y,
    })
  }

  // ---- Cards: attach to the innermost containing container, if any --------
  // Iterating the area-sorted list makes the *last* hit the smallest (nearest)
  // enclosing box, which is the immediate subflow parent React Flow expects.
  const nodes: FlowNode[] = []
  for (const stage of layout.nodes) {
    let hostId: string | null = null
    const cardRect = { x: stage.x, y: stage.y, width: NODE_W, height: NODE_H }
    for (const box of boxes) {
      if (contains(box, cardRect)) hostId = box.id
    }

    // Relative to the host's absolute origin when nested, else as laid out.
    let x = stage.x
    let y = stage.y
    if (hostId) {
      const host = absBox.get(hostId) as Rect
      x -= host.x
      y -= host.y
    }

    nodes.push({
      id: stage.id,
      type: 'stage',
      position: { x, y },
      style: { width: NODE_W, height: NODE_H },
      data: { stage, category: categorize(stage.name) },
      ...(hostId ? { parentId: hostId } : {}),
    })
  }

  // ---- Container nodes themselves -----------------------------------------
  for (const box of boxes) {
    const parentStage = stagesById.get(box.id)
    const branchCount = parentStage?.parallelBranches?.length ?? 0
    const grandparentId = parentOf.get(box.id) ?? null
    nodes.push({
      id: box.id,
      type: 'parallelContainer',
      position: relPos.get(box.id) as { x: number; y: number },
      style: { width: box.width, height: box.height },
      data: {
        label: parentStage?.name ?? box.id,
        branchCount,
        failFast: parentStage?.failFast ?? false,
      },
      // Nested groups chain onto their outer subflow exactly like cards do.
      ...(grandparentId ? { parentId: grandparentId } : {}),
    })
  }

  return { nodes, edges: layout.edges.map(toFlowEdge) }
}
