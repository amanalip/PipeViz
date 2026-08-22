// ---------------------------------------------------------------------------
// parser/blockTree.ts - balanced brace matching into a block tree (plan §6.2).
//
// A single pass over the token stream turns `{`/`}` pairs into BlockNodes.
// The `header` is every token between the enclosing scope's last boundary
// and this block's opening brace, e.g. [stage, (, 'Build', )] for a stage.
//
// Children preserve document order as either nested BlockNodes or TokenRuns
// (statements that live between blocks, such as step calls inside `steps`).
// That ordering matters: steps must appear in source order in the details
// panel even when interleaved with braced constructs like `script { ... }`.
//
// Recovery contract (plan §6.5): stray closing braces and braces left open
// at EOF become diagnostics; parsing continues with whatever did balance,
// so the user always gets a partial graph instead of an exception.
// ---------------------------------------------------------------------------

import type { Token } from './tokenize'
import { splitStatements } from './statements'
import type { Diagnostic } from '../model/types'

/** Loose statement tokens sitting between child blocks. */
export interface TokenRun {
  kind: 'run'
  tokens: Token[]
}

export interface BlockNode {
  kind: 'block'
  /** Tokens before the opening brace: callee name + argument list. */
  header: Token[]
  children: TreeNode[]
  /** Line of the first header token (falls back to the brace line). */
  startLine: number
  /** Line of the matching close brace (or EOF when unbalanced). */
  endLine: number
  openLine: number
  /** True when this block was closed by EOF recovery rather than a real }. */
  unclosed: boolean
}

export type TreeNode = BlockNode | TokenRun

export interface BlockTreeResult {
  /** Synthetic root wrapping the whole file; header is always empty. */
  root: BlockNode
  diagnostics: Diagnostic[]
}

function isOpen(token: Token): boolean {
  return token.type === 'punct' && token.value === '{'
}

function isClose(token: Token): boolean {
  return token.type === 'punct' && token.value === '}'
}

/**
 * Build the block tree from tokens. Never throws.
 * Unbalanced braces produce error diagnostics and best-effort recovery.
 */
export function buildBlockTree(tokens: readonly Token[]): BlockTreeResult {
  const diagnostics: Diagnostic[] = []
  const lastLine = tokens.length > 0 ? (tokens[tokens.length - 1]?.line ?? 1) : 1

  const root: BlockNode = {
    kind: 'block',
    header: [],
    children: [],
    startLine: 1,
    endLine: lastLine,
    openLine: 0,
    unclosed: false,
  }

  // Stack of currently-open blocks; the synthetic root never leaves it.
  const stack: BlockNode[] = [root]
  // Tokens accumulating for the next construct inside stack top: either a
  // block's future header or a loose run, decided by what token comes next.
  let pendingHeader: Token[] = []

  const top = (): BlockNode => {
    const node = stack[stack.length - 1]
    return node ?? root
  }

  const flushRunInto = (parent: BlockNode): void => {
    if (pendingHeader.length > 0) {
      parent.children.push({ kind: 'run', tokens: pendingHeader })
      pendingHeader = []
    }
  }

  for (const token of tokens) {
    if (isOpen(token)) {
      // The pending run may hold several brace-less statements that merely
      // PRECEDE this block (classic case: `agent any` above `stages {`).
      // Split them; only the final statement becomes the block's header.
      const statements = splitStatements(pendingHeader)
      pendingHeader = []
      const parent = top()
      const headerCount = statements.length
      for (let s = 0; s < headerCount - 1; s += 1) {
        const stmt = statements[s]
        if (stmt) parent.children.push({ kind: 'run', tokens: stmt.tokens })
      }
      const headerStmt = headerCount > 0 ? statements[headerCount - 1] : undefined
      const node: BlockNode = {
        kind: 'block',
        header: headerStmt ? headerStmt.tokens : [],
        children: [],
        startLine: headerStmt ? (headerStmt.tokens[0]?.line ?? token.line) : token.line,
        endLine: lastLine,
        openLine: token.line,
        unclosed: true, // flipped off when a real } closes it
      }
      parent.children.push(node)
      stack.push(node)
      continue
    }

    if (isClose(token)) {
      if (stack.length <= 1) {
        diagnostics.push({
          severity: 'error',
          message: "Unexpected '}' with no matching '{'",
          line: token.line,
        })
        continue
      }
      const closing = stack.pop()
      if (closing) {
        flushRunInto(closing) // trailing statements before '}' keep order
        closing.endLine = token.line
        closing.unclosed = false
      }
      continue
    }

    pendingHeader.push(token)
  }

  // EOF with blocks still open: report each and recover implicitly (children
  // are already attached to their parents, so partial structure survives).
  for (const node of stack.slice(1).reverse()) {
    diagnostics.push({
      severity: 'error',
      message:
        node.header.length > 0
          ? `'{' opened here is never closed`
          : "Unbalanced '{' at top level",
      line: node.startLine,
    })
  }

  // Any leftover tokens after the last close become one trailing run.
  flushRunInto(top())

  return { root, diagnostics }
}
