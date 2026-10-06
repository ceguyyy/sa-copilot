import { describe, expect, it, vi } from 'vitest'

vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test')
const { systemBlocks } = await import('./anthropic.ts')

describe('systemBlocks', () => {
  it('caches the last block', () => {
    expect(systemBlocks(['base', 'context'])).toEqual([
      { type: 'text', text: 'base' },
      { type: 'text', text: 'context', cache_control: { type: 'ephemeral' } },
    ])
  })

  it('drops empty blocks so cache_control never lands on an empty one (theme / tools helper have no project context)', () => {
    expect(systemBlocks(['base', 'role', '', '  '])).toEqual([
      { type: 'text', text: 'base' },
      { type: 'text', text: 'role', cache_control: { type: 'ephemeral' } },
    ])
  })
})
