// ---------------------------------------------------------------------------
// ui/DetailsPanel.tsx - the selected-stage inspector (mockups §9).
//
// Floats over the canvas, right-aligned: 320px, --surface-strong, radius-md,
// shadow-card. Content comes from buildDetailSections (STEPS / WHEN / AGENT /
// stage-scoped POST) for normal cards, or buildContainerSections (BRANCHES /
// AXES / EXCLUDES / CELLS) for selected parallel/matrix group nodes; empty
// sections never render. Escape or the ✕ closes; clicking empty canvas
// closes too because selection clearing in App drops this panel's data.
// ---------------------------------------------------------------------------

import { useEffect } from 'react'

import { categorize } from '../graph/categories'
import type { PositionedStage } from '../layout/computeLayout'
import type { PostHandler, StageNode } from '../model/types'
import { buildContainerSections, buildDetailSections } from './detailsSections'

interface DetailsPanelProps {
  /** The selected card's full model data (layout keeps model fields). */
  stage?: PositionedStage
  /** The selected container's model stage (parallel/matrix group nodes). */
  container?: StageNode
  /** All post handlers; the panel filters to this stage's own. */
  postHandlers: readonly PostHandler[]
  onClose: () => void
}

export function DetailsPanel({ stage, container, postHandlers, onClose }: DetailsPanelProps) {
  // Escape closes (mockup §9); listener lives only while the panel does.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Exactly one of the two is provided; containers get a shape inspector
  // instead of the step-oriented card view.
  const heading = stage ? `STAGE · ${stage.name}` : `CONTAINER · ${container?.name ?? ''}`
  const subline = stage
    ? `line ${stage.line} · category ${categorize(stage.name)}`
    : `line ${container?.line ?? 0} · ${container?.matrixAxes ? 'matrix' : 'parallel'} group`
  const sections = stage
    ? buildDetailSections(stage, postHandlers)
    : buildContainerSections(container as StageNode)

  return (
    <aside className="details-panel" role="dialog" aria-label={`Stage details: ${heading}`}>
      <header className="details-head">
        <div className="details-heading">
          <h2 className="details-title">{heading}</h2>
          <p className="details-subline">{subline}</p>
        </div>
        <button type="button" className="details-close" onClick={onClose} aria-label="Close details panel">
          ✕
        </button>
      </header>
      {sections.map((section) => (
        <section key={section.title} className="details-section">
          <h3 className="details-section-title">{section.title}</h3>
          <div className="details-lines">
            {section.lines.map((line, index) => (
              <p key={index} className={section.bullet ? 'detail-line bulleted' : 'detail-line'}>
                {section.bullet && (
                  <span className="detail-bullet" aria-hidden="true">
                    ▸
                  </span>
                )}
                <code>{line}</code>
              </p>
            ))}
          </div>
        </section>
      ))}
    </aside>
  )
}
