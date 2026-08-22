// ---------------------------------------------------------------------------
// ui/SamplePicker.tsx - the header "Samples ▾" dropdown (mockups §12).
//
// Native-feeling menu over the bundled corpus: click toggles, ArrowUp/Down
// moves, Enter picks, Escape or an outside click dismisses. Focus stays on
// the button while aria-activedescendant tracks the highlighted option.
//
// Samples that ship with known defects (the messy corpus entry) carry a ⚹-n
// badge - computed by actually parsing each source once at mount, so the
// badge can never drift from what the diagnostics bar will really show.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import { parseJenkinsfile } from '../parser'
import type { Sample } from '../samples'

interface SamplePickerProps {
  samples: readonly Sample[]
  onPick: (sample: Sample) => void
}

export function SamplePicker({ samples, onPick }: SamplePickerProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Diagnostic counts per sample id; parsed exactly like the app will.
  const issueCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const sample of samples) {
      counts.set(sample.id, parseJenkinsfile(sample.source).diagnostics.length)
    }
    return counts
  }, [samples])

  // Outside pointer press and global Escape both dismiss.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Keep the highlighted option visible while arrowing through a tall list.
  useEffect(() => {
    if (!open || samples[active] === undefined) return
    document
      .getElementById(`samples-opt-${samples[active].id}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, active, samples])

  function choose(sample: Sample) {
    onPick(sample)
    setOpen(false)
    setActive(0)
    buttonRef.current?.focus()
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!open) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive((index) => Math.min(index + 1, samples.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActive((index) => Math.max(index - 1, 0))
        break
      case 'Home':
        event.preventDefault()
        setActive(0)
        break
      case 'End':
        event.preventDefault()
        setActive(samples.length - 1)
        break
      case 'Enter':
        event.preventDefault()
        if (samples[active]) choose(samples[active])
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <div className="samples-root" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="samples-menu"
        aria-activedescendant={open && samples[active] ? `samples-opt-${samples[active].id}` : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleKeyDown}
      >
        Samples ▾
      </button>
      {open && (
        <ul className="samples-menu" id="samples-menu" role="listbox" aria-label="Bundled sample pipelines">
          {samples.map((sample, index) => {
            const issues = issueCounts.get(sample.id) ?? 0
            return (
              <li
                key={sample.id}
                id={`samples-opt-${sample.id}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? 'samples-option active' : 'samples-option'}
                title={sample.description}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(sample)}
              >
                <span className="samples-name">{sample.name}</span>
                {issues > 0 && (
                  <span className="samples-issue" title={`${issues} diagnostic${issues === 1 ? '' : 's'} expected`}>
                    ⚠ {issues}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
