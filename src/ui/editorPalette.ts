import type { Theme } from '../theme'

export const EDITOR_PALETTES = {
  dark: {
    background: '#111827',
    ink: '#e5edf8',
    secondary: '#c2cedd',
    muted: '#a8b5c7',
    keyword: '#67e8f9',
    string: '#6ee7b7',
    number: '#fcd34d',
    function: '#7dd3fc',
  },
  light: {
    background: '#f8fafc',
    ink: '#172033',
    secondary: '#334155',
    muted: '#526176',
    keyword: '#0e7490',
    string: '#047857',
    number: '#92400e',
    function: '#0369a1',
  },
} as const satisfies Record<Theme, Record<string, string>>
