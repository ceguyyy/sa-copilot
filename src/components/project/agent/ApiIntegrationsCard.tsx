import { Plus, Trash2 } from 'lucide-react'
import { Button, Field, Input, Textarea } from '../../ui'
import { CopyButton } from '../../CopyButton'
import { ReviseField, ReviseHeading } from '../PocReviseParts'
import { defaultApiIntegration, HTTP_METHODS, type SetPocDraft } from '../pocConfig'
import type { PocRevise } from '../usePocRevise'
import { CEKAT_WEBHOOK_BASE, cekatWebhookUrl } from '../../../../shared/pocWebhook.ts'
import { curlForIntegration } from '../../../../shared/pocCurl.ts'
import type { PocApiIntegration } from '../../../lib/types'

type Props = {
  integrations: PocApiIntegration[]
  setDraft: SetPocDraft
  revise: PocRevise
  clientName: string
  /** The AI Input Schema box reports whether its JSON parses; the editor shows the error. */
  onJsonError: (error: string | null) => void
}

const selectClass = 'w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink'

/** API integrations: the tools the Cekat AI calls through the Cekat n8n webhook. */
export function ApiIntegrationsCard({ integrations, setDraft, revise, clientName, onJsonError }: Props) {
  const setIntegrations = (update: (items: PocApiIntegration[]) => PocApiIntegration[]) =>
    setDraft((prev) => ({ ...prev, apiIntegrations: update(prev.apiIntegrations) }))
  const updateIntegration = (index: number, patch: Partial<PocApiIntegration>) =>
    setIntegrations((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  return (
    <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
      <ReviseHeading title="API Integrations" action={revise.button({ kind: 'section', section: 'apiIntegrations' })} />
      {revise.preview({ kind: 'section', section: 'apiIntegrations' })}
      {integrations.length === 0 ? <p className="text-sm text-muted">No API integration configured yet.</p> : integrations.map((integration, index) => (
        <div key={`api-${index}`} className="space-y-3 rounded-lg border border-line bg-panel p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Name">
              <Input
                value={integration.name}
                onChange={(e) => {
                  const auto = !integration.webhookAddress || integration.webhookAddress === cekatWebhookUrl(clientName, integration.name)
                  updateIntegration(index, {
                    name: e.target.value,
                    ...(auto ? { webhookAddress: e.target.value ? cekatWebhookUrl(clientName, e.target.value) : '' } : {}),
                  })
                }}
                placeholder="cek_jadwal_dokter"
              />
            </Field>
            <Field label="Method (Cekat → webhook)">
              <select className={selectClass} value={integration.httpMethod} onChange={(e) => updateIntegration(index, { httpMethod: e.target.value as PocApiIntegration['httpMethod'] })}>
                {HTTP_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </Field>
          </div>
          <ReviseField label="Description" action={revise.button({ kind: 'field', field: 'apiDescription', index }, { iconOnly: true })} preview={revise.preview({ kind: 'field', field: 'apiDescription', index })}>
            <Textarea aria-label="Description" rows={3} value={integration.description} onChange={(e) => updateIntegration(index, { description: e.target.value })} placeholder="When this tool should be used in the conversation" />
          </ReviseField>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Webhook Address (Cekat n8n)">
              <Input value={integration.webhookAddress} onChange={(e) => updateIntegration(index, { webhookAddress: e.target.value })} placeholder={`${CEKAT_WEBHOOK_BASE}…`} />
            </Field>
            <Field label="API Key (Cekat → webhook header)">
              <Input value={integration.apiKey ?? ''} type="password" onChange={(e) => updateIntegration(index, { apiKey: e.target.value || undefined })} placeholder="Optional" />
            </Field>
          </div>
          <div className="space-y-3 rounded-md border border-dashed border-line p-3">
            <p className="text-xs text-muted">n8n workflow: Cekat webhook → login (Auth URL) → client API (Target URL) → reply to Cekat. Credentials are filled in n8n, not here.</p>
            <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
              <Field label="Target method">
                <select className={selectClass} value={integration.targetMethod} onChange={(e) => updateIntegration(index, { targetMethod: e.target.value as PocApiIntegration['targetMethod'] })}>
                  {HTTP_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </Field>
              <Field label="Target URL (client API, e.g. Doctor Assist)">
                <Input value={integration.targetUrl} onChange={(e) => updateIntegration(index, { targetUrl: e.target.value })} placeholder="https://api.client.com/appointments/v2" />
              </Field>
            </div>
            <Field label="Auth URL (login endpoint, blank = no login)">
              <Input value={integration.authUrl} onChange={(e) => updateIntegration(index, { authUrl: e.target.value })} placeholder="https://api.client.com/auth/login" />
            </Field>
          </div>
          <Field label="AI Input Schema (JSON)" hint="Parameters the Cekat AI sends when it uses this tool — they arrive as the webhook body in n8n and are forwarded to the client API.">
            <Textarea
              rows={8}
              value={JSON.stringify(integration.aiInput, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value)
                  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    updateIntegration(index, { aiInput: parsed as Record<string, unknown> })
                    onJsonError(null)
                  }
                } catch (err) {
                  onJsonError(err instanceof Error ? err.message : 'Invalid JSON schema')
                }
              }}
            />
          </Field>
          <div className="flex flex-wrap items-start justify-end gap-2">
            <CopyButton text={curlForIntegration(integration)} label="Copy cURL" title="cURL to the Cekat webhook with a sample body from the AI Input Schema — paste it into Postman (Import → Raw text) or a terminal" />
            <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setIntegrations((items) => items.filter((_, i) => i !== index))}>
              Remove API
            </Button>
          </div>
        </div>
      ))}
      <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setIntegrations((items) => [...items, defaultApiIntegration()])}>
        Add API integration
      </Button>
    </div>
  )
}
