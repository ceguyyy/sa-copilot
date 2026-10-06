import { useMemo, useState } from 'react'
import { FileJson, History, Save, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, ErrorNote, Field, Input } from '../ui'
import { AiDraftButton } from '../AiDraftButton'
import { AiJobStatus } from '../AiJobStatus'
import { draftPoc, type PocDraftScope } from '../../lib/ai'
import type { AiRunOptions } from '../../lib/useOutputLimit'
import { pocsApi, pocVersionsApi } from '../../lib/api'
import { downloadBlob, slugify } from '../../lib/download'
import { sanitizePocExport } from '../../lib/pocExport'
import { useResetState } from '../../lib/useResetState'
import { CrmSection } from './crm/CrmSection'
import { PocFlowSection } from './PocFlowSection'
import { PocN8nSection } from './PocN8nSection'
import { PocHistory } from './PocHistory'
import { ChatFlowSection } from './chatflow/ChatFlowSection'
import { QaSection } from './qa/QaSection'
import { AgentSection } from './agent/AgentSection'
import { usePocRevise } from './usePocRevise'
import { emptyConfig, normalizeConfig, POC_SECTIONS, type PocSection } from './pocConfig'
import type { PocRow } from '../../lib/types'

type Props = {
  poc: PocRow
  projectId: string
  clientName: string
  section: PocSection
  onSectionChange: (section: PocSection) => void
}

/** Edits one POC. Every new server copy of it (save, AI draft, restore) replaces the working draft. */
export function PocEditor({ poc, projectId, clientName, section, onSectionChange }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useResetState(poc, () => poc.name, '')
  const [draft, setDraft] = useResetState(poc, () => normalizeConfig(structuredClone(poc.config)), emptyConfig())
  const [note, setNote] = useResetState(poc, () => '', '')
  const [jsonError, setJsonError] = useResetState<string | null>(poc, () => null, null)
  const [showHistory, setShowHistory] = useState(false)
  const [aiStatus, setAiStatus] = useState('')
  const [aiStartedAt, setAiStartedAt] = useState(0)
  const pocName = name || poc.name

  const refreshPoc = () => Promise.all([qc.invalidateQueries({ queryKey: ['pocs', projectId] }), qc.invalidateQueries({ queryKey: ['poc-versions', poc.id] })])

  const save = useMutation({
    mutationFn: async () => {
      const next = structuredClone(draft)
      await pocsApi.update(poc.id, { name, config: next })
      await pocVersionsApi.create(poc.id, next, 'manual', note.trim() || 'Manual edit')
      await refreshPoc()
    },
  })

  const draftAi = useMutation({
    mutationFn: async ({ scope, instruction, maxTokens }: { scope: PocDraftScope; instruction: string; maxTokens?: number }) => {
      setAiStartedAt(Date.now())
      setAiStatus('Reading project sources…')
      const what = { all: 'POC', crm: 'CRM structure', flow: 'flowchart & happy cases', n8n: 'n8n workflows', chatFlow: 'POC Flow' }[scope]
      await draftPoc(
        { pocId: poc.id, scope, instruction: instruction || undefined, maxTokens },
        {
          onProgress: (c, parts) => setAiStatus(`Writing ${what}… ${c.toLocaleString()} chars${parts ? ` · ${parts.done}/${parts.total} done` : ''}`),
          onTool: setAiStatus,
        },
      )
      await refreshPoc()
    },
    onSettled: () => setAiStatus(''),
  })

  const remove = useMutation({
    mutationFn: async () => {
      await pocsApi.remove(poc.id)
      await qc.invalidateQueries({ queryKey: ['pocs', projectId] })
    },
  })

  const revise = usePocRevise({
    pocId: poc.id,
    draft,
    setDraft,
    resetKey: `${poc.id}:${poc.updated_at}`,
    isDisabled: draftAi.isPending,
  })

  const runDraftAi = (scope: PocDraftScope, question: string | null) => (instruction: string, { maxTokens }: AiRunOptions) => {
    if (question && !confirm(question)) return
    draftAi.mutate({ scope, instruction, maxTokens })
  }

  const confirmDraftAi = (instruction: string, options: AiRunOptions) => {
    const hasContent = draft.agentBehavior.trim() || draft.welcomeMessage.trim() || draft.apiIntegrations.length || draft.labels.length
    runDraftAi('all', hasContent ? 'Draft with AI replaces every section of this POC (the current one stays in version history). Continue?' : null)(instruction, options)
  }
  const confirmGenerateCrm = (instruction: string, options: AiRunOptions) =>
    runDraftAi('crm', draft.crm.boards.length ? 'Generate CRM with AI replaces the CRM boards (the current POC stays in version history). Unsaved edits are lost — save first if needed. Continue?' : null)(instruction, options)
  const confirmGenerateFlow = (instruction: string, options: AiRunOptions) => {
    const replaces = draft.flow.mermaid || draft.flow.happyCases.length
    runDraftAi('flow', `Generate the flowchart and happy cases from the saved POC${replaces ? ' (replaces the current ones; the POC stays in version history)' : ''}. Unsaved edits are lost — save first if needed. Continue?`)(instruction, options)
  }
  const confirmGenerateN8n = (instruction: string, options: AiRunOptions) => {
    const replaces = draft.n8n.workflows.length ? ' (replaces the current workflows; the POC stays in version history)' : ''
    runDraftAi('n8n', `Generate the n8n workflows from the saved POC${replaces}. Unsaved edits are lost — save first if needed. Continue?`)(instruction, options)
  }
  const confirmGenerateChatFlow = (instruction: string, options: AiRunOptions) => {
    const replaces = draft.chatFlows.flows.length ? ' (replaces the current flows; the POC stays in version history)' : ''
    runDraftAi('chatFlow', `Generate the POC Flow from the saved POC${replaces}. Unsaved edits are lost — save first if needed. Continue?`)(instruction, options)
  }

  const actionError = save.error ?? draftAi.error ?? remove.error
  const hasUnsavedChanges = useMemo(
    () => name !== poc.name || JSON.stringify(draft) !== JSON.stringify(normalizeConfig(poc.config)),
    [poc, name, draft],
  )
  const isGenerating = (scope: PocDraftScope) => draftAi.isPending && draftAi.variables?.scope === scope
  const status = aiStatus && <AiJobStatus text={aiStatus} startedAt={aiStartedAt} />

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(sanitizePocExport(pocName || 'POC', draft), null, 2)], { type: 'application/json' })
    downloadBlob(blob, `${slugify(pocName || 'poc')}.poc.json`)
  }

  return (
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
          <AiDraftButton label="Draft with AI" isLoading={isGenerating('all')} isDisabled={draftAi.isPending} onRun={confirmDraftAi} />
          <Button variant={showHistory ? 'primary' : 'outline'} icon={<History className="size-4" />} aria-pressed={showHistory} onClick={() => setShowHistory((v) => !v)}>
            History
          </Button>
          <Button variant="outline" icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
          <Button variant="danger" icon={<Trash2 className="size-4" />} loading={remove.isPending} onClick={() => confirm(`Delete POC "${poc.name}"?`) && remove.mutate()}>
            Delete
          </Button>
        </div>
      </div>
      {status}
      {showHistory && <PocHistory pocId={poc.id} projectId={projectId} hasUnsavedChanges={hasUnsavedChanges} onClose={() => setShowHistory(false)} />}
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
            onClick={() => onSectionChange(t.id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${section === t.id ? 'border-forest text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {t.label}
            {t.disabled && <span className="rounded-full bg-paper px-1.5 font-mono text-[10px] uppercase">soon</span>}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {section === 'flow' && (
          <>
            <PocFlowSection
              flow={draft.flow}
              pocName={pocName}
              onChange={(flow) => setDraft((prev) => ({ ...prev, flow }))}
              onGenerate={confirmGenerateFlow}
              isGenerating={isGenerating('flow')}
              isDisabled={draftAi.isPending}
              status={status}
              reviseAction={draft.flow.mermaid || draft.flow.happyCases.length ? revise.button({ kind: 'section', section: 'flow' }) : undefined}
              revisePreview={revise.preview({ kind: 'section', section: 'flow' })}
            />
            <QaSection
              pocId={poc.id}
              pocName={pocName}
              livechatUrl={draft.livechatUrl}
              onLivechatUrlChange={(livechatUrl) => setDraft((prev) => ({ ...prev, livechatUrl }))}
              hasHappyCases={draft.flow.happyCases.length > 0}
              hasUnsavedChanges={hasUnsavedChanges}
              onRevise={(instruction) => revise.run({ kind: 'section', section: 'agent' }, instruction)}
              isReviseDisabled={revise.isBusy}
              revisePreview={revise.preview({ kind: 'section', section: 'agent' })}
            />
          </>
        )}
        {section === 'chatFlow' && (
          <ChatFlowSection
            chatFlows={draft.chatFlows}
            pocName={pocName}
            onChange={(chatFlows) => setDraft((prev) => ({ ...prev, chatFlows }))}
            onGenerate={confirmGenerateChatFlow}
            isGenerating={isGenerating('chatFlow')}
            isDisabled={draftAi.isPending}
            status={status}
          />
        )}
        {section === 'n8n' && (
          <PocN8nSection
            pocId={poc.id}
            n8n={draft.n8n}
            integrations={draft.apiIntegrations}
            clientName={clientName}
            pocName={pocName}
            onChange={(n8n) => setDraft((prev) => ({ ...prev, n8n }))}
            onGenerate={confirmGenerateN8n}
            isGenerating={isGenerating('n8n')}
            isDisabled={draftAi.isPending}
            status={status}
          />
        )}
        {section === 'crm' && (
          <CrmSection
            crm={draft.crm}
            onChange={(crm) => setDraft((prev) => ({ ...prev, crm }))}
            onGenerate={confirmGenerateCrm}
            isGenerating={isGenerating('crm')}
            reviseAction={draft.crm.boards.length ? revise.button({ kind: 'section', section: 'crm' }) : undefined}
            revisePreview={revise.preview({ kind: 'section', section: 'crm' })}
          />
        )}
        {section === 'agent' && (
          <AgentSection draft={draft} setDraft={setDraft} revise={revise} clientName={clientName} pocName={pocName} onJsonError={setJsonError} />
        )}

        <Field label="Version note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe what changed" />
        </Field>

        {jsonError && <ErrorNote error={jsonError} />}
      </div>
    </>
  )
}
