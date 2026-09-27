import { useQuery } from '@tanstack/react-query'
import { PRESET_THEMES } from '../../shared/theme.ts'
import { themeApi } from '../lib/api'
import { useApplyTheme } from '../lib/theme'

/** Applies the saved theme (or an unsaved preview) app-wide. Renders nothing. */
export function ThemeSync() {
  const settings = useQuery({ queryKey: ['theme'], queryFn: themeApi.get, staleTime: Infinity })
  const s = settings.data
  const active = s ? ([...s.presets, ...s.custom].find((t) => t.id === s.activeId) ?? PRESET_THEMES[0]) : undefined
  useApplyTheme(active, s?.mode)
  return null
}
