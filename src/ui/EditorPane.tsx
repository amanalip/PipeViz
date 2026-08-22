// ---------------------------------------------------------------------------
// ui/EditorPane.tsx - the 380px source column (mockups §13).
//
// Extracted from App at M4 per the region->component map (§18): label bar,
// textarea, footer counters. Behaviors owned here so App stays wiring only:
//   - Tab inserts two spaces; the caret never leaves the editor
//   - line/word counters recomputed from live text
//   - `apiRef` exposes revealLine() so diagnostics rows and card
//     double-clicks can jump the caret to a source line (mockups §11/§17)
// ---------------------------------------------------------------------------

import { useImperativeHandle, useMemo, useRef } from 'react'
import type { KeyboardEvent, RefObject } from 'react'

/** Imperative handle App uses to drive the textarea from outside React flow. */
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

export function EditorPane({ value, onChange, apiRef }: EditorPaneProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Footer counters (mockup §13); memoized so typing stays cheap.
  const stats = useMemo(() => {
    const trimmed = value.trim()
    return {
      lines: value.length === 0 ? 0 : value.split('\n').length,
      words: trimmed === '' ? 0 : trimmed.split(/\s+/).length,
    }
  }, [value])

  useImperativeHandle(
    apiRef,
    () => ({
      revealLine(line: number) {
        const el = textareaRef.current
        if (!el) return
        const lines = el.value.split('\n')
        const index = Math.min(Math.max(line, 1), lines.length) - 1
        let offset = 0
        for (let i = 0; i < index; i++) offset += (lines[i]?.length ?? 0) + 1
        el.focus()
        el.setSelectionRange(offset, offset)
        // Scroll target two lines above so context stays visible; lineHeight
        // comes from CSS (13px * 1.6), with a safe fallback if it reports unitless.
        const lineHeight = Number.parseFloat(window.getComputedStyle(el).lineHeight) || 21
        el.scrollTop = Math.max(0, (index - 2) * lineHeight)
      },
    }),
    [],
  )

  /** Insert two spaces on Tab instead of moving focus (mockup §4 note). */
  function handleTabKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const el = event.currentTarget
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = `${el.value.slice(0, start)}  ${el.value.slice(end)}`
    onChange(next)
    requestAnimationFrame(() => {
      el.selectionStart = start + 2
      el.selectionEnd = start + 2
    })
  }

  return (
    <section className="editor-pane" aria-label="Pipeline source editor">
      <label className="pane-title" htmlFor="pipeline-source">
        Pipeline source
      </label>
      <textarea
        id="pipeline-source"
        ref={textareaRef}
        className="editor-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleTabKey}
        placeholder={'# Paste a declarative or scripted Jenkinsfile here.\n\nExample:\npipeline {\n  agent any\n  stages {\n    stage(\'Build\') {\n      steps {\n        sh \'make build\'\n      }\n    }\n  }\n}'}
        spellCheck={false}
        autoFocus
      />
      <footer className="editor-stats">
        <span>{stats.lines} lines</span>
        <span>{stats.words} words</span>
      </footer>
    </section>
  )
}
