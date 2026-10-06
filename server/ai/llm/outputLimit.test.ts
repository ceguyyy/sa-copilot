import { describe, expect, it } from 'vitest'
import { maxTokensFor, withOutputLimit } from './outputLimit.ts'

describe('output limit per request', () => {
  it('uses the job default when the SA picked Auto', () => {
    expect(maxTokensFor(32000)).toBe(32000)
    expect(withOutputLimit({ maxTokens: 'nope' }, () => maxTokensFor(32000))).toBe(32000)
  })

  it('uses the SA choice for every model call of the request, across awaits', async () => {
    const seen = await withOutputLimit({ maxTokens: 64000 }, async () => {
      const first = maxTokensFor(32000)
      await new Promise((r) => setTimeout(r, 1))
      return [first, maxTokensFor(8000)]
    })
    expect(seen).toEqual([64000, 64000])
    expect(maxTokensFor(32000)).toBe(32000) // not leaked outside the request
  })

  it('ignores bodies that are not objects', () => {
    expect(withOutputLimit(null, () => maxTokensFor(16000))).toBe(16000)
  })
})
