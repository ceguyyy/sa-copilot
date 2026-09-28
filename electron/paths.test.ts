import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolvePaths } from './paths.ts'

const base = { userData: '/data/SA Copilot', documents: '/home/u/Documents' }

describe('resolvePaths', () => {
  it('points at bundled resources in the installed Windows app', () => {
    const p = resolvePaths({ ...base, isPackaged: true, appPath: 'C:/SA/resources/app', resourcesPath: 'C:/SA/resources', platform: 'win32' })
    expect(p.python).toBe(path.join('C:/SA/resources', 'python', 'python.exe'))
    expect(p.deckScript).toBe(path.join('C:/SA/resources', 'deck', 'build_deck.py'))
    expect(p.defaultDeckTemplate).toBe(path.join('C:/SA/resources', 'templates', 'deck.pptx'))
    expect(p.serverEntry).toBe(path.join('C:/SA/resources/app', 'server-dist', 'index.mjs'))
    expect(p.routerAppDir).toBe(path.join('C:/SA/resources/app', 'node_modules', '9router', 'app'))
    expect(p.outlineEntry).toBe(path.join('C:/SA/resources/app', 'node_modules', 'outline-mcp-server', 'build', 'stdio.js'))
  })

  it('uses bin/python3 on macOS', () => {
    const p = resolvePaths({ ...base, isPackaged: true, appPath: '/A/Resources/app', resourcesPath: '/A/Resources', platform: 'darwin' })
    expect(p.python).toBe(path.join('/A/Resources', 'python', 'bin', 'python3'))
  })

  it('keeps all user data in the data folder and exports in Documents', () => {
    const p = resolvePaths({ ...base, isPackaged: true, appPath: '/a', resourcesPath: '/r', platform: 'darwin' })
    expect(p.pgDir).toBe(path.join(base.userData, 'pg'))
    expect(p.uploadDir).toBe(path.join(base.userData, 'uploads'))
    expect(p.backupDir).toBe(path.join(base.userData, 'backups'))
    expect(p.logsDir).toBe(path.join(base.userData, 'logs'))
    expect(p.configFile).toBe(path.join(base.userData, 'config.json'))
    expect(p.defaultDocsDir).toBe(path.join(base.documents, 'SA Copilot'))
  })

  it('uses the repo and system Python in dev (npm run desktop)', () => {
    const p = resolvePaths({ ...base, isPackaged: false, appPath: '/repo', resourcesPath: '/electron/resources', platform: 'win32' })
    expect(p.python).toBe('python')
    expect(p.deckScript).toBe(path.join('/repo', 'server', 'deck', 'build_deck.py'))
    expect(p.defaultDeckTemplate).toBe(path.join('/repo', 'data', 'templates', 'deck.pptx'))
  })
})
