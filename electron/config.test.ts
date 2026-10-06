import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConfigStore, buildServerEnv, parsePatch, publicConfig, type Cipher } from './config.ts'
import { resolvePaths } from './paths.ts'

// Reversible but obviously not plaintext.
const cipher: Cipher = {
  encrypt: (s) => `enc:${Buffer.from(s).toString('base64')}`,
  decrypt: (s) => {
    if (!s.startsWith('enc:')) throw new Error('bad ciphertext')
    return Buffer.from(s.slice(4), 'base64').toString()
  },
}

const tmpFile = () => path.join(mkdtempSync(path.join(tmpdir(), 'sa-cfg-')), 'config.json')

describe('ConfigStore', () => {
  it('starts empty and not configured', async () => {
    const cfg = await new ConfigStore(tmpFile(), cipher).read()
    expect(publicConfig(cfg).configured).toBe(false)
    expect(cfg.values.aiModel).toBe('')
    expect(cfg.secrets.routerApiKey).toBe('')
  })

  it('saves values and secrets, never writing secrets in plaintext', async () => {
    const file = tmpFile()
    const store = new ConfigStore(file, cipher)
    await store.save({ values: { outlineApiUrl: 'https://wiki.cekat.ai/api' }, secrets: { routerApiKey: 'sk-router-123', outlineApiKey: 'ol_api_abc' } })
    const onDisk = readFileSync(file, 'utf8')
    expect(onDisk).not.toContain('sk-router-123')
    expect(onDisk).not.toContain('ol_api_abc')
    const cfg = await new ConfigStore(file, cipher).read()
    expect(cfg.secrets.routerApiKey).toBe('sk-router-123')
    expect(publicConfig(cfg)).toMatchObject({ configured: true, secretsSet: { routerApiKey: true, outlineApiKey: true, notionToken: false } })
    expect(JSON.stringify(publicConfig(cfg))).not.toContain('sk-router-123')
  })

  it('keeps a secret when the patch omits it and clears it with an empty string', async () => {
    const store = new ConfigStore(tmpFile(), cipher)
    await store.save({ secrets: { routerApiKey: 'k1', notionToken: 'n1' } })
    await store.save({ values: { aiModel: 'cc/claude-opus-5-5' } })
    expect((await store.read()).secrets.routerApiKey).toBe('k1')
    await store.save({ secrets: { notionToken: '' } })
    expect((await store.read()).secrets.notionToken).toBe('')
  })

  it('shows Setup again when secrets cannot be decrypted (config from another device)', async () => {
    const file = tmpFile()
    writeFileSync(file, JSON.stringify({ version: 1, values: {}, secrets: { routerApiKey: 'foreign-blob' }, pgPassword: 'enc:cHc=' }))
    const cfg = await new ConfigStore(file, cipher).read()
    expect(cfg.secrets.routerApiKey).toBe('')
    expect(publicConfig(cfg).configured).toBe(false)
  })

  it('generates the Postgres password once and keeps it', async () => {
    const store = new ConfigStore(tmpFile(), cipher)
    const first = (await store.ensurePgPassword()).pgPassword
    expect(first).toMatch(/^[0-9a-f]{48}$/)
    expect((await store.ensurePgPassword()).pgPassword).toBe(first)
  })
})

describe('parsePatch', () => {
  it('accepts known string fields only', () => {
    expect(parsePatch({ values: { aiModel: 'x' }, secrets: { routerApiKey: 'y' } })).toEqual({ values: { aiModel: 'x' }, secrets: { routerApiKey: 'y' } })
  })
  it('rejects unknown keys, non-strings and oversized values', () => {
    expect(() => parsePatch({ values: { pgPassword: 'x' } })).toThrow()
    expect(() => parsePatch({ secrets: { routerApiKey: 5 } })).toThrow()
    expect(() => parsePatch({ values: { aiModel: 'x'.repeat(2001) } })).toThrow()
    expect(() => parsePatch('nope')).toThrow()
  })
  it('rejects efforts outside low/medium/high and non-http URLs', () => {
    expect(() => parsePatch({ values: { chatEffort: 'max' } })).toThrow()
    expect(() => parsePatch({ values: { aiBaseUrl: 'file:///etc/passwd' } })).toThrow()
    expect(parsePatch({ values: { chatEffort: '', aiBaseUrl: '' } })).toEqual({ values: { chatEffort: '', aiBaseUrl: '' } })
  })
})

describe('buildServerEnv', () => {
  const paths = resolvePaths({ isPackaged: true, appPath: '/A/app', resourcesPath: '/A', userData: '/D', documents: '/Docs', platform: 'darwin' })
  const ports = { postgres: 54329, router: 20128, server: 51234 }
  const cfg = {
    values: { aiBaseUrl: '', aiModel: '', chatEffort: '', generateEffort: 'high', outlineApiUrl: '', demoSupabaseUrl: '', demoAppUrl: '', notionParentPage: 'https://notion.so/p-1a2b', docsDir: '', deckTemplate: '', cloudWorkspace: '' },
    secrets: { routerApiKey: 'sk-9', outlineApiKey: 'ol_1', demoSupabaseKey: '', notionToken: 'ntn_1', cloudDatabaseUrl: '' },
    pgPassword: 'p@ss w',
  }

  it('wires the database, 9router and every path', () => {
    const env = buildServerEnv(cfg, paths, ports, '1.0.0')
    expect(env).toMatchObject({
      DATABASE_URL: 'postgres://postgres:p%40ss%20w@127.0.0.1:54329/sa_copilot',
      PORT: '51234',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:20128',
      '9ROUTER_API_KEY': 'sk-9',
      UPLOAD_DIR: path.join('/D', 'uploads'),
      BACKUP_DIR: path.join('/D', 'backups'),
      DOCS_DIR: path.join('/Docs', 'SA Copilot'),
      DECK_TEMPLATE: path.join('/A', 'templates', 'deck.pptx'),
      DECK_SCRIPT: path.join('/A', 'deck', 'build_deck.py'),
      MARKITDOWN_PYTHON: path.join('/A', 'python', 'bin', 'python3'),
      DIST_DIR: path.join('/A/app', 'dist'),
      SCHEMA_FILE: path.join('/A/app', 'db', 'schema.sql'),
      OUTLINE_MCP_ENTRY: path.join('/A/app', 'node_modules', 'outline-mcp-server', 'build', 'stdio.js'),
      OUTLINE_API_KEY: 'ol_1',
      NOTION_TOKEN: 'ntn_1',
      NOTION_PARENT_PAGE: 'https://notion.so/p-1a2b',
      GENERATE_EFFORT: 'high',
      SA_APP_VERSION: '1.0.0',
    })
  })

  it('leaves unset optional values out so the server defaults apply', () => {
    const env = buildServerEnv(cfg, paths, ports, '1.0.0')
    for (const name of ['OUTLINE_API_URL', 'DEMO_SUPABASE_URL', 'DEMO_SUPABASE_KEY', 'DEMO_APP_URL', 'ANTHROPIC_MODEL', 'CHAT_EFFORT']) expect(env).not.toHaveProperty(name)
  })

  it('lets the user point AI at another router or the Claude API, and override folders', () => {
    const env = buildServerEnv(
      { ...cfg, values: { ...cfg.values, aiBaseUrl: 'https://api.anthropic.com', aiModel: 'claude-opus-5-5', docsDir: '/X/exports', deckTemplate: '/X/deck.pptx' } },
      paths,
      ports,
      '1.0.0',
    )
    expect(env).toMatchObject({ ANTHROPIC_BASE_URL: 'https://api.anthropic.com', ANTHROPIC_MODEL: 'claude-opus-5-5', DOCS_DIR: '/X/exports', DECK_TEMPLATE: '/X/deck.pptx' })
  })
})
