// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { SaPostmanPage } from './SaPostmanPage'
import { OpenSaPostman } from '../components/OpenSaPostman'
import {endpointFromRequest} from '../../shared/saPostman'
import { saPostmanApi } from '../lib/api'

vi.mock('../lib/api', () => ({ saPostmanApi: { environments:vi.fn().mockResolvedValue([]), execute: vi.fn(), assist:vi.fn(), collections:vi.fn().mockResolvedValue([]), versions:vi.fn().mockResolvedValue([]), list:vi.fn().mockResolvedValue([]), history:vi.fn().mockResolvedValue([]) } }))
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
    expect(host.textContent).toContain('ok: true')
    await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Collapse all')!.click())
    expect(host.querySelector('[aria-label="Expand Request"]')?.getAttribute('aria-expanded')).toBe('false')
    expect((host.querySelector('[aria-label="Request body"]') as HTMLTextAreaElement).value).toBe('{"action":"create_ticket"}')
    await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Expand all')!.click())
    expect(host.querySelector('[aria-label="Collapse Request"]')?.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('[aria-label="Collapse Ask your SA"]')).not.toBeNull()
    await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Collapse all')!.click())
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Open Ask your SA"]')!.click())
    const askButton=host.querySelector<HTMLButtonElement>('[aria-label="Ask your SA"]')!
    expect(askButton.disabled).toBe(true)
    const prompt=host.querySelector('[aria-label="Ask your SA message"]') as HTMLTextAreaElement
    expect(prompt.closest('footer')).not.toBeNull()
    vi.mocked(saPostmanApi.assist).mockResolvedValue({explanation:'Check idempotency before retries.',curl:'',docs:''})
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(prompt,'How should I retry this request?')
      prompt.dispatchEvent(new Event('input',{bubbles:true}))
    })
    await act(async()=>askButton.click())
    expect(saPostmanApi.assist).toHaveBeenCalledWith(expect.objectContaining({mode:'ask',prompt:'How should I retry this request?',endpoint:expect.objectContaining({method:'POST'})}))
    expect(host.textContent).toContain('Check idempotency before retries.')
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(prompt,'Give me an example')
      prompt.dispatchEvent(new Event('input',{bubbles:true}))
    })
    await act(async()=>askButton.click())
    expect(saPostmanApi.assist).toHaveBeenLastCalledWith(expect.objectContaining({history:[{role:'user',content:'How should I retry this request?'},{role:'assistant',content:'Check idempotency before retries.'}]}))
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Clear chat"]')!.click())
    expect(host.textContent).not.toContain('Check idempotency before retries.')
    expect(saPostmanApi.execute).toHaveBeenCalledTimes(1)
  } finally { act(() => root.unmount()); client.clear(); vi.clearAllMocks() }
})

it('keeps unsaved payloads in separate request tabs and marks dirty tabs',async()=>{
 const host=document.createElement('div'),root=createRoot(host),client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 const row={id:'saved',name:'Ping',version:1,updated_at:'',config:{...endpointFromRequest({url:'https://example.com/ping',method:'POST',body:'{"saved":true}'}),name:'Ping'}}
 vi.mocked(saPostmanApi.list).mockResolvedValue([row])
 try{
  await act(async()=>root.render(createElement(QueryClientProvider,{client},createElement(MemoryRouter,{initialEntries:[{pathname:'/sapostman',state:{curl:"curl -X POST https://example.com --data-raw '{\"draft\":1}'",title:'Draft'}}]},createElement(SaPostmanPage)))))
  const first=host.querySelector<HTMLTextAreaElement>('[aria-label="Request body"]')!
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(first,'{"draft":2}');first.dispatchEvent(new Event('input',{bubbles:true}))})
  await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('button[draggable]')].find(b=>b.textContent?.includes('Ping'))!.click())
  expect(host.querySelectorAll('[aria-label="Request body"]')).toHaveLength(2)
  const tabs=host.querySelector('[aria-label="Open API requests"]')!
  expect(tabs.textContent).toContain('Draft •')
  await act(async()=>[...tabs.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b=>b.textContent?.includes('Draft'))!.click())
  expect(first.value).toBe('{"draft":2}')
  expect(saPostmanApi.execute).not.toHaveBeenCalled()
 }finally{act(()=>root.unmount());client.clear();vi.clearAllMocks()}
})
