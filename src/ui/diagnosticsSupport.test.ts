// ---------------------------------------------------------------------------
// ui/diagnosticsSupport.test.ts - partial-graph accounting (mockup §15)
// plus diagnostic → stage-card mapping (§11 click-to-flash).
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'

import type { PositionedStage } from '../layout/computeLayout'
import { candidateStageCount, partialGraphNote, stageForDiagnostic } from './diagnosticsSupport'

describe('candidateStageCount', () => {
  it('counts declarative stage blocks', () => {
    const source = [
      'pipeline {',
      '  stages {',
      "    stage('Checkout') { steps { checkout scm } }",
      "    stage('Build') { steps { sh 'make' } }",
      '  }',
      '}',
    ].join('\n')
    expect(candidateStageCount(source)).toBe(2)
  })

  it('counts scripted stage calls too', () => {
    expect(candidateStageCount("node {\n  stage('A') {}\n  stage('B') {}\n}")).toBe(2)
  })

  it('requires the call parens - bare words do not count', () => {
    expect(candidateStageCount('stages { }\n// stage planning meeting')).toBe(0)
  })

  it('ignores commented-out stage calls instead of counting fake stages', () => {
    const source = [
      '// stage(\'Ghost One\') {}',
      '/* stage("Ghost Two") {} */',
      "stage('Real') {}",
    ].join('\n')
    expect(candidateStageCount(source)).toBe(1)
  })

  it('ignores stage calls inside string literals', () => {
    expect(candidateStageCount("echo 'stage(fake)'\nsh \"echo stage(alsoFake)\"")).toBe(0)
  })

  it('is zero on empty input', () => {
    expect(candidateStageCount('')).toBe(0)
  })
})

describe('partialGraphNote', () => {
  it('reports the rendered fraction when candidates exceed surfaces', () => {
    expect(partialGraphNote(3, 5)).toBe('Partial graph: 3 of 5 stages rendered')
  })

  it('stays null when everything rendered', () => {
    expect(partialGraphNote(4, 4)).toBeNull()
    expect(partialGraphNote(6, 4)).toBeNull()
  })

  it('never claims fewer stages than were rendered', () => {
    const note = partialGraphNote(5, 5)
    expect(note).toBeNull()
  })
})

describe('stageForDiagnostic', () => {
  const nodes: PositionedStage[] = [
    { id: 's0', name: 'Checkout', line: 1, endLine: 4, steps: [], x: 0, y: 0, width: 220, height: 72 },
    { id: 's1', name: 'Group', line: 6, endLine: 40, steps: [], x: 310, y: 0, width: 220, height: 72 },
    // A sequential child nested inside s1's span.
    { id: 's1/sq0', name: 'Inner', line: 10, endLine: 20, steps: [], x: 620, y: 0, width: 220, height: 72 },
    // Ghost leaves have no meaningful span beyond their start line.
    { id: 'u0', name: 'unparsed', line: 44, steps: [], ghost: true, x: 930, y: 0, width: 220, height: 72 },
  ]

  it('prefers an exact opening-line match', () => {
    expect(stageForDiagnostic(nodes, 6)?.id).toBe('s1')
    expect(stageForDiagnostic(nodes, 1)?.id).toBe('s0')
  })

  it('maps a mid-body diagnostic to its containing card', () => {
    // Line 35 sits inside s1's body but after the child closed: s1 wins.
    expect(stageForDiagnostic(nodes, 35)?.id).toBe('s1')
  })

  it('picks the innermost stage when spans nest', () => {
    // Line 15 is inside both s1 and s1/sq0; the innermost must win.
    expect(stageForDiagnostic(nodes, 15)?.id).toBe('s1/sq0')
  })

  it('falls back to null when nothing spans the line', () => {
    expect(stageForDiagnostic(nodes, 50)).toBeNull()
    expect(stageForDiagnostic([], 6)).toBeNull()
  })
})
