// The POC's API integrations as Cekat Automation flows, one per tool: AI Tool (Invoke) for the agent → (log in) →
// call the client API with the HTTP piece → AI Tool (Response). Built through Cekat MCP and left as drafts: the SA
// checks the login step and the client credentials, then publishes each flow in Cekat.
import type { CekatCall } from './pocPush.ts'

type Log = (text: string) => void

export interface ToolConfigLike {
  apiIntegrations?: { name?: unknown; description?: unknown; aiInput?: unknown; targetMethod?: unknown; targetUrl?: unknown; authUrl?: unknown }[]
}

export interface AiInput { name: string; description: string; type: 'string' | 'number' | 'boolean'; required: boolean; enum?: { value: string }[] }
export interface PlannedTool { name: string; description: string; inputs: AiInput[]; method: string; url: string; authUrl: string }
export interface ToolsPlan { tools: PlannedTool[]; problems: string[] }
export interface ToolsResult { flows: { name: string; url: string }[]; problems: string[] }

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const NAME_RE = /^[a-z][a-z0-9_]{0,63}$/
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** The AI inputs of a tool from its JSON Schema (top-level properties only, as Cekat takes them). */
export function aiInputsOf(schema: unknown): AiInput[] {
  const s = schema && typeof schema === 'object' ? (schema as { properties?: unknown; required?: unknown }) : {}
  const props = s.properties && typeof s.properties === 'object' ? (s.properties as Record<string, Record<string, unknown>>) : {}
  const required = new Set(Array.isArray(s.required) ? s.required.map(String) : [])
  return Object.entries(props).map(([name, p]) => {
    const t = str(p?.type)
    const type = t === 'number' || t === 'integer' ? 'number' : t === 'boolean' ? 'boolean' : 'string'
    const values = Array.isArray(p?.enum) ? p.enum.map((v) => String(v)).filter(Boolean) : []
    return { name, description: str(p?.description), type, required: required.has(name), ...(values.length ? { enum: values.map((value) => ({ value })) } : {}) }
  })
}

export function planTools(config: ToolConfigLike): ToolsPlan {
  const tools: PlannedTool[] = []
  const problems: string[] = []
  for (const a of config.apiIntegrations ?? []) {
    const name = str(a.name)
    if (!name) continue
    if (!NAME_RE.test(name)) {
      problems.push(`API "${name}" is skipped: tool names must use lowercase letters, digits and _.`)
      continue
    }
    const url = str(a.targetUrl)
    if (!/^https?:\/\//i.test(url)) {
      problems.push(`API "${name}" is skipped: set its client endpoint (target URL) first.`)
      continue
    }
    const method = str(a.targetMethod).toUpperCase()
    tools.push({ name, description: str(a.description), inputs: aiInputsOf(a.aiInput), method: METHODS.has(method) ? method : 'GET', url, authUrl: str(a.authUrl) })
  }
  return { tools, problems }
}

const inputRef = (name: string) => `{{trigger['output'].body.inputs.${name}}}`

/** The build_flow arguments for one tool. The login step, when there is one, is step_1 and needs the SA's body. */
export function flowArgs(tool: PlannedTool, agentId: string, connection: string): Record<string, unknown> {
  const hasLogin = !!tool.authUrl
  const values = Object.fromEntries(tool.inputs.map((i) => [i.name, inputRef(i.name)]))
  const isGet = tool.method === 'GET'
  const http = (displayName: string, input: Record<string, unknown>) => ({ type: 'PIECE', displayName, pieceName: 'http', actionName: 'send_request', auth: connection, input })
  const steps: Record<string, unknown>[] = []
  if (hasLogin) {
    steps.push(http('Log in to the client API (fill in the body)', { method: 'POST', url: tool.authUrl, headers: {}, queryParams: {}, authType: 'NONE', body_type: 'json', body: { data: {} }, failureMode: 'continue_none' }))
  }
  const callStep = hasLogin ? 'step_2' : 'step_1'
  steps.push(
    http(`Call ${tool.name}`, {
      method: tool.method,
      url: tool.url,
      headers: hasLogin ? { Authorization: "Bearer {{step_1['output'].body.token}}" } : {},
      queryParams: isGet ? values : {},
      authType: 'NONE',
      body_type: isGet ? 'none' : 'json',
      ...(isGet ? {} : { body: { data: values } }),
      failureMode: 'continue_all',
    }),
    { type: 'PIECE', displayName: 'Reply to the AI agent', pieceName: 'cekat', actionName: 'ai_tool_response', input: { responseType: 'json', fields: { status: 200, body: `{{${callStep}['output'].body}}` }, respond: 'stop' } },
  )
  return {
    flowName: tool.name,
    trigger: {
      pieceName: 'cekat',
      triggerName: 'ai_tool_invoked',
      input: { agentIds: [agentId], toolName: tool.name, toolDescription: tool.description, aiInputs: tool.inputs, responseCode: 200 },
    },
    steps,
  }
}

const parse = (text: string): Record<string, unknown> => {
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * The first active connection in a list_connections reply. The HTTP piece needs one, but with authType NONE it sends
 * none of its credentials (checked: a step using the Google Drive connection sends no Authorization header), so any
 * active connection of the project will do when there is no HTTP connection.
 */
export function httpConnection(text: string): string | null {
  const list = parse(text).connections
  const active = (Array.isArray(list) ? list : []).find((c) => c && typeof c === 'object' && (!c.status || c.status === 'ACTIVE'))
  return active ? String(active.externalId ?? active.id ?? '') || null : null
}

const NO_CONNECTION = 'API tools were not built: Cekat Automation has no active connection. Add one (for example HTTP or Google Drive) in Automations › Connections, then build again.'

async function connectionFor(call: CekatCall): Promise<string | null> {
  const http = httpConnection(await call('automation_ckt_list_connections', { pieceName: 'http', status: ['ACTIVE'] }))
  return http ?? httpConnection(await call('automation_ckt_list_connections', { status: ['ACTIVE'] }))
}

export async function runToolsBuild(call: CekatCall, agentId: string, config: ToolConfigLike, log: Log): Promise<ToolsResult> {
  const plan = planTools(config)
  const problems = [...plan.problems]
  const flows: ToolsResult['flows'] = []
  if (!plan.tools.length) return { flows, problems }

  const connection = await connectionFor(call)
  if (!connection) return { flows, problems: [...problems, NO_CONNECTION] }

  const existing = new Set(
    ((parse(await call('automation_ckt_list_flows', { limit: 500 })).flows as { displayName?: string }[] | undefined) ?? []).map((f) => String(f.displayName ?? '').toLowerCase()),
  )
  for (const tool of plan.tools) {
    if (existing.has(tool.name.toLowerCase())) {
      problems.push(`Flow "${tool.name}" already exists in Cekat Automation; it was left as it is.`)
      continue
    }
    log(`Building API tool "${tool.name}" in Cekat Automation…`)
    const built = parse(await call('automation_ckt_build_flow', flowArgs(tool, agentId, connection)))
    const url = String(built.flowUrl ?? '')
    flows.push({ name: tool.name, url })
    const invalid = Array.isArray(built.invalidSteps) ? built.invalidSteps : []
    if (invalid.length) problems.push(`Flow "${tool.name}" has steps to fix in Cekat: ${JSON.stringify(invalid).slice(0, 300)}`)
    if (tool.authUrl) problems.push(`Flow "${tool.name}": fill in the login body (step 1) and check that the token is at body.token.`)
  }
  if (flows.length) problems.push('The API tool flows are drafts: review each one and publish it in Cekat Automation so the agent can use it.')
  return { flows, problems }
}
