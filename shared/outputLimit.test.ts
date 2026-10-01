import { describe, expect, it } from 'vitest'
import { OUTPUT_LIMIT_OPTIONS, formatTokens, parseOutputLimit } from './outputLimit.ts'

describe('parseOutputLimit', () => {
  it('accepts whole token counts inside the allowed range', () => {
    expect(parseOutputLimit(32000)).toBe(32000)
    expect(parseOutputLimit('64000')).toBe(64000)
  })

  it('means "use the default" for missing, invalid or out-of-range values', () => {
    for (const v of [undefined, null, '', 'abc', 0, 500, 1.5, 10_000_000]) expect(parseOutputLimit(v)).toBeUndefined()
  })

  it('accepts every option the UI offers', () => {
    for (const v of OUTPUT_LIMIT_OPTIONS) expect(parseOutputLimit(v)).toBe(v)
  })
})

describe('formatTokens', () => {
  it('writes token counts compactly', () => {
    expect(formatTokens(8000)).toBe('8k')
    expect(formatTokens(128000)).toBe('128k')
    expect(formatTokens(1500)).toBe('1.5k')
  })
})
