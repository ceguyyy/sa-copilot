import { Hono } from 'hono'
import { z } from 'zod'
import { HttpError, parseJson } from '../http.ts'
import { cloudStatus, pullCloud, pushCloud } from './cloud.ts'
import { startUpgrade, updateStatus } from './updates.ts'

export const maintenance = new Hono()
maintenance.use('*', async (c, next) => {
  const origin = c.req.header('origin')
  if (c.req.header('sec-fetch-site') === 'cross-site' || (origin && new URL(origin).host !== c.req.header('host'))) {
    throw new HttpError(403, 'Maintenance requests must come from SA Copilot')
  }
  await next()
})
maintenance.get('/updates', async (c) => c.json(await updateStatus()))
maintenance.post('/updates/check', async (c) => c.json(await updateStatus(true)))
maintenance.post('/updates/upgrade', async (c) => {
  const { commit } = await parseJson(c, z.object({ commit: z.string().regex(/^[a-f0-9]{40}$/) }))
  return c.json(await startUpgrade(commit), 202)
})
maintenance.get('/cloud', async (c) => c.json(await cloudStatus()))
maintenance.post('/cloud/push', async (c) => c.json(await pushCloud()))
maintenance.post('/cloud/pull', async (c) => {
  const { revision } = await parseJson(c, z.object({ revision: z.number().int().positive(), confirm: z.literal('RESTORE') }))
  return c.json(await pullCloud(revision))
})
