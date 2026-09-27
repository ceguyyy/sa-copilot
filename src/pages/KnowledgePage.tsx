import { SourcesPanel } from '../components/SourcesPanel'
import { PageHeader } from '../components/ui'

export function KnowledgePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader kicker="Shared across all projects" title="Knowledge base" />
      <p className="max-w-2xl text-sm text-muted">
        Product sheets, pricing, standard SOW clauses, past proposals — anything here is given to the copilot in every project, alongside that project's own requirements.
      </p>
      <SourcesPanel projectId={null} kinds={['knowledge']} title="Global knowledge" />
    </div>
  )
}
