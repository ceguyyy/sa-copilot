import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CheckCircle2, ChevronDown, ScanSearch } from 'lucide-react'
import { useState } from 'react'
import { checkConsistency } from '../../lib/ai'
import { consistencyApi, type ConsistencyIssue } from '../../lib/api'
import { Badge, Button, ErrorNote } from '../ui'

const SEVERITY: Record<ConsistencyIssue['severity'], { tone: 'warn' | 'ember' | 'neutral'; label: string; order: number }> = {
  high: { tone: 'ember', label: 'high', order: 0 },
  medium: { tone: 'warn', label: 'medium', order: 1 },
  low: { tone: 'neutral', label: 'low', order: 2 },
}

/** Runs the AI cross-check of all deliverables and shows the latest report. */
export function ConsistencyPanel({ projectId, hasDocs, expanded, onExpandedChange }: { projectId: string; hasDocs: boolean; expanded?: boolean; onExpandedChange?: (open: boolean) => void }) {
  const qc = useQueryClient()
  const latest = useQuery({ queryKey: ['consistency', projectId], queryFn: () => consistencyApi.latest(projectId) })
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [localOpen, setLocalOpen] = useState(true)
  const open = expanded ?? localOpen
  const setOpen = (next: boolean) => { setLocalOpen(next); onExpandedChange?.(next) }

  async function run() {
    setRunning(true)
    setError(null)
    setStatus('Reading the documents…')
    try {
      const check = await checkConsistency(projectId, {
        onProgress: (chars) => setStatus(`Writing the report… ${chars.toLocaleString()} chars`),
        onTool: setStatus,
      })
      qc.setQueryData(['consistency', projectId], check)
      qc.invalidateQueries({ queryKey: ['audit', projectId] })
      setOpen(true)
    } catch (e) {
      setError(e)
    } finally {
      setRunning(false)
      setStatus('')
    }
  }

  const check = latest.data
  const issues = [...(check?.result.issues ?? [])].sort((a, b) => (SEVERITY[a.severity]?.order ?? 3) - (SEVERITY[b.severity]?.order ?? 3))

  return (
    <section className="space-y-3 rounded-xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="flex items-center gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open} disabled={!check}>
          <ScanSearch className="size-5 text-forest" />
          <span>
            <span className="block font-display text-lg font-semibold">Consistency check</span>
            <span className="block text-xs text-muted">
              {check
                ? `Last run ${new Date(check.created_at).toLocaleString()} · ${issues.length ? `${issues.length} issue${issues.length > 1 ? 's' : ''}` : 'no issues'}`
                : 'AI compares Assessment, TOR, Timeline, SOW and the requirements against each other.'}
            </span>
          </span>
          {check && <ChevronDown className={clsx('size-4 text-muted transition', open && 'rotate-180')} />}
        </button>
        <Button variant="outline" icon={<ScanSearch className="size-4" />} loading={running} disabled={!hasDocs} onClick={run} title={hasDocs ? undefined : 'Draft a deliverable first'}>
          {check ? 'Check again' : 'Check consistency'}
        </Button>
      </div>
      {running && <p className="truncate font-mono text-xs text-ember">{status}</p>}
      <ErrorNote error={error ?? latest.error} />

      {check && open && (
        <div className="space-y-3">
          {check.result.summary && <p className="text-sm">{check.result.summary}</p>}
          {issues.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ok">
              <CheckCircle2 className="size-4" /> Documents are consistent.
            </p>
          ) : (
            <ol className="space-y-2">
              {issues.map((issue, i) => (
                <li key={i} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={SEVERITY[issue.severity]?.tone ?? 'neutral'}>{SEVERITY[issue.severity]?.label ?? issue.severity}</Badge>
                    <span className="text-sm font-semibold">{issue.title}</span>
                    {issue.documents.map((d) => (
                      <Badge key={d} tone="forest">
                        {d}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-1.5 text-sm text-muted">{issue.detail}</p>
                  {issue.suggestion && <p className="mt-1 text-sm">→ {issue.suggestion}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}
