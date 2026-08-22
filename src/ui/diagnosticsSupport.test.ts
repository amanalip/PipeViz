// ---------------------------------------------------------------------------
// ui/diagnosticsSupport.test.ts - partial-graph accounting (mockup §15).
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'

import { candidateStageCount, partialGraphNote } from './diagnosticsSupport'

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
