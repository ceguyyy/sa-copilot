// The POC's API tools as one SAPostman collection: each request is what Cekat sends when the agent calls the tool
// (shared/pocCurl.ts cekatToolCall), so the SA can test the webhook flow without chatting to the agent.
import { cekatToolCall, type CurlIntegration } from './pocCurl.ts'
import { endpointFromRequest, type SaEndpoint } from './saPostman.ts'

export type PocToolIntegration = CurlIntegration & { name: string; description?: string }

/** Every tool call should succeed; the SA adds more checks (or generates them) in SAPostman. */
const STATUS_OK = JSON.stringify([{ name: 'Status is 200', target: 'status', operator: 'equals', equals: 200 }], null, 2)

export function toolEndpoint(integration: PocToolIntegration): SaEndpoint {
  const call = cekatToolCall(integration)
  const docs = [
    integration.description?.trim() ?? '',
    'Request as Cekat sends it when the AI agent calls this tool: the AI inputs at the top level plus the conversation object (sample ids).',
    integration.webhookAddress.trim() ? '' : 'Set the webhook address in the POC (or the URL here) before sending.',
  ]
    .filter(Boolean)
    .join('\n\n')
  return { ...endpointFromRequest(call), name: integration.name.trim(), docs, scripts: { pre: '', post: STATUS_OK } }
}

/** The collection to import: named tools only. */
export function pocToolsCollection(clientName: string, integrations: PocToolIntegration[]): { name: string; endpoints: SaEndpoint[] } {
  return {
    name: `POC tools · ${clientName.trim() || 'Untitled'}`.slice(0, 200),
    endpoints: integrations.filter((i) => i.name.trim()).map(toolEndpoint),
  }
}
