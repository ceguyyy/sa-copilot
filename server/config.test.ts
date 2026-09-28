import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const ROOT = path.resolve(import.meta.dirname, '..')
const PATH_VARS = ['UPLOAD_DIR', 'DOCS_DIR', 'DECK_TEMPLATE', 'BACKUP_DIR', 'DIST_DIR', 'SCHEMA_FILE', 'DECK_SCRIPT', 'OUTLINE_MCP_ENTRY', 'SA_APP_VERSION']

async function load(env: Record<string, string>) {
  vi.resetModules()
  vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test')
  for (const name of PATH_VARS) vi.stubEnv(name, env[name] ?? '')
  return (await import('./config.ts')).config
}

afterEach(() => vi.unstubAllEnvs())

describe('config paths', () => {
  it('defaults every path inside the repo', async () => {
    const config = await load({})
    expect(config.uploadDir).toBe(path.join(ROOT, 'data', 'uploads'))
    expect(config.backupDir).toBe(path.join(ROOT, 'data', 'backups'))
    expect(config.distDir).toBe(path.join(ROOT, 'dist'))
    expect(config.schemaFile).toBe(path.join(ROOT, 'db', 'schema.sql'))
    expect(config.deckScript).toBe(path.join(ROOT, 'server', 'deck', 'build_deck.py'))
    expect(config.outline.mcpEntry).toBe('')
    expect(config.appVersion).toBe('dev')
  })

  it('takes absolute overrides from the environment', async () => {
    const abs = (p: string) => path.resolve('/sa', p)
    const config = await load({
      UPLOAD_DIR: abs('up'),
      BACKUP_DIR: abs('bk'),
      DIST_DIR: abs('ui'),
      SCHEMA_FILE: abs('schema.sql'),
      DECK_SCRIPT: abs('deck.py'),
      OUTLINE_MCP_ENTRY: abs('stdio.js'),
      SA_APP_VERSION: '1.0.0',
    })
    expect(config.uploadDir).toBe(abs('up'))
    expect(config.backupDir).toBe(abs('bk'))
    expect(config.distDir).toBe(abs('ui'))
    expect(config.schemaFile).toBe(abs('schema.sql'))
    expect(config.deckScript).toBe(abs('deck.py'))
    expect(config.outline.mcpEntry).toBe(abs('stdio.js'))
    expect(config.appVersion).toBe('1.0.0')
  })
})
