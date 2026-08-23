// Session-only draft recovery. Pipeline source survives an accidental reload
// in the same tab, but is not retained as a durable cross-session browser copy.

export const DRAFT_STORAGE_KEY = 'pipeviz-session-draft'

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function loadSessionDraft(storage: DraftStorage, maxLength: number): string | null {
  try {
    const value = storage.getItem(DRAFT_STORAGE_KEY)
    if (value === null || value.length === 0 || value.length > maxLength) return null
    return value
  } catch {
    return null
  }
}

export function storeSessionDraft(
  storage: DraftStorage,
  source: string,
  maxLength: number,
): void {
  try {
    if (source.length === 0 || source.length > maxLength) {
      storage.removeItem(DRAFT_STORAGE_KEY)
      return
    }
    storage.setItem(DRAFT_STORAGE_KEY, source)
  } catch {
    // Storage may be unavailable in private browsing. Editing still works;
    // only reload recovery is skipped.
  }
}
