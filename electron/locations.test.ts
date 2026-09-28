import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { folderLocations, isFolderKey } from './locations.ts'
import { resolvePaths } from './paths.ts'

const paths = resolvePaths({ isPackaged: true, appPath: '/A/app', resourcesPath: '/A', userData: '/D', documents: '/Docs', platform: 'win32' })

describe('folderLocations', () => {
  it('lists every folder the app keeps data in, under the data root', () => {
    expect(folderLocations(paths, '')).toEqual({
      data: '/D',
      database: path.join('/D', 'pg'),
      uploads: path.join('/D', 'uploads'),
      backups: path.join('/D', 'backups'),
      logs: path.join('/D', 'logs'),
      exports: path.join('/Docs', 'SA Copilot'),
    })
  })

  it('uses the export folder chosen in Settings', () => {
    expect(folderLocations(paths, 'E:/Clients/Exports').exports).toBe('E:/Clients/Exports')
  })
})

describe('isFolderKey', () => {
  it('accepts only the known folders (the renderer cannot open arbitrary paths)', () => {
    expect(isFolderKey('logs')).toBe(true)
    expect(isFolderKey('C:\\Windows')).toBe(false)
    expect(isFolderKey(undefined)).toBe(false)
  })
})
