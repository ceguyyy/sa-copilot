// Cekat AI Agent API integrations never call the client's API directly: Cekat calls an n8n webhook on the
// Cekat workflow server, and that n8n workflow authenticates to and calls the client's API (SaaS, Doctor Assist…).

export const CEKAT_WEBHOOK_BASE = 'https://workflows.cekat.ai/webhook/'

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

/** n8n webhook path for one API integration, prefixed by the client so paths don't collide on the shared server. */
export function cekatWebhookPath(clientName: string, apiName: string): string {
  return `${slug(clientName) || 'poc'}-${apiName.trim() || 'api'}`
}

export const cekatWebhookUrl = (clientName: string, apiName: string): string => CEKAT_WEBHOOK_BASE + cekatWebhookPath(clientName, apiName)

/** The n8n webhook path of a Cekat webhook URL, or null when the URL points elsewhere. */
export function webhookPathFromUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed.startsWith(CEKAT_WEBHOOK_BASE)) return null
  const path = trimmed.slice(CEKAT_WEBHOOK_BASE.length).replace(/^\/+|\/+$/g, '')
  return path || null
}
