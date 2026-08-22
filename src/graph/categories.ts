// ---------------------------------------------------------------------------
// graph/categories.ts - stage name -> visual category (mockups §2).
//
// The category drives the 3px stripe on the left edge of every stage card and
// the minimap dot color. Guessing is deliberately dumb and honest: keyword
// containment on the lowercased name, first match wins, neutral fallback.
// Mockup table verbatim:
//   build   #22d3ee cyan     build, compile, package
//   test    #a78bfa violet   test, spec, verify
//   deploy  #34d399 emerald  deploy, release, ship, publish
//   neutral #94a3b8 slate    anything else
// ---------------------------------------------------------------------------

export type StageCategory = 'build' | 'test' | 'deploy' | 'neutral'

/** Stripe/minimap hex per category; kept in sync with global.css tokens. */
export const CATEGORY_COLORS: Record<StageCategory, string> = {
  build: '#22d3ee',
  test: '#a78bfa',
  deploy: '#34d399',
  neutral: '#94a3b8',
}

/** Keyword table in match-priority order; a name containing any word maps. */
const KEYWORDS: readonly (readonly [StageCategory, readonly string[]])[] = [
  ['build', ['build', 'compile', 'package']],
  ['test', ['test', 'spec', 'verify']],
  ['deploy', ['deploy', 'release', 'ship', 'publish']],
]

/**
 * Guess the category of a stage from its display name. Pure and case
 * insensitive; unknown names are neutral rather than wrong.
 */
export function categorize(name: string): StageCategory {
  const haystack = name.toLowerCase()
  for (const [category, words] of KEYWORDS) {
    if (words.some((word) => haystack.includes(word))) return category
  }
  return 'neutral'
}
