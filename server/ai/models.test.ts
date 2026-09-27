import { describe, expect, test, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgres://test@localhost/test'
})

const { MODEL_ID_RE, toModelInfo } = await import('./models.ts')

describe('toModelInfo', () => {
  test('Claude models behind 9router speak the Anthropic format with adaptive thinking', () => {
    const m = toModelInfo({
      id: 'cc/claude-opus-5-5',
      owned_by: 'cc',
      capabilities: { tools: true, vision: true, pdf: true, reasoning: true, thinkingFormat: 'claude-adaptive', maxOutput: 128000 },
    })
    expect(m).toMatchObject({ provider: 'cc', name: 'claude-opus-5-5', format: 'anthropic', adaptiveThinking: true, pdf: true, maxOutput: 128000 })
  })

  test('other providers speak the OpenAI format and get no Claude-only thinking', () => {
    const m = toModelInfo({ id: 'oc/big-pickle', capabilities: { reasoning: true, thinkingFormat: 'openai' } })
    expect(m).toMatchObject({ provider: 'oc', name: 'big-pickle', format: 'openai', adaptiveThinking: false, vision: false, tools: true })
  })

  test('a hand-typed id is marked custom and inferred from its name', () => {
    expect(toModelInfo({ id: 'oc/mimo-v2.5-free' }, true)).toMatchObject({ custom: true, format: 'openai', maxOutput: null })
    expect(toModelInfo({ id: 'xx/claude-sonnet-5' }, true)).toMatchObject({ format: 'anthropic', adaptiveThinking: true })
  })

  test('respects a model that cannot call tools', () => {
    expect(toModelInfo({ id: 'x/tiny', capabilities: { tools: false } }).tools).toBe(false)
  })
})

describe('MODEL_ID_RE', () => {
  test('accepts provider/model ids and rejects anything else', () => {
    for (const ok of ['oc/big-pickle', 'oc/nemotron-3.5-lightning-free', 'gh/gpt-5.1:latest']) expect(MODEL_ID_RE.test(ok)).toBe(true)
    for (const bad of ['big-pickle', 'oc/', 'oc/has space', '"oc/x"', '../etc']) expect(MODEL_ID_RE.test(bad)).toBe(false)
  })
})
