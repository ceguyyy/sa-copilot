import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readRecentWork, rememberWork } from './recentWork'

const project = '11111111-1111-4111-8111-111111111111'
const document = '22222222-2222-4222-8222-222222222222'
describe('recent project work', () => {
  const values = new Map<string, string>()
  beforeEach(() => { values.clear(); vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }) })
  afterEach(() => vi.unstubAllGlobals())
  it('remembers the last document and keeps account histories separate', () => {
    rememberWork('account-a', `/projects/${project}/docs/${document}`)
    expect(readRecentWork('account-a')).toMatchObject({ projectId: project, documentId: document })
    expect(readRecentWork('account-b')).toBeNull()
  })
  it('does not overwrite project history while visiting Home or settings', () => {
    rememberWork('account-a', `/projects/${project}`)
    rememberWork('account-a', '/home'); rememberWork('account-a', '/settings/account')
    expect(readRecentWork('account-a')).toMatchObject({ projectId: project })
  })
  it('rejects malformed records and URLs', () => {
    values.set('sa-copilot.recent-work.account-a', '{')
    expect(readRecentWork('account-a')).toBeNull()
    values.set('sa-copilot.recent-work.account-a', JSON.stringify({ projectId: '../../other', visitedAt: 1 }))
    expect(readRecentWork('account-a')).toBeNull()
    rememberWork('account-a', '/projects/not-a-project')
    expect(readRecentWork()).toBeNull()
  })
  it('works when browser storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Blocked') }, setItem: () => { throw new Error('Blocked') } })
    expect(() => rememberWork('account-a', `/projects/${project}`)).not.toThrow()
    expect(readRecentWork('account-a')).toBeNull()
  })
})
