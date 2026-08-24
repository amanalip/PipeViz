// ---------------------------------------------------------------------------
// ui/SamplePicker.tsx - the header "Samples ▾" dropdown (mockups §12).
//
// Searchable, categorized menu over the bundled catalog: click toggles,
// ArrowUp/Down moves, Enter picks, Escape or an outside click dismisses.
// Focus stays on the button until the user enters the search field.
//
// Samples that ship with known defects carry a diagnostic-count badge,
// computed by actually parsing each source once at mount, so the
// badge can never drift from what the diagnostics bar will really show.
// ---------------------------------------------------------------------------

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'

import { parseJenkinsfile } from '../parser'
import { SAMPLE_CATEGORIES, SAMPLE_CATEGORY_LABELS } from '../samples'
import type { Sample } from '../samples'

/** Imperative handle App uses to drive the picker from outside React flow. */
export interface SamplePickerApi {
  /**
   * Open the dropdown and put keyboard focus on its trigger button, so
   * arrow/Enter selection works immediately (empty-state Samples chip).
   */
  openMenu(): void
}

interface SamplePickerProps {
  samples: readonly Sample[]
  onPick: (sample: Sample) => void
  /** Receives the SamplePickerApi once mounted; optional like EditorPane's. */
  apiRef?: RefObject<SamplePickerApi | null>
}

export function SamplePicker({ samples, onPick, apiRef }: SamplePickerProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [query, setQuery] = useState('')
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

  const filteredSamples = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    const matches = !needle ? samples : samples.filter((sample) =>
      `${sample.name} ${sample.description} ${SAMPLE_CATEGORY_LABELS[sample.category]}`
        .toLocaleLowerCase()
        .includes(needle),
    )
    return SAMPLE_CATEGORIES.flatMap((category) =>
      matches.filter((sample) => sample.category === category),
    )
  }, [query, samples])

  const groupedSamples = useMemo(() => SAMPLE_CATEGORIES.map((category) => ({
    category,
    samples: filteredSamples.filter((sample) => sample.category === category),
  })).filter((group) => group.samples.length > 0), [filteredSamples])

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
        setQuery('')
        setActive(0)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        setQuery('')
        setActive(0)
      }
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
    if (!open || filteredSamples[active] === undefined) return
    document
      .getElementById(`samples-opt-${filteredSamples[active].id}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, active, filteredSamples])

  function choose(sample: Sample) {
    onPick(sample)
    setOpen(false)
    setActive(0)
    setQuery('')
    buttonRef.current?.focus()
  }

  useImperativeHandle(apiRef, () => ({
    openMenu() {
      setOpen(true)
      setActive(0)
      buttonRef.current?.focus()
    },
  }))

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (!open) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive((index) => Math.min(index + 1, Math.max(0, filteredSamples.length - 1)))
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
        setActive(Math.max(0, filteredSamples.length - 1))
        break
      case 'Enter':
        event.preventDefault()
        if (filteredSamples[active]) choose(filteredSamples[active])
        break
      case 'Tab':
        setOpen(false)
        setQuery('')
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
        aria-activedescendant={open && filteredSamples[active] ? `samples-opt-${filteredSamples[active].id}` : undefined}
        onClick={() => {
          if (open) {
            setQuery('')
            setActive(0)
          }
          setOpen((value) => !value)
        }}
        onKeyDown={handleKeyDown}
      >
        Samples ▾
      </button>
      {open && (
        <div className="samples-popover">
          <label className="samples-search">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="4.25" />
              <path d="m10.25 10.25 3 3" />
            </svg>
            <input
              type="search"
              value={query}
              aria-label="Search sample pipelines"
              aria-controls="samples-menu"
              aria-activedescendant={filteredSamples[active] ? `samples-opt-${filteredSamples[active].id}` : undefined}
              placeholder="Find a sample..."
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
              onKeyDown={handleKeyDown}
            />
            <span>{filteredSamples.length}</span>
          </label>
          <ul className="samples-menu" id="samples-menu" role="listbox" aria-label="Bundled sample pipelines">
            {groupedSamples.map((group) => (
              <li key={group.category} className="samples-category" role="presentation">
                <div className="samples-category-label">{SAMPLE_CATEGORY_LABELS[group.category]}</div>
                <ul role="group" aria-label={SAMPLE_CATEGORY_LABELS[group.category]}>
                  {group.samples.map((sample) => {
                    const index = filteredSamples.indexOf(sample)
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
              </li>
            ))}
            {filteredSamples.length === 0 && (
              <li className="samples-empty" role="presentation">No matching samples</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
