// ---------------------------------------------------------------------------
// parser/testSupport.ts - shared helpers for parser test files.
//
// Tests run under `noUncheckedIndexedAccess`, so every array lookup yields
// T | undefined. Non-null assertions are banned by the ESLint config, so
// narrowing goes through req(): it throws (failing the test with context)
// instead of sprinkling `as T` casts through expectations.
// ---------------------------------------------------------------------------

import type { PipelineModel, StageNode } from '../model/types'

/** Narrow an indexed lookup or throw with a descriptive test failure. */
export function req<T>(value: T | undefined | null, message = 'expected a value'): T {
  if (value === undefined || value === null) throw new Error(message)
  return value
}

/** Depth-first list of every stage node, structural children included. */
export function allStages(stages: readonly StageNode[]): StageNode[] {
  const nodes: StageNode[] = []
  const visit = (list: readonly StageNode[]): void => {
    for (const node of list) {
      nodes.push(node)
      visit(node.parallelBranches ?? [])
      visit(node.sequentialChildren ?? [])
    }
  }
  visit(stages)
  return nodes
}

/** Every stage id in the model, depth first. */
export function allIds(model: PipelineModel): string[] {
  return allStages(model.rootStages).map((node) => node.id)
}

/** Top-level stage names in order. */
export function rootNames(model: PipelineModel): string[] {
  return model.rootStages.map((node) => node.name)
}
