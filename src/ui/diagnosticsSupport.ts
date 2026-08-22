// ---------------------------------------------------------------------------
// ui/diagnosticsSupport.ts - honest numbers for the diagnostics bar.
//
// Mockup §15's error variant promises a "Partial graph: N of M stages
// rendered" line. The parser cannot know how many stages broken source
// *should* contain, so M is approximated by counting `stage(` call sites in
// the raw source - an upper bound that over-counts only when users comment
// out stage calls, never under-counts. The note renders only when the bound
// exceeds what actually rendered; otherwise the privacy note stays put.
// ---------------------------------------------------------------------------

/** Matches declarative and scripted stage call sites: `stage('Build') {`. */
const STAGE_CALL = /\bstage\s*\(/g

/**
 * Count candidate stage call sites in raw source text. Deliberately dumb:
 * it sees strings and comments too, which keeps it a safe upper bound.
 */
export function candidateStageCount(source: string): number {
  return [...source.matchAll(STAGE_CALL)].length
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
