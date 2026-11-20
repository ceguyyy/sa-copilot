// SAPostman mocks: a saved request's example response, served
//  - locally at /api/sapostman/mock/<request id> (any method; public so n8n or a local app can call it without a
//    session, and only on this machine since the server listens on 127.0.0.1), and
//  - in Cekat as a published Automation flow (Catch Webhook → Return Response), whose https URL Cekat agents and the
//    POC builder can call while the client API is not ready.
import { Hono } from 'hono'
import { query } from '../db.ts'
import { HttpError, idParam } from '../http.ts'
import { AUTOMATION_WEBHOOK } from '../cekat/webhookFlow.ts'
import { mockSchema } from '../saPostmanExecution.ts'
import type { SaEndpoint, SaMock } from '../../shared/saPostman.ts'
import { cekatCall } from './cekatPush.ts'

export const MOCK_PATH = '/api/sapostman/mock/'

async function mockOf(id: string): Promise<{ name: string; mock: SaMock }> {
  const rows = await query<{ name: string; config: SaEndpoint }>('select name, config from sa_requests where id = $1 and deleted_at is null', [id])
  const parsed = mockSchema.safeParse(rows[0]?.config.mock)
  if (!rows[0] || !parsed.success) throw new HttpError(404, 'No mock for this request. Open it in SAPostman, use a response as mock and save the request.')
  return { name: rows[0].name, mock: parsed.data }
}

/** Public: registered before the login check. */
export const saMockPublic = new Hono()

saMockPublic.all('/sapostman/mock/:id', async (c) => {
  const { mock } = await mockOf(idParam(c))
  return c.body(mock.body, mock.status as 200, { 'content-type': mock.contentType || 'application/json', 'x-sa-copilot-mock': 'true' })
})

const parseBody = (mock: SaMock): unknown => {
  try {
    return JSON.parse(mock.body)
  } catch {
    return null
  }
}

/** The build_flow arguments of a Cekat mock: answer every call with the saved response. */
export function mockFlowArgs(name: string, mock: SaMock): Record<string, unknown> {
  const json = /json/i.test(mock.contentType) ? parseBody(mock) : null
  const fields = json !== null ? { status: mock.status, headers: {}, body: json } : { status: mock.status, headers: { 'content-type': mock.contentType || 'text/plain' }, body: mock.body }
  return {
    flowName: `[SA Copilot mock] ${name}`.slice(0, 200),
    trigger: { pieceName: 'webhook', triggerName: 'catch_webhook', input: { authType: 'none' } },
    steps: [{ type: 'PIECE', displayName: 'Mock response', pieceName: 'webhook', actionName: 'return_response', input: { responseType: json !== null ? 'json' : 'raw', fields, respond: 'stop' } }],
  }
}

export const saMock = new Hono()

/** Publishes the saved mock as a Cekat Automation flow and returns its https URL. Needs Cekat MCP. */
saMock.post('/sapostman/requests/:id/mock/publish', async (c) => {
  const { name, mock } = await mockOf(idParam(c))
  const call = await cekatCall()
  let built: { flowId?: string; invalidSteps?: unknown[] } = {}
  try {
    built = JSON.parse(await call('automation_ckt_build_flow', mockFlowArgs(name, mock)))
  } catch (e) {
    throw new HttpError(502, `Cekat: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!built.flowId) throw new HttpError(502, 'Cekat Automation did not create the mock flow.')
  if (built.invalidSteps?.length) throw new HttpError(502, `Cekat could not use this mock: ${JSON.stringify(built.invalidSteps).slice(0, 300)}`)
  const published = await call('automation_ckt_lock_and_publish', { flowId: built.flowId })
  if (!/published/i.test(published)) throw new HttpError(502, `The mock flow was created but not published: ${published.slice(0, 200)}`)
  return c.json({ url: AUTOMATION_WEBHOOK(built.flowId), flowId: built.flowId })
})
