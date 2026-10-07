// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopUpdateStatus } from '../../../electron/bridge'
import { desktop } from '../../lib/desktop'
import { UpdatesSettings } from './UpdatesSettings'

vi.mock('../../lib/desktop', () => ({ desktop: {
  getUpdates: vi.fn(), checkUpdates: vi.fn(), downloadUpdate: vi.fn(), installUpdate: vi.fn(),
} }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let host: HTMLDivElement
let root: Root
let client: QueryClient
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
const button = (name: string) => [...host.querySelectorAll('button')].find(element => element.textContent === name)
function mount(status: DesktopUpdateStatus) {
  client.setQueryData(['desktop-updates'], status)
  act(() => root.render(createElement(QueryClientProvider, { client }, createElement(UpdatesSettings))))
}
beforeEach(() => {
  host = document.createElement('div')
  root = createRoot(host)
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
})
afterEach(() => { act(() => root.unmount()); client.clear(); vi.resetAllMocks(); vi.unstubAllGlobals() })

describe('desktop update settings', () => {
  it('downloads an available release and requires confirmation before restart', async () => {
    const available: DesktopUpdateStatus = { supported: true, version: '2.1.1', latest: '2.2.0', phase: 'available' }
    vi.mocked(desktop!.downloadUpdate).mockResolvedValue({ ...available, phase: 'downloaded' })
    vi.mocked(desktop!.installUpdate).mockResolvedValue()
    vi.mocked(desktop!.getUpdates).mockResolvedValue({ ...available, phase: 'downloaded' })
    mount(available)
    expect(button('Restart to update')).toBeUndefined()
    await act(async () => { button('Download update')!.click() })
    await flush()
    expect(desktop!.downloadUpdate).toHaveBeenCalledOnce()
    vi.stubGlobal('confirm', () => false)
    act(() => button('Restart to update')!.click())
    expect(desktop!.installUpdate).not.toHaveBeenCalled()
    vi.stubGlobal('confirm', () => true)
    await act(async () => { button('Restart to update')!.click() })
    expect(desktop!.installUpdate).toHaveBeenCalledOnce()
  })
  it('shows progress without allowing a second update operation', () => {
    mount({ supported: true, version: '2.1.1', phase: 'downloading', percent: 37 })
    expect(host.querySelector('progress')?.value).toBe(37)
    expect(button('Check for updates')?.disabled).toBe(true)
    expect(button('Restart to update')).toBeUndefined()
  })
  it('explains why source desktop builds cannot install cloud updates', () => {
    mount({ supported: false, version: '2.1.1', phase: 'idle', reason: 'Automatic updates require the installed Windows app.' })
    expect(host.textContent).toContain('require the installed Windows app')
    expect(button('Download update')).toBeUndefined()
  })
})
