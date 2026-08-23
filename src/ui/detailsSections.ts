// ---------------------------------------------------------------------------
// ui/detailsSections.ts - selected stage -> ordered detail-panel content.
//
// Pure data shaping for DetailsPanel (mockups §9): identical inputs yield
// identical sections, so the panel stays a dumb renderer and this module
// carries the display rules in unit tests rather than JSX.
//
// Field rules straight from the mockup table:
//   STEPS  - every step as `name rawArgs`, count in the title
//   WHEN   - raw condition text, verbatim, never interpreted
//   AGENT  - stage-level override, single line
//   POST   - one section per handler scoped to THIS stage, `POST · condition`
//
// Pipeline-level post handlers (no `stage` tag) are deliberately omitted:
// the mockup scopes them to "root", and v1 has no selectable root surface.
// They remain visible in exported JSON and in the sample-picker badges.
// ---------------------------------------------------------------------------

import type { PostHandler, StageNode, Step } from '../model/types'
import { MATRIX_CELL_LIMIT, matrixCombinationCount } from '../layout/matrixCombos'
import { stagePrimaryLabel } from '../graph/stageBadges'

/** One collapsible-looking block of the details panel. */
export interface DetailSection {
  /** Micro-caps heading, e.g. `STEPS (4)` or `POST · failure`. */
  title: string
  /** Verbatim display lines; rendered in the mono stack. */
  lines: string[]
  /** Steps/post lines get the ▸ bullet; WHEN/AGENT read as prose. */
  bullet: boolean
}

/**
 * Display form of a step: name plus its raw argument text exactly as the
 * parser captured it (quotes included), e.g. `sh 'make build'`.
 */
export function stepLabel(step: Step): string {
  return step.args ? `${step.name} ${step.args}` : step.name
}

/**
 * Build the panel sections for one stage. Sections whose content is empty
 * are dropped entirely - the mockup forbids stub rows. Handler order follows
 * the model's postHandlers list, which preserves source order.
 */
export function buildDetailSections(
  stage: StageNode,
  postHandlers: readonly PostHandler[],
): DetailSection[] {
  const sections: DetailSection[] = []

  if (stage.steps.length > 0) {
    sections.push({
      title: `STEPS (${stage.steps.length})`,
      lines: stage.steps.map(stepLabel),
      bullet: true,
    })
  }

  if (stage.when && stage.when.length > 0) {
    sections.push({ title: 'WHEN', lines: [...stage.when], bullet: false })
  }

  if (stage.agent) {
    sections.push({ title: 'AGENT', lines: [stage.agent], bullet: false })
  }

  for (const handler of postHandlers) {
    // Match by stable id when the parser recorded one (two stages may share
    // a display name). Matrix clones retain their parser id as originId.
    // Fall back to the name for older exported models.
    const ownerId = stage.originId ?? stage.id
    const owned =
      handler.stageId !== undefined ? handler.stageId === ownerId : handler.stage === stage.name
    if (!owned || handler.steps.length === 0) continue
    sections.push({
      title: `POST · ${handler.condition}`,
      lines: handler.steps.map(stepLabel),
      bullet: true,
    })
  }

  return sections
}

/**
 * Panel sections for a selected parallel/matrix container (mockups §7/§10).
 * Containers carry no steps of their own; the inspector explains the shape
 * - branch lanes, axis values, excludes, and the surviving cell count -
 * instead of leaving selection as a dead ring.
 */
export function buildContainerSections(stage: StageNode): DetailSection[] {
  const sections: DetailSection[] = []

  if (stage.parallelBranches && stage.parallelBranches.length > 0) {
    sections.push({
      title: `BRANCHES (${stage.parallelBranches.length})`,
      lines: stage.parallelBranches.map(
        (branch) => `${branch.name} · ${stagePrimaryLabel(branch)}`,
      ),
      bullet: true,
    })
  }

  if (stage.matrixAxes && stage.matrixAxes.length > 0) {
    const values = stage.matrixAxisValues ?? []
    const notValues = stage.matrixAxisNotValues ?? []
    sections.push({
      title: 'AXES',
      lines: stage.matrixAxes.map((name, index) => {
        const allowedValues = values[index] ?? []
        const allowed = allowedValues.length > 0 ? allowedValues.join(', ') : '(no values)'
        const forbidden = notValues[index] ?? []
        return forbidden.length > 0
          ? `${name}: ${allowed} (not: ${forbidden.join(', ')})`
          : `${name}: ${allowed}`
      }),
      bullet: true,
    })

    if (stage.matrixExcludes && stage.matrixExcludes.length > 0) {
      sections.push({
        title: `EXCLUDES (${stage.matrixExcludes.length})`,
        lines: stage.matrixExcludes.map((rule) =>
          Object.entries(rule)
            .map(([axis, forbidden]) => `${axis} ∉ {${forbidden.join(', ')}}`)
            .join(' AND '),
        ),
        bullet: true,
      })
    }

    // Counting stops just past the expansion ceiling, so monster products
    // answer instantly and are reported as "1000+" instead of freezing.
    const combos = matrixCombinationCount(stage, MATRIX_CELL_LIMIT + 1)
    const comboLabel =
      combos === 0
        ? 'No runnable combinations'
        : combos > MATRIX_CELL_LIMIT
          ? `${MATRIX_CELL_LIMIT}+ combinations`
          : `${combos} ${combos === 1 ? 'combination' : 'combinations'}`
    const cellSteps = stage.matrixCellSteps?.length ?? 0
    sections.push({
      title: 'CELLS',
      lines: [
        combos === 0 || cellSteps === 0
          ? comboLabel
          : `${comboLabel} × ${cellSteps} shared ${cellSteps === 1 ? 'step' : 'steps'}`,
      ],
      bullet: false,
    })
  }

  // failFast is a property of the group stage itself, parallel or matrix
  // alike, so it reports outside the shape-specific blocks above.
  if (stage.failFast) {
    sections.push({ title: 'FAIL FAST', lines: ['true'], bullet: false })
  }

  return sections
}
