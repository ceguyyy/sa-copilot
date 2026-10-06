import { describe, expect, it, vi } from 'vitest'
vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test')
vi.mock('../db.ts', () => ({ query: vi.fn(async () => []) }))
const { activityModel, activitySnapshot, trackActivity } = await import('./activity.ts')

describe('AI workspace activity', () => {
  it('keeps simultaneous jobs and model selection isolated', async () => {
    let release!: () => void
    const wait = new Promise<void>((resolve) => { release = resolve })
    const first = trackActivity('first', { projectId: 'project-a' }, { send() {} }, async () => {
      activityModel('model-a')
      await wait
    })
    await trackActivity('second', {}, { send() {} }, async () => { activityModel('model-b') })
    const snapshot = await activitySnapshot()
    expect(snapshot.find((job) => job.task === 'first')).toMatchObject({ status: 'working', model: 'model-a', projectId: 'project-a' })
    expect(snapshot.find((job) => job.task === 'second')).toMatchObject({ status: 'done', model: 'model-b' })
    release()
    await first
    expect((await activitySnapshot()).find((job) => job.task === 'first')?.finishedAt).toBeTypeOf('number')
  })
  it('records failures while preserving stream delivery', async () => {
    const events: unknown[] = []
    await trackActivity('error-event', {}, { send: (event) => events.push(event) }, async (out) => { out.send({ type: 'error', error: 'failed' }) })
    expect(events).toEqual([{ type: 'error', error: 'failed' }])
    expect((await activitySnapshot()).find((job) => job.task === 'error-event')).toMatchObject({ status: 'error', detail: 'failed' })
    await expect(trackActivity('thrown-error', {}, { send() {} }, async () => { throw new Error('failed') })).rejects.toThrow('failed')
    expect((await activitySnapshot()).find((job) => job.task === 'thrown-error')).toMatchObject({ status: 'error', detail: 'failed' })
  })
  it('captures live metadata without retaining request or tool contents', async () => {
    const events: unknown[] = []
    await trackActivity('metadata', { docType: 'sow', message: 'private prompt', apiKey: 'secret' }, { send: (event) => events.push(event) }, async (out) => {
      activityModel('cx/test', { provider: 'cx', format: 'openai', effort: 'high', maxTokens: 12000, attachmentCount: 2 })
      out.send({ type: 'tool', name: 'search_docs', input: { key: 'private tool input' } })
      out.send({ type: 'progress', chars: 42 })
      const live = (await activitySnapshot()).find((job) => job.task === 'metadata')
      expect(live).toMatchObject({ status: 'working', model: 'cx/test', provider: 'cx', format: 'openai', effort: 'high', maxTokens: 12000, attachmentCount: 2, documentType: 'sow', characters: 42, tool: 'search_docs', toolCalls: 1, modelCalls: 1 })
      expect(JSON.stringify(live)).not.toMatch(/private|secret/)
      out.send({ type: 'result', data: { added: 3 } })
      out.send({ type: 'done', documentId: 'doc-id' })
    })
    expect(events).toHaveLength(4)
    expect((await activitySnapshot()).find((job) => job.task === 'metadata')).toMatchObject({ status: 'done', added: 3, documentId: 'doc-id' })
  })
})
