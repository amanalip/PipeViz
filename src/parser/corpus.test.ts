// ---------------------------------------------------------------------------
// parser/corpus.test.ts - the seven-sample corpus as fixtures (plan §11/§12).
//
// Each sample asserts its expected model shape exactly enough to catch
// regressions: kind, agent, sections, stage tree with ids/order/steps,
// and diagnostics. Whole-model snapshots guard the rest. Determinism and
// id-uniqueness invariants run across every sample.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import { parseJenkinsfile } from './index'
import { SAMPLES, sampleById } from '../samples'
import { req } from './testSupport'

const modelOf = (id: string) => parseJenkinsfile(req(sampleById(id), `sample ${id}`).source)

describe('corpus - simple-ci', () => {
  const model = modelOf('simple-ci')

  it('parses four sequential stages in order', () => {
    expect(model.kind).toBe('declarative')
    expect(model.agent).toBe('any')
    expect(model.rootStages.map((s) => s.id)).toEqual(['s0', 's1', 's2', 's3'])
    expect(model.rootStages.map((s) => s.name)).toEqual(['Checkout', 'Build', 'Test', 'Deploy'])
  })

  it('captures environment entries with raw values', () => {
    expect(model.environmentEntries).toEqual([
      { key: 'APP_NAME', value: "'pipeviz-demo'", line: 5 },
      { key: 'BUILD_DIR', value: '"work/${BUILD_NUMBER}"', line: 6 },
    ])
  })

  it('lists each stage\'s steps with kinds and lines', () => {
    expect(model.rootStages[0]?.steps).toEqual([
      { name: 'checkout', args: 'scm', kind: 'known', line: 12 },
    ])
    expect(model.rootStages[2]?.steps).toEqual([
      { name: 'sh', args: "'make test'", kind: 'known', line: 22 },
      { name: 'junit', args: "'reports/*.xml'", kind: 'known', line: 23 },
    ])
  })

  it('reads the always post handler', () => {
    expect(model.postHandlers).toEqual([
      {
        condition: 'always',
        steps: [{ name: 'echo', args: "'Pipeline finished'", kind: 'known', line: 35 }],
      },
    ])
  })

  it('parses clean with zero diagnostics', () => {
    expect(model.diagnostics).toEqual([])
  })
})

describe('corpus - parallel-tests', () => {
  const model = modelOf('parallel-tests')

  it('fans three lanes out of the Test stage with failFast captured', () => {
    const test = req(model.rootStages.find((s) => s.name === 'Test'))
    expect(test.failFast).toBe(true)
    expect(test.steps).toEqual([])
    expect(test.parallelBranches?.map((b) => b.id)).toEqual(['s1/p0', 's1/p1', 's1/p2'])
    expect(test.parallelBranches?.map((b) => b.name)).toEqual(['Unit', 'Integration', 'Lint'])
  })

  it('converges into a Report stage afterwards', () => {
    expect(model.rootStages.map((s) => s.name)).toEqual(['Build', 'Test', 'Report'])
    const report = req(model.rootStages[2])
    expect(report.steps.map((s) => `${s.name}:${s.args ?? ''}`)).toEqual([
      "junit:'out/*.xml'",
      "publishHTML:target: [reportDir: 'coverage']",
    ])
  })

  it('keeps the lane steps intact', () => {
    const lint = req(
      req(model.rootStages[1]).parallelBranches?.find((b) => b.name === 'Lint'),
    )
    expect(lint.steps).toEqual([{ name: 'npx', args: "'eslint .'", kind: 'known', line: 25 }])
  })

  it('is clean', () => {
    expect(model.diagnostics).toEqual([])
  })
})

describe('corpus - matrix-build', () => {
  const model = modelOf('matrix-build')

  it('summarizes both axes on the matrix stage', () => {
    expect(model.agent).toBe('none')
    const matrix = req(model.rootStages[1])
    expect(matrix.name).toBe('Matrix Build')
    expect(matrix.matrixAxes).toEqual(['OS', 'BROWSER'])
    // Axis-combination expansion is deferred (plan Q1): no child nodes.
    expect(matrix.sequentialChildren).toBeUndefined()
    expect(matrix.parallelBranches).toBeUndefined()
  })

  it('keeps surrounding sequential stages untouched', () => {
    expect(model.rootStages.map((s) => s.name)).toEqual(['Deps', 'Matrix Build', 'Bundle'])
    expect(model.diagnostics).toEqual([])
  })
})

describe('corpus - conditional-deploy', () => {
  const model = modelOf('conditional-deploy')

  it('reads parameters, triggers, and options', () => {
    expect(model.parameters).toEqual([
      { name: 'TARGET_ENV', type: 'string' },
      { name: 'MODE', type: 'choice' },
    ])
    expect(model.triggers).toEqual([
      "cron('H 2 * * *')",
      "upstream(threshold: SUCCESS, upstreamProjects: 'lib/main')",
    ])
    expect(model.options.map((o) => o.name)).toEqual([
      'timestamps',
      'disableConcurrentBuilds',
      'timeout',
    ])
    expect(model.options[2]?.args).toBe("time: 1, unit: 'HOURS'")
  })

  it('marks the approval gate and captures raw when combinators', () => {
    const verify = req(model.rootStages.find((s) => s.name === 'Verify'))
    expect(verify.when).toEqual(['anyOf { … }'])
    const gate = req(model.rootStages.find((s) => s.name === 'Approval Gate'))
    expect(gate.hasInput).toBe(true)
    const deploy = req(model.rootStages.find((s) => s.name === 'Deploy Production'))
    expect(deploy.when).toEqual(['allOf { … }'])
    expect(deploy.steps[0]?.args).toBe("'./deploy.sh --env \"${TARGET_ENV}\" --mode \"${MODE}\"'")
  })

  it('separates stage-scoped from pipeline-scoped post handlers', () => {
    expect(model.postHandlers.map((h) => `${h.condition}@${h.stage ?? 'pipeline'}`)).toEqual([
      'failure@Deploy Production',
      'unstable@Deploy Production',
      'success@pipeline',
    ])
  })

  it('is clean', () => {
    expect(model.diagnostics).toEqual([])
  })
})

describe('corpus - sequential-groups', () => {
  const model = modelOf('sequential-groups')

  it('summarizes the docker agent block', () => {
    expect(model.agent).toBe("docker { image 'node:18' args '-u root' }")
  })

  it('nests two levels of sequential groups with path ids', () => {
    const quality = req(model.rootStages.find((s) => s.name === 'Quality Suite'))
    expect(quality.when).toEqual(['not { … }'])
    expect(quality.sequentialChildren?.map((c) => c.id)).toEqual(['s1/sq0', 's1/sq1'])
    const deep = req(quality.sequentialChildren?.find((c) => c.name === 'Deep Checks'))
    expect(deep.sequentialChildren?.map((c) => c.id)).toEqual(['s1/sq1/sq0', 's1/sq1/sq1'])
    expect(deep.sequentialChildren?.map((c) => c.name)).toEqual(['Types', 'Dead Code'])
  })

  it('unfolds dir-wrapped stash in Package', () => {
    const pkg = req(model.rootStages.find((s) => s.name === 'Package'))
    expect(pkg.steps.map((s) => s.name)).toEqual(['dir', 'stash'])
  })

  it('is clean', () => {
    expect(model.diagnostics).toEqual([])
  })
})

describe('corpus - scripted-classic', () => {
  const model = modelOf('scripted-classic')

  it('switches to scripted mode with an advisory warning only', () => {
    expect(model.kind).toBe('scripted')
    expect(model.diagnostics).toHaveLength(1)
    expect(model.diagnostics[0]?.severity).toBe('warning')
    expect(model.diagnostics[0]?.message).toContain('Scripted pipeline detected')
  })

  it('orders all five stages across try/catch/finally boundaries', () => {
    expect(model.rootStages.map((s) => s.id)).toEqual(['s0', 's1', 's2', 's5'])
    const containerize = req(model.rootStages.find((s) => s.name === 'Containerize'))
    expect(containerize.sequentialChildren?.map((c) => c.id)).toEqual(['s3', 's4'])
    expect(containerize.sequentialChildren?.map((c) => c.name)).toEqual(['Image', 'Push'])
  })

  it('inherits the node label onto every stage', () => {
    for (const stage of [
      ...model.rootStages,
      ...(model.rootStages[2]?.sequentialChildren ?? []),
    ]) {
      expect(stage.agent).toBe("node 'built-in'")
    }
  })

  it('records assignment statements as script steps inside their stage', () => {
    const prepare = req(model.rootStages[0])
    expect(prepare.steps[0]).toMatchObject({ name: 'checkout', args: 'scm', kind: 'known' })
    expect(prepare.steps[1]).toMatchObject({ name: 'version', kind: 'script' })
  })
})

describe('corpus - messy-realworld', () => {
  const model = modelOf('messy-realworld')

  it('reports exactly two unclosed-brace errors pointing at their open lines', () => {
    expect(model.diagnostics).toHaveLength(2)
    for (const diag of model.diagnostics) {
      expect(diag.severity).toBe('error')
      expect(diag.message).toBe("'{' opened here is never closed")
    }
    expect(model.diagnostics.map((d) => d.line)).toEqual([12, 2])
  })

  it('still yields a partial graph despite the defect', () => {
    expect(model.kind).toBe('declarative')
    expect(model.rootStages.map((s) => s.name)).toEqual(['Checkout', 'Smoke Test', 'Broken Tail'])
    expect(model.agent).toBe("label 'docker && linux'")
  })

  it('survives odd indentation, mid-block comments, and semicolons', () => {
    expect(model.environmentEntries.map((e) => e.key)).toEqual(['REGISTRY', 'TAG', 'DOCKER_AUTH'])
    const checkout = req(model.rootStages[0])
    expect(checkout.steps.map((s) => s.name)).toEqual(['git', 'echo']) // same-line semicolon pair
    expect(checkout.steps.every((s) => s.line === 15)).toBe(true)
  })

  it('preserves long multi-line shell scripts verbatim', () => {
    const smoke = req(model.rootStages[1])
    const sh = smoke.steps[0]
    expect(sh?.name).toBe('sh')
    expect(sh?.args).toContain('#!/bin/bash')
    expect(sh?.args).toContain('set -euo pipefail')
    expect(sh?.args).toContain('${TAG}')
    expect(sh?.args).toContain('{ echo unhealthy; exit 1; }') // braces inside the script stay inert
  })

  it('folds the swallowed trailing stage into generic steps', () => {
    const tail = req(model.rootStages[2])
    expect(tail.steps.map((s) => s.name)).toEqual([
      'bat',
      'archiveArtifacts',
      'stage', // Never Reached degrades to a step under brace recovery
      'steps',
      'echo',
    ])
  })
})

describe('corpus - invariants across every sample', () => {
  for (const sample of SAMPLES) {
    it(`${sample.id}: deterministic, uniquely identified, structurally sound`, () => {
      const first = parseJenkinsfile(sample.source)
      const second = parseJenkinsfile(sample.source)
      expect(JSON.stringify(first)).toBe(JSON.stringify(second))

      const seen = new Set<string>()
      const visit = (stages: typeof first.rootStages): void => {
        for (const stage of stages) {
          expect(stage.id.length).toBeGreaterThan(0)
          expect(seen.has(stage.id)).toBe(false)
          seen.add(stage.id)
          expect(stage.name.length).toBeGreaterThan(0)
          expect(Number.isInteger(stage.line)).toBe(true)
          expect(stage.line).toBeGreaterThanOrEqual(1)
          expect(Array.isArray(stage.steps)).toBe(true)
          visit(stage.parallelBranches ?? [])
          visit(stage.sequentialChildren ?? [])
        }
      }
      visit(first.rootStages)

      expect(Array.isArray(first.diagnostics)).toBe(true)
    })

    it(`${sample.id}: matches its model snapshot`, () => {
      expect(parseJenkinsfile(sample.source)).toMatchSnapshot(`[${sample.id}] PipelineModel`)
    })
  }

  it('exposes exactly the seven planned corpus entries', () => {
    expect(SAMPLES.map((s) => s.id)).toEqual([
      'simple-ci',
      'parallel-tests',
      'matrix-build',
      'conditional-deploy',
      'sequential-groups',
      'scripted-classic',
      'messy-realworld',
    ])
  })
})
