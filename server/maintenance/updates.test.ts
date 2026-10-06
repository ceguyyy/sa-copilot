import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ exec: vi.fn(), backup: vi.fn(), write: vi.fn(), dirty: false, ahead: 0, behind: 2 }))
vi.mock('node:child_process', () => ({ execFile: Object.assign(() => {}, { [Symbol.for('nodejs.util.promisify.custom')]: mocks.exec }) }))
vi.mock('node:fs/promises', () => ({ readFile: vi.fn(async () => '{"version":"1.0.0"}'), mkdir: vi.fn(), writeFile: mocks.write }))
vi.mock('../config.ts', () => ({ config: { root: path.resolve('test-checkout'), backupDir: path.resolve('test-backups'), appVersion: 'dev' } }))
vi.mock('../backup/service.ts', () => ({ createBackup: mocks.backup }))

const commit = 'a'.repeat(40)
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('SA_APP_VERSION', '')
  mocks.dirty = false; mocks.ahead = 0; mocks.behind = 2
  mocks.backup.mockResolvedValue({ data: new Uint8Array([1, 2]) })
  mocks.exec.mockImplementation(async (bin: string, args: string[]) => {
    let stdout = ''
    if (bin === 'git') {
      if (args.includes('--show-toplevel')) stdout = path.resolve('test-checkout')
      else if (args[0] === 'symbolic-ref') stdout = 'feat/local-windows-app'
      else if (args.includes('--abbrev-ref')) stdout = 'origin/feat/local-windows-app'
      else if (args[0] === 'config') stdout = 'origin'
      else if (args[0] === 'rev-list') stdout = `${mocks.ahead}\t${mocks.behind}`
      else if (args[0] === 'status') stdout = mocks.dirty ? ' M README.md' : ''
      else if (args[0] === 'rev-parse') stdout = args[1] === 'HEAD' ? 'b'.repeat(40) : commit
    }
    return { stdout, stderr: '' }
  })
})

describe('source Git upgrade', () => {
  it('checks the tracked branch rather than assuming main', async () => {
    const { updateStatus } = await import('./updates.ts')
    expect(await updateStatus(true)).toMatchObject({ branch: 'feat/local-windows-app', behind: 2, latest: commit })
    expect(mocks.exec).toHaveBeenCalledWith('git', ['fetch', '--', 'origin'], expect.anything())
  })
  it('refuses to overwrite local changes and local commits', async () => {
    const { startUpgrade } = await import('./updates.ts')
    mocks.dirty = true
    await expect(startUpgrade(commit)).rejects.toThrow('local changes')
    mocks.dirty = false; mocks.ahead = 1
    await expect(startUpgrade(commit)).rejects.toThrow('local changes')
    expect(mocks.backup).not.toHaveBeenCalled()
  })
  it('requires the commit shown to the user to still be current', async () => {
    const { startUpgrade } = await import('./updates.ts')
    await expect(startUpgrade('c'.repeat(40))).rejects.toThrow('Remote changed')
    expect(mocks.backup).not.toHaveBeenCalled()
  })
  it('saves the backup before fast-forward, install and build, then requires restart', async () => {
    const { startUpgrade, updateStatus } = await import('./updates.ts')
    await startUpgrade(commit)
    await vi.waitFor(async () => expect((await updateStatus()).job).toMatchObject({ running: false, restartRequired: true }))
    const mergeCall = mocks.exec.mock.calls.findIndex(([, args]) => args[0] === 'merge')
    expect(mergeCall).toBeGreaterThan(-1)
    expect(mocks.write.mock.invocationCallOrder[0]).toBeLessThan(mocks.exec.mock.invocationCallOrder[mergeCall])
    expect(mocks.exec).toHaveBeenCalledWith('git', ['merge', '--ff-only', commit], expect.anything())
    await expect(startUpgrade(commit)).rejects.toThrow('Restart')
  })
  it('stops before touching Git if the safety backup fails', async () => {
    mocks.backup.mockRejectedValue(new Error('disk full'))
    const { startUpgrade, updateStatus } = await import('./updates.ts')
    await startUpgrade(commit)
    await vi.waitFor(async () => expect((await updateStatus()).job?.running).toBe(false))
    expect((await updateStatus()).job?.error).toContain('Backing up data')
    expect(mocks.exec.mock.calls.some(([, args]) => args[0] === 'merge')).toBe(false)
  })
})
