// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { SaPostmanPage } from './SaPostmanPage'
import { OpenSaPostman } from '../components/OpenSaPostman'
import { saPostmanApi } from '../lib/api'

vi.mock('../lib/api', () => ({ saPostmanApi: { execute: vi.fn(), assist:vi.fn(), list:vi.fn().mockResolvedValue([]), history:vi.fn().mockResolvedValue([]) } }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
it('opens a POC request with its payload, waits for Send, and displays the response', async () => {
  const host = document.createElement('div'), root = createRoot(host)
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}})
  vi.mocked(saPostmanApi.execute).mockResolvedValue({ response:{ status: 201, statusText: 'Created', headers: {}, body: '{"ok":true}', bytes: 11, durationMs: 12, truncated: false },error:null,checks:[],historyId:'test' })
  try {
    await act(async () => root.render(createElement(QueryClientProvider,{client},createElement(MemoryRouter, { initialEntries: ['/projects/test'] }, createElement(Routes, null,
      createElement(Route, { path: '/projects/test', element: createElement(OpenSaPostman, { curl: `curl -X POST https://example.com/hook -H 'Content-Type: application/json' --data-raw '{"action":"create_ticket"}'`, title: 'Create ticket' }) }),
      createElement(Route, { path: '/sapostman', element: createElement(SaPostmanPage) })
    )))))
    await act(async () => host.querySelector('button')!.click())
    expect((host.querySelector('[aria-label="Request body"]') as HTMLTextAreaElement).value).toBe('{"action":"create_ticket"}')
    expect(saPostmanApi.execute).not.toHaveBeenCalled()
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Hit / Send')!.click())
    expect(saPostmanApi.execute).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', body: '{"action":"create_ticket"}' }))
    expect(host.textContent).toContain('201 Created')
    expect(host.textContent).toContain('"ok": true')
    const askButton=[...host.querySelectorAll('button')].find(b=>b.textContent==='Ask your SA')!
    expect(askButton.disabled).toBe(true)
    const prompt=host.querySelector('textarea[placeholder="Describe a request, or ask about an error…"]') as HTMLTextAreaElement
    vi.mocked(saPostmanApi.assist).mockResolvedValue({explanation:'Check idempotency before retries.',curl:'',docs:''})
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(prompt,'How should I retry this request?')
      prompt.dispatchEvent(new Event('input',{bubbles:true}))
    })
    await act(async()=>askButton.click())
    expect(saPostmanApi.assist).toHaveBeenCalledWith(expect.objectContaining({mode:'ask',prompt:'How should I retry this request?',endpoint:expect.objectContaining({method:'POST'})}))
    expect(host.textContent).toContain('Check idempotency before retries.')
    expect(saPostmanApi.execute).toHaveBeenCalledTimes(1)
  } finally { act(() => root.unmount()); client.clear(); vi.clearAllMocks() }
})
