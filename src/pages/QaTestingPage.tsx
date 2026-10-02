import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Button, ErrorNote, PageHeader, Spinner } from '../components/ui'
import { SuiteEditor } from '../components/qa-testing/SuiteEditor'
import { qaSuitesApi } from '../lib/api'

/** QA Testing: flexible test suites for any Cekat livechat — upload knowledge, write or generate cases, run. No project needed. */
export function QaTestingPage() {
  const qc = useQueryClient()
  const suites = useQuery({ queryKey: ['qa-suites'], queryFn: qaSuitesApi.list })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => qaSuitesApi.create(`QA suite ${(suites.data?.length ?? 0) + 1}`),
    onSuccess: async (row) => {
      setSelectedId(row.id)
      await qc.invalidateQueries({ queryKey: ['qa-suites'] })
    },
  })

  const list = suites.data ?? []
  const selected = list.find((s) => s.id === selectedId) ?? list[0] ?? null

  return (
    <div className="space-y-6">
      <PageHeader kicker="Flexible test" title="QA Testing" />
      {suites.isLoading && <Spinner label="Loading suites…" />}
      {suites.error && <ErrorNote error={suites.error} />}
      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-2 rounded-xl border border-line bg-panel p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold">Suites</h3>
            <Button variant="outline" icon={<Plus className="size-4" />} loading={create.isPending} onClick={() => create.mutate()}>
              New
            </Button>
          </div>
          {create.error && <ErrorNote error={create.error} />}
          {list.length === 0 && !suites.isLoading && <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">No suite yet. A suite is one agent to test: its knowledge, cases and livechat link.</p>}
          {list.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition ${selected?.id === s.id ? 'border-forest bg-forest-soft' : 'border-line hover:border-forest/40'}`}
            >
              <div className="font-medium text-ink">{s.name}</div>
              <div className="mt-1 font-mono text-[11px] text-muted">
                {s.cases.length} cases · updated {new Date(s.updated_at).toLocaleDateString()}
              </div>
            </button>
          ))}
        </aside>
        <section className="rounded-xl border border-line bg-panel p-4">
          {selected ? <SuiteEditor key={selected.id} suite={selected} onDeleted={() => setSelectedId(null)} /> : <p className="text-sm text-muted">Create a suite to start.</p>}
        </section>
      </div>
    </div>
  )
}
