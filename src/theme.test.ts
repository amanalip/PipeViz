// ---------------------------------------------------------------------------
// theme.test.ts - theme resolution and canvas palette contract (M6).
//
// sanitizeTheme is the boot-time gate: storage may hold anything, and the
// app must still come up dark unless the stored value is exactly 'light'.
// The palette record must stay exhaustive over Theme or FlowCanvas breaks.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'

import {
  CANVAS_PALETTES,
  THEME_STORAGE_KEY,
  loadStoredTheme,
  sanitizeTheme,
  storeTheme,
} from './theme'
import type { Theme } from './theme'

function fakeStorage(entries: Record<string, string> = {}): Storage & { thrown?: Error } {
  return {
    getItem: (key: string) => entries[key] ?? null,
    setItem: (key: string, value: string) => {
      entries[key] = value
    },
    removeItem: (key: string) => {
      delete entries[key]
    },
    clear: () => {
      for (const key of Object.keys(entries)) delete entries[key]
    },
    key: (index: number) => Object.keys(entries)[index] ?? null,
    get length() {
      return Object.keys(entries).length
    },
  } as Storage
}

describe('sanitizeTheme', () => {
  it('accepts exactly light and maps everything else to dark', () => {
    expect(sanitizeTheme('light')).toBe('light')
    expect(sanitizeTheme('dark')).toBe('dark')
    expect(sanitizeTheme(null)).toBe('dark')
    expect(sanitizeTheme(undefined)).toBe('dark')
    expect(sanitizeTheme(42)).toBe('dark')
    expect(sanitizeTheme('LIGHT')).toBe('dark')
    expect(sanitizeTheme({})).toBe('dark')
  })

  it('is deterministic across repeated calls', () => {
    expect(sanitizeTheme('light')).toBe(sanitizeTheme('light'))
  })
})

describe('loadStoredTheme / storeTheme', () => {
  it('round-trips through a working storage', () => {
    const storage = fakeStorage()
    storeTheme(storage, 'light')
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(loadStoredTheme(storage)).toBe('light')
  })

  it('defaults to dark when nothing is stored', () => {
    expect(loadStoredTheme(fakeStorage())).toBe('dark')
  })

  it('survives tampered values', () => {
    expect(loadStoredTheme(fakeStorage({ [THEME_STORAGE_KEY]: 'neon' }))).toBe('dark')
  })
})

describe('CANVAS_PALETTES', () => {
  it('covers every theme so lookups cannot return undefined', (): void => {
    const themes: Theme[] = ['dark', 'light']
    for (const theme of themes) {
      const palette = CANVAS_PALETTES[theme]
      expect(palette.dots).toBeTruthy()
      expect(palette.mask).toBeTruthy()
      expect(palette.edgeStroke).toBeTruthy()
      expect(palette.edgeArrow).toBeTruthy()
      expect(palette.ghostNode).toBeTruthy()
    }
  })

  it('keeps dark values identical to the pre-theme canvas', (): void => {
    // The M3/M4 canvases shipped with these exact colors; dark must not drift.
    expect(CANVAS_PALETTES.dark).toEqual({
      dots: 'rgba(100, 116, 139, 0.4)',
      mask: 'rgba(15, 23, 42, 0.75)',
      edgeStroke: 'rgba(148, 163, 184, 0.45)',
      edgeArrow: 'rgba(148, 163, 184, 0.65)',
      ghostNode: 'rgba(148, 163, 184, 0.30)',
    })
  })

  it('is deterministic across repeated reads', () => {
    expect(CANVAS_PALETTES.light).toEqual(CANVAS_PALETTES.light)
  })
})
