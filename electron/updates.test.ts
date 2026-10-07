import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { DesktopUpdates } from './updates.ts'

function harness() {
  const updater = Object.assign(new EventEmitter(), {
    autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true, allowDowngrade: true,
    checkForUpdates: vi.fn(async () => { updater.emit('update-available', { version: '2.2.0' }) }),
    downloadUpdate: vi.fn(async () => { updater.emit('download-progress', { percent: 42 }); updater.emit('update-downloaded', { version: '2.2.0' }) }),
    quitAndInstall: vi.fn(),
  })
  const order: string[] = []
  const lifecycle = {
    prepare: vi.fn(async () => { order.push('backup'); return '/backups/safety.sacopilot' }),
    shutdown: vi.fn(async () => { order.push('shutdown') }), recover: vi.fn(async () => {}), log: vi.fn(),
  }
  updater.quitAndInstall.mockImplementation(() => { order.push('install') })
  const controller = new DesktopUpdates(updater as unknown as NonNullable<ConstructorParameters<typeof DesktopUpdates>[0]>, '2.1.0', undefined, lifecycle)
  return { updater, lifecycle, controller, order }
}

describe('Windows desktop updates', () => {
  it('requires an installed supported app', async () => {
    const { lifecycle } = harness()
    const controller = new DesktopUpdates(null, '2.1.0', 'Install the Windows app', lifecycle)
    expect(controller.status().supported).toBe(false)
    await expect(controller.check()).rejects.toThrow('Install the Windows app')
  })
  it('does not install on ordinary quit and backs up before stopping services and installing', async () => {
    const { updater, lifecycle, controller, order } = harness()
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.autoDownload).toBe(false)
    expect(updater.allowDowngrade).toBe(false)
    expect(updater.allowPrerelease).toBe(false)
    await expect(controller.install()).rejects.toThrow('Download')
    expect((await controller.check()).phase).toBe('available')
    expect((await controller.download()).phase).toBe('downloaded')
    await controller.install()
    expect(order).toEqual(['backup', 'shutdown', 'install'])
    expect(controller.status().safetyBackup).toBe('/backups/safety.sacopilot')
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true)
    expect(lifecycle.recover).not.toHaveBeenCalled()
  })
  it('keeps the app running when backup fails', async () => {
    const { updater, lifecycle, controller } = harness()
    await controller.check(); await controller.download()
    lifecycle.prepare.mockRejectedValueOnce(new Error('Disk full'))
    await controller.install()
    expect(controller.status()).toMatchObject({ phase: 'error', error: 'Disk full' })
    expect(lifecycle.shutdown).not.toHaveBeenCalled()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    expect(lifecycle.recover).toHaveBeenCalledWith(false)
  })
  it('never installs a failed download and permits checking again', async () => {
    const { updater, controller } = harness()
    await controller.check()
    updater.downloadUpdate.mockRejectedValueOnce(new Error('Checksum mismatch'))
    expect((await controller.download()).error).toBe('Checksum mismatch')
    await expect(controller.install()).rejects.toThrow('Download')
    expect((await controller.check()).phase).toBe('available')
  })
  it('rejects duplicate operations and preserves an already downloaded update', async () => {
    const { updater, controller } = harness()
    let complete!: () => void
    updater.checkForUpdates.mockImplementationOnce(() => new Promise<void>(resolve => { complete = () => { updater.emit('update-available', { version: '2.2.0' }); resolve() } }))
    const first = controller.check()
    await expect(controller.check()).rejects.toThrow('already running')
    complete(); await first
    await controller.check(); await controller.download()
    const calls = updater.checkForUpdates.mock.calls.length
    expect((await controller.check()).phase).toBe('downloaded')
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(calls)
  })
  it('restores local services if the installer emits an error', async () => {
    const { updater, controller, lifecycle } = harness()
    await controller.check(); await controller.download()
    updater.quitAndInstall.mockImplementationOnce(() => { updater.emit('error', new Error('Installer denied')) })
    await controller.install()
    expect(controller.status().phase).toBe('error')
    expect(lifecycle.recover).toHaveBeenCalledOnce()
  })
})
