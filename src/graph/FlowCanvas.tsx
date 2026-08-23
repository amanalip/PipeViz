// ---------------------------------------------------------------------------
// graph/FlowCanvas.tsx - React Flow wrapper (plan §9, mockups §3/§8).
//
// Owns every canvas behavior M3 promises:
//   - fitted view when a graph first appears (empty -> populated)
//   - Controls bottom-left (zoom in / out / fit view), MiniMap bottom-right
//     that is pannable and zoomable and tracks the main camera
//   - dotted Background on a 22px grid behind everything
//   - click-to-select cards; clicking empty canvas deselects
//
// The flow instance mounts once and is updated IN PLACE: GraphSync pushes
// fresh nodes/edges into it whenever the parsed layout changes, so the
// camera (zoom/pan) survives settled edits and theme flips instead of
// resetting through a remount. Fresh graph data carries no selection flags,
// which still gives "new parse clears stale selection" (mockup §17); the
// graph itself stays read-only by design.
// ---------------------------------------------------------------------------

import '@xyflow/react/dist/style.css'

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react'
import { useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import type { Node, NodeProps } from '@xyflow/react'

import { exportCanvasPng } from './exportPng'

import type { LayoutResult, PositionedStage } from '../layout/computeLayout'
import type { PipelineModel } from '../model/types'
import { CANVAS_PALETTES } from '../theme'
import type { CanvasPalette, Theme } from '../theme'
import { CATEGORY_COLORS } from './categories'
import type { FlowEdge, FlowNode, GhostCardNode, GroupContainerNode, StageCardData } from './toFlow'
import { buildFlowGraph } from './toFlow'
import { StageNodeCard } from './StageNodeCard'

/** Node renderers keyed by the `type` field assigned in toFlow. */
const NODE_TYPES = {
  stage: StageNodeCard,
  groupContainer: GroupContainerNodeView,
  ghost: GhostCardView,
}

/**
 * Imperative surface App can poke without owning React Flow internals.
 * `clearSelection` backs panel close via ✕/Escape (mockups §9): the ring
 * and the panel must drop together even though selection lives in the flow.
 * `exportPng` renders the current graph through graph/exportPng.
 */
export interface FlowApi {
  clearSelection(): void
  fitGraph(): void
  exportPng(options: { backgroundColor: string }): Promise<void>
}

/** Headless child inside <ReactFlow> that exposes the instance upward. */
function SelectionBridge({
  apiRef,
  hostRef,
}: {
  apiRef?: RefObject<FlowApi | null>
  hostRef: RefObject<HTMLDivElement | null>
}) {
  const { setNodes, getNodes, fitView } = useReactFlow<FlowNode, FlowEdge>()
  useImperativeHandle(
    apiRef,
    () => ({
      clearSelection() {
        setNodes((nodes) => nodes.map((node) => (node.selected ? { ...node, selected: false } : node)))
      },
      fitGraph() {
        void fitView({ padding: 0.2, maxZoom: 1 })
      },
      async exportPng(options) {
        // Only the viewport renders: cards and edges, never controls/minimap.
        const viewport = hostRef.current?.querySelector('.react-flow__viewport')
        if (!(viewport instanceof HTMLElement)) {
          throw new Error('Canvas viewport not mounted yet')
        }
        await exportCanvasPng({ ...options, nodes: getNodes(), viewport })
      },
    }),
    [setNodes, getNodes, fitView, hostRef],
  )
  return null
}

/**
 * Headless child inside <ReactFlow> that pushes graph updates into the live
 * instance. Remounting the flow on every fresh parse reset the camera, so
 * nodes/edges now flow through setNodes/setEdges and the viewport stays
 * where the user left it. First population and explicit whole-graph changes
 * request a fresh fit through fitKey.
 */
function GraphSync({
  nodes,
  edges,
  fitKey,
}: {
  nodes: FlowNode[]
  edges: FlowEdge[]
  fitKey: number
}) {
  const { setNodes, setEdges, fitView } = useReactFlow<FlowNode, FlowEdge>()
  // Starts true: a freshly mounted canvas counts as "was empty", so both
  // mount-already-populated and empty -> populated transitions fit once.
  const wasEmpty = useRef(true)
  const previousFitKey = useRef(fitKey)
  useEffect(() => setNodes(nodes), [nodes, setNodes])
  useEffect(() => setEdges(edges), [edges, setEdges])

  useEffect(() => {
    const fitRequested = previousFitKey.current !== fitKey
    previousFitKey.current = fitKey
    if (nodes.length === 0) {
      wasEmpty.current = true
      return
    }
    if (!wasEmpty.current && !fitRequested) return
    wasEmpty.current = false
    // Let React Flow commit and measure the freshly-set nodes before
    // framing them.
    const frame = window.requestAnimationFrame(() => fitView({ padding: 0.2, maxZoom: 1 }))
    return () => window.cancelAnimationFrame(frame)
  }, [nodes, fitKey, fitView])
  return null
}

interface FlowCanvasProps {
  model: PipelineModel
  layout: LayoutResult
  onSelect: (stageId: string | null) => void
  /** Receives the FlowApi once the flow mounts. */
  apiRef?: RefObject<FlowApi | null>
  /** Double-clicking a stage card hands its source line to App (§17). */
  onStageDoubleClick?: (stage: PositionedStage) => void
  /** Matrix expansion toggle; must match the flag computeLayout ran with. */
  expandMatrix?: boolean
  /** Active color scheme; picks edge/dot/minimap palettes + RF chrome. */
  theme?: Theme
  /** Incremented when a whole-source or shape replacement should refit. */
  fitKey?: number
}

/**
 * Group container node standing in for a cardless parent stage
 * (mockups §7/§8/§10): double-ring surface with a header bar whose copy
 * depends on `kind` (PARALLEL + PAR ×n + failFast, or MATRIX + axis list).
 */
function GroupContainerNodeView({ data }: NodeProps<GroupContainerNode>) {
  return (
    <div className={data.kind === 'matrix' ? 'parallel-container matrix' : 'parallel-container'} title={data.label}>
      <header className="parallel-container-header">
        <span className="parallel-container-label">{data.kind === 'matrix' ? 'Matrix' : 'Parallel'}</span>
        {data.kind === 'matrix' ? (
          <>
            {data.matrixAxes && <span className="parallel-container-chip">{data.matrixAxes}</span>}
            <span className="parallel-container-chip">×{data.branchCount}</span>
            {data.failFast && <span className="parallel-container-chip">failFast</span>}
            {data.metadataBadges.map((badge) => <span key={badge} className="parallel-container-chip">{badge}</span>)}
          </>
        ) : (
          <>
            <span className="parallel-container-chip">PAR ×{data.branchCount}</span>
            {data.failFast && <span className="parallel-container-chip">failFast</span>}
            {data.metadataBadges.map((badge) => <span key={badge} className="parallel-container-chip">{badge}</span>)}
          </>
        )}
      </header>
    </div>
  )
}

/**
 * Ghost card for unparsed source regions (mockups §11): dimmed ░ surface,
 * dashed incoming edges drawn by toFlow. Purely presentational - the node
 * is non-selectable, so no selection ring or details panel ever applies.
 */
function GhostCardView({ data }: NodeProps<GhostCardNode>) {
  return (
    <div className="ghost-card" title={`Source lines ${data.startLine}-${data.endLine} did not parse into a stage`}>
      <Handle type="target" position={Position.Left} className="card-handle" isConnectable={false} />
      <span className="ghost-card-title">░ {data.label} ░</span>
      <span className="ghost-card-subline">
        unparsed · lines {data.startLine}-{data.endLine}
      </span>
      <Handle type="source" position={Position.Right} className="card-handle" isConnectable={false} />
    </div>
  )
}

/**
 * The flow canvas for one parsed pipeline. Graph data is derived from props
 * and synced into a single long-lived React Flow instance; interaction state
 * (viewport) persists across updates, while fresh graph objects naturally
 * clear any stale selection.
 */
export function FlowCanvas({
  model,
  layout,
  onSelect,
  apiRef,
  onStageDoubleClick,
  expandMatrix = false,
  theme = 'dark',
  fitKey = 0,
}: FlowCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  // Fresh RF objects per (model, layout); memo keeps StrictMode double
  // renders and unrelated parent updates from rebuilding the graph data.
  // Node identities and data do not depend on the palette. Keeping this
  // array stable across theme changes preserves React Flow selection.
  const graph = useMemo(
    () => buildFlowGraph(model, layout, { expandMatrix }),
    [model, layout, expandMatrix],
  )
  const themedEdges = useMemo(
    () => theme === 'dark'
      ? graph.edges
      : buildFlowGraph(model, layout, { expandMatrix, theme }).edges,
    [graph.edges, model, layout, expandMatrix, theme],
  )
  const palette = CANVAS_PALETTES[theme]

  return (
    <div className="flow-canvas-host" ref={hostRef}>
      <ReactFlow
        // Initial graph data rides the uncontrolled defaults; every later
        // change arrives through GraphSync's setNodes/setEdges below.
        defaultNodes={graph.nodes}
        defaultEdges={themedEdges}
        nodeTypes={NODE_TYPES}
        minZoom={0.15}
        maxZoom={2}
        // Read-only visualization: no dragging, wiring, box-select, or
        // keyboard deletion - pan/zoom/click only (mockup §17).
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
        selectionKeyCode={null}
        onSelectionChange={({ nodes }) => onSelect(nodes[0]?.id ?? null)}
        onNodeDoubleClick={(_, node) => {
          if (node.type === 'stage' && onStageDoubleClick) {
            onStageDoubleClick((node.data as StageCardData).stage)
          }
        }}
        colorMode={theme}
      >
        <SelectionBridge apiRef={apiRef} hostRef={hostRef} />
        <GraphSync nodes={graph.nodes} edges={themedEdges} fitKey={fitKey} />
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.6}
          color={palette.dots}
        />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeColor={(node) => minimapColor(node, palette)}
          maskColor={palette.mask}
          className="flow-minimap"
        />
      </ReactFlow>
    </div>
  )
}

/**
 * Minimap swatches: category stripe colors for stage cards, quiet slate for
 * parallel containers, fainter slate for ghosts, so the overview echoes the
 * main canvas at a glance.
 */
function minimapColor(node: Node, palette: CanvasPalette): string {
  if (node.type === 'stage') {
    return CATEGORY_COLORS[(node.data as StageCardData).category]
  }
  if (node.type === 'ghost') return palette.ghostNode
  return 'rgba(148, 163, 184, 0.5)'
}
