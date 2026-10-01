import type { AiRunOptions } from '../../lib/useOutputLimit'
import type { ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { BrainCircuit, Download, Hammer, Plus, Trash2, Upload, Workflow } from 'lucide-react'
import { useRef, useState } from 'react'
import { AiDraftButton } from '../AiDraftButton'
import { CopyButton } from '../CopyButton'
import { Badge, Button, ErrorNote, Field, Input, Textarea } from '../ui'
import { downloadBlob, slugify } from '../../lib/download'
import { reviewN8nWorkflow } from '../../lib/ai'
import { casesFromWorkflow, parseWorkflow, type PocN8nWorkflow } from '../../../shared/pocN8n.ts'
import { buildGatewayWorkflow, type GatewayIntegration } from '../../../shared/pocN8nBuild.ts'
import { PocN8nCases } from './PocN8nCases'
import type { PocN8n } from '../../lib/types'

type Props = {
  pocId: string
  n8n: PocN8n
  /** The POC's API integrations: the use cases of the gateway, and what "Build from POC" builds it from. */
  integrations: GatewayIntegration[]
  clientName: string
  pocName: string
  onChange: (n8n: PocN8n) => void
  onGenerate: (instruction: string, options: AiRunOptions) => void
  isGenerating: boolean
  isDisabled: boolean
  /** Live status of the running generation, shown under the button. */
  status?: ReactNode
}

const emptyWorkflow = (): PocN8nWorkflow => ({
  name: 'New gateway workflow',
  description: '',
  json: JSON.stringify({ name: 'New gateway workflow', nodes: [], connections: {}, settings: { executionOrder: 'v1', binaryMode: 'separate' } }, null, 2),
  cases: [],
  testNotes: '',
})

const workflowFileName = (w: PocN8nWorkflow) => `${slugify(w.name) || 'workflow'}.n8n.json`

/** The POC's n8n gateway workflow (import into workflows.cekat.ai) with one cURL per use case. */
export function PocN8nSection({ pocId, n8n, integrations, clientName, pocName, onChange, onGenerate, isGenerating, isDisabled, status }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const tools = integrations.map((i) => i.name).filter(Boolean)

  const buildFromPoc = () => {
    const built = buildGatewayWorkflow({ clientName, pocName, integrations })
    if (!built) return
    if (n8n.workflows.length && !confirm('Add a gateway workflow built from the current API integrations? Existing workflows stay.')) return
    onChange({ workflows: [...n8n.workflows, built] })
  }

  // n8n imports one workflow per file, so each workflow of this section is its own file — exactly as edited here.
  const exportAll = () => {
    for (const w of n8n.workflows) downloadBlob(new Blob([w.json], { type: 'application/json' }), workflowFileName(w))
  }
  const update = (index: number, patch: Partial<PocN8nWorkflow>) => onChange({ workflows: n8n.workflows.map((w, i) => (i === index ? { ...w, ...patch } : w)) })

  const importWorkflow = async (file: File) => {
    try {
      if (file.size > 500_000) throw new Error('Workflow JSON must be 500 KB or smaller.')
      const parsed = parseWorkflow(await file.text())
      if (!parsed.ok) throw new Error(parsed.error)
      const importedName = typeof parsed.workflow.name === 'string' && parsed.workflow.name.trim()
        ? parsed.workflow.name.trim()
        : file.name.replace(/\.json$/i, '')
      onChange({
        workflows: [...n8n.workflows, {
          name: importedName,
          description: 'Imported n8n workflow export',
          json: JSON.stringify(parsed.workflow, null, 2),
          cases: casesFromWorkflow(parsed.workflow),
          testNotes: '',
        }],
      })
      setImportError(null)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-base font-semibold">n8n Workflow</h4>
          <p className="text-xs text-muted">
            One gateway workflow for workflows.cekat.ai — one webhook and input validation, then Switch Action routes each use case by its &quot;action&quot; (generated ids, client API, Cekat CRM, error handling) — with one cURL per use case.
            Generated from the saved POC; import the JSON in n8n (Workflows → Import from File / paste). Importing an export reads its use cases from Switch Action.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) void importWorkflow(file)
            }}
          />
          <Button variant="outline" icon={<Upload className="size-4" />} disabled={isDisabled} onClick={() => fileInput.current?.click()}>
            Import workflow
          </Button>
          <Button
            variant="outline"
            icon={<Hammer className="size-4" />}
            disabled={isDisabled || !tools.length}
            title={tools.length ? 'Gateway workflow from the current API integrations — no AI' : 'Add a named API integration in POC Agent first'}
            onClick={buildFromPoc}
          >
            Build from POC
          </Button>
          <Button variant="outline" icon={<Download className="size-4" />} disabled={!n8n.workflows.length} title="Download every workflow below as .n8n.json, as edited here" onClick={exportAll}>
            Export n8n
          </Button>
          <AiDraftButton
            label={n8n.workflows.length ? 'Regenerate with AI' : 'Generate with AI'}
            icon={<Workflow className="size-4" />}
            isLoading={isGenerating}
            isDisabled={isDisabled}
            onRun={onGenerate}
            placeholder="e.g. ticket id format PRC-YYMMDD-001, also notify the team on Slack"
          />
        </div>
      </div>
      {isGenerating && status}
      {importError && <ErrorNote error={importError} />}

      {n8n.workflows.length === 0 && (
        <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">No n8n workflow yet. Fill in the API integrations in POC Agent, then Build from POC (no AI) or save and Generate with AI.</p>
      )}
      {n8n.workflows.map((w, i) => (
        <WorkflowCard
          key={i}
          pocId={pocId}
          workflow={w}
          tools={tools}
          isDisabled={isDisabled}
          onChange={(patch) => update(i, patch)}
          onRemove={() => confirm(`Remove workflow "${w.name}"?`) && onChange({ workflows: n8n.workflows.filter((_, x) => x !== i) })}
        />
      ))}

      <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => onChange({ workflows: [...n8n.workflows, emptyWorkflow()] })}>
        Add workflow
      </Button>
    </div>
  )
}

type CardProps = {
  pocId: string
  workflow: PocN8nWorkflow
  tools: string[]
  isDisabled: boolean
  onChange: (patch: Partial<PocN8nWorkflow>) => void
  onRemove: () => void
}

function WorkflowCard({ pocId, workflow, tools, isDisabled, onChange, onRemove }: CardProps) {
  const [reviewedJson, setReviewedJson] = useState<string | null>(null)
  const [reviewProgress, setReviewProgress] = useState('')
  const [applied, setApplied] = useState(false)
  const review = useMutation({
    mutationFn: (workflowJson: string) => reviewN8nWorkflow(
      { pocId, workflowJson },
      { onProgress: (chars) => setReviewProgress(`Reviewing workflow… ${chars.toLocaleString()} chars`) },
    ),
    onSuccess: (_result, workflowJson) => {
      setReviewedJson(workflowJson)
      setReviewProgress('')
      setApplied(false)
    },
    onSettled: () => setReviewProgress(''),
  })
  const parsed = parseWorkflow(workflow.json)
  const nodes = parsed.ok ? (parsed.workflow.nodes as { name?: unknown; type?: unknown }[]) : []
  const download = () => downloadBlob(new Blob([workflow.json], { type: 'application/json' }), workflowFileName(workflow))
  const applyReview = () => {
    if (!review.data || reviewedJson !== workflow.json || review.data.proposedWorkflowJson === workflow.json) return
    if (!confirm('Apply the AI-suggested changes to this workflow in the POC draft? Save the POC afterward to keep the change.')) return
    onChange({ json: review.data.proposedWorkflowJson })
    setApplied(true)
  }

  return (
    <article className="space-y-3 rounded-lg border border-line bg-paper p-4">
      <Field label="Workflow name">
        <Input value={workflow.name} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <Field label="What it does">
        <Textarea rows={2} value={workflow.description} onChange={(e) => onChange({ description: e.target.value })} />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        {parsed.ok ? <Badge tone="ok">{nodes.length} nodes · valid</Badge> : <Badge tone="ember">JSON needs fixing</Badge>}
        <Button
          variant="outline"
          icon={<BrainCircuit className="size-4" />}
          loading={review.isPending}
          disabled={isDisabled || review.isPending || !parsed.ok}
          title="Credential values are redacted and execution samples are excluded from review."
          onClick={() => {
            setApplied(false)
            review.mutate(workflow.json)
          }}
        >
          Review with AI
        </Button>
        <CopyButton text={workflow.json} label="Copy JSON" title="Paste into n8n (Ctrl+V on the canvas) or Import from File" />
        <Button variant="outline" icon={<Download className="size-4" />} onClick={download}>
          Download .json
        </Button>
        <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={onRemove}>
          Remove
        </Button>
      </div>
      {!parsed.ok && <p className="text-xs text-bad">{parsed.error}</p>}
      {review.isPending && <p className="text-xs text-muted">{reviewProgress || 'Reviewing workflow with AI…'}</p>}
      {review.error && <ErrorNote error={review.error} />}
      {applied && <p role="status" className="text-xs text-ok">Fix applied to the POC draft. Save the POC to keep it.</p>}
      {review.data && reviewedJson !== workflow.json && !applied && (
        <p className="text-xs text-warn">Workflow changed after this review. Run the review again before applying its suggestion.</p>
      )}
      {review.data && reviewedJson === workflow.json && !applied && (
        <section className="space-y-3 rounded-md border border-line bg-panel p-3" aria-label="AI workflow review">
          <div>
            <h5 className="text-sm font-semibold">AI review</h5>
            <p className="mt-1 text-sm text-muted">{review.data.summary}</p>
          </div>
          {review.data.findings.length > 0 ? (
            <ul className="space-y-2">
              {review.data.findings.map((finding, index) => (
                <li key={`${finding.nodeName}-${index}`} className="border-l-2 border-line pl-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={finding.severity === 'critical' || finding.severity === 'high' ? 'ember' : finding.severity === 'medium' ? 'warn' : 'neutral'}>
                      {finding.severity}
                    </Badge>
                    {finding.nodeName && <span className="font-medium">{finding.nodeName}</span>}
                    <span>{finding.issue}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{finding.impact}</p>
                  <p className="mt-1 text-xs">Suggested: {finding.recommendation}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No actionable issues found.</p>}
          <Button
            variant="primary"
            icon={<BrainCircuit className="size-4" />}
            disabled={review.data.proposedWorkflowJson === workflow.json}
            onClick={applyReview}
          >
            {review.data.proposedWorkflowJson === workflow.json ? 'No fix to apply' : 'Apply suggested fix'}
          </Button>
        </section>
      )}
      {nodes.length > 0 && (
        <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Nodes">
          {nodes.map((n, i) => (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted">→</span>}
              <span className="rounded bg-panel px-1.5 py-0.5" title={String(n.type ?? '')}>
                {String(n.name ?? '?')}
              </span>
            </li>
          ))}
        </ol>
      )}

      <PocN8nCases cases={workflow.cases} tools={tools} onChange={(cases) => onChange({ cases })} />
      <Field label="Test notes">
        <Textarea rows={2} value={workflow.testNotes} onChange={(e) => onChange({ testNotes: e.target.value })} />
      </Field>
      <details>
        <summary className="cursor-pointer text-xs text-muted hover:text-ink">Edit workflow JSON</summary>
        <Textarea rows={16} className="mt-2 font-mono text-xs" value={workflow.json} onChange={(e) => {
          setReviewedJson(null)
          setApplied(false)
          review.reset()
          onChange({ json: e.target.value })
        }} spellCheck={false} />
      </details>
    </article>
  )
}
