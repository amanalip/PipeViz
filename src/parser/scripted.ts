// ---------------------------------------------------------------------------
// parser/scripted.ts - scripted pipeline fallback (plan §6.4).
//
// When no top level `pipeline` block exists but the text carries
// `stage('Name') { … }` calls, scripted mode kicks in: stages are located
// across the whole document in order, nesting derives from brace containment
// (a stage whose block sits inside another stage's block becomes its child),
// and each stage's statements become steps.
//
// Output uses the same PipelineModel shape as declarative mode with
// `kind: 'scripted'`, so layout and rendering stay identical downstream.
// ---------------------------------------------------------------------------

import type { BlockNode } from './blockTree'
import type { Token } from './tokenize'
import {
  collectSteps,
  flattenScope,
  rawSlice,
  startsWithKeyword,
  type InterpretContext,
} from './interpret'
import type { PipelineModel, StageNode } from '../model/types'

/** A discovered scripted stage plus its containment context. */
interface FoundStage {
  block: BlockNode
  /** Nearest enclosing stage block, if nested inside one. */
  parent?: BlockNode
  /** Label of the nearest enclosing `node('label')`, if any. */
  nodeLabel?: string
  // Ancestor chain captured so step collection can skip subtrees that hold
  // other stages (their content belongs to those stages, not here).
  ancestors: BlockNode[]
}

/**
 * True when the token stream carries scripted constructs worth scanning: an
 * identifier `stage` or `node` directly followed by an opening paren. Reads
 * tokens, not raw text, so mentions inside comments or string literals -
 * which the tokenizer already strips or wraps - can never trigger scripted
 * detection.
 */
export function hasScriptedMarkers(tokens: readonly Token[]): boolean {
  return tokens.some(
    (token, index) =>
      token.type === 'ident' &&
      (token.value === 'stage' || token.value === 'node') &&
      tokens[index + 1]?.type === 'punct' &&
      tokens[index + 1]?.value === '(',
  )
}

/**
 * Depth-first scan locating every `stage('…') { … }` block in document order,
 * recording its nearest stage ancestor and node label along the way.
 */
function findStages(root: BlockNode): FoundStage[] {
  const found: FoundStage[] = []

  const visit = (
    node: BlockNode,
    parentStage: BlockNode | undefined,
    nodeLabel: string | undefined,
    ancestors: BlockNode[],
  ): void => {
    for (const item of flattenScope(node.children)) {
      const block = item.block
      if (!block) continue

      if (startsWithKeyword(item.tokens, 'stage')) {
        found.push({ block, parent: parentStage, nodeLabel, ancestors: [...ancestors] })
        visit(block, block, nodeLabel, [...ancestors, block])
        continue
      }

      if (startsWithKeyword(item.tokens, 'node')) {
        // node('label') { … } - remember the label for stage agent info.
        const labelToken = block.header.find((t) => t.type === 'string')
        visit(
          block,
          parentStage,
          labelToken ? labelToken.value : nodeLabel,
          [...ancestors, block],
        )
        continue
      }

      // Keep every wrapper on the path. Step collection must skip a direct
      // child wrapper when any nested stage owns that wrapper's contents.
      visit(block, parentStage, nodeLabel, [...ancestors, block])
    }
  }

  visit(root, undefined, undefined, [])
  return found
}

/** Display name for a stage block: quoted arg, keyword text, or fallback. */
function stageName(block: BlockNode, ctx: InterpretContext): string {
  const quoted = block.header.find((t) => t.type === 'string')
  if (quoted) return quoted.value
  const text = rawSlice(
    block.header.filter((t) => t.type === 'ident' && t.value !== 'stage'),
    ctx,
  )
  return text.length > 0 ? text : '(unnamed stage)'
}

/**
 * Build the scripted PipelineModel. Never throws; a scan that finds no
 * stages yields an empty model plus a warning diagnostic.
 */
export function interpretScripted(root: BlockNode, ctx: InterpretContext): PipelineModel {
  const model: PipelineModel = {
    kind: 'scripted',
    environmentEntries: [],
    parameters: [],
    triggers: [],
    options: [],
    tools: [],
    postHandlers: [],
    rootStages: [],
    unparsedRegions: [],
    diagnostics: [],
  }

  ctx.diagnostics.push({
    severity: 'warning',
    message: 'Scripted pipeline detected: showing stages and steps only',
    line: 1,
  })

  const found = findStages(root)
  if (found.length === 0) {
    ctx.diagnostics.push({
      severity: 'warning',
      message: 'No stage(...) calls with bodies were recognized',
      line: 1,
    })
    model.diagnostics = ctx.diagnostics
    return model
  }

  // Blocks that are stages themselves, or whose subtree contains further
  // stages, must be skipped when collecting a parent's steps - otherwise
  // nested content shows up twice.
  const holdsStages = new Set<BlockNode>()
  for (const f of found) {
    holdsStages.add(f.block)
    for (const a of f.ancestors) holdsStages.add(a)
  }

  const nodesByBlock = new Map<BlockNode, StageNode>()
  for (const f of found) {
    // Filter out direct items that are or contain other stages.
    const ownItems = flattenScope(f.block.children).filter(
      (item) => item.block === undefined || !holdsStages.has(item.block),
    )
    const stage: StageNode = {
      id: `s${nodesByBlock.size}`,
      name: stageName(f.block, ctx),
      line: f.block.header[0]?.line ?? f.block.openLine,
      steps: collectSteps(ownItems, ctx),
    }
    if (f.nodeLabel !== undefined) stage.agent = `node '${f.nodeLabel}'`
    nodesByBlock.set(f.block, stage)

    if (f.parent !== undefined) {
      const parentNode = nodesByBlock.get(f.parent)
      if (parentNode) {
        parentNode.sequentialChildren = [
          ...(parentNode.sequentialChildren ?? []),
          stage,
        ]
        continue
      }
    }
    model.rootStages.push(stage)
  }

  model.postHandlers = ctx.postHandlers
  model.diagnostics = ctx.diagnostics
  return model
}
