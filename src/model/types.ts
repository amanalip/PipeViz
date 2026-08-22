// ---------------------------------------------------------------------------
// model/types.ts - the plain-data contract between parser and UI (plan §7).
//
// Everything downstream of parsing is a pure function of these structures:
// layout consumes PipelineModel, React Flow consumes layout output, and tests
// assert against them directly with no DOM involved. Fields marked optional
// (`?`) are genuinely absent when not declared in the Jenkinsfile; consumers
// must narrow instead of assuming defaults.
//
// Two deliberate extensions beyond the plan's sketch, both implied by §6.3
// and needed by the UI: `failFast` on StageNode (parallel capture), `options`
// on PipelineModel and a `stage` tag on PostHandler (stage-level post blocks
// are folded into the pipeline list without losing their scope).
// ---------------------------------------------------------------------------

/** Where a step came from / whether we can render a known icon for it. */
export type StepKind = 'known' | 'unknown' | 'script'

/**
 * One statement inside a `steps` block (or scripted stage body).
 * `args` keeps raw source text (quotes included) for display only.
 */
export interface Step {
  /** e.g. 'sh', 'checkout', 'myLibStep' */
  name: string
  /** Raw text inside parens, trimmed; absent for zero-arg calls. */
  args?: string
  kind: StepKind
  line: number
}

/**
 * A node of the pipeline graph. Structural children are mutually exclusive
 * in practice; a stage carrying `parallelBranches` or `sequentialChildren`
 * renders as a group rather than its own card.
 */
export interface StageNode {
  /** Stable path-derived id, e.g. 's2/p1' - deterministic across re-parses. */
  id: string
  name: string
  line: number
  steps: Step[]
  /** Raw condition summaries from `when`, one per top-level condition. */
  when?: string[]
  /** Agent summary for this stage, e.g. "docker: 'node:18'". */
  agent?: string
  hasInput?: boolean
  /** Lanes fanning out of this stage (from a `parallel` block). */
  parallelBranches?: StageNode[]
  /** Axis names when this stage is a `matrix`. */
  matrixAxes?: string[]
  /** Captured `failFast` flag belonging to a parallel group. */
  failFast?: boolean
  /** Sequential sub-chain inside this stage (nested `stages` block). */
  sequentialChildren?: StageNode[]
}

/** One `post { <condition> { ... } }` handler, pipeline- or stage-scoped. */
export interface PostHandler {
  condition: string
  steps: Step[]
  /** Set when the handler came from inside that named stage. */
  stage?: string
}

export interface EnvironmentEntry {
  key: string
  value: string
  line: number
}

export interface ParameterEntry {
  name: string
  type: string
}

export interface Diagnostic {
  severity: 'error' | 'warning'
  message: string
  line: number
}

export interface OptionsEntry {
  name: string
  args?: string
  line: number
}

export type ModelKind = 'declarative' | 'scripted'

export interface PipelineModel {
  kind: ModelKind
  agent?: string
  environmentEntries: EnvironmentEntry[]
  parameters: ParameterEntry[]
  triggers: string[]
  options: OptionsEntry[]
  postHandlers: PostHandler[]
  rootStages: StageNode[]
  diagnostics: Diagnostic[]
}
