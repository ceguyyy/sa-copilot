import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookmarkMinus } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { DOC_LABELS } from '../../shared/schemas.ts'
import { N8nNodesPanel } from '../components/N8nNodesPanel'
import { SourcesPanel } from '../components/SourcesPanel'
import { Badge, ErrorNote, PageHeader } from '../components/ui'
import { documentsApi } from '../lib/api'

const TABS = [
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'n8n', label: 'Cekat n8n nodes' },
] as const

export function KnowledgePage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'n8n' ? 'n8n' : 'knowledge'

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader kicker="Shared across all projects" title="Knowledge base" />
      <div role="tablist" aria-label="Knowledge sections" className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams(t.id === 'knowledge' ? {} : { tab: t.id }, { replace: true })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${tab === t.id ? 'border-forest text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'n8n' ? <N8nNodesPanel /> : <KnowledgeSources />}
    </div>
  )
}

function KnowledgeSources() {
  const qc = useQueryClient()
  const docs = useQuery({ queryKey: ['knowledge-docs'], queryFn: documentsApi.listKnowledge })
  const unflag = useMutation({
    mutationFn: (id: string) => documentsApi.setKnowledge(id, false),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge-docs'] }),
  })

  return (
    <div className="space-y-10">
      <p className="max-w-2xl text-sm text-muted">
        Product sheets, pricing, standard SOW clauses, past proposals — anything here is given to the copilot in every project, alongside that project's own requirements.
      </p>
      <SourcesPanel projectId={null} kinds={['knowledge']} title="Global knowledge" />

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Documents used as knowledge</h2>
          <p className="text-sm text-muted">
            Deliverables flagged with <em>Add to knowledge</em> on their page. Other projects use them as reference for structure and standard wording.
          </p>
        </div>
        <ErrorNote error={docs.error ?? unflag.error} />
        <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
          {docs.data?.length === 0 && <li className="p-4 text-sm text-muted">None yet — open a finished deliverable and click “Add to knowledge”.</li>}
          {docs.data?.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2">
              <Link to={`/projects/${d.project_id}/docs/${d.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate text-sm font-medium">{d.title}</span>
                <span className="block truncate text-xs text-muted">{d.project_name}</span>
              </Link>
              <Badge tone="forest">{DOC_LABELS[d.type]}</Badge>
              <button
                aria-label={`Remove ${d.title} from knowledge`}
                title="Remove from knowledge (the document stays in its project)"
                className="rounded p-1 text-muted hover:bg-ember-soft hover:text-bad"
                disabled={unflag.isPending}
                onClick={() => unflag.mutate(d.id)}
              >
                <BookmarkMinus className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
