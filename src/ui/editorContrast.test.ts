import { describe, expect, it } from 'vitest'

import { EDITOR_PALETTES } from './editorPalette'

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
}

function contrast(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second))
  const darker = Math.min(luminance(first), luminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

describe('editor theme contrast', () => {
  for (const theme of ['dark', 'light'] as const) {
    it(`${theme} editor text and syntax colors meet normal-text contrast`, () => {
      const palette = EDITOR_PALETTES[theme]
      for (const token of ['ink', 'secondary', 'muted', 'keyword', 'string', 'number', 'function'] as const) {
        expect(contrast(palette[token], palette.background), `${theme} ${token}`).toBeGreaterThanOrEqual(4.5)
      }
    })
  }
})
