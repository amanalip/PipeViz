// ---------------------------------------------------------------------------
// parser/unparsed.ts - unparsed-region markers (mockups §11).
//
// Brace recovery keeps partial graphs alive, but it can demote a literal
// `stage('X') { ... }` block: an unclosed brace swallows later stages into a
// sibling's step capture, and a stray `}` pops a scope early so following
// stages land where the interpreter cannot render them. Those calls are real
// user intent that the graph would silently hide.
//
// This pass makes them honest: walk the block tree for every stage-shaped
// block, subtract the stages that actually rendered (matched by source line,
// derived identically on both sides), and report the remainder as
// UnparsedRegions in document order. Layout turns each region into a ghost
// card joined by dashed edges - "never a blank screen", with evidence.
// ---------------------------------------------------------------------------

import type { Token } from './tokenize'
import type { BlockNode } from './blockTree'
import type { PipelineModel, StageNode, UnparsedRegion } from '../model/types'

/** True when the block's header reads `stage ...` (call-shaped). */
function isStageBlock(block: BlockNode): boolean {
  const lead = block.header[0]
  return lead?.type === 'ident' && lead.value === 'stage'
}

/** Display name recovered from a stage header's first string argument. */
function stageLabel(header: readonly Token[]): string | undefined {
  const label = header.find((token) => token.type === 'string')?.value
  return label && label.length > 0 ? label : undefined
}

/** True when the block's header reads `matrix ...` - its cell stages are
 * summarized by the MATRIX card on purpose, never "lost". */
function isMatrixBlock(block: BlockNode): boolean {
  const lead = block.header[0]
  return lead?.type === 'ident' && lead.value === 'matrix'
}

/**
 * Every stage-shaped block in the tree, outer-before-inner document order.
 * Blocks beneath a `matrix` are skipped: the matrix card accounts for its
 * cell stages by design (M6), so they are summarized, not unparsed.
 */
function collectStageBlocks(node: BlockNode, sink: BlockNode[], insideMatrix = false): void {
  for (const child of node.children) {
    if (child.kind !== 'block') continue
    const childInMatrix = insideMatrix || isMatrixBlock(child)
    if (isStageBlock(child) && !childInMatrix) sink.push(child)
    collectStageBlocks(child, sink, childInMatrix)
  }
}

/** Source line of every stage that rendered, however deeply it nests. */
function collectRenderedLines(stages: readonly StageNode[], sink: Set<number>): void {
  for (const stage of stages) {
    sink.add(stage.line)
    if (stage.parallelBranches) collectRenderedLines(stage.parallelBranches, sink)
    if (stage.sequentialChildren) collectRenderedLines(stage.sequentialChildren, sink)
  }
}

/**
 * Source line a stage block contributes when it renders; identical to how
 * interpretStage derives `line`, so matching across the two passes is exact.
 */
function blockLine(block: BlockNode): number {
  return block.header[0]?.line ?? block.openLine
}

/**
 * Regions for every stage-shaped block whose line did not render. Regions
 * fully contained inside an earlier one collapse into it (a demoted stage
 * holding further demoted stages is one ghost, not a matryoshka).
 */
export function collectUnparsedRegions(
  root: BlockNode,
  model: PipelineModel,
): UnparsedRegion[] {
  const blocks: BlockNode[] = []
  collectStageBlocks(root, blocks)

  const rendered = new Set<number>()
  collectRenderedLines(model.rootStages, rendered)

  // Greedy consumption: two stage calls sharing one line may only both be
  // "rendered" if the model really produced two cards for that line.
  const renderedRemaining = new Map<number, number>()
  for (const line of rendered) renderedRemaining.set(line, 1)

  const regions: UnparsedRegion[] = []
  for (const block of blocks) {
    const line = blockLine(block)
    const remaining = renderedRemaining.get(line) ?? 0
    if (remaining > 0) {
      renderedRemaining.set(line, remaining - 1)
      continue
    }
    regions.push({
      startLine: line,
      endLine: block.endLine,
      ...(stageLabel(block.header) ? { label: stageLabel(block.header) } : {}),
    })
  }

  // Document order, then drop regions nested inside their predecessor.
  regions.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine)
  const merged: UnparsedRegion[] = []
  for (const region of regions) {
    const outer = merged[merged.length - 1]
    if (outer && region.startLine >= outer.startLine && region.endLine <= outer.endLine) continue
    merged.push(region)
  }
  return merged
}
