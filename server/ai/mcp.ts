// Remote MCP servers (Streamable HTTP) whose tools the AI can call, e.g. Cekat's documentation search.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { query, queryOne } from '../db.ts'
import type { ToolDef } from './llm/types.ts'

export interface McpServer {
  id: string
  name: string
  url: string
  enabled: boolean
  created_at: string
}

interface McpTool extends ToolDef {
  serverId: string
  remoteName: string
}

export const DEFAULT_SERVERS = [{ name: 'Cekat Docs', url: 'https://docs.cekat.ai/~gitbook/mcp' }]

const TOOLS_TTL_MS = 5 * 60_000
const MAX_RESULT_CHARS = 30_000
const clients = new Map<string, Promise<Client>>()
let toolCache: { at: number; tools: McpTool[] } | null = null

export function invalidateMcpCache(): void {
  toolCache = null
}

/** Tool names must match ^[a-zA-Z0-9_-]{1,64}$ for both wire formats; prefix with the server so names never collide. */
export function toolName(serverName: string, remote: string): string {
  const slug = serverName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20) || 'mcp'
  return `${slug}__${remote.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 64)
}

export async function seedDefaultServers(): Promise<void> {
  const seeded = await queryOne(`select 1 from app_settings where key = 'mcp_seeded'`)
  if (seeded) return
  for (const s of DEFAULT_SERVERS) await query('insert into mcp_servers (name, url) values ($1, $2)', [s.name, s.url])
  await query(`insert into app_settings (key, value) values ('mcp_seeded', 'true') on conflict (key) do nothing`)
}

function connect(url: string): Promise<Client> {
  let pending = clients.get(url)
  if (!pending) {
    pending = (async () => {
      const client = new Client({ name: 'sa-copilot', version: '1.0.0' })
      await client.connect(new StreamableHTTPClientTransport(new URL(url)))
      return client
    })()
    pending.catch(() => clients.delete(url)) // retry on the next request instead of caching the failure
    clients.set(url, pending)
  }
  return pending
}

async function loadServerTools(server: McpServer): Promise<McpTool[]> {
  const client = await connect(server.url)
  const { tools } = await client.listTools()
  // The AI acts on its own, so it only gets tools that don't declare side effects
  // (e.g. Cekat docs' `sendFeedback` posts to GitBook and is left out).
  return tools.filter((t) => t.annotations?.readOnlyHint !== false).map((t) => ({
    name: toolName(server.name, t.name),
    description: `[${server.name}] ${t.description ?? t.name}`.slice(0, 1000),
    inputSchema: t.inputSchema as Record<string, unknown>,
    serverId: server.id,
    remoteName: t.name,
  }))
}

/** Tools from every enabled server. A server that is down is skipped (logged), never blocks the AI. */
export async function mcpTools(): Promise<McpTool[]> {
  if (toolCache && Date.now() - toolCache.at < TOOLS_TTL_MS) return toolCache.tools
  const servers = await query<McpServer>('select * from mcp_servers where enabled order by created_at')
  const results = await Promise.allSettled(servers.map(loadServerTools))
  const tools = results.flatMap((r, i) => {
    if (r.status === 'fulfilled') return r.value
    console.error(`MCP server "${servers[i].name}" unavailable:`, r.reason instanceof Error ? r.reason.message : r.reason)
    clients.delete(servers[i].url)
    return []
  })
  toolCache = { at: Date.now(), tools }
  return tools
}

export async function callMcpTool(name: string, input: unknown): Promise<string> {
  const tool = (await mcpTools()).find((t) => t.name === name)
  if (!tool) return `Unknown tool "${name}"`
  const server = await queryOne<McpServer>('select * from mcp_servers where id = $1', [tool.serverId])
  if (!server) return `Tool server for "${name}" was removed`
  try {
    const client = await connect(server.url)
    const result = await client.callTool({ name: tool.remoteName, arguments: (input ?? {}) as Record<string, unknown> })
    const content = Array.isArray(result.content) ? result.content : []
    const text = content
      .map((c: { type: string; text?: string }) => (c.type === 'text' ? c.text : `[${c.type} content omitted]`))
      .join('\n')
    const body = text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n…(truncated)` : text
    return result.isError ? `Tool error: ${body}` : body || '(empty result)'
  } catch (e) {
    clients.delete(server.url)
    return `Tool call failed: ${e instanceof Error ? e.message : String(e)}`
  }
}

/** Tool definitions without the internal routing fields, ready to hand to a model. */
export async function mcpToolDefs(): Promise<ToolDef[]> {
  return (await mcpTools()).map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
}
