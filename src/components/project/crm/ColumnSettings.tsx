import { ArrowLeft, ArrowRight, Plus, Trash2, X } from 'lucide-react'
import { CRM_COLUMN_LABELS, CRM_COLUMN_TYPES, hasOptions } from '../../../../shared/pocCrm.ts'
import type { CrmColumn, CrmColumnType, CrmOption } from '../../../lib/types'
import { Button, Field, Input, Select } from '../../ui'
import { optionStyle } from './columnStyle'

type Props = {
  column: CrmColumn
  isKanban: boolean
  isFirst: boolean
  isLast: boolean
  onChange: (column: CrmColumn) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  onUseForKanban: () => void
  onClose: () => void
}

/** Settings of the selected column: name, type, and for Select/Dropdown the options (kanban lanes) with their conditions. */
export function ColumnSettings({ column, isKanban, isFirst, isLast, onChange, onMove, onRemove, onUseForKanban, onClose }: Props) {
  const setOptions = (options: CrmOption[]) => onChange({ ...column, options })
  const setOption = (index: number, patch: Partial<CrmOption>) => setOptions(column.options.map((o, i) => (i === index ? { ...o, ...patch } : o)))

  return (
    <div className="space-y-3 rounded-lg border border-forest/40 bg-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-sm font-semibold">Column settings</h5>
        <div className="flex gap-1">
          <Button variant="ghost" aria-label="Move column left" icon={<ArrowLeft className="size-4" />} disabled={isFirst} onClick={() => onMove(-1)} />
          <Button variant="ghost" aria-label="Move column right" icon={<ArrowRight className="size-4" />} disabled={isLast} onClick={() => onMove(1)} />
          <Button variant="ghost" aria-label="Delete column" icon={<Trash2 className="size-4" />} onClick={onRemove} />
          <Button variant="ghost" aria-label="Close column settings" icon={<X className="size-4" />} onClick={onClose} />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Column name">
          <Input value={column.name} onChange={(e) => onChange({ ...column, name: e.target.value })} />
        </Field>
        <Field label="Type">
          <Select value={column.type} onChange={(e) => onChange({ ...column, type: e.target.value as CrmColumnType })}>
            {CRM_COLUMN_TYPES.map((t) => (
              <option key={t} value={t}>
                {CRM_COLUMN_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {hasOptions(column.type) && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={isKanban} onChange={onUseForKanban} />
            Group the kanban by this column (options = kanban lanes)
          </label>
          <ol className="space-y-2">
            {column.options.map((option, i) => (
              <li key={`opt-${i}`} className="grid items-center gap-2 md:grid-cols-[auto_minmax(0,2fr)_minmax(0,3fr)_auto]">
                <span className="w-7 rounded-md bg-paper py-1 text-center font-mono text-xs text-muted" title={`n8n sends ${i} for this option when it creates or updates a CRM item (zero-based)`}>
                  {i}
                </span>
                <Input aria-label={`Option ${i + 1}`} value={option.label} onChange={(e) => setOption(i, { label: e.target.value })} placeholder="Option" style={optionStyle(i)} />
                <Input
                  aria-label={`Option ${i + 1} condition`}
                  value={i === 0 ? '' : option.condition}
                  disabled={i === 0}
                  onChange={(e) => setOption(i, { condition: e.target.value })}
                  placeholder={i === 0 ? 'Starting option' : 'When an item moves into this option'}
                />
                <Button variant="ghost" aria-label={`Remove option ${i + 1}`} icon={<Trash2 className="size-4" />} onClick={() => setOptions(column.options.filter((_, x) => x !== i))} />
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted">n8n fills this column with the option number (left), not the label — e.g. Invoice, PO, Delivery → 0, 1, 2 (the first option is 0). Reordering options changes the numbers.</p>
          <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setOptions([...column.options, { label: '', condition: '' }])}>
            Add option
          </Button>
        </div>
      )}
    </div>
  )
}
