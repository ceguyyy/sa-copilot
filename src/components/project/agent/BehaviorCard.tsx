import { Textarea } from '../../ui'
import { ReviseField, ReviseHeading } from '../PocReviseParts'
import { WelcomeImagePicker } from '../WelcomeImagePicker'
import type { SetPocDraft } from '../pocConfig'
import type { PocRevise } from '../usePocRevise'
import type { PocConfig } from '../../../lib/types'

type Props = { draft: PocConfig; setDraft: SetPocDraft; revise: PocRevise; pocName: string }

/** Agent behavior, welcome message and image, and the handoff settings. */
export function BehaviorCard({ draft, setDraft, revise, pocName }: Props) {
  const set = (patch: Partial<PocConfig>) => setDraft((prev) => ({ ...prev, ...patch }))

  return (
    <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
      <ReviseHeading title="AI Agent Behavior" action={revise.button({ kind: 'section', section: 'agent' })} />
      {revise.preview({ kind: 'section', section: 'agent' })}
      <ReviseField label="AI Agent Behavior" action={revise.button({ kind: 'field', field: 'agentBehavior' }, { iconOnly: true })} preview={revise.preview({ kind: 'field', field: 'agentBehavior' })}>
        <Textarea aria-label="AI Agent Behavior" rows={6} value={draft.agentBehavior} onChange={(e) => set({ agentBehavior: e.target.value })} />
      </ReviseField>
      <ReviseField label="Welcome Message" action={revise.button({ kind: 'field', field: 'welcomeMessage' }, { iconOnly: true })} preview={revise.preview({ kind: 'field', field: 'welcomeMessage' })}>
        <Textarea aria-label="Welcome Message" rows={4} value={draft.welcomeMessage} onChange={(e) => set({ welcomeMessage: e.target.value })} />
      </ReviseField>
      <WelcomeImagePicker value={draft.welcomeImage ?? null} pocName={pocName} onChange={(welcomeImage) => set({ welcomeImage })} />
      <ReviseField label="Agent Transfer Conditions" action={revise.button({ kind: 'field', field: 'agentTransferConditions' }, { iconOnly: true })} preview={revise.preview({ kind: 'field', field: 'agentTransferConditions' })}>
        <Textarea aria-label="Agent Transfer Conditions" rows={4} value={draft.agentTransferConditions} onChange={(e) => set({ agentTransferConditions: e.target.value })} />
      </ReviseField>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex items-center gap-2 rounded-lg border border-line bg-panel p-3 text-sm">
          <input type="checkbox" checked={draft.stopAiAfterHandoff} onChange={(e) => set({ stopAiAfterHandoff: e.target.checked })} />
          Stop AI after handoff
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-line bg-panel p-3 text-sm">
          <input type="checkbox" checked={draft.silentAgentHandoff} onChange={(e) => set({ silentAgentHandoff: e.target.checked })} />
          Silent agent handoff
        </label>
      </div>
    </div>
  )
}
