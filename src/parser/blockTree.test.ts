// ---------------------------------------------------------------------------
// parser/blockTree.test.ts - brace matching into a block tree (plan §6.2).
//
// Coverage targets: nesting and header capture, statement runs interleaved
// with child blocks in document order, the `agent any` pre-header split,
// stray closing braces, blocks left open at EOF, and offset integrity.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import { buildBlockTree } from './blockTree'
import type { BlockNode, TreeNode } from './blockTree'
import { tokenize } from './tokenize'

function parse(src: string) {
  return buildBlockTree(tokenize(src).tokens)
}

const blocks = (nodes: readonly TreeNode[]): BlockNode[] =>
  nodes.filter((n): n is BlockNode => n.kind === 'block')

describe('buildBlockTree - structure', () => {
  it('wraps everything in a synthetic root with no header', () => {
    const { root, diagnostics } = parse('pipeline { agent any }')
    expect(diagnostics).toEqual([])
    expect(root.header).toEqual([])
    expect(root.openLine).toBe(0)
  })

  it('captures header tokens before the opening brace', () => {
    const { root } = parse("stage('Build') { sh 'x' }")
    const stage = blocks(root.children)[0]
    const header = stage?.header.map((t) => `${t.type}:${t.value}`)
    expect(header).toEqual(['ident:stage', 'punct:(', 'string:Build', 'punct:)'])
  })

  it('splits statements that merely precede a block out of its header', () => {
    // `agent any` is a complete brace-less statement; only the final
    // statement (`stages`) may become the block header.
    const { root } = parse('agent any\nstages { stage("a") {} }')
    const children = root.children
    expect(children[0]?.kind).toBe('run')
    const stagesBlock = blocks(children)[0]
    expect(stagesBlock?.header.map((t) => t.value)).toEqual(['stages'])
    expect(blocks(stagesBlock?.children ?? [])).toHaveLength(1)
  })

  it('preserves document order of interleaved runs and blocks', () => {
    const src = [
      'steps {',
      '  echo first',
      "  dir('sub') {",
      '    echo second',
      '  }',
      '  echo third',
      '}',
    ].join('\n')
    const { root } = parse(src)
    const steps = blocks(root.children)[0]
    const kinds = (steps?.children ?? []).map((c) => c.kind)
    expect(kinds).toEqual(['run', 'block', 'run'])
    const dir = blocks(steps?.children ?? [])[0]
    expect(dir?.header[0]?.value).toBe('dir')
  })

  it('records start/open/end lines for every block', () => {
    const { root } = parse('pipeline {\n  stages {\n    stage("x") {}\n  }\n}')
    const pipeline = blocks(root.children)[0]
    const stages = blocks(pipeline?.children ?? [])[0]
    expect(pipeline?.startLine).toBe(1)
    expect(pipeline?.openLine).toBe(1)
    expect(stages?.openLine).toBe(2)
    expect(stages?.endLine).toBe(4)
  })
})

describe('buildBlockTree - recovery', () => {
  it('reports stray closing braces as errors and keeps parsing', () => {
    const src = 'pipeline {}\n}\n}\nstage("after") {}'
    const { diagnostics } = parse(src)
    const strayErrors = diagnostics.filter((d) => d.message.includes('no matching'))
    expect(strayErrors.map((d) => d.line)).toEqual([2, 3])
    expect(strayErrors.every((d) => d.severity === 'error')).toBe(true)
  })

  it('reports unclosed blocks innermost-first at EOF', () => {
    const { diagnostics } = parse('pipeline {\n  stage("a") {\n    echo 1')
    expect(diagnostics.map((d) => d.line)).toEqual([2, 1])
    expect(diagnostics.every((d) => d.message.includes('never closed'))).toBe(true)
  })

  it('distinguishes anonymous top-level braces in messages', () => {
    const { diagnostics } = parse('{\n x\n')
    expect(diagnostics).toEqual([
      { severity: 'error', message: "Unbalanced '{' at top level", line: 1 },
    ])
  })

  it('keeps partial structure alive when braces are missing', () => {
    const { root, diagnostics } = parse('stages {\n  stage("ok") { echo 1 }\n  stage("tail") {')
    expect(diagnostics.length).toBeGreaterThan(0)
    const names = blocks(root.children[0]?.kind === 'block' ? root.children[0].children : []).map(
      (b) => b.header.find((t) => t.type === 'string')?.value,
    )
    expect(names).toEqual(['ok', 'tail'])
  })

  it('flushes trailing runs before a closing brace so order survives', () => {
    const { root } = parse('m {\n  a\n  b\n}')
    const m = blocks(root.children)[0]
    const trailing = m?.children.filter((c) => c.kind === 'run')
    expect(trailing).toHaveLength(1)
    const tokens = trailing?.[0]?.kind === 'run' ? trailing[0].tokens : []
    expect(tokens.map((t) => t.value)).toEqual(['a', 'b'])
  })
})

describe('buildBlockTree - offsets', () => {
  it('run token offsets slice back to the exact source text', () => {
    const src = "sh '''\nmulti\nline\n'''"
    const { tokens } = tokenize(src)
    const { root } = buildBlockTree(tokens)
    const run = root.children[0]
    expect(run?.kind).toBe('run')
    if (run?.kind === 'run') {
      expect(run.tokens.map((t) => src.slice(t.start, t.end))).toEqual([
        'sh',
        "'''\nmulti\nline\n'''",
      ])
    }
  })
})
