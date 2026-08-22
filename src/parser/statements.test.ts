// ---------------------------------------------------------------------------
// parser/statements.test.ts - Groovy statement splitting (plan §6, statements).
//
// Coverage targets: newline and semicolon terminators, paren/bracket depth
// keeping multi-line call arguments and map/array literals together, and
// trailing-operator line continuations.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import { splitStatements } from './statements'
import { tokenize } from './tokenize'

const split = (src: string): string[] =>
  splitStatements(tokenize(src).tokens).map((stmt) =>
    stmt.tokens.map((t) => t.value).join(' '),
  )

describe('splitStatements', () => {
  it('splits on newlines by default', () => {
    expect(split('a b\nc d')).toEqual(['a b', 'c d'])
  })

  it('treats semicolons as hard terminators', () => {
    expect(split('echo one; echo two; echo three')).toEqual([
      'echo one',
      'echo two',
      'echo three',
    ])
  })

  it('keeps multi-line argument lists together inside parens', () => {
    const src = [
      'withCredentials([',
        "usernamePassword(",
          "credentialsId: 'c',",
          "usernameVariable: 'U',",
        ')',
      ']) { x }',
    ].join('\n')
    expect(split(src)).toHaveLength(1)
  })

  it('keeps bracketed map literals spanning lines together', () => {
    const src = "publishHTML(target: [\n  reportDir: 'out',\n])"
    expect(split(src)).toEqual(['publishHTML ( target : [ reportDir : out , ] )'])
  })

  it('continues statements ending in an assignment operator', () => {
    expect(split('X =\n  42')).toEqual(['X = 42'])
  })

  it('resumes splitting after depth returns to zero', () => {
    const src = "sh (\n  script: 'a',\n)\necho next"
    expect(split(src)).toEqual(['sh ( script : a , )', 'echo next'])
  })

  it('never produces empty statements', () => {
    for (const src of ['', '\n\n', '; ;', 'a;\n;b', '( )']) {
      for (const stmt of splitStatements(tokenize(src).tokens)) {
        expect(stmt.tokens.length).toBeGreaterThan(0)
      }
    }
  })
})
