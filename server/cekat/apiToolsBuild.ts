// The POC's API integrations as Cekat API Tools (Devtools › API Tools), each activated on the new AI agent
// (Integrations › AI Tools). The webhook address is what the tool calls, e.g. the n8n workflow in front of the client
// API; the agent sends the AI inputs to it.
import type { ApiToolSpec, ApiToolsUi } from './apiToolsUi.ts'

type Log = (text: string) => void

export interface ApiToolConfigLike {
  apiIntegrations?: { name?: unknown; description?: unknown; httpMethod?: unknown; webhookAddress?: unknown; apiKey?: unknown; aiInput?: unknown }[]
}

export interface ApiToolsPlan { tools: ApiToolSpec[]; problems: string[] }
export interface ApiToolsResult { created: string[]; activated: string[]; problems: string[] }

const NAME_RE = /^[a-z][a-z0-9_]{0,63}$/
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** The AI Inputs as Cekat takes them: a JSON Schema object, even when the POC has none. */
export function schemaOf(aiInput: unknown): Record<string, unknown> {
  const s = aiInput && typeof aiInput === 'object' && !Array.isArray(aiInput) ? (aiInput as Record<string, unknown>) : {}
  const properties = s.properties && typeof s.properties === 'object' ? s.properties : {}
  return { ...s, type: 'object', properties }
}

export function planApiTools(config: ApiToolConfigLike): ApiToolsPlan {
  const tools: ApiToolSpec[] = []
  const problems: string[] = []
  for (const a of config.apiIntegrations ?? []) {
    const name = str(a.name)
    if (!name) continue
    if (!NAME_RE.test(name)) {
      problems.push(`API "${name}" is skipped: tool names must use lowercase letters, digits and _.`)
      continue
    }
    const webhookAddress = str(a.webhookAddress)
    if (!/^https?:\/\//i.test(webhookAddress)) {
      problems.push(`API "${name}" is skipped: set its webhook address first.`)
      continue
    }
    const method = str(a.httpMethod).toUpperCase() === 'GET' ? 'GET' : 'POST'
    if (!['', 'GET', 'POST'].includes(str(a.httpMethod).toUpperCase())) problems.push(`API "${name}": Cekat tools only call GET or POST, so it is created as POST.`)
    tools.push({ name, description: str(a.description), method, webhookAddress, apiKey: str(a.apiKey), schema: schemaOf(a.aiInput) })
  }
  return { tools, problems }
}

export async function runApiToolsBuild(ui: ApiToolsUi, agentId: string, config: ApiToolConfigLike, log: Log): Promise<ApiToolsResult> {
  const plan = planApiTools(config)
  const problems = [...plan.problems]
  const created: string[] = []
  const activated: string[] = []
  if (!plan.tools.length) return { created, activated, problems }

  const existing = await ui.names()
  for (const tool of plan.tools) {
    // Names are not unique in Cekat; a tool with this name may belong to another use case, so it is left alone.
    if (existing.has(tool.name)) {
      problems.push(`API tool "${tool.name}" already exists in Devtools › API Tools; it was not created or activated. Rename it in the POC, or activate the existing one by hand.`)
      continue
    }
    log(`Creating API tool "${tool.name}"…`)
    await ui.create(tool)
    created.push(tool.name)
    log(`Activating "${tool.name}" on the agent…`)
    await ui.activate(agentId, tool.name)
    if (await ui.isActive(agentId, tool.name)) activated.push(tool.name)
    else problems.push(`API tool "${tool.name}" was created but is not active on the agent: activate it in Integrations › AI Tools.`)
  }
  return { created, activated, problems }
}
