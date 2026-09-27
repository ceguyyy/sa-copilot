// Applies a color theme by writing the design tokens as CSS variables on <html>.
// The last applied palettes are cached in localStorage so index.html can paint them before React loads.
import { useEffect, useSyncExternalStore } from 'react'
import { THEME_TOKENS, type Palette, type Theme, type ThemeMode } from '../../shared/theme.ts'

export const THEME_CACHE_KEY = 'sa-copilot-theme'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? (darkQuery().matches ? 'dark' : 'light') : mode
}

function writePalette(palette: Palette, scheme: 'light' | 'dark') {
  const root = document.documentElement
  for (const token of THEME_TOKENS) root.style.setProperty(`--${token}`, palette[token])
  root.style.colorScheme = scheme
  root.dataset.theme = scheme
}

export function applyTheme(theme: Theme, mode: ThemeMode) {
  const scheme = resolveMode(mode)
  writePalette(theme[scheme], scheme)
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ mode, light: theme.light, dark: theme.dark }))
  } catch {
    // Storage unavailable (private window): the theme still applies, it just may flash on the next load.
  }
}

// ---------- temporary preview (an AI proposal not saved yet) ----------

let preview: Theme | null = null
const listeners = new Set<() => void>()

export function setThemePreview(theme: Theme | null) {
  preview = theme
  listeners.forEach((l) => l())
}

export function useThemePreview(): Theme | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => preview,
  )
}

/** Keeps <html> in sync with the chosen theme, the preview, and — in system mode — the OS light/dark switch. */
export function useApplyTheme(theme: Theme | undefined, mode: ThemeMode | undefined) {
  const previewing = useThemePreview()
  const shown = previewing ?? theme
  useEffect(() => {
    if (!shown || !mode) return
    applyTheme(shown, mode)
    if (mode !== 'system') return
    const media = darkQuery()
    const onChange = () => applyTheme(shown, mode)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [shown, mode])
}
