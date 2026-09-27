// Pulls generated JSON out of a model reply. Direct Claude API: structured output makes the text the JSON.
// Proxies (9router): the JSON arrives as the `submit_document` tool input (handled by the adapters),
// or — if the model ignored the tool — as text, which parseJsonObject recovers.

export const SUBMIT_TOOL = 'submit_document'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Parses a JSON object from free text, tolerating ```json fences and prose around it. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const parsed: unknown = JSON.parse(candidate.slice(start, end + 1))
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}
