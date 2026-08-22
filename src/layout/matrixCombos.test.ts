// ---------------------------------------------------------------------------
// layout/matrixCombos.test.ts - combination math behind the M6 expansion.
//
// Pure-function tests: cartesian product ordering, Jenkins exclude
// semantics, degenerate inputs, labels, and expandable detection. The
// matrix-build corpus sample (2×2 axes, one exclude) is the canonical case:
// exactly three combinations must survive, in declaration order with the
// last axis varying fastest.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'

import {
  axesLabel,
  comboLabel,
  computeMatrixCombos,
  hasExpandableMatrix,
  matrixCombinationCount,
} from './matrixCombos'
import type { StageNode } from '../model/types'

/** Minimal matrix stage carrying just the fields combos read. */
function matrixStage(overrides: Partial<StageNode> = {}): StageNode {
  return {
    id: 'm',
    name: 'Matrix',
    line: 1,
    steps: [],
    ...overrides,
  }
}

describe('computeMatrixCombos', () => {
  it('takes the cartesian product with the last axis varying fastest', () => {
    const stage = matrixStage({
      matrixAxes: ['OS', 'BROWSER'],
      matrixAxisValues: [
        ['linux', 'windows'],
        ['chrome', 'firefox'],
      ],
    })
    expect(computeMatrixCombos(stage)).toEqual([
      ['linux', 'chrome'],
      ['linux', 'firefox'],
      ['windows', 'chrome'],
      ['windows', 'firefox'],
    ])
  })

  it('drops combinations matching every axis of an exclude rule', () => {
    const stage = matrixStage({
      matrixAxes: ['OS', 'BROWSER'],
      matrixAxisValues: [
        ['linux', 'windows'],
        ['chrome', 'firefox'],
      ],
      matrixExcludes: [{ OS: ['windows'], BROWSER: ['firefox'] }],
    })
    expect(computeMatrixCombos(stage).map(comboLabel)).toEqual([
      'linux / chrome',
      'linux / firefox',
      'windows / chrome',
    ])
  })

  it('treats an exclude constraining one axis as removing all its matches', () => {
    const stage = matrixStage({
      matrixAxes: ['OS'],
      matrixAxisValues: [['linux', 'windows']],
      matrixExcludes: [{ OS: ['windows'] }],
    })
    expect(computeMatrixCombos(stage)).toEqual([['linux']])
  })

  it('ignores excludes naming unknown axes', () => {
    const stage = matrixStage({
      matrixAxes: ['OS'],
      matrixAxisValues: [['linux']],
      matrixExcludes: [{ ARCH: ['arm'] }],
    })
    expect(computeMatrixCombos(stage)).toEqual([['linux']])
  })

  it('returns empty for stages without values aligned to their axes', () => {
    expect(computeMatrixCombos(matrixStage({}))).toEqual([])
    expect(computeMatrixCombos(matrixStage({ matrixAxes: ['A'] }))).toEqual([])
    expect(
      computeMatrixCombos(
        matrixStage({ matrixAxes: ['A', 'B'], matrixAxisValues: [['a1']] }),
      ),
    ).toEqual([])
  })

  it('returns empty when any axis declares no values', () => {
    expect(
      computeMatrixCombos(
        matrixStage({ matrixAxes: ['A'], matrixAxisValues: [[]] }),
      ),
    ).toEqual([])
  })

  it('is deterministic across repeated calls', () => {
    const stage = matrixStage({
      matrixAxes: ['A'],
      matrixAxisValues: [['x', 'y']],
    })
    expect(computeMatrixCombos(stage)).toEqual(computeMatrixCombos(stage))
  })
})

describe('labels', () => {
  it('joins combo values with a slash separator for card titles', () => {
    expect(comboLabel(['linux', 'chrome'])).toBe('linux / chrome')
    expect(comboLabel(['solo'])).toBe('solo')
  })

  it('joins axis names with multiplication signs for container headers', () => {
    expect(axesLabel(matrixStage({ matrixAxes: ['OS', 'BROWSER'] }))).toBe('OS × BROWSER')
    expect(axesLabel(matrixStage())).toBe('')
  })
})

describe('matrixCombinationCount', () => {
  const EXCLUDED = matrixStage({
    matrixAxes: ['OS', 'BROWSER'],
    matrixAxisValues: [
      ['linux', 'windows'],
      ['chrome', 'firefox'],
    ],
    matrixExcludes: [{ OS: ['windows'], BROWSER: ['firefox'] }],
  })

  it('matches the materialized combination list without building it', () => {
    const cases = [
      matrixStage(),
      matrixStage({ matrixAxes: ['A'], matrixAxisValues: [['x', 'y']] }),
      EXCLUDED,
    ]
    for (const stage of cases) {
      expect(matrixCombinationCount(stage)).toBe(computeMatrixCombos(stage).length)
    }
  })

  it('stops counting once the caller\'s budget is reached', () => {
    const stage = matrixStage({
      matrixAxes: ['A', 'B', 'C'],
      matrixAxisValues: [
        Array.from({ length: 10 }, (_, i) => `a${i}`),
        Array.from({ length: 10 }, (_, i) => `b${i}`),
        Array.from({ length: 10 }, (_, i) => `c${i}`),
      ],
    })
    expect(matrixCombinationCount(stage)).toBe(1000)
    expect(matrixCombinationCount(stage, 7)).toBe(7)
  })

  it('returns zero for degenerate shapes', () => {
    expect(matrixCombinationCount(matrixStage())).toBe(0)
    expect(
      matrixCombinationCount(matrixStage({ matrixAxes: ['A'], matrixAxisValues: [[]] })),
    ).toBe(0)
  })
})

describe('hasExpandableMatrix', () => {
  it('finds matrices at the top level and through structural children', () => {
    expect(hasExpandableMatrix([])).toBe(false)
    expect(hasExpandableMatrix([{ id: 's0', name: 'Build', line: 1, steps: [] }])).toBe(false)
    expect(
      hasExpandableMatrix([
        matrixStage({
          id: 'm',
          name: 'Matrix',
          line: 1,
          steps: [],
          matrixAxes: ['A'],
          matrixAxisValues: [['x']],
        }),
      ]),
    ).toBe(true)
    expect(
      hasExpandableMatrix([
        {
          id: 'p',
          name: 'Group',
          line: 1,
          steps: [],
          parallelBranches: [
            matrixStage({
              id: 'p/m',
              name: 'Nested Matrix',
              line: 2,
              steps: [],
              matrixAxes: ['A'],
              matrixAxisValues: [['x']],
            }),
          ],
        },
      ]),
    ).toBe(true)
  })

  it('does not count matrices whose values cannot expand', () => {
    expect(
      hasExpandableMatrix([
        matrixStage({ id: 'm', name: 'Matrix', line: 1, steps: [], matrixAxes: ['A'] }),
      ]),
    ).toBe(false)
  })
})
