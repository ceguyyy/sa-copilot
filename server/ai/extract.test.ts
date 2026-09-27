import { describe, expect, test } from 'vitest'
import { parseJsonObject } from './extract.ts'
import { resolveToolName } from './llm/types.ts'

describe('parseJsonObject', () => {
  test('reads plain JSON text (structured output)', () => {
    expect(parseJsonObject('{"rows":[{"a":1}]}')).toEqual({ rows: [{ a: 1 }] })
  })

  test('recovers JSON wrapped in prose and ```json fences when a model skipped the tool', () => {
    expect(parseJsonObject('Sure:\n```json\n{"title":"TOR"}\n```\nDone.')).toEqual({ title: 'TOR' })
  })

  test('returns null for arrays, broken JSON and plain prose', () => {
    expect(parseJsonObject('[1,2]')).toBeNull()
    expect(parseJsonObject('{"title": ')).toBeNull()
    expect(parseJsonObject('1. Title one\n2. Title two')).toBeNull()
  })
})

describe('resolveToolName', () => {
  const defs = [{ name: 'submit_document' }, { name: 'cekat_docs__getPage' }, { name: 'cekat_docs__getPageMeta' }]

  test('matches exactly first', () => {
    expect(resolveToolName('cekat_docs__getPage', defs)?.name).toBe('cekat_docs__getPage')
  })

  test('accepts names a proxy suffixed (9router: submit_document → submit_document_ide)', () => {
    expect(resolveToolName('submit_document_ide', defs)?.name).toBe('submit_document')
  })

  test('prefers the longest matching prefix', () => {
    expect(resolveToolName('cekat_docs__getPageMeta_ide', defs)?.name).toBe('cekat_docs__getPageMeta')
  })

  test('returns undefined for unknown tools', () => {
    expect(resolveToolName('web_search', defs)).toBeUndefined()
  })
})
