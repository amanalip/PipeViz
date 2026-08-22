// ---------------------------------------------------------------------------
// theme.ts - color scheme plumbing shared by CSS, canvas, and storage (M6).
//
// Dark remains the default (mockups §2 shipped dark-only v1; light joined as
// an M6 opt-in). The canvas needs three colors that CSS variables cannot
// reach - React Flow edge strokes, minimap masks, and background dots take
// JS values - so they live here as one palette per theme instead of being
// hardcoded inside components. Everything else is a plain CSS variable
// override keyed off [data-theme='light'] on <html>.
// ---------------------------------------------------------------------------

export type Theme = 'dark' | 'light'

/** localStorage key under which the visitor's choice persists. */
export const THEME_STORAGE_KEY = 'pipeviz-theme'

/**
 * Collapse any stored/read value to a valid theme. Only exactly 'light'
 * opts in; everything else ('dark', null, garbage, tampered storage) is
 * dark, so a corrupted value can never break boot.
 */
export function sanitizeTheme(value: unknown): Theme {
  return value === 'light' ? 'light' : 'dark'
}

/** Read the persisted theme defensively (private mode, disabled storage). */
export function loadStoredTheme(storage: Pick<Storage, 'getItem'>): Theme {
  try {
    return sanitizeTheme(storage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'dark'
  }
}

/** Persist the theme; failures are silently ignored by design. */
export function storeTheme(storage: Pick<Storage, 'setItem'>, theme: Theme): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Private-mode Safari and friends throw on setItem; the toggle still
    // works for this session, it just will not remember.
  }
}

/**
 * The three canvas colors CSS cannot style, per theme. Slate strokes read
 * on both grounds; light mode leans darker slate for the same contrast
 * ratio the dark palette gets from lighter slate.
 */
export interface CanvasPalette {
  /** Dotted Background color behind everything. */
  dots: string
  /** MiniMap veil over out-of-view regions. */
  mask: string
  /** Smoothstep edge stroke + arrowhead fill. */
  edgeStroke: string
  edgeArrow: string
  /** MiniMap swatch for §11 ghost cards (unparsed material). */
  ghostNode: string
}

export const CANVAS_PALETTES: Record<Theme, CanvasPalette> = {
  dark: {
    dots: 'rgba(100, 116, 139, 0.4)',
    mask: 'rgba(15, 23, 42, 0.75)',
    edgeStroke: 'rgba(148, 163, 184, 0.45)',
    edgeArrow: 'rgba(148, 163, 184, 0.65)',
    ghostNode: 'rgba(148, 163, 184, 0.30)',
  },
  light: {
    dots: 'rgba(71, 85, 105, 0.35)',
    mask: 'rgba(241, 245, 249, 0.82)',
    edgeStroke: 'rgba(71, 85, 105, 0.5)',
    edgeArrow: 'rgba(71, 85, 105, 0.7)',
    ghostNode: 'rgba(71, 85, 105, 0.35)',
  },
}
