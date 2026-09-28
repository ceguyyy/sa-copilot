import { describe, expect, it } from 'vitest'
import { DOC_SCHEMAS } from './schemas.ts'
import { schemaOutline } from './schemaOutline.ts'

describe('schemaOutline', () => {
  it('lists the TOR table columns', () => {
    expect(schemaOutline(DOC_SCHEMAS.tor as never)).toEqual(['rows[]: layanan, sub_layanan, deskripsi, note, raised_by'])
  })

  it('walks nested arrays and shows enums', () => {
    expect(schemaOutline(DOC_SCHEMAS.user_journey as never)).toEqual([
      'title, persona',
      'sheets[]: name',
      'sheets[].sections[]: title',
      'sheets[].sections[].scripts[]: no, parent, scenario, trigger, response, note, revision',
    ])
    expect(schemaOutline(DOC_SCHEMAS.assessment as never)[0]).toBe('language (id/en), summary')
  })
})
