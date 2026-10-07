export type SaPreferences = {
  layout: 'vertical' | 'horizontal'
  width: number
  density: 'comfortable' | 'compact'
  fontSize: number
  wordWrap: boolean
  responseView: 'tree' | 'raw' | 'headers'
  chatDefault: 'collapsed' | 'normal'
  jsonDepth: number
  timeoutMs: number
}
export const DEFAULT_SA_PREFERENCES: SaPreferences = {
  layout: 'vertical', width: 50, density: 'comfortable', fontSize: 12,
  wordWrap: true, responseView: 'tree', chatDefault: 'collapsed', jsonDepth: 1, timeoutMs: 30000,
}
const bounded = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback
export function loadSaPreferences(): SaPreferences {
  try {
    const p = JSON.parse(localStorage.getItem('sapostman-layout') ?? '{}') ?? {}
    return {
      layout: p.layout === 'horizontal' ? 'horizontal' : 'vertical',
      width: bounded(p.width, 50, 25, 75), density: p.density === 'compact' ? 'compact' : 'comfortable',
      fontSize: bounded(p.fontSize, 12, 10, 22), wordWrap: p.wordWrap !== false,
      responseView: p.responseView === 'raw' || p.responseView === 'headers' ? p.responseView : 'tree',
      chatDefault: p.chatDefault === 'normal' ? 'normal' : 'collapsed',
      jsonDepth: bounded(p.jsonDepth, 1, 0, 5), timeoutMs: bounded(p.timeoutMs, 30000, 1000, 120000),
    }
  } catch { return {...DEFAULT_SA_PREFERENCES} }
}
export function persistSaPreferences(value: SaPreferences) {
  try { localStorage.setItem('sapostman-layout', JSON.stringify(value)) } catch { /* Keep session preferences if storage is unavailable. */ }
}
