import type { AppUpdater } from 'electron-updater'
import type { DesktopUpdateStatus } from './bridge.ts'

type Updater = Pick<AppUpdater, 'on' | 'autoDownload' | 'autoInstallOnAppQuit' | 'allowPrerelease' | 'allowDowngrade' | 'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall'>

export class DesktopUpdates {
  private state: DesktopUpdateStatus
  private operation = false
  private recovering = false
  private readonly updater: Updater | null
  private readonly lifecycle: { prepare(): Promise<string>; shutdown(): Promise<void>; recover(restartServices: boolean): Promise<void>; log(message: string): void }

  constructor(updater: Updater | null, version: string, reason: string | undefined,
    lifecycle: { prepare(): Promise<string>; shutdown(): Promise<void>; recover(restartServices: boolean): Promise<void>; log(message: string): void }) {
    this.updater = updater
    this.lifecycle = lifecycle
    this.state = { supported: !!updater, version, phase: 'idle', reason }
    if (!updater) return
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.allowPrerelease = false
    updater.allowDowngrade = false
    updater.on('checking-for-update', () => { this.state.phase = 'checking' })
    updater.on('update-available', info => { this.state.latest = info.version; this.state.phase = 'available' })
    updater.on('update-not-available', () => { this.state.phase = 'current'; this.state.latest = undefined })
    updater.on('download-progress', progress => { this.state.phase = 'downloading'; this.state.percent = progress.percent })
    updater.on('update-downloaded', info => { this.state.latest = info.version; this.state.phase = 'downloaded'; this.state.percent = 100 })
    updater.on('error', error => {
      const installing = this.state.phase === 'installing'
      this.fail(error)
      if (installing) void this.recover()
    })
  }

  status(): DesktopUpdateStatus { return { ...this.state } }
  private fail(error: unknown) {
    this.state.error = error instanceof Error ? error.message : String(error)
    this.state.phase = 'error'
    this.lifecycle.log(`Update failed: ${this.state.error}`)
  }
  private async recover(restartServices = true) {
    this.recovering = true
    try { await this.lifecycle.recover(restartServices) }
    catch (error) { this.fail(error) }
    finally { this.recovering = false }
  }
  private requireReady() {
    if (!this.updater) throw new Error(this.state.reason ?? 'Desktop updates unavailable')
    if (this.operation || this.recovering || ['checking', 'downloading', 'preparing', 'installing'].includes(this.state.phase)) throw new Error('An update operation is already running')
    return this.updater
  }

  async check(): Promise<DesktopUpdateStatus> {
    const updater = this.requireReady()
    if (this.state.phase === 'downloaded') return this.status()
    this.operation = true
    this.state.error = undefined
    this.state.percent = undefined
    this.state.phase = 'checking'
    try { await updater.checkForUpdates() }
    catch (error) { this.fail(error) }
    finally { this.operation = false }
    return this.status()
  }

  async download(): Promise<DesktopUpdateStatus> {
    const updater = this.requireReady()
    if (this.state.phase !== 'available') throw new Error('Check for an available update first')
    this.operation = true
    this.state.error = undefined
    this.state.phase = 'downloading'
    this.state.percent = 0
    try { await updater.downloadUpdate() }
    catch (error) { this.fail(error) }
    finally { this.operation = false }
    return this.status()
  }

  async install(): Promise<void> {
    const updater = this.requireReady()
    if (this.state.phase !== 'downloaded') throw new Error('Download the update before restarting')
    this.operation = true
    this.state.error = undefined
    this.state.phase = 'preparing'
    let shutdownStarted = false
    try {
      this.state.safetyBackup = await this.lifecycle.prepare()
      shutdownStarted = true
      await this.lifecycle.shutdown()
      this.state.phase = 'installing'
      updater.quitAndInstall(true, true)
    } catch (error) {
      this.fail(error)
      await this.recover(shutdownStarted)
    } finally { this.operation = false }
  }
}
