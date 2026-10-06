import type { ConfigPatch, SecretKey, ValueKey } from '../electron/settings.ts'

export const CONNECTION_ENV_VALUES: Record<string, ValueKey> = {
  ANTHROPIC_BASE_URL: 'aiBaseUrl', ANTHROPIC_MODEL: 'aiModel',
  CHAT_EFFORT: 'chatEffort', GENERATE_EFFORT: 'generateEffort',
  OUTLINE_API_URL: 'outlineApiUrl', DEMO_SUPABASE_URL: 'demoSupabaseUrl',
  DEMO_APP_URL: 'demoAppUrl', NOTION_PARENT_PAGE: 'notionParentPage',
  DOCS_DIR: 'docsDir', DECK_TEMPLATE: 'deckTemplate',
}
export const CONNECTION_ENV_SECRETS: Record<string, SecretKey> = {
  '9ROUTER_API_KEY': 'routerApiKey', ANTHROPIC_API_KEY: 'routerApiKey',
  OUTLINE_API_KEY: 'outlineApiKey', DEMO_SUPABASE_KEY: 'demoSupabaseKey',
  NOTION_TOKEN: 'notionToken', CLOUD_DATABASE_URL: 'cloudDatabaseUrl',
}
export interface ConnectionEnvImport {
  patch: ConfigPatch
  imported: string[]
  ignored: string[]
  emptySecrets: string[]
}

/** Parse data only; never evaluate shell commands or expand environment variables. */
export function importConnectionEnv(text: string): ConnectionEnvImport {
  if (text.length > 1024 * 1024) throw new Error('ENV files must be smaller than 1 MB.')
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const env = new Map<string, string>()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)$/)
    if (!match) throw new Error(`Invalid ENV assignment on line ${i + 1}.`)
    const startLine = i + 1
    let value = match[2]
    if (value.startsWith('"') || value.startsWith("'") || value.startsWith('`')) {
      const quote = value[0]
      value = value.slice(1)
      // Quotes may span lines. Backslashes are literal, preserving Windows paths.
      let end = value.indexOf(quote)
      while (end < 0 && i + 1 < lines.length) {
        value += '\n' + lines[++i]
        end = value.indexOf(quote)
      }
      if (end < 0 || !/^\s*(?:#.*)?$/.test(value.slice(end + 1))) {
        throw new Error(`Invalid quoted ENV value on line ${startLine}.`)
      }
      value = value.slice(0, end)
    } else value = value.split('#', 1)[0].trim()
    env.set(match[1], value.trim())
  }
  const result: ConnectionEnvImport = {patch:{values:{},secrets:{}}, imported:[],ignored:[],emptySecrets:[]}
  for (const [key,value] of env) {
    const valueKey = Object.hasOwn(CONNECTION_ENV_VALUES,key) ? CONNECTION_ENV_VALUES[key] : undefined
    const secretKey = Object.hasOwn(CONNECTION_ENV_SECRETS,key) ? CONNECTION_ENV_SECRETS[key] : undefined
    if (!valueKey && !secretKey) { result.ignored.push(key); continue }
    if (secretKey && !value) { result.emptySecrets.push(key); continue }
    if (key === 'ANTHROPIC_API_KEY' && env.get('9ROUTER_API_KEY')) { result.ignored.push(key); continue }
    if (value.length > 2000) throw new Error(`${key} exceeds 2000 characters.`)
    if ((valueKey === 'chatEffort' || valueKey === 'generateEffort') && value && !['low','medium','high'].includes(value)) {
      throw new Error(`${key} must be low, medium or high.`)
    }
    if (valueKey && ['aiBaseUrl','outlineApiUrl','demoSupabaseUrl','demoAppUrl','notionParentPage'].includes(valueKey) && value && !/^https?:\/\//i.test(value)) {
      throw new Error(`${key} must be an HTTP or HTTPS URL.`)
    }
    if (secretKey === 'cloudDatabaseUrl' && !/^postgres(?:ql)?:\/\//i.test(value)) throw new Error(`${key} must be a PostgreSQL URL.`)
    if (valueKey) result.patch.values![valueKey] = value
    if (secretKey) result.patch.secrets![secretKey] = value
    result.imported.push(key)
  }
  return result
}
