// ---------------------------------------------------------------------------
// ui/DiagnosticsBar.tsx - the bottom bar and its four states (mockups §14).
//
//   healthy  ● Ready · declarative · 4 stages · 11 steps
//   busy     ◐ Parsing… · 3 stages so far
//   warn     ▲ N warnings · click to expand
//   error    ⚠ N errors · M warnings   [expanded row list]
//
// Expansion rules (§11/§14): rows list severity icon, line number, severity
// word, message; clicking a row asks App to jump the editor caret and flash
// the related card. New problems auto-expand; fixing every problem collapses
// back to the one-line summary. The expanded choice persists during the
// session because this component never unmounts.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { Diagnostic, ModelKind } from '../model/types'

/** Deployed build marker; helps issue reports (mockup §15). */
const APP_VERSION = 'v0.1.0'

interface DiagnosticsBarProps {
  /** True between keystroke and debounce settle - the busy state. */
  parsing: boolean
  /** Parser mode of the settled model; only shown once stages render. */
  kind: ModelKind
  /** Rendered stage cards (status counts, matching M3 semantics). */
  stagesRendered: number
  /** Steps summed across rendered cards. */
  stepsCount: number
  /** Diagnostics from the settled parse, source order preserved. */
  diagnostics: readonly Diagnostic[]
  /** Selected stage name for the status echo (§9), null when none. */
  selectionName: string | null
  /** Partial-graph line when errors suggest missing stages, else null. */
  partialNote: string | null
  onSelectDiagnostic: (diagnostic: Diagnostic) => void
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function DiagnosticsBar({
  parsing,
  kind,
  stagesRendered,
  stepsCount,
  diagnostics,
  selectionName,
  partialNote,
  onSelectDiagnostic,
}: DiagnosticsBarProps) {
  const errors = diagnostics.filter((d) => d.severity === 'error').length
  const warnings = diagnostics.length - errors

  const [expanded, setExpanded] = useState(false)
  const previousProblems = useRef(errors + warnings)

  // Auto-reveal on new problems, auto-collapse on a clean bill (§11: fixing
  // the last error returns the bar to one line). Manual toggles in between
  // are respected until the next zero/nonzero transition.
  useEffect(() => {
    const before = previousProblems.current
    previousProblems.current = errors + warnings
    if (errors + warnings === 0) setExpanded(false)
    else if (before === 0) setExpanded(true)
  }, [errors, warnings])

  let left: ReactNode
  if (parsing) {
    left = (
      <>
        <span className="status-glyph-busy" aria-hidden="true">
          ◐
        </span>
        Parsing…
        {stagesRendered > 0 && <> · {plural(stagesRendered, 'stage')} so far</>}
      </>
    )
  } else if (errors > 0 || warnings > 0) {
    left = (
      <button
        type="button"
        className="status-tally"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
      >
        <span className={`diag-icon ${errors > 0 ? 'error' : 'warning'}`} aria-hidden="true">
          {errors > 0 ? '⚠' : '▲'}
        </span>
        {errors > 0 && plural(errors, 'error')}
        {errors > 0 && warnings > 0 && ' · '}
        {warnings > 0 && plural(warnings, 'warning')}
        {expanded ? ' · click a row to jump' : ' · click to expand'}
      </button>
    )
  } else {
    left = (
      <>
        <span className="status-dot" aria-hidden="true" />
        Ready
        {stagesRendered > 0 && (
          <>
            {' · '}
            {kind}
            {' · '}
            {plural(stagesRendered, 'stage')}
            {' · '}
            {plural(stepsCount, 'step')}
          </>
        )}
        {selectionName && <> · selection: {selectionName}</>}
      </>
    )
  }

  return (
    <footer className={expanded && !parsing ? 'status-bar diag-expanded' : 'status-bar'}>
      <div className="status-row">
        <span className="status-item">{left}</span>
        <span className={partialNote ? 'status-note status-partial' : 'status-note'}>
          {partialNote ?? 'No backend: your code stays in this tab'}
        </span>
        <span className="status-version">{APP_VERSION}</span>
      </div>
      {expanded && !parsing && diagnostics.length > 0 && (
        <ul className="diag-list">
          {diagnostics.map((diagnostic, index) => (
            <li key={index}>
              <button
                type="button"
                className={`diag-row sev-${diagnostic.severity}`}
                onClick={() => onSelectDiagnostic(diagnostic)}
                title={`Jump to line ${diagnostic.line}`}
              >
                <span className={`diag-icon ${diagnostic.severity}`} aria-hidden="true">
                  {diagnostic.severity === 'error' ? '✕' : '▲'}
                </span>
                <span className="diag-line">{diagnostic.line}</span>
                <span className="diag-severity">{diagnostic.severity}</span>
                <span className="diag-message">{diagnostic.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </footer>
  )
}
