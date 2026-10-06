import { describe, expect, it } from 'vitest'
import { CHAT_GRID, parseChatSize } from './chatSize'

describe('parseChatSize', () => {
  it('keeps a saved size', () => {
    expect(parseChatSize('collapsed')).toBe('collapsed')
    expect(parseChatSize('wide')).toBe('wide')
  })

  it('falls back to the normal size for missing or unknown values', () => {
    expect(parseChatSize(null)).toBe('normal')
    expect(parseChatSize('huge')).toBe('normal')
  })
})

describe('CHAT_GRID', () => {
  it('gives the chat column a different width per size', () => {
    expect(new Set(Object.values(CHAT_GRID)).size).toBe(3)
  })
})
