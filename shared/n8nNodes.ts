// Cekat n8n node catalog: pulls reusable node examples out of an exported n8n workflow and renders the
// catalog as knowledge for the AI.

export type N8nNodeKind = 'trigger' | 'action'

export interface N8nNodeSkillInput {
  name: string
  node_type: string
  kind: N8nNodeKind
  description: string
  example: Record<string, unknown>
}

/** Generic n8n nodes that say nothing about Cekat and are left out of an import. */
const SKIPPED_TYPES = new Set(['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.stickyNote', 'n8n-nodes-base.noOp'])
const MAX_EXAMPLE_CHARS = 2_000

export const isTriggerType = (type: string): boolean => /trigger$/i.test(type) || type === 'n8n-nodes-base.webhook'

/** A node without instance-specific data: ids, canvas position and credential ids are dropped (the credential type is kept). */
export function cleanNode(node: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, position: _position, webhookId: _webhookId, credentials, ...rest } = node
  if (!credentials || typeof credentials !== 'object') return rest
  const credentialTypes = Object.fromEntries(
    Object.entries(credentials as Record<string, { name?: string }>).map(([type, cred]) => [type, { name: cred?.name ?? type }]),
  )
  return { ...rest, credentials: credentialTypes }
}

/** Every node of an exported workflow (or a single node, or an array of nodes) as catalog entries. */
export function nodesFromWorkflow(json: unknown): N8nNodeSkillInput[] {
  const record = json && typeof json === 'object' ? (json as Record<string, unknown>) : null
  const nodes = Array.isArray(json) ? json : Array.isArray(record?.nodes) ? record.nodes : record?.type ? [record] : []
  const seen = new Set<string>()
  return nodes
    .filter((n): n is Record<string, unknown> => Boolean(n) && typeof n === 'object' && typeof (n as { type?: unknown }).type === 'string')
    .filter((n) => !SKIPPED_TYPES.has(n.type as string))
    .map((n) => {
      const type = n.type as string
      return {
        name: String(n.name ?? type).slice(0, 120),
        node_type: type.slice(0, 200),
        kind: isTriggerType(type) ? ('trigger' as const) : ('action' as const),
        description: '',
        example: cleanNode(n),
      }
    })
    .filter((n) => {
      const key = `${n.node_type}|${JSON.stringify((n.example as { parameters?: unknown }).parameters ?? {})}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/** The catalog as a knowledge block for the AI system prompt ('' when empty). */
export function renderN8nCatalog(nodes: Pick<N8nNodeSkillInput, 'name' | 'node_type' | 'kind' | 'description' | 'example'>[]): string {
  if (!nodes.length) return ''
  const blocks = nodes.map((n) => {
    const example = JSON.stringify(n.example)
    return [
      `## ${n.name} — ${n.node_type} (${n.kind})`,
      n.description.trim(),
      `Example node JSON: ${example.length > MAX_EXAMPLE_CHARS ? `${example.slice(0, MAX_EXAMPLE_CHARS)}…` : example}`,
    ]
      .filter(Boolean)
      .join('\n')
  })
  return [
    '# CEKAT N8N NODES (use these exact node types and parameter shapes when describing or building n8n workflows on workflows.cekat.ai)',
    ...blocks,
  ].join('\n\n')
}
