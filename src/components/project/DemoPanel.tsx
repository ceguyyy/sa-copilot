import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MonitorPlay, Pencil, Send, Sparkles, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { generateDemoScenarios } from '../../lib/ai'
import { demoApi, type DemoScenario } from '../../lib/api'
import { LiveDemoOverlay } from './LiveDemoOverlay'
import { Badge, Button, ErrorNote, Input, Select, Spinner, Textarea } from '../ui'


type Status = 'live' | 'changed' | 'draft' | 'missing'

function statusOf(s: DemoScenario, remote: string[] | null): Status {
  if (!s.pushed_at) return 'draft'
  if (remote && !remote.includes(s.id)) return 'missing'
  return new Date(s.updated_at) > new Date(s.pushed_at) ? 'changed' : 'live'
}

const STATUS: Record<Status, { label: string; tone: 'ok' | 'warn' | 'neutral' | 'ember' }> = {
  live: { label: 'live', tone: 'ok' },
  changed: { label: 'changed since push', tone: 'warn' },
  draft: { label: 'not pushed', tone: 'neutral' },
  missing: { label: 'removed from demo', tone: 'ember' },
}

function ScenarioEditor({ scenario, onClose }: { scenario: DemoScenario; onClose: () => void }) {
  const qc = useQueryClient()
  const [json, setJson] = useState(JSON.stringify(scenario.payload, null, 2))
  const save = useMutation({
    mutationFn: () => demoApi.update(scenario.id, JSON.parse(json)),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['demo', scenario.project_id] })
      onClose()
    },
  })
  return (
    <div className="space-y-2 border-t border-line p-3">
      <Textarea rows={16} spellCheck={false} className="font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} />
      <ErrorNote error={save.error} />
      <div className="flex gap-2">
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          Save
        </Button>
        <Button variant="ghost" icon={<X className="size-4" />} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** Generate client-specific scenarios with AI, push them to the Healthcare demo app and preview them live. */
export function DemoPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const state = useQuery({ queryKey: ['demo', projectId], queryFn: () => demoApi.get(projectId) })
  const refresh = () => Promise.all(['demo', 'audit'].map((k) => qc.invalidateQueries({ queryKey: [k, projectId] })))
  const [count, setCount] = useState('4')
  const [instruction, setInstruction] = useState('')
  const [status, setStatus] = useState('')
  const [genError, setGenError] = useState<unknown>(null)
  const [editing, setEditing] = useState<string | null>(null)
  /** Open full-screen demo, optionally starting at one scenario. */
  const [live, setLive] = useState<{ scenario: string | null } | null>(null)

  const push = useMutation({ mutationFn: (ids?: string[]) => demoApi.push(projectId, ids), onSuccess: refresh })
  const remove = useMutation({ mutationFn: demoApi.remove, onSuccess: refresh })

  async function generate() {
    setStatus('Reading the project…')
    setGenError(null)
    try {
      await generateDemoScenarios(
        { projectId, count: Number(count), instruction: instruction.trim() || undefined },
        { onProgress: (c) => setStatus(`Writing scenarios… ${c.toLocaleString()} chars`), onTool: setStatus },
      )
      setInstruction('')
      await refresh()
    } catch (e) {
      setGenError(e)
    } finally {
      setStatus('')
    }
  }

  if (state.isLoading) return <Spinner />
  if (!state.data) return <ErrorNote error={state.error} />
  const d = state.data


  return (
    <div className="space-y-6">
      {d.remoteError && <ErrorNote error={d.remoteError} />}

      <section className="space-y-3 rounded-xl border border-ember/40 bg-ember-soft/40 p-4">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Sparkles className="size-4 text-ember" /> Generate demo scenarios
        </h3>
        <p className="text-xs text-muted">The AI turns this project's use cases into WhatsApp demo conversations (with booking cards and WhatsApp Flow forms where useful).</p>
        <div className="flex flex-wrap gap-2">
          <Select aria-label="How many" value={count} onChange={(e) => setCount(e.target.value)} className="w-32">
            {[2, 3, 4, 5, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n} scenarios
              </option>
            ))}
          </Select>
          <Input className="min-w-56 flex-1" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Optional focus, e.g. fokus ke reminder & hasil lab" disabled={!!status} />
          <Button variant="ai" icon={<Sparkles className="size-4" />} loading={!!status} onClick={generate}>
            Generate
          </Button>
        </div>
        {status && <p className="truncate font-mono text-xs text-ember">{status}</p>}
        <ErrorNote error={genError} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-semibold">Scenarios</h3>
            <p className="font-mono text-[11px] text-muted">demo category: {d.categoryId}</p>
          </div>
          <Button icon={<Send className="size-4" />} loading={push.isPending && !push.variables} disabled={!d.configured || !d.scenarios.length} onClick={() => push.mutate(undefined)}>
            Push all to demo
          </Button>
        </div>
        <ErrorNote error={push.error ?? remove.error} />
        {d.scenarios.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">No scenarios yet — generate some above.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
            {d.scenarios.map((s) => {
              const st = statusOf(s, d.remote)
              return (
                <li key={s.id}>
                  <div className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{s.payload.title}</p>
                      <p className="truncate text-xs text-muted">
                        {s.payload.tag} · {s.payload.triggerType === 'OUTBOUND_SYSTEM' ? 'outbound' : 'inbound'} · {s.payload.steps.length} steps
                      </p>
                    </div>
                    <Badge tone={STATUS[st].tone}>{STATUS[st].label}</Badge>
                    <div className="flex gap-1">
                      <Button variant="ghost" className="px-2" title="Present full screen" icon={<MonitorPlay className="size-4" />} disabled={st === 'draft' || st === 'missing'} onClick={() => setLive({ scenario: s.id })} />
                      <Button variant="ghost" className="px-2" title="Edit JSON" icon={<Pencil className="size-4" />} onClick={() => setEditing(editing === s.id ? null : s.id)} />
                      <Button
                        variant="ghost"
                        className="px-2"
                        title="Push this scenario"
                        icon={<Send className="size-4" />}
                        disabled={!d.configured}
                        loading={push.isPending && push.variables?.[0] === s.id}
                        onClick={() => push.mutate([s.id])}
                      />
                      <Button
                        variant="danger"
                        className="px-2"
                        title="Delete (also from the demo)"
                        icon={<Trash2 className="size-4" />}
                        onClick={() => confirm(`Delete "${s.payload.title}"${s.pushed_at ? ' here and in the demo' : ''}?`) && remove.mutate(s.id)}
                      />
                    </div>
                  </div>
                  {editing === s.id && <ScenarioEditor scenario={s} onClose={() => setEditing(null)} />}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {d.configured && (
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel p-4">
          <div>
            <h3 className="font-display text-lg font-semibold">Live demo</h3>
            <p className="text-xs text-muted">Opens full screen for presenting — pick a scenario at the top, Esc to close.</p>
          </div>
          <Button icon={<MonitorPlay className="size-4" />} onClick={() => setLive({ scenario: null })}>
            Open live demo
          </Button>
        </section>
      )}

      {live && (
        <LiveDemoOverlay
          categoryLink={d.categoryLink}
          scenarios={d.scenarios.filter((s) => s.pushed_at).map((s) => ({ id: s.id, title: s.payload.title }))}
          initial={live.scenario}
          onClose={() => setLive(null)}
        />
      )}
    </div>
  )
}
