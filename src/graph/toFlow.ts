// ---------------------------------------------------------------------------
// graph/toFlow.ts - layout output -> React Flow node/edge objects.
//
// Pure data mapping, no rendering: identical input yields byte-identical
// output, which keeps the mapping unit-testable and lets FlowCanvas memoize
// it without fear (plan §9: "node/edge objects are memoized").
//
// The interesting part is structural containers. Layout reports parallel,
// matrix, and sequential groups as absolute-coordinate GroupBoxes. React Flow
// subflows want parent nodes with children positioned *relative* to their immediate parent
// (`parentId`). This module rebuilds the nesting by geometric containment -
// containers never partially overlap by construction, so "strictly inside"
// is unambiguous - then rewrites every coordinate relative to the nearest
// ancestor box. Cards outside any container keep absolute coordinates.
//
// Parent stage data travels with each layout container. This also supports
// synthesized matrix lanes whose stable ids do not exist in PipelineModel.
// ---------------------------------------------------------------------------

import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'

import type { GroupKind, LayoutOptions, LayoutResult, PositionedStage } from '../layout/computeLayout'
import { NODE_H, NODE_W } from '../layout/computeLayout'
import { axesLabel } from '../layout/matrixCombos'
import type { PipelineModel, StageNode } from '../model/types'
import { CANVAS_PALETTES } from '../theme'
import type { Theme } from '../theme'
import { categorize } from './categories'
import { stageBadgeRow, stageMetadataBadges } from './stageBadges'

/** Data payload of a `stage` card node; StageNodeCard renders only this. */
export interface StageCardData extends Record<string, unknown> {
  stage: PositionedStage
  category: ReturnType<typeof categorize>
  /** Compact structural card which can become a sequential group. */
  expandable: boolean
  /** One-based order when directly hosted by a sequential container. */
  sequenceIndex?: number
  /** Injected by FlowCanvas while keeping this converter pure. */
  onToggleSequential?: (stageId: string) => void
  /** Injected source-navigation action for the selected-node toolbar. */
  onJumpToSource?: (line: number) => void
}

/**
 * Data payload of a group container node (mockups §7/§8/§10). Parallel and
 * expanded-matrix groups share the double-line surface; `kind` picks the
 * header copy and chips (PARALLEL + PAR ×n vs MATRIX + axis list).
 */
export interface GroupContainerData extends Record<string, unknown> {
  /** Parent stage display name (kept for a11y/title). */
  label: string
  kind: GroupKind
  /** Complete owner metadata, including synthesized matrix-lane stages. */
  stage: StageNode
  /** Generic item count for future group kinds. */
  itemCount: number
  /** Compatibility name used by existing parallel/matrix presentation. */
  branchCount: number
  failFast: boolean
  /** Axis names joined for the MATRIX header chip, e.g. `OS × BROWSER`. */
  matrixAxes?: string
  /** Metadata declared on the structural parent stage. */
  metadataBadges: string[]
  /** One-based order when this group is directly nested in a sequential group. */
  sequenceIndex?: number
  /** Sequential groups are collapsible; other group kinds currently are not. */
  collapsible: boolean
  /** Injected by FlowCanvas while keeping this converter pure. */
  onToggleSequential?: (stageId: string) => void
  /** Injected source-navigation action for the selected-node toolbar. */
  onJumpToSource?: (line: number) => void
}

/**
 * Data payload of a ghost card (mockups §11): one unparsed source region.
 * Dimmed, non-interactive; `range` feeds the "lines X-Y" subline.
 */
export interface GhostCardData extends Record<string, unknown> {
  label: string
  startLine: number
  endLine: number
}

export type StageCardNode = Node<StageCardData, 'stage'>
export type GroupContainerNode = Node<GroupContainerData, 'groupContainer'>
export type GhostCardNode = Node<GhostCardData, 'ghost'>
export type FlowNode = StageCardNode | GroupContainerNode | GhostCardNode
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

/** Options steering conversion variants. */
export interface FlowOptions extends LayoutOptions {
  /** Color scheme for edge strokes/arrows; must match the active theme. */
  theme?: Theme
}

/**
 * Shared edge styling: smoothstep with an arrowhead in the theme's muted
 * slate. Edges into ghost cards (unparsed material, mockups §11) take a
 * dashed stroke so the break in the graph reads at a glance.
 */
function toFlowEdge(edge: LayoutResult['edges'][number], theme: Theme, ghosts: ReadonlySet<string>): FlowEdge {
  const palette = CANVAS_PALETTES[theme]
  const dashed = ghosts.has(edge.target)
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.orientation === 'vertical'
      ? {
          sourceHandle: 'source-bottom',
          targetHandle: 'target-top',
          className: 'sequential-edge',
        }
      : {
          sourceHandle: 'source-right',
          targetHandle: 'target-left',
        }),
    type: 'smoothstep',
    animated: false,
    selectable: false,
    focusable: false,
    style: {
      stroke: palette.edgeStroke,
      strokeWidth: 1.5,
      ...(dashed ? { strokeDasharray: '5 4' } : {}),
    },
    markerEnd: { type: MarkerType.ArrowClosed, color: palette.edgeArrow },
  }
}

/**
 * Convert a parsed model plus its computed layout into React Flow objects.
 * Deterministic and side-effect free; empty layouts map to empty arrays.
 * `options.expandMatrix` must match the flag the layout ran with so
 * container headers report the right lane counts for expanded matrices;
 * `options.theme` picks the edge palette.
 */
export function buildFlowGraph(
  model: PipelineModel,
  layout: LayoutResult,
  options: FlowOptions = {},
): FlowGraph {
  const theme = options.theme === 'light' ? 'light' : 'dark'
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

  // Resolve the nearest container for every card before emitting nodes. This
  // also lets sequential groups number only their direct children rather
  // than every deeply-contained descendant.
  const hostByStageId = new Map<string, string>()
  for (const stage of layout.nodes) {
    let hostId: string | null = null
    const cardRect = { x: stage.x, y: stage.y, width: NODE_W, height: NODE_H }
    for (const box of boxes) {
      if (contains(box, cardRect)) hostId = box.id
    }
    if (hostId) hostByStageId.set(stage.id, hostId)
  }

  const sequenceIndexById = new Map<string, number>()
  for (const box of boxes) {
    if (box.kind !== 'sequential') continue
    const directChildren: { id: string; y: number }[] = []
    for (const childBox of boxes) {
      if (parentOf.get(childBox.id) === box.id) directChildren.push({ id: childBox.id, y: childBox.y })
    }
    for (const stage of layout.nodes) {
      if (hostByStageId.get(stage.id) === box.id) directChildren.push({ id: stage.id, y: stage.y })
    }
    directChildren
      .sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))
      .forEach((child, index) => sequenceIndexById.set(child.id, index + 1))
  }

  // ---- Container nodes first ----------------------------------------------
  // React Flow subflows require every parent node to appear in the array
  // BEFORE any node carrying its id as `parentId`, so containers are emitted
  // ahead of the cards they host. The area-sorted order keeps nested
  // containers ahead of the boxes nested inside them, too.
  const nodes: FlowNode[] = []
  for (const box of boxes) {
    const parentStage = stagesById.get(box.id) ?? box.stage
    const branchCount = box.itemCount
    const grandparentId = parentOf.get(box.id) ?? null
    const metadataBadges = parentStage ? stageMetadataBadges(parentStage) : []
    const metadataAria = metadataBadges.length > 0 ? `, ${metadataBadges.join(', ')}` : ''
    // Screen-reader copy per the a11y audit (#21): name the group shape,
    // its owner, size, and failFast instead of letting React Flow fall
    // back to opaque node ids.
    const ariaLabel = box.kind === 'matrix'
      ? `Matrix group ${parentStage?.name ?? box.id}, axes ${parentStage ? axesLabel(parentStage) : ''}, ${branchCount} ${branchCount === 1 ? 'combination' : 'combinations'}${
          parentStage?.failFast ? ', fail fast' : ''
        }${metadataAria}`
      : box.kind === 'sequential'
        ? `Sequential group ${parentStage?.name ?? box.id}, ${branchCount} nested ${branchCount === 1 ? 'stage' : 'stages'}, expanded${metadataAria}`
        : `Parallel group ${parentStage?.name ?? box.id}, ${branchCount} ${branchCount === 1 ? 'branch' : 'branches'}${
            parentStage?.failFast ? ', fail fast' : ''
          }${metadataAria}`
    nodes.push({
      id: box.id,
      type: 'groupContainer',
      position: relPos.get(box.id) as { x: number; y: number },
      style: { width: box.width, height: box.height },
      ariaLabel,
      data: {
        label: parentStage?.name ?? box.id,
        kind: box.kind,
        stage: parentStage,
        itemCount: box.itemCount,
        branchCount,
        // failFast belongs to the stage whatever shape it renders as -
        // expanded matrices used to swallow it here.
        failFast: parentStage?.failFast ?? false,
        metadataBadges,
        collapsible: box.kind === 'sequential',
        ...(sequenceIndexById.has(box.id)
          ? { sequenceIndex: sequenceIndexById.get(box.id) }
          : {}),
        ...(box.kind === 'matrix' && parentStage !== undefined
          ? { matrixAxes: axesLabel(parentStage) }
          : {}),
      },
      // Nested groups chain onto their outer subflow exactly like cards do.
      ...(grandparentId ? { parentId: grandparentId } : {}),
    })
  }

  // ---- Cards: attach to the innermost containing container, if any --------
  // Iterating the area-sorted list makes the *last* hit the smallest (nearest)
  // enclosing box, which is the immediate subflow parent React Flow expects.
  const ghostIds = new Set<string>()
  for (const stage of layout.nodes) {
    const hostId = hostByStageId.get(stage.id) ?? null

    // Relative to the host's absolute origin when nested, else as laid out.
    let x = stage.x
    let y = stage.y
    if (hostId) {
      const host = absBox.get(hostId) as Rect
      x -= host.x
      y -= host.y
    }

    // Ghost leaves (unparsed regions): dimmed, inert, never selectable so
    // they can neither open the details panel nor hold a selection ring.
    if (stage.ghost) {
      ghostIds.add(stage.id)
      const startLine = stage.unparsedRange?.startLine ?? stage.line
      const endLine = stage.unparsedRange?.endLine ?? stage.line
      nodes.push({
        id: stage.id,
        type: 'ghost',
        position: { x, y },
        style: { width: NODE_W, height: NODE_H },
        ariaLabel: `Unparsed region ${stage.name}, lines ${startLine}-${endLine}`,
        draggable: false,
        selectable: false,
        focusable: false,
        data: {
          label: stage.name,
          startLine,
          endLine,
        },
        ...(hostId ? { parentId: hostId } : {}),
      })
      continue
    }

    nodes.push({
      id: stage.id,
      type: 'stage',
      position: { x, y },
      style: { width: NODE_W, height: NODE_H },
      ariaLabel: `${stage.name} stage, ${stageBadgeRow(stage)}, line ${stage.line}${stage.sequentialChildren?.length ? ', collapsed, expandable' : ''}`,
      data: {
        stage,
        category: categorize(stage.name),
        expandable: Boolean(stage.sequentialChildren?.length),
        ...(sequenceIndexById.has(stage.id)
          ? { sequenceIndex: sequenceIndexById.get(stage.id) }
          : {}),
      },
      ...(hostId ? { parentId: hostId } : {}),
    })
  }

  return { nodes, edges: layout.edges.map((edge) => toFlowEdge(edge, theme, ghostIds)) }
}
