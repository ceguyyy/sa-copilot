// Which AI models are available (9router's /v1/models, or just the configured model when calling Claude directly),
// which one is selected, and the thinking effort. Choices live in app_settings so they survive restarts.
import { config } from '../config.ts'
import { query, queryOne } from '../db.ts'
import { HttpError } from '../http.ts'

export type WireFormat = 'anthropic' | 'openai'
export type EffortSetting = 'default' | 'low' | 'medium' | 'high'
export const EFFORT_SETTINGS: EffortSetting[] = ['default', 'low', 'medium', 'high']

export interface ModelInfo {
  id: string // full id sent to the API, e.g. "cc/claude-opus-5-5"
  provider: string // 9router provider prefix, e.g. "cc"
  name: string // id without the provider prefix
  /** 9router answers Claude models in Anthropic format and everything else in OpenAI format. */
  format: WireFormat
  tools: boolean // needed to generate documents through a proxy
  vision: boolean
  pdf: boolean
  reasoning: boolean
  adaptiveThinking: boolean
  maxOutput: number | null
  custom: boolean // typed in by hand, not listed by 9router
}

interface RouterModel {
  id: string
  owned_by?: string
  capabilities?: {
    tools?: boolean
    vision?: boolean
    pdf?: boolean
    reasoning?: boolean
    thinkingFormat?: string
    maxOutput?: number
  }
}

const CACHE_MS = 60_000
const MODEL_KEY = 'ai_model'
const EFFORT_KEY = 'ai_effort'
// provider/model, e.g. "oc/big-pickle" or "gh/gpt-5.1-codex". No spaces or quotes.
export const MODEL_ID_RE = /^[A-Za-z0-9][\w.-]*\/[\w.:@+-]{1,150}$/
let cache: { at: number; models: ModelInfo[] } | null = null

export function toModelInfo(m: RouterModel, custom = false): ModelInfo {
  const slash = m.id.indexOf('/')
  const caps = m.capabilities ?? {}
  const name = slash > 0 ? m.id.slice(slash + 1) : m.id
  const claude = caps.thinkingFormat?.startsWith('claude') || /claude/i.test(name)
  return {
    id: m.id,
    provider: m.owned_by || (slash > 0 ? m.id.slice(0, slash) : 'default'),
    name,
    format: claude ? 'anthropic' : 'openai',
    tools: caps.tools ?? true,
    vision: caps.vision ?? false,
    pdf: caps.pdf ?? false,
    reasoning: caps.reasoning ?? false,
    adaptiveThinking: caps.thinkingFormat === 'claude-adaptive' || (claude && caps.thinkingFormat === undefined),
    maxOutput: typeof caps.maxOutput === 'number' ? caps.maxOutput : null,
    custom,
  }
}

/** The configured model when talking to the Claude API directly: full Claude feature set. */
function directModel(id: string): ModelInfo {
  return {
    id,
    provider: 'anthropic',
    name: id,
    format: 'anthropic',
    tools: true,
    vision: true,
    pdf: true,
    reasoning: true,
    adaptiveThinking: true,
    maxOutput: null,
    custom: false,
  }
}

async function fetchRouterModels(): Promise<ModelInfo[]> {
  let res: Response
  try {
    res = await fetch(`${config.anthropic.baseURL!.replace(/\/+$/, '')}/v1/models`, {
      headers: { authorization: `Bearer ${config.anthropic.apiKey ?? ''}` },
    })
  } catch {
    throw new HttpError(502, `Cannot reach ${config.anthropic.baseURL} — is 9router running?`)
  }
  if (!res.ok) throw new HttpError(502, `9router /v1/models returned ${res.status}`)
  const body = (await res.json()) as { data?: RouterModel[] }
  return (body.data ?? []).filter((m) => typeof m.id === 'string').map((m) => toModelInfo(m))
}

export async function listModels(): Promise<ModelInfo[]> {
  if (!config.anthropic.proxied) return [directModel(config.anthropic.model)]
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.models
  const models = await fetchRouterModels()
  cache = { at: Date.now(), models }
  return models
}

async function getSetting(key: string): Promise<string | null> {
  const row = await queryOne<{ value: unknown }>('select value from app_settings where key = $1', [key])
  return typeof row?.value === 'string' ? row.value : null
}

async function setSetting(key: string, value: string): Promise<void> {
  await query(
    `insert into app_settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  )
}

/** The model to use for a request: the saved choice, else ANTHROPIC_MODEL from .env. */
export async function activeModel(): Promise<ModelInfo> {
  if (!config.anthropic.proxied) return directModel(config.anthropic.model)
  const id = (await getSetting(MODEL_KEY)) || config.anthropic.model
  const models = await listModels().catch(() => [] as ModelInfo[])
  // Not listed (hand-typed, router offline, or provider disconnected): infer from the id.
  return models.find((m) => m.id === id) ?? toModelInfo({ id }, true)
}

export async function selectModel(id: string): Promise<ModelInfo> {
  if (!config.anthropic.proxied) throw new HttpError(400, 'Model selection needs ANTHROPIC_BASE_URL (9router) in .env')
  cache = null // pick up newly connected providers
  const listed = (await listModels()).find((m) => m.id === id)
  if (!listed && !MODEL_ID_RE.test(id)) throw new HttpError(400, 'Model id must look like provider/model, e.g. oc/big-pickle')
  await setSetting(MODEL_KEY, id)
  return listed ?? toModelInfo({ id }, true)
}

export async function getEffort(): Promise<EffortSetting> {
  const value = await getSetting(EFFORT_KEY)
  return EFFORT_SETTINGS.includes(value as EffortSetting) ? (value as EffortSetting) : 'default'
}

export async function setEffort(value: unknown): Promise<EffortSetting> {
  if (!EFFORT_SETTINGS.includes(value as EffortSetting)) throw new HttpError(400, 'Effort must be default, low, medium or high')
  await setSetting(EFFORT_KEY, value as string)
  return value as EffortSetting
}
