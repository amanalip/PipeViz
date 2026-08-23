import { useEffect, useRef } from 'react'

import type { PipelineModel } from '../model/types'
import { buildPipelineMetadataSections } from './pipelineMetadata'

interface PipelineDetailsPanelProps {
  model: PipelineModel
  onClose: () => void
}

export function PipelineDetailsPanel({ model, onClose }: PipelineDetailsPanelProps) {
  const panelRef = useRef<HTMLElement>(null)
  const sections = buildPipelineMetadataSections(model)

  useEffect(() => {
    const previousFocus = document.activeElement
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <aside
      ref={panelRef}
      className="details-panel pipeline-details-panel"
      role="dialog"
      aria-labelledby="pipeline-details-title"
      aria-describedby="pipeline-details-summary"
      tabIndex={-1}
    >
      <header className="details-head">
        <div className="details-heading">
          <h2 id="pipeline-details-title" className="details-title">PIPELINE METADATA</h2>
          <p id="pipeline-details-summary" className="details-subline">Inherited by stages unless they declare an override</p>
        </div>
        <button type="button" className="details-close" onClick={onClose} aria-label="Close pipeline metadata">
          ✕
        </button>
      </header>
      {sections.map((section) => (
        <section key={section.title} className="details-section">
          <h3 className="details-section-title">{section.title}</h3>
          <div className="details-lines">
            {section.lines.map((line, index) => (
              <p key={index} className={section.bullet ? 'detail-line bulleted' : 'detail-line'}>
                {section.bullet && <span className="detail-bullet" aria-hidden="true">▸</span>}
                <code>{line}</code>
              </p>
            ))}
          </div>
        </section>
      ))}
    </aside>
  )
}
