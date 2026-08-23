// ---------------------------------------------------------------------------
// parser/interpret.ts - block tree -> PipelineModel, declarative mode.
//
// Walks the block tree against the declarative vocabulary (plan §6.3):
//   pipeline { agent | environment | options | parameters | triggers |
//              post | stages }
//   stage { steps | parallel | matrix | stages | when | input | agent | post }
//
// Lenient by contract: unknown constructs become generic steps or warnings,
// never exceptions, so plugin syntax still shows up in the graph instead of
// disappearing. `when` conditions are captured as raw display strings; the
// semantic meaning is out of scope for v1.
// ---------------------------------------------------------------------------

import type { Token } from './tokenize'
import type { BlockNode, TreeNode } from './blockTree'
import { splitStatements } from './statements'
import { isKnownStep } from './knownSteps'
import type {
  Diagnostic,
  EnvironmentEntry,
  OptionsEntry,
  ParameterEntry,
  PipelineModel,
  PostHandler,
  StageNode,
  Step,
} from '../model/types'

/** Shared mutable context threaded through interpretation passes. */
export interface InterpretContext {
  /** Original source text; raw argument slices come straight from it. */
  source: string
  /** Accumulated tokenizer/tree/interpreter diagnostics. */
  diagnostics: Diagnostic[]
  /** Accumulated post handlers from pipeline and stage scopes. */
  postHandlers: PostHandler[]
}

/**
 * One item of a scope's body: its leading statement tokens plus, when the
 * statement opened a brace, that child block. Every scope flattens to this
 * shape so interpretation never has to special-case runs vs blocks again.
 */
export interface ScopeItem {
  tokens: Token[]
  block?: BlockNode
}

export function flattenScope(children: readonly TreeNode[]): ScopeItem[] {
  const items: ScopeItem[] = []
  for (const child of children) {
    if (child.kind === 'block') {
      items.push({ tokens: child.header, block: child })
    } else {
      // A run may hold several brace-less statements (same line split by
      // `;`, or lines after the last braced child) - split them apart.
      for (const stmt of splitStatements(child.tokens)) {
        items.push({ tokens: stmt.tokens })
      }
    }
  }
  return items
}

/** First token of an item, or undefined for empty headers. */
export function leadToken(item: ScopeItem): Token | undefined {
  return item.tokens[0]
}

/** Verbatim source slice spanning the given tokens, ends trimmed. */
export function rawSlice(tokens: readonly Token[], ctx: InterpretContext): string {
  const first = tokens[0]
  const last = tokens[tokens.length - 1]
  if (!first || !last) return ''
  return ctx.source.slice(first.start, last.end).trim()
}

/** True when the token run starts with the given keyword identifier. */
export function startsWithKeyword(tokens: readonly Token[], keyword: string): boolean {
  const first = tokens[0]
  return first?.type === 'ident' && first.value === keyword
}

/** Index of the ')' matching the '(' at position openIdx, else -1. */
function matchParen(tokens: readonly Token[], openIdx: number): number {
  let depth = 0
  for (let k = openIdx; k < tokens.length; k += 1) {
    const t = tokens[k]
    if (t?.type === 'punct') {
      if (t.value === '(') depth += 1
      else if (t.value === ')') {
        depth -= 1
        if (depth === 0) return k
      }
    }
  }
  return -1
}

const SCRIPT_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'switch', 'try', 'catch', 'finally',
  'def', 'return', 'break', 'continue', 'import', 'throw', 'new',
])

/** Index of the first top-level assignment '=' in the run, else -1. */
function findAssignment(tokens: readonly Token[]): number {
  let paren = 0
  for (let k = 1; k < tokens.length; k += 1) {
    const t = tokens[k]
    if (!t || t.type !== 'punct') continue
    if (t.value === '(') paren += 1
    else if (t.value === ')') paren = Math.max(0, paren - 1)
    else if (t.value === '=' && paren === 0 && tokens[k + 1]?.value !== '=') return k
  }
  return -1
}

/**
 * Read an optional `failFast true|false` out of statement tokens. Returns
 * undefined when the statement carries no boolean failFast argument.
 */
function readFailFast(tokens: readonly Token[]): boolean | undefined {
  for (let k = 0; k < tokens.length - 1; k += 1) {
    const t = tokens[k]
    const next = tokens[k + 1]
    if (t?.type === 'ident' && t.value === 'failFast') {
      if (next?.type === 'ident' && next.value === 'true') return true
      if (next?.type === 'ident' && next.value === 'false') return false
    }
  }
  return undefined
}

/**
 * Convert one brace-less statement into a Step. Call-shaped statements keep
 * their name plus verbatim argument text; everything else degrades to a
 * 'script' kind step so arbitrary Groovy stays visible instead of vanishing.
 */
export function stepFromStatement(tokens: readonly Token[], ctx: InterpretContext): Step {
  const first = tokens[0]
  const line = first?.line ?? 1

  // Not identifier-led: bare expression/string statement.
  if (!first || first.type !== 'ident') {
    return { name: 'expression', args: rawSlice(tokens, ctx), kind: 'script', line }
  }

  // Assignment or control-flow keywords read best as one script blob.
  if (SCRIPT_KEYWORDS.has(first.value) || findAssignment(tokens) >= 0) {
    return { name: first.value, args: rawSlice(tokens, ctx), kind: 'script', line }
  }

  // Call with parens: name + raw text between the balanced parens.
  if (tokens[1]?.type === 'punct' && tokens[1].value === '(') {
    const close = matchParen(tokens, 1)
    if (close > 1) {
      const inner = tokens.slice(2, close)
      const args = rawSlice(inner, ctx)
      return {
        name: first.value,
        args: args.length > 0 ? args : undefined,
        kind: isKnownStep(first.value) ? 'known' : 'unknown',
        line,
      }
    }
  }

  // Groovy command form without parens: `sh 'make build'`.
  if (tokens.length > 1) {
    const rest = tokens.slice(1)
    return {
      name: first.value,
      args: rawSlice(rest, ctx),
      kind: isKnownStep(first.value) ? 'known' : 'unknown',
      line,
    }
  }

  return { name: first.value, kind: isKnownStep(first.value) ? 'known' : 'unknown', line }
}

/**
 * Flatten scope items into an ordered Step list. Braced wrappers (dir,
 * timeout, script, ...) emit their own step first, then their contents
 * inline - mirroring how Blue Ocean unfolds nested execution scopes.
 */
export function collectSteps(items: readonly ScopeItem[], ctx: InterpretContext): Step[] {
  const steps: Step[] = []
  for (const item of items) {
    steps.push(stepFromStatement(item.tokens, ctx))
    if (item.block) {
      steps.push(...collectSteps(flattenScope(item.block.children), ctx))
    }
  }
  return steps
}

/** Human-readable summary of an agent directive ("any", "label 'x'", ...). */
export function summarizeAgent(item: ScopeItem, ctx: InterpretContext): string {
  if (!item.block) {
    const rest = item.tokens.slice(1)
    const text = rawSlice(rest, ctx)
    return text.length > 0 ? text : rawSlice(item.tokens, ctx)
  }
  // Block form: join each inner directive as "name args" fragments.
  const parts: string[] = []
  for (const inner of flattenScope(item.block.children)) {
    let fragment = rawSlice(inner.tokens, ctx)
    if (inner.block) {
      const nested = flattenScope(inner.block.children).map((d) => rawSlice(d.tokens, ctx))
      if (nested.length > 0) fragment += ` { ${nested.join(', ')} }`
    }
    if (fragment.length > 0) parts.push(fragment)
  }
  return parts.join(', ')
}

/** Read `post { condition { steps } }` handlers into the shared sink. */
export function readPostHandlers(
  postBlock: BlockNode,
  ctx: InterpretContext,
  stageName?: string,
): void {
  for (const item of flattenScope(postBlock.children)) {
    const conditionToken = item.tokens[0]
    const handler: PostHandler = {
      condition:
        conditionToken?.type === 'ident'
          ? conditionToken.value
          : rawSlice(item.tokens, ctx) || 'condition',
      steps: item.block ? collectSteps(flattenScope(item.block.children), ctx) : [],
    }
    if (stageName !== undefined) handler.stage = stageName
    ctx.postHandlers.push(handler)
  }
}

/** Read `environment { KEY = value }` pairs. */
export function readEnvironment(block: BlockNode, ctx: InterpretContext): EnvironmentEntry[] {
  const entries: EnvironmentEntry[] = []
  for (const item of flattenScope(block.children)) {
    const key = item.tokens[0]
    const eq = item.tokens[1]
    if (!key || !eq || eq.type !== 'punct' || eq.value !== '=') continue
    entries.push({
      key: key.value,
      value: rawSlice(item.tokens.slice(2), ctx),
      line: key.line,
    })
  }
  return entries
}

/** Read `options { timestamps() ... }` directives. */
export function readOptions(block: BlockNode, ctx: InterpretContext): OptionsEntry[] {
  const options: OptionsEntry[] = []
  for (const item of flattenScope(block.children)) {
    const nameToken = item.tokens[0]
    if (!nameToken || nameToken.type !== 'ident') continue
    const entry: OptionsEntry = { name: nameToken.value, line: nameToken.line }
    if (item.tokens[1]?.type === 'punct' && item.tokens[1].value === '(') {
      const close = matchParen(item.tokens, 1)
      if (close > 1) {
        const args = rawSlice(item.tokens.slice(2, close), ctx)
        if (args.length > 0) entry.args = args
        options.push(entry)
        continue
      }
    }
    options.push(entry)
  }
  return options
}

/** Read `parameters { string(name: 'X', ...) }` declarations. */
export function readParameters(block: BlockNode, _ctx: InterpretContext): ParameterEntry[] {
  const parameters: ParameterEntry[] = []
  for (const item of flattenScope(block.children)) {
    const typeToken = item.tokens[0]
    if (!typeToken || typeToken.type !== 'ident') continue
    // Find `name : 'literal'` inside the declaration tokens.
    let name: string | undefined
    for (let k = 1; k < item.tokens.length - 2; k += 1) {
      const t = item.tokens[k]
      const colon = item.tokens[k + 1]
      const value = item.tokens[k + 2]
      if (
        t?.type === 'ident' &&
        t.value === 'name' &&
        colon?.type === 'punct' &&
        colon.value === ':' &&
        value?.type === 'string'
      ) {
        name = value.value
        break
      }
    }
    parameters.push({ name: name ?? '(unnamed)', type: typeToken.value })
  }
  return parameters
}

/** Summarize each top-level condition of a `when` block as display text. */
export function summarizeWhen(whenBlock: BlockNode, ctx: InterpretContext): string[] {
  const summaries: string[] = []
  for (const item of flattenScope(whenBlock.children)) {
    let text = rawSlice(item.tokens, ctx)
    if (item.block && item.block.children.length > 0) text += ' { … }'
    if (text.length > 0) summaries.push(text)
  }
  return summaries
}

/** Collect axis names declared under a matrix block (`axis { name 'OS' … }`). */
export function collectMatrixAxes(matrixBlock: BlockNode): string[] {
  return collectMatrixAxisSpecs(matrixBlock).map((axis) => axis.name)
}

/** One captured `axis { name … values … notValues … }` entry of a matrix. */
export interface MatrixAxisSpec {
  name: string
  values: string[]
  /** Values this axis refuses; Jenkins excludes any combo carrying one. */
  notValues: string[]
}

/**
 * String literals following the given keyword in one statement, tolerating
 * both `values 'a', 'b'` and list forms; stops at the first non-separator.
 */
function collectKeywordStrings(tokens: readonly Token[], keyword: string): string[] {
  const valuesIdx = tokens.findIndex((t) => t.type === 'ident' && t.value === keyword)
  if (valuesIdx < 0) return []
  const out: string[] = []
  for (let k = valuesIdx + 1; k < tokens.length; k += 1) {
    const t = tokens[k]
    if (!t) break
    if (t.type === 'string') out.push(t.value)
    else if (t.type === 'punct' && (t.value === ',' || t.value === '[' || t.value === ']')) continue
    else break
  }
  return out
}

/**
 * String literals following a `values` keyword in one axis statement.
 */
function collectValueStrings(tokens: readonly Token[]): string[] {
  return collectKeywordStrings(tokens, 'values')
}

/**
 * String literals following a `notValues` keyword in one axis statement -
 * Jenkins' per-axis exclusion list, honored by the combination math.
 */
function collectNotValueStrings(tokens: readonly Token[]): string[] {
  return collectKeywordStrings(tokens, 'notValues')
}

/** First direct child block led by the given keyword, if any. */
function childBlock(block: BlockNode, keyword: string): BlockNode | undefined {
  for (const item of flattenScope(block.children)) {
    if (item.block && startsWithKeyword(item.tokens, keyword)) return item.block
  }
  return undefined
}

/**
 * Capture every axis of a matrix as `{ name, values }`, walking `axes { … }`
 * wherever it sits under the block. Axes without a name are skipped; ones
 * without values survive with an empty list so names stay honest.
 */
export function collectMatrixAxisSpecs(matrixBlock: BlockNode): MatrixAxisSpec[] {
  const axesBlock = childBlock(matrixBlock, 'axes')
  if (!axesBlock) return []
  const specs: MatrixAxisSpec[] = []
  for (const item of flattenScope(axesBlock.children)) {
    if (!item.block || !startsWithKeyword(item.tokens, 'axis')) continue
    let name: string | undefined
    const values: string[] = []
    const notValues: string[] = []
    for (const inner of flattenScope(item.block.children)) {
      const tokens = inner.tokens
      const nameIdx = tokens.findIndex((t) => t.type === 'ident' && t.value === 'name')
      const nameValue = nameIdx >= 0 ? tokens[nameIdx + 1] : undefined
      if (name === undefined && nameValue?.type === 'string') name = nameValue.value
      values.push(...collectValueStrings(tokens))
      notValues.push(...collectNotValueStrings(tokens))
      if (inner.block) {
        values.push(...collectValueStrings(inner.block.header))
        notValues.push(...collectNotValueStrings(inner.block.header))
      }
    }
    if (name !== undefined) specs.push({ name, values, notValues })
  }
  return specs
}

/**
 * Capture `excludes { exclude { axis { name 'OS' values 'windows' } } }`
 * rules. Each exclude becomes a partial map axis -> forbidden values;
 * combination filtering lives in layout/matrixCombos so the parser stays a
 * dumb recorder.
 */
export function collectMatrixExcludes(matrixBlock: BlockNode): { [axisName: string]: string[] }[] {
  const excludesBlock = childBlock(matrixBlock, 'excludes')
  if (!excludesBlock) return []
  const rules: { [axisName: string]: string[] }[] = []
  for (const item of flattenScope(excludesBlock.children)) {
    if (!item.block || !startsWithKeyword(item.tokens, 'exclude')) continue
    const rule: { [axisName: string]: string[] } = {}
    for (const inner of flattenScope(item.block.children)) {
      if (!inner.block || !startsWithKeyword(inner.tokens, 'axis')) continue
      let name: string | undefined
      const values: string[] = []
      for (const leaf of flattenScope(inner.block.children)) {
        const tokens = leaf.tokens
        const nameIdx = tokens.findIndex((t) => t.type === 'ident' && t.value === 'name')
        const nameValue = nameIdx >= 0 ? tokens[nameIdx + 1] : undefined
        if (name === undefined && nameValue?.type === 'string') name = nameValue.value
        values.push(...collectValueStrings(tokens))
        if (leaf.block) values.push(...collectValueStrings(leaf.block.header))
      }
      if (name !== undefined) rule[name] = values
    }
    if (Object.keys(rule).length > 0) rules.push(rule)
  }
  return rules
}

/**
 * Steps executed in every cell: everything declared inside the nested
 * `stages { … }` of a matrix block. Collected flat so expansion can stamp
 * the same step list onto every combination node.
 */
export function collectMatrixCellSteps(matrixBlock: BlockNode, ctx: InterpretContext): Step[] {
  const stagesBlock = childBlock(matrixBlock, 'stages')
  if (!stagesBlock) return []
  const steps: Step[] = []
  const hunt = (block: BlockNode): void => {
    for (const item of flattenScope(block.children)) {
      if (item.block) {
        if (startsWithKeyword(item.tokens, 'steps')) {
          steps.push(...collectSteps(flattenScope(item.block.children), ctx))
        }
        hunt(item.block)
      }
    }
  }
  hunt(stagesBlock)
  return steps
}

/**
 * The real nested stages a matrix runs in every cell, interpreted as proper
 * StageNodes under ids RELATIVE to the matrix (`c0`, `c1/p0`, …). Expansion
 * re-roots clones of this chain under each combination so lanes keep their
 * actual sequential shape; ids are prefixed per lane at layout time, which
 * keeps them unique and deterministic across re-parses.
 */
export function collectMatrixCellStages(
  matrixBlock: BlockNode,
  ctx: InterpretContext,
): StageNode[] {
  const stagesBlock = childBlock(matrixBlock, 'stages')
  if (!stagesBlock) return []
  const stages: StageNode[] = []
  for (const item of flattenScope(stagesBlock.children)) {
    if (item.block && startsWithKeyword(item.tokens, 'stage')) {
      stages.push(interpretStage(item.block, `c${stages.length}`, ctx))
    }
  }
  return stages
}

function warn(ctx: InterpretContext, message: string, line: number): void {
  ctx.diagnostics.push({ severity: 'warning', message, line })
}

/**
 * Locate the top-level `pipeline { … }` block, if one exists. Its presence
 * is the declarative-mode trigger (plan §6.3); absence falls through to the
 * scripted scanner.
 */
export function findPipelineBlock(root: BlockNode): BlockNode | undefined {
  for (const item of flattenScope(root.children)) {
    if (item.block && startsWithKeyword(item.tokens, 'pipeline')) return item.block
  }
  return undefined
}

/**
 * Interpret one `stage('Name') { … }` block into a StageNode. Exactly one
 * structural child (steps/parallel/matrix/nested stages) drives the graph
 * shape; other recognized directives attach metadata to the node.
 */
export function interpretStage(
  block: BlockNode,
  id: string,
  ctx: InterpretContext,
): StageNode {
  const headerName =
    block.header.find((t) => t.type === 'string')?.value ??
    rawSlice(block.header.filter((t) => t.type === 'ident').slice(1), ctx)

  const stage: StageNode = {
    id,
    name: headerName.length > 0 ? headerName : '(unnamed stage)',
    line: block.header[0]?.line ?? block.openLine,
    // Source span end: diagnostics landing mid-body map back to this card.
    ...(block.endLine >= (block.header[0]?.line ?? block.openLine)
      ? { endLine: block.endLine }
      : {}),
    steps: [],
  }

  for (const item of flattenScope(block.children)) {
    const lead = leadToken(item)
    const keyword = lead?.type === 'ident' ? lead.value : undefined

    switch (keyword) {
      case 'steps': {
        // Append, never overwrite: generic steps captured from earlier
        // unknown directives must survive a later `steps { … }` block.
        if (item.block) stage.steps.push(...collectSteps(flattenScope(item.block.children), ctx))
        break
      }
      case 'parallel': {
        // failFast may ride along in the same statement (`parallel failFast: true`)
        const riding = readFailFast(item.tokens)
        if (riding !== undefined) stage.failFast = riding
        if (item.block) {
          const branches: StageNode[] = []
          for (const branchItem of flattenScope(item.block.children)) {
            if (branchItem.block && startsWithKeyword(branchItem.tokens, 'stage')) {
              branches.push(
                interpretStage(branchItem.block, `${id}/p${branches.length}`, ctx),
              )
            } else if (!branchItem.block && startsWithKeyword(branchItem.tokens, 'failFast')) {
              // Documented placement: `failFast true` adjacent inside the group.
              const ff = readFailFast(branchItem.tokens)
              if (ff !== undefined) stage.failFast = ff
            } else {
              warn(
                ctx,
                "Only stages may appear directly inside 'parallel'",
                branchItem.tokens[0]?.line ?? item.block.openLine,
              )
            }
          }
          if (branches.length > 0) stage.parallelBranches = branches
        }
        break
      }
      case 'matrix': {
        if (item.block) {
          const specs = collectMatrixAxisSpecs(item.block)
          stage.matrixAxes = specs.map((axis) => axis.name)
          if (specs.some((axis) => axis.values.length > 0)) {
            stage.matrixAxisValues = specs.map((axis) => axis.values)
          }
          if (specs.some((axis) => axis.notValues.length > 0)) {
            stage.matrixAxisNotValues = specs.map((axis) => axis.notValues)
          }
          const excludes = collectMatrixExcludes(item.block)
          if (excludes.length > 0) stage.matrixExcludes = excludes
          const cellSteps = collectMatrixCellSteps(item.block, ctx)
          if (cellSteps.length > 0) stage.matrixCellSteps = cellSteps
          const cellStages = collectMatrixCellStages(item.block, ctx)
          if (cellStages.length > 0) stage.matrixCellStages = cellStages
        }
        break
      }
      case 'stages': {
        if (item.block) {
          const children: StageNode[] = []
          for (const childItem of flattenScope(item.block.children)) {
            if (childItem.block && startsWithKeyword(childItem.tokens, 'stage')) {
              children.push(interpretStage(childItem.block, `${id}/sq${children.length}`, ctx))
            } else {
              warn(
                ctx,
                "Only stages may appear directly inside nested 'stages'",
                childItem.tokens[0]?.line ?? item.block.openLine,
              )
            }
          }
          if (children.length > 0) stage.sequentialChildren = children
        }
        break
      }
      case 'when': {
        if (item.block) {
          const conditions = summarizeWhen(item.block, ctx)
          if (conditions.length > 0) stage.when = conditions
        }
        break
      }
      case 'failFast': {
        // Documented placement: `failFast true` adjacent to `parallel`.
        const ff = readFailFast(item.tokens)
        if (ff !== undefined) stage.failFast = ff
        break
      }
      case 'input': {
        stage.hasInput = true
        break
      }
      case 'agent': {
        const summary = summarizeAgent(item, ctx)
        if (summary.length > 0) stage.agent = summary
        break
      }
      case 'post': {
        if (item.block) readPostHandlers(item.block, ctx, stage.name)
        break
      }
      case 'environment':
      case 'tools':
      case 'options':
        // Recognized but not modeled on stage cards in v1; silently kept out.
        break
      default: {
        // Unknown directive: generic capture keeps plugins visible (plan §6.3).
        stage.steps.push(...collectSteps([item], ctx))
      }
    }
  }

  // Structural honesty: parallel/matrix containers and nested 'stages'
  // chains are mutually exclusive shapes downstream - the layout renders
  // the container and would silently drop the chain, so mixing them in one
  // stage body must surface as an explicit diagnostic.
  const structures = [
    ...(stage.parallelBranches ? ['parallel'] : []),
    ...(stage.matrixAxes ? ['matrix'] : []),
    ...(stage.sequentialChildren ? ["nested 'stages'"] : []),
  ]
  if (structures.length > 1) {
    warn(
      ctx,
      `Stage '${stage.name}' mixes ${structures.join(' and ')}; only the first structure is rendered`,
      stage.line,
    )
  }

  return stage
}

/**
 * Interpret a top-level `pipeline` block into a full model. Section order
 * in the file is irrelevant; every recognized section is visited once.
 */
export function interpretDeclarative(
  pipelineBlock: BlockNode,
  ctx: InterpretContext,
): PipelineModel {
  const model: PipelineModel = {
    kind: 'declarative',
    environmentEntries: [],
    parameters: [],
    triggers: [],
    options: [],
    postHandlers: [],
    rootStages: [],
    unparsedRegions: [],
    diagnostics: [],
  }

  // Sections modeled but intentionally left out of v1 UI.
  const silentSections = new Set(['library', 'tools'])

  for (const item of flattenScope(pipelineBlock.children)) {
    switch (leadToken(item)?.value) {
      case 'agent': {
        const summary = summarizeAgent(item, ctx)
        if (summary.length > 0) model.agent = summary
        break
      }
      case 'environment': {
        if (item.block) model.environmentEntries = readEnvironment(item.block, ctx)
        break
      }
      case 'options': {
        if (item.block) model.options = readOptions(item.block, ctx)
        break
      }
      case 'parameters': {
        if (item.block) model.parameters = readParameters(item.block, ctx)
        break
      }
      case 'triggers': {
        if (item.block) {
          model.triggers = flattenScope(item.block.children)
            .map((triggerItem) => rawSlice(triggerItem.tokens, ctx))
            .filter((text) => text.length > 0)
        }
        break
      }
      case 'post': {
        if (item.block) readPostHandlers(item.block, ctx)
        break
      }
      case 'stages': {
        if (item.block) {
          for (const stageItem of flattenScope(item.block.children)) {
            if (stageItem.block && startsWithKeyword(stageItem.tokens, 'stage')) {
              model.rootStages.push(
                interpretStage(stageItem.block, `s${model.rootStages.length}`, ctx),
              )
            } else {
              warn(
                ctx,
                "Only stages may appear directly inside 'stages'",
                stageItem.tokens[0]?.line ?? item.block.openLine,
              )
            }
          }
        }
        break
      }
      case undefined:
        break
      default: {
        const name = leadToken(item)?.value ?? '?'
        if (!silentSections.has(name)) {
          warn(
            ctx,
            `Unrecognized pipeline section '${name}'`,
            item.tokens[0]?.line ?? pipelineBlock.openLine,
          )
        }
      }
    }
  }

  if (model.rootStages.length === 0) {
    warn(ctx, 'Pipeline declares no stages', pipelineBlock.openLine)
  }

  model.postHandlers = ctx.postHandlers
  model.diagnostics = ctx.diagnostics
  return model
}
