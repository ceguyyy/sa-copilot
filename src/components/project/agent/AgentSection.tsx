import { CopyButton } from '../../CopyButton'
import { Textarea } from '../../ui'
import type { SetPocDraft } from '../pocConfig'
import type { PocRevise } from '../usePocRevise'
import { aiActionsPrompt } from '../../../../shared/pocActions.ts'
import type { PocConfig } from '../../../lib/types'
import { AdditionalSettingsCard } from './AdditionalSettingsCard'
import { ApiIntegrationsCard } from './ApiIntegrationsCard'
import { BehaviorCard } from './BehaviorCard'
import { KnowledgeBaseCard } from './KnowledgeBaseCard'
import { LabelsCard } from './LabelsCard'
import { PipelineCard } from './PipelineCard'

type Props = {
  draft: PocConfig
  setDraft: SetPocDraft
  revise: PocRevise
  clientName: string
  pocName: string
  onJsonError: (error: string | null) => void
}

/** The "POC Agent" tab: everything that is set up on the Cekat AI agent itself. */
export function AgentSection({ draft, setDraft, revise, clientName, pocName, onJsonError }: Props) {
  return (
    <>
      <BehaviorCard draft={draft} setDraft={setDraft} revise={revise} pocName={pocName} />
      <LabelsCard labels={draft.labels} setDraft={setDraft} revise={revise} />
      <PipelineCard pipeline={draft.pipeline} setDraft={setDraft} revise={revise} />
      <KnowledgeBaseCard knowledgeBase={draft.knowledgeBase} setDraft={setDraft} revise={revise} />
      <ApiIntegrationsCard integrations={draft.apiIntegrations} setDraft={setDraft} revise={revise} clientName={clientName} onJsonError={onJsonError} />
      <AiActionsPromptCard prompt={aiActionsPrompt(draft)} />
      <AdditionalSettingsCard settings={draft.additionalSettings} setDraft={setDraft} />
    </>
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
