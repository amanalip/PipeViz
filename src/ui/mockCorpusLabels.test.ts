import { describe, expect, it } from 'vitest'

import mockCorpus from '../../jenkins_pipelines_mock.md?raw'
import { stageBadgeRow } from '../graph/stageBadges'
import type { StageNode } from '../model/types'
import { parseJenkinsfile } from '../parser'
import { buildContainerSections, buildDetailSections } from './detailsSections'
import { buildPipelineMetadataSections, pipelineMetadataBadges } from './pipelineMetadata'

const pipelines = [
  ...mockCorpus.matchAll(/### ([^\n]+)\n\n\x60{3}groovy\n([\s\S]*?)\x60{3}/g),
].map((match) => ({ title: match[1] as string, source: (match[2] as string).trim() }))

function allStages(stages: readonly StageNode[]): StageNode[] {
  return stages.flatMap((stage) => [
    stage,
    ...allStages(stage.parallelBranches ?? []),
    ...allStages(stage.sequentialChildren ?? []),
    ...allStages(stage.matrixCellStages ?? []),
  ])
}

describe('labels across the 60-file UX corpus', () => {
  it('keeps the documented corpus at 60 independent pipelines', () => {
    expect(pipelines).toHaveLength(60)
  })

  for (const pipeline of pipelines) {
    it(`${pipeline.title}: emits honest non-empty labels`, () => {
      const model = parseJenkinsfile(pipeline.source)
      const labels = allStages(model.rootStages).map(stageBadgeRow)
      for (const label of labels) {
        expect(label).not.toMatch(/\b0 steps?\b/)
        expect(label.trim()).not.toBe('')
      }
      for (const badge of pipelineMetadataBadges(model)) {
        expect(badge.label).not.toMatch(/×0\b/)
        expect(badge.title.trim()).not.toBe('')
      }
      const toastSections = [
        ...buildPipelineMetadataSections(model),
        ...allStages(model.rootStages).flatMap((stage) => [
          ...buildDetailSections(stage, model.postHandlers, model),
          ...buildContainerSections(stage),
        ]),
      ]
      for (const section of toastSections) {
        expect(section.title.trim()).not.toBe('')
        expect(section.lines.length).toBeGreaterThan(0)
        expect(section.lines.every((line) => line.trim().length > 0)).toBe(true)
      }
    })
  }

  it('distinguishes inherited pipeline agent from stage overrides', () => {
    const model = parseJenkinsfile(pipelines[5]?.source ?? '')
    expect(pipelineMetadataBadges(model)[0]?.label).toBe('AGENT · linux')
    expect(model.rootStages.map(stageBadgeRow)).toEqual([
      '1 step',
      '1 step · AGENT: windows',
      '1 step · AGENT: Dockerfile',
    ])
  })
})
