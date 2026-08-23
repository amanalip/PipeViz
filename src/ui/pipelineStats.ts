import { MATRIX_CELL_LIMIT, matrixCombinationCount } from '../layout/matrixCombos'
import type { StageNode } from '../model/types'

export interface PipelineStats {
  stages: number
  steps: number
  hasMatrix: boolean
  matrixCells: number
  matrixCellsOverLimit: boolean
  sharedMatrixSteps: number
}

/**
 * Summarize the source model using the compact graph's semantics. Matrix
 * expansion is a view preference, so these numbers remain stable when it is
 * toggled. Parallel owners stay containers while their visible lanes count
 * as stages, matching the compact canvas.
 */
export function pipelineStats(stages: readonly StageNode[]): PipelineStats {
  const stats: PipelineStats = {
    stages: 0,
    steps: 0,
    hasMatrix: false,
    matrixCells: 0,
    matrixCellsOverLimit: false,
    sharedMatrixSteps: 0,
  }

  const visit = (items: readonly StageNode[]) => {
    for (const stage of items) {
      if (stage.parallelBranches && stage.parallelBranches.length > 0) {
        visit(stage.parallelBranches)
        continue
      }

      stats.stages += 1
      if (stage.matrixAxes && stage.matrixAxes.length > 0) {
        stats.hasMatrix = true
        const cells = matrixCombinationCount(stage, MATRIX_CELL_LIMIT + 1)
        stats.matrixCells = Math.min(MATRIX_CELL_LIMIT + 1, stats.matrixCells + cells)
        stats.matrixCellsOverLimit = stats.matrixCells > MATRIX_CELL_LIMIT
        stats.sharedMatrixSteps += stage.matrixCellSteps?.length ?? 0
        continue
      }

      stats.steps += stage.steps.length
      if (stage.sequentialChildren && stage.sequentialChildren.length > 0) {
        visit(stage.sequentialChildren)
      }
    }
  }

  visit(stages)
  return stats
}
