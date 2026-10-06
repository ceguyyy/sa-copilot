import type { ReactNode } from 'react'
import { FlaskConical } from 'lucide-react'
import { prepareQaRun, runQaRun } from '../../../lib/ai'
import { qaRunsApi } from '../../../lib/api'
import { type QaAdapter, QaRunner } from './QaRunner'

type Props = {
  pocId: string
  pocName: string
  livechatUrl: string
  onLivechatUrlChange: (url: string) => void
  hasHappyCases: boolean
  /** Prepare reads the saved POC, so unsaved happy-case edits would be missed. */
  hasUnsavedChanges: boolean
  onRevise: (instruction: string) => void
  isReviseDisabled: boolean
  revisePreview: ReactNode
}

/** QA for the POC AI Agent: play its happy cases on the Cekat livechat, judge them with AI, report and revise. */
export function QaSection({ pocId, pocName, livechatUrl, onLivechatUrlChange, hasHappyCases, hasUnsavedChanges, onRevise, isReviseDisabled, revisePreview }: Props) {
  const adapter: QaAdapter = {
    queryKey: ['qa-runs', pocId],
    prepare: (url, handlers) => prepareQaRun({ pocId, livechatUrl: url }, handlers),
    run: (params, handlers) => runQaRun({ pocId, ...params }, handlers),
    listRuns: () => qaRunsApi.list(pocId),
    setActionCheck: qaRunsApi.setActionCheck,
    removeRun: qaRunsApi.remove,
  }

  return (
    <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
      <div>
        <h5 className="flex items-center gap-2 font-display text-base font-semibold">
          <FlaskConical className="size-4" /> QA AI Agent on the livechat
        </h5>
        <p className="text-xs text-muted">Plays the happy cases as a customer on the Cekat Web Livechat (Playwright, Edge/Chrome), then AI judges every reply, summarises and writes a revision prompt.</p>
      </div>
      <QaRunner
        adapter={adapter}
        reportTitle={pocName}
        livechatUrl={livechatUrl}
        onLivechatUrlChange={onLivechatUrlChange}
        prepareBlocker={hasHappyCases ? undefined : 'Generate happy cases first (Flow & Happy Case).'}
        prepareWarning={hasUnsavedChanges ? 'Prepare uses the saved happy cases; unsaved edits are not included. Continue?' : undefined}
        revise={{ onRevise, isDisabled: isReviseDisabled, preview: revisePreview }}
      />
    </div>
  )
}
