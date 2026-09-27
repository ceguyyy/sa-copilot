import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

export interface Column<R> {
  key: keyof R & string
  label: string
  width?: string
  type?: 'text' | 'textarea' | 'number' | 'checkbox' | 'select'
  options?: string[]
}

interface Props<R> {
  columns: Column<R>[]
  rows: R[]
  onChange: (rows: R[]) => void
  newRow: () => R
  readOnly?: boolean
  /** Extra cells rendered after the editable ones (e.g. computed dates, Gantt). */
  trailing?: { header: ReactNode; width?: string; cell: (row: R, index: number) => ReactNode }
}

const cellInput = 'w-full resize-y bg-transparent px-2 py-1.5 text-sm focus:bg-paper focus:outline-none'

export function TableEditor<R>({ columns, rows, onChange, newRow, readOnly, trailing }: Props<R>) {
  const update = (i: number, key: keyof R, value: unknown) => onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  const insertAt = (i: number) => onChange([...rows.slice(0, i), newRow(), ...rows.slice(i)])
  const removeAt = (i: number) => onChange(rows.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-panel">
      <table className="w-full min-w-[960px] table-fixed border-collapse text-left">
        <thead>
          <tr className="bg-forest text-paper">
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width }} className="px-2 py-2 text-xs font-semibold tracking-wide whitespace-nowrap uppercase">
                {c.label}
              </th>
            ))}
            {trailing && (
              <th style={{ width: trailing.width }} className="px-2 py-2 text-xs font-semibold uppercase">
                {trailing.header}
              </th>
            )}
            {!readOnly && <th className="w-24" aria-label="Row actions" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="group border-t border-line align-top hover:bg-forest-soft/40">
              {columns.map((c) => (
                <td key={c.key} className="border-r border-line/60 last:border-r-0">
                  <Cell column={c} value={row[c.key]} readOnly={readOnly} onChange={(v) => update(i, c.key, v)} />
                </td>
              ))}
              {trailing && <td className="px-2 py-1.5">{trailing.cell(row, i)}</td>}
              {!readOnly && (
                <td className="px-1 py-1">
                  <div className="flex opacity-40 transition group-hover:opacity-100">
                    <IconBtn label="Move up" onClick={() => move(i, -1)}>
                      <ArrowUp className="size-3.5" />
                    </IconBtn>
                    <IconBtn label="Move down" onClick={() => move(i, 1)}>
                      <ArrowDown className="size-3.5" />
                    </IconBtn>
                    <IconBtn label="Insert row below" onClick={() => insertAt(i + 1)}>
                      <Plus className="size-3.5" />
                    </IconBtn>
                    <IconBtn label="Delete row" danger onClick={() => removeAt(i)}>
                      <Trash2 className="size-3.5" />
                    </IconBtn>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <button onClick={() => insertAt(rows.length)} className="flex w-full items-center justify-center gap-1 border-t border-dashed border-line py-2 text-xs text-muted hover:text-forest">
          <Plus className="size-3.5" /> Add row
        </button>
      )}
    </div>
  )
}

function Cell<R>({ column, value, readOnly, onChange }: { column: Column<R>; value: unknown; readOnly?: boolean; onChange: (v: unknown) => void }) {
  if (column.type === 'checkbox') {
    return (
      <div className="flex justify-center py-2">
        <input type="checkbox" aria-label={column.label} checked={!!value} disabled={readOnly} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--ember)]" />
      </div>
    )
  }
  if (readOnly) return <div className="px-2 py-1.5 text-sm whitespace-pre-wrap">{String(value ?? '')}</div>
  if (column.type === 'number') {
    return (
      <input
        type="number"
        min={0}
        step={0.5}
        aria-label={column.label}
        value={Number(value ?? 0)}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        className={`${cellInput} font-mono`}
      />
    )
  }
  if (column.type === 'select') {
    return (
      <select aria-label={column.label} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={cellInput}>
        {column.options?.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    )
  }
  const text = String(value ?? '')
  return (
    <textarea
      aria-label={column.label}
      value={text}
      rows={Math.min(8, Math.max(1, Math.ceil(text.length / 48), text.split('\n').length))}
      onChange={(e) => onChange(e.target.value)}
      className={cellInput}
    />
  )
}

function IconBtn({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`rounded p-1 ${danger ? 'hover:text-bad' : 'hover:text-forest'}`}>
      {children}
    </button>
  )
}
