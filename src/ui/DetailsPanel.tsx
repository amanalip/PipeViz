// ---------------------------------------------------------------------------
// ui/DetailsPanel.tsx - the selected-stage inspector (mockups §9).
//
// Floats over the canvas, right-aligned: 320px, --surface-strong, radius-md,
// shadow-card. Content comes from buildDetailSections (STEPS / WHEN / AGENT /
// stage-scoped POST); empty sections never render. Escape or the ✕ closes;
// clicking empty canvas closes too because selection clearing in App drops
// this panel's data.
// ---------------------------------------------------------------------------

import { useEffect } from 'react'

import { categorize } from '../graph/categories'
import type { PositionedStage } from '../layout/computeLayout'
import type { PostHandler } from '../model/types'
import { buildDetailSections } from './detailsSections'

interface DetailsPanelProps {
  /** The selected card's full model data (layout keeps model fields). */
  stage: PositionedStage
  /** All post handlers; the panel filters to this stage's own. */
  postHandlers: readonly PostHandler[]
  onClose: () => void
}

export function DetailsPanel({ stage, postHandlers, onClose }: DetailsPanelProps) {
  // Escape closes (mockup §9); listener lives only while the panel does.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const category = categorize(stage.name)
  const sections = buildDetailSections(stage, postHandlers)

  return (
    <aside className="details-panel" role="dialog" aria-label={`Stage details: ${stage.name}`}>
      <header className="details-head">
        <div className="details-heading">
          <h2 className="details-title">STAGE · {stage.name}</h2>
          <p className="details-subline">
            line {stage.line} · category {category}
          </p>
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
