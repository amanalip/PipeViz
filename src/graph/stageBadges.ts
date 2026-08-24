import { MATRIX_CELL_LIMIT, matrixCombinationCount } from '../layout/matrixCombos'
import type { MetadataFact, StageNode } from '../model/types'

/** Shared compact form used by stage, group, and pipeline badge surfaces. */
export function metadataFactLabel(fact: MetadataFact): string {
  return fact.value ? `${fact.label}: ${fact.value}` : fact.label
}

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

/** Compact agent value for cards and summary chips, with full text in titles. */
export function agentShortLabel(agent: string): string {
  const label = agent.match(/^label\s+(['"])(.*?)\1/)
  if (label?.[2]) return label[2]
  if (/^dockerfile\b/i.test(agent)) return 'Dockerfile'
  if (/^docker\b/i.test(agent)) return 'Docker'
  if (/^kubernetes\b/i.test(agent)) return 'Kubernetes'
  return agent
}

/** Metadata declared on this exact stage, excluding inherited pipeline scope. */
export function stageMetadataBadges(stage: StageNode): string[] {
  const badges: string[] = []
  if (stage.agent) badges.push(`AGENT: ${agentShortLabel(stage.agent)}`)
  if (stage.environmentEntries?.length) badges.push(`ENV ×${stage.environmentEntries.length}`)
  if (stage.tools?.length) badges.push(`TOOLS ×${stage.tools.length}`)
  if (stage.options?.length) badges.push(`OPT ×${stage.options.length}`)
  if (stage.hasInput) badges.push('IN')
  for (const fact of stage.metadata ?? []) {
    if (fact.visibility !== 'details') badges.push(metadataFactLabel(fact))
  }
  return badges
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
  badges.push(...stageMetadataBadges(stage))
  return badges.join(' · ')
}
