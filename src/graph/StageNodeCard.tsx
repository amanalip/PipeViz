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

import { Handle, Position } from '@xyflow/react'
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
export function StageNodeCard({ data }: NodeProps<StageCardNode>) {
  const { stage } = data
  return (
    <div className="stage-card" data-category={data.category} title={stage.name}>
      {/* Invisible edge anchors: target left, source right (mockup §6). */}
      <Handle type="target" position={Position.Left} className="card-handle" isConnectable={false} />
      <span className="stage-card-title">{stage.name}</span>
      <span className="stage-card-badges">{stageBadgeRow(stage)}</span>
      <Handle type="source" position={Position.Right} className="card-handle" isConnectable={false} />
    </div>
  )
}
