import { useQuery } from '@tanstack/react-query'
import { LayoutTemplate, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { templatesApi } from '../lib/api'
import type { DocumentRow } from '../lib/types'
import { Badge, Button, Select } from './ui'

interface Props {
  projectId: string
  docs: DocumentRow[]
  running: boolean
  onGenerate: (templateId: string) => void
}

/** Deliverables beyond the built-in pipeline, written by the AI from a user-defined template. */
export function CustomDeliverables({ projectId, docs, running, onGenerate }: Props) {
  const templates = useQuery({ queryKey: ['templates'], queryFn: templatesApi.list })
  const [templateId, setTemplateId] = useState('')
  const chosen = templateId || templates.data?.[0]?.id || ''

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold">Custom deliverables</h2>
          <p className="text-xs text-muted">
            Your own formats (proposal, BRD, UAT plan…).{' '}
            <Link to="/settings/formats" className="font-medium text-forest hover:underline">
              Design formats with AI →
            </Link>
          </p>
        </div>
        {!!templates.data?.length && (
          <div className="flex gap-2">
            <Select aria-label="Template" value={chosen} onChange={(e) => setTemplateId(e.target.value)} className="w-48">
              {templates.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Button variant="ai" icon={<Sparkles className="size-4" />} loading={running} disabled={!chosen || running} onClick={() => onGenerate(chosen)}>
              Draft with AI
            </Button>
          </div>
        )}
      </div>

      {templates.data?.length === 0 && (
        <Link
          to="/settings/formats"
          className="flex items-center gap-3 rounded-lg border border-dashed border-line p-4 text-sm text-muted transition hover:border-forest hover:text-forest"
        >
          <LayoutTemplate className="size-5" /> No custom formats yet — create one in Settings (the AI can design it for you).
        </Link>
      )}

      {docs.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
          {docs.map((d) => (
            <li key={d.id}>
              <Link to={`/projects/${projectId}/docs/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-forest-soft">
                <span className="truncate">{d.title}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {d.is_knowledge && <Badge tone="forest">knowledge</Badge>}
                  <span className="font-mono text-[11px] text-muted">{new Date(d.updated_at).toLocaleString()}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
