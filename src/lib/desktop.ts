// The desktop app's bridge (electron/preload.ts). Undefined in the browser / dev server, where .env is used.
import type { DesktopBridge } from '../../electron/bridge.ts'

export type { DesktopBridge, DesktopStatus } from '../../electron/bridge.ts'
export type { ConfigPatch, FolderKey, SecretKey, ValueKey } from '../../electron/settings.ts'

export const desktop: DesktopBridge | undefined = (window as { saDesktop?: DesktopBridge }).saDesktop
