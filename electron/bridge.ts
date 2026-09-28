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
  getConfig(): Promise<DesktopStatus>
  saveConfig(patch: ConfigPatch): Promise<DesktopStatus>
  restartRouter(): Promise<DesktopStatus>
  openExternal(url: string): Promise<void>
  openLogs(): Promise<void>
  openFolder(folder: FolderKey): Promise<void>
  splashAction(action: 'retry' | 'logs' | 'quit'): void
}
