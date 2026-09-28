import { cekatWebhookPath, webhookPathFromUrl } from '../../shared/pocWebhook.ts'
import type { PocApiIntegration, PocCrm, PocRow } from './types'

type POCConfigLike = {
  agentBehavior: string
  welcomeMessage: string
  welcomeImage?: string | null
  agentTransferConditions: string
  stopAiAfterHandoff: boolean
  silentAgentHandoff: boolean
  labels: ReadonlyArray<{ readonly name: string; readonly condition: string }>
  pipeline: ReadonlyArray<{ readonly order: number; readonly status: string; readonly condition: string }>
  knowledgeBase: {
    readonly textSections: ReadonlyArray<{ readonly title: string; readonly content: string }>
    readonly websites: ReadonlyArray<{ readonly url: string; readonly note: string }>
    readonly qna: ReadonlyArray<{ readonly question: string; readonly answer: string }>
    readonly files: ReadonlyArray<{ readonly name: string; readonly size: number }>
  }
  apiIntegrations: ReadonlyArray<PocApiIntegration>
  crm?: PocCrm
  additionalSettings: {
    readonly aiHistoryLimit: number
    readonly aiReadFileLimit: number
    readonly aiContextLimit: number
    readonly aiTemperature: 'low' | 'balanced' | 'creative'
    readonly messageAwait: number
    readonly aiMessageLimit: number
    readonly watcher: 'off' | 'standard' | 'strict'
    readonly timezone: string
    readonly sessionOnlyMemory: 'off' | 'session_only' | 'per_thread'
    readonly ignoreTeamHandoff: boolean
  }
}

export function sanitizePocExport(name: string, config: POCConfigLike) {
  const apiIntegrations = config.apiIntegrations.map(({ apiKey: _apiKey, ...integration }) => integration)
  return {
    name,
    agentBehavior: config.agentBehavior,
    welcomeMessage: config.welcomeMessage,
    labels: config.labels,
    pipeline: config.pipeline,
    knowledgeBase: config.knowledgeBase,
    apiIntegrations,
    crm: config.crm ?? { boards: [] },
    additionalSettings: config.additionalSettings,
  }
}

type N8nNode = {
  id: string
  name: string
  type: string
  typeVersion: number
  position: [number, number]
  parameters: Record<string, unknown>
}

const VALIDATE = 'Validate AI Input'
const AUTH = 'Authenticate'
const CALL = 'Call client API'
const RESPOND = 'Respond to Cekat'

/** Placeholder the SA replaces with the client's credentials inside n8n — secrets never leave SA Copilot. */
export const N8N_CREDENTIAL_PLACEHOLDER = 'SET_IN_N8N'

function validateCode(integration: PocApiIntegration): string {
  return [
    `// Validates what the Cekat AI Agent sent to ${integration.name} against its AI Input schema.`,
    `const schema = ${JSON.stringify(integration.aiInput)};`,
    'const body = $input.first().json.body ?? {};',
    'const errors = [];',
    'for (const key of schema.required ?? []) if (!(key in body)) errors.push(`Missing required field: ${key}`);',
    'for (const [key, def] of Object.entries(schema.properties ?? {})) {',
    '  if (!(key in body)) continue;',
    '  const v = body[key];',
    '  if (def.type === "string" && typeof v !== "string") errors.push(`${key} must be a string`);',
    '  if ((def.type === "integer" || def.type === "number") && typeof v !== "number") errors.push(`${key} must be a number`);',
    '  if (def.type === "boolean" && typeof v !== "boolean") errors.push(`${key} must be a boolean`);',
    '  if (def.type === "array" && !Array.isArray(v)) errors.push(`${key} must be an array`);',
    '}',
    'if (errors.length) throw new Error(errors.join("; "));',
    'return [{ json: body }];',
  ].join('\n')
}

function authNode(integration: PocApiIntegration): N8nNode {
  return {
    id: 'authenticate',
    name: AUTH,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [720, 300],
    parameters: {
      method: 'POST',
      url: integration.authUrl,
      sendBody: true,
      specifyBody: 'json',
      jsonBody: JSON.stringify({ username: N8N_CREDENTIAL_PLACEHOLDER, password: N8N_CREDENTIAL_PLACEHOLDER }, null, 2),
      options: {},
    },
  }
}

function callNode(integration: PocApiIntegration, hasAuth: boolean): N8nNode {
  const method = integration.targetMethod ?? 'GET'
  const input = `$('${VALIDATE}').item.json`
  const withBody = method !== 'GET' && method !== 'DELETE'
  return {
    id: 'call-client-api',
    name: CALL,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [hasAuth ? 960 : 720, 300],
    parameters: {
      method,
      url: integration.targetUrl || `https://${N8N_CREDENTIAL_PLACEHOLDER}/endpoint`,
      ...(hasAuth
        ? {
            sendHeaders: true,
            headerParameters: {
              parameters: [{ name: 'Authorization', value: `=Bearer {{ $('${AUTH}').item.json.access_token ?? $('${AUTH}').item.json.token }}` }],
            },
          }
        : {}),
      ...(withBody
        ? { sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify(${input}) }}` }
        : { sendQuery: true, specifyQuery: 'json', jsonQuery: `={{ JSON.stringify(${input}) }}` }),
      options: {},
    },
  }
}

/** One importable n8n workflow: Cekat webhook → validate → (login) → client API → reply to Cekat. */
export function buildN8nWorkflow(clientName: string, pocName: string, integration: PocApiIntegration) {
  const hasAuth = Boolean(integration.authUrl?.trim())
  const nodes: N8nNode[] = [
    {
      id: 'webhook',
      name: 'Cekat webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [240, 300],
      parameters: {
        httpMethod: integration.httpMethod,
        path: webhookPathFromUrl(integration.webhookAddress) ?? cekatWebhookPath(clientName, integration.name),
        responseMode: 'responseNode',
        authentication: integration.apiKey ? 'headerAuth' : 'none',
        options: {},
      },
    },
    {
      id: 'validate',
      name: VALIDATE,
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [480, 300],
      parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: validateCode(integration) },
    },
    ...(hasAuth ? [authNode(integration)] : []),
    callNode(integration, hasAuth),
    {
      id: 'respond',
      name: RESPOND,
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [hasAuth ? 1200 : 960, 300],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} },
    },
  ]
  // n8n links nodes by name, in order.
  const connections = Object.fromEntries(
    nodes.slice(0, -1).map((node, i) => [node.name, { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] }]),
  )
  return {
    name: `${pocName} — ${integration.name}`,
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
    staticData: null,
    tags: [],
  }
}

export function buildPocN8nBundle(clientName: string, row: Pick<PocRow, 'name' | 'config'>) {
  const workflows = row.config.apiIntegrations.map((integration) => buildN8nWorkflow(clientName, row.name, integration))
  return {
    pocName: row.name,
    generatedAt: new Date().toISOString(),
    workflows,
  }
}
