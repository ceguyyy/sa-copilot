import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { pocVersionsApi } from '../../lib/api'
import { compactDiff, lineDiff } from '../../lib/diff'
import type { PocVersion } from '../../lib/types'
import { VersionHistory } from '../VersionHistory'
import { Button, ErrorNote, Spinner } from '../ui'
import { pocChanges, type PocChange } from '../../../shared/pocDiff.ts'

type Compare = 'previous' | 'current'

type Props = {
  pocId: string
  projectId: string
  hasUnsavedChanges: boolean
  onClose: () => void
}

/** Every saved version of a POC (manual saves, AI drafts, restores), what each changed, and restore. */
export function PocHistory({ pocId, projectId, hasUnsavedChanges, onClose }: Props) {
  const qc = useQueryClient()
  const versions = useQuery({ queryKey: ['poc-versions', pocId], queryFn: () => pocVersionsApi.list(pocId) })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [compare, setCompare] = useState<Compare>('previous')

  const restore = useMutation({
    mutationFn: (v: PocVersion) => pocVersionsApi.restore(pocId, v.id),
    onSuccess: async () => {
      setSelectedId(null)
      await Promise.all([qc.invalidateQueries({ queryKey: ['poc-versions', pocId] }), qc.invalidateQueries({ queryKey: ['pocs', projectId] })])
    },
  })

  if (versions.isLoading) return <Spinner label="Loading history…" />
  if (!versions.data) return <ErrorNote error={versions.error ?? 'Unable to load history'} />

  const list = versions.data
  const latest = list[0]
  const selected = list.find((v) => v.id === selectedId) ?? latest
  const index = list.indexOf(selected)
  const previous = list[index + 1]
  const isLatest = selected === latest
  // "previous": what this version changed. "current": what restoring it would change.
  const [from, to, caption] =
    compare === 'current' && !isLatest
      ? [latest, selected, `Restoring v${selected.version_no} changes the current v${latest.version_no} like this`]
      : [previous, selected, previous ? `What v${selected.version_no} changed compared with v${previous.version_no}` : `v${selected.version_no} is the first version`]
  const changes = from ? pocChanges(from.config, to.config) : []

  const confirmRestore = () => {
    const unsaved = hasUnsavedChanges ? ' Your unsaved edits will be lost.' : ''
    if (confirm(`Restore v${selected.version_no}? It becomes the current POC and is saved as v${latest.version_no + 1}; every version stays in history.${unsaved}`)) restore.mutate(selected)
  }

  return (
    <div className="grid gap-4 rounded-lg border border-line bg-paper p-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <VersionHistory versions={list} selectedId={selectedId} latestId={latest?.id} onSelect={(v) => setSelectedId(v?.id ?? null)} />
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-display text-base font-semibold">
              v{selected.version_no} <span className="font-normal text-muted">— {selected.note || 'no note'}</span>
            </h4>
            <p className="text-xs text-muted">{caption}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isLatest && (
              <div role="radiogroup" aria-label="Compare with" className="flex rounded-md border border-line text-xs">
                {(['previous', 'current'] as const).map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={compare === c} onClick={() => setCompare(c)} className={`px-2 py-1 ${compare === c ? 'bg-forest-soft text-ink' : 'text-muted hover:text-ink'}`}>
                    vs {c}
                  </button>
                ))}
              </div>
            )}
            {!isLatest && (
              <Button variant="outline" icon={<RotateCcw className="size-4" />} loading={restore.isPending} onClick={confirmRestore}>
                Restore v{selected.version_no}
              </Button>
            )}
            <Button variant="ghost" aria-label="Close history" icon={<X className="size-4" />} onClick={onClose} />
          </div>
        </div>
        <ErrorNote error={restore.error} />
        {from && changes.length === 0 && <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">No differences.</p>}
        {changes.map((c) => (
          <ChangeBlock key={c.key} change={c} />
        ))}
      </div>
    </div>
  )
}

export function ChangeBlock({ change }: { change: Pick<PocChange, 'label' | 'before' | 'after'> }) {
  const lines = compactDiff(lineDiff(change.before, change.after))
  return (
    <details open className="rounded-lg border border-line bg-panel">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">{change.label}</summary>
      <pre className="max-h-80 overflow-auto border-t border-line px-3 py-2 font-mono text-xs leading-5">
        {lines.map((l, i) =>
          l.op === 'skip' ? (
            <div key={i} className="text-muted italic">
              … {l.count} unchanged line{l.count === 1 ? '' : 's'}
            </div>
          ) : (
            <div key={i} className={l.op === 'add' ? 'bg-forest-soft text-ok' : l.op === 'del' ? 'bg-ember-soft text-bad line-through' : 'text-muted'}>
              {l.op === 'add' ? '+ ' : l.op === 'del' ? '- ' : '  '}
              {l.text}
            </div>
          ),
        )}
      </pre>
    </details>
  )
}
