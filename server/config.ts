// Server configuration, read once from the environment (.env is loaded by `node --env-file-if-exists`).
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

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
  // Loopback only: the app has no login, so it must never be reachable from the network.
  host: '127.0.0.1',
  databaseUrl: required('DATABASE_URL'),
  uploadDir: path.resolve(ROOT, process.env.UPLOAD_DIR ?? 'data/uploads'),
  // Auto-exported deliverables, one folder per project.
  docsDir: path.resolve(ROOT, process.env.DOCS_DIR ?? 'data/projects'),
  distDir: path.join(ROOT, 'dist'),
  schemaFile: path.join(ROOT, 'db', 'schema.sql'),
  maxUploadBytes: 50 * 1024 * 1024,
  markitdown: {
    // Python interpreter that has markitdown installed (pip install "markitdown[all]").
    python: process.env.MARKITDOWN_PYTHON?.trim() || 'python',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
    baseURL: anthropicBaseUrl,
    model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5-5',
    chatEffort: effort('CHAT_EFFORT', 'medium'),
    generateEffort: effort('GENERATE_EFFORT', 'high'),
    // Behind a proxy like 9router: no server-side refusal fallback beta and no structured outputs.
    proxied: Boolean(anthropicBaseUrl),
  },
}
