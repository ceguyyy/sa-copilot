import { useMutation } from '@tanstack/react-query'
import { ExternalLink, Hammer, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { buildCrmInCekat, previewCrmBuild, type CrmBuildPlan, type CrmBuildResult } from '../../../lib/cekatBuild'
import type { CrmBoard } from '../../../lib/types'
import { Button, ErrorNote } from '../../ui'

type Props = { pocId: string; board: CrmBoard }

/** Builds this board from scratch in the Cekat business logged in through Settings › AI tools, after a preview. */
export function CekatCrmBuildPanel({ pocId, board }: Props) {
  const [plan, setPlan] = useState<{ data: CrmBuildPlan; for: string } | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [result, setResult] = useState<CrmBuildResult | null>(null)
  const fingerprint = JSON.stringify(board)

  const preview = useMutation({
    mutationFn: () => previewCrmBuild(pocId, board),
    onSuccess: (data) => {
      setResult(null)
      setLog([])
      setPlan({ data, for: fingerprint })
    },
  })
  const build = useMutation({
    mutationFn: () => buildCrmInCekat(pocId, board, (text) => setLog((prev) => [...prev, text])),
    onSuccess: (data) => {
      setResult(data)
      setPlan(null)
    },
  })
  const isStale = !!plan && plan.for !== fingerprint
  const canBuild = !!plan && !plan.data.problems.length && !isStale

  return (
    <div className="space-y-2 rounded-lg border border-forest/40 bg-panel p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Build this board from scratch in Cekat. A browser window opens and builds it step by step; log in there the first time.
        </p>
        <Button variant="outline" icon={<RefreshCw className="size-4" />} loading={preview.isPending} disabled={build.isPending} onClick={() => preview.mutate()}>
          {plan ? 'Preview again' : 'Build in Cekat…'}
        </Button>
      </div>
      <ErrorNote error={preview.error ?? build.error} />

      {plan && (
        <div className="space-y-2">
          <p>
            Board <strong>{plan.data.boardName || '(no name)'}</strong>, key column <strong>{plan.data.keyName || '(none)'}</strong>
          </p>
          <ol className="ml-5 list-decimal space-y-0.5">
            {plan.data.columns.map((c) => (
              <li key={c.name}>
                {c.typeLabel} column "{c.name}"{c.options.length > 0 && ` — ${c.options.join(', ')}`}
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted">
            The blank board's own columns (Person, Status, Date) and sample items are removed; {plan.data.sampleItems} sample item(s) from the POC are added.
            The kanban view is not created yet.
          </p>
          {plan.data.problems.length > 0 && (
            <ul className="ml-5 list-disc text-bad">
              {plan.data.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {isStale && <p className="text-xs text-bad">The board changed since this preview. Preview again before building.</p>}
          <Button variant="primary" icon={<Hammer className="size-4" />} disabled={!canBuild} loading={build.isPending} onClick={() => build.mutate()}>
            Confirm and build in Cekat
          </Button>
        </div>
      )}

      {log.length > 0 && (
        <ol className="max-h-48 space-y-0.5 overflow-auto rounded bg-paper p-2 font-mono text-xs" aria-live="polite">
          {log.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ol>
      )}

      {result && (
        <div className="space-y-1">
          <p className={result.problems.length ? 'text-bad' : 'text-forest'}>
            Board built in Cekat with {result.createdItems} sample item(s).{' '}
            <a className="inline-flex items-center gap-1 underline" href={result.url} target="_blank" rel="noopener noreferrer">
              Open in Cekat <ExternalLink className="size-3" />
            </a>
          </p>
          {result.problems.length > 0 && (
            <ul className="ml-5 list-disc text-bad">
              {result.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
