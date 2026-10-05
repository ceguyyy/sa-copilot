import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { AiActivity } from '../../shared/activity.ts'
import { describeError, type Stream } from './stream.ts'

const context = new AsyncLocalStorage<AiActivity>()
const jobs: AiActivity[] = []
export const activitySnapshot = () => jobs.map((job) => ({ ...job }))
export function activityModel(model: string, metadata: Partial<Pick<AiActivity, 'provider' | 'format' | 'effort' | 'maxTokens' | 'attachmentCount'>> = {}) {
  const job = context.getStore()
  if (job) {
    Object.assign(job, metadata)
    job.model = model
    job.modelCalls = (job.modelCalls ?? 0) + 1
    job.updatedAt = Date.now()
    job.detail = 'Waiting for model response'
  }
}
export async function trackActivity(task: string, body: unknown, out: Stream, run: (out: Stream) => Promise<void>) {
  const projectId = body && typeof body === 'object' && 'projectId' in body && typeof body.projectId === 'string' ? body.projectId : undefined
  const job: AiActivity = { id: randomUUID(), task, projectId, status: 'working', startedAt: Date.now(), detail: 'Preparing request' }
  if (body && typeof body === 'object') {
    const value = body as Record<string, unknown>
    if (typeof value.docType === 'string') job.documentType = value.docType.slice(0, 100)
    if (typeof value.documentId === 'string') job.documentId = value.documentId
  }
  job.updatedAt = job.startedAt
  jobs.unshift(job)
  // Keep all running work, plus the latest 60 completed jobs.
  let completed = 0
  for (let i = 0; i < jobs.length; i++) {
    if (jobs[i].status !== 'working' && ++completed > 60) jobs.splice(i--, 1)
  }
  await context.run(job, async () => {
    try {
      await run({ send: (event) => {
        if (event && typeof event === 'object') {
          const value = event as Record<string, unknown>
          job.updatedAt = Date.now()
          if (value.type === 'error') { job.status = 'error'; job.detail = typeof value.error === 'string' ? value.error : 'Request failed' }
          else if (value.type === 'delta') {
            job.detail = 'Writing response'
            if (typeof value.text === 'string') job.characters = (job.characters ?? 0) + value.text.length
          } else if (value.type === 'tool') {
            job.tool = typeof value.name === 'string' ? value.name.slice(0, 200) : undefined
            job.toolCalls = (job.toolCalls ?? 0) + 1
            job.detail = job.tool ? `Using ${job.tool}` : 'Using tools'
          } else if (value.type === 'progress') {
            job.detail = 'Generating output'
            if (typeof value.chars === 'number' && Number.isFinite(value.chars)) job.characters = Math.max(job.characters ?? 0, value.chars)
          } else if (value.type === 'result' && value.data && typeof value.data === 'object' && 'added' in value.data && typeof value.data.added === 'number') job.added = value.data.added
          if (typeof value.documentId === 'string') job.documentId = value.documentId
        }
        out.send(event)
      } })
      if (job.status !== 'error') { job.status = 'done'; job.detail = 'Completed' }
    } catch (error) {
      job.status = 'error'
      job.detail = describeError(error)
      throw error
    } finally { job.finishedAt = Date.now(); job.updatedAt = job.finishedAt }
  })
}
