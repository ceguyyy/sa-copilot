// @vitest-environment jsdom
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatFlows } from '../../../../shared/pocChatFlow.ts'
import { ChatFlowSection } from './ChatFlowSection'

vi.mock('./ChatFlowCanvas', () => ({ default: () => createElement('div', { 'data-testid': 'canvas' }) }))
vi.mock('../../MermaidView', () => ({ MermaidView: ({ source }: { source: string }) => createElement('pre', { 'data-testid': 'mermaid' }, source) }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Harness() {
  const [chatFlows, setChatFlows] = useState<ChatFlows>({ flows: [] })
  return createElement(ChatFlowSection, { chatFlows, pocName: 'Demo', onChange: setChatFlows, onGenerate: () => {}, isGenerating: false, isDisabled: false })
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(createElement(Harness)))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement
const pick = (select: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
const type = (input: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
const alertText = () => host.querySelector('[role="alert"]')?.textContent ?? ''

describe('ChatFlowSection', () => {
  it('builds a flow from the Start point and reports open paths like Cekat until each ends', () => {
    act(() => button('New flow').click())
    expect(alertText()).toContain('Start point - Add A Condition Or End Flow')

    pick(host.querySelector('select[aria-label="Add node"]') as HTMLSelectElement, 'conditions')
    expect(alertText()).toContain('Condition (First Message Text) - Fill In The Trigger Text')
    expect(alertText()).toContain('Condition (Else) - Add An End Node')

    type(host.querySelector('input[aria-label="Trigger text"]') as HTMLInputElement, 'PROMO')
    const [first, second] = host.querySelectorAll<HTMLSelectElement>('select[aria-label="Add node"]')
    pick(first, 'end-ai')
    pick(second, 'end-human')
    expect(alertText()).toContain('End 1 (AI Agent) - Select An AI Agent')
    expect(alertText()).toContain('End 2 (Human Agent) - Select Human Agents')

    type(host.querySelector('input[aria-label="AI agent"]') as HTMLInputElement, 'Order Bot')
    type(host.querySelector('input[aria-label="Human agents"]') as HTMLInputElement, 'Sari, Budi')
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(host.textContent).toContain('ready to build in Cekat')
    act(() => button('Tree').click())
    expect(host.querySelector('[data-testid="mermaid"]')?.textContent).toContain('Order Bot')
    expect((host.querySelector('textarea[readonly]') as HTMLTextAreaElement).value).toContain('End 2 (Human Agent): Sari, Budi')

    // Insert a node in the middle of a finished path: the rest of the path stays after it.
    pick(host.querySelector('select[aria-label="Insert node"]') as HTMLSelectElement, 'action-addLabel')
    expect(alertText()).toContain('Action 1 (Label) - Fill In The Label')
    type(host.querySelector('input[aria-label="Label"]') as HTMLInputElement, 'Promo')
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect((host.querySelector('textarea[readonly]') as HTMLTextAreaElement).value).toMatch(/Action 1 \(Label\): Promo\n.*End 2 \(AI Agent\): Order Bot/)
  })
})
