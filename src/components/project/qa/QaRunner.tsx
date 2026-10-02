import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Square, Trash2 } from 'lucide-react'
import { AiJobStatus } from '../../AiJobStatus'
import { Button, ErrorNote, Field, Input, Select } from '../../ui'
import { stopQaRun, type QaHandlers } from '../../../lib/ai'
import { QaPlanForm, type RunOptions } from './QaPlanForm'
import { QaReportView } from './QaReportView'
import { type QaActionCheck, type QaPlan, type QaPlanCase, type QaRunRow, isLivechatUrl } from '../../../../shared/pocQa.ts'

/** Where a runner prepares, runs and stores its QA runs (a POC, or a QA Testing suite). */
export type QaAdapter = {
  queryKey: readonly unknown[]
  prepare: (livechatUrl: string, handlers: QaHandlers) => Promise<QaPlan>
  run: (params: { livechatUrl: string; cases: QaPlanCase[] } & RunOptions, handlers: QaHandlers) => Promise<QaRunRow>
  listRuns: () => Promise<QaRunRow[]>
  setActionCheck: (runId: string, caseIndex: number, stepIndex: number, check: Exclude<QaActionCheck, 'none'>) => Promise<unknown>
  removeRun: (runId: string) => Promise<unknown>
}

type Props = {
  adapter: QaAdapter
  /** POC or suite name, for the report downloads. */
  reportTitle: string
  livechatUrl: string
  onLivechatUrlChange: (url: string) => void
  /** Why Prepare is not possible yet (no cases…); undefined when it is. */
  prepareBlocker?: string
  /** Asked before Prepare when it would miss unsaved edits. */
  prepareWarning?: string
  /** "Revise with AI" target for the revision prompt (POC); copy-only when absent. */
  revise?: { onRevise: (instruction: string) => void; isDisabled: boolean; preview: ReactNode }
}

type LiveStep = { caseIndex: number; stepIndex: number; sent: string; replies: string[] }

/** Prepare → choose cases and data → run on the Cekat livechat → judged report, for any QA target. */
export function QaRunner({ adapter, reportTitle, livechatUrl, onLivechatUrlChange, prepareBlocker, prepareWarning, revise }: Props) {
  const qc = useQueryClient()
  const runs = useQuery({ queryKey: adapter.queryKey, queryFn: adapter.listRuns })
  const [plan, setPlan] = useState<QaPlan | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [options, setOptions] = useState<RunOptions>({ headless: false, adaptive: true })
  const [status, setStatus] = useState('')
  const [startedAt, setStartedAt] = useState(0)
  const [live, setLive] = useState<LiveStep[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const refreshRuns = () => qc.invalidateQueries({ queryKey: adapter.queryKey })

  const isUrlValid = isLivechatUrl(livechatUrl)
  const begin = (text: string) => {
    setStartedAt(Date.now())
    setStatus(text)
  }

  const prepare = useMutation({
    mutationFn: () => {
      begin('Preparing…')
      return adapter.prepare(livechatUrl, { onStatus: setStatus })
    },
    onSuccess: (next) => {
      setPlan(next)
      setSelected(new Set(next.cases.map((_, i) => i)))
    },
    onSettled: () => setStatus(''),
  })

  const run = useMutation({
    mutationFn: (cases: QaPlanCase[]) => {
      begin('Starting the browser…')
      setLive([])
      return adapter.run({ livechatUrl: plan?.livechatUrl ?? livechatUrl, cases, ...options }, { onStatus: setStatus, onStep: (s) => setLive((prev) => [...prev, s]) })
    },
    onSuccess: async (row) => {
      setPlan(null)
      setSelectedRunId(row.id)
      await refreshRuns()
    },
    onSettled: () => setStatus(''),
  })

  const stop = useMutation({ mutationFn: stopQaRun, onSuccess: (isStopping) => isStopping && setStatus('Stopping after the current step…') })
  const actionCheck = useMutation({
    mutationFn: (v: { runId: string; caseIndex: number; stepIndex: number; check: Exclude<QaActionCheck, 'none'> }) => adapter.setActionCheck(v.runId, v.caseIndex, v.stepIndex, v.check),
    onSuccess: refreshRuns,
  })
  const removeRun = useMutation({
    mutationFn: adapter.removeRun,
    onSuccess: () => {
      setSelectedRunId(null)
      return refreshRuns()
    },
  })

  const toggle = (index: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })

  const startRun = (p: QaPlan) => {
    const cases = p.cases.filter((_, i) => selected.has(i))
    if (confirm(`Run ${cases.length} case(s) on ${p.livechatUrl}? Each one starts a real conversation in that Cekat inbox.`)) run.mutate(cases)
  }

  const allRuns = runs.data ?? []
  const shownRun = allRuns.find((r) => r.id === selectedRunId) ?? allRuns[0] ?? null
  const isBusy = prepare.isPending || run.isPending
  const error = prepare.error ?? run.error ?? stop.error ?? actionCheck.error ?? removeRun.error ?? runs.error

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label="Livechat link (entry point)" hint={livechatUrl && !isUrlValid ? 'Use the https://live.cekat.ai/?chat=… link of the Web Livechat inbox.' : undefined}>
            <Input value={livechatUrl} onChange={(e) => onLivechatUrlChange(e.target.value.trim())} placeholder="https://live.cekat.ai/?chat=…" />
          </Field>
        </div>
        <Button
          variant="outline"
          loading={prepare.isPending}
          disabled={!isUrlValid || !!prepareBlocker || isBusy}
          title={prepareBlocker}
          onClick={() => (!prepareWarning || confirm(prepareWarning)) && prepare.mutate()}
        >
          Prepare QA run
        </Button>
      </div>
      {prepareBlocker && <p className="text-xs text-muted">{prepareBlocker}</p>}

      {status && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <AiJobStatus text={status} startedAt={startedAt} />
          </div>
          {run.isPending && (
            <Button variant="danger" icon={<Square className="size-4" />} loading={stop.isPending} onClick={() => stop.mutate()}>
              Stop
            </Button>
          )}
        </div>
      )}
      {error && <ErrorNote error={error} />}

      {plan && !run.isPending && (
        <QaPlanForm plan={plan} onChange={setPlan} options={options} onOptionsChange={setOptions} selected={selected} onToggle={toggle} onRun={() => startRun(plan)} isRunning={run.isPending} />
      )}

      {run.isPending && live.length > 0 && (
        <ol className="max-h-80 space-y-2 overflow-auto rounded-lg border border-line bg-panel p-3 text-xs">
          {live.map((s) => (
            <li key={`${s.caseIndex}-${s.stepIndex}`}>
              <span className="font-mono text-muted">
                {s.caseIndex + 1}.{s.stepIndex + 1}
              </span>{' '}
              <span className="font-medium">{s.sent}</span>
              <p className="whitespace-pre-wrap pl-6 text-muted">{s.replies.join('\n') || '(no reply)'}</p>
            </li>
          ))}
        </ol>
      )}

      {shownRun && (
        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="QA run" value={shownRun.id} onChange={(e) => setSelectedRunId(e.target.value)} className="!w-auto">
              {allRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  Run {new Date(r.created_at).toLocaleString()}
                </option>
              ))}
            </Select>
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => confirm('Delete this QA run?') && removeRun.mutate(shownRun.id)}>
              Delete run
            </Button>
          </div>
          <QaReportView
            run={shownRun}
            title={reportTitle}
            onActionCheck={(caseIndex, stepIndex, check) => actionCheck.mutate({ runId: shownRun.id, caseIndex, stepIndex, check })}
            revise={revise}
          />
        </div>
      )}
    </div>
  )
}
