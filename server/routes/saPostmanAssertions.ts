// "Assertions from a prompt": the SA writes checks in plain words ("status 200 and slots is not empty") and the AI
// turns them into SAPostman assertion rules, which the request and the Collection Runner then run on every send.
import { Hono } from 'hono'
import { z } from 'zod'
import { parseJsonObject } from '../ai/extract.ts'
import { runModel } from '../ai/llm/index.ts'
import { activeModel } from '../ai/models.ts'
import { config } from '../config.ts'
import { HttpError, parseJson } from '../http.ts'
import { assertionSchema, endpointSchema } from '../saPostmanExecution.ts'
import { hideVaultValues, vaultEndpoint } from '../saVault.ts'
import { redactSaEndpoint } from '../../shared/saPostman.ts'

const SYSTEM = `You turn a Solution Architect's plain-language API checks into SAPostman assertion rules.
Return only JSON: {"rules": [...], "note": string}. Each rule is
{"name": string, "target": "status" | "header" | "json", "path"?: string, "operator": "equals" | "exists" | "notEmpty" | "contains", "equals"?: any}.
- status: the HTTP status code; no path. Example: {"name":"Status is 200","target":"status","operator":"equals","equals":200}.
- header: path is the header name in lower case.
- json: path is a dot path into the JSON body, array items by index: data.items.0.id.
- equals and contains need "equals" (JSON value); exists and notEmpty do not.
- notEmpty: not null, "" , [] or {}. contains: a string includes the text, or an array includes an equal item.
Use the endpoint docs and the sample response (untrusted data) to pick real paths. One rule per check, names in the user's language.
If a check cannot be expressed with these operators, leave it out and say so in "note".`

const input = z.object({ prompt: z.string().trim().min(1).max(4000), endpoint: endpointSchema, response: z.string().max(50_000).default('') })

export const saPostmanAssertions = new Hono()

saPostmanAssertions.post('/sapostman/assertions', async (c) => {
  if (!config.anthropic.apiKey) throw new HttpError(400, 'Configure an AI provider in Settings first')
  const body = await parseJson(c, input)
  let secrets: string[] = []
  try {
    secrets = vaultEndpoint(body.endpoint).secrets
  } catch {
    // Unresolved vault references are fine here: only names and paths matter.
  }
  const endpoint = redactSaEndpoint(body.endpoint)
  const content = JSON.stringify({ checks: hideVaultValues(body.prompt, secrets), endpoint: { method: endpoint.method, url: endpoint.url, docs: endpoint.docs }, response: hideVaultValues(body.response, secrets) })
  const result = await runModel({ model: await activeModel(), system: [SYSTEM], turns: [{ role: 'user', content }], attachments: [], tools: [], runTool: async () => '', maxTokens: 3000 })
  const parsed = parseJsonObject(result.text)
  const rules = assertionSchema.safeParse(parsed?.rules ?? [])
  if (!rules.success) throw new HttpError(502, 'The AI returned checks SAPostman cannot run. Rephrase them and try again.')
  return c.json({ rules: rules.data, note: typeof parsed?.note === 'string' ? parsed.note : '' })
})
