// Everything that used to live in .env, stored per device in <data>/config.json. Secrets are encrypted with the
// OS keychain (Electron safeStorage); the Postgres password is generated once and never shown.
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppPaths } from './paths.ts'
import { SECRET_KEYS, VALUE_KEYS, type ConfigPatch, type PublicConfig, type SecretKey, type ValueKey } from './settings.ts'

export { SECRET_KEYS, VALUE_KEYS, type ConfigPatch, type PublicConfig, type SecretKey, type ValueKey }

const URL_KEYS = new Set<ValueKey>(['aiBaseUrl', 'outlineApiUrl', 'demoSupabaseUrl', 'demoAppUrl', 'notionParentPage'])
const EFFORT_KEYS = new Set<ValueKey>(['chatEffort', 'generateEffort'])
const MAX_LENGTH = 2000

export interface Cipher {
  encrypt(plain: string): string
  decrypt(stored: string): string
}

export interface DesktopConfig {
  values: Record<ValueKey, string>
  secrets: Record<SecretKey, string>
  pgPassword: string
}

interface StoredConfig {
  version: 1
  values: Partial<Record<ValueKey, string>>
  secrets: Partial<Record<SecretKey, string>>
  pgPassword?: string
}

const empty = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, ''])) as Record<K, string>

function pick<K extends string>(source: Partial<Record<string, string>>, keys: readonly K[]): Partial<Record<K, string>> {
  return Object.fromEntries(keys.filter((k) => typeof source[k] === 'string').map((k) => [k, source[k]])) as Partial<Record<K, string>>
}

export class ConfigStore {
  private readonly file: string
  private readonly cipher: Cipher

  constructor(file: string, cipher: Cipher) {
    this.file = file
    this.cipher = cipher
  }

  private async load(): Promise<StoredConfig> {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as Partial<StoredConfig>
      return { version: 1, values: raw.values ?? {}, secrets: raw.secrets ?? {}, pgPassword: raw.pgPassword }
    } catch (e) {
      if ((e as { code?: string }).code === 'ENOENT') return { version: 1, values: {}, secrets: {} }
      throw e
    }
  }

  private async write(stored: StoredConfig): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    await writeFile(tmp, JSON.stringify(stored, null, 2), { mode: 0o600 })
    await rename(tmp, this.file)
  }

  /** A secret that cannot be decrypted (file from another device, keychain reset) reads as unset. */
  private open(stored: string | undefined): string {
    if (!stored) return ''
    try {
      return this.cipher.decrypt(stored)
    } catch {
      return ''
    }
  }

  private decode(stored: StoredConfig): DesktopConfig {
    const values = { ...empty(VALUE_KEYS), ...pick(stored.values, VALUE_KEYS) }
    const secrets = empty(SECRET_KEYS)
    for (const key of SECRET_KEYS) secrets[key] = this.open(stored.secrets[key])
    return { values, secrets, pgPassword: this.open(stored.pgPassword) }
  }

  async read(): Promise<DesktopConfig> {
    return this.decode(await this.load())
  }

  async save(patch: ConfigPatch): Promise<DesktopConfig> {
    const stored = await this.load()
    const next: StoredConfig = { ...stored, values: { ...stored.values, ...patch.values }, secrets: { ...stored.secrets } }
    for (const [key, value] of Object.entries(patch.secrets ?? {}) as [SecretKey, string][]) {
      if (value === '') delete next.secrets[key]
      else next.secrets[key] = this.cipher.encrypt(value)
    }
    await this.write(next)
    return this.decode(next)
  }

  async ensurePgPassword(): Promise<DesktopConfig> {
    const stored = await this.load()
    if (this.open(stored.pgPassword)) return this.decode(stored)
    const next = { ...stored, pgPassword: this.cipher.encrypt(randomBytes(24).toString('hex')) }
    await this.write(next)
    return this.decode(next)
  }
}

function checkGroup<K extends string>(group: unknown, keys: readonly K[], name: string, check?: (key: K, value: string) => void): Partial<Record<K, string>> | undefined {
  if (group === undefined) return undefined
  if (!group || typeof group !== 'object' || Array.isArray(group)) throw new Error(`${name} must be an object`)
  const out: Partial<Record<K, string>> = {}
  for (const [key, value] of Object.entries(group)) {
    if (!(keys as readonly string[]).includes(key)) throw new Error(`Unknown setting "${key}"`)
    if (typeof value !== 'string' || value.length > MAX_LENGTH) throw new Error(`"${key}" must be text of at most ${MAX_LENGTH} characters`)
    check?.(key as K, value.trim())
    out[key as K] = value.trim()
  }
  return out
}

/** Validates what the renderer sends over IPC before it touches the config file. */
export function parsePatch(input: unknown): ConfigPatch {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid settings')
  const raw = input as { values?: unknown; secrets?: unknown }
  const values = checkGroup(raw.values, VALUE_KEYS, 'values', (key, value) => {
    if (!value) return
    if (EFFORT_KEYS.has(key) && !['low', 'medium', 'high'].includes(value)) throw new Error(`"${key}" must be low, medium or high`)
    if (URL_KEYS.has(key) && !/^https?:\/\//i.test(value)) throw new Error(`"${key}" must be an http(s) URL`)
  })
  const secrets = checkGroup(raw.secrets, SECRET_KEYS, 'secrets')
  return { ...(values ? { values } : {}), ...(secrets ? { secrets } : {}) }
}

/** What the UI may see: every value, but only whether each secret is set. */
export function publicConfig(cfg: DesktopConfig): PublicConfig {
  const secretsSet = Object.fromEntries(SECRET_KEYS.map((k) => [k, cfg.secrets[k] !== ''])) as Record<SecretKey, boolean>
  return { configured: secretsSet.routerApiKey, values: cfg.values, secretsSet }
}

export interface Ports {
  postgres: number
  router: number
  server: number
}

/** The server's environment: the same variables .env provides in dev. Empty optional values are left out. */
export function buildServerEnv(cfg: DesktopConfig, paths: AppPaths, ports: Ports, appVersion: string): Record<string, string> {
  const v = cfg.values
  const s = cfg.secrets
  const optional: Record<string, string> = {
    ANTHROPIC_MODEL: v.aiModel,
    CHAT_EFFORT: v.chatEffort,
    GENERATE_EFFORT: v.generateEffort,
    OUTLINE_API_URL: v.outlineApiUrl,
    OUTLINE_API_KEY: s.outlineApiKey,
    DEMO_SUPABASE_URL: v.demoSupabaseUrl,
    DEMO_SUPABASE_KEY: s.demoSupabaseKey,
    DEMO_APP_URL: v.demoAppUrl,
    NOTION_TOKEN: s.notionToken,
    NOTION_PARENT_PAGE: v.notionParentPage,
  }
  return {
    DATABASE_URL: `postgres://postgres:${encodeURIComponent(cfg.pgPassword)}@127.0.0.1:${ports.postgres}/sa_copilot`,
    PORT: String(ports.server),
    ANTHROPIC_BASE_URL: v.aiBaseUrl || `http://127.0.0.1:${ports.router}`,
    ANTHROPIC_API_KEY: s.routerApiKey,
    UPLOAD_DIR: paths.uploadDir,
    BACKUP_DIR: paths.backupDir,
    DOCS_DIR: v.docsDir || paths.defaultDocsDir,
    DECK_TEMPLATE: v.deckTemplate || paths.defaultDeckTemplate,
    DECK_SCRIPT: paths.deckScript,
    MARKITDOWN_PYTHON: paths.python,
    DIST_DIR: paths.distDir,
    SCHEMA_FILE: paths.schemaFile,
    OUTLINE_MCP_ENTRY: paths.outlineEntry,
    SA_APP_VERSION: appVersion,
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== '')),
  }
}
