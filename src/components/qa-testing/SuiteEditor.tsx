import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ListChecks, Save, Trash2 } from 'lucide-react'
import { AiDraftButton } from '../AiDraftButton'
import { AiJobStatus } from '../AiJobStatus'
import { Button, ErrorNote, Field, Input, Textarea } from '../ui'
import { generateSuiteCases, prepareSuiteRun, runSuiteRun } from '../../lib/ai'
import { qaSuitesApi } from '../../lib/api'
import { type QaAdapter, QaRunner } from '../project/qa/QaRunner'
import { SuiteCases } from './SuiteCases'
import { SuiteKnowledge } from './SuiteKnowledge'
import type { QaSuite } from '../../../shared/pocQa.ts'

type Draft = Pick<QaSuite, 'name' | 'livechat_url' | 'context' | 'cases'>
const draftOf = (s: QaSuite): Draft => ({ name: s.name, livechat_url: s.livechat_url, context: s.context, cases: s.cases })

function Section({ step, title, hint, action, children }: { step: number; title: string; hint: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-display text-base font-semibold">
            <span className="mr-2 font-mono text-xs text-muted">{step}</span>
            {title}
          </h4>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** One QA suite: knowledge → agent context → test cases (by hand or AI) → run on the livechat. */
export function SuiteEditor({ suite, onDeleted }: { suite: QaSuite; onDeleted: () => void }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft>(() => draftOf(suite))
  const [count, setCount] = useState(5)
  const [isReplace, setIsReplace] = useState(false)
  const [status, setStatus] = useState('')
  const [startedAt, setStartedAt] = useState(0)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(draftOf(suite))
  const refresh = () => qc.invalidateQueries({ queryKey: ['qa-suites'] })

  const save = useMutation({ mutationFn: () => qaSuitesApi.update(suite.id, draft), onSuccess: refresh })
  const remove = useMutation({ mutationFn: () => qaSuitesApi.remove(suite.id), onSuccess: async () => (await refresh(), onDeleted()) })
  const generate = useMutation({
    mutationFn: (instruction: string) => {
      setStartedAt(Date.now())
      setStatus('Reading the knowledge…')
      return generateSuiteCases({ suiteId: suite.id, count, instruction: instruction || undefined, mode: isReplace ? 'replace' : 'append' }, { onStatus: setStatus })
    },
    onSuccess: async (row) => {
      setDraft((prev) => ({ ...prev, cases: row.cases }))
      await refresh()
    },
    onSettled: () => setStatus(''),
  })

  const adapter: QaAdapter = {
    queryKey: ['qa-suite-runs', suite.id],
    prepare: (url, handlers) => prepareSuiteRun({ suiteId: suite.id, livechatUrl: url }, handlers),
    run: (params, handlers) => runSuiteRun({ suiteId: suite.id, ...params }, handlers),
    listRuns: () => qaSuitesApi.runs(suite.id),
    setActionCheck: qaSuitesApi.setActionCheck,
    removeRun: qaSuitesApi.removeRun,
  }

  const runGenerate = (instruction: string) => {
    if (isDirty && !confirm('Generating saves new cases on the suite; your unsaved edits to the cases will be replaced. Continue?')) return
    generate.mutate(instruction)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label="Suite name">
            <Input value={draft.name} maxLength={200} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </Field>
        </div>
        <Button variant={isDirty ? 'primary' : 'outline'} icon={<Save className="size-4" />} loading={save.isPending} disabled={!draft.name.trim()} onClick={() => save.mutate()}>
          {isDirty ? 'Save' : 'Saved'}
        </Button>
        <Button variant="danger" icon={<Trash2 className="size-4" />} loading={remove.isPending} onClick={() => confirm(`Delete suite "${suite.name}" with its knowledge and runs?`) && remove.mutate()}>
          Delete
        </Button>
      </div>
      {(save.error ?? remove.error) && <ErrorNote error={save.error ?? remove.error} />}

      <Section step={1} title="Knowledge" hint="Everything the agent under test was given. The AI writes cases from it and judges the replies against it.">
        <SuiteKnowledge suiteId={suite.id} />
      </Section>

      <Section step={2} title="About the agent" hint="Optional: who the agent is, its scope and rules (e.g. hands over complaints to CS).">
        <Textarea rows={3} value={draft.context} maxLength={20000} onChange={(e) => setDraft((d) => ({ ...d, context: e.target.value }))} placeholder="e.g. Customer service BPKH: informasi haji, tidak melayani pendaftaran, komplain diteruskan ke agen" />
      </Section>

      <Section
        step={3}
        title="Test cases"
        hint="What the customer types and what the agent should answer."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-muted">
              Count
              <Input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} className="!w-16 py-1" />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted">
              <input type="checkbox" checked={isReplace} onChange={(e) => setIsReplace(e.target.checked)} /> Replace existing
            </label>
            <AiDraftButton
              label="Generate cases with AI"
              icon={<ListChecks className="size-4" />}
              isLoading={generate.isPending}
              isDisabled={generate.isPending}
              onRun={(instruction) => runGenerate(instruction)}
              placeholder="e.g. focus on biaya dan syarat, include a complaint that must go to a human"
            />
          </div>
        }
      >
        {status && <AiJobStatus text={status} startedAt={startedAt} />}
        {generate.error && <ErrorNote error={generate.error} />}
        <SuiteCases cases={draft.cases} onChange={(cases) => setDraft((d) => ({ ...d, cases }))} />
      </Section>

      <Section step={4} title="Run on the livechat" hint="Choose the cases to run after Prepare. Each case is a real conversation in that Cekat inbox.">
        <QaRunner
          adapter={adapter}
          reportTitle={draft.name}
          livechatUrl={draft.livechat_url}
          onLivechatUrlChange={(livechat_url) => setDraft((d) => ({ ...d, livechat_url }))}
          prepareBlocker={suite.cases.length ? undefined : 'Save at least one test case first.'}
          prepareWarning={isDirty ? 'Prepare uses the saved cases; unsaved edits are not included. Continue?' : undefined}
        />
      </Section>
    </div>
  )
}
