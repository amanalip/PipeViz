import { describe, expect, it } from 'vitest'

import mockCorpus from '../../jenkins_pipelines_mock.md?raw'
import { parseJenkinsfile } from '../parser'
import { computeLayout, groupHeaderWidth, NODE_H, NODE_W } from './computeLayout'
import type { LayoutResult, ParallelBox, PositionedStage } from './computeLayout'
import type { PipelineModel, StageNode } from '../model/types'

const pipelines = [
  ...mockCorpus.matchAll(/### ([^\n]+)\n\n\x60{3}groovy\n([\s\S]*?)\x60{3}/g),
].map((match) => ({ title: match[1] as string, source: (match[2] as string).trim() }))

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

function nodeRect(node: PositionedStage): Rect {
  return { left: node.x, top: node.y, right: node.x + NODE_W, bottom: node.y + NODE_H }
}

function boxRect(box: ParallelBox): Rect {
  return { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height }
}

function overlaps(first: Rect, second: Rect): boolean {
  return (
    Math.min(first.right, second.right) > Math.max(first.left, second.left) &&
    Math.min(first.bottom, second.bottom) > Math.max(first.top, second.top)
  )
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.left >= outer.left &&
    inner.right <= outer.right &&
    inner.top >= outer.top &&
    inner.bottom <= outer.bottom
  )
}

function expectSoundGeometry(result: LayoutResult, title: string): void {
  for (const box of result.containers) {
    expect(
      box.width,
      `${title}: ${box.id} is too narrow for its complete expanded header`,
    ).toBeGreaterThanOrEqual(groupHeaderWidth(box.stage, box.kind, box.itemCount))
  }

  for (let first = 0; first < result.nodes.length; first += 1) {
    for (let second = first + 1; second < result.nodes.length; second += 1) {
      const a = result.nodes[first] as PositionedStage
      const b = result.nodes[second] as PositionedStage
      expect(overlaps(nodeRect(a), nodeRect(b)), `${title}: ${a.id} overlaps ${b.id}`).toBe(false)
    }
  }

  for (let first = 0; first < result.containers.length; first += 1) {
    for (let second = first + 1; second < result.containers.length; second += 1) {
      const a = result.containers[first] as ParallelBox
      const b = result.containers[second] as ParallelBox
      const aRect = boxRect(a)
      const bRect = boxRect(b)
      expect(
        !overlaps(aRect, bRect) || contains(aRect, bRect) || contains(bRect, aRect),
        `${title}: containers ${a.id} and ${b.id} overlap partially`,
      ).toBe(true)
    }
  }

  for (const node of result.nodes) {
    const card = nodeRect(node)
    expect(card.left, `${title}: ${node.id} starts outside the canvas`).toBeGreaterThanOrEqual(0)
    expect(card.top, `${title}: ${node.id} starts outside the canvas`).toBeGreaterThanOrEqual(0)
    expect(card.right, `${title}: ${node.id} exceeds canvas width`).toBeLessThanOrEqual(
      result.width,
    )
    expect(card.bottom, `${title}: ${node.id} exceeds canvas height`).toBeLessThanOrEqual(
      result.height,
    )

    for (const box of result.containers) {
      const container = boxRect(box)
      if (overlaps(card, container)) {
        expect(contains(container, card), `${title}: ${node.id} clips container ${box.id}`).toBe(
          true,
        )
      }
    }
  }
}

function collectSequentialIds(stages: readonly StageNode[], sink: Set<string>): void {
  for (const stage of stages) {
    if (stage.sequentialChildren?.length) sink.add(stage.id)
    collectSequentialIds(stage.parallelBranches ?? [], sink)
    collectSequentialIds(stage.sequentialChildren ?? [], sink)
    collectSequentialIds(stage.matrixCellStages ?? [], sink)
  }
}

/** Expand recursively, including layout-time matrix lane clones. */
function fullyExpandedLayout(model: PipelineModel, expandMatrix: boolean): LayoutResult {
  const ids = new Set<string>()
  collectSequentialIds(model.rootStages, ids)
  let result = computeLayout(model, { expandMatrix, expandedSequentialIds: ids })
  for (let depth = 0; depth < 12; depth += 1) {
    const before = ids.size
    for (const stage of result.nodes) {
      if (stage.sequentialChildren?.length) ids.add(stage.id)
    }
    if (ids.size === before) return result
    result = computeLayout(model, { expandMatrix, expandedSequentialIds: ids })
  }
  return result
}

describe('layout geometry across the 68-file UX corpus', () => {
  it('keeps the documented corpus at 68 independent pipelines', () => {
    expect(pipelines).toHaveLength(68)
  })

  for (const pipeline of pipelines) {
    it(`${pipeline.title}: every structural view has sound geometry`, () => {
      const model = parseJenkinsfile(pipeline.source)
      expectSoundGeometry(
        computeLayout(model, { expandedSequentialIds: new Set() }),
        `${pipeline.title} compact`,
      )
      expectSoundGeometry(
        fullyExpandedLayout(model, false),
        `${pipeline.title} sequential expanded`,
      )
      expectSoundGeometry(
        fullyExpandedLayout(model, true),
        `${pipeline.title} matrix and sequential expanded`,
      )
    })
  }
})
