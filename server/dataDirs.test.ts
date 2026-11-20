import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// UPLOAD_DIR at the "drive root" of a temp folder, DATA_DIR elsewhere: the setup that put app data at C:\.
vi.mock('./config.ts', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sa-data-dirs-'))
  return { config: { uploadDir: path.join(dir, 'drive', 'SA Copilot'), dataDir: path.join(dir, 'app-data') } }
})
import { config } from './config.ts'
import { cekatProfileDir, legacyDataDir, mcpAuthDir, migrateLegacyDataDirs } from './dataDirs.ts'

const settings = config as { uploadDir: string; dataDir: string }
const root = path.dirname(path.dirname(settings.uploadDir))

const write = (file: string, text: string) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
}

describe('app data folders', () => {
  beforeEach(() => {
    settings.dataDir = path.join(root, `app-data-${Math.random().toString(36).slice(2)}`)
  })

  it('live under DATA_DIR, not next to the upload folder', () => {
    expect(mcpAuthDir()).toBe(path.join(settings.dataDir, 'mcp-oauth'))
    expect(cekatProfileDir()).toBe(path.join(settings.dataDir, 'cekat-browser'))
    expect(legacyDataDir('mcp-oauth')).toBe(path.join(root, 'drive', 'mcp-oauth'))
  })

  it('moves the old folders over once, contents included', async () => {
    write(path.join(legacyDataDir('mcp-oauth'), 'server-1.json'), '{"client":1}')
    write(path.join(legacyDataDir('cekat-browser'), 'Default', 'Cookies'), 'cookies')
    expect(await migrateLegacyDataDirs()).toHaveLength(2)
    expect(readFileSync(path.join(mcpAuthDir(), 'server-1.json'), 'utf8')).toBe('{"client":1}')
    expect(readFileSync(path.join(cekatProfileDir(), 'Default', 'Cookies'), 'utf8')).toBe('cookies')
    expect(existsSync(legacyDataDir('mcp-oauth'))).toBe(false)
    expect(await migrateLegacyDataDirs()).toEqual([])
  })

  it('never overwrites a folder that is already in DATA_DIR', async () => {
    write(path.join(legacyDataDir('mcp-oauth'), 'server-1.json'), 'old')
    write(path.join(mcpAuthDir(), 'server-1.json'), 'new')
    expect(await migrateLegacyDataDirs()).toEqual([])
    expect(readFileSync(path.join(mcpAuthDir(), 'server-1.json'), 'utf8')).toBe('new')
    expect(existsSync(legacyDataDir('mcp-oauth'))).toBe(true)
  })
})
