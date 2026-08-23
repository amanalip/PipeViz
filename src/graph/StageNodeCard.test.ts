import { describe, expect, it } from 'vitest'

import type { StageNode } from '../model/types'
import { stageBadgeRow } from './stageBadges'

function stage(overrides: Partial<StageNode> = {}): StageNode {
  return {
    id: 's0',
    name: 'Test',
    line: 1,
    steps: [],
    ...overrides,
  }
}

describe('stageBadgeRow', () => {
  it('shows direct step counts for regular stages', () => {
    expect(stageBadgeRow(stage())).toBe('0 steps')
    expect(
      stageBadgeRow(
        stage({ steps: [{ name: 'echo', args: "'hello'", kind: 'known', line: 2 }] }),
      ),
    ).toBe('1 step')
  })

  it('shows matrix cell counts instead of misleading direct step counts', () => {
    expect(
      stageBadgeRow(
        stage({
          matrixAxes: ['OS', 'NODE_VERSION'],
          matrixAxisValues: [
            ['ubuntu-latest', 'windows-latest'],
            ['18', '20', '22'],
          ],
        }),
      ),
    ).toBe('6 cells · MATRIX')
  })

  it('uses the surviving matrix cell count after exclusions', () => {
    expect(
      stageBadgeRow(
        stage({
          matrixAxes: ['OS'],
          matrixAxisValues: [['linux', 'windows']],
          matrixExcludes: [{ OS: ['windows'] }],
        }),
      ),
    ).toBe('1 cell · MATRIX')
  })
})
