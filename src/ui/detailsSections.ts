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
    if (handler.stage !== stage.name || handler.steps.length === 0) continue
    sections.push({
      title: `POST · ${handler.condition}`,
      lines: handler.steps.map(stepLabel),
      bullet: true,
    })
  }

  return sections
}
