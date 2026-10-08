// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnhancementBatch } from '../../../shared/enhancement.ts'
import { EnhancementPanel } from './EnhancementPanel'

const api = vi.hoisted(() => ({ get: vi.fn(), items: vi.fn(), history: vi.fn(), apply: vi.fn() }))
const activities = vi.hoisted(() => vi.fn())
const enhance = vi.hoisted(() => vi.fn())
vi.mock('../../lib/api', () => ({ enhancementApi: api, activityApi: { list: activities } }))
vi.mock('../../lib/ai', () => ({ enhanceProject: enhance }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
let client: QueryClient
let batch: EnhancementBatch
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === text)!
const typeDecision = () => act(() => {
  const input = host.querySelector('textarea')!
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'B2C only; remove B2B')
  input.dispatchEvent(new Event('input', { bubbles: true }))
})

beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false } })
  const report = { summary: 'Check scope', conflicts: [], impacts: [], issues: [] }
  batch = {
    id: 'batch', project_id: 'project', prompt: 'Align scope', rules: 'Preserve prices', context: [],
    items: ['TOR', 'Timeline'].map((title, i) => ({ key: `document:${i}`, id: String(i), title, kind: 'document', category: 'Deliverables', editable: true, content: { rows: [] }, proposed: { rows: [{ requirement: 'B2B' }] }, state: 'ready', summary: `${title} earlier revision`, docType: 'tor' })),
    report, resolutions: {}, review: { ...report, conflicts: [{ id: 'scope', detail: 'TOR includes B2B', question: 'Which scope?', targetKeys: ['document:0'] }] },
    review_keys: ['document:0', 'document:1'], accepted: [], state: 'draft', created_at: '2026-10-08T00:00:00Z',
  }
  api.items.mockResolvedValue(batch.items)
  api.history.mockResolvedValue([batch])
  activities.mockResolvedValue([])
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
})
afterEach(() => {
  act(() => root.unmount())
  client.clear(); host.remove()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})
async function mount() {
  client.setQueryData(['enhancement-items', 'project'], batch.items)
  client.setQueryData(['enhancement-history', 'project'], [batch])
  act(() => root.render(createElement(QueryClientProvider, { client }, createElement(EnhancementPanel, { projectId: 'project', initialOpen: true, initialHistory: true }))))
  act(() => [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Align scope'))!.click())
  await flush()
}

describe('enhancement conflict revision', () => {
  it('revises the chosen target in the same batch and automatically rechecks before enabling Apply', async () => {
    await mount()
    const targets = [...host.querySelectorAll<HTMLInputElement>('fieldset input')]
    expect(targets.map(i => i.checked)).toEqual([true, false])
    expect(button('Apply selected revisions').disabled).toBe(true)
    expect(button('Revise target documents').disabled).toBe(true)
    typeDecision()
    const revised = { ...batch, review: null, review_keys: [] }
    enhance.mockResolvedValueOnce(revised).mockResolvedValueOnce({ ...revised, review: { summary: 'Consistent', conflicts: [], impacts: [], issues: [] }, review_keys: batch.review_keys })
    await act(async () => button('Revise target documents').click())
    await flush()
    expect(enhance).toHaveBeenNthCalledWith(1, { batchId: 'batch', action: 'repair', conflictId: 'scope', decision: 'B2C only; remove B2B', keys: ['document:0'], accepted: ['document:0', 'document:1'] }, expect.any(Object))
    expect(enhance).toHaveBeenNthCalledWith(2, { batchId: 'batch', action: 'review', accepted: ['document:0', 'document:1'] }, expect.any(Object))
    expect(host.textContent).toContain('TOR earlier revision')
    expect(host.textContent).toContain('Timeline earlier revision')
    expect(button('Apply selected revisions').disabled).toBe(false)
    expect(api.apply).not.toHaveBeenCalled()
  })
  it('lets saved conflicts without target mappings choose a document manually', async () => {
    delete batch.review!.conflicts[0].targetKeys
    await mount()
    typeDecision()
    expect(button('Revise target documents').disabled).toBe(true)
    act(() => host.querySelector<HTMLInputElement>('fieldset input')!.click())
    expect(button('Revise target documents').disabled).toBe(false)
  })
  it('blocks conflict repair when the accepted selection has changed', async () => {
    await mount()
    typeDecision()
    act(() => host.querySelector<HTMLInputElement>('input[aria-label="Accept Timeline"]')!.click())
    expect(host.textContent).toContain('Selection changed')
    expect(button('Revise target documents').disabled).toBe(true)
    expect(host.querySelector('fieldset')!.disabled).toBe(true)
    expect(enhance).not.toHaveBeenCalled()
  })
  it('retains previews and the conflict when repair fails', async () => {
    await mount()
    typeDecision()
    enhance.mockRejectedValueOnce(new Error('Provider timeout'))
    await act(async () => button('Revise target documents').click())
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Provider timeout')
    expect(host.textContent).toContain('TOR earlier revision')
    expect(host.textContent).toContain('TOR includes B2B')
    expect(button('Revise target documents').disabled).toBe(false)
    expect(button('Apply selected revisions').disabled).toBe(true)
    expect(enhance).toHaveBeenCalledTimes(1)
    expect(host.querySelector('fieldset')?.closest('section')?.querySelector('[role="alert"]')?.textContent).toContain('Revision failed. Your previous previews are kept. Provider timeout')
  })
  it('shows immediate progress at the clicked button while waiting for the model', async () => {
    await mount()
    typeDecision()
    let fail!: (error: Error) => void
    enhance.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
    act(() => button('Revise target documents').click())
    expect(button('Revise target documents').disabled).toBe(true)
    expect(host.querySelector('fieldset')?.closest('section')?.querySelector('[role="status"]')?.textContent).toContain('Waiting for AI response')
    await act(async () => fail(new Error('Cancelled test')))
  })
  it('explains an outdated backend next to the clicked button', async () => {
    await mount()
    typeDecision()
    enhance.mockRejectedValueOnce(new Error('[{"code":"invalid_value","values":["analyze","preview","review"],"path":["action"],"message":"Invalid option: expected one of analyze|preview|review"}]'))
    await act(async () => button('Revise target documents').click())
    const localError = host.querySelector('fieldset')?.closest('section')?.querySelector('[role="alert"]')?.textContent
    expect(localError).toContain('server is running an older version')
    expect(localError).toContain('Restart the SA Copilot server')
    expect(button('Revise target documents').disabled).toBe(false)
  })
  it('keeps answers to other conflicts while one conflict is revised and checked', async () => {
    const remaining = { id: 'channel', detail: 'Channel mismatch', question: 'Which channel?', targetKeys: ['document:1'] }
    batch.review!.conflicts.push(remaining)
    await mount()
    typeDecision()
    act(() => {
      const input = host.querySelectorAll('textarea')[1]
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'WhatsApp and TikTok')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const revised = { ...batch, review: null, review_keys: [] }
    enhance.mockResolvedValueOnce(revised).mockResolvedValueOnce({ ...batch, review: { ...batch.review!, conflicts: [remaining] } })
    await act(async () => button('Revise target documents').click())
    await flush()
    expect(host.querySelector('textarea')!.value).toBe('WhatsApp and TikTok')
    expect(button('Revise target documents').disabled).toBe(false)
    expect(button('Apply selected revisions').disabled).toBe(true)
  })
  it('keeps repaired previews when the automatic check fails and allows a manual retry', async () => {
    await mount()
    typeDecision()
    const revised = { ...batch, review: null, review_keys: [], items: batch.items.map(i => i.id === '0' ? { ...i, summary: 'TOR conflict fixed' } : i) }
    enhance.mockResolvedValueOnce(revised).mockRejectedValueOnce(new Error('Review timeout'))
    await act(async () => button('Revise target documents').click())
    await flush()
    expect(host.textContent).toContain('TOR conflict fixed')
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Review timeout')
    expect(button('Apply selected revisions').disabled).toBe(true)
    expect(button('Check selected previews').disabled).toBe(false)
    enhance.mockResolvedValueOnce({ ...revised, review: { summary: 'Consistent', conflicts: [], impacts: [], issues: [] }, review_keys: batch.review_keys })
    await act(async () => button('Check selected previews').click())
    await flush()
    expect(button('Apply selected revisions').disabled).toBe(false)
  })
  it('detects a running batch after reopening and refreshes its saved previews when it finishes', async () => {
    const working = { id: 'job', task: 'enhancement', batchId: 'batch', projectId: 'project', status: 'working', detail: 'Generating output', startedAt: 1, characters: 40000 }
    activities.mockResolvedValue([working])
    await mount()
    await flush()
    expect(host.textContent).toContain('This batch is still being processed')
    expect(button('Revise target documents').disabled).toBe(true)
    expect(button('Check selected previews').disabled).toBe(true)
    const revised = { ...batch, review: null, review_keys: [], items: batch.items.map(i => ({ ...i, summary: 'Repaired in background' })) }
    api.get.mockResolvedValue(revised)
    act(() => client.setQueryData(['enhancement-activity', 'project'], [{ ...working, status: 'done', detail: 'Completed' }]))
    await flush()
    expect(api.get).toHaveBeenCalledWith('batch')
    expect(host.textContent).toContain('Repaired in background')
    expect(host.textContent).toContain('Run Check selected previews before applying')
    expect(button('Check selected previews').disabled).toBe(false)
    expect(button('Apply selected revisions').disabled).toBe(true)
    expect(enhance).not.toHaveBeenCalled()
  })
})
