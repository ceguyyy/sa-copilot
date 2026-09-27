import { describe, expect, test } from 'vitest'
import { HttpError } from './http.ts'
import { projectInput, skillInput, skillPatch, sourceUploadFields, toSetClause } from './validation.ts'

describe('skill schemas', () => {
  test('create fills defaults for description and is_default', () => {
    const skill = skillInput.parse({ name: 'SOW', output_type: 'sow_cekat', instructions: 'Write it' })
    expect(skill).toMatchObject({ description: '', is_default: false })
  })

  test('patch never injects defaults, so unrelated columns are left untouched', () => {
    expect(skillPatch.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' })
  })

  test('rejects an unknown output type', () => {
    expect(() => skillInput.parse({ name: 'x', output_type: 'poem', instructions: 'y' })).toThrow()
  })
})

describe('projectInput', () => {
  test('strips columns the client must not write', () => {
    const parsed = projectInput.parse({ name: 'Deal', client_name: 'ACME', id: 'evil', created_at: 'x' })
    expect(parsed).not.toHaveProperty('id')
    expect(parsed).not.toHaveProperty('created_at')
  })

  test('rejects a blank name', () => {
    expect(() => projectInput.parse({ name: '   ', client_name: 'ACME' })).toThrow()
  })
})

describe('sourceUploadFields', () => {
  test('rejects a projectId that is not a uuid', () => {
    expect(() => sourceUploadFields.parse({ projectId: '1 or 1=1', kind: 'knowledge', extractedText: '' })).toThrow()
  })
})

describe('toSetClause', () => {
  test('numbers placeholders from the given index and skips undefined values', () => {
    expect(toSetClause({ name: 'A', industry: undefined, status: 'won' }, 2)).toEqual({
      sql: '"name" = $2, "status" = $3',
      values: ['A', 'won'],
    })
  })

  test('an empty patch is a 400, not a broken UPDATE', () => {
    expect(() => toSetClause({})).toThrow(HttpError)
  })
})
