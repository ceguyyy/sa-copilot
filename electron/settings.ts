// The desktop settings (everything that used to live in .env). Types only + key lists: no Node imports,
// because the React app imports these types for Settings → Connections.

export const SECRET_KEYS = ['routerApiKey', 'outlineApiKey', 'demoSupabaseKey', 'notionToken'] as const
export const VALUE_KEYS = ['aiBaseUrl', 'aiModel', 'chatEffort', 'generateEffort', 'outlineApiUrl', 'demoSupabaseUrl', 'demoAppUrl', 'notionParentPage', 'docsDir', 'deckTemplate'] as const
export type SecretKey = (typeof SECRET_KEYS)[number]
export type ValueKey = (typeof VALUE_KEYS)[number]

/** Secrets: undefined keeps the saved one, '' removes it. */
export interface ConfigPatch {
  values?: Partial<Record<ValueKey, string>>
  secrets?: Partial<Record<SecretKey, string>>
}

/** What the UI may see: every value, but only whether each secret is set. */
export interface PublicConfig {
  configured: boolean
  values: Record<ValueKey, string>
  secretsSet: Record<SecretKey, boolean>
}

/** Folders shown (and openable) in Settings → Connections. */
export const FOLDER_KEYS = ['data', 'database', 'uploads', 'backups', 'logs', 'exports'] as const
export type FolderKey = (typeof FOLDER_KEYS)[number]
