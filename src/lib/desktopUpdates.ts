import type { DesktopBridge, DesktopUpdateStatus } from '../../electron/bridge'

export async function getDesktopUpdates(bridge: DesktopBridge): Promise<DesktopUpdateStatus> {
  try {
    if (typeof bridge.getUpdates === 'function') return await bridge.getUpdates()
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("No handler registered for 'updates:get'")) throw error
  }
  const config = await bridge.getConfig()
  return { supported: false, version: config.version, phase: 'idle', reason: 'The running Electron process is older than this UI. Quit SA Copilot completely and reopen it. For source mode, stop the old npm run desktop process, then run npm run desktop again.' }
}
