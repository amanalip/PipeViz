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
// resetting through a remount. Selection is controlled by App so compatible
// edits, theme changes, and compact/expanded shape changes retain context.
// The graph itself stays read-only by design.
// ---------------------------------------------------------------------------

import '@xyflow/react/dist/style.css'

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  NodeToolbar,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react'
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Node, NodeProps } from '@xyflow/react'

import { exportCanvasPng } from './exportPng'

import type { LayoutResult } from '../layout/computeLayout'
import type { PipelineModel, StageNode } from '../model/types'
import { CANVAS_PALETTES } from '../theme'
import type { CanvasPalette, Theme } from '../theme'
import { CATEGORY_COLORS } from './categories'
import { stageBadgeRow } from './stageBadges'
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
  /** Reveal one changed structural group only when it falls outside view. */
  revealGroup(groupId: string): void
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
      revealGroup(groupId) {
        // GraphSync and React Flow both need one frame to commit new group
        // geometry. The second frame measures the final DOM rectangle.
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          const host = hostRef.current
          const target = host?.querySelector(`.react-flow__node[data-id="${CSS.escape(groupId)}"]`)
          if (!(host instanceof HTMLElement) || !(target instanceof HTMLElement)) return
          const viewport = host.getBoundingClientRect()
          const bounds = target.getBoundingClientRect()
          const margin = 24
          const visible =
            bounds.left >= viewport.left + margin &&
            bounds.right <= viewport.right - margin &&
            bounds.top >= viewport.top + margin &&
            bounds.bottom <= viewport.bottom - margin
          if (visible) return

          const allNodes = getNodes()
          const inGroup = (node: FlowNode): boolean => {
            if (node.id === groupId) return true
            let parentId = node.parentId
            while (parentId) {
              if (parentId === groupId) return true
              parentId = allNodes.find((candidate) => candidate.id === parentId)?.parentId
            }
            return false
          }
          void fitView({
            nodes: allNodes.filter(inGroup),
            padding: 0.22,
            maxZoom: 1,
            duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260,
          })
        }))
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
  onStageDoubleClick?: (stage: StageNode) => void
  /** Matrix expansion toggle; must match the flag computeLayout ran with. */
  expandMatrix?: boolean
  /** Controlled ids of expanded nested sequential groups. */
  expandedSequentialIds?: ReadonlySet<string>
  /** Expand/collapse request from a card, group header, or double-click. */
  onToggleSequential?: (stageId: string) => void
  /** Controlled selection keeps details stable across graph shape updates. */
  selectedId?: string | null
  /** Bulk structural controls exposed in the canvas-native tool panel. */
  onExpandAllSequential?: () => void
  onCollapseAllSequential?: () => void
  sequentialGroupCount?: number
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
function GroupContainerNodeView({ data, selected }: NodeProps<GroupContainerNode>) {
  const kindLabel = data.kind === 'matrix'
    ? 'Matrix'
    : data.kind === 'sequential'
      ? 'Sequential'
      : 'Parallel'
  return (
    <div
      className={`parallel-container ${data.kind}`}
      title={data.label}
      onClick={(event) => {
        if (event.detail !== 2) return
        event.stopPropagation()
        if (data.collapsible) data.onToggleSequential?.(data.stage.id)
      }}
    >
      <NodeToolbar isVisible={selected} position={Position.Top} className="node-quick-toolbar">
        {data.collapsible && (
          <button type="button" onClick={() => data.onToggleSequential?.(data.stage.id)}>
            Collapse group
          </button>
        )}
        <button type="button" onClick={() => data.onJumpToSource?.(data.stage.line)}>
          Source
        </button>
      </NodeToolbar>
      <header className="parallel-container-header">
        <div className="parallel-container-title-row">
          {data.sequenceIndex !== undefined && (
            <span className="sequence-order group-order" aria-hidden="true">{data.sequenceIndex}</span>
          )}
          <span className="parallel-container-label">{kindLabel}</span>
          <span className="parallel-container-name">{data.label}</span>
          {data.collapsible && (
            <button
              type="button"
              className="group-collapse-button nodrag nowheel"
              aria-label={`Collapse ${data.label} sequential group`}
              aria-expanded="true"
              title="Collapse nested sequential stages"
              onDoubleClick={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                data.onToggleSequential?.(data.stage.id)
              }}
            >
              <span aria-hidden="true">⌃</span>
            </button>
          )}
        </div>
        <div className="parallel-container-chip-row">
          {data.kind === 'matrix' && data.matrixAxes && <span className="parallel-container-chip">{data.matrixAxes}</span>}
          <span className="parallel-container-chip">
            {data.kind === 'parallel' ? `PAR ×${data.branchCount}` : data.kind === 'sequential' ? `SEQ ×${data.itemCount}` : `×${data.branchCount}`}
          </span>
          {data.failFast && <span className="parallel-container-chip">failFast</span>}
          {data.metadataBadges.map((badge) => <span key={badge} className="parallel-container-chip">{badge}</span>)}
        </div>
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
      <Handle id="target-left" type="target" position={Position.Left} className="card-handle" isConnectable={false} />
      <span className="ghost-card-title">░ {data.label} ░</span>
      <span className="ghost-card-subline">
        unparsed · lines {data.startLine}-{data.endLine}
      </span>
      <Handle id="source-right" type="source" position={Position.Right} className="card-handle" isConnectable={false} />
    </div>
  )
}

/**
 * The flow canvas for one parsed pipeline. Graph data is derived from props
 * and synced into a single long-lived React Flow instance; interaction state
 * (viewport and controlled selection) persists across compatible updates.
 */
export function FlowCanvas({
  model,
  layout,
  onSelect,
  apiRef,
  onStageDoubleClick,
  expandMatrix = false,
  expandedSequentialIds,
  onToggleSequential,
  selectedId = null,
  onExpandAllSequential,
  onCollapseAllSequential,
  sequentialGroupCount = 0,
  theme = 'dark',
  fitKey = 0,
}: FlowCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [focusPath, setFocusPath] = useState(false)
  // Fresh RF objects per (model, layout); memo keeps StrictMode double
  // renders and unrelated parent updates from rebuilding the graph data.
  // Node identities and data do not depend on the palette. Keeping this
  // array stable across theme changes preserves React Flow selection.
  const graph = useMemo(
    () => buildFlowGraph(model, layout, { expandMatrix, expandedSequentialIds }),
    [model, layout, expandMatrix, expandedSequentialIds],
  )
  const themedEdges = useMemo(
    () => theme === 'dark'
      ? graph.edges
      : buildFlowGraph(model, layout, { expandMatrix, expandedSequentialIds, theme }).edges,
    [graph.edges, model, layout, expandMatrix, expandedSequentialIds, theme],
  )
  const interactiveNodes = useMemo(
    () => graph.nodes.map((node) => {
      const selected = node.id === selectedId
      const searchable = node.type === 'stage'
        ? [
            node.data.stage.name,
            stageSearchText(node.data.stage),
          ].join(' ')
        : node.type === 'groupContainer'
          ? [
              node.data.label,
              node.data.kind,
              ...node.data.metadataBadges,
              stageSearchText(node.data.stage),
            ].join(' ')
          : node.data.label
      const matchesSearch = searchQuery.trim().length > 0 &&
        searchable.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase())
      if (node.type === 'stage') {
        return {
          ...node,
          selected,
          className: matchesSearch ? 'graph-search-match' : searchQuery ? 'graph-search-dim' : undefined,
          data: {
            ...node.data,
            onToggleSequential,
            onJumpToSource: () => onStageDoubleClick?.(node.data.stage),
          },
        }
      }
      if (node.type === 'groupContainer') {
        return {
          ...node,
          selected,
          className: matchesSearch ? 'graph-search-match' : searchQuery ? 'graph-search-dim' : undefined,
          data: {
            ...node.data,
            onToggleSequential,
            onJumpToSource: () => onStageDoubleClick?.(node.data.stage),
          },
        }
      }
      return {
        ...node,
        selected: false,
        className: matchesSearch ? 'graph-search-match' : searchQuery ? 'graph-search-dim' : undefined,
      }
    }),
    [graph.nodes, onStageDoubleClick, onToggleSequential, searchQuery, selectedId],
  )
  const matchedNodeIds = useMemo(
    () => interactiveNodes.filter((node) => node.className === 'graph-search-match').map((node) => node.id),
    [interactiveNodes],
  )
  const focusedIds = useMemo(
    () => focusPath && selectedId
      ? executionFocusIds(selectedId, interactiveNodes, graph.edges)
      : null,
    [focusPath, graph.edges, interactiveNodes, selectedId],
  )
  const focusedNodes = useMemo(
    () => interactiveNodes.map((node) => ({
      ...node,
      className: [
        node.className,
        focusedIds && !focusedIds.has(node.id) ? 'graph-path-dim' : '',
        focusedIds?.has(node.id) ? 'graph-path-active' : '',
      ].filter(Boolean).join(' ') || undefined,
    })),
    [focusedIds, interactiveNodes],
  )
  const focusedEdges = useMemo(
    () => themedEdges.map((edge) => ({
      ...edge,
      className: [
        edge.className,
        focusedIds && (!focusedIds.has(edge.source) || !focusedIds.has(edge.target))
          ? 'graph-path-dim'
          : '',
        focusedIds?.has(edge.source) && focusedIds.has(edge.target) ? 'graph-path-active' : '',
      ].filter(Boolean).join(' ') || undefined,
      animated: Boolean(focusedIds?.has(edge.source) && focusedIds.has(edge.target)),
    })),
    [focusedIds, themedEdges],
  )

  useEffect(() => {
    const onSearchShortcut = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLElement && target.isContentEditable)) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onSearchShortcut)
    return () => window.removeEventListener('keydown', onSearchShortcut)
  }, [])
  const palette = CANVAS_PALETTES[theme]

  return (
    <div className="flow-canvas-host" ref={hostRef}>
      <ReactFlow
        // Initial graph data rides the uncontrolled defaults; every later
        // change arrives through GraphSync's setNodes/setEdges below.
        defaultNodes={focusedNodes}
        defaultEdges={focusedEdges}
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
        onNodeClick={(_, node) => {
          if (node.selectable !== false) onSelect(node.id)
        }}
        onPaneClick={() => onSelect(null)}
        colorMode={theme}
        elevateEdgesOnSelect
        autoPanOnNodeFocus
      >
        <SelectionBridge apiRef={apiRef} hostRef={hostRef} />
        <GraphSync nodes={focusedNodes} edges={focusedEdges} fitKey={fitKey} />
        <Panel position="top-left" className="graph-tools" aria-label="Pipeline graph tools">
          <label className="graph-search">
            <span aria-hidden="true">⌕</span>
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              placeholder="Find stage..."
              aria-label="Find stage in graph"
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSearchQuery('')
                  event.currentTarget.blur()
                }
              }}
            />
            {searchQuery && (
              <span className="graph-search-count" aria-live="polite">
                {matchedNodeIds.length}
              </span>
            )}
            {!searchQuery && <kbd>/</kbd>}
          </label>
          <button
            type="button"
            className={focusPath ? 'graph-tool-button active' : 'graph-tool-button'}
            disabled={!selectedId}
            aria-pressed={focusPath}
            title="Highlight only the incoming and outgoing execution path for the selected stage"
            onClick={() => setFocusPath((active) => !active)}
          >
            Focus path
          </button>
          {sequentialGroupCount > 0 && (
            <>
              <button type="button" className="graph-tool-button" onClick={onExpandAllSequential}>
                Expand all
              </button>
              <button type="button" className="graph-tool-button" onClick={onCollapseAllSequential}>
                Collapse all
              </button>
            </>
          )}
        </Panel>
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
  if (node.type === 'groupContainer') {
    const kind = (node.data as GroupContainerNode['data']).kind
    if (kind === 'sequential') return 'rgba(34, 211, 238, 0.58)'
    if (kind === 'matrix') return 'rgba(167, 139, 250, 0.58)'
  }
  return 'rgba(148, 163, 184, 0.5)'
}

/** Search text intentionally spans presentation-neutral metadata fields. */
function stageSearchText(stage: StageNode): string {
  return [
    stageBadgeRow(stage),
    stage.agent,
    stage.when?.join(' '),
    stage.steps.map((step) => `${step.name} ${step.args ?? ''}`).join(' '),
    stage.environmentEntries?.map((entry) => `${entry.key} ${entry.value}`).join(' '),
    stage.metadata?.map((fact) => `${fact.key} ${fact.label} ${fact.value ?? ''} ${fact.category} ${fact.inheritedFrom ?? ''}`).join(' '),
  ].filter(Boolean).join(' ')
}

/** Directed ancestors plus directed descendants, excluding sibling lanes. */
function executionPathIds(selectedId: string, edges: readonly FlowEdge[]): Set<string> {
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source])
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target])
  }
  const result = new Set([selectedId])
  const visit = (start: string, adjacency: ReadonlyMap<string, readonly string[]>) => {
    const queue = [start]
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) continue
      for (const next of adjacency.get(current) ?? []) {
        if (result.has(next)) continue
        result.add(next)
        queue.push(next)
      }
    }
  }
  visit(selectedId, incoming)
  visit(selectedId, outgoing)
  return result
}

/** A selected group focuses every hosted lane plus their external paths. */
function executionFocusIds(
  selectedId: string,
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
): Set<string> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const isHostedBySelection = (node: FlowNode): boolean => {
    let parentId = node.parentId
    while (parentId) {
      if (parentId === selectedId) return true
      parentId = byId.get(parentId)?.parentId
    }
    return false
  }
  const seeds = nodes
    .filter((node) => node.id === selectedId || isHostedBySelection(node))
    .map((node) => node.id)
  const focused = new Set<string>([selectedId])
  for (const seed of seeds) {
    for (const id of executionPathIds(seed, edges)) focused.add(id)
  }
  return focused
}
