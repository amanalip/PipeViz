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

import { useEffect, useRef } from 'react'

import { categorize } from '../graph/categories'
import { stagePrimaryLabel } from '../graph/stageBadges'
import type { PositionedStage } from '../layout/computeLayout'
import type { PipelineModel, PostHandler, StageNode } from '../model/types'
import { buildContainerSections, buildDetailSections } from './detailsSections'

interface DetailsPanelProps {
  /** The selected card's full model data (layout keeps model fields). */
  stage?: PositionedStage
  /** The selected container's model stage (parallel/matrix group nodes). */
  container?: StageNode
  /** All post handlers; the panel filters to this stage's own. */
  postHandlers: readonly PostHandler[]
  pipeline: PipelineModel
  onClose: () => void
  /**
   * Jump the editor caret to this item's source line (§17). The panel
   * button is the keyboard-reachable path - double-click-to-jump alone was
   * mouse-only, which locked keyboard users out of the feature entirely.
   */
  onJumpToSource?: (line: number) => void
}

export function DetailsPanel({ stage, container, postHandlers, pipeline, onClose, onJumpToSource }: DetailsPanelProps) {
  const panelRef = useRef<HTMLElement>(null)

  // Move focus into the dialog when it appears and return it to the stage
  // card when it closes. Without this, keyboard and screen-reader users can
  // select a card without ever discovering that an inspector opened.
  useEffect(() => {
    const previousFocus = document.activeElement
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [])

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
  const containerSummary = container?.matrixAxes
    ? stagePrimaryLabel(container)
    : `${container?.parallelBranches?.length ?? 0} ${container?.parallelBranches?.length === 1 ? 'branch' : 'branches'}`
  const subline = stage
    ? `lines ${stage.line}-${stage.endLine ?? stage.line} · ${categorize(stage.name)} · ${stagePrimaryLabel(stage)}`
    : `lines ${container?.line ?? 0}-${container?.endLine ?? container?.line ?? 0} · ${container?.matrixAxes ? 'matrix' : 'parallel'} group · ${containerSummary}`
  const sections = stage
    ? buildDetailSections(stage, postHandlers, pipeline)
    : [
        ...buildContainerSections(container as StageNode),
        ...buildDetailSections(container as StageNode, postHandlers, pipeline),
      ]
  const sourceLine = stage?.line ?? container?.line

  return (
    <aside
      ref={panelRef}
      className="details-panel"
      role="dialog"
      aria-labelledby="stage-details-title"
      aria-describedby="stage-details-summary"
      tabIndex={-1}
    >
      <header className="details-head">
        <div className="details-heading">
          <h2 id="stage-details-title" className="details-title">{heading}</h2>
          <p id="stage-details-summary" className="details-subline">{subline}</p>
        </div>
        <div className="details-head-actions">
          {onJumpToSource && sourceLine !== undefined && (
            <button
              type="button"
              className="btn details-jump"
              onClick={() => onJumpToSource(sourceLine)}
              title="Move the editor caret to this stage's source line"
            >
              Jump to source
            </button>
          )}
          <button type="button" className="details-close" onClick={onClose} aria-label="Close details panel">
            ✕
          </button>
        </div>
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
