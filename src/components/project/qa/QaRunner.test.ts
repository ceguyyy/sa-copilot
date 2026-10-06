// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QaPlan, QaPlanCase } from '../../../../shared/pocQa.ts'
import { type QaAdapter, QaRunner } from './QaRunner'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const planCase = (title: string): QaPlanCase => ({ title, goal: '', contact: { Name: 'QA' }, variables: [], steps: [{ message: 'Halo', expectedAi: 'Sapa', expectedAction: '' }] })
const plan: QaPlan = { livechatUrl: 'https://live.cekat.ai/?chat=x', contactFields: [{ label: 'Name', placeholder: '', required: true }], cases: ['A', 'B', 'C', 'D'].map(planCase) }

let host: HTMLDivElement
let root: Root
let ran: QaPlanCase[] = []

const adapter: QaAdapter = {
  queryKey: ['test-runs'],
  prepare: async () => plan,
  run: async (params) => {
    ran = params.cases
    return { id: 'r1', created_at: '2026-10-02T00:00:00Z', report: { livechatUrl: '', startedAt: '', finishedAt: '', cases: [], summary: '', revisionPrompt: '' } }
  },
  listRuns: async () => [],
  setActionCheck: async () => ({}),
  removeRun: async () => ({}),
}

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)))
const button = (prefix: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(prefix)) as HTMLButtonElement

beforeEach(() => {
  vi.stubGlobal('confirm', () => true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  act(() => root.render(createElement(QueryClientProvider, { client }, createElement(QaRunner, { adapter, reportTitle: 'Test', livechatUrl: plan.livechatUrl, onLivechatUrlChange: () => {} }))))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('QaRunner', () => {
  it('runs only the scenarios left checked', async () => {
    act(() => button('Prepare QA run').click())
    await flush()
    expect(button('Run').textContent).toContain('Run 4 of 4')

    act(() => (host.querySelector('input[aria-label="Run B"]') as HTMLInputElement).click())
    expect(button('Run').textContent).toContain('Run 3 of 4')

    act(() => button('Run').click())
    await flush()
    expect(ran.map((c) => c.title)).toEqual(['A', 'C', 'D'])
  })
})
