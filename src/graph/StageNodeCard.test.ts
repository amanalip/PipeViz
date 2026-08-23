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
    expect(stageBadgeRow(stage())).toBe('No steps')
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

  it('describes structural and empty cards without misleading zero counts', () => {
    expect(
      stageBadgeRow(
        stage({
          name: 'Quality',
          sequentialChildren: [stage({ id: 's0/sq0', name: 'Lint' })],
        }),
      ),
    ).toBe('1 nested stage · SEQ')
    expect(
      stageBadgeRow(
        stage({
          matrixAxes: ['OS'],
          matrixAxisValues: [['linux']],
          matrixExcludes: [{ OS: ['linux'] }],
        }),
      ),
    ).toBe('No runnable cells · MATRIX')
  })

  it('labels stage-scoped metadata without implying pipeline inheritance', () => {
    expect(
      stageBadgeRow(
        stage({
          steps: [{ name: 'sh', kind: 'known', line: 2 }],
          agent: "label 'windows'",
          environmentEntries: [{ key: 'MODE', value: "'ci'", line: 3 }],
          tools: [{ type: 'jdk', name: "'temurin-21'", line: 4 }],
          options: [{ name: 'timeout', args: "time: 5, unit: 'MINUTES'", line: 5 }],
        }),
      ),
    ).toBe('1 step · AGENT: windows · ENV ×1 · TOOLS ×1 · OPT ×1')
  })
})
