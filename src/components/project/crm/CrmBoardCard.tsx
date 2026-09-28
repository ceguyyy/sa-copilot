import { Download, ExternalLink, Kanban, Maximize2, Minimize2, Table, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { boardDrawioXml, boardSvg } from '../../../../shared/crmBoardExport.ts'
import { drawioUrl } from '../../../../shared/drawio.ts'
import { downloadBlob, slugify } from '../../../lib/download'
import { CRM_COLUMN_LABELS, hasOptions, nextColumnKey } from '../../../../shared/pocCrm.ts'
import type { CrmBoard, CrmColumn, CrmColumnType } from '../../../lib/types'
import { Button, Input, Textarea } from '../../ui'
import { BoardKanban } from './BoardKanban'
import { BoardTable } from './BoardTable'
import { ColumnSettings } from './ColumnSettings'

type Props = {
  board: CrmBoard
  onChange: (board: CrmBoard) => void
  onRemove: () => void
}

type View = 'table' | 'kanban'

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** One CRM board: its data as a table, and the same data as a kanban grouped by the kanban column. */
export function CrmBoardCard({ board, onChange, onRemove }: Props) {
  const [view, setView] = useState<View>('table')
  const [selected, setSelected] = useState<string | null>(null)
  const [isFull, setIsFull] = useState(false)

  useEffect(() => {
    if (!isFull) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsFull(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isFull])

  const fileName = `${slugify(board.name || 'crm-board')}-${view}`
  const downloadSvg = () => downloadBlob(new Blob([boardSvg(board, view)], { type: 'image/svg+xml' }), `${fileName}.svg`)
  const openDrawio = async () => window.open(await drawioUrl(boardDrawioXml(board, view), { type: 'xml' }), '_blank', 'noopener,noreferrer')
  const selectedIndex = board.columns.findIndex((c) => c.key === selected)
  const selectedColumn = selectedIndex >= 0 ? board.columns[selectedIndex] : null

  const addColumn = (type: CrmColumnType) => {
    const column: CrmColumn = { key: nextColumnKey(board.columns), name: CRM_COLUMN_LABELS[type], type, options: [] }
    const needsKanban = hasOptions(type) && !board.kanbanColumn
    onChange({ ...board, columns: [...board.columns, column], kanbanColumn: needsKanban ? column.key : board.kanbanColumn })
    setSelected(column.key)
  }

  const updateColumn = (column: CrmColumn) => {
    const columns = board.columns.map((c) => (c.key === column.key ? column : c))
    // A column that lost its options can no longer drive the kanban.
    const kanbanColumn = board.kanbanColumn === column.key && !hasOptions(column.type) ? (columns.find((c) => hasOptions(c.type))?.key ?? '') : board.kanbanColumn
    onChange({ ...board, columns, kanbanColumn })
  }

  const removeColumn = (key: string) => {
    const columns = board.columns.filter((c) => c.key !== key)
    const rows = board.rows.map(({ [key]: _removed, ...rest }) => rest)
    const kanbanColumn = board.kanbanColumn === key ? (columns.find((c) => hasOptions(c.type))?.key ?? '') : board.kanbanColumn
    onChange({ ...board, columns, rows, kanbanColumn })
    setSelected(null)
  }

  const setCell = (row: number, key: string, value: string) =>
    onChange({ ...board, rows: board.rows.map((r, i) => (i === row ? { ...r, [key]: value } : r)) })

  const card = (
    <div
      role={isFull ? 'dialog' : undefined}
      aria-modal={isFull || undefined}
      aria-label={isFull ? `${board.name || 'CRM board'} — full screen` : undefined}
      className={isFull ? 'fixed inset-0 z-50 space-y-3 overflow-auto bg-paper p-6' : 'space-y-3 rounded-lg border border-line bg-paper p-3'}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Input aria-label="Board name" value={board.name} onChange={(e) => onChange({ ...board, name: e.target.value })} placeholder="Board name, e.g. Leads KPR" className="font-display text-base font-semibold" />
          <Textarea aria-label="Board description" rows={1} value={board.description} onChange={(e) => onChange({ ...board, description: e.target.value })} placeholder="What this board tracks" />
        </div>
        <div role="tablist" aria-label="Board view" className="flex rounded-md border border-line bg-panel p-0.5">
          {(['table', 'kanban'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-sm capitalize ${view === v ? 'bg-forest text-white' : 'text-muted hover:text-ink'}`}
            >
              {v === 'table' ? <Table className="size-4" /> : <Kanban className="size-4" />}
              {v}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" icon={isFull ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />} onClick={() => setIsFull((v) => !v)}>
            {isFull ? 'Exit' : 'Full screen'}
          </Button>
          <Button variant="ghost" icon={<Download className="size-4" />} onClick={downloadSvg} title={`Download the ${view} view as SVG`}>
            SVG
          </Button>
          <Button variant="ghost" icon={<ExternalLink className="size-4" />} onClick={openDrawio} title={`Open the ${view} view in draw.io`}>
            draw.io
          </Button>
        </div>
        <Button variant="ghost" aria-label={`Remove board ${board.name}`} icon={<Trash2 className="size-4" />} onClick={() => confirm(`Remove board "${board.name || 'Untitled'}"?`) && onRemove()} />
      </div>

      {view === 'table' ? (
        <>
          <BoardTable
            board={board}
            selectedColumn={selected}
            onSelectColumn={(key) => setSelected((s) => (s === key ? null : key))}
            onAddColumn={addColumn}
            onCellChange={setCell}
            onAddRow={() => onChange({ ...board, rows: [...board.rows, {}] })}
            onRemoveRow={(row) => onChange({ ...board, rows: board.rows.filter((_, i) => i !== row) })}
          />
          {selectedColumn && (
            <ColumnSettings
              column={selectedColumn}
              isKanban={board.kanbanColumn === selectedColumn.key}
              isFirst={selectedIndex === 0}
              isLast={selectedIndex === board.columns.length - 1}
              onChange={updateColumn}
              onMove={(d) => onChange({ ...board, columns: moveItem(board.columns, selectedIndex, selectedIndex + d) })}
              onRemove={() => removeColumn(selectedColumn.key)}
              onUseForKanban={() => onChange({ ...board, kanbanColumn: selectedColumn.key })}
              onClose={() => setSelected(null)}
            />
          )}
        </>
      ) : (
        <BoardKanban board={board} />
      )}
    </div>
  )
  // Full screen renders on <body> so no transformed/overflowing ancestor clips the fixed overlay.
  return isFull ? createPortal(card, document.body) : card
}
