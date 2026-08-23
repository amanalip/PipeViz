// ---------------------------------------------------------------------------
// parser/tokenize.test.ts - string/comment aware tokenizer units (plan §6.1).
//
// Coverage targets: all four Groovy quote forms, backslash escapes, ${ … }
// interpolation with nested braces/quotes, comment stripping (including
// unterminated block comments), line tracking, nlBefore statement-boundary
// flags, source-offset integrity, and the never-throw diagnostics contract.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import { tokenize } from './tokenize'

describe('tokenize - basic stream', () => {
  it('emits identifiers, numbers, and punctuation in order', () => {
    const { tokens } = tokenize('stage 42 { x9, 1.5; }')
    expect(tokens.map((t) => `${t.type}:${t.value}`)).toEqual([
      'ident:stage',
      'number:42',
      'punct:{',
      'ident:x9',
      'punct:,',
      'number:1.5',
      'punct:;',
      'punct:}',
    ])
  })

  it('keeps $ in identifiers for Groovy names', () => {
    const { tokens } = tokenize('$var _under dollar$')
    expect(tokens.map((t) => t.value)).toEqual(['$var', '_under', 'dollar$'])
  })

  it('skips annotation markers but tokenizes operators and dots', () => {
    // Operators and the method-chain dot are emitted as punct tokens so
    // statement splitting can honor line continuations (statements.ts);
    // '@' stays outside the grammar.
    const { tokens } = tokenize('@Library a.b == c && d')
    expect(tokens.map((t) => t.value)).toEqual(['Library', 'a', '.', 'b', '==', 'c', '&&', 'd'])
  })

  it('prefers two-character operators over two single-character ones', () => {
    const { tokens } = tokenize('a == b != c <= d >= e')
    expect(tokens.filter((t) => t.type === 'punct').map((t) => t.value)).toEqual([
      '==',
      '!=',
      '<=',
      '>=',
    ])
  })
})

describe('tokenize - strings', () => {
  it('decodes single-quoted strings with escapes', () => {
    const { tokens } = tokenize("'a\\'b\\\\c'")
    expect(tokens).toHaveLength(1)
    const tok = tokens[0]
    expect(tok?.type).toBe('string')
    expect(tok?.value).toBe("a'b\\c")
    expect(tok?.raw).toBe("'a\\'b\\\\c'")
  })

  it('handles double quotes and keeps interpolation text verbatim', () => {
    const { tokens } = tokenize('"hello ${NAME} world"')
    const tok = tokens[0]
    expect(tok?.type).toBe('string')
    expect(tok?.value).toBe('hello ${NAME} world')
  })

  it('supports triple-single-quoted multi-line literals', () => {
    const src = "sh '''\nline one\nline two\n'''"
    const { tokens } = tokenize(src)
    expect(tokens).toHaveLength(2) // ident sh + one string token
    const str = tokens[1]
    expect(str?.type).toBe('string')
    expect(str?.value).toBe('\nline one\nline two\n')
    expect(str?.line).toBe(1) // line recorded at literal start
    expect(src.slice(str?.start ?? 0, str?.end ?? 0)).toBe("'''\nline one\nline two\n'''")
  })

  it('consumes ${ } interpolation with brace counting so blocks stay balanced', () => {
    const { tokens } = tokenize('"x ${ f({a: 1}) } y"')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.value).toBe('x ${ f({a: 1}) } y')
  })

  it('skips nested quotes inside interpolation expressions', () => {
    const { tokens, diagnostics } = tokenize("\"${m(\"it's\")}\" after }")
    expect(diagnostics).toEqual([])
    // The closing brace of `after }` is real punctuation again.
    expect(tokens.map((t) => t.type)).toContain('punct')
    const puncts = tokens.filter((t) => t.type === 'punct')
    expect(puncts.map((p) => p.value)).toEqual(['}'])
  })

  it('does not interpolate inside single-quoted strings', () => {
    const { tokens } = tokenize("'${NOT_INTERPOLATED} { }'")
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.value).toBe('${NOT_INTERPOLATED} { }')
  })

  it('does not interpolate inside triple-single-quoted strings', () => {
    // Groovy '''…''' literals are plain strings, so an unclosed ${ must not
    // swallow the rest of the document (regression: false parse errors).
    const src = "sh '''\necho ${UNMATCHED\n'''\necho ok"
    const { tokens, diagnostics } = tokenize(src)
    expect(diagnostics).toEqual([])
    expect(tokens.map((t) => t.value)).toEqual(['sh', '\necho ${UNMATCHED\n', 'echo', 'ok'])
  })

  it('still interpolates inside triple-double-quoted GStrings', () => {
    const { tokens } = tokenize('"""x ${NAME} y"""')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.value).toBe('x ${NAME} y')
  })

  it('protects braces inside slashy and dollar-slashy strings', () => {
    const slashy = tokenize('echo /}/\nstage after')
    expect(slashy.diagnostics).toEqual([])
    expect(slashy.tokens.map((token) => [token.type, token.value])).toEqual([
      ['ident', 'echo'],
      ['string', '}'],
      ['ident', 'stage'],
      ['ident', 'after'],
    ])

    const dollarSlashy = tokenize('echo $/{ "key": "}" }/$\nstage after')
    expect(dollarSlashy.diagnostics).toEqual([])
    expect(dollarSlashy.tokens[1]).toMatchObject({
      type: 'string',
      value: '{ "key": "}" }',
    })
    expect(dollarSlashy.tokens.filter((token) => token.type === 'punct')).toEqual([])
  })

  it('keeps division operators outside slashy contexts', () => {
    expect(tokenize('ratio = total/parts').tokens.map((token) => token.value)).toEqual([
      'ratio',
      '=',
      'total',
      '/',
      'parts',
    ])
  })

  it('keeps division inside slashy interpolation inside the string', () => {
    const { tokens, diagnostics } = tokenize('echo /ratio ${total / parts} and }/')
    expect(diagnostics).toEqual([])
    expect(tokens).toHaveLength(2)
    expect(tokens[1]).toMatchObject({
      type: 'string',
      value: 'ratio ${total / parts} and }',
    })
  })

  it('flags unterminated single-line strings as errors and recovers at newline', () => {
    const { tokens, diagnostics } = tokenize("sh 'abc\necho ok")
    expect(diagnostics).toEqual([
      { severity: 'error', message: 'String literal opened here is never closed', line: 1 },
    ])
    expect(tokens[0]?.value).toBe('sh') // ident before the bad literal
    expect(tokens[1]?.type).toBe('string')
    expect(tokens[1]?.value).toBe('abc') // recovered token still emitted
    expect(tokens[2]?.value).toBe('echo')
  })

  it('flags triple-quoted literals left open at EOF', () => {
    const { tokens, diagnostics } = tokenize('x """\nnever ends')
    expect(diagnostics).toEqual([
      { severity: 'error', message: 'String literal opened here is never closed', line: 1 },
    ])
    expect(tokens[0]?.value).toBe('x')
  })
})

describe('tokenize - comments', () => {
  it('strips line comments but preserves the newline boundary', () => {
    const { tokens } = tokenize('a // hidden\nb')
    const second = tokens[1]
    expect(second?.nlBefore).toBe(true)
    expect(second?.line).toBe(2)
  })

  it('strips block comments including their newlines', () => {
    const { tokens } = tokenize('a /* multi\nline */ b')
    expect(tokens.map((t) => t.value)).toEqual(['a', 'b'])
  })

  it('marks the token after a multiline block comment as newline-preceded', () => {
    // The comment swallowed the newline, so without this flag `b` would
    // look like a continuation of the same statement (regression).
    const { tokens } = tokenize('a /* multi\nline */ b')
    expect(tokens[1]?.nlBefore).toBe(true)
    expect(tokens[1]?.line).toBe(2)
  })

  it('keeps a same-line block comment transparent to statement boundaries', () => {
    const { tokens } = tokenize('a /* inline */ b')
    expect(tokens[1]?.nlBefore).toBe(false)
  })

  it('warns when a block comment is never closed', () => {
    const { diagnostics } = tokenize('a /* oops\nstill open')
    expect(diagnostics).toEqual([
      { severity: 'warning', message: 'Block comment is never closed', line: 1 },
    ])
  })

  it('ignores comment markers inside strings', () => {
    const { tokens } = tokenize("'url://not-a-comment /* neither */'")
    expect(tokens).toHaveLength(1)
  })
})

describe('tokenize - positions', () => {
  it('tracks 1-based lines across statements and multi-line strings', () => {
    const src = "a\nb '''\nspanned\n'''\nc"
    const { tokens } = tokenize(src)
    const lines = tokens.filter((t) => t.type === 'ident').map((t) => [t.value, t.line])
    expect(lines).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 5],
    ])
  })

  it('counts escaped newlines inside triple-quoted strings', () => {
    const src = "sh '''first\\\nsecond'''\nstage('After') {}"
    const { tokens } = tokenize(src)
    expect(tokens.find((token) => token.value === 'stage')?.line).toBe(3)
  })

  it('sets nlBefore only across newlines, not spaces or tabs', () => {
    const { tokens } = tokenize('a b\tc\nd')
    expect(tokens.map((t) => t.nlBefore)).toEqual([false, false, false, true])
  })

  it('returns offsets that slice back to the raw source', () => {
    const src = "dir('sub') { echo 1 }"
    const { tokens } = tokenize(src)
    for (const tok of tokens) {
      expect(src.slice(tok.start, tok.end)).toBe(tok.raw)
    }
  })

  it('tolerates CRLF input', () => {
    const { tokens, diagnostics } = tokenize('stage\r\nnext')
    expect(diagnostics).toEqual([])
    const next = tokens[1]
    expect(next?.value).toBe('next')
    expect(next?.line).toBe(2)
    expect(next?.nlBefore).toBe(true)
  })
})

describe('tokenize - robustness', () => {
  it('never throws on adversarial inputs and reports what it cannot read', () => {
    const cases = ['', '{', '"', "'", '"""', '${', '/*', '\\', '\u0000', '\ud83d\ude00 pipeline']
    for (const src of cases) {
      expect(() => tokenize(src)).not.toThrow()
      const result = tokenize(src)
      expect(Array.isArray(result.tokens)).toBe(true)
      expect(Array.isArray(result.diagnostics)).toBe(true)
    }
  })

  it('treats empty input as clean', () => {
    const { tokens, diagnostics } = tokenize('')
    expect(tokens).toEqual([])
    expect(diagnostics).toEqual([])
  })
})
