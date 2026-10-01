import clsx from 'clsx'
import { History } from 'lucide-react'
import { Badge } from './ui'

const ORIGIN_TONE = { ai: 'ember', manual: 'forest', restore: 'neutral' } as const

/** The fields the list needs; document and POC versions both have them. */
export interface VersionEntry {
  id: string
  version_no: number
  origin: keyof typeof ORIGIN_TONE
  note: string
  created_at: string
}

interface Props<V extends VersionEntry> {
  versions: V[]
  selectedId: string | null
  latestId: string | undefined
  onSelect: (v: V | null) => void
}

export function VersionHistory<V extends VersionEntry>({ versions, selectedId, latestId, onSelect }: Props<V>) {
  return (
    <section className="rounded-xl border border-line bg-panel">
      <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 font-display text-lg font-semibold">
        <History className="size-4 text-muted" /> Version history
      </h2>
      <ol className="max-h-[420px] overflow-y-auto">
        {versions.map((v) => {
          const isLatest = v.id === latestId
          const active = selectedId ? selectedId === v.id : isLatest
          return (
            <li key={v.id}>
              <button
                onClick={() => onSelect(isLatest ? null : v)}
                aria-current={active}
                className={clsx(
                  'relative w-full border-l-2 px-4 py-2.5 text-left transition',
                  active ? 'border-ember bg-ember-soft/60' : 'border-transparent hover:bg-forest-soft/50',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">v{v.version_no}</span>
                  <Badge tone={ORIGIN_TONE[v.origin]}>{v.origin}</Badge>
                  {isLatest && <Badge tone="ok">current</Badge>}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted">{v.note || '—'}</p>
                <p className="font-mono text-[10px] text-muted">{new Date(v.created_at).toLocaleString()}</p>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
