// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Source } from '../lib/types'
import type { OpenQuestion } from '../lib/api'
import { SourcesPanel } from './SourcesPanel'
import { QuestionsPanel } from './project/QuestionsPanel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
let client: QueryClient
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
function mount(hash: string, child: ReactNode) {
  act(() => root.render(createElement(QueryClientProvider, { client },
    createElement(MemoryRouter, { initialEntries: [`/projects/p${hash}`] }, child))))
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
})
afterEach(() => {
  act(() => root.unmount())
  client.clear()
  host.remove()
  vi.restoreAllMocks()
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  vi.unstubAllGlobals()
})

describe('project evidence deep links', () => {
  it('opens the linked source, then preserves a manual collapse across query refreshes', async () => {
    const source: Source = { id: 's1', project_id: 'p', kind: 'requirement', name: 'Brief', mime_type: 'text/plain', storage_path: null, extracted_text: 'Client requirements', size_bytes: 19, enabled: true, created_at: '' }
    client.setQueryData(['sources', 'p'], [source])
    mount('#source-s1', createElement(SourcesPanel, { projectId: 'p', kinds: ['requirement'], title: 'Requirements' }))
    expect(host.querySelector('pre')?.textContent).toBe('Client requirements')
    const toggle = [...host.querySelectorAll('button')].find(button => button.textContent === 'Brief')!
    act(() => toggle.click())
    expect(host.querySelector('pre')).toBeNull()
    act(() => client.setQueryData(['sources', 'p'], [{ ...source, extracted_text: 'Updated requirements' }]))
    await flush()
    expect(host.querySelector('pre')).toBeNull()
  })

  it('reveals an answered question, then preserves the chosen status filter on refresh', async () => {
    const question: OpenQuestion = { id: 'q1', project_id: 'p', question: 'Confirmed deadline?', context: '', status: 'answered', answer: 'Friday', origin: 'manual', created_at: '', updated_at: '' }
    client.setQueryData(['questions', 'p'], [question])
    mount('#question-q1', createElement(QuestionsPanel, { projectId: 'p' }))
    expect(host.querySelector('#question-q1')).not.toBeNull()
    const open = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(tab => tab.textContent?.startsWith('open'))!
    act(() => open.click())
    expect(host.querySelector('#question-q1')).toBeNull()
    act(() => client.setQueryData(['questions', 'p'], [{ ...question, answer: 'Monday' }]))
    await flush()
    expect(open.getAttribute('aria-selected')).toBe('true')
    expect(host.querySelector('#question-q1')).toBeNull()
  })
})
