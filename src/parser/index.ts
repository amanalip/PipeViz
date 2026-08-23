// ---------------------------------------------------------------------------
// parser/index.ts - the single public entry point of the parser (plan §5).
//
// parseJenkinsfile(text) -> PipelineModel
//
// Contract (plan §6.5): this function NEVER throws. Any input - empty text,
// binary garbage, half a Jenkinsfile, fuzzed ASCII noise - yields a model,
// possibly without stages, plus diagnostics carrying line numbers. The UI
// renders partial graphs from partial parses and never sees an exception.
// ---------------------------------------------------------------------------

import { tokenize } from './tokenize'
import { buildBlockTree } from './blockTree'
import { findPipelineBlock, interpretDeclarative, type InterpretContext } from './interpret'
import { hasScriptedMarkers, interpretScripted } from './scripted'
import { collectUnparsedRegions } from './unparsed'
import type { Diagnostic, PipelineModel } from '../model/types'

export { tokenize } from './tokenize'
export { buildBlockTree } from './blockTree'
export type { Token } from './tokenize'
export type { BlockNode, TreeNode } from './blockTree'

function emptyModel(diagnostics: Diagnostic[]): PipelineModel {
  return {
    kind: 'declarative',
    environmentEntries: [],
    parameters: [],
    triggers: [],
    options: [],
    tools: [],
    postHandlers: [],
    rootStages: [],
    unparsedRegions: [],
    diagnostics,
  }
}

/**
 * Parse Jenkinsfile source into a pipeline model. Never throws.
 * Declarative pipelines get full interpretation; scripted ones get the
 * stage/step scan; anything else returns an empty model plus diagnostics.
 */
export function parseJenkinsfile(source: string): PipelineModel {
  const ctx: InterpretContext = { source, diagnostics: [], postHandlers: [] }

  // Belt-and-braces catch: even an interpreter bug must not break the UI.
  try {
    const { tokens, diagnostics } = tokenize(source)
    ctx.diagnostics.push(...diagnostics)

    const { root, diagnostics: treeDiagnostics } = buildBlockTree(tokens)
    ctx.diagnostics.push(...treeDiagnostics)

    if (source.trim().length === 0) {
      // Empty input is a normal state, not a warning-worthy one.
      return emptyModel(ctx.diagnostics)
    }

    const pipelineBlock = findPipelineBlock(root)
    const model = pipelineBlock
      ? interpretDeclarative(pipelineBlock, ctx)
      : hasScriptedMarkers(tokens)
        ? interpretScripted(root, ctx)
        : emptyModelWithWarning(ctx)

    // Mockups §11: stage calls that brace recovery demoted become ghost
    // material instead of silently vanishing from the graph.
    model.unparsedRegions = collectUnparsedRegions(root, model)
    return model
  } catch (error) {
    return emptyModel([
      {
        severity: 'error',
        message: `Unexpected parser failure: ${String(error)}`,
        line: 1,
      },
    ])
  }
}

/** Warning-only model for input carrying neither pipeline nor stage markers. */
function emptyModelWithWarning(ctx: InterpretContext): PipelineModel {
  ctx.diagnostics.push({
    severity: 'warning',
    message: 'No declarative pipeline or scripted stages were recognized',
    line: 1,
  })
  return emptyModel(ctx.diagnostics)
}
