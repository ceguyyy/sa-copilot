import { describe, expect, test } from 'vitest'
import { lineDiff } from './diff'

describe('lineDiff', () => {
  test('marks unchanged, removed and added lines', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc')).toEqual([
      { op: 'same', text: 'a' },
      { op: 'del', text: 'b' },
      { op: 'add', text: 'x' },
      { op: 'same', text: 'c' },
    ])
  })

  test('handles appends to an empty document', () => {
    expect(lineDiff('', 'a')).toEqual([
      { op: 'del', text: '' },
      { op: 'add', text: 'a' },
    ])
  })

  test('returns only same lines for identical input', () => {
    expect(lineDiff('a\nb', 'a\nb').every((l) => l.op === 'same')).toBe(true)
  })
})
