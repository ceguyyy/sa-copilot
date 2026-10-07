// The window.saDesktop API: shared between the preload script and the React app's types (no Node imports).
import type { ConfigPatch, FolderKey, PublicConfig } from './settings.ts'

export type DesktopStatus = PublicConfig & {
  routerDashboardUrl: string
  routerExternal: boolean
  dataDir: string
  version: string
  /** Where everything is stored: data root, database, uploads, backups, logs, exports. */
  folders: Record<FolderKey, string>
}

export interface DesktopBridge {
  getUpdates(): Promise<DesktopUpdateStatus>
  checkUpdates(): Promise<DesktopUpdateStatus>
  downloadUpdate(): Promise<DesktopUpdateStatus>
  installUpdate(): Promise<void>
  getConfig(): Promise<DesktopStatus>
  saveConfig(patch: ConfigPatch): Promise<DesktopStatus>
  restartRouter(): Promise<DesktopStatus>
  openExternal(url: string): Promise<void>
  openLogs(): Promise<void>
  openFolder(folder: FolderKey): Promise<void>
  splashAction(action: 'retry' | 'logs' | 'quit'): void
}

export interface DesktopUpdateStatus {
  supported: boolean
  version: string
  latest?: string
  phase: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'preparing' | 'installing' | 'error'
  percent?: number
  reason?: string
  error?: string
  safetyBackup?: string
}
