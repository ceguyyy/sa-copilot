import type { AiRunOptions } from '../../../lib/useOutputLimit'
import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import type { CrmBoard, PocCrm } from '../../../lib/types'
import { AiDraftButton } from '../../AiDraftButton'
import { Button } from '../../ui'
import { CrmBoardCard } from './CrmBoardCard'

type Props = {
  crm: PocCrm
  onChange: (crm: PocCrm) => void
  onGenerate: (instruction: string, options: AiRunOptions) => void
  isGenerating: boolean
  /** "Revise with AI" button and its diff preview (revises the boards on screen instead of regenerating). */
  reviseAction?: ReactNode
  revisePreview?: ReactNode
}

const newBoard = (): CrmBoard => ({
  name: '',
  description: '',
  columns: [
    { key: 'c1', name: 'Lead', type: 'text', options: [] },
    { key: 'c2', name: 'Status', type: 'select', options: [{ label: 'New Lead', condition: '' }] },
  ],
  rows: [],
  kanbanColumn: 'c2',
})

/** POC CRM tab: the Cekat CRM boards, each editable as a table and previewed as a kanban. */
export function CrmSection({ crm, onChange, onGenerate, isGenerating, reviseAction, revisePreview }: Props) {
  const setBoard = (index: number, board: CrmBoard) => onChange({ boards: crm.boards.map((b, i) => (i === index ? board : b)) })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-base font-semibold">CRM Structure</h4>
          <p className="max-w-xl text-sm text-muted">
            Each board is a table of typed columns and items. The kanban is the same data grouped by one Select column — its options are the lanes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {reviseAction}
          <AiDraftButton label="Generate CRM with AI" isLoading={isGenerating} placeholder="e.g. tambahkan board untuk follow-up pasien batal, kolom sumber lead…" onRun={onGenerate} />
        </div>
      </div>
      {revisePreview}
      {crm.boards.length === 0 && <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">No CRM board yet — add one or generate them with AI.</p>}
      {crm.boards.map((board, i) => (
        <CrmBoardCard key={`board-${i}`} board={board} onChange={(b) => setBoard(i, b)} onRemove={() => onChange({ boards: crm.boards.filter((_, x) => x !== i) })} />
      ))}
      <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => onChange({ boards: [...crm.boards, newBoard()] })}>
        Add CRM board
      </Button>
    </div>
  )
}
