// ---------------------------------------------------------------------------
// ui/detailsSections.test.ts - display rules for the details panel (§9).
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'

import type { PostHandler, StageNode, Step } from '../model/types'
import { buildContainerSections, buildDetailSections, stepDetailLabel, stepLabel } from './detailsSections'

function step(name: string, args?: string): Step {
  return { name, ...(args ? { args } : {}), kind: 'known', line: 1 }
}

function stage(overrides: Partial<StageNode> = {}): StageNode {
  return {
    id: 's0',
    name: 'Build',
    line: 3,
    steps: [],
    ...overrides,
  }
}

describe('stepLabel', () => {
  it('renders a zero-arg step as bare name', () => {
    expect(stepLabel(step('checkout'))).toBe('checkout')
  })

  it('keeps raw argument text verbatim, quotes included', () => {
    expect(stepLabel(step('sh', "'make build'"))).toBe("sh 'make build'")
  })

  it('renders named-argument calls without inventing parens', () => {
    expect(stepLabel(step('mail', "to:'oncall@acme.dev'"))).toBe("mail to:'oncall@acme.dev'")
  })
})

describe('stepDetailLabel', () => {
  it('adds source line and parser classification', () => {
    expect(stepDetailLabel(step('junit', "'out/*.xml'"))).toBe("line 1 · known · junit 'out/*.xml'")
  })
})

describe('buildDetailSections', () => {
  it('returns nothing for a bare stage - no stub rows (§9)', () => {
    expect(buildDetailSections(stage(), [])).toEqual([])
  })

  it('shows adapter-neutral metadata with provenance and inheritance', () => {
    const sections = buildDetailSections(
      stage({
        metadata: [
          {
            key: 'permissions',
            label: 'Permissions',
            value: 'contents: read',
            category: 'security',
            line: 8,
            inheritedFrom: 'workflow',
          },
          {
            key: 'runner',
            label: 'Runner',
            value: 'ubuntu',
            category: 'runtime',
            visibility: 'badge',
          },
        ],
      }),
      [],
    )
    expect(sections).toContainEqual({
      title: 'METADATA (1)',
      lines: ['Permissions: contents: read · security · inherited from workflow · line 8'],
      bullet: true,
    })
  })

  it('titles the steps section with the count and bullets each line', () => {
    const sections = buildDetailSections(
      stage({ steps: [step('sh', "'make build'"), step('checkout')] }),
      [],
    )
    expect(sections).toEqual([
      { title: 'STEPS (2)', lines: ["line 1 · known · sh 'make build'", 'line 1 · known · checkout'], bullet: true },
    ])
  })

  it('passes when conditions through verbatim and unbulleted', () => {
    const sections = buildDetailSections(stage({ when: ["branch 'main'", "tag pattern: 'v*'"] }), [])
    expect(sections).toContainEqual({
      title: 'WHEN',
      lines: ["branch 'main'", "tag pattern: 'v*'"],
      bullet: false,
    })
  })

  it('exposes the agent override as its own section', () => {
    const sections = buildDetailSections(stage({ agent: "docker: 'node:20-bookworm'" }), [])
    expect(sections).toContainEqual({ title: 'AGENT · STAGE OVERRIDE', lines: ["docker: 'node:20-bookworm'"], bullet: false })
  })

  it('shows stage environment, tools, options, and input configuration', () => {
    const sections = buildDetailSections(
      stage({
        environmentEntries: [{ key: 'REGION', value: "'ca-central-1'", line: 4 }],
        tools: [{ type: 'jdk', name: "'temurin-21'", line: 5 }],
        options: [{ name: 'retry', args: '2', line: 6 }],
        hasInput: true,
        input: ["message 'Release?'", "submitter 'ops'"],
      }),
      [],
    )
    expect(sections).toEqual([
      { title: 'ENVIRONMENT · STAGE (1)', lines: ["REGION = 'ca-central-1'"], bullet: true },
      { title: 'TOOLS · STAGE (1)', lines: ["jdk 'temurin-21'"], bullet: true },
      { title: 'OPTIONS · STAGE (1)', lines: ['retry(2)'], bullet: true },
      { title: 'INPUT GATE', lines: ["message 'Release?'", "submitter 'ops'"], bullet: false },
    ])
  })

  it('explains inherited agent and pipeline context on an ordinary stage', () => {
    const pipeline = {
      kind: 'declarative' as const,
      agent: "label 'linux'",
      environmentEntries: [{ key: 'REGION', value: "'ca'", line: 2 }],
      tools: [{ type: 'jdk', name: "'temurin-21'", line: 3 }],
      options: [{ name: 'timestamps', line: 4 }],
      parameters: [],
      triggers: [],
      postHandlers: [],
      rootStages: [],
      unparsedRegions: [],
      diagnostics: [],
    }
    expect(buildDetailSections(stage(), [], pipeline)).toEqual([
      { title: 'AGENT · INHERITED', lines: ["label 'linux'"], bullet: false },
      {
        title: 'PIPELINE CONTEXT',
        lines: ['1 pipeline environment entry', '1 pipeline tool', '1 pipeline option'],
        bullet: true,
      },
    ])
  })

  it('shows only handlers scoped to the selected stage', () => {
    const handlers: PostHandler[] = [
      { condition: 'failure', steps: [step('mail', "to:'ops@example.com'")], stage: 'Deploy', stageId: 's2' },
      { condition: 'success', steps: [step('echo', "'all good'")] },
      { condition: 'unstable', steps: [step('slackSend', "channel:'#ci'")], stage: 'Deploy', stageId: 's2' },
      { condition: 'always', steps: [], stage: 'Deploy', stageId: 's2' },
    ]
    const sections = buildDetailSections(stage({ name: 'Deploy', id: 's2' }), handlers)
    expect(sections.map((section) => section.title)).toEqual([
      'POST · failure',
      'POST · unstable',
    ])
    expect(sections[0]).toEqual({
      title: 'POST · failure',
      lines: ["line 1 · known · mail to:'ops@example.com'"],
      bullet: true,
    })
  })

  it('matches handlers by stable id when two stages share a name', () => {
    const handlers: PostHandler[] = [
      { condition: 'always', steps: [step('echo', "'first'")], stage: 'Verify', stageId: 's1' },
      { condition: 'failure', steps: [step('mail')], stage: 'Verify', stageId: 's3' },
    ]
    // Both stages are named Verify; only the s3 handler may reach the s3 card.
    expect(
      buildDetailSections(stage({ id: 's3', name: 'Verify' }), handlers).map((s) => s.title),
    ).toEqual(['POST · failure'])
    expect(
      buildDetailSections(stage({ id: 's1', name: 'Verify' }), handlers).map((s) => s.title),
    ).toEqual(['POST · always'])
  })

  it('matches matrix clone handlers through the parser-owned origin id', () => {
    const handlers: PostHandler[] = [
      {
        condition: 'always',
        steps: [step('echo', "'cleanup'")],
        stage: 'Cell',
        stageId: 'c0',
      },
    ]
    const sections = buildDetailSections(
      stage({ id: 's0/m0/c0', originId: 'c0', name: 'Cell' }),
      handlers,
    )
    expect(sections).toContainEqual({
      title: 'POST · always',
      lines: ["line 1 · known · echo 'cleanup'"],
      bullet: true,
    })
  })

  it('still matches legacy name-only handlers (older exported models)', () => {
    const handlers: PostHandler[] = [
      { condition: 'always', steps: [step('echo')], stage: 'Ship' },
    ]
    expect(
      buildDetailSections(stage({ id: 's9', name: 'Ship' }), handlers).map((s) => s.title),
    ).toEqual(['POST · always'])
  })

  it('orders sections STEPS, WHEN, AGENT, POST regardless of model shape', () => {
    const sections = buildDetailSections(
      stage({
        agent: 'any',
        when: ["branch 'main'"],
        steps: [step('sh')],
        name: 'Ship',
      }),
      [{ condition: 'always', steps: [step('echo')], stage: 'Ship' }],
    )
    expect(sections.map((section) => section.title)).toEqual([
      'STEPS (1)',
      'WHEN',
      'AGENT · STAGE OVERRIDE',
      'POST · always',
    ])
  })
})

describe('buildContainerSections', () => {
  it('lists parallel branches with step counts plus failFast', () => {
    const container = stage({
      failFast: true,
      parallelBranches: [
        stage({ id: 's0/p0', name: 'Unit', steps: [step('sh')] }),
        stage({ id: 's0/p1', name: 'Lint' }),
      ],
    })
    expect(buildContainerSections(container)).toEqual([
      { title: 'BRANCHES (2)', lines: ['Unit · 1 step', 'Lint · No steps'], bullet: true },
      { title: 'FAIL FAST', lines: ['true'], bullet: false },
    ])
  })

  it('reports matrix axes, excludes, and the surviving cell count', () => {
    const container = stage({
      name: 'Matrix',
      matrixAxes: ['OS', 'BROWSER'],
      matrixAxisValues: [
        ['linux', 'windows'],
        ['chrome', 'firefox'],
      ],
      matrixExcludes: [{ OS: ['windows'], BROWSER: ['firefox'] }],
      matrixCellSteps: [step('sh', "'build'")],
    })
    expect(buildContainerSections(container)).toEqual([
      { title: 'AXES', lines: ['OS: linux, windows', 'BROWSER: chrome, firefox'], bullet: true },
      { title: 'EXCLUDES (1)', lines: ['OS ∉ {windows} AND BROWSER ∉ {firefox}'], bullet: true },
      { title: 'CELLS', lines: ['3 combinations × 1 shared step'], bullet: false },
    ])
  })

  it('shows failFast on a matrix container too, not just parallel groups', () => {
    const container = stage({
      name: 'Matrix',
      failFast: true,
      matrixAxes: ['OS'],
      matrixAxisValues: [['linux']],
    })
    expect(buildContainerSections(container)).toEqual([
      { title: 'AXES', lines: ['OS: linux'], bullet: true },
      { title: 'CELLS', lines: ['1 combination'], bullet: false },
      { title: 'FAIL FAST', lines: ['true'], bullet: false },
    ])
  })

  it('describes nested parallel lanes by structure rather than zero steps', () => {
    const container = stage({
      parallelBranches: [
        stage({
          id: 's0/p0',
          name: 'Linux flow',
          sequentialChildren: [stage({ id: 's0/p0/sq0', name: 'Build' })],
        }),
      ],
    })
    expect(buildContainerSections(container)[0]?.lines).toEqual([
      'Linux flow · 1 nested stage',
    ])
  })

  it('lists sequential children in their real execution order', () => {
    const container = stage({
      name: 'Quality',
      sequentialChildren: [
        stage({ id: 's0/sq0', name: 'Lint', steps: [step('sh')] }),
        stage({ id: 's0/sq1', name: 'Test', steps: [step('junit'), step('sh')] }),
      ],
    })
    expect(buildContainerSections(container)[0]).toEqual({
      title: 'SEQUENTIAL STAGES (2)',
      lines: ['1. Lint · 1 step', '2. Test · 2 steps'],
      bullet: false,
    })
  })

  it('labels incomplete matrices without blank axis values or numeric zeroes', () => {
    const sections = buildContainerSections(stage({ matrixAxes: ['OS'] }))
    expect(sections).toEqual([
      { title: 'AXES', lines: ['OS: (no values)'], bullet: true },
      { title: 'CELLS', lines: ['No runnable combinations'], bullet: false },
    ])
  })

  it('surfaces per-axis notValues in the AXES section', () => {
    const container = stage({
      name: 'Matrix',
      matrixAxes: ['OS', 'BROWSER'],
      matrixAxisValues: [
        ['linux', 'windows'],
        ['chrome', 'edge'],
      ],
      matrixAxisNotValues: [[], ['edge']],
    })
    const axes = buildContainerSections(container).find((s) => s.title === 'AXES')
    expect(axes?.lines).toEqual(['OS: linux, windows', 'BROWSER: chrome, edge (not: edge)'])
  })

  it('caps the reported combination count at the expansion ceiling', () => {
    const range = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`)
    const container = stage({
      matrixAxes: ['A', 'B'],
      matrixAxisValues: [range(40), range(40)], // 1600 raw combos
    })
    const cells = buildContainerSections(container).find((s) => s.title === 'CELLS')
    expect(cells?.lines[0]).toBe('1000+ combinations')
  })

  it('returns nothing for a bare container - no stub rows', () => {
    expect(buildContainerSections(stage())).toEqual([])
  })
})
