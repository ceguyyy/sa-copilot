import { describe, expect, it } from 'vitest'
import { formatElapsed } from './elapsed'

describe('formatElapsed', () => {
  it('shows seconds, then minutes and padded seconds', () => {
    expect(formatElapsed(0)).toBe('0s')
    expect(formatElapsed(42_900)).toBe('42s')
    expect(formatElapsed(125_000)).toBe('2m 05s')
  })
})
