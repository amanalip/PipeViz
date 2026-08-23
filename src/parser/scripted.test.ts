// ---------------------------------------------------------------------------
// parser/scripted.test.ts - scripted pipeline fallback (plan §6.4).
//
// Coverage targets: marker detection, stage discovery in document order,
// node-label agent inheritance, nested-stage containment with step dedup,
// id determinism, and the empty-scan warning path.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import { parseJenkinsfile, tokenize } from './index'
import { hasScriptedMarkers } from './scripted'
import type { PipelineModel } from '../model/types'

const parse = (src: string): PipelineModel => parseJenkinsfile(src)
const markers = (src: string): boolean => hasScriptedMarkers(tokenize(src).tokens)

describe('hasScriptedMarkers', () => {
  it('detects stage( and node( calls', () => {
    expect(markers("stage('a') {}")).toBe(true)
    expect(markers('node("linux") {}')).toBe(true)
    expect(markers('node  ( )')).toBe(true) // whitespace between
  })

  it('rejects declarative-only or plain text input', () => {
    expect(markers('pipeline { stages {} }')).toBe(false)
    expect(markers('echo hello')).toBe(false)
    // Brace-form node without a call paren is not recognized; documented
    // limitation of the marker heuristic.
    expect(markers('node { echo x }')).toBe(false)
  })

  it('ignores mentions inside comments and strings', () => {
    // Regression: the old raw-text regex treated these as scripted calls.
    expect(markers("// note: call stage('x') later")).toBe(false)
    expect(markers("def help = 'use stage(name) blocks'")).toBe(false)
  })
})

describe('scripted detection end to end', () => {
  it('stays out of scripted mode when stage( only appears in comments', () => {
    const model = parse("// stage('Ghost') { }\nfoo = 1\n")
    expect(model.kind).toBe('declarative')
    expect(model.rootStages).toEqual([])
    expect(model.diagnostics.some((d) => d.message.includes('Scripted pipeline detected'))).toBe(
      false,
    )
  })
})

describe('scripted interpretation', () => {
  it('produces kind scripted with a single advisory warning', () => {
    const model = parse(["node('x') {", "  stage('s') { echo hi }", '}'].join('\n'))
    expect(model.kind).toBe('scripted')
    const warnings = model.diagnostics.filter((d) => d.severity === 'warning')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.message).toContain('Scripted pipeline detected')
  })

  it('inherits the enclosing node label as agent for every stage', () => {
    const model = parse(
      [
        "node('docker && linux') {",
        "  stage('one') { sh 'a' }",
        "  stage('two') { sh 'b' }",
        '}',
      ].join('\n'),
    )
    expect(model.rootStages.map((s) => s.name)).toEqual(['one', 'two'])
    expect(model.agent).toBeUndefined()
    for (const stage of model.rootStages) {
      expect(stage.agent).toBe("node 'docker && linux'")
    }
  })

  it('nests contained stages under their parent without duplicating steps', () => {
    const model = parse(
      [
        'node {',
        "  stage('outer') {",
        "    echo 'own'",
        "    stage('inner') {",
        "      echo 'in'",
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    const outer = model.rootStages[0]
    expect(outer?.name).toBe('outer')
    expect(outer?.steps.map((s) => s.args)).toEqual(["'own'"]) // inner's content excluded
    expect(outer?.sequentialChildren?.map((c) => c.name)).toEqual(['inner'])
  })

  it('assigns deterministic sequential ids in document order across nesting', () => {
    const src = [
      "node('n') {",
      "  stage('a') {",
      "    stage('a1') { echo 1 }",
      '  }',
      "  stage('b') { echo 2 }",
      "  try {",
      "    stage('c') { echo 3 }",
      '  } catch (err) {',
      '    throw err',
      '  } finally {',
      '    echo cleanup',
      '  }',
      '}',
    ].join('\n')
    const first = parse(src)
    const second = parse(src)
    const ids = [
      ...first.rootStages.map((s) => s.id),
      ...(first.rootStages[0]?.sequentialChildren ?? []).map((s) => s.id),
    ]
    expect(first.rootStages.map((s) => s.name)).toEqual(['a', 'b', 'c'])
    expect(ids[1]).toMatch(/^s\d+$/)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('records def assignments and control flow as script steps inside their stage', () => {
    const model = parse(
      [
        'node {',
        "  stage('logic') {",
        '    def n = 3',
        '    if (n > 2) {',
        "      echo big",
        '    }',
        "    sh 'tail'",
        '  }',
        '}',
      ].join('\n'),
    )
    const logic = model.rootStages[0]
    expect(logic?.steps.map((s) => `${s.kind}:${s.name}`)).toEqual([
      'script:def',
      'script:if',
      'known:echo',
      'known:sh',
    ])
  })

  it('warns when markers exist but no stage bodies are found', () => {
    const model = parse('node("x") {\n  echo lonely\n}')
    expect(model.kind).toBe('scripted')
    expect(model.rootStages).toEqual([])
    const messages = model.diagnostics.map((d) => d.message)
    expect(messages.some((m) => m.includes('No stage(...) calls'))).toBe(true)
  })

  it('keeps docker.build-style chained calls intact', () => {
    const model = parse(
      ['node {', "  stage('img') {", "    image = docker.build('app:1')", '  }', '}'].join('\n'),
    )
    const img = model.rootStages[0]
    expect(img?.steps[0]).toMatchObject({ name: 'image', kind: 'script' })
  })
})
