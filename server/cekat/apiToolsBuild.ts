// The POC's API integrations as Cekat API Tools (Devtools › API Tools), each activated on the new AI agent
// (Integrations › AI Tools). With a client endpoint (target URL) the tool's webhook is an Automation flow built for it
// (webhookFlow.ts); otherwise the POC's own webhook address (e.g. an n8n workflow) is used as it is.
import type { ApiToolSpec, ApiToolsUi } from './apiToolsUi.ts'
import type { FlowMaker, FlowTool } from './webhookFlow.ts'

type Log = (text: string) => void

export interface ApiToolConfigLike {
  apiIntegrations?: {
    name?: unknown
    description?: unknown
    httpMethod?: unknown
    webhookAddress?: unknown
    apiKey?: unknown
    aiInput?: unknown
    targetMethod?: unknown
    targetUrl?: unknown
    authUrl?: unknown
  }[]
}

/** A tool to create; `flow` is set when its webhook is an Automation flow still to build. */
export interface PlannedApiTool { spec: ApiToolSpec; flow: FlowTool | null }
export interface ApiToolsPlan { tools: PlannedApiTool[]; problems: string[] }
export interface ApiToolsResult { created: string[]; activated: string[]; flows: string[]; problems: string[] }

const NAME_RE = /^[a-z][a-z0-9_]{0,63}$/
const URL_RE = /^https?:\/\//i
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** The AI Inputs as Cekat takes them: a JSON Schema object, even when the POC has none. */
export function schemaOf(aiInput: unknown): Record<string, unknown> {
  const s = aiInput && typeof aiInput === 'object' && !Array.isArray(aiInput) ? (aiInput as Record<string, unknown>) : {}
  const properties = s.properties && typeof s.properties === 'object' ? s.properties : {}
  return { ...s, type: 'object', properties }
}

type Integration = NonNullable<ApiToolConfigLike['apiIntegrations']>[number]

function planOne(a: Integration, name: string, problems: string[]): PlannedApiTool | null {
  const schema = schemaOf(a.aiInput)
  const base = { name, description: str(a.description), apiKey: str(a.apiKey), schema }
  const targetUrl = str(a.targetUrl)
  if (URL_RE.test(targetUrl)) {
    const targetMethod = str(a.targetMethod).toUpperCase()
    const flow = { name, inputs: Object.keys(schema.properties as object), targetMethod: METHODS.has(targetMethod) ? targetMethod : 'GET', targetUrl, authUrl: str(a.authUrl) }
    // The flow's webhook takes the inputs as a JSON body.
    return { spec: { ...base, method: 'POST', webhookAddress: '' }, flow }
  }
  const webhookAddress = str(a.webhookAddress)
  if (!URL_RE.test(webhookAddress)) {
    problems.push(`API "${name}" is skipped: set its client endpoint (target URL) or its webhook address first.`)
    return null
  }
  const httpMethod = str(a.httpMethod).toUpperCase()
  if (!['', 'GET', 'POST'].includes(httpMethod)) problems.push(`API "${name}": Cekat tools only call GET or POST, so it is created as POST.`)
  return { spec: { ...base, method: httpMethod === 'GET' ? 'GET' : 'POST', webhookAddress }, flow: null }
}

export function planApiTools(config: ApiToolConfigLike): ApiToolsPlan {
  const tools: PlannedApiTool[] = []
  const problems: string[] = []
  for (const a of config.apiIntegrations ?? []) {
    const name = str(a.name)
    if (!name) continue
    if (!NAME_RE.test(name)) {
      problems.push(`API "${name}" is skipped: tool names must use lowercase letters, digits and _.`)
      continue
    }
    const tool = planOne(a, name, problems)
    if (tool) tools.push(tool)
  }
  return { tools, problems }
}

/** `flows` is null when Cekat MCP is not connected; tools that need a flow are then skipped. */
export async function runApiToolsBuild(ui: ApiToolsUi, agentId: string, config: ApiToolConfigLike, log: Log, flows: FlowMaker | null): Promise<ApiToolsResult> {
  const plan = planApiTools(config)
  const result: ApiToolsResult = { created: [], activated: [], flows: [], problems: [...plan.problems] }
  if (!plan.tools.length) return result

  const existing = await ui.names()
  for (const { spec, flow } of plan.tools) {
    // Names are not unique in Cekat; a tool with this name may belong to another use case, so it is left alone.
    if (existing.has(spec.name)) {
      result.problems.push(`API tool "${spec.name}" already exists in Devtools › API Tools; it was not created or activated. Rename it in the POC, or activate the existing one by hand.`)
      continue
    }
    let webhookAddress = spec.webhookAddress
    if (flow) {
      if (!flows) {
        result.problems.push(`API tool "${spec.name}" is skipped: its Automation flow needs Cekat MCP (Settings › AI tools (MCP) › Add Cekat MCP, then log in).`)
        continue
      }
      log(`Building the Automation flow for "${spec.name}"…`)
      try {
        const made = await flows(flow)
        webhookAddress = made.url
        result.flows.push(spec.name)
        result.problems.push(...made.problems)
      } catch (e) {
        result.problems.push(`API tool "${spec.name}" is skipped: ${e instanceof Error ? e.message : String(e)}.`)
        continue
      }
    }
    log(`Creating API tool "${spec.name}"…`)
    await ui.create({ ...spec, webhookAddress })
    result.created.push(spec.name)
    log(`Activating "${spec.name}" on the agent…`)
    await ui.activate(agentId, spec.name)
    if (await ui.isActive(agentId, spec.name)) result.activated.push(spec.name)
    else result.problems.push(`API tool "${spec.name}" was created but is not active on the agent: activate it in Integrations › AI Tools.`)
  }
  return result
}
