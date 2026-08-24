// ---------------------------------------------------------------------------
// graph/toFlow.test.ts - unit tests for the layout->React Flow mapping.
//
// The converter is pure, so these tests run without any renderer: parse a
// corpus sample (or a tiny inline source), lay it out, map it, and assert
// exact node/edge objects. The nested-parallel case is the critical one -
// React Flow subflows demand coordinates relative to the immediate parent,
// and getting that wrong shows up as cards drifting out of their containers.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'

import { computeLayout } from '../layout/computeLayout'
import { parseJenkinsfile } from '../parser'
import { sampleById } from '../samples'
import { categorize, CATEGORY_COLORS } from './categories'
import { stageBadgeRow } from './stageBadges'
import { buildFlowGraph } from './toFlow'

/** Parse + lay out + map in one step; the standard pipeline under test. */
function flow(source: string) {
  const model = parseJenkinsfile(source)
  return { model, layout: computeLayout(model), graph: buildFlowGraph(model, computeLayout(model)) }
}

/**
 * React Flow subflows demand parents earlier in the node array than the
 * nodes referencing them; this walks any built graph and fails on the first
 * child that arrives before its parent container.
 */
function expectParentsBeforeChildren(graph: ReturnType<typeof buildFlowGraph>) {
  const emitted = new Set<string>()
  for (const node of graph.nodes) {
    if (node.parentId !== undefined) {
      expect(emitted.has(node.parentId), `parent ${node.parentId} of ${node.id}`).toBe(true)
    }
    emitted.add(node.id)
  }
}

describe('categorize', () => {
  it('maps build-family names to the cyan stripe', () => {
    expect(categorize('Build')).toBe('build')
    expect(categorize('Compile API')).toBe('build')
    expect(categorize('Package App')).toBe('build')
  })

  it('maps test-family names to the violet stripe', () => {
    expect(categorize('Unit tests')).toBe('test')
    expect(categorize('Spec')).toBe('test')
    expect(categorize('Verify signatures')).toBe('test')
  })

  it('maps deploy-family names to the emerald stripe', () => {
    expect(categorize('Deploy')).toBe('deploy')
    expect(categorize('Release notes')).toBe('deploy')
    expect(categorize('Publish docs')).toBe('deploy')
  })

  it('falls back to neutral when no keyword matches', () => {
    expect(categorize('Checkout')).toBe('neutral')
    expect(categorize('Notify')).toBe('neutral')
  })

  it('matches case-insensitively', () => {
    expect(categorize('BUILD AND SHIP')).toBe('build')
    expect(categorize('e2e testing')).toBe('test')
  })

  it('exposes one color per category', () => {
    expect(Object.keys(CATEGORY_COLORS)).toEqual(['build', 'test', 'deploy', 'neutral'])
  })
})

describe('buildFlowGraph on the sequential sample (simple-ci)', () => {
  const source = sampleById('simple-ci')?.source ?? ''
  const { model, layout, graph } = flow(source)

  it('emits one card per laid-out stage at identical absolute positions', () => {
    expect(graph.nodes).toHaveLength(layout.nodes.length)
    expect(graph.nodes.map((node) => node.id)).toEqual(layout.nodes.map((node) => node.id))
    for (const [i, node] of graph.nodes.entries()) {
      const positioned = layout.nodes[i]
      if (!positioned) throw new Error(`layout lost node ${i}`)
      expect(node.position).toEqual({ x: positioned.x, y: positioned.y })
      expect(node.parentId).toBeUndefined()
    }
  })

  it('sizes every card from the shared layout constants', () => {
    for (const node of graph.nodes) {
      if (node.type === 'stage') expect(node.style).toEqual({ width: 220, height: 72 })
    }
  })

  it('gives stage cards explicit aria labels naming content and line', () => {
    // Screen readers must not fall back to opaque node ids (a11y #21).
    for (const node of graph.nodes) {
      expect(node.ariaLabel).toMatch(/^.+ stage, .+, line \d+, steps collapsed, expandable$/)
    }
    const checkout = graph.nodes.find((node) => node.id === 's0')
    const positioned = layout.nodes.find((node) => node.id === 's0')
    if (!positioned) throw new Error('layout lost s0')
    expect(checkout?.ariaLabel).toBe(
      `${positioned.name} stage, ${stageBadgeRow(positioned)}, line ${positioned.line}, steps collapsed, expandable`,
    )
  })

  it('maps expanded commands to layout-sized cards and explicit state', () => {
    const expandedStepIds = new Set(['s1'])
    const expandedLayout = computeLayout(model, { expandedStepIds })
    const expandedGraph = buildFlowGraph(model, expandedLayout, { expandedStepIds })
    const build = expandedGraph.nodes.find((node) => node.id === 's1')
    const positioned = expandedLayout.nodes.find((node) => node.id === 's1')
    expect(positioned?.width).toBeGreaterThan(220)
    expect(positioned?.height).toBeGreaterThan(72)
    expect(build?.style).toEqual({ width: positioned?.width, height: positioned?.height })
    expect(build?.ariaLabel).toContain('steps expanded')
    expect(build?.type === 'stage' && build.data.stepsExpanded).toBe(true)
  })

  it('carries category guesses matching the stage names', () => {
    const checkout = graph.nodes.find((node) => node.id === 's0')
    expect(checkout?.type).toBe('stage')
    // Checkout is keyword-free, so the stripe guess lands on neutral.
    if (checkout?.type === 'stage') {
      expect(checkout.data.category).toBe('neutral')
    }
  })

  it('chains stages with smoothstep arrow edges in document order', () => {
    expect(graph.edges.map((edge) => edge.id)).toEqual(['s0->s1', 's1->s2', 's2->s3'])
    for (const edge of graph.edges) {
      expect(edge.type).toBe('smoothstep')
      expect(edge.animated).toBe(false)
      expect(edge.markerEnd).toEqual({
        type: 'arrowclosed',
        color: 'rgba(148, 163, 184, 0.65)',
        width: 15,
        height: 15,
      })
    }
  })

  it('keeps model steps reachable through node data', () => {
    const expected = model.rootStages[1]?.steps.length ?? 0
    const build = graph.nodes.find((node) => node.id === 's1')
    expect(build?.type).toBe('stage')
    if (build?.type === 'stage') {
      expect(build.data.stage.steps).toHaveLength(expected)
    }
  })

  it('is deterministic across repeated calls', () => {
    expect(buildFlowGraph(model, layout)).toEqual(buildFlowGraph(model, layout))
  })
})

describe('buildFlowGraph on the parallel sample (parallel-tests)', () => {
  const source = sampleById('parallel-tests')?.source ?? ''
  const { model, layout, graph } = flow(source)

  it('replaces the parallel parent card with exactly one container node', () => {
    expect(model.rootStages[1]?.parallelBranches).toHaveLength(3)
    const containers = graph.nodes.filter((node) => node.type === 'groupContainer')
    expect(containers).toHaveLength(1)
    expect(containers.map((container) => container.id)).toEqual(['s1'])
    expect(graph.nodes.some((node) => node.id === 's1' && node.type === 'stage')).toBe(false)
  })

  it('labels the container from the parent stage plus failFast', () => {
    const box = graph.nodes.find((node) => node.type === 'groupContainer')
    expect(box?.type === 'groupContainer' && box.data).toMatchObject({
      label: 'Test',
      kind: 'parallel',
      branchCount: 3,
      failFast: true,
    })
  })

  it('labels the container node for screen readers with shape and size', () => {
    const box = graph.nodes.find((node) => node.type === 'groupContainer')
    expect(box?.ariaLabel).toBe('Parallel group Test, 3 branches, fail fast')
  })

  it('nests lane cards via parentId with positions relative to the box', () => {
    expectParentsBeforeChildren(graph)
    const absBox = layout.containers.find((container) => container.id === 's1')
    if (!absBox) throw new Error('layout lost its container')

    const branchIds = ['s1/p0', 's1/p1', 's1/p2']
    for (const id of branchIds) {
      const card = graph.nodes.find((node) => node.id === id)
      expect(card?.parentId).toBe('s1')
      const positioned = layout.nodes.find((node) => node.id === id)
      if (!positioned) throw new Error(`layout lost ${id}`)
      expect(card?.position).toEqual({
        x: positioned.x - absBox.x,
        y: positioned.y - absBox.y,
      })
    }
  })

  it('leaves top-level cards absolute and unparented', () => {
    for (const id of ['s0', 's2']) {
      const card = graph.nodes.find((node) => node.id === id)
      expect(card?.parentId).toBeUndefined()
      const positioned = layout.nodes.find((node) => node.id === id)
      if (!positioned) throw new Error(`layout lost ${id}`)
      expect(card?.position).toEqual({ x: positioned.x, y: positioned.y })
    }
  })

  it('fans out from Build into each lane and fans back into Report', () => {
    const ids = graph.edges.map((edge) => edge.id)
    expect(ids).toContain('s0->s1/p0')
    expect(ids).toContain('s0->s1/p1')
    expect(ids).toContain('s0->s1/p2')
    expect(ids).toContain('s1/p0->s2')
    expect(ids).toContain('s1/p1->s2')
    expect(ids).toContain('s1/p2->s2')
  })
})

describe('group metadata labels', () => {
  it('keeps structural-stage overrides visible on the container', () => {
    const { graph } = flow(`pipeline {
      agent none
      stages {
        stage('Grouped') {
          agent { label 'linux' }
          environment { MODE = 'ci' }
          parallel {
            stage('A') { steps { echo 'a' } }
            stage('B') { steps { echo 'b' } }
          }
        }
      }
    }`)
    const group = graph.nodes.find((node) => node.type === 'groupContainer')
    expect(group?.type === 'groupContainer' && group.data.metadataBadges).toEqual([
      'AGENT: linux',
      'ENV ×1',
    ])
    expect(group?.ariaLabel).toContain('AGENT: linux, ENV ×1')
  })
})

describe('buildFlowGraph with collapsible sequential groups', () => {
  const source = sampleById('sequential-groups')?.source ?? ''
  const model = parseJenkinsfile(source)

  it('marks the compact parent as expandable without rendering hidden children', () => {
    const layout = computeLayout(model, { expandedSequentialIds: new Set() })
    const graph = buildFlowGraph(model, layout, { expandedSequentialIds: new Set() })
    const quality = graph.nodes.find((node) => node.id === 's1')
    expect(quality?.type).toBe('stage')
    if (quality?.type !== 'stage') return
    expect(quality.data.expandable).toBe(true)
    expect(quality.ariaLabel).toContain('collapsed, expandable')
    expect(graph.nodes.some((node) => node.id === 's1/sq0')).toBe(false)
  })

  it('maps expanded parents to nested React Flow subflows with ordered children', () => {
    const options = { expandedSequentialIds: new Set(['s1', 's1/sq1']) }
    const layout = computeLayout(model, options)
    const graph = buildFlowGraph(model, layout, options)
    expectParentsBeforeChildren(graph)

    const quality = graph.nodes.find((node) => node.id === 's1')
    expect(quality?.type).toBe('groupContainer')
    if (quality?.type !== 'groupContainer') return
    expect(quality.data).toMatchObject({
      kind: 'sequential',
      itemCount: 2,
      collapsible: true,
    })
    expect(quality.ariaLabel).toContain('2 nested stages, expanded')

    const staticAnalysis = graph.nodes.find((node) => node.id === 's1/sq0')
    expect(staticAnalysis?.parentId).toBe('s1')
    expect(staticAnalysis?.type === 'stage' && staticAnalysis.data.sequenceIndex).toBe(1)
    const deep = graph.nodes.find((node) => node.id === 's1/sq1')
    expect(deep?.parentId).toBe('s1')
    expect(deep?.type === 'groupContainer' && deep.data.sequenceIndex).toBe(2)
  })

  it('routes internal execution through bottom and top handles', () => {
    const options = { expandedSequentialIds: new Set(['s1', 's1/sq1']) }
    const layout = computeLayout(model, options)
    const graph = buildFlowGraph(model, layout, options)
    const vertical = graph.edges.filter((edge) => edge.className === 'sequential-edge')
    expect(vertical).toHaveLength(2)
    for (const edge of vertical) {
      expect(edge.sourceHandle).toBe('source-bottom')
      expect(edge.targetHandle).toBe('target-top')
    }
  })
})

describe('buildFlowGraph with nested parallel containers', () => {
  const NESTED = `pipeline {
  stages {
    stage('Seed') {
      steps { echo 'seed' }
    }
    stage('Farm') {
      failFast true
      parallel {
        stage('Pen A') {
          stages {
            stage('Herd') {
              parallel {
                stage('Goat') { steps { echo 'goat' } }
                stage('Ewe') { steps { echo 'ewe' } }
              }
            }
          }
        }
        stage('Pen B') {
          steps { echo 'b' }
        }
      }
    }
    stage('Count') {
      steps { echo 'done' }
    }
  }
}
`
  const nestedModel = parseJenkinsfile(NESTED)
  const nestedOptions = { expandedSequentialIds: new Set(['s1/p0']) }
  const layout = computeLayout(nestedModel, nestedOptions)
  const graph = buildFlowGraph(nestedModel, layout, nestedOptions)

  it('emits every parent container before the nodes parented to it', () => {
    expectParentsBeforeChildren(graph)
  })

  it('recovers all mixed container levels from geometry alone', () => {
    expectParentsBeforeChildren(graph)
    expect(layout.containers).toHaveLength(3)
    const outer = layout.containers.find((box) => box.id === 's1')
    const sequential = layout.containers.find((box) => box.kind === 'sequential')
    const inner = layout.containers.find((box) => box.kind === 'parallel' && box.id !== 's1')
    expect(outer && inner).toBeTruthy()
    expect(sequential).toBeTruthy()
    if (!outer || !inner || !sequential) return
    // Inner strictly inside outer - the precondition the converter relies on.
    expect(inner.x).toBeGreaterThanOrEqual(outer.x)
    expect(inner.y).toBeGreaterThanOrEqual(outer.y)
    expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width)
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height)

    const innerNode = graph.nodes.find((node) => node.id === inner.id)
    expect(innerNode?.type).toBe('groupContainer')
    expect(innerNode?.parentId).toBe(sequential.id)
    expect(innerNode?.position).toEqual({
      x: inner.x - sequential.x,
      y: inner.y - sequential.y,
    })
  })

  it('parents deep cards to the innermost container only', () => {
    // The two Herd-lane cards live inside both boxes geometrically but must
    // attach to the inner one with offsets measured from the inner origin.
    const inner = layout.containers.find((box) => box.kind === 'parallel' && box.id !== 's1')
    if (!inner) throw new Error('inner container missing')
    const laneIds = layout.nodes
      .filter((node) => node.name === 'Goat' || node.name === 'Ewe')
      .map((node) => node.id)
    expect(laneIds).toHaveLength(2)
    for (const id of laneIds) {
      const card = graph.nodes.find((node) => node.id === id)
      expect(card?.parentId).toBe(inner.id)
      const positioned = layout.nodes.find((node) => node.id === id)
      expect(card?.position).toEqual({
        x: (positioned?.x ?? 0) - inner.x,
        y: (positioned?.y ?? 0) - inner.y,
      })
    }
  })

  it('keeps mid-level cards parented to the outer container', () => {
    const penB = graph.nodes.find((node) => node.id === 's1/p1')
    expect(penB?.parentId).toBe('s1')
  })
})

describe('buildFlowGraph with a compact matrix (matrix-build)', () => {
  const source = sampleById('matrix-build')?.source ?? ''
  const { graph } = flow(source)

  it('describes matrix cells instead of claiming the card has no steps', () => {
    const matrix = graph.nodes.find(
      (node) => node.type === 'stage' && node.data.stage.name === 'Matrix Build',
    )
    expect(matrix?.ariaLabel).toMatch(/^Matrix Build stage, 3 cells · MATRIX, line \d+$/)
  })
})

describe('buildFlowGraph with an expanded matrix (matrix-build)', () => {
  const source = sampleById('matrix-build')?.source ?? ''
  const model = parseJenkinsfile(source)
  const layout = computeLayout(model, { expandMatrix: true })
  const graph = buildFlowGraph(model, layout, { expandMatrix: true })

  it('reports the container as kind matrix with the axis list', () => {
    const box = graph.nodes.find((node) => node.type === 'groupContainer')
    expect(box?.type === 'groupContainer' && box.data).toMatchObject({
      label: 'Matrix Build',
      kind: 'matrix',
      branchCount: 3,
      failFast: false,
      matrixAxes: 'OS × BROWSER',
    })
  })

  it('reads an explicit matrix aria label on the expanded container', () => {
    const box = graph.nodes.find((node) => node.type === 'groupContainer')
    expect(box?.ariaLabel).toBe('Matrix group Matrix Build, axes OS × BROWSER, 3 combinations')
  })

  it('keeps failFast on an expanded matrix container instead of swallowing it', () => {
    // Regression: expansion used to force failFast to false, hiding a
    // directive Jenkins honors on matrices.
    const ffSource = `pipeline {
  stages {
    stage('M') {
      failFast true
      matrix {
        axes { axis { name 'OS'; values 'linux' } }
        stages { stage('cell') { steps { echo run } } }
      }
    }
  }
}
`
    const ffModel = parseJenkinsfile(ffSource)
    const ffLayout = computeLayout(ffModel, { expandMatrix: true })
    const ffGraph = buildFlowGraph(ffModel, ffLayout, { expandMatrix: true })
    const box = ffGraph.nodes.find((node) => node.type === 'groupContainer')
    expect(box?.type === 'groupContainer' && box.data).toMatchObject({
      kind: 'matrix',
      failFast: true,
    })
    expect(box?.ariaLabel).toBe('Matrix group M, axes OS, 1 combination, fail fast')
  })

  it('parents combo cards to the matrix container with relative positions', () => {
    expectParentsBeforeChildren(graph)
    const absBox = layout.containers.find((container) => container.id === 's1')
    if (!absBox) throw new Error('layout lost its matrix container')
    for (const id of ['s1/m0', 's1/m1', 's1/m2']) {
      const card = graph.nodes.find((node) => node.id === id)
      expect(card?.parentId).toBe('s1')
      const positioned = layout.nodes.find((node) => node.id === id)
      if (!positioned) throw new Error(`layout lost ${id}`)
      expect(card?.position).toEqual({
        x: positioned.x - absBox.x,
        y: positioned.y - absBox.y,
      })
    }
  })
})

describe('buildFlowGraph edge cases', () => {
  it('maps an empty layout to empty arrays', () => {
    const model = parseJenkinsfile('')
    const graph = buildFlowGraph(model, computeLayout(model))
    expect(graph).toEqual({ nodes: [], edges: [] })
  })
})

describe('buildFlowGraph with unparsed-region ghosts (mockups §11)', () => {
  // 'A' never closes, so 'B' is demoted into A's step capture and comes
  // back from the parser as an UnparsedRegion.
  const SWALLOWED = `pipeline {
  stages {
    stage('H') { steps { echo 'h' } }
    stage('A') { steps { echo 'a' }
    stage('B') { steps { echo 'b' } }
  }
}
`
  const model = parseJenkinsfile(SWALLOWED)
  const layout = computeLayout(model)
  const graph = buildFlowGraph(model, layout)

  it('renders one inert ghost card carrying the recovered label and span', () => {
    const ghosts = graph.nodes.filter((node) => node.type === 'ghost')
    expect(ghosts).toHaveLength(1)
    const ghost = ghosts[0]
    if (ghost?.type !== 'ghost') throw new Error('ghost node missing')
    expect(ghost.id).toBe('u0')
    expect(ghost.data).toEqual({ label: 'B', startLine: 5, endLine: 5 })
    expect(ghost.ariaLabel).toBe('Unparsed region B, lines 5-5')
    expect(ghost.selectable).toBe(false)
    expect(ghost.focusable).toBe(false)
    expect(ghost.draggable).toBe(false)
    expect(ghost.parentId).toBeUndefined()
  })

  it('dashes exactly the edges that flow into a ghost', () => {
    const into = graph.edges.find((edge) => edge.target === 'u0')
    if (!into) throw new Error('edge into the ghost missing')
    expect(into.style?.strokeDasharray).toBe('5 4')

    const plain = graph.edges.find((edge) => edge.target !== 'u0')
    if (!plain) throw new Error('parsed edge missing')
    expect(plain.style?.strokeDasharray).toBeUndefined()
  })

  it('keeps ghost positions in lockstep with layout like every card', () => {
    const positioned = layout.nodes.find((node) => node.id === 'u0')
    if (!positioned) throw new Error('layout lost the ghost')
    const ghost = graph.nodes.find((node) => node.id === 'u0')
    expect(ghost?.position).toEqual({ x: positioned.x, y: positioned.y })
  })

  it('is deterministic with ghosts present', () => {
    expect(buildFlowGraph(model, layout)).toEqual(buildFlowGraph(model, layout))
  })
})
