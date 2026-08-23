// ---------------------------------------------------------------------------
// ui/diagnosticsSupport.ts - honest numbers for the diagnostics bar.
//
// Mockup §15's error variant promises a "Partial graph: N of M stages
// rendered" line. The parser cannot know how many stages broken source
// *should* contain, so M is approximated by counting `stage(` call tokens
// through the real tokenizer - the same lexer the parser itself runs, so
// commented-out or quoted occurrences never inflate the bound (they used
// to: a raw regex counted those too and cried wolf).
// ---------------------------------------------------------------------------

import { tokenize } from '../parser/tokenize'
import type { PositionedStage } from '../layout/computeLayout'

/**
 * Count `stage(…)` call sites in raw source text via the tokenizer, so
 * comments and string literals are invisible to the count exactly as they
 * are to the parser.
 */
export function candidateStageCount(source: string): number {
  const tokens = tokenize(source).tokens
  let count = 0
  for (let k = 0; k < tokens.length - 1; k += 1) {
    const ident = tokens[k]
    const open = tokens[k + 1]
    if (
      ident?.type === 'ident' &&
      ident.value === 'stage' &&
      open?.type === 'punct' &&
      open.value === '('
    ) {
      count += 1
    }
  }
  return count
}

/**
 * The partial-graph status line, or null when nothing appears missing.
 * `rendered` counts every visible surface (cards + containers); the guard
 * makes "of fewer" phrasing impossible even on weird inputs.
 */
export function partialGraphNote(rendered: number, candidates: number): string | null {
  if (candidates <= rendered) return null
  return `Partial graph: ${rendered} of ${candidates} stages rendered`
}

/**
 * The stage card a diagnostic belongs to. Exact source-line matches win;
 * otherwise the diagnostic maps to the INNERMOST stage whose [line,
 * endLine] span contains it - a nested child wins over its enclosing
 * parent, so an error on body line 40 highlights the stage that opens on
 * line 32 instead of nothing (bug: only exact equality matched).
 */
export function stageForDiagnostic(
  nodes: readonly PositionedStage[],
  line: number,
): PositionedStage | null {
  const exact = nodes.find((node) => node.line === line)
  if (exact) return exact
  let innermost: PositionedStage | null = null
  for (const node of nodes) {
    if (node.line < line && (node.endLine ?? node.line) >= line) {
      if (innermost === null || node.line > innermost.line) innermost = node
    }
  }
  return innermost
}
