// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useResetState } from './useResetState'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Probe = { state: string; setState: (v: string) => void; renders: string[] }
type HarnessProps = { source: unknown; seed: () => string; onRender: (state: string, setState: (v: string) => void) => void }

// One component type for every render, so re-rendering updates it instead of remounting it.
function Harness({ source, seed, onRender }: HarnessProps) {
  const [state, setState] = useResetState(source, seed, 'fallback')
  onRender(state, setState)
  return null
}

function mount(root: Root, source: unknown, seed: () => string, probe: Probe) {
  const onRender = (state: string, setState: (v: string) => void) => {
    probe.state = state
    probe.setState = setState
    probe.renders.push(state)
  }
  act(() => root.render(createElement(Harness, { source, seed, onRender })))
}

describe('useResetState', () => {
  let container: HTMLDivElement
  let root: Root
  let probe: Probe

  beforeEach(() => {
    container = document.createElement('div')
    root = createRoot(container)
    probe = { state: '', setState: () => {}, renders: [] }
  })
  afterEach(() => act(() => root.unmount()))

  it('starts from the fallback while there is no source', () => {
    mount(root, undefined, () => 'seeded', probe)
    expect(probe.state).toBe('fallback')
  })

  it('starts from the seed when a source exists', () => {
    mount(root, 'v1', () => 'seeded v1', probe)
    expect(probe.state).toBe('seeded v1')
  })

  it('keeps local edits while the source stays the same', () => {
    mount(root, 'v1', () => 'seeded v1', probe)
    act(() => probe.setState('edited'))
    mount(root, 'v1', () => 'seeded v1', probe)
    expect(probe.state).toBe('edited')
  })

  it('re-seeds when the source changes, without ever committing the stale value', () => {
    mount(root, 'v1', () => 'seeded v1', probe)
    act(() => probe.setState('edited'))
    probe.renders = []
    mount(root, 'v2', () => 'seeded v2', probe)
    expect(probe.state).toBe('seeded v2')
    // The stale render is thrown away before commit, so the last render is the re-seeded one.
    expect(probe.renders.at(-1)).toBe('seeded v2')
  })

  it('keeps the current state when the source goes away', () => {
    mount(root, 'v1', () => 'seeded v1', probe)
    act(() => probe.setState('edited'))
    mount(root, null, () => 'unused', probe)
    expect(probe.state).toBe('edited')
  })

  it('compares sources by identity', () => {
    const data = { a: 1 }
    mount(root, data, () => 'seeded', probe)
    act(() => probe.setState('edited'))
    mount(root, data, () => 'seeded again', probe)
    expect(probe.state).toBe('edited')
    mount(root, { a: 1 }, () => 'new object', probe)
    expect(probe.state).toBe('new object')
  })
})
