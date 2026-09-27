// The languages offered in the project language dropdown, and which one is the main (default) language.
import { Hono } from 'hono'
import { z } from 'zod'
import { query, queryOne } from './db.ts'
import { HttpError, parseJson } from './http.ts'

const KEY = 'languages'
const MAX_LANGUAGES = 30

export interface LanguageSettings {
  items: string[]
  main: string
}

export const DEFAULT_LANGUAGES: LanguageSettings = {
  items: ['Bahasa Indonesia', 'English', 'Bahasa Melayu', 'ภาษาไทย (Thai)', 'Tiếng Việt', 'Filipino', '中文', '日本語'],
  main: 'Bahasa Indonesia',
}

const languageSettings = z
  .object({
    items: z.array(z.string().trim().min(1).max(40)).min(1, 'Keep at least one language').max(MAX_LANGUAGES),
    main: z.string().trim().min(1).max(40),
  })
  .refine((s) => new Set(s.items.map((i) => i.toLowerCase())).size === s.items.length, 'Each language can only be listed once')
  .refine((s) => s.items.includes(s.main), 'The main language must be one of the languages')

export async function loadLanguages(): Promise<LanguageSettings> {
  const row = await queryOne<{ value: LanguageSettings }>('select value from app_settings where key = $1', [KEY])
  return row?.value ?? DEFAULT_LANGUAGES
}

export const languages = new Hono()

languages.get('/settings/languages', async (c) => c.json(await loadLanguages()))

/** Replaces the whole list (add / rename / delete / reorder / main toggle are all one save). */
languages.put('/settings/languages', async (c) => {
  const next = await parseJson(c, languageSettings)
  await query(
    `insert into app_settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [KEY, JSON.stringify(next)],
  )
  return c.json(next)
})

/** Language for a new project: the one given (validated against the list), else the main language. */
export async function languageForNewProject(requested: string | null | undefined): Promise<string> {
  const settings = await loadLanguages()
  if (!requested) return settings.main
  if (!settings.items.includes(requested)) throw new HttpError(400, `"${requested}" is not in Settings → Languages`)
  return requested
}
