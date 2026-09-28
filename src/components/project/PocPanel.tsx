import { useEffect, useMemo, useState } from 'react'
import { Download, FileJson, Plus, Save, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ErrorNote, Field, Input, Spinner, Textarea } from '../ui'
import { AiDraftButton } from '../AiDraftButton'
import { draftPoc } from '../../lib/ai'
import { pocsApi, pocVersionsApi } from '../../lib/api'
import { downloadBlob, slugify } from '../../lib/download'
import { buildN8nWorkflow, sanitizePocExport } from '../../lib/pocExport'
import { CrmSection } from './crm/CrmSection'
import { CEKAT_WEBHOOK_BASE, cekatWebhookUrl } from '../../../shared/pocWebhook.ts'
import { normalizeCrm } from '../../../shared/pocCrm.ts'
import type { PocApiIntegration, PocConfig, PocLabel, PocPipelineStep } from '../../lib/types'

const emptyConfig = (): PocConfig => ({
  agentBehavior: '',
  welcomeMessage: '',
  welcomeImage: null,
  agentTransferConditions: '',
  stopAiAfterHandoff: false,
  silentAgentHandoff: false,
  labels: [],
  pipeline: [],
  knowledgeBase: {
    textSections: [],
    websites: [],
    qna: [],
    files: [],
  },
  apiIntegrations: [],
  crm: { boards: [] },
  additionalSettings: {
    aiHistoryLimit: 20,
    aiReadFileLimit: 3,
    aiContextLimit: 10,
    aiTemperature: 'balanced',
    messageAwait: 5,
    aiMessageLimit: 1000,
    watcher: 'off',
    timezone: '(GMT+7:00) Bangkok, Hanoi, Jakarta',
    sessionOnlyMemory: 'off',
    ignoreTeamHandoff: false,
  },
})

const defaultLabel = (): PocLabel => ({ name: '', condition: '' })
const defaultPipelineStep = (): PocPipelineStep => ({ order: 1, status: '', condition: '' })
const defaultApiIntegration = (): PocApiIntegration => ({
  name: '',
  httpMethod: 'POST',
  description: '',
  webhookAddress: '',
  aiInput: { type: 'object', properties: {}, required: [], additionalProperties: false },
  targetMethod: 'GET',
  targetUrl: '',
  authUrl: '',
})

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

type PocSection = 'agent' | 'crm' | 'marketing'
const POC_SECTIONS: { id: PocSection; label: string; disabled?: boolean }[] = [
  { id: 'agent', label: 'POC Agent' },
  { id: 'crm', label: 'POC CRM' },
  { id: 'marketing', label: 'POC Marketing', disabled: true },
]

/** POCs saved before the n8n target fields and CRM section existed get empty ones. */
function normalizeConfig(config: PocConfig): PocConfig {
  return {
    ...config,
    apiIntegrations: config.apiIntegrations.map((a) => ({ ...defaultApiIntegration(), ...a })),
    crm: normalizeCrm(config.crm),
  }
}

function deepClone<T>(value: T): T {
  return structuredClone(value)
}

function updateIntegrationValue(setDraft: React.Dispatch<React.SetStateAction<PocConfig>>, index: number, patch: Partial<PocApiIntegration>) {
  setDraft((prev) => ({
    ...prev,
    apiIntegrations: prev.apiIntegrations.map((item, i) => (i === index ? { ...item, ...patch } : item)),
  }))
}

export function PocPanel({ projectId, clientName }: { projectId: string; clientName: string }) {
  const qc = useQueryClient()
  const pocs = useQuery({ queryKey: ['pocs', projectId], queryFn: () => pocsApi.list(projectId) })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [draft, setDraft] = useState<PocConfig>(emptyConfig())
  const [note, setNote] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [section, setSection] = useState<PocSection>('agent')

  const selected = useMemo(
    () => (pocs.data ?? []).find((p) => p.id === selectedId) ?? (pocs.data ?? [])[0] ?? null,
    [pocs.data, selectedId],
  )

  useEffect(() => {
    if (!pocs.data) return
    if (!selectedId && pocs.data.length) {
      setSelectedId(pocs.data[0].id)
    }
    if (selectedId && !pocs.data.some((p) => p.id === selectedId)) {
      setSelectedId(pocs.data[0]?.id ?? null)
    }
  }, [pocs.data, selectedId])

  useEffect(() => {
    if (!selected) return
    setName(selected.name)
    setDraft(normalizeConfig(deepClone(selected.config)))
    setNote('')
    setJsonError(null)
  }, [selected])

  const create = useMutation({
    mutationFn: () => pocsApi.create(projectId, `POC ${((pocs.data?.length ?? 0) + 1).toString().padStart(2, '0')}`, emptyConfig()),
    onSuccess: async (row) => {
      setSelectedId(row.id)
      await qc.invalidateQueries({ queryKey: ['pocs', projectId] })
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) return
      const next = deepClone(draft)
      await pocsApi.update(selected.id, { name, config: next })
      await pocVersionsApi.create(selected.id, next, 'manual', note.trim() || 'Manual edit')
      await qc.invalidateQueries({ queryKey: ['pocs', projectId] })
    },
  })

  const [aiStatus, setAiStatus] = useState('')
  const draftAi = useMutation({
    mutationFn: async ({ scope, instruction }: { scope: 'all' | 'crm'; instruction: string }) => {
      if (!selected) return
      setAiStatus('Reading project sources…')
      const what = scope === 'crm' ? 'CRM structure' : 'POC'
      await draftPoc(
        { pocId: selected.id, scope, instruction: instruction || undefined },
        { onProgress: (c) => setAiStatus(`Writing ${what}… ${c.toLocaleString()} chars`), onTool: setAiStatus },
      )
      await qc.invalidateQueries({ queryKey: ['pocs', projectId] })
    },
    onSettled: () => setAiStatus(''),
  })

  const confirmDraftAi = (instruction: string) => {
    if (!selected) return
    const hasContent = draft.agentBehavior.trim() || draft.welcomeMessage.trim() || draft.apiIntegrations.length || draft.labels.length
    if (hasContent && !confirm('Draft with AI replaces every section of this POC (the current one stays in version history). Continue?')) return
    draftAi.mutate({ scope: 'all', instruction })
  }

  const confirmGenerateCrm = (instruction: string) => {
    if (!selected) return
    if (draft.crm.boards.length && !confirm('Generate CRM with AI replaces the CRM boards (the current POC stays in version history). Unsaved edits are lost — save first if needed. Continue?')) return
    draftAi.mutate({ scope: 'crm', instruction })
  }

  const remove = useMutation({
    mutationFn: async () => {
      if (!selected) return
      await pocsApi.remove(selected.id)
      await qc.invalidateQueries({ queryKey: ['pocs', projectId] })
    },
    onSuccess: () => {
      setSelectedId(null)
    },
  })

  const actionError = save.error ?? draftAi.error ?? remove.error

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(sanitizePocExport(name || selected?.name || 'POC', draft), null, 2)], { type: 'application/json' })
    downloadBlob(blob, `${slugify(name || selected?.name || 'poc')}.poc.json`)
  }

  const exportN8n = () => {
    // n8n imports one workflow per file, so each API integration gets its own file.
    const pocName = name || selected?.name || 'POC'
    for (const integration of draft.apiIntegrations) {
      const workflow = buildN8nWorkflow(clientName, pocName, integration)
      downloadBlob(new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' }), `${slugify(pocName)}-${integration.name || 'api'}.n8n.json`)
    }
  }

  if (pocs.isLoading) return <Spinner label="Loading POCs…" />
  if (!pocs.data) return <ErrorNote error={pocs.error ?? 'Unable to load POCs'} />

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-line bg-panel p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">POCs</h3>
          <Button variant="outline" icon={<Plus className="size-4" />} loading={create.isPending} onClick={() => create.mutate()}>
            New
          </Button>
        </div>
        {create.error && <ErrorNote error={create.error} />}
        <div className="space-y-2">
          {pocs.data.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">No POC yet.</p>
          ) : (
            pocs.data.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition ${selectedId === p.id ? 'border-forest bg-forest-soft' : 'border-line bg-transparent hover:border-forest/40'}`}
              >
                <div className="font-medium text-ink">{p.name}</div>
                <div className="mt-1 font-mono text-[11px] text-muted">updated {new Date(p.updated_at).toLocaleDateString()}</div>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="space-y-5 rounded-xl border border-line bg-panel p-4">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div className="min-w-0 flex-1">
                <Field label="POC name">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="AI Booking" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" icon={<FileJson className="size-4" />} onClick={exportJson}>
                  Export JSON
                </Button>
                <Button variant="outline" icon={<Download className="size-4" />} onClick={exportN8n}>
                  Export n8n
                </Button>
                <AiDraftButton label="Draft with AI" isLoading={draftAi.isPending && draftAi.variables?.scope === 'all'} isDisabled={draftAi.isPending} onRun={confirmDraftAi} />
                <Button variant="outline" icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>
                  Save
                </Button>
                <Button variant="danger" icon={<Trash2 className="size-4" />} loading={remove.isPending} onClick={() => confirm(`Delete POC "${selected.name}"?`) && remove.mutate()}>
                  Delete
                </Button>
              </div>
            </div>
            {aiStatus && <p className="font-mono text-xs text-muted">{aiStatus}</p>}
            {actionError && <ErrorNote error={actionError} />}

            <div role="tablist" aria-label="POC sections" className="flex gap-1 border-b border-line">
              {POC_SECTIONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={section === t.id}
                  disabled={t.disabled}
                  title={t.disabled ? 'Coming soon' : undefined}
                  onClick={() => setSection(t.id)}
                  className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${section === t.id ? 'border-forest text-ink' : 'border-transparent text-muted hover:text-ink'}`}
                >
                  {t.label}
                  {t.disabled && <span className="rounded-full bg-paper px-1.5 font-mono text-[10px] uppercase">soon</span>}
                </button>
              ))}
            </div>

            <div className="space-y-6">
              {section === 'crm' && (
                <CrmSection
                  crm={draft.crm}
                  onChange={(crm) => setDraft((prev) => ({ ...prev, crm }))}
                  onGenerate={confirmGenerateCrm}
                  isGenerating={draftAi.isPending && draftAi.variables?.scope === 'crm'}
                />
              )}
              {section === 'agent' && (
              <>
              <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
                <h4 className="font-display text-base font-semibold">AI Agent Behavior</h4>
                <Field label="AI Agent Behavior">
                  <Textarea rows={6} value={draft.agentBehavior} onChange={(e) => setDraft((prev) => ({ ...prev, agentBehavior: e.target.value }))} />
                </Field>
                <Field label="Welcome Message">
                  <Textarea rows={4} value={draft.welcomeMessage} onChange={(e) => setDraft((prev) => ({ ...prev, welcomeMessage: e.target.value }))} />
                </Field>
                <Field label="Welcome Image (manual upload)">
                  <Input value={draft.welcomeImage ?? ''} onChange={(e) => setDraft((prev) => ({ ...prev, welcomeImage: e.target.value || null }))} placeholder="https://.../image.png" />
                </Field>
                <Field label="Agent Transfer Conditions">
                  <Textarea rows={4} value={draft.agentTransferConditions} onChange={(e) => setDraft((prev) => ({ ...prev, agentTransferConditions: e.target.value }))} />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-lg border border-line bg-panel p-3 text-sm">
                    <input type="checkbox" checked={draft.stopAiAfterHandoff} onChange={(e) => setDraft((prev) => ({ ...prev, stopAiAfterHandoff: e.target.checked }))} />
                    Stop AI after handoff
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-line bg-panel p-3 text-sm">
                    <input type="checkbox" checked={draft.silentAgentHandoff} onChange={(e) => setDraft((prev) => ({ ...prev, silentAgentHandoff: e.target.checked }))} />
                    Silent agent handoff
                  </label>
                </div>
              </div>

              <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
                <h4 className="font-display text-base font-semibold">AI Action — Labels</h4>
                {draft.labels.map((label, index) => (
                  <div key={`label-${index}`} className="grid gap-3 rounded-lg border border-line bg-panel p-3 md:grid-cols-[1fr_1.5fr_auto]">
                    <Input value={label.name} onChange={(e) => setDraft((prev) => ({ ...prev, labels: prev.labels.map((item, i) => i === index ? { ...item, name: e.target.value } : item) }))} placeholder="Label name" />
                    <Input value={label.condition} onChange={(e) => setDraft((prev) => ({ ...prev, labels: prev.labels.map((item, i) => i === index ? { ...item, condition: e.target.value } : item) }))} placeholder="When this label should be attached" />
                    <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setDraft((prev) => ({ ...prev, labels: prev.labels.filter((_, i) => i !== index) }))}>
                      Remove
                    </Button>
                  </div>
                ))}
                <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setDraft((prev) => ({ ...prev, labels: [...prev.labels, defaultLabel()] }))}>
                  Add label
                </Button>
              </div>

              <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
                <h4 className="font-display text-base font-semibold">Conversation Pipeline</h4>
                {draft.pipeline.map((step, index) => (
                  <div key={`pipeline-${index}`} className="grid gap-3 rounded-lg border border-line bg-panel p-3 md:grid-cols-[70px_1fr_1.5fr_auto]">
                    <Input type="number" min={1} value={step.order} onChange={(e) => setDraft((prev) => ({ ...prev, pipeline: prev.pipeline.map((item, i) => i === index ? { ...item, order: Number(e.target.value) || 1 } : item) }))} />
                    <Input value={step.status} onChange={(e) => setDraft((prev) => ({ ...prev, pipeline: prev.pipeline.map((item, i) => i === index ? { ...item, status: e.target.value } : item) }))} placeholder="Status name" />
                    <Input value={step.condition} onChange={(e) => setDraft((prev) => ({ ...prev, pipeline: prev.pipeline.map((item, i) => i === index ? { ...item, condition: e.target.value } : item) }))} placeholder="Condition for this transition" />
                    <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setDraft((prev) => ({ ...prev, pipeline: prev.pipeline.filter((_, i) => i !== index) }))}>
                      Remove
                    </Button>
                  </div>
                ))}
                <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setDraft((prev) => ({ ...prev, pipeline: [...prev.pipeline, defaultPipelineStep()] }))}>
                  Add status
                </Button>
              </div>

              <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
                <h4 className="font-display text-base font-semibold">Knowledge Base</h4>
                <div className="space-y-3">
                  <h5 className="text-sm font-semibold uppercase tracking-wide text-muted">Static text</h5>
                  {draft.knowledgeBase.textSections.map((section, index) => (
                    <div key={`kb-section-${index}`} className="grid gap-3 rounded-lg border border-line bg-panel p-3">
                      <Input value={section.title} onChange={(e) => setDraft((prev) => ({ ...prev, knowledgeBase: { ...prev.knowledgeBase, textSections: prev.knowledgeBase.textSections.map((item, i) => i === index ? { ...item, title: e.target.value } : item) } }))} placeholder="Section title" />
                      <Textarea rows={3} value={section.content} onChange={(e) => setDraft((prev) => ({ ...prev, knowledgeBase: { ...prev.knowledgeBase, textSections: prev.knowledgeBase.textSections.map((item, i) => i === index ? { ...item, content: e.target.value } : item) } }))} placeholder="Static knowledge text" />
                    </div>
                  ))}
                  <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setDraft((prev) => ({ ...prev, knowledgeBase: { ...prev.knowledgeBase, textSections: [...prev.knowledgeBase.textSections, { title: '', content: '' }] } }))}>
                    Add text section
                  </Button>
                </div>

                <div className="space-y-3">
                  <h5 className="text-sm font-semibold uppercase tracking-wide text-muted">Website sources</h5>
                  {draft.knowledgeBase.websites.map((site, index) => (
                    <div key={`site-${index}`} className="grid gap-3 rounded-lg border border-line bg-panel p-3 md:grid-cols-[1.2fr_1fr_auto]">
                      <Input value={site.url} onChange={(e) => setDraft((prev) => ({ ...prev, knowledgeBase: { ...prev.knowledgeBase, websites: prev.knowledgeBase.websites.map((item, i) => i === index ? { ...item, url: e.target.value } : item) } }))} placeholder="https://example.com" />
                      <Input value={site.note} onChange={(e) => setDraft((prev) => ({ ...prev, knowledgeBase: { ...prev.knowledgeBase, websites: prev.knowledgeBase.websites.map((item, i) => i === index ? { ...item, note: e.target.value } : item) } }))} placeholder="Notes" />
                      <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setDraft((prev) => ({ ...prev, knowledgeBase: { ...prev.knowledgeBase, websites: prev.knowledgeBase.websites.filter((_, i) => i !== index) } }))}>
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setDraft((prev) => ({ ...prev, knowledgeBase: { ...prev.knowledgeBase, websites: [...prev.knowledgeBase.websites, { url: '', note: '' }] } }))}>
                    Add website
                  </Button>
                </div>

                <div className="space-y-3">
                  <h5 className="text-sm font-semibold uppercase tracking-wide text-muted">Q&A</h5>
                  {draft.knowledgeBase.qna.map((item, index) => (
                    <div key={`qna-${index}`} className="grid gap-3 rounded-lg border border-line bg-panel p-3">
                      <Input value={item.question} onChange={(e) => setDraft((prev) => ({ ...prev, knowledgeBase: { ...prev.knowledgeBase, qna: prev.knowledgeBase.qna.map((q, i) => i === index ? { ...q, question: e.target.value } : q) } }))} placeholder="Question" />
                      <Textarea rows={3} value={item.answer} onChange={(e) => setDraft((prev) => ({ ...prev, knowledgeBase: { ...prev.knowledgeBase, qna: prev.knowledgeBase.qna.map((q, i) => i === index ? { ...q, answer: e.target.value } : q) } }))} placeholder="Answer" />
                    </div>
                  ))}
                  <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setDraft((prev) => ({ ...prev, knowledgeBase: { ...prev.knowledgeBase, qna: [...prev.knowledgeBase.qna, { question: '', answer: '' }] } }))}>
                    Add Q&A
                  </Button>
                </div>

                <div className="space-y-3">
                  <h5 className="text-sm font-semibold uppercase tracking-wide text-muted">Files</h5>
                  {draft.knowledgeBase.files.length === 0 ? <p className="text-sm text-muted">No uploaded KB files yet.</p> : draft.knowledgeBase.files.map((file, index) => (
                    <div key={`file-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel p-3">
                      <span className="text-sm">{file.name}</span>
                      <span className="font-mono text-xs text-muted">{file.size} bytes</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
                <h4 className="font-display text-base font-semibold">API Integrations</h4>
                {draft.apiIntegrations.length === 0 ? <p className="text-sm text-muted">No API integration configured yet.</p> : draft.apiIntegrations.map((integration, index) => (
                  <div key={`api-${index}`} className="space-y-3 rounded-lg border border-line bg-panel p-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Name">
                        <Input
                          value={integration.name}
                          onChange={(e) => {
                            const auto = !integration.webhookAddress || integration.webhookAddress === cekatWebhookUrl(clientName, integration.name)
                            updateIntegrationValue(setDraft, index, {
                              name: e.target.value,
                              ...(auto ? { webhookAddress: e.target.value ? cekatWebhookUrl(clientName, e.target.value) : '' } : {}),
                            })
                          }}
                          placeholder="cek_jadwal_dokter"
                        />
                      </Field>
                      <Field label="Method (Cekat → webhook)">
                        <select className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink" value={integration.httpMethod} onChange={(e) => updateIntegrationValue(setDraft, index, { httpMethod: e.target.value as PocApiIntegration['httpMethod'] })}>
                          {HTTP_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                        </select>
                      </Field>
                    </div>
                    <Field label="Description">
                      <Textarea rows={3} value={integration.description} onChange={(e) => updateIntegrationValue(setDraft, index, { description: e.target.value })} placeholder="When this tool should be used in the conversation" />
                    </Field>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Webhook Address (Cekat n8n)">
                        <Input value={integration.webhookAddress} onChange={(e) => updateIntegrationValue(setDraft, index, { webhookAddress: e.target.value })} placeholder={`${CEKAT_WEBHOOK_BASE}…`} />
                      </Field>
                      <Field label="API Key (Cekat → webhook header)">
                        <Input value={integration.apiKey ?? ''} type="password" onChange={(e) => updateIntegrationValue(setDraft, index, { apiKey: e.target.value || undefined })} placeholder="Optional" />
                      </Field>
                    </div>
                    <div className="space-y-3 rounded-md border border-dashed border-line p-3">
                      <p className="text-xs text-muted">n8n workflow: Cekat webhook → login (Auth URL) → client API (Target URL) → reply to Cekat. Credentials are filled in n8n, not here.</p>
                      <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
                        <Field label="Target method">
                          <select className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink" value={integration.targetMethod} onChange={(e) => updateIntegrationValue(setDraft, index, { targetMethod: e.target.value as PocApiIntegration['targetMethod'] })}>
                            {HTTP_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                          </select>
                        </Field>
                        <Field label="Target URL (client API, e.g. Doctor Assist)">
                          <Input value={integration.targetUrl} onChange={(e) => updateIntegrationValue(setDraft, index, { targetUrl: e.target.value })} placeholder="https://api.client.com/appointments/v2" />
                        </Field>
                      </div>
                      <Field label="Auth URL (login endpoint, blank = no login)">
                        <Input value={integration.authUrl} onChange={(e) => updateIntegrationValue(setDraft, index, { authUrl: e.target.value })} placeholder="https://api.client.com/auth/login" />
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
                              updateIntegrationValue(setDraft, index, { aiInput: parsed as Record<string, unknown> })
                              setJsonError(null)
                            }
                          } catch (err) {
                            setJsonError(err instanceof Error ? err.message : 'Invalid JSON schema')
                          }
                        }}
                      />
                    </Field>
                    <div className="flex justify-end">
                      <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setDraft((prev) => ({ ...prev, apiIntegrations: prev.apiIntegrations.filter((_, i) => i !== index) }))}>
                        Remove API
                      </Button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setDraft((prev) => ({ ...prev, apiIntegrations: [...prev.apiIntegrations, defaultApiIntegration()] }))}>
                  Add API integration
                </Button>
              </div>

              <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
                <h4 className="font-display text-base font-semibold">Additional Settings</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="AI History Limit"><Input type="number" value={draft.additionalSettings.aiHistoryLimit} onChange={(e) => setDraft((prev) => ({ ...prev, additionalSettings: { ...prev.additionalSettings, aiHistoryLimit: Number(e.target.value) || 0 } }))} /></Field>
                  <Field label="AI Read File Limit"><Input type="number" value={draft.additionalSettings.aiReadFileLimit} onChange={(e) => setDraft((prev) => ({ ...prev, additionalSettings: { ...prev.additionalSettings, aiReadFileLimit: Number(e.target.value) || 0 } }))} /></Field>
                  <Field label="AI Context Limit"><Input type="number" value={draft.additionalSettings.aiContextLimit} onChange={(e) => setDraft((prev) => ({ ...prev, additionalSettings: { ...prev.additionalSettings, aiContextLimit: Number(e.target.value) || 0 } }))} /></Field>
                  <Field label="AI Temperature">
                    <select className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink" value={draft.additionalSettings.aiTemperature} onChange={(e) => setDraft((prev) => ({ ...prev, additionalSettings: { ...prev.additionalSettings, aiTemperature: e.target.value as 'low' | 'balanced' | 'creative' } }))}>
                      <option value="low">Low</option>
                      <option value="balanced">Balanced</option>
                      <option value="creative">Creative</option>
                    </select>
                  </Field>
                  <Field label="Message Await"><Input type="number" value={draft.additionalSettings.messageAwait} onChange={(e) => setDraft((prev) => ({ ...prev, additionalSettings: { ...prev.additionalSettings, messageAwait: Number(e.target.value) || 0 } }))} /></Field>
                  <Field label="AI Message Limit"><Input type="number" value={draft.additionalSettings.aiMessageLimit} onChange={(e) => setDraft((prev) => ({ ...prev, additionalSettings: { ...prev.additionalSettings, aiMessageLimit: Number(e.target.value) || 0 } }))} /></Field>
                  <Field label="Watcher">
                    <select className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink" value={draft.additionalSettings.watcher} onChange={(e) => setDraft((prev) => ({ ...prev, additionalSettings: { ...prev.additionalSettings, watcher: e.target.value as 'off' | 'standard' | 'strict' } }))}>
                      <option value="off">Off</option>
                      <option value="standard">Standard</option>
                      <option value="strict">Strict</option>
                    </select>
                  </Field>
                  <Field label="Timezone"><Input value={draft.additionalSettings.timezone} onChange={(e) => setDraft((prev) => ({ ...prev, additionalSettings: { ...prev.additionalSettings, timezone: e.target.value } }))} /></Field>
                  <Field label="Session-Only Memory">
                    <select className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink" value={draft.additionalSettings.sessionOnlyMemory} onChange={(e) => setDraft((prev) => ({ ...prev, additionalSettings: { ...prev.additionalSettings, sessionOnlyMemory: e.target.value as 'off' | 'session_only' | 'per_thread' } }))}>
                      <option value="off">Off</option>
                      <option value="session_only">Session only</option>
                      <option value="per_thread">Per thread</option>
                    </select>
                  </Field>
                  <label className="flex items-center gap-2 rounded-lg border border-line bg-panel p-3 text-sm">
                    <input type="checkbox" checked={draft.additionalSettings.ignoreTeamHandoff} onChange={(e) => setDraft((prev) => ({ ...prev, additionalSettings: { ...prev.additionalSettings, ignoreTeamHandoff: e.target.checked } }))} />
                    Ignore team handoff
                  </label>
                </div>
              </div>
              </>
              )}

              <Field label="Version note">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe what changed" />
              </Field>

              {jsonError && <ErrorNote error={jsonError} />}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">No POC selected.</p>
        )}
      </section>
    </div>
  )
}
