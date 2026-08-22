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

/** Whether any stage in the model carries an expandable matrix. */
export function hasExpandableMatrix(stages: readonly StageNode[]): boolean {
  return stages.some((stage) => {
    if (computeMatrixCombos(stage).length > 0) return true
    const nested = [
      ...(stage.parallelBranches ?? []),
      ...(stage.sequentialChildren ?? []),
    ]
    return nested.length > 0 && hasExpandableMatrix(nested)
  })
}
