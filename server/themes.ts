// Theme settings (light/dark/system mode, active theme, saved custom themes), stored in app_settings.
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { DEFAULT_THEME_ID, HEX_RE, PRESET_THEMES, THEME_TOKENS, themeProblems, type Theme, type ThemeMode } from '../shared/theme.ts'
import { query, queryOne } from './db.ts'
import { HttpError, parseJson } from './http.ts'

const KEY = 'theme'

interface ThemeSettings {
  mode: ThemeMode
  activeId: string
  custom: Theme[]
}

const DEFAULTS: ThemeSettings = { mode: 'system', activeId: DEFAULT_THEME_ID, custom: [] }
const MAX_CUSTOM = 30

const hex = z.string().regex(HEX_RE, 'Must be a #rrggbb color')
const palette = z.object(Object.fromEntries(THEME_TOKENS.map((t) => [t, hex])) as Record<(typeof THEME_TOKENS)[number], typeof hex>)
const themeInput = z.object({ name: z.string().trim().min(1).max(60), light: palette, dark: palette })
const settingsPatch = z.object({ mode: z.enum(['light', 'dark', 'system']), activeId: z.string().min(1).max(64) }).partial()

async function load(): Promise<ThemeSettings> {
  const row = await queryOne<{ value: Partial<ThemeSettings> }>('select value from app_settings where key = $1', [KEY])
  return { ...DEFAULTS, ...(row?.value ?? {}) }
}

async function store(settings: ThemeSettings): Promise<ThemeSettings> {
  await query(
    `insert into app_settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [KEY, JSON.stringify(settings)],
  )
  return settings
}

const allThemes = (s: ThemeSettings): Theme[] => [...PRESET_THEMES, ...s.custom]

export const themes = new Hono()

themes.get('/settings/theme', async (c) => {
  const s = await load()
  return c.json({ ...s, presets: PRESET_THEMES })
})

themes.put('/settings/theme', async (c) => {
  const patch = await parseJson(c, settingsPatch)
  const s = await load()
  if (patch.activeId && !allThemes(s).some((t) => t.id === patch.activeId)) throw new HttpError(400, 'Unknown theme')
  return c.json(await store({ ...s, ...patch }))
})

/** Save a (usually AI-designed) theme and make it active. Unreadable palettes are refused. */
themes.post('/settings/themes', async (c) => {
  const input = await parseJson(c, themeInput)
  const problems = themeProblems(input)
  if (problems.length) throw new HttpError(400, `Theme is not readable enough: ${problems.join('; ')}`)
  const s = await load()
  if (s.custom.length >= MAX_CUSTOM) throw new HttpError(400, `You can keep up to ${MAX_CUSTOM} custom themes — delete one first`)
  const theme: Theme = { id: randomUUID(), ...input }
  await store({ ...s, custom: [...s.custom, theme], activeId: theme.id })
  return c.json(theme, 201)
})

themes.delete('/settings/themes/:id', async (c) => {
  const id = c.req.param('id')
  const s = await load()
  const custom = s.custom.filter((t) => t.id !== id)
  await store({ ...s, custom, activeId: s.activeId === id ? DEFAULT_THEME_ID : s.activeId })
  return c.body(null, 204)
})
