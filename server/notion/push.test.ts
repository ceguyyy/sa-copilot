import { describe, expect, it, vi } from 'vitest'

// push.ts imports the DB and config; only the pure helpers are under test here.
vi.mock('../db.ts', () => ({ query: vi.fn(), queryOne: vi.fn() }))
vi.mock('../config.ts', () => ({ config: { notion: { token: '', parentPage: '' } } }))

const { notionPageId, notionPageUrl } = await import('./push.ts')

describe('notionPageId', () => {
  it('reads ids from Notion links, dashed ids and raw ids', () => {
    const id = '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d'
    expect(notionPageId('https://www.notion.so/cekat/Projects-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d?pvs=4')).toBe(id)
    expect(notionPageId(id)).toBe(id)
    expect(notionPageId('1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D')).toBe(id)
  })

  it('returns null when there is no page id', () => {
    expect(notionPageId('')).toBeNull()
    expect(notionPageId('https://www.notion.so/cekat')).toBeNull()
  })

  it('builds a page URL', () => {
    expect(notionPageUrl('1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d')).toBe('https://www.notion.so/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d')
  })
})
