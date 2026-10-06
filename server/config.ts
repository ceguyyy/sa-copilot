// Server configuration, read once from the environment (.env is loaded by `node --env-file-if-exists`).
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

/** A path from the environment (the desktop app points these into its data/resources folders), else inside the repo. */
const fromEnv = (name: string, fallback: string) => path.resolve(ROOT, process.env[name]?.trim() || fallback)

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name} — copy .env.example to .env and fill it in`)
  return value
}

type Effort = 'low' | 'medium' | 'high'
function effort(name: string, fallback: Effort): Effort {
  const value = process.env[name]
  return value === 'low' || value === 'medium' || value === 'high' ? value : fallback
}

const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL?.trim() || undefined

export const config = {
  root: ROOT,
  port: Number(process.env.PORT ?? 3000),
  // Loopback only: desktop credentials and integrations stay on this device.
  host: '127.0.0.1',
  databaseUrl: required('DATABASE_URL'),
  uploadDir: fromEnv('UPLOAD_DIR', 'data/uploads'),
  // Where Backup & Restore writes the automatic backup taken before a restore.
  backupDir: fromEnv('BACKUP_DIR', 'data/backups'),
  cloud: {
    databaseUrl: process.env.CLOUD_DATABASE_URL?.trim() || '',
    workspace: process.env.CLOUD_WORKSPACE?.trim() || 'default',
  },
  // Healthcare demo app (github.com/ceguyyy/Healthcare-demo-cekat): where scenarios are shown and the
  // Supabase REST endpoint + key they are stored with. The key stays on this server.
  demo: {
    appUrl: process.env.DEMO_APP_URL?.trim() || 'https://healthcare-demo-cekat.vercel.app/',
    supabaseUrl: process.env.DEMO_SUPABASE_URL?.trim().replace(/\/+$/, '') || '',
    supabaseKey: process.env.DEMO_SUPABASE_KEY?.trim() || '',
  },
  // PowerPoint template whose slides 31–40 the pitch deck replaces.
  deckTemplate: fromEnv('DECK_TEMPLATE', 'data/templates/deck.pptx'),
  // Auto-exported deliverables, one folder per project.
  docsDir: fromEnv('DOCS_DIR', 'data/projects'),
  // Outline wiki, exposed to the AI as a read-only MCP server when a key is set.
  outline: {
    apiUrl: process.env.OUTLINE_API_URL?.trim() || 'https://wiki.cekat.ai/api',
    apiKey: process.env.OUTLINE_API_KEY?.trim() || '',
    // Bundled outline-mcp-server stdio entry (desktop app); empty = run it through npx.
    mcpEntry: process.env.OUTLINE_MCP_ENTRY?.trim() ? path.resolve(process.env.OUTLINE_MCP_ENTRY.trim()) : '',
  },
  // "Send to Notion": an Internal Integration Secret and the page projects are written under.
  notion: {
    token: process.env.NOTION_TOKEN?.trim() || '',
    parentPage: process.env.NOTION_PARENT_PAGE?.trim() || '',
  },
  distDir: fromEnv('DIST_DIR', 'dist'),
  schemaFile: fromEnv('SCHEMA_FILE', 'db/schema.sql'),
  deckScript: fromEnv('DECK_SCRIPT', 'server/deck/build_deck.py'),
  appVersion: process.env.SA_APP_VERSION?.trim() || 'dev',
  maxUploadBytes: 50 * 1024 * 1024,
  markitdown: {
    // Python interpreter that has markitdown installed (pip install "markitdown[all]").
    // macOS/Linux only ship `python3`.
    python: process.env.MARKITDOWN_PYTHON?.trim() || (process.platform === 'win32' ? 'python' : 'python3'),
  },
  anthropic: {
    // 9router API key; ANTHROPIC_API_KEY still works for older .env files.
    apiKey: process.env['9ROUTER_API_KEY']?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || undefined,
    baseURL: anthropicBaseUrl,
    model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5-5',
    chatEffort: effort('CHAT_EFFORT', 'medium'),
    generateEffort: effort('GENERATE_EFFORT', 'high'),
    // Behind a proxy like 9router: no server-side refusal fallback beta and no structured outputs.
    proxied: Boolean(anthropicBaseUrl),
  },
}
