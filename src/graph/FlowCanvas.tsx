// ---------------------------------------------------------------------------
// graph/FlowCanvas.tsx - React Flow wrapper (plan §9, mockups §3/§8).
//
// Owns every canvas behavior M3 promises:
//   - fitView on load (every fresh graph mounts fitted; see `revision` below)
//   - Controls bottom-left (zoom in / out / fit view), MiniMap bottom-right
//     that is pannable and zoomable and tracks the main camera
//   - dotted Background on a 22px grid behind everything
//   - click-to-select cards; clicking empty canvas deselects
//
// The component is deliberately stateless: App re-parses into a new layout
// and bumps an integer `revision`; keying <ReactFlow> on it remounts the
// flow with fresh defaultNodes/defaultEdges. That gives "revision bump
// clears stale selection" (mockup §17) for free and keeps this file free of
// change-handler bookkeeping - the graph is read-only by design.
// ---------------------------------------------------------------------------

import '@xyflow/react/dist/style.css'

import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow } from '@xyflow/react'
import { useMemo } from 'react'
import type { Node, NodeProps } from '@xyflow/react'

import type { LayoutResult } from '../layout/computeLayout'
import type { PipelineModel } from '../model/types'
import { CATEGORY_COLORS } from './categories'
import type { ParallelContainerNode, StageCardData } from './toFlow'
import { buildFlowGraph } from './toFlow'
import { StageNodeCard } from './StageNodeCard'

/** Node renderers keyed by the `type` field assigned in toFlow. */
const NODE_TYPES = {
  stage: StageNodeCard,
  parallelContainer: ParallelContainerNodeView,
}

interface FlowCanvasProps {
  model: PipelineModel
  layout: LayoutResult
  /** Incremented per fresh parse; remounts the flow so state never goes stale. */
  revision: number
  onSelect: (stageId: string | null) => void
}

/**
 * Container header node standing in for a parallel parent stage
 * (mockups §7/§8): double-ring surface, "PARALLEL" label bar carrying the
 * PAR ×n badge plus failFast when captured.
 */
function ParallelContainerNodeView({ data }: NodeProps<ParallelContainerNode>) {
  return (
    <div className="parallel-container" title={data.label}>
      <header className="parallel-container-header">
        <span className="parallel-container-label">Parallel</span>
        <span className="parallel-container-chip">PAR ×{data.branchCount}</span>
        {data.failFast && <span className="parallel-container-chip">failFast</span>}
      </header>
    </div>
  )
}

/**
 * The flow canvas for one parsed pipeline. Purely derived from props;
 * all interaction state (viewport, selection highlight) lives inside the
 * keyed ReactFlow instance and resets exactly when a new graph arrives.
 */
export function FlowCanvas({ model, layout, revision, onSelect }: FlowCanvasProps) {
  // Fresh RF objects per (model, layout); memo keeps StrictMode double
  // renders and unrelated parent updates from rebuilding the graph data.
  const graph = useMemo(() => buildFlowGraph(model, layout), [model, layout])

  return (
    <div className="flow-canvas-host">
      <ReactFlow
        key={revision}
        defaultNodes={graph.nodes}
        defaultEdges={graph.edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
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
        colorMode="dark"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.6}
          color="rgba(100, 116, 139, 0.4)"
        />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeColor={(node) => minimapColor(node)}
          maskColor="rgba(15, 23, 42, 0.75)"
          className="flow-minimap"
        />
      </ReactFlow>
    </div>
  )
}

/**
 * Minimap swatches: category stripe colors for stage cards, quiet slate for
 * parallel containers, so the overview echoes the main canvas at a glance.
 */
function minimapColor(node: Node): string {
  if (node.type === 'stage') {
    return CATEGORY_COLORS[(node.data as StageCardData).category]
  }
  return 'rgba(148, 163, 184, 0.5)'
}
