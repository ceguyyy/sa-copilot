import { describe, expect, it, test } from 'vitest'
import { compactDiff, lineDiff } from './diff'

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
describe('compactDiff', () => {
  it('keeps changed lines with a little context and folds long unchanged runs', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].join('\n')
    const after = ['a', 'b', 'c', 'd', 'e', 'f', 'X', 'h'].join('\n')
    expect(compactDiff(lineDiff(before, after), 1)).toEqual([
      { op: 'skip', count: 5 },
      { op: 'same', text: 'f' },
      { op: 'del', text: 'g' },
      { op: 'add', text: 'X' },
      { op: 'same', text: 'h' },
    ])
  })

  it('keeps everything when nothing is far from a change', () => {
    expect(compactDiff(lineDiff('a\nb', 'a\nc'), 2)).toEqual([
      { op: 'same', text: 'a' },
      { op: 'del', text: 'b' },
      { op: 'add', text: 'c' },
    ])
  })
})
