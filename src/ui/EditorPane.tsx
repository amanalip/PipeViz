// ---------------------------------------------------------------------------
// ui/EditorPane.tsx - the 380px source column (mockups §13), M6 edition.
//
// M6 swapped the plain textarea for CodeMirror 6 per the backlog, keeping
// this component's external contract byte-for-byte identical so App and the
// diagnostics jump-to-line story never noticed:
//   - props stay { value, onChange, apiRef }; App remains the single owner
//     of the text (CodeMirror is an uncontrolled engine behind a controlled
//     shell - prop changes dispatch into the view, view edits flow out via
//     onChange, and the sync effect guards against echo loops)
//   - EditorApi.revealLine(line) still focuses, places the caret at the
//     start of the (clamped) line, and scrolls it into view
//   - footer line/word counters still derive from the live text
//   - Tab still indents two spaces (indentUnit facet + indentWithTab keymap)
//
// What CodeMirror adds: Groovy syntax highlighting, line numbers, active-line
// marker, bracket matching, undo history, and line wrapping. Styling goes
// through CSS variables (var(--ink) etc.), so highlighting follows the dark/
// light theme switch with zero extra code.
// ---------------------------------------------------------------------------

import { useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import type { RefObject } from 'react'

import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  HighlightStyle,
  StreamLanguage,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language'
import { groovy } from '@codemirror/legacy-modes/mode/groovy'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers, placeholder } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

/** Imperative handle App uses to drive the editor from outside React flow. */
export interface EditorApi {
  /**
   * Focus the editor and place the caret at the start of `line` (1-based),
   * scrolling the line into view. Out-of-range lines clamp silently.
   */
  revealLine(line: number): void
}

interface EditorPaneProps {
  /** Live editor contents; the single source of truth lives in App. */
  value: string
  onChange: (next: string) => void
  /** Receives the EditorApi once mounted; optional for storybook-ish use. */
  apiRef?: RefObject<EditorApi | null>
}

/**
 * Syntax colors straight from the design tokens; because these compile to
 * class rules, the CSS variables re-resolve when [data-theme] flips.
 */
const PIPEVIZ_HIGHLIGHT = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--accent)' },
  { tag: t.controlKeyword, color: 'var(--accent)' },
  { tag: t.moduleKeyword, color: 'var(--accent)' },
  { tag: t.string, color: 'var(--success)' },
  { tag: t.number, color: 'var(--warning)' },
  { tag: t.comment, color: 'var(--ink-muted)', fontStyle: 'italic' },
  { tag: t.definition(t.variableName), color: 'var(--accent-2)' },
  { tag: t.variableName, color: 'var(--ink)' },
  { tag: t.function(t.variableName), color: 'var(--accent-2)' },
  { tag: t.operator, color: 'var(--ink-secondary)' },
  { tag: t.punctuation, color: 'var(--ink-secondary)' },
])

/** Layout chrome: transparent surfaces so the pane's own background shows. */
const PIPEVIZ_THEME = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: 'transparent',
    color: 'var(--ink)',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.6',
    padding: '14px 0',
    overflow: 'auto',
  },
  '.cm-content': { caretColor: 'var(--accent)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--ink-muted)',
    border: 'none',
    paddingLeft: '12px',
  },
  '.cm-activeLine': { backgroundColor: 'var(--accent-soft)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink-secondary)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--accent-glow)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-placeholder': { color: 'var(--ink-muted)' },
})

export function EditorPane({ value, onChange, apiRef }: EditorPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // Latest onChange without rebuilding state extensions (keeps the mount
  // effect dependency-free).
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Footer counters (mockup §13); memoized so typing stays cheap.
  const stats = useMemo(() => {
    const trimmed = value.trim()
    return {
      lines: value.length === 0 ? 0 : value.split('\n').length,
      words: trimmed === '' ? 0 : trimmed.split(/\s+/).length,
    }
  }, [value])

  // Mount exactly one EditorView; StrictMode's double invoke destroys the
  // first instance cleanly, matching every other DOM-owning effect.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLine(),
      drawSelection(),
      history(),
      indentUnit.of('  '),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      StreamLanguage.define(groovy),
      syntaxHighlighting(PIPEVIZ_HIGHLIGHT),
      PIPEVIZ_THEME,
      EditorView.lineWrapping,
      placeholder(
        '# Paste a declarative or scripted Jenkinsfile here.\n\nExample:\npipeline {\n  agent any\n  stages {\n    stage(\'Build\') {\n      steps {\n        sh \'make build\'\n      }\n    }\n  }\n}',
      ),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString())
      }),
    ]

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: host,
    })
    viewRef.current = view
    view.focus()
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value is synced below, not here
  }, [])

  // External content swaps (samples, uploads, shared links, diagnostics-free
  // resets) push into the view; edits that originated inside it are no-ops.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (value !== current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  // Diagnostics rows and card double-clicks jump the caret here (§11/§17):
  // select the whole target line, center it, and focus the editor.
  useImperativeHandle(
    apiRef,
    () => ({
      revealLine(line: number) {
        const view = viewRef.current
        if (!view) return
        const target = Math.min(Math.max(line, 1), view.state.doc.lines)
        const lineInfo = view.state.doc.line(target)
        view.dispatch({
          selection: { anchor: lineInfo.from, head: lineInfo.to },
          effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
        })
        view.focus()
      },
    }),
    [viewRef],
  )

  return (    <section className="editor-pane" aria-label="Pipeline source editor">
      <label className="pane-title" htmlFor="pipeline-source">
        Pipeline source
      </label>
      <div id="pipeline-source" ref={hostRef} className="editor-host" />
      <footer className="editor-stats">
        <span>{stats.lines} lines</span>
        <span>{stats.words} words</span>
      </footer>
    </section>
  )
}

