// ---------------------------------------------------------------------------
// parser/statements.ts - Groovy statement splitting over flat token runs.
//
// Groovy treats a newline as a statement terminator (and `;` explicitly so),
// but braces are structural and already consumed by the block tree. What is
// left over - brace-less directives (`agent any`), step calls, assignments -
// must be grouped into logical statements before interpretation.
//
// Splitting rules, tuned to real-world Jenkinsfiles:
//   1. A token whose `nlBefore` flag is set starts a new statement, UNLESS
//      we are inside parens/brackets (multi-line argument lists), the
//      previous token ends in an operator/comma/colon (deliberate line
//      continuation), or the token itself is a leading method-chain dot.
//   2. A `;` at depth zero always terminates the current statement.
// ---------------------------------------------------------------------------

import type { Token } from './tokenize'

/** One logical statement: a flat, ordered slice of tokens. */
export interface Statement {
  tokens: Token[]
}

/**
 * Punct tokens that continue their statement onto the next line even when
 * the next token begins on a fresh line: trailing comma/colon/equals, math
 * and logical operators, and comparison forms.
 */
const CONTINUING_PUNCT = new Set([
  ',',
  ':',
  '=',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '&',
  '|',
  '^',
  '~',
  '!',
  '?',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '?.',
  '?:',
  '<<',
  '>>',
  '**',
])

function continuesStatement(prev: Token): boolean {
  return prev.type === 'punct' && CONTINUING_PUNCT.has(prev.value)
}

/**
 * Group tokens into statements. Depth tracking keeps multi-line call
 * arguments together; nlBefore plus continuation rules do the rest.
 */
export function splitStatements(tokens: readonly Token[]): Statement[] {
  const statements: Statement[] = []
  let current: Token[] = []
  let parenDepth = 0
  let bracketDepth = 0

  const flush = (): void => {
    if (current.length > 0) {
      statements.push({ tokens: current })
      current = []
    }
  }

  for (const token of tokens) {
    if (token.type === 'punct') {
      // Semicolons terminate immediately; other delimiters adjust depth.
      if (token.value === ';' && parenDepth === 0 && bracketDepth === 0) {
        flush()
        continue
      }
      if (token.value === '(') parenDepth += 1
      else if (token.value === ')') parenDepth = Math.max(0, parenDepth - 1)
      else if (token.value === '[') bracketDepth += 1
      else if (token.value === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    }

    const prev = current[current.length - 1]
    // A leading dot glues a fluent-method chain onto the previous line's
    // expression, no matter what the line above ended with.
    const leadingDot = token.type === 'punct' && token.value === '.'
    const boundary =
      token.nlBefore &&
      current.length > 0 &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      prev !== undefined &&
      !continuesStatement(prev) &&
      !leadingDot

    if (boundary) flush()
    current.push(token)
  }
  flush()

  return statements
}
