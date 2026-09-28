import { kanbanLanes } from '../../../../shared/pocCrm.ts'
import type { CrmBoard } from '../../../lib/types'
import { optionStyle } from './columnStyle'

const DETAIL_FIELDS = 3

/** Kanban view of a board: one lane per option of the kanban column; each item is a card titled by the first column. */
export function BoardKanban({ board }: { board: CrmBoard }) {
  const lanes = kanbanLanes(board)
  if (!lanes.length) {
    return <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">Add a Select or Dropdown column (e.g. Status) and group the kanban by it to see this view.</p>
  }
  const [titleColumn, ...rest] = board.columns.filter((c) => c.key !== board.kanbanColumn)
  const kanbanOptions = board.columns.find((c) => c.key === board.kanbanColumn)?.options ?? []

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {lanes.map((lane) => {
        const optionIndex = kanbanOptions.findIndex((o) => o.label === lane.label)
        return (
          <section key={lane.label || 'none'} aria-label={lane.label || 'Untitled lane'} className="flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-paper p-2">
            <header className="flex items-center justify-between gap-2 px-1">
              <span className="truncate rounded-full px-2 py-0.5 text-sm font-semibold" style={optionIndex >= 0 ? optionStyle(optionIndex) : undefined}>
                {lane.label || 'Untitled'}
              </span>
              <span className="font-mono text-[11px] text-muted">{lane.rowIndexes.length}</span>
            </header>
            {lane.condition && <p className="px-1 text-[11px] leading-snug text-muted">{lane.condition}</p>}
            {lane.rowIndexes.map((r) => {
              const row = board.rows[r]
              const details = rest.filter((c) => row[c.key]).slice(0, DETAIL_FIELDS)
              return (
                <article key={r} className="space-y-1 rounded-md border border-line bg-panel p-2 shadow-sm">
                  <p className="truncate text-sm font-medium">{(titleColumn && row[titleColumn.key]) || 'Untitled item'}</p>
                  {details.map((c) => (
                    <p key={c.key} className="truncate text-xs text-muted">
                      <span className="text-ink/70">{c.name}:</span> {row[c.key] === 'true' ? '✓' : row[c.key] === 'false' ? '✗' : row[c.key]}
                    </p>
                  ))}
                </article>
              )
            })}
            {lane.rowIndexes.length === 0 && <p className="rounded-md border border-dashed border-line p-3 text-center text-xs text-muted">No items</p>}
          </section>
        )
      })}
    </div>
  )
}
