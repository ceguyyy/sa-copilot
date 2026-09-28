import { Plus, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CRM_COLUMN_LABELS, CRM_COLUMN_TYPES } from '../../../../shared/pocCrm.ts'
import type { CrmColumnType } from '../../../lib/types'
import { ColumnTypeIcon } from './columnTypes'

type Props = {
  onAdd: (type: CrmColumnType) => void
}

/** "+ Add New Column" with the Cekat type picker: a searchable two-column grid of column types. */
export function AddColumnMenu({ onAdd }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setIsOpen(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setIsOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [isOpen])

  const query = search.trim().toLowerCase()
  const types = CRM_COLUMN_TYPES.filter((t) => !query || CRM_COLUMN_LABELS[t].toLowerCase().includes(query))

  const pick = (type: CrmColumnType) => {
    onAdd(type)
    setIsOpen(false)
    setSearch('')
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium text-ink hover:bg-paper"
      >
        <Plus className="size-4" /> Add New Column
      </button>
      {isOpen && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-72 rounded-lg border border-line bg-panel p-3 shadow-xl">
          <label className="mb-3 flex items-center gap-2 rounded-md border border-line px-2 py-1.5">
            <Search className="size-4 text-muted" />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search column type" className="w-full bg-transparent text-sm outline-none" />
          </label>
          <div className="grid grid-cols-2 gap-1">
            {types.map((t) => (
              <button key={t} type="button" role="menuitem" onClick={() => pick(t)} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-paper">
                <ColumnTypeIcon type={t} />
                {CRM_COLUMN_LABELS[t]}
              </button>
            ))}
            {types.length === 0 && <p className="col-span-2 p-2 text-sm text-muted">No matching type.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
