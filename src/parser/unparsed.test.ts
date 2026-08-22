// ---------------------------------------------------------------------------
// parser/unparsed.test.ts - unparsed-region markers (mockups §11).
//
// Brace recovery can demote a literal `stage('X') { ... }` call so it never
// renders: an unclosed brace swallows later stages into a sibling's step
// capture, and a stray `}` pops a scope early. These tests pin the honest
// accounting: every demoted stage call surfaces as an UnparsedRegion, in
// document order, with its recovered label; clean sources report none.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'

import { parseJenkinsfile } from './index'
import { sampleById } from '../samples'
import { req } from './testSupport'

describe('unparsed regions - unclosed brace swallows a later stage', () => {
  // 'A' never closes, so 'B' lands inside A's step capture instead of the
  // stages list. A renders; B must surface as unparsed material.
  const SWALLOWED = `pipeline {
  stages {
    stage('A') { steps { echo 'a' }
    stage('B') { steps { echo 'b' } }
  }
}
`
  const model = parseJenkinsfile(SWALLOWED)

  it('renders only the first stage', () => {
    expect(model.rootStages.map((s) => s.name)).toEqual(['A'])
  })

  it('reports the swallowed call with label and exact span', () => {
    expect(model.unparsedRegions).toEqual([
      { startLine: 4, endLine: 4, label: 'B' },
    ])
  })
})

describe('unparsed regions - stray close brace demotes a later stage', () => {
  // The extra `}` on line 3 closes `stages` early, dropping 'B' straight
  // into the pipeline scope where no stage can render.
  const STRAY = `pipeline {
  stages {
    stage('A') { steps { echo 'a' } } }
    stage('B') { steps { echo 'b' } }
  }
}
`
  const model = parseJenkinsfile(STRAY)

  it('still reports an error for the structural damage', () => {
    expect(model.diagnostics.some((d) => d.severity === 'error')).toBe(true)
  })

  it('reports the demoted call as unparsed material', () => {
    expect(model.unparsedRegions).toEqual([
      { startLine: 4, endLine: 4, label: 'B' },
    ])
  })
})

describe('unparsed regions - nested demoted stages collapse into one region', () => {
  // 'B' sits inside broken 'A'; 'C' inside 'D'. B and D are contained in
  // their parents' spans, so each breakage yields exactly one ghost.
  const DOUBLE = `pipeline {
  stages {
    stage('A') { steps { echo 'a' }
    stage('B') { steps { echo 'b' } }
    stage('C') { steps { echo 'c' }
    stage('D') { steps { echo 'd' } }
  }
}
`
  const model = parseJenkinsfile(DOUBLE)

  it('emits outermost-region ghosts in document order', () => {
    expect(model.unparsedRegions.map((r) => r.label)).toEqual(['B', 'C'])
    const [, second] = model.unparsedRegions
    expect(second?.startLine).toBe(5)
    expect(second?.endLine).toBeGreaterThanOrEqual(6)
  })
})

describe('unparsed regions - two rendered stages sharing one source line', () => {
  // Both stage calls sit on line 4 and both render as separate cards. The
  // rendered-line bookkeeping must count multiplicity, or the second call
  // looks unrendered and produces a false ghost (regression).
  const SHARED_LINE = `pipeline {
  stages {
    stage('A') { steps { echo 'a' } }; stage('B') { steps { echo 'b' } }
  }
}
`
  const model = parseJenkinsfile(SHARED_LINE)

  it('renders both same-line stages', () => {
    expect(model.rootStages.map((s) => s.name)).toEqual(['A', 'B'])
    expect(new Set(model.rootStages.map((s) => s.line))).toEqual(new Set([3]))
  })

  it('reports no unparsed material', () => {
    expect(model.unparsedRegions).toEqual([])
  })
})

describe('unparsed regions - scripted nesting is rendering, not loss', () => {
  // Scripted containment deliberately nests inner stages as sequential
  // children. Both calls render, so nothing counts as unparsed.
  const NESTED = `node {
  stage('A') {
    echo 'a'
    stage('B') { echo 'b' }
  }
}
`
  const model = parseJenkinsfile(NESTED)

  it('keeps the region list empty when every call rendered', () => {
    expect(model.kind).toBe('scripted')
    expect(model.rootStages[0]?.sequentialChildren?.map((s) => s.name)).toEqual(['B'])
    expect(model.unparsedRegions).toEqual([])
  })
})

describe('unparsed regions - corpus and degenerate inputs', () => {
  it('flags exactly the messy sample\'s swallowed "Never Reached" stage', () => {
    const source = req(sampleById('messy-realworld'), 'messy sample').source
    const model = parseJenkinsfile(source)
    expect(model.unparsedRegions).toHaveLength(1)
    const [region] = model.unparsedRegions
    expect(region?.label).toBe('Never Reached')
    // The span starts at the swallowed call's own line...
    const demotedStep = req(model.rootStages[2]).steps.find((step) => step.name === 'stage')
    expect(region?.startLine).toBe(req(demotedStep).line)
    // ...and extends to the end of that block's recovered content.
    expect(region?.endLine).toBeGreaterThanOrEqual(region?.startLine ?? 0)
  })

  it('stays empty for every clean corpus sample', () => {
    for (const id of ['simple-ci', 'parallel-tests', 'matrix-build', 'conditional-deploy']) {
      const source = req(sampleById(id), `sample ${id}`).source
      expect(parseJenkinsfile(source).unparsedRegions).toEqual([])
    }
  })

  it('never produces regions for empty or garbage input', () => {
    expect(parseJenkinsfile('').unparsedRegions).toEqual([])
    expect(parseJenkinsfile('   \n\t  ').unparsedRegions).toEqual([])
    expect(parseJenkinsfile('}}} not groovy {{{').unparsedRegions).toEqual([])
  })
})
