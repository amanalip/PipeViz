import { describe, expect, it } from 'vitest'

import {
  DEFAULT_EDITOR_WIDTH,
  EDITOR_WIDTH_STORAGE_KEY,
  MIN_EDITOR_WIDTH,
  clampEditorWidth,
  loadStoredEditorWidth,
  storeEditorWidth,
} from './editorResize'

function fakeStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem: (key: string) => (key === EDITOR_WIDTH_STORAGE_KEY ? value : null),
    setItem: (key: string, next: string) => {
      if (key === EDITOR_WIDTH_STORAGE_KEY) value = next
    },
  }
}

describe('editor resize preferences', () => {
  it('clamps widths while preserving minimum canvas space', () => {
    expect(clampEditorWidth(100, 1200)).toBe(MIN_EDITOR_WIDTH)
    expect(clampEditorWidth(500, 1200)).toBe(500)
    expect(clampEditorWidth(1000, 1200)).toBe(880)
  })

  it('falls back cleanly when a narrow workspace cannot fit both minima', () => {
    expect(clampEditorWidth(500, 400)).toBe(MIN_EDITOR_WIDTH)
  })

  it('round-trips a stored width and rejects invalid values', () => {
    const storage = fakeStorage()
    storeEditorWidth(storage, 456.4)
    expect(loadStoredEditorWidth(storage)).toBe(456)
    expect(loadStoredEditorWidth(fakeStorage('invalid'))).toBe(DEFAULT_EDITOR_WIDTH)
    expect(loadStoredEditorWidth(fakeStorage('100'))).toBe(DEFAULT_EDITOR_WIDTH)
  })

  it('survives unavailable storage', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadStoredEditorWidth(storage)).toBe(DEFAULT_EDITOR_WIDTH)
    expect(() => storeEditorWidth(storage, 420)).not.toThrow()
  })
})
