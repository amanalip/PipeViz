// ---------------------------------------------------------------------------
// layout/computeLayout.test.ts - golden positions + sanity properties (plan §12).
//
// Goldens are hand-derived from the pinned constants (NODE_W 220, NODE_H 72,
// H_GAP 90, V_GAP 36) so regressions point at the exact stage that moved.
// Properties mirror plan §8's contract: no two cards overlap anywhere in the
// corpus, coordinates stay monotonic along every chain, and canvas size grows
// linearly with stage / lane counts. A synthetic nested-parallel fixture
// covers plan risk R3 (deep lanes colliding).
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import { parseJenkinsfile } from '../parser'
import { SAMPLES, sampleById } from '../samples'
import { req } from '../parser/testSupport'
import {
  computeLayout,
  CONTAINER_HEADER,
  CONTAINER_PAD_X,
  CONTAINER_PAD_Y,
  H_GAP,
  NODE_H,
  NODE_W,
  V_GAP,
} from './computeLayout'
import type { LayoutResult, PositionedStage } from './computeLayout'
import type { PipelineModel, StageNode } from '../model/types'

const modelOf = (id: string) =>
  parseJenkinsfile(req(sampleById(id), `sample ${id}`).source)

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const nodeRect = (node: PositionedStage): Rect => ({
  x: node.x,
  y: node.y,
  w: NODE_W,
  h: NODE_H,
})

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function byId(result: LayoutResult): Map<string, PositionedStage> {
  return new Map(result.nodes.map((node) => [node.id, node]))
}

/** Minimal declarative model whose roots run left-to-right in order. */
function chainModel(ids: string[]): PipelineModel {
  return {
    kind: 'declarative',
    environmentEntries: [],
    parameters: [],
    triggers: [],
    options: [],
    postHandlers: [],
    diagnostics: [],
    rootStages: ids.map((id) => ({ id, name: id.toUpperCase(), line: 1, steps: [] })),
  }
}

/** Minimal stage factory for synthetic fixtures. */
function leaf(id: string, extra: Partial<StageNode> = {}): StageNode {
  return { id, name: id, line: 1, steps: [], ...extra }
}

describe('layout - simple-ci (golden)', () => {
  const result = computeLayout(modelOf('simple-ci'))

  it('places four cards in successive columns on one row', () => {
    expect(result.containers).toEqual([])
    expect(
      result.nodes.map((n) => `${n.id}@${n.x},${n.y}`),
    ).toEqual(['s0@0,0', 's1@310,0', 's2@620,0', 's3@930,0'])
    expect(result.width).toBe(NODE_W * 4 + H_GAP * 3)
    expect(result.height).toBe(NODE_H)
  })

  it('chains every consecutive pair', () => {
    expect(result.edges.map((e) => `${e.id}:${e.kind}`)).toEqual([
      's0->s1:chain',
      's1->s2:chain',
      's2->s3:chain',
    ])
  })
})

describe('layout - parallel-tests (golden)', () => {
  const result = computeLayout(modelOf('parallel-tests'))
  const nodes = byId(result)

  it('replaces the group parent with a container holding three lanes', () => {
    expect(nodes.has('s1')).toBe(false)
    expect(result.containers.map((c) => c.id)).toEqual(['s1'])

    const box = result.containers[0]
    expect(box).toEqual({
      id: 's1',
      x: NODE_W + H_GAP,
      y: 0,
      width: CONTAINER_PAD_X * 2 + NODE_W,
      height:
        CONTAINER_HEADER +
        CONTAINER_PAD_Y +
        NODE_H * 3 +
        V_GAP * 2 +
        CONTAINER_PAD_Y,
    })
  })

  it('stacks lane cards in one shared column', () => {
    const laneX = req(result.containers[0]).x + CONTAINER_PAD_X
    expect(req(nodes.get('s1/p0'))).toMatchObject({ x: laneX, y: CONTAINER_HEADER + CONTAINER_PAD_Y })
    expect(req(nodes.get('s1/p1')).y).toBe(CONTAINER_HEADER + CONTAINER_PAD_Y + NODE_H + V_GAP)
    expect(req(nodes.get('s1/p2')).y).toBe(CONTAINER_HEADER + CONTAINER_PAD_Y + (NODE_H + V_GAP) * 2)
  })

  it('centers entry and exit cards against the container band', () => {
    const midY = (req(result.containers[0]).height - NODE_H) / 2
    expect(req(nodes.get('s0')).y).toBe(midY)
    expect(req(nodes.get('s2')).y).toBe(midY)
    expect(req(nodes.get('s2')).x).toBe(
      req(result.containers[0]).x + req(result.containers[0]).width + H_GAP,
    )
  })

  it('fans out of Build and back into Report, nothing else', () => {
    expect(result.edges.map((e) => `${e.id}:${e.kind}`)).toEqual([
      's0->s1/p0:fan-out',
      's0->s1/p1:fan-out',
      's0->s1/p2:fan-out',
      's1/p0->s2:fan-in',
      's1/p1->s2:fan-in',
      's1/p2->s2:fan-in',
    ])
  })
})

describe('layout - matrix-build', () => {
  const result = computeLayout(modelOf('matrix-build'))

  it('keeps the matrix stage a single card between its neighbors', () => {
    expect(result.containers).toEqual([])
    expect(result.nodes.map((n) => n.id)).toEqual(['s0', 's1', 's2'])
    expect(req(byId(result).get('s1')).matrixAxes).toEqual(['OS', 'BROWSER'])
    expect(result.edges.every((e) => e.kind === 'chain')).toBe(true)
  })
})

describe('layout - sequential-groups (golden)', () => {
  const result = computeLayout(modelOf('sequential-groups'))

  it('unfolds nested groups inline in successive columns', () => {
    expect(
      result.nodes.map((n) => `${n.id}@${n.x}`),
    ).toEqual([
      's0@0',
      's1@310',
      's1/sq0@620',
      's1/sq1@930',
      's1/sq1/sq0@1240',
      's1/sq1/sq1@1550',
      's2@1860',
    ])
    expect(result.nodes.every((n) => n.y === 0)).toBe(true)
  })

  it('routes flow through the parent card and out of the last child', () => {
    expect(result.edges.map((e) => e.id)).toEqual([
      's0->s1',
      's1->s1/sq0',
      's1/sq0->s1/sq1',
      's1/sq1->s1/sq1/sq0',
      's1/sq1/sq0->s1/sq1/sq1',
      's1/sq1/sq1->s2',
    ])
  })
})

describe('layout - scripted-classic', () => {
  const result = computeLayout(modelOf('scripted-classic'))

  it('chains all six cards including unfolded sequential children', () => {
    expect(result.nodes.map((n) => n.id)).toEqual([
      's0',
      's1',
      's2',
      's3',
      's4',
      's5',
    ])
    expect(result.edges.map((e) => e.kind)).toEqual([
      'chain',
      'chain',
      'chain',
      'chain',
      'chain',
    ])
  })
})

describe('layout - messy-realworld (partial graph)', () => {
  const result = computeLayout(modelOf('messy-realworld'))

  it('still positions whatever parsed despite diagnostics', () => {
    expect(result.nodes.map((n) => n.id)).toEqual(['s0', 's1', 's2'])
    expect(result.edges.map((e) => e.id)).toEqual(['s0->s1', 's1->s2'])
  })
})

describe('layout - properties across every corpus sample', () => {
  for (const sample of SAMPLES) {
    const result = computeLayout(parseJenkinsfile(sample.source))

    it(`${sample.id}: no two cards overlap`, () => {
      for (let a = 0; a < result.nodes.length; a += 1) {
        for (let b = a + 1; b < result.nodes.length; b += 1) {
          expect(
            rectsOverlap(nodeRect(req(result.nodes[a])), nodeRect(req(result.nodes[b]))),
            `${req(result.nodes[a]).id} collides with ${req(result.nodes[b]).id}`,
          ).toBe(false)
        }
      }
    })

    it(`${sample.id}: every card sits inside the reported canvas bounds`, () => {
      for (const node of result.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(0)
        expect(node.y).toBeGreaterThanOrEqual(0)
        expect(node.x + NODE_W).toBeLessThanOrEqual(result.width)
        expect(node.y + NODE_H).toBeLessThanOrEqual(result.height)
      }
      for (const box of result.containers) {
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.y).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(result.width)
        expect(box.y + box.height).toBeLessThanOrEqual(result.height)
      }
    })

    it(`${sample.id}: coordinates advance monotonically along every edge`, () => {
      const nodes = byId(result)
      for (const edge of result.edges) {
        const source = req(nodes.get(edge.source), `missing source ${edge.source}`)
        const target = req(nodes.get(edge.target), `missing target ${edge.target}`)
        expect(target.x - source.x).toBeGreaterThan(0)
        // Adjacent columns never share an x: cards are at least one card wide apart.
        expect(target.x - source.x).toBeGreaterThanOrEqual(NODE_W)
      }
    })

    it(`${sample.id}: edges reference rendered cards only, ids unique, deterministic`, () => {
      const seen = new Set<string>()
      for (const node of result.nodes) {
        expect(seen.has(node.id)).toBe(false)
        seen.add(node.id)
      }
      for (const edge of result.edges) {
        expect(seen.has(edge.source)).toBe(true)
        expect(seen.has(edge.target)).toBe(true)
      }

      const model = parseJenkinsfile(sample.source)
      expect(JSON.stringify(computeLayout(model))).toBe(JSON.stringify(result))
    })
  }
})

describe('layout - size growth', () => {
  it('grows linearly with sequential stage count', () => {
    for (const count of [1, 2, 5, 10, 20]) {
      const result = computeLayout(chainModel(Array.from({ length: count }, (_, i) => `s${i}`)))
      expect(result.width).toBe(count * NODE_W + (count - 1) * H_GAP)
      expect(result.height).toBe(NODE_H)
      expect(result.edges).toHaveLength(count - 1)
    }
  })

  it('grows linearly with parallel lane count', () => {
    for (const lanes of [1, 2, 3, 7]) {
      const model = chainModel(['head', 'group', 'tail'])
      model.rootStages[1] = leaf('group', {
        parallelBranches: Array.from({ length: lanes }, (_, i) => leaf(`g${i}`)),
      })
      const result = computeLayout(model)
      const box = req(result.containers[0])
      expect(box.height).toBe(
        CONTAINER_HEADER + CONTAINER_PAD_Y + lanes * NODE_H + (lanes - 1) * V_GAP + CONTAINER_PAD_Y,
      )
      expect(box.width).toBe(CONTAINER_PAD_X * 2 + NODE_W)
      // A single lane has no fan shape - its two connections are plain chains.
      expect(result.edges.filter((e) => e.kind === 'fan-out')).toHaveLength(lanes > 1 ? lanes : 0)
      expect(result.edges.filter((e) => e.kind === 'fan-in')).toHaveLength(lanes > 1 ? lanes : 0)
      if (lanes === 1) {
        expect(result.edges.map((e) => e.kind)).toEqual(['chain', 'chain'])
      }
    }
  })
})

describe('layout - synthetic nested parallel (plan risk R3)', () => {
  // Lane One itself contains a two-lane parallel group; Lane Two is short.
  const model = chainModel(['a', 'z'])
  model.rootStages = [
    leaf('a'),
    leaf('p', {
      parallelBranches: [
        leaf('p/l0', {
          parallelBranches: [leaf('p/l0/q0'), leaf('p/l0/q1')],
        }),
        leaf('p/l1'),
      ],
    }),
    leaf('z'),
  ]
  const result = computeLayout(model)

  it('lays sub-lanes without collisions anywhere in five cards', () => {
    expect(result.nodes).toHaveLength(5)
    for (let i = 0; i < result.nodes.length; i += 1) {
      for (let j = i + 1; j < result.nodes.length; j += 1) {
        expect(rectsOverlap(nodeRect(req(result.nodes[i])), nodeRect(req(result.nodes[j])))).toBe(
          false,
        )
      }
    }
  })

  it('stacks sub-lanes vertically in their shared column inside lane one', () => {
    const q0 = req(byId(result).get('p/l0/q0'))
    const q1 = req(byId(result).get('p/l0/q1'))
    expect(q0.x).toBe(q1.x)
    expect(q1.y).toBeGreaterThan(q0.y)
    // Sub-lanes sit inside the outer container's vertical extent.
    const outer = req(result.containers.find((c) => c.id === 'p'))
    expect(q1.y + NODE_H).toBeLessThanOrEqual(outer.y + outer.height)
  })

  it('fans the exit in from every lane tail', () => {
    const intoZ = result.edges.filter((e) => e.target === 'z')
    expect(intoZ.map((e) => e.id).sort()).toEqual([
      'p/l0/q0->z',
      'p/l0/q1->z',
      'p/l1->z',
    ])
    expect(intoZ.every((e) => e.kind === 'fan-in')).toBe(true)
  })
})

describe('layout - degenerate input', () => {
  it('returns an empty zero-size result for a stageless model', () => {
    expect(computeLayout(chainModel([]))).toEqual({
      nodes: [],
      edges: [],
      containers: [],
      width: 0,
      height: 0,
    })
  })

  it('positions a lone stage at the origin', () => {
    const result = computeLayout(chainModel(['only']))
    expect(result.nodes[0]?.x).toBe(0)
    expect(result.nodes[0]?.y).toBe(0)
    expect(result.edges).toEqual([])
  })
})
