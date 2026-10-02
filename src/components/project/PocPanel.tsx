import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ErrorNote, Spinner } from '../ui'
import { pocsApi } from '../../lib/api'
import { PocEditor } from './PocEditor'
import { emptyConfig, type PocSection } from './pocConfig'

/** The project's POCs: a list on the left, the selected one's editor on the right. */
export function PocPanel({ projectId, clientName }: { projectId: string; clientName: string }) {
  const qc = useQueryClient()
  const pocs = useQuery({ queryKey: ['pocs', projectId], queryFn: () => pocsApi.list(projectId) })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [section, setSection] = useState<PocSection>('agent')

  // Nothing picked yet, or the picked one was deleted: fall back to the first POC.
  const list = pocs.data ?? []
  const selected = list.find((p) => p.id === selectedId) ?? list[0] ?? null

  const create = useMutation({
    mutationFn: () => pocsApi.create(projectId, `POC ${(list.length + 1).toString().padStart(2, '0')}`, emptyConfig()),
    onSuccess: async (row) => {
      setSelectedId(row.id)
      await qc.invalidateQueries({ queryKey: ['pocs', projectId] })
    },
  })

  if (pocs.isLoading) return <Spinner label="Loading POCs…" />
  if (!pocs.data) return <ErrorNote error={pocs.error ?? 'Unable to load POCs'} />

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-line bg-panel p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">POCs</h3>
          <Button variant="outline" icon={<Plus className="size-4" />} loading={create.isPending} onClick={() => create.mutate()}>
            New
          </Button>
        </div>
        {create.error && <ErrorNote error={create.error} />}
        <div className="space-y-2">
          {pocs.data.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">No POC yet.</p>
          ) : (
            pocs.data.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition ${selected?.id === p.id ? 'border-forest bg-forest-soft' : 'border-line bg-transparent hover:border-forest/40'}`}
              >
                <div className="font-medium text-ink">{p.name}</div>
                <div className="mt-1 font-mono text-[11px] text-muted">updated {new Date(p.updated_at).toLocaleDateString()}</div>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="space-y-5 rounded-xl border border-line bg-panel p-4">
        {selected ? (
          <PocEditor key={selected.id} poc={selected} projectId={projectId} clientName={clientName} section={section} onSectionChange={setSection} />
        ) : (
          <p className="text-sm text-muted">No POC selected.</p>
        )}
      </section>
    </div>
  )
}
