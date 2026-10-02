import { useEffect, useMemo, useState } from 'react'
import { FileJson, History, Plus, Save, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ErrorNote, Field, Input, Spinner, Textarea } from '../ui'
import { AiDraftButton } from '../AiDraftButton'
import { AiJobStatus } from '../AiJobStatus'
import { draftPoc, type PocDraftScope } from '../../lib/ai'
import type { AiRunOptions } from '../../lib/useOutputLimit'
import { pocsApi, pocVersionsApi } from '../../lib/api'
import { downloadBlob, slugify } from '../../lib/download'
import { sanitizePocExport } from '../../lib/pocExport'
import { CrmSection } from './crm/CrmSection'
import { PocFlowSection } from './PocFlowSection'
import { PocN8nSection } from './PocN8nSection'
import { PocHistory } from './PocHistory'
import { ChatFlowSection } from './chatflow/ChatFlowSection'
import { QaSection } from './qa/QaSection'
import { WelcomeImagePicker } from './WelcomeImagePicker'
import { ReviseField, ReviseHeading } from './PocReviseParts'
import { usePocRevise } from './usePocRevise'
import { CopyButton } from '../CopyButton'
import { CEKAT_WEBHOOK_BASE, cekatWebhookUrl } from '../../../shared/pocWebhook.ts'
import { normalizeCrm } from '../../../shared/pocCrm.ts'
import { emptyFlow, normalizeFlow } from '../../../shared/pocFlow.ts'
import { emptyN8n, normalizeN8n } from '../../../shared/pocN8n.ts'
import { emptyChatFlows, normalizeChatFlows } from '../../../shared/pocChatFlow.ts'
import { aiActionsPrompt } from '../../../shared/pocActions.ts'
import { curlForIntegration } from '../../../shared/pocCurl.ts'
import { POC_LABEL_MAX_CHARS } from '../../../shared/pocLimits.ts'
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
  flow: emptyFlow(),
  n8n: emptyN8n(),
  chatFlows: emptyChatFlows(),
  livechatUrl: '',
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

type PocSection = 'agent' | 'flow' | 'chatFlow' | 'n8n' | 'crm' | 'marketing'
const POC_SECTIONS: { id: PocSection; label: string; disabled?: boolean }[] = [
  { id: 'agent', label: 'POC Agent' },
  { id: 'flow', label: 'Flow & Happy Case' },
  { id: 'chatFlow', label: 'POC Flow' },
  { id: 'n8n', label: 'n8n Workflows' },
  { id: 'crm', label: 'POC CRM' },
  { id: 'marketing', label: 'POC Marketing', disabled: true },
]

/** POCs saved before the n8n target fields, CRM section and flow existed get empty ones. */
function normalizeConfig(config: PocConfig): PocConfig {
  return {
    ...config,
    apiIntegrations: config.apiIntegrations.map((a) => ({ ...defaultApiIntegration(), ...a })),
    crm: normalizeCrm(config.crm),
    flow: normalizeFlow(config.flow),
    n8n: normalizeN8n(config.n8n),
    chatFlows: normalizeChatFlows(config.chatFlows),
    livechatUrl: config.livechatUrl ?? '',
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
  const [showHistory, setShowHistory] = useState(false)

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
      await Promise.all([qc.invalidateQueries({ queryKey: ['pocs', projectId] }), qc.invalidateQueries({ queryKey: ['poc-versions', selected.id] })])
    },
  })

  const [aiStatus, setAiStatus] = useState('')
  const [aiStartedAt, setAiStartedAt] = useState(0)
  const draftAi = useMutation({
    mutationFn: async ({ scope, instruction, maxTokens }: { scope: PocDraftScope; instruction: string; maxTokens?: number }) => {
      if (!selected) return
      setAiStartedAt(Date.now())
      setAiStatus('Reading project sources…')
      const what = { all: 'POC', crm: 'CRM structure', flow: 'flowchart & happy cases', n8n: 'n8n workflows', chatFlow: 'POC Flow' }[scope]
      await draftPoc(
        { pocId: selected.id, scope, instruction: instruction || undefined, maxTokens },
        {
          onProgress: (c, parts) => setAiStatus(`Writing ${what}… ${c.toLocaleString()} chars${parts ? ` · ${parts.done}/${parts.total} done` : ''}`),
          onTool: setAiStatus,
        },
      )
      await Promise.all([qc.invalidateQueries({ queryKey: ['pocs', projectId] }), qc.invalidateQueries({ queryKey: ['poc-versions', selected.id] })])
    },
    onSettled: () => setAiStatus(''),
  })

  const revise = usePocRevise({
    pocId: selected?.id,
    draft,
    setDraft,
    resetKey: `${selected?.id ?? ''}:${selected?.updated_at ?? ''}`,
    isDisabled: draftAi.isPending,
  })

  const confirmDraftAi = (instruction: string, { maxTokens }: AiRunOptions) => {
    if (!selected) return
    const hasContent = draft.agentBehavior.trim() || draft.welcomeMessage.trim() || draft.apiIntegrations.length || draft.labels.length
    if (hasContent && !confirm('Draft with AI replaces every section of this POC (the current one stays in version history). Continue?')) return
    draftAi.mutate({ scope: 'all', instruction, maxTokens })
  }

  const confirmGenerateCrm = (instruction: string, { maxTokens }: AiRunOptions) => {
    if (!selected) return
    if (draft.crm.boards.length && !confirm('Generate CRM with AI replaces the CRM boards (the current POC stays in version history). Unsaved edits are lost — save first if needed. Continue?')) return
    draftAi.mutate({ scope: 'crm', instruction, maxTokens })
  }

  const confirmGenerateFlow = (instruction: string, { maxTokens }: AiRunOptions) => {
    if (!selected) return
    const replaces = draft.flow.mermaid || draft.flow.happyCases.length
    if (!confirm(`Generate the flowchart and happy cases from the saved POC${replaces ? ' (replaces the current ones; the POC stays in version history)' : ''}. Unsaved edits are lost — save first if needed. Continue?`)) return
    draftAi.mutate({ scope: 'flow', instruction, maxTokens })
  }

  const confirmGenerateN8n = (instruction: string, { maxTokens }: AiRunOptions) => {
    if (!selected) return
    const replaces = draft.n8n.workflows.length ? ' (replaces the current workflows; the POC stays in version history)' : ''
    if (!confirm(`Generate the n8n workflows from the saved POC${replaces}. Unsaved edits are lost — save first if needed. Continue?`)) return
    draftAi.mutate({ scope: 'n8n', instruction, maxTokens })
  }

  const confirmGenerateChatFlow = (instruction: string, { maxTokens }: AiRunOptions) => {
    if (!selected) return
    const replaces = draft.chatFlows.flows.length ? ' (replaces the current flows; the POC stays in version history)' : ''
    if (!confirm(`Generate the POC Flow from the saved POC${replaces}. Unsaved edits are lost — save first if needed. Continue?`)) return
    draftAi.mutate({ scope: 'chatFlow', instruction, maxTokens })
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
  const hasUnsavedChanges = useMemo(
    () => !!selected && (name !== selected.name || JSON.stringify(draft) !== JSON.stringify(normalizeConfig(selected.config))),
    [selected, name, draft],
  )

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(sanitizePocExport(name || selected?.name || 'POC', draft), null, 2)], { type: 'application/json' })
    downloadBlob(blob, `${slugify(name || selected?.name || 'poc')}.poc.json`)
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
                <AiDraftButton label="Draft with AI" isLoading={draftAi.isPending && draftAi.variables?.scope === 'all'} isDisabled={draftAi.isPending} onRun={confirmDraftAi} />
                <Button variant={showHistory ? 'primary' : 'outline'} icon={<History className="size-4" />} aria-pressed={showHistory} onClick={() => setShowHistory((v) => !v)}>
                  History
                </Button>
                <Button variant="outline" icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>
                  Save
                </Button>
                <Button variant="danger" icon={<Trash2 className="size-4" />} loading={remove.isPending} onClick={() => confirm(`Delete POC "${selected.name}"?`) && remove.mutate()}>
                  Delete
                </Button>
              </div>
            </div>
            {aiStatus && <AiJobStatus text={aiStatus} startedAt={aiStartedAt} />}
            {showHistory && <PocHistory key={selected.id} pocId={selected.id} projectId={projectId} hasUnsavedChanges={hasUnsavedChanges} onClose={() => setShowHistory(false)} />}
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
              {section === 'flow' && (
                <PocFlowSection
                  flow={draft.flow}
                  pocName={name || selected.name}
                  onChange={(flow) => setDraft((prev) => ({ ...prev, flow }))}
                  onGenerate={confirmGenerateFlow}
                  isGenerating={draftAi.isPending && draftAi.variables?.scope === 'flow'}
                  isDisabled={draftAi.isPending}
                  status={aiStatus && <AiJobStatus text={aiStatus} startedAt={aiStartedAt} />}
                  reviseAction={draft.flow.mermaid || draft.flow.happyCases.length ? revise.button({ kind: 'section', section: 'flow' }) : undefined}
                  revisePreview={revise.preview({ kind: 'section', section: 'flow' })}
                />
              )}
              {section === 'flow' && (
                <QaSection
                  pocId={selected.id}
                  pocName={name || selected.name}
                  livechatUrl={draft.livechatUrl}
                  onLivechatUrlChange={(livechatUrl) => setDraft((prev) => ({ ...prev, livechatUrl }))}
                  hasHappyCases={draft.flow.happyCases.length > 0}
                  hasUnsavedChanges={hasUnsavedChanges}
                  onRevise={(instruction) => revise.run({ kind: 'section', section: 'agent' }, instruction)}
                  isReviseDisabled={revise.isBusy}
                  revisePreview={revise.preview({ kind: 'section', section: 'agent' })}
                />
              )}
              {section === 'chatFlow' && (
                <ChatFlowSection
                  chatFlows={draft.chatFlows}
                  pocName={name || selected.name}
                  onChange={(chatFlows) => setDraft((prev) => ({ ...prev, chatFlows }))}
                  onGenerate={confirmGenerateChatFlow}
                  isGenerating={draftAi.isPending && draftAi.variables?.scope === 'chatFlow'}
                  isDisabled={draftAi.isPending}
                  status={aiStatus && <AiJobStatus text={aiStatus} startedAt={aiStartedAt} />}
                />
              )}
              {section === 'n8n' && (
                <PocN8nSection
                  pocId={selected.id}
                  n8n={draft.n8n}
                  integrations={draft.apiIntegrations}
                  clientName={clientName}
                  pocName={name || selected.name}
                  onChange={(n8n) => setDraft((prev) => ({ ...prev, n8n }))}
                  onGenerate={confirmGenerateN8n}
                  isGenerating={draftAi.isPending && draftAi.variables?.scope === 'n8n'}
                  isDisabled={draftAi.isPending}
                  status={aiStatus && <AiJobStatus text={aiStatus} startedAt={aiStartedAt} />}
                />
              )}
              {section === 'crm' && (
                <CrmSection
                  crm={draft.crm}
                  onChange={(crm) => setDraft((prev) => ({ ...prev, crm }))}
                  onGenerate={confirmGenerateCrm}
                  isGenerating={draftAi.isPending && draftAi.variables?.scope === 'crm'}
                  reviseAction={draft.crm.boards.length ? revise.button({ kind: 'section', section: 'crm' }) : undefined}
                  revisePreview={revise.preview({ kind: 'section', section: 'crm' })}
                />
              )}
              {section === 'agent' && (
              <>
              <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
                <ReviseHeading title="AI Agent Behavior" action={revise.button({ kind: 'section', section: 'agent' })} />
                {revise.preview({ kind: 'section', section: 'agent' })}
                <ReviseField label="AI Agent Behavior" action={revise.button({ kind: 'field', field: 'agentBehavior' }, { iconOnly: true })} preview={revise.preview({ kind: 'field', field: 'agentBehavior' })}>
                  <Textarea aria-label="AI Agent Behavior" rows={6} value={draft.agentBehavior} onChange={(e) => setDraft((prev) => ({ ...prev, agentBehavior: e.target.value }))} />
                </ReviseField>
                <ReviseField label="Welcome Message" action={revise.button({ kind: 'field', field: 'welcomeMessage' }, { iconOnly: true })} preview={revise.preview({ kind: 'field', field: 'welcomeMessage' })}>
                  <Textarea aria-label="Welcome Message" rows={4} value={draft.welcomeMessage} onChange={(e) => setDraft((prev) => ({ ...prev, welcomeMessage: e.target.value }))} />
                </ReviseField>
                <WelcomeImagePicker value={draft.welcomeImage ?? null} pocName={name || selected.name} onChange={(welcomeImage) => setDraft((prev) => ({ ...prev, welcomeImage }))} />
                <ReviseField label="Agent Transfer Conditions" action={revise.button({ kind: 'field', field: 'agentTransferConditions' }, { iconOnly: true })} preview={revise.preview({ kind: 'field', field: 'agentTransferConditions' })}>
                  <Textarea aria-label="Agent Transfer Conditions" rows={4} value={draft.agentTransferConditions} onChange={(e) => setDraft((prev) => ({ ...prev, agentTransferConditions: e.target.value }))} />
                </ReviseField>
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
                <ReviseHeading title="AI Action — Labels" action={revise.button({ kind: 'section', section: 'labels' })} />
                {revise.preview({ kind: 'section', section: 'labels' })}
                {draft.labels.map((label, index) => (
                  <div key={`label-${index}`} className="grid gap-3 rounded-lg border border-line bg-panel p-3 md:grid-cols-[1fr_1.5fr_auto]">
                    <Input value={label.name} onChange={(e) => setDraft((prev) => ({ ...prev, labels: prev.labels.map((item, i) => i === index ? { ...item, name: e.target.value } : item) }))} maxLength={POC_LABEL_MAX_CHARS} placeholder="Label name" />
                    <Input value={label.condition} onChange={(e) => setDraft((prev) => ({ ...prev, labels: prev.labels.map((item, i) => i === index ? { ...item, condition: e.target.value } : item) }))} maxLength={POC_LABEL_MAX_CHARS} placeholder="When this label should be attached" />
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
                <ReviseHeading title="Conversation Pipeline" action={revise.button({ kind: 'section', section: 'pipeline' })} />
                {revise.preview({ kind: 'section', section: 'pipeline' })}
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
                <ReviseHeading title="Knowledge Base" action={revise.button({ kind: 'section', section: 'knowledgeBase' })} />
                {revise.preview({ kind: 'section', section: 'knowledgeBase' })}
                <div className="space-y-3">
                  <h5 className="text-sm font-semibold uppercase tracking-wide text-muted">Static text</h5>
                  {draft.knowledgeBase.textSections.map((section, index) => (
                    <div key={`kb-section-${index}`} className="grid gap-3 rounded-lg border border-line bg-panel p-3">
                      <Input value={section.title} onChange={(e) => setDraft((prev) => ({ ...prev, knowledgeBase: { ...prev.knowledgeBase, textSections: prev.knowledgeBase.textSections.map((item, i) => i === index ? { ...item, title: e.target.value } : item) } }))} placeholder="Section title" />
                      <ReviseField label="Content" action={revise.button({ kind: 'field', field: 'kbTextContent', index }, { iconOnly: true })} preview={revise.preview({ kind: 'field', field: 'kbTextContent', index })}>
                        <Textarea aria-label="Static knowledge text" rows={3} value={section.content} onChange={(e) => setDraft((prev) => ({ ...prev, knowledgeBase: { ...prev.knowledgeBase, textSections: prev.knowledgeBase.textSections.map((item, i) => i === index ? { ...item, content: e.target.value } : item) } }))} placeholder="Static knowledge text" />
                      </ReviseField>
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
                      <ReviseField label="Answer" action={revise.button({ kind: 'field', field: 'qnaAnswer', index }, { iconOnly: true })} preview={revise.preview({ kind: 'field', field: 'qnaAnswer', index })}>
                        <Textarea aria-label="Answer" rows={3} value={item.answer} onChange={(e) => setDraft((prev) => ({ ...prev, knowledgeBase: { ...prev.knowledgeBase, qna: prev.knowledgeBase.qna.map((q, i) => i === index ? { ...q, answer: e.target.value } : q) } }))} placeholder="Answer" />
                      </ReviseField>
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
                <ReviseHeading title="API Integrations" action={revise.button({ kind: 'section', section: 'apiIntegrations' })} />
                {revise.preview({ kind: 'section', section: 'apiIntegrations' })}
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
                    <ReviseField label="Description" action={revise.button({ kind: 'field', field: 'apiDescription', index }, { iconOnly: true })} preview={revise.preview({ kind: 'field', field: 'apiDescription', index })}>
                      <Textarea aria-label="Description" rows={3} value={integration.description} onChange={(e) => updateIntegrationValue(setDraft, index, { description: e.target.value })} placeholder="When this tool should be used in the conversation" />
                    </ReviseField>
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
                    <div className="flex flex-wrap items-start justify-end gap-2">
                      <CopyButton text={curlForIntegration(integration)} label="Copy cURL" title="cURL to the Cekat webhook with a sample body from the AI Input Schema — paste it into Postman (Import → Raw text) or a terminal" />
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

              <AiActionsPromptCard prompt={aiActionsPrompt(draft)} />

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

/** Every AI action with its condition in one field, so the whole thing can be pasted into Cekat at once. */
function AiActionsPromptCard({ prompt }: { prompt: string }) {
  return (
    <div className="space-y-3 rounded-lg border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-display text-base font-semibold">AI Actions Prompt</h4>
          <p className="text-xs text-muted">Every AI action → its condition (labels, pipeline, tools, handoff). Updates as you edit the sections above.</p>
        </div>
        <CopyButton text={prompt} label="Copy all" />
      </div>
      <Textarea rows={10} readOnly value={prompt} placeholder="Add labels, pipeline statuses or API integrations to build the prompt." className="font-mono text-xs" />
    </div>
  )
}
