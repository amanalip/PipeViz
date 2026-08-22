// ---------------------------------------------------------------------------
// parser/tokenize.ts - string/comment aware tokenizer (plan §6.1).
//
// Design notes:
//   - Every token keeps its 1-based source `line` so diagnostics can point
//     at real locations even after comments and blank lines are dropped.
//   - Token offsets (`start`/`end`) index the ORIGINAL text, letting the
//     interpreter slice raw argument text verbatim (multiline sh scripts
//     survive intact instead of being re-joined from tokens).
//   - All four Groovy quote forms are handled ('…', "…", '''…''', """…""),
//     with backslash escapes. Inside double-quoted forms ${ … } interpolation
//     is consumed with brace counting so braces inside expressions never
//     confuse the block matcher downstream.
//   - Comments are stripped here; nothing else in the pipeline sees them.
//   - tokenize() NEVER throws: malformed input yields diagnostics instead.
// ---------------------------------------------------------------------------

import type { Diagnostic } from '../model/types'

export type TokenType = 'ident' | 'string' | 'number' | 'punct'

export interface Token {
  type: TokenType
  /** Decoded content: unquoted for strings, raw slice otherwise. */
  value: string
  /** Original source slice including quotes for strings. */
  raw: string
  start: number
  end: number
  line: number
  /**
   * True when a line break was crossed between the previous token and this
   * one. Groovy treats newlines as statement terminators, so this flag is
   * what lets the interpreter split brace-less statements apart.
   */
  nlBefore: boolean
}

export interface TokenizeResult {
  tokens: Token[]
  diagnostics: Diagnostic[]
}

const IDENT_START = /[A-Za-z_$]/
const IDENT_PART = /[A-Za-z0-9_$]/
const PUNCT = new Set(['{', '}', '(', ')', '[', ']', ',', ':', '=', ';'])

/**
 * Consume one quoted literal starting at offset `start` (src[start] === quote).
 * Returns the offset just past the closing delimiter, the line number at
 * that point, and whether a real closing delimiter was found. Handles
 * backslash escapes, multi-line triple literals, and ${ … } interpolation
 * with brace counting plus nested-quote skipping so a brace or quote inside
 * an expression can never unbalance the stream.
 */
function scanString(
  src: string,
  start: number,
  quote: string,
  lineAtStart: number,
): { end: number; lineEnd: number; closed: boolean } {
  const triple = src.slice(start, start + 3) === quote.repeat(3)
  const delim = triple ? 3 : 1
  let line = lineAtStart
  let j = start + delim

  // Consume ${ … } interpolation; returns offset one past the balancing '}'.
  const skipInterpolation = (from: number): number => {
    let depth = 1
    let k = from + 2 // past '${'
    while (k < src.length && depth > 0) {
      const c = src.charAt(k)
      if (c === '{') depth += 1
      else if (c === '}') depth -= 1
      else if (c === '\n') line += 1
      else if (c === "'" || c === '"') {
        // Nested literal inside the expression: skip its contents wholesale.
        k += 1
        while (k < src.length && src.charAt(k) !== c) {
          if (src.charAt(k) === '\\') k += 1
          else if (src.charAt(k) === '\n') line += 1
          k += 1
        }
      }
      k += 1
    }
    return k
  }

  while (j < src.length) {
    const c = src.charAt(j)

    // Backslash escape: swallow the escaped character verbatim.
    if (c === '\\') {
      j += 2
      continue
    }

    // GString interpolation lives in double-quoted forms only.
    if ((quote === '"' || triple) && c === '$' && src.charAt(j + 1) === '{') {
      j = skipInterpolation(j)
      continue
    }

    // Newlines are legal only inside triple-quoted literals; a bare newline
    // under an unterminated normal string ends the token there (recovery).
    if (c === '\n') {
      if (!triple) return { end: j, lineEnd: line, closed: false }
      line += 1
      j += 1
      continue
    }

    if (!triple && c === quote) return { end: j + 1, lineEnd: line, closed: true }
    if (triple && c === quote && src.slice(j, j + 3) === quote.repeat(3)) {
      return { end: j + 3, lineEnd: line, closed: true }
    }

    j += 1
  }

  return { end: src.length, lineEnd: line, closed: false }
}

/**
 * Tokenize Jenkinsfile/Groovy source. Never throws.
 * Unterminated strings/comments become error/warning diagnostics.
 */
export function tokenize(source: string): TokenizeResult {
  const tokens: Token[] = []
  const diagnostics: Diagnostic[] = []
  let i = 0
  let line = 1
  // Set when whitespace skipping crossed a newline; consumed by the next
  // emitted token and then cleared. This is the statement-boundary signal.
  let nlBefore = false

  while (i < source.length) {
    const ch = source.charAt(i)

    // ---- Whitespace -------------------------------------------------------
    if (ch === '\n') {
      i += 1
      line += 1
      nlBefore = true
      continue
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i += 1
      continue
    }

    // ---- Comments ---------------------------------------------------------
    if (ch === '/' && source.charAt(i + 1) === '/') {
      while (i < source.length && source.charAt(i) !== '\n') i += 1
      continue
    }
    if (ch === '/' && source.charAt(i + 1) === '*') {
      const openLine = line
      i += 2
      let closed = false
      while (i < source.length) {
        if (source.charAt(i) === '*' && source.charAt(i + 1) === '/') {
          i += 2
          closed = true
          break
        }
        if (source.charAt(i) === '\n') line += 1
        i += 1
      }
      if (!closed) {
        diagnostics.push({
          severity: 'warning',
          message: 'Block comment is never closed',
          line: openLine,
        })
      }
      continue
    }

    // ---- Strings ----------------------------------------------------------
    if (ch === "'" || ch === '"') {
      const startLine = line
      const start = i
      const scanned = scanString(source, start, ch, startLine)
      line = scanned.lineEnd
      const raw = source.slice(start, scanned.end)
      // Decode display value: strip quotes, drop backslash escapes. A
      // recovered unterminated literal has no closing delimiter to trim.
      const triple = raw.startsWith(ch.repeat(3))
      const delim = triple ? 3 : 1
      const inner =
        scanned.closed && raw.length >= delim * 2
          ? raw.slice(delim, raw.length - delim)
          : raw.slice(delim)
      const value = inner.replace(/\\(.)/g, '$1')
      tokens.push({ type: 'string', value, raw, start, end: scanned.end, line: startLine, nlBefore })
      nlBefore = false
      // Recovery exit (newline or EOF instead of a closing delimiter) is an
      // error per plan §6.5; the token still emits so parsing continues.
      if (!scanned.closed) {
        diagnostics.push({
          severity: 'error',
          message: 'String literal opened here is never closed',
          line: startLine,
        })
      }
      i = scanned.end
      continue
    }

    // ---- Numbers ----------------------------------------------------------
    if (ch >= '0' && ch <= '9') {
      const start = i
      while (i < source.length && /[\d._]/.test(source.charAt(i))) i += 1
      const text = source.slice(start, i)
      tokens.push({ type: 'number', value: text, raw: text, start, end: i, line, nlBefore })
      nlBefore = false
      continue
    }

    // ---- Identifiers ------------------------------------------------------
    if (IDENT_START.test(ch)) {
      const start = i
      while (i < source.length && IDENT_PART.test(source.charAt(i))) i += 1
      const text = source.slice(start, i)
      tokens.push({ type: 'ident', value: text, raw: text, start, end: i, line, nlBefore })
      nlBefore = false
      continue
    }

    // ---- Punctuation --------------------------------------------------------
    if (PUNCT.has(ch)) {
      tokens.push({ type: 'punct', value: ch, raw: ch, start: i, end: i + 1, line, nlBefore })
      nlBefore = false
      i += 1
      continue
    }

    // Anything else (operators, dots, annotations' @, etc.) is not needed by
    // the interpreter - raw text access goes through token offsets instead.
    i += 1
  }

  return { tokens, diagnostics }
}
