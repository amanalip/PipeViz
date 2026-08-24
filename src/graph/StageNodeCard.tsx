// ---------------------------------------------------------------------------
// graph/StageNodeCard.tsx - the one custom React Flow node (mockups §6).
//
// A stage card is a 220x72 elevated surface: bold title, quiet badge row
// separated by middots, and a 3px category stripe down the full left edge.
// Handles sit on both sides but are invisible; edges attach to them.
//
// Interaction states come from CSS: default -> hover brightens the border,
// selected gets the double accent ring + glow (React Flow adds a `selected`
// class on the node wrapper), ghost styling waits for M4's partial graphs.
// ---------------------------------------------------------------------------

import { Handle, NodeToolbar, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'

import { stageBadgeRow } from './stageBadges'
import type { StageCardNode } from './toFlow'

/**
 * Badge row per the mockup glossary (§6): step count always, then feature
 * markers in stable order. The parallel marker lives on containers instead,
 * but stays here defensively for models that somehow reach a card with
 * branches (layout normally replaces those cards).
 */
/** Custom node renderer registered as `nodeTypes.stage` in FlowCanvas. */
export function StageNodeCard({ data, selected }: NodeProps<StageCardNode>) {
  const { stage } = data
  const toggleLabel = data.expandable
    ? `${data.stepsExpanded ? 'Collapse' : 'Expand'} ${stage.name}`
    : `${data.stepsExpanded ? 'Collapse' : 'Expand'} ${stage.name} steps`
  return (
    <div
      className={data.stepsExpanded ? 'stage-card steps-expanded' : 'stage-card'}
      data-category={data.category}
      title={stage.name}
      onClick={(event) => {
        if (event.detail !== 2) return
        event.stopPropagation()
        if (data.expandable) data.onToggleSequential?.(stage.id)
        else if (data.stepsExpandable) data.onToggleSteps?.(stage.id)
        else data.onJumpToSource?.(stage.line)
      }}
    >
      <NodeToolbar isVisible={selected} position={Position.Top} className="node-quick-toolbar">
        {data.expandable && (
          <button type="button" onClick={() => data.onToggleSequential?.(stage.id)}>
            Expand group
          </button>
        )}
        {data.stepsExpandable && (
          <button type="button" onClick={() => data.onToggleSteps?.(stage.id)}>
            {data.stepsExpanded ? 'Collapse steps' : 'Expand steps'}
          </button>
        )}
        <button type="button" onClick={() => data.onJumpToSource?.(stage.line)}>
          Source
        </button>
      </NodeToolbar>
      {/* Named horizontal and vertical anchors let one card participate in
          outer pipeline flow or a vertical sequential group without custom
          card variants. */}
      <Handle id="target-left" type="target" position={Position.Left} className="card-handle" isConnectable={false} />
      <Handle id="target-top" type="target" position={Position.Top} className="card-handle" isConnectable={false} />
      <div className="stage-card-heading">
        {data.sequenceIndex !== undefined && (
          <span className="sequence-order" aria-hidden="true">{data.sequenceIndex}</span>
        )}
        <span className="stage-card-title">{stage.name}</span>
        {(data.expandable || data.stepsExpandable) && (
          <button
            type="button"
            className="stage-expand-button nodrag nowheel"
            aria-label={data.expandable
              ? `Expand ${stage.name}, ${stage.sequentialChildren?.length ?? 0} nested stages`
              : toggleLabel}
            aria-expanded={data.stepsExpanded}
            title={data.expandable ? 'Expand nested sequential stages' : toggleLabel}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              if (data.expandable) data.onToggleSequential?.(stage.id)
              else data.onToggleSteps?.(stage.id)
            }}
          >
            <span aria-hidden="true">{data.stepsExpanded ? '⌃' : '⌄'}</span>
          </button>
        )}
      </div>
      <span className="stage-card-badges">{stageBadgeRow(stage)}</span>
      {data.stepsExpanded && (
        <ol className="stage-step-list" aria-label={`${stage.name} steps`}>
          {stage.steps.map((step, index) => (
            <li key={`${step.line}-${index}`}>
              <code>{step.name}{step.args ? ` ${step.args}` : ''}</code>
              <span>line {step.line} · {step.kind}</span>
            </li>
          ))}
        </ol>
      )}
      <Handle id="source-right" type="source" position={Position.Right} className="card-handle" isConnectable={false} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} className="card-handle" isConnectable={false} />
    </div>
  )
}
