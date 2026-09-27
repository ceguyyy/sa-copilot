// Color themes: the 12 design tokens (see src/index.css), built-in presets, and contrast checks.
// Shared by the UI (applies themes) and the server (validates AI-generated ones).

export const THEME_TOKENS = ['paper', 'panel', 'ink', 'muted', 'line', 'forest', 'forest-soft', 'ember', 'ember-soft', 'ok', 'warn', 'bad'] as const
export type ThemeToken = (typeof THEME_TOKENS)[number]
export type Palette = Record<ThemeToken, string>

export interface Theme {
  id: string
  name: string
  light: Palette
  dark: Palette
}

export type ThemeMode = 'light' | 'dark' | 'system'

/** What each token is for — also the brief the AI designs against. */
export const TOKEN_ROLES: Record<ThemeToken, string> = {
  paper: 'page background',
  panel: 'card / input background, slightly lifted from paper',
  ink: 'main text on paper and panel',
  muted: 'secondary text on paper and panel',
  line: 'borders and dividers',
  forest: 'primary brand color: sidebar background and primary buttons (text on it uses the paper color)',
  'forest-soft': 'subtle tint of the primary for selected rows and badges',
  ember: 'accent for AI actions and highlights (text on it uses the paper color)',
  'ember-soft': 'subtle tint of the accent for AI panels and badges',
  ok: 'success text',
  warn: 'warning text',
  bad: 'error text',
}

export const PRESET_THEMES: Theme[] = [
  {
    id: 'forest',
    name: 'Forest (default)',
    light: {
      paper: '#f4f1ea', panel: '#fbfaf6', ink: '#1b1b18', muted: '#6d6a60', line: '#ddd7ca', forest: '#1f3b34',
      'forest-soft': '#dfe8e3', ember: '#c9542a', 'ember-soft': '#fbe6dc', ok: '#2f7a4f', warn: '#9a6200', bad: '#b3261e',
    },
    dark: {
      paper: '#141513', panel: '#1c1e1b', ink: '#eceadf', muted: '#9c998d', line: '#34362f', forest: '#8fc2ae',
      'forest-soft': '#22332d', ember: '#f08a5d', 'ember-soft': '#3a2519', ok: '#6cc28e', warn: '#e0b04a', bad: '#f08080',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    light: {
      paper: '#eef3f6', panel: '#f8fbfc', ink: '#10212b', muted: '#5b6b75', line: '#d3dee5', forest: '#16425b',
      'forest-soft': '#dcebf3', ember: '#c2620f', 'ember-soft': '#fcebd9', ok: '#2e7d5b', warn: '#946200', bad: '#b3261e',
    },
    dark: {
      paper: '#0d1519', panel: '#142026', ink: '#e3edf2', muted: '#8fa3ae', line: '#25343c', forest: '#7fc1e0',
      'forest-soft': '#1a2d37', ember: '#f4a259', 'ember-soft': '#3a2a17', ok: '#6cc28e', warn: '#e0b04a', bad: '#f08080',
    },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    light: {
      paper: '#f5f5f4', panel: '#fcfcfb', ink: '#18181b', muted: '#62626b', line: '#dededb', forest: '#27272a',
      'forest-soft': '#e7e7ea', ember: '#4f46e5', 'ember-soft': '#e6e5fb', ok: '#15803d', warn: '#a16207', bad: '#b91c1c',
    },
    dark: {
      paper: '#111113', panel: '#19191c', ink: '#ececef', muted: '#9a9aa3', line: '#2e2e33', forest: '#d4d4d8',
      'forest-soft': '#26262b', ember: '#8b85ff', 'ember-soft': '#25234a', ok: '#4ade80', warn: '#facc15', bad: '#f87171',
    },
  },
  {
    id: 'rose',
    name: 'Rosewood',
    light: {
      paper: '#f8f1ef', panel: '#fdf9f8', ink: '#2a1a1c', muted: '#735c60', line: '#ead9d6', forest: '#5b1f33',
      'forest-soft': '#f2dfe4', ember: '#c2410c', 'ember-soft': '#fde5d6', ok: '#2f7a4f', warn: '#9a6200', bad: '#b3261e',
    },
    dark: {
      paper: '#171012', panel: '#20171a', ink: '#f3e7e9', muted: '#a88f94', line: '#3a2a2e', forest: '#e8a3b7',
      'forest-soft': '#3a2129', ember: '#fb923c', 'ember-soft': '#3d2414', ok: '#6cc28e', warn: '#e0b04a', bad: '#f08080',
    },
  },
]

export const DEFAULT_THEME_ID = 'forest'
export const HEX_RE = /^#[0-9a-f]{6}$/i

// ---------- contrast (WCAG 2.x relative luminance) ----------

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Pairs the UI actually draws, with the minimum ratio each needs (4.5 body text, 3 large/secondary UI).
const CHECKS: { fg: ThemeToken; bg: ThemeToken; min: number; what: string }[] = [
  { fg: 'ink', bg: 'paper', min: 4.5, what: 'text on page' },
  { fg: 'ink', bg: 'panel', min: 4.5, what: 'text on cards' },
  { fg: 'muted', bg: 'panel', min: 3, what: 'secondary text' },
  { fg: 'paper', bg: 'forest', min: 4.5, what: 'sidebar / primary button text' },
  { fg: 'forest', bg: 'forest-soft', min: 3, what: 'primary badges' },
  { fg: 'paper', bg: 'ember', min: 3, what: 'AI button text' },
  { fg: 'ember', bg: 'ember-soft', min: 3, what: 'accent badges' },
  { fg: 'bad', bg: 'panel', min: 3, what: 'error text' },
]

/** Hex format + readable contrast. Returns human-readable problems (empty = fine). */
export function paletteProblems(p: Partial<Record<string, unknown>>, mode: 'light' | 'dark'): string[] {
  const missing = THEME_TOKENS.filter((t) => typeof p[t] !== 'string' || !HEX_RE.test(p[t] as string))
  if (missing.length) return [`${mode}: ${missing.join(', ')} must be #rrggbb colors`]
  const palette = p as Palette
  return CHECKS.flatMap(({ fg, bg, min, what }) => {
    const ratio = contrastRatio(palette[fg], palette[bg])
    return ratio < min ? [`${mode}: ${what} is hard to read (${fg} on ${bg} = ${ratio.toFixed(1)}:1, needs ${min}:1)`] : []
  })
}

export function themeProblems(t: { light?: unknown; dark?: unknown }): string[] {
  const asRecord = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
  return [...paletteProblems(asRecord(t.light), 'light'), ...paletteProblems(asRecord(t.dark), 'dark')]
}
