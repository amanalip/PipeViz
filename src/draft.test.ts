import { describe, expect, it } from 'vitest'

import { DRAFT_STORAGE_KEY, loadSessionDraft, storeSessionDraft } from './draft'

function fakeStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem: (key: string) => (key === DRAFT_STORAGE_KEY ? value : null),
    setItem: (key: string, next: string) => {
      if (key === DRAFT_STORAGE_KEY) value = next
    },
    removeItem: (key: string) => {
      if (key === DRAFT_STORAGE_KEY) value = null
    },
  }
}

describe('session draft recovery', () => {
  it('stores and restores a source within the allowed limit', () => {
    const storage = fakeStorage()
    storeSessionDraft(storage, "pipeline { stage('Build') {} }", 100)
    expect(loadSessionDraft(storage, 100)).toBe("pipeline { stage('Build') {} }")
  })

  it('removes empty and oversized drafts', () => {
    const storage = fakeStorage('old draft')
    storeSessionDraft(storage, '', 100)
    expect(loadSessionDraft(storage, 100)).toBeNull()

    storeSessionDraft(storage, 'x'.repeat(101), 100)
    expect(loadSessionDraft(storage, 100)).toBeNull()
  })

  it('ignores stored values that exceed the current limit', () => {
    expect(loadSessionDraft(fakeStorage('x'.repeat(11)), 10)).toBeNull()
  })

  it('survives unavailable storage', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadSessionDraft(storage, 100)).toBeNull()
    expect(() => storeSessionDraft(storage, 'draft', 100)).not.toThrow()
  })
})
