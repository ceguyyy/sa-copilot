// The POC's n8n gateway workflow built from its API integrations, without AI: the same structure the AI follows
// (N8N_WORKFLOW_RULES), with every name, action, input check and endpoint taken from the POC itself.
import { curlForIntegration } from './pocCurl.ts'
import { completeWorkflowExport, completeWorkflowLayout, type PocN8nWorkflow } from './pocN8n.ts'
import { CEKAT_WEBHOOK_BASE, cekatWebhookPath, webhookPathFromUrl } from './pocWebhook.ts'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type GatewayIntegration = {
  name: string
  httpMethod: Method
  description?: string
  webhookAddress: string
  apiKey?: string
  aiInput: Record<string, unknown>
  targetMethod?: Method
  targetUrl?: string
  authUrl?: string
}

type Node = { name: string; type: string; typeVersion: number; parameters: Record<string, unknown> }

/** Placeholder the SA replaces with the client's credentials inside n8n — secrets never leave SA Copilot. */
export const N8N_CREDENTIAL_PLACEHOLDER = 'SET_IN_N8N'

const WEBHOOK = 'Webhook Trigger'
const VALIDATE = 'Validate & Extract Payload'
const IS_VALID = 'Is Payload Valid?'
const INVALID = 'Format Validation Error'
const SWITCH = 'Switch Action'
const RESPOND = 'Respond to Webhook'

const code = (name: string, jsCode: string): Node => ({ name, type: 'n8n-nodes-base.code', typeVersion: 2, parameters: { jsCode } })
const http = (name: string, parameters: Record<string, unknown>): Node => ({ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.1, parameters: { ...parameters, options: {} } })
const link = (...targets: string[][]) => ({ main: targets.map((out) => out.map((node) => ({ node, type: 'main', index: 0 }))) })

/** Allowed actions, and per action the required fields and field types of its AI Input schema. */
function validateCode(integrations: GatewayIntegration[]): string {
  const schemas = Object.fromEntries(
    integrations.map((i) => {
      const props = (i.aiInput.properties ?? {}) as Record<string, { type?: unknown }>
      const types = Object.fromEntries(Object.entries(props).map(([k, def]) => [k, def?.type ?? null]))
      return [i.name, { required: Array.isArray(i.aiInput.required) ? i.aiInput.required : [], types }]
    }),
  )
  return [
    `const schemas = ${JSON.stringify(schemas)};`,
    'const body = $input.item.json.body || $input.item.json || {};',
    "const action = String(body.action || '');",
    'const errors = [];',
    'const schema = schemas[action];',
    "if (!schema) errors.push('action harus salah satu: ' + Object.keys(schemas).join(', '));",
    'else {',
    "  for (const f of schema.required) if (body[f] === undefined || body[f] === '') errors.push(f + ' wajib diisi untuk ' + action);",
    '  for (const [f, t] of Object.entries(schema.types)) {',
    '    const v = body[f];',
    '    if (v === undefined || t === null) continue;',
    "    const ok = t === 'integer' || t === 'number' ? typeof v === 'number' : t === 'array' ? Array.isArray(v) : t === 'object' ? typeof v === 'object' : typeof v === t;",
    "    if (!ok) errors.push(f + ' harus bertipe ' + t);",
    '  }',
    '}',
    'const { action: _action, ...payload } = body;',
    'return [{ json: { valid: errors.length === 0, errors, action, payload } }];',
  ].join('\n')
}

/** Authenticate (when it has an auth URL) → call the client API → format the reply, for one use case. */
function branch(i: GatewayIntegration): Node[] {
  const auth = `Authenticate ${i.name}`
  const call = `Call ${i.name}`
  const hasAuth = Boolean(i.authUrl?.trim())
  const method = i.targetMethod ?? 'GET'
  const input = `$('${VALIDATE}').item.json.payload`
  const withBody = method !== 'GET' && method !== 'DELETE'
  const token = `=Bearer {{ $('${auth}').item.json.access_token ?? $('${auth}').item.json.token }}`
  return [
    ...(hasAuth
      ? [http(auth, { method: 'POST', url: i.authUrl, sendBody: true, specifyBody: 'json', jsonBody: JSON.stringify({ username: N8N_CREDENTIAL_PLACEHOLDER, password: N8N_CREDENTIAL_PLACEHOLDER }) })]
      : []),
    http(call, {
      method,
      url: i.targetUrl?.trim() || `https://${N8N_CREDENTIAL_PLACEHOLDER}/endpoint`,
      ...(hasAuth ? { sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: token }] } } : {}),
      ...(withBody
        ? { sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify(${input}) }}` }
        : { sendQuery: true, specifyQuery: 'json', jsonQuery: `={{ JSON.stringify(${input}) }}` }),
    }),
    code(`Format ${i.name} Response`, `return [{ json: { success: true, action: '${i.name}', data: $input.item.json } }];`),
  ]
}

/** The gateway webhook path: the first Cekat webhook among the integrations, else one derived from the client. */
function gatewayPath(clientName: string, integrations: GatewayIntegration[]): string {
  return integrations.map((i) => webhookPathFromUrl(i.webhookAddress)).find(Boolean) ?? cekatWebhookPath(clientName, 'gateway')
}

export type GatewayInput = { clientName: string; pocName: string; integrations: GatewayIntegration[] }

/** ONE gateway workflow for the POC, with one use case + cURL per named API integration; null without any. */
export function buildGatewayWorkflow({ clientName, pocName, integrations }: GatewayInput): PocN8nWorkflow | null {
  const named = integrations.filter((i) => i.name.trim())
  if (!named.length) return null
  const path = gatewayPath(clientName, named)
  const branches = named.map(branch)
  const nodes: Node[] = [
    { name: WEBHOOK, type: 'n8n-nodes-base.webhook', typeVersion: 1.1, parameters: { httpMethod: 'POST', path, responseMode: 'responseNode', options: {} } },
    code(VALIDATE, validateCode(named)),
    { name: IS_VALID, type: 'n8n-nodes-base.if', typeVersion: 1, parameters: { conditions: { boolean: [{ value1: '={{ $json.valid }}', value2: true }] } } },
    code(INVALID, "return [{ json: { success: false, message: $input.item.json.errors.join('; ') } }];"),
    { name: SWITCH, type: 'n8n-nodes-base.switch', typeVersion: 1, parameters: { dataType: 'string', value1: '={{ $json.action }}', rules: { rules: named.map((i, output) => ({ value2: i.name, output })) } } },
    ...branches.flat(),
    { name: RESPOND, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1, parameters: { respondWith: 'allIncomingItems', options: {} } },
  ]
  const chains = branches.map((b) => Object.fromEntries(b.map((n, k) => [n.name, link([b[k + 1]?.name ?? RESPOND])])))
  const connections = Object.assign(
    { [WEBHOOK]: link([VALIDATE]), [VALIDATE]: link([IS_VALID]), [IS_VALID]: link([SWITCH], [INVALID]), [INVALID]: link([RESPOND]), [SWITCH]: link(...branches.map((b) => [b[0].name])) },
    ...chains,
  )
  const name = `${[clientName.trim(), pocName.trim()].filter(Boolean).join(' ')} Gateway`
  const workflow = completeWorkflowExport(completeWorkflowLayout({ name, nodes, connections }))
  const url = CEKAT_WEBHOOK_BASE + path
  return {
    name,
    description: `Built from the POC's API integrations: one webhook, input validation per action, then Switch Action routes ${named.map((i) => i.name).join(', ')} to their client API calls.`,
    json: JSON.stringify(workflow, null, 2),
    cases: named.map((i) => ({ action: i.name, title: i.description?.trim().split('\n')[0] ?? '', curl: curlForIntegration({ ...i, webhookAddress: url }) })),
    testNotes: 'Each cURL should return { "success": true, "action": "…", "data": … }; drop a required field to get { "success": false, "message": "…" }.',
  }
}
