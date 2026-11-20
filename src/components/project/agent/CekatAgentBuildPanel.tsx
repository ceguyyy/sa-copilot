import { useMutation } from '@tanstack/react-query'
import { Bot, ExternalLink, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { buildAgentInCekat, previewAgentBuild, type AgentBuildPlan, type AgentBuildResult } from '../../../lib/cekatBuild'
import type { PocConfig } from '../../../lib/types'
import { Button, ErrorNote, Input } from '../../ui'

type Props = { pocId: string; pocName: string; draft: PocConfig }

const AGENT_NAME_MAX = 100

/** Creates the POC's AI agent in Cekat (behavior, instructions, AI configuration) after a preview. */
export function CekatAgentBuildPanel({ pocId, pocName, draft }: Props) {
  const [name, setName] = useState(pocName.slice(0, AGENT_NAME_MAX))
  const [plan, setPlan] = useState<{ data: AgentBuildPlan; for: string } | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [result, setResult] = useState<AgentBuildResult | null>(null)
  const fingerprint = JSON.stringify([name, draft])

  const preview = useMutation({
    mutationFn: () => previewAgentBuild(pocId, draft, name),
    onSuccess: (data) => {
      setResult(null)
      setLog([])
      setPlan({ data, for: fingerprint })
    },
  })
  const build = useMutation({
    mutationFn: () => buildAgentInCekat(pocId, draft, name, (text) => setLog((prev) => [...prev, text])),
    onSuccess: (data) => {
      setResult(data)
      setPlan(null)
    },
  })
  const isStale = !!plan && plan.for !== fingerprint
  const canBuild = !!plan && !plan.data.problems.length && !isStale

  return (
    <div className="space-y-3 rounded-lg border border-forest/40 bg-paper p-4 text-sm">
      <div>
        <h4 className="font-display text-base font-semibold">Build AI Agent in Cekat</h4>
        <p className="text-xs text-muted">
          Creates a new AI agent in Cekat with this POC's behavior, custom instructions, AI configuration, knowledge base (text and Q&A), labels, agent transfer and pipeline conditions. A browser window opens; log in there the first time.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-64 flex-1 space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Agent name in Cekat</span>
          <Input value={name} maxLength={AGENT_NAME_MAX} onChange={(e) => setName(e.target.value)} />
        </label>
        <Button variant="outline" icon={<RefreshCw className="size-4" />} loading={preview.isPending} disabled={build.isPending || !name.trim()} onClick={() => preview.mutate()}>
          {plan ? 'Preview again' : 'Preview'}
        </Button>
      </div>
      <ErrorNote error={preview.error ?? build.error} />

      {plan && (
        <div className="space-y-2">
          <ul className="ml-5 list-disc space-y-0.5">
            {plan.data.fields.map((f) => (
              <li key={f.title}>
                {f.title} — {f.chars.toLocaleString()} characters
              </li>
            ))}
            {plan.data.instructions.map((title) => (
              <li key={title}>Additional instruction "{title}"</li>
            ))}
            {plan.data.kb.textChars > 0 && <li>Knowledge base text — {plan.data.kb.textChars.toLocaleString()} characters</li>}
            {plan.data.kb.qna > 0 && <li>{plan.data.kb.qna} knowledge base Q&A pair(s)</li>}
            {plan.data.routing.transfer && <li>Agent transfer condition</li>}
            {plan.data.routing.labels.length > 0 && <li>{plan.data.routing.labels.length} label condition(s): {plan.data.routing.labels.map((l) => l.title).join(', ')} — missing labels are created in Settings › Labels</li>}
            {plan.data.routing.moves.length > 0 && <li>{plan.data.routing.moves.length} pipeline condition(s): {plan.data.routing.moves.map((m) => m.title).join(', ')} — missing statuses are created in Settings › Pipeline Statuses</li>}
            {plan.data.tools.names.length > 0 && <li>{plan.data.tools.names.length} API tool(s) in Devtools › API Tools, activated on the agent: {plan.data.tools.names.join(', ')}</li>}
            <li>AI configuration: history {String(plan.data.settings.historyLimit)}, context {String(plan.data.settings.contextLimit)}, creativity {String(plan.data.settings.creativity)}, message await {String(plan.data.settings.messageAwait)}s</li>
          </ul>
          {plan.data.notes.map((n) => (
            <p key={n} className="text-xs text-muted">
              {n}
            </p>
          ))}
          {plan.data.kb.manual.map((m) => (
            <p key={m} className="text-xs text-muted">
              {m}
            </p>
          ))}
          {[...plan.data.tools.problems, ...plan.data.routing.problems].map((p) => (
            <p key={p} className="text-xs text-bad">
              {p}
            </p>
          ))}
          {plan.data.problems.length > 0 && (
            <ul className="ml-5 list-disc text-bad">
              {plan.data.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {isStale && <p className="text-xs text-bad">The name or the POC changed since this preview. Preview again before building.</p>}
          <Button variant="primary" icon={<Bot className="size-4" />} disabled={!canBuild} loading={build.isPending} onClick={() => build.mutate()}>
            Confirm and create the agent in Cekat
          </Button>
        </div>
      )}

      {log.length > 0 && (
        <ol className="max-h-48 space-y-0.5 overflow-auto rounded bg-panel p-2 font-mono text-xs" aria-live="polite">
          {log.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ol>
      )}

      {result && (
        <div className="space-y-1">
          <p className="text-forest">
            AI agent created in Cekat with {result.conditions} routing condition(s){result.createdLabels.length > 0 && `, ${result.createdLabels.length} new label(s)`}{result.createdStatuses.length > 0 && `, ${result.createdStatuses.length} new pipeline status(es)`}.{' '}
            <a className="inline-flex items-center gap-1 underline" href={result.url} target="_blank" rel="noopener noreferrer">
              Open in Cekat <ExternalLink className="size-3" />
            </a>
          </p>
          {result.apiTools.length > 0 && <p className="text-forest">API tools active on the agent: {result.apiTools.join(', ')}.</p>}
          {result.problems.length > 0 && (
            <ul className="ml-5 list-disc text-muted">
              {result.problems.map((p) => (
                <li key={p} className={p.includes('was not found') ? 'text-bad' : ''}>
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
