import { Pencil, Plus, Trash2 } from 'lucide-react'
import { hasOptions } from '../../../../shared/pocCrm.ts'
import type { CrmBoard, CrmColumn } from '../../../lib/types'
import { AddColumnMenu } from './AddColumnMenu'
import { optionStyle } from './columnStyle'
import { ColumnTypeIcon } from './columnTypes'
import type { CrmColumnType } from '../../../lib/types'

type Props = {
  board: CrmBoard
  selectedColumn: string | null
  onSelectColumn: (key: string) => void
  onAddColumn: (type: CrmColumnType) => void
  onCellChange: (row: number, key: string, value: string) => void
  onAddRow: () => void
  onRemoveRow: (row: number) => void
}

const CELL = 'h-9 w-full min-w-36 bg-transparent px-3 text-sm outline-none focus:bg-paper focus:ring-2 focus:ring-inset focus:ring-forest'

function Cell({ column, value, onChange }: { column: CrmColumn; value: string; onChange: (value: string) => void }) {
  const label = column.name || 'cell'
  if (hasOptions(column.type)) {
    const index = column.options.findIndex((o) => o.label === value)
    return (
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${CELL} text-center`} style={index >= 0 ? optionStyle(index) : undefined}>
        <option value="">—</option>
        {column.options.filter((o) => o.label).map((o) => (
          <option key={o.label} value={o.label}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }
  if (column.type === 'checkbox') {
    return (
      <div className="flex h-9 items-center justify-center">
        <input aria-label={label} type="checkbox" checked={value === 'true'} onChange={(e) => onChange(e.target.checked ? 'true' : 'false')} />
      </div>
    )
  }
  const inputType = column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : column.type === 'email' ? 'email' : 'text'
  return <input aria-label={label} type={inputType} value={value} onChange={(e) => onChange(e.target.value)} className={CELL} />
}

/** Spreadsheet-style editor of a CRM board: typed column headers, editable cells, "+ Add new item". */
export function BoardTable({ board, selectedColumn, onSelectColumn, onAddColumn, onCellChange, onAddRow, onRemoveRow }: Props) {
  const width = board.columns.length + 2

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-panel">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className="w-12 border-r border-line" />
            {board.columns.map((c) => (
              <th key={c.key} className={`border-r border-line p-0 font-medium ${selectedColumn === c.key ? 'bg-forest-soft' : ''}`}>
                <button
                  type="button"
                  onClick={() => onSelectColumn(c.key)}
                  title="Column settings"
                  className="group flex w-full min-w-36 items-center justify-center gap-2 px-3 py-2 text-ink hover:bg-paper"
                >
                  <ColumnTypeIcon type={c.type} size="sm" />
                  <span className="truncate">{c.name || 'Untitled'}</span>
                  {board.kanbanColumn === c.key && <span className="rounded bg-paper px-1 font-mono text-[10px] uppercase text-muted">kanban</span>}
                  <Pencil className="size-3 opacity-0 group-hover:opacity-60" />
                </button>
              </th>
            ))}
            <th className="p-0">
              <AddColumnMenu onAdd={onAddColumn} />
            </th>
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row, r) => (
            <tr key={`row-${r}`} className="group border-b border-line">
              <td className="border-r border-line text-center">
                <span className="font-mono text-[11px] text-muted group-hover:hidden">{r + 1}</span>
                <button type="button" aria-label={`Delete item ${r + 1}`} onClick={() => onRemoveRow(r)} className="hidden p-1 text-muted hover:text-bad group-hover:inline-flex">
                  <Trash2 className="size-3.5" />
                </button>
              </td>
              {board.columns.map((c) => (
                <td key={c.key} className="border-r border-line p-0">
                  <Cell column={c} value={row[c.key] ?? ''} onChange={(v) => onCellChange(r, c.key, v)} />
                </td>
              ))}
              <td />
            </tr>
          ))}
          <tr>
            <td colSpan={width} className="p-0">
              <button type="button" onClick={onAddRow} disabled={!board.columns.length} className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted hover:text-ink disabled:opacity-50">
                <Plus className="size-4" /> Add new item
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="border-t border-line px-3 py-1.5 text-xs text-muted">Total Items: {board.rows.length}</p>
    </div>
  )
}
