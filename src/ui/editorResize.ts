// Persistent desktop editor width and shared resize bounds.

export const EDITOR_WIDTH_STORAGE_KEY = 'pipeviz-editor-width'
export const DEFAULT_EDITOR_WIDTH = 380
export const MIN_EDITOR_WIDTH = 260
export const MIN_CANVAS_WIDTH = 320
export const EDITOR_WIDTH_STEP = 24

type WidthStorage = Pick<Storage, 'getItem' | 'setItem'>

export function clampEditorWidth(requested: number, workspaceWidth: number): number {
  const max = Math.max(MIN_EDITOR_WIDTH, workspaceWidth - MIN_CANVAS_WIDTH)
  return Math.round(Math.min(Math.max(requested, MIN_EDITOR_WIDTH), max))
}

export function loadStoredEditorWidth(storage: WidthStorage): number {
  try {
    const parsed = Number(storage.getItem(EDITOR_WIDTH_STORAGE_KEY))
    return Number.isFinite(parsed) && parsed >= MIN_EDITOR_WIDTH
      ? Math.round(parsed)
      : DEFAULT_EDITOR_WIDTH
  } catch {
    return DEFAULT_EDITOR_WIDTH
  }
}

export function storeEditorWidth(storage: WidthStorage, width: number): void {
  try {
    storage.setItem(EDITOR_WIDTH_STORAGE_KEY, String(Math.round(width)))
  } catch {
    // Persistence is optional. The divider remains usable for this visit.
  }
}
