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

import { MATRIX_CELL_LIMIT } from '../layout/matrixCombos'
import type { Diagnostic, ModelKind } from '../model/types'

/** Deployed build marker; helps issue reports (mockup §15). Injected from
 * package.json by vite `define`, so this can never drift from the release. */
const APP_VERSION = `v${__APP_VERSION__}`

interface DiagnosticsBarProps {
  /** True between keystroke and debounce settle - the busy state. */
  parsing: boolean
  /** Parser mode of the settled model; only shown once stages render. */
  kind: ModelKind
  /** Rendered stage cards (status counts, matching M3 semantics). */
  stagesRendered: number
  /** Non-matrix step declarations represented by the compact graph. */
  stepsCount: number
  /** Whether the compact source model contains at least one matrix. */
  hasMatrix: boolean
  /** Surviving cells across matrices, capped just past the render ceiling. */
  matrixCells: number
  matrixCellsOverLimit: boolean
  /** Step declarations shared by matrix cells, counted once per source. */
  sharedMatrixSteps: number
  /** Diagnostics from the settled parse, source order preserved. */
  diagnostics: readonly Diagnostic[]
  /** Selected stage name for the status echo (§9), null when none. */
  selectionName: string | null
  /** Partial-graph line when errors suggest missing stages, else null. */
  partialNote: string | null
  /** Wall-clock cost of the last settled parse, for issue reports. */
  parseMs?: number
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
  hasMatrix,
  matrixCells,
  matrixCellsOverLimit,
  sharedMatrixSteps,
  diagnostics,
  selectionName,
  partialNote,
  parseMs,
  onSelectDiagnostic,
}: DiagnosticsBarProps) {
  const errors = diagnostics.filter((d) => d.severity === 'error').length
  const warnings = diagnostics.length - errors

  const [expanded, setExpanded] = useState(false)
  const previousProblems = useRef(errors + warnings)
  const readyMetrics: string[] = []
  if (stepsCount > 0) readyMetrics.push(plural(stepsCount, 'step'))
  if (hasMatrix) {
    readyMetrics.push(
      matrixCells === 0
        ? 'no runnable matrix cells'
        : matrixCellsOverLimit
          ? `${MATRIX_CELL_LIMIT}+ matrix cells`
          : plural(matrixCells, 'matrix cell'),
    )
  }
  if (sharedMatrixSteps > 0) {
    readyMetrics.push(
      matrixCells === 0
        ? `${sharedMatrixSteps} declared matrix ${sharedMatrixSteps === 1 ? 'step' : 'steps'}`
        : plural(sharedMatrixSteps, 'shared matrix step'),
    )
  }
  if (!hasMatrix && stepsCount === 0) readyMetrics.push('no steps')

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
        {stagesRendered > 0 && <> · {plural(stagesRendered, 'stage')} shown</>}
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
            {readyMetrics.join(' · ')}
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
        <span className="status-meta">
          <span
            className="status-version"
            title={
              parseMs !== undefined
                ? `${APP_VERSION} · last parse settled in ${parseMs} ms`
                : APP_VERSION
            }
          >
            {APP_VERSION}
          </span>
          <span aria-hidden="true">·</span>
          <a
            className="status-copyright"
            href="https://github.com/amanalip"
            target="_blank"
            rel="noreferrer"
          >
            © 2026 Aman Ali Pogaku
          </a>
        </span>
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
