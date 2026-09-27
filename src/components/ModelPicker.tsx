import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Cpu, PenLine, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { modelsApi } from '../lib/api'
import type { AiModel, EffortSetting } from '../lib/types'

const selectCls =
  'w-full truncate rounded-md border border-paper/20 bg-paper/10 px-2 py-1.5 text-xs text-paper focus:border-paper/60 focus:outline-none disabled:opacity-50 [&>option]:text-ink'

const EFFORTS: { value: EffortSetting; label: string }[] = [
  { value: 'default', label: 'Thinking: auto' },
  { value: 'low', label: 'Thinking: low (fast)' },
  { value: 'medium', label: 'Thinking: medium' },
  { value: 'high', label: 'Thinking: high (best)' },
]

function label(m: AiModel): string {
  const tags = [!m.tools && 'chat only', m.custom && 'manual'].filter(Boolean)
  return tags.length ? `${m.name} (${tags.join(', ')})` : m.name
}

/** Sidebar control: 9router provider → model, thinking effort, or a hand-typed model id. Saved server-side. */
export function ModelPicker() {
  const qc = useQueryClient()
  const [typing, setTyping] = useState(false)
  const [customId, setCustomId] = useState('')
  const list = useQuery({ queryKey: ['ai-models'], queryFn: modelsApi.list, staleTime: 60_000, retry: 0 })
  const refresh = () => qc.invalidateQueries({ queryKey: ['ai-models'] })
  const select = useMutation({
    mutationFn: modelsApi.select,
    onSuccess: () => {
      setTyping(false)
      setCustomId('')
      refresh()
    },
  })
  const effort = useMutation({ mutationFn: modelsApi.setEffort, onSuccess: refresh })

  const models = list.data?.models ?? []
  const selectedId = select.isPending ? select.variables : list.data?.selected
  const selected = models.find((m) => m.id === selectedId)
  const providers = [...new Set(models.map((m) => m.provider))].sort()
  const provider = selected?.provider ?? providers[0] ?? ''
  const providerModels = models.filter((m) => m.provider === provider)
  const busy = list.isLoading || select.isPending

  const pickProvider = (p: string) => {
    const first = models.find((m) => m.provider === p && m.tools) ?? models.find((m) => m.provider === p)
    if (first) select.mutate(first.id)
  }

  const error = list.error ?? select.error ?? effort.error

  return (
    <section aria-label="AI model" className="hidden space-y-2 md:block">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-paper/60">
          <Cpu className="size-3" /> AI model
        </p>
        <div className="flex">
          {list.data?.proxied && (
            <button
              type="button"
              title="Type a model id by hand (e.g. oc/big-pickle)"
              onClick={() => setTyping((v) => !v)}
              className="rounded p-1 text-paper/60 transition hover:bg-paper/10 hover:text-paper"
            >
              <PenLine className="size-3" />
            </button>
          )}
          <button
            type="button"
            title="Reload models from 9router"
            onClick={() => list.refetch()}
            className="rounded p-1 text-paper/60 transition hover:bg-paper/10 hover:text-paper"
          >
            <RefreshCw className={list.isFetching ? 'size-3 animate-spin' : 'size-3'} />
          </button>
        </div>
      </div>

      {list.data && !list.data.proxied && (
        <p className="truncate text-xs text-paper/70" title={list.data.selected}>
          {list.data.selected}
        </p>
      )}

      {list.data?.proxied && (
        <>
          <select aria-label="Provider" className={selectCls} value={provider} disabled={busy} onChange={(e) => pickProvider(e.target.value)}>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select aria-label="Model" className={selectCls} value={selected?.id ?? ''} disabled={busy} onChange={(e) => select.mutate(e.target.value)}>
            {providerModels.map((m) => (
              <option key={m.id} value={m.id}>
                {label(m)}
              </option>
            ))}
          </select>
          {typing && (
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault()
                if (customId.trim()) select.mutate(customId.trim())
              }}
            >
              <input
                autoFocus
                aria-label="Model id"
                placeholder="oc/big-pickle"
                value={customId}
                onChange={(e) => setCustomId(e.target.value)}
                className={`${selectCls} font-mono placeholder:text-paper/40`}
              />
              <button type="submit" title="Use this model" className="rounded p-1 text-paper/70 hover:bg-paper/10 hover:text-paper">
                <Check className="size-3.5" />
              </button>
              <button type="button" title="Cancel" onClick={() => setTyping(false)} className="rounded p-1 text-paper/70 hover:bg-paper/10 hover:text-paper">
                <X className="size-3.5" />
              </button>
            </form>
          )}
        </>
      )}

      {list.data && (
        <select
          aria-label="Thinking effort"
          className={selectCls}
          value={effort.isPending ? effort.variables : list.data.effort}
          disabled={effort.isPending}
          onChange={(e) => effort.mutate(e.target.value as EffortSetting)}
        >
          {EFFORTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      {error && <p className="text-xs leading-snug text-ember-soft">{(error as Error).message}</p>}
    </section>
  )
}
