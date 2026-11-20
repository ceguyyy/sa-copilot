// The Automation flow behind an API tool: Catch Webhook → (log in) → call the client API with the HTTP piece →
// Return Response. The tool posts the AI inputs at the top level of the body (plus a `conversation` object), and its
// webhook address is the flow's /sync URL, so the agent gets the client API's reply. Built through Cekat MCP.
import type { CekatCall } from './pocPush.ts'

export const AUTOMATION_WEBHOOK = (flowId: string) => `https://automation.cekat.ai/api/v1/webhooks/${flowId}/sync`

export interface FlowTool {
  name: string
  /** The AI input names, as the tool sends them. */
  inputs: string[]
  targetMethod: string
  targetUrl: string
  authUrl: string
}

export interface FlowResult { url: string; problems: string[] }
export type FlowMaker = (tool: FlowTool) => Promise<FlowResult>

const inputRef = (name: string) => `{{trigger['output'].body.${name}}}`

/** The build_flow arguments. The login step, when there is one, is step_1 and needs the SA's body. */
export function webhookFlowArgs(tool: FlowTool, connection: string): Record<string, unknown> {
  const hasLogin = !!tool.authUrl
  const values = Object.fromEntries(tool.inputs.map((name) => [name, inputRef(name)]))
  const isGet = tool.targetMethod === 'GET'
  // The HTTP piece needs a connection but sends none of its credentials with authType NONE.
  const http = (displayName: string, input: Record<string, unknown>) => ({ type: 'PIECE', displayName, pieceName: 'http', actionName: 'send_request', auth: connection, input })
  const steps: Record<string, unknown>[] = []
  if (hasLogin) {
    steps.push(http('Log in to the client API (fill in the body)', { method: 'POST', url: tool.authUrl, headers: {}, queryParams: {}, authType: 'NONE', body_type: 'json', body: { data: {} }, failureMode: 'continue_none' }))
  }
  const callStep = hasLogin ? 'step_2' : 'step_1'
  steps.push(
    http(`Call ${tool.name}`, {
      method: tool.targetMethod,
      url: tool.targetUrl,
      headers: hasLogin ? { Authorization: "Bearer {{step_1['output'].body.token}}" } : {},
      queryParams: isGet ? values : {},
      authType: 'NONE',
      body_type: isGet ? 'none' : 'json',
      ...(isGet ? {} : { body: { data: values } }),
      failureMode: 'continue_all',
    }),
    { type: 'PIECE', displayName: 'Reply to the AI agent', pieceName: 'webhook', actionName: 'return_response', input: { responseType: 'json', fields: { status: 200, headers: {}, body: `{{${callStep}['output'].body}}` }, respond: 'stop' } },
  )
  return { flowName: tool.name, trigger: { pieceName: 'webhook', triggerName: 'catch_webhook', input: { authType: 'none' } }, steps }
}

const parse = (text: string): Record<string, unknown> => {
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** The first active connection in a list_connections reply (any piece will do, see webhookFlowArgs). */
export function firstConnection(text: string): string | null {
  const list = parse(text).connections
  const active = (Array.isArray(list) ? list : []).find((c) => c && typeof c === 'object' && (!c.status || c.status === 'ACTIVE'))
  return active ? String(active.externalId ?? active.id ?? '') || null : null
}

const NO_CONNECTION = 'Cekat Automation has no active connection: add one (for example HTTP or Google Drive) in Automations › Connections, then build again.'

/** A FlowMaker over Cekat MCP. Flows with a login step stay drafts until the SA fills the login in. */
export async function webhookFlowMaker(call: CekatCall): Promise<FlowMaker> {
  const connection =
    firstConnection(await call('automation_ckt_list_connections', { pieceName: 'http', status: ['ACTIVE'] })) ??
    firstConnection(await call('automation_ckt_list_connections', { status: ['ACTIVE'] }))
  const existing = new Set(
    ((parse(await call('automation_ckt_list_flows', { limit: 500 })).flows as { displayName?: string }[] | undefined) ?? []).map((f) => String(f.displayName ?? '').toLowerCase()),
  )
  return async (tool) => {
    if (!connection) throw new Error(NO_CONNECTION)
    if (existing.has(tool.name.toLowerCase())) throw new Error(`a flow named "${tool.name}" already exists in Cekat Automation`)
    const built = parse(await call('automation_ckt_build_flow', webhookFlowArgs(tool, connection)))
    const flowId = String(built.flowId ?? '')
    if (!flowId) throw new Error('Cekat Automation did not create the flow')
    existing.add(tool.name.toLowerCase())
    const problems: string[] = []
    const invalid = Array.isArray(built.invalidSteps) ? built.invalidSteps : []
    if (invalid.length) problems.push(`Flow "${tool.name}" has steps to fix in Cekat Automation: ${JSON.stringify(invalid).slice(0, 300)}`)
    if (tool.authUrl) {
      problems.push(`Flow "${tool.name}" is a draft: fill in the login body (step 1), check that the token is at body.token, then publish it.`)
    } else if (!invalid.length) {
      const published = await call('automation_ckt_lock_and_publish', { flowId })
      if (!/published/i.test(published)) problems.push(`Flow "${tool.name}" was not published: ${published.slice(0, 200)}`)
    }
    return { url: AUTOMATION_WEBHOOK(flowId), problems }
  }
}
