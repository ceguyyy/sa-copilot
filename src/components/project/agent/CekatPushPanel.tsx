import { useMutation } from '@tanstack/react-query'
import { Check, CloudUpload, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { cekatPushApi, type CekatPushPreview, type CekatPushResult } from '../../../lib/api'
import type { PocConfig } from '../../../lib/types'
import { Button, ErrorNote, Select } from '../../ui'

type Props = { pocId: string; draft: PocConfig }

/** What a preview was made from; confirming is blocked once labels or SDK events change after it. */
const fingerprint = (draft: PocConfig) => JSON.stringify({ labels: draft.labels, sdkEvents: draft.sdkEvents })

/** Creates the POC's SDK events and conversion rules in the connected Cekat business, after a preview. */
export function CekatPushPanel({ pocId, draft }: Props) {
  const [preview, setPreview] = useState<{ data: CekatPushPreview; for: string } | null>(null)
  const [result, setResult] = useState<CekatPushResult | null>(null)
  const [businessId, setBusinessId] = useState('')

  const runPreview = useMutation({
    mutationFn: () => cekatPushApi.preview(pocId, draft),
    onSuccess: (data) => {
      setResult(null)
      setPreview({ data, for: fingerprint(draft) })
    },
  })
  const choose = useMutation({ mutationFn: () => cekatPushApi.selectBusiness(businessId), onSuccess: () => runPreview.mutate() })
  const apply = useMutation({
    mutationFn: () => cekatPushApi.apply(pocId, draft),
    onSuccess: (data) => {
      setResult(data)
      setPreview(null)
    },
  })
  const isStale = !!preview && preview.for !== fingerprint(draft)
  const plan = preview?.data.kind === 'plan' ? preview.data.plan : null
  const hasChanges = !!plan && (plan.createEvents.length > 0 || plan.ruleText.length > 0)

  return (
    <div className="space-y-3 rounded-lg border border-forest/40 bg-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted">Create in Cekat</h5>
          <p className="text-xs text-muted">Creates the SDK events and conversion rules in the Cekat business you logged in to (Settings › AI tools). You see everything before anything is saved.</p>
        </div>
        <Button variant="outline" icon={<RefreshCw className="size-4" />} loading={runPreview.isPending} onClick={() => runPreview.mutate()}>
          {preview ? 'Preview again' : 'Preview in Cekat'}
        </Button>
      </div>
      <ErrorNote error={runPreview.error ?? choose.error ?? apply.error} />

      {preview?.data.kind === 'choose-business' && (
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Cekat business" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            <option value="">Choose the Cekat business…</option>
            {preview.data.businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.status && b.status !== 'active' ? ` (${b.status})` : ''}
              </option>
            ))}
          </Select>
          <Button variant="outline" disabled={!businessId} loading={choose.isPending} onClick={() => choose.mutate()}>
            Use this business
          </Button>
        </div>
      )}

      {plan && (
        <div className="space-y-3 text-sm">
          <PlanList title="Custom events to create" items={plan.createEvents.map((e) => `${e.label} (${e.key})`)} empty="None — every SDK event already exists." />
          {plan.existingEvents.length > 0 && <PlanList title="Already in Cekat (left as they are)" items={plan.existingEvents} />}
          <PlanList title="Conversion rules to save" items={plan.ruleText} empty="None." />
          {plan.problems.length > 0 && <PlanList title="Needs attention (skipped)" items={plan.problems} tone="warn" />}
          {preview?.data.kind === 'plan' && preview.data.cekatCheck && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Cekat's own check of the rules</summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-paper p-2 font-mono">{preview.data.cekatCheck}</pre>
            </details>
          )}
          {isStale && <p className="text-xs text-bad">Labels or SDK events changed since this preview. Preview again before creating.</p>}
          <Button variant="primary" icon={<CloudUpload className="size-4" />} disabled={!hasChanges || isStale} loading={apply.isPending} onClick={() => apply.mutate()}>
            Confirm and create in Cekat
          </Button>
        </div>
      )}

      {result && <PushResultView result={result} />}
    </div>
  )
}

function PlanList({ title, items, empty, tone }: { title: string; items: string[]; empty?: string; tone?: 'warn' }) {
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wider ${tone === 'warn' ? 'text-bad' : 'text-muted'}`}>{title}</p>
      {items.length ? (
        <ul className="ml-4 list-disc space-y-0.5">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">{empty}</p>
      )}
    </div>
  )
}

function PushResultView({ result }: { result: CekatPushResult }) {
  const isClean = !result.failedEvents.length && !result.rulesError && !result.problems.length
  return (
    <div className="space-y-2 text-sm">
      <p className={`flex items-center gap-2 font-medium ${isClean ? 'text-forest' : 'text-bad'}`}>
        <Check className="size-4" />
        {result.createdEvents.length} event(s) created, {result.rulesSaved} conversion rule(s) saved in Cekat.
      </p>
      {result.failedEvents.length > 0 && <PlanList title="Events Cekat refused" items={result.failedEvents.map((f) => `${f.key}: ${f.error}`)} tone="warn" />}
      {result.rulesError && <PlanList title="Conversion rules not saved" items={[result.rulesError]} tone="warn" />}
      {result.problems.length > 0 && <PlanList title="Still to do" items={result.problems} tone="warn" />}
    </div>
  )
}
