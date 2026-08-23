import { describe, expect, it } from 'vitest'

import type { StageNode } from '../model/types'
import { pipelineStats } from './pipelineStats'

function stage(overrides: Partial<StageNode> = {}): StageNode {
  return { id: 's0', name: 'Stage', line: 1, steps: [], ...overrides }
}

const step = { name: 'sh', kind: 'known' as const, line: 2 }

describe('pipelineStats', () => {
  it('counts ordinary and nested compact cards', () => {
    expect(
      pipelineStats([
        stage({
          steps: [step],
          sequentialChildren: [stage({ id: 's0/sq0', steps: [step, step] })],
        }),
      ]),
    ).toMatchObject({ stages: 2, steps: 3, hasMatrix: false })
  })

  it('reports matrix cells and shared steps without multiplying declarations', () => {
    expect(
      pipelineStats([
        stage({
          matrixAxes: ['OS', 'NODE'],
          matrixAxisValues: [
            ['linux', 'windows'],
            ['20', '22', '24'],
          ],
          matrixCellSteps: [step, step],
        }),
      ]),
    ).toEqual({
      stages: 1,
      steps: 0,
      hasMatrix: true,
      matrixCells: 6,
      matrixCellsOverLimit: false,
      sharedMatrixSteps: 2,
    })
  })

  it('keeps an empty matrix visible in the summary', () => {
    expect(
      pipelineStats([stage({ matrixAxes: ['OS'], matrixAxisValues: [[]] })]),
    ).toMatchObject({ stages: 1, hasMatrix: true, matrixCells: 0 })
  })

  it('counts parallel lanes rather than the cardless owner', () => {
    expect(
      pipelineStats([
        stage({
          parallelBranches: [
            stage({ id: 's0/p0', steps: [step] }),
            stage({ id: 's0/p1', steps: [step] }),
          ],
        }),
      ]),
    ).toMatchObject({ stages: 2, steps: 2 })
  })
})
