import { it, expect, vi } from 'vitest'
import { getDesktopUpdates } from './desktopUpdates'
import type { DesktopBridge } from '../../electron/bridge'

it('explains how to restart when the running main process lacks the updater handler', async () => {
  const bridge = { getUpdates: vi.fn().mockRejectedValue(new Error("No handler registered for 'updates:get'")), getConfig: vi.fn().mockResolvedValue({ version: '2.1.0' }) } as unknown as DesktopBridge
  expect(await getDesktopUpdates(bridge)).toMatchObject({ supported: false, version: '2.1.0', reason: expect.stringContaining('Quit SA Copilot completely') })
})
it('does not hide other IPC errors', async () => {
  const bridge = { getUpdates: vi.fn().mockRejectedValue(new Error('Permission denied')) } as unknown as DesktopBridge
  await expect(getDesktopUpdates(bridge)).rejects.toThrow('Permission denied')
})
