// ---------------------------------------------------------------------------
// layout/matrixCombos.ts - matrix stage -> one combination per cell (M6).
//
// The parser records axes (names + values), exclude rules, and the steps a
// matrix runs in every cell; this module turns that into the concrete
// combinations behind the "expand matrix" toggle (mockups §10, plan Q1).
//
// Jenkins semantics, kept honest but simple: a combination is excluded when
// EVERY axis an exclude names matches one of that exclude's values. Axes an
// exclude does not mention impose no constraint. Combination order follows
// the axis declaration order with the last axis varying fastest, so output
// is deterministic across re-parses (a layout/test requirement everywhere).
// ---------------------------------------------------------------------------

import type { StageNode } from '../model/types'

/**
 * Every exclude rule in force for `stage`: the explicit `excludes { … }`
 * entries plus one synthetic single-axis rule per axis `notValues` list -
 * Jenkins treats an axis notValues exactly like a matching exclude entry.
 */
function effectiveExcludes(stage: StageNode): { [axisName: string]: string[] }[] {
  const rules = stage.matrixExcludes ? [...stage.matrixExcludes] : []
  const names = stage.matrixAxes ?? []
  const notValueColumns = stage.matrixAxisNotValues ?? []
  for (let axis = 0; axis < names.length; axis += 1) {
    const forbidden = notValueColumns[axis] ?? []
    if (forbidden.length > 0) rules.push({ [names[axis] as string]: forbidden })
  }
  return rules
}

/**
 * Cartesian product of the declared axis values, minus excluded
 * combinations. Pure and deterministic; returns [] for anything that cannot
 * expand (no values, single empty axis, fully excluded).
 */
export function computeMatrixCombos(stage: StageNode): string[][] {
  const names = stage.matrixAxes ?? []
  const valueColumns = stage.matrixAxisValues ?? []
  if (names.length === 0 || valueColumns.length !== names.length) return []
  if (valueColumns.some((values) => values.length === 0)) return []

  let combos: string[][] = [[]]
  for (const values of valueColumns) {
    const next: string[][] = []
    for (const prefix of combos) {
      for (const value of values) next.push([...prefix, value])
    }
    combos = next
  }

  const rules = effectiveExcludes(stage)
  if (rules.length === 0) return combos

  return combos.filter((combo) => rules.every((rule) => !excludedByRule(combo, names, rule)))
}

/** Maximum symbolic states explored before counting returns a conservative
 * over-limit result. This keeps hostile rule sets from replacing cartesian
 * explosion with exponential rule-state explosion. */
export const MATRIX_COUNT_STATE_LIMIT = 10_000

interface CountRule {
  constraints: Map<number, ReadonlySet<string>>
  lastAxis: number
}

/** Normalize excludes against the matrix's real axes and values. */
function countRules(
  stage: StageNode,
  names: readonly string[],
  values: readonly string[][],
): CountRule[] {
  const rules: CountRule[] = []
  for (const rule of effectiveExcludes(stage)) {
    const constraints = new Map<number, ReadonlySet<string>>()
    let valid = Object.keys(rule).length > 0
    for (const [axisName, forbidden] of Object.entries(rule)) {
      const axis = names.indexOf(axisName)
      if (axis < 0) {
        valid = false
        break
      }
      const available = new Set(forbidden.filter((value) => values[axis]?.includes(value)))
      if (available.size === 0) {
        valid = false
        break
      }
      constraints.set(axis, available)
    }
    if (!valid || constraints.size === 0) continue
    rules.push({ constraints, lastAxis: Math.max(...constraints.keys()) })
  }
  return rules
}

/** Product capped at a finite caller budget. */
function cappedProduct(values: readonly number[], cap: number): number {
  let product = 1
  for (const value of values) {
    product *= value
    if (product >= cap) return cap
  }
  return product
}

/**
 * Number of surviving combinations without materializing or visiting every
 * cartesian cell. Values are grouped by the exclude rules they still match,
 * and equivalent suffix states are memoized. Fully excluded products resolve
 * from a handful of states even when the raw product has billions of cells.
 *
 * Counting stops at `beyond`. If overlapping rules exceed the symbolic state
 * budget, the result conservatively reaches that budget, keeping expansion
 * disabled without blocking the UI thread.
 */
export function matrixCombinationCount(stage: StageNode, beyond = Infinity): number {
  const names = stage.matrixAxes ?? []
  const valueColumns = stage.matrixAxisValues ?? []
  if (names.length === 0 || valueColumns.length !== names.length) return 0
  if (valueColumns.some((values) => values.length === 0)) return 0

  const cap = Number.isFinite(beyond) ? Math.max(0, beyond) : Infinity
  if (cap === 0) return 0
  const sizes = valueColumns.map((values) => values.length)
  const rules = countRules(stage, names, valueColumns)
  if (rules.length === 0) return cappedProduct(sizes, cap)

  const suffixProducts = Array<number>(sizes.length + 1).fill(1)
  for (let axis = sizes.length - 1; axis >= 0; axis -= 1) {
    suffixProducts[axis] = Math.min(
      cap,
      (suffixProducts[axis + 1] ?? 1) * (sizes[axis] ?? 0),
    )
  }

  const memo = new Map<string, number>()
  let states = 0
  let exhausted = false

  const countFrom = (axis: number, active: readonly number[]): number => {
    if (exhausted) return cap
    if (active.length === 0) return suffixProducts[axis] ?? 1
    if (active.some((ruleIndex) => (rules[ruleIndex]?.lastAxis ?? Infinity) < axis)) return 0
    if (axis >= names.length) return 0

    const key = `${axis}:${active.join(',')}`
    const cached = memo.get(key)
    if (cached !== undefined) return cached
    states += 1
    if (states > MATRIX_COUNT_STATE_LIMIT) {
      exhausted = true
      return cap
    }

    const groups = new Map<string, { active: number[]; multiplicity: number }>()
    for (const value of valueColumns[axis] ?? []) {
      const next = active.filter((ruleIndex) => {
        const accepted = rules[ruleIndex]?.constraints.get(axis)
        return accepted === undefined || accepted.has(value)
      })
      const signature = next.join(',')
      const group = groups.get(signature)
      if (group) group.multiplicity += 1
      else groups.set(signature, { active: next, multiplicity: 1 })
    }

    let counted = 0
    for (const group of groups.values()) {
      counted += group.multiplicity * countFrom(axis + 1, group.active)
      if (counted >= cap) {
        counted = cap
        break
      }
    }

    memo.set(key, counted)
    return counted
  }

  const counted = countFrom(0, rules.map((_, index) => index))
  return exhausted ? cap : counted
}

/**
 * Safety ceiling on matrix expansion: a Jenkinsfile may declare axes whose
 * Cartesian product explodes into thousands or millions of cells, and
 * rendering that many nodes freezes the browser tab. Matrices whose
 * surviving combination count exceeds this stay summary cards.
 */
export const MATRIX_CELL_LIMIT = 1000

/**
 * True when expanding `stage` is both possible (at least one combination
 * survives exclusion) and safe (the count stays within `limit`). Counts
 * lazily with an early exit, so even absurd products answer immediately.
 */
export function canExpandMatrix(stage: StageNode, limit = MATRIX_CELL_LIMIT): boolean {
  const count = matrixCombinationCount(stage, limit + 1)
  return count > 0 && count <= limit
}

/**
 * True when the combo is disqualified by this rule: every axis the rule
 * names must match one of that axis's forbidden values. Axes the rule does
 * not mention impose no constraint; naming an axis that does not exist
 * makes the rule unmatchable against real combinations, so it excludes
 * nothing (Jenkins ignores such stale rules too).
 */
function excludedByRule(
  combo: readonly string[],
  names: readonly string[],
  rule: { [axisName: string]: string[] },
): boolean {
  const entries = Object.entries(rule)
  if (entries.length === 0) return false
  return entries.every(([axis, forbidden]) => {
    const index = names.indexOf(axis)
    if (index < 0) return false
    return forbidden.includes(combo[index] ?? '')
  })
}

/** Display label for one combination card, e.g. `linux / chrome`. */
export function comboLabel(combo: readonly string[]): string {
  return combo.join(' / ')
}

/** Axis names joined for container headers, e.g. `OS × BROWSER`. */
export function axesLabel(stage: StageNode): string {
  return (stage.matrixAxes ?? []).join(' × ')
}

/**
 * Whether any stage in the model carries a matrix that survives exclusion
 * with at least one combination, regardless of the MATRIX_CELL_LIMIT safety
 * ceiling. This decides whether the Expand-matrix control belongs in the UI
 * at all: a matrix too big to expand still deserves the control, disabled,
 * rather than vanishing silently. Counts lazily (existence only).
 */
export function hasMatrixStage(stages: readonly StageNode[]): boolean {
  return stages.some((stage) => {
    if (matrixCombinationCount(stage, 1) > 0) return true
    const nested = [
      ...(stage.parallelBranches ?? []),
      ...(stage.sequentialChildren ?? []),
    ]
    return nested.length > 0 && hasMatrixStage(nested)
  })
}

/**
 * Whether any stage in the model carries an expandable matrix. Uses the same
 * canExpandMatrix() gate the layout itself applies, so the toggle only ever
 * claims expandability when expanding would actually work - a matrix past
 * the safety ceiling must not advertise an expansion that refuses to run.
 */
export function hasExpandableMatrix(stages: readonly StageNode[]): boolean {
  return stages.some((stage) => {
    if (canExpandMatrix(stage)) return true
    const nested = [
      ...(stage.parallelBranches ?? []),
      ...(stage.sequentialChildren ?? []),
    ]
    return nested.length > 0 && hasExpandableMatrix(nested)
  })
}
