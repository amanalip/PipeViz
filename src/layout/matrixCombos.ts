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

  const rules = stage.matrixExcludes ?? []
  if (rules.length === 0) return combos

  return combos.filter((combo) => rules.every((rule) => !excludedByRule(combo, names, rule)))
}

/**
 * Number of surviving combinations, enumerated lazily WITHOUT materializing
 * them (the odometer holds one combination at a time). Stops as soon as
 * `beyond` survivors have been counted, so callers can bound the work:
 * existence checks pass 1, ceiling checks pass the limit, full counts pass
 * nothing. Same ordering and exclusion semantics as computeMatrixCombos.
 */
export function matrixCombinationCount(stage: StageNode, beyond = Infinity): number {
  const names = stage.matrixAxes ?? []
  const valueColumns = stage.matrixAxisValues ?? []
  if (names.length === 0 || valueColumns.length !== names.length) return 0
  if (valueColumns.some((values) => values.length === 0)) return 0

  const rules = stage.matrixExcludes ?? []
  const sizes = valueColumns.map((values) => values.length)
  const total = sizes.reduce((product, size) => product * size, 1)

  // Odometer over axis indexes, last axis fastest - identical order to the
  // materialized list - so counts match computeMatrixCombos().length exactly.
  let counted = 0
  const combo = names.map((_, axis) => valueColumns[axis]?.[0] ?? '')
  const index = names.map(() => 0)
  for (let visited = 0; visited < total && counted < beyond; visited += 1) {
    if (!rules.some((rule) => excludedByRule(combo, names, rule))) {
      counted += 1
      if (counted >= beyond) break
    }
    for (let axis = names.length - 1; axis >= 0; axis -= 1) {
      const size = sizes[axis] ?? 0
      const nextIndex = (index[axis] ?? 0) + 1
      if (nextIndex < size) {
        index[axis] = nextIndex
        combo[axis] = valueColumns[axis]?.[nextIndex] ?? ''
        break
      }
      index[axis] = 0
      combo[axis] = valueColumns[axis]?.[0] ?? ''
    }
  }
  return counted
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

/** Whether any stage in the model carries an expandable matrix. Counts
 * lazily (existence only) instead of materializing every combination. */
export function hasExpandableMatrix(stages: readonly StageNode[]): boolean {
  return stages.some((stage) => {
    if (matrixCombinationCount(stage, 1) > 0) return true
    const nested = [
      ...(stage.parallelBranches ?? []),
      ...(stage.sequentialChildren ?? []),
    ]
    return nested.length > 0 && hasExpandableMatrix(nested)
  })
}
