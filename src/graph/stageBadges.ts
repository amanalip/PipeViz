import { MATRIX_CELL_LIMIT, matrixCombinationCount } from '../layout/matrixCombos'
import type { StageNode } from '../model/types'

/** Describe the main content represented by one compact card. */
export function stagePrimaryLabel(stage: StageNode): string {
  if (stage.matrixAxes && stage.matrixAxes.length > 0) {
    const count = matrixCombinationCount(stage, MATRIX_CELL_LIMIT + 1)
    if (count === 0) return 'No runnable cells'
    return count > MATRIX_CELL_LIMIT
      ? `${MATRIX_CELL_LIMIT}+ cells`
      : `${count} ${count === 1 ? 'cell' : 'cells'}`
  }

  const nestedCount = stage.sequentialChildren?.length ?? 0
  if (nestedCount > 0) {
    return `${nestedCount} nested ${nestedCount === 1 ? 'stage' : 'stages'}`
  }

  const count = stage.steps.length
  return count === 0 ? 'No steps' : `${count} ${count === 1 ? 'step' : 'steps'}`
}

/** Build the compact summary displayed below a stage card's title. */
export function stageBadgeRow(stage: StageNode): string {
  const badges = [stagePrimaryLabel(stage)]
  if (stage.when && stage.when.length > 0) badges.push('WHEN')
  if (stage.parallelBranches && stage.parallelBranches.length > 0) {
    badges.push(`PAR ×${stage.parallelBranches.length}`)
  }
  if (stage.matrixAxes && stage.matrixAxes.length > 0) badges.push('MATRIX')
  // Compact matrix cards carry the group's failFast here. Expanded matrices
  // show it on their container header instead.
  if (stage.failFast) badges.push('failFast')
  if (stage.sequentialChildren && stage.sequentialChildren.length > 0) badges.push('SEQ')
  if (stage.hasInput) badges.push('IN')
  return badges.join(' · ')
}
