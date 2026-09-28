// MCP servers whose tools the AI can call: remote ones from Settings (Streamable HTTP, e.g. Cekat's documentation
// search) plus built-in local ones configured in .env (stdio, e.g. the Outline wiki).
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { StdioClientTransport, getDefaultEnvironment, type StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js'
import { config } from '../config.ts'
import { outlineStdio } from './outlineCommand.ts'
import { query, queryOne } from '../db.ts'
import type { ToolDef } from './llm/types.ts'

export interface McpServer {
  id: string
  name: string
  url: string
  enabled: boolean
  created_at: string
}

/** A server the app can connect to: a Settings row, or a built-in stdio server from .env. */
interface ServerEntry extends McpServer {
  stdio?: StdioServerParameters
  /** Only these tools are given to the AI (for servers that don't annotate which tools have side effects). */
  allowTools?: ReadonlySet<string>
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

const OUTLINE_READ_TOOLS = new Set(['search_documents', 'get_document', 'list_documents', 'list_collections', 'get_collection', 'ask_documents'])

/** Built-in servers enabled from .env. Outline runs locally via npx and is limited to reading the wiki. */
export function builtinServers(): ServerEntry[] {
  if (!config.outline.apiKey) return []
  return [
    {
      id: 'builtin-outline',
      name: 'Outline Wiki',
      url: config.outline.apiUrl,
      enabled: true,
      created_at: '',
      stdio: (() => {
        const run = outlineStdio(config.outline.mcpEntry, process.execPath)
        return {
          command: run.command,
          args: run.args,
          env: { ...getDefaultEnvironment(), ...run.env, OUTLINE_API_KEY: config.outline.apiKey, OUTLINE_API_URL: config.outline.apiUrl },
          stderr: 'ignore' as const,
        }
      })(),
      allowTools: OUTLINE_READ_TOOLS,
    },
  ]
}

async function findServer(id: string): Promise<ServerEntry | null> {
  return builtinServers().find((s) => s.id === id) ?? (await queryOne<McpServer>('select * from mcp_servers where id = $1', [id]))
}

function connect(server: ServerEntry): Promise<Client> {
  let pending = clients.get(server.id)
  if (!pending) {
    pending = (async () => {
      const client = new Client({ name: 'sa-copilot', version: '1.0.0' })
      await client.connect(server.stdio ? new StdioClientTransport(server.stdio) : new StreamableHTTPClientTransport(new URL(server.url)))
      return client
    })()
    pending.catch(() => clients.delete(server.id)) // retry on the next request instead of caching the failure
    clients.set(server.id, pending)
  }
  return pending
}

async function loadServerTools(server: ServerEntry): Promise<McpTool[]> {
  const client = await connect(server)
  const { tools } = await client.listTools()
  // The AI acts on its own, so it only gets tools that don't declare side effects
  // (e.g. Cekat docs' `sendFeedback` posts to GitBook and is left out), or the allowlist when a server has one.
  const allowed = (t: { name: string; annotations?: { readOnlyHint?: boolean } }) =>
    server.allowTools ? server.allowTools.has(t.name) : t.annotations?.readOnlyHint !== false
  return tools.filter(allowed).map((t) => ({
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
  const servers: ServerEntry[] = [...(await query<McpServer>('select * from mcp_servers where enabled order by created_at')), ...builtinServers()]
  const results = await Promise.allSettled(servers.map(loadServerTools))
  const tools = results.flatMap((r, i) => {
    if (r.status === 'fulfilled') return r.value
    console.error(`MCP server "${servers[i].name}" unavailable:`, r.reason instanceof Error ? r.reason.message : r.reason)
    clients.delete(servers[i].id)
    return []
  })
  toolCache = { at: Date.now(), tools }
  return tools
}

export async function callMcpTool(name: string, input: unknown): Promise<string> {
  const tool = (await mcpTools()).find((t) => t.name === name)
  if (!tool) return `Unknown tool "${name}"`
  const server = await findServer(tool.serverId)
  if (!server) return `Tool server for "${name}" was removed`
  try {
    const client = await connect(server)
    const result = await client.callTool({ name: tool.remoteName, arguments: (input ?? {}) as Record<string, unknown> })
    const content = Array.isArray(result.content) ? result.content : []
    const text = content
      .map((c: { type: string; text?: string }) => (c.type === 'text' ? c.text : `[${c.type} content omitted]`))
      .join('\n')
    const body = text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n…(truncated)` : text
    return result.isError ? `Tool error: ${body}` : body || '(empty result)'
  } catch (e) {
    clients.delete(server.id)
    return `Tool call failed: ${e instanceof Error ? e.message : String(e)}`
  }
}

/** Tool definitions without the internal routing fields, ready to hand to a model. */
export async function mcpToolDefs(): Promise<ToolDef[]> {
  return (await mcpTools()).map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
}

/**
 * Connects to a candidate server and lists its tools, for the AI helper to verify a URL before suggesting it.
 * HTTPS only, so the helper cannot be steered into probing services on this machine or the local network.
 */
export async function probeMcpServer(url: unknown): Promise<string> {
  if (typeof url !== 'string' || !URL.canParse(url) || new URL(url).protocol !== 'https:') return 'Only https:// URLs can be checked.'
  const client = new Client({ name: 'sa-copilot-probe', version: '1.0.0' })
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url)))
    const { tools } = await client.listTools()
    if (!tools.length) return 'Connected, but the server exposes no tools.'
    return `Connected. ${tools.length} tools:\n${tools
      .map((t) => `- ${t.name}${t.annotations?.readOnlyHint === false ? ' (has side effects — the app will NOT use it)' : ''}: ${(t.description ?? '').slice(0, 160)}`)
      .join('\n')}`
  } catch (e) {
    return `Could not connect: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    await client.close().catch(() => {})
  }
}
