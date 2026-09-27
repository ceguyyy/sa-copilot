import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plug, Plus, Power, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { mcpApi } from '../lib/api'
import type { McpServer } from '../lib/types'
import { AssistantChat } from './AssistantChat'
import { Badge, Button, ErrorNote, Input } from './ui'

/** MCP servers whose read-only tools the AI may call while chatting and drafting (e.g. Cekat docs search). */
export function McpServersPanel() {
  const qc = useQueryClient()
  const servers = useQuery({ queryKey: ['mcp-servers'], queryFn: mcpApi.list })
  const [form, setForm] = useState({ name: '', url: '' })
  const refresh = () => qc.invalidateQueries({ queryKey: ['mcp-servers'] })

  const add = useMutation({
    mutationFn: () => mcpApi.create({ name: form.name.trim(), url: form.url.trim() }),
    onSuccess: () => {
      setForm({ name: '', url: '' })
      return refresh()
    },
  })
  const toggle = useMutation({ mutationFn: (s: McpServer) => mcpApi.update(s.id, { enabled: !s.enabled }), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: string) => mcpApi.remove(id), onSuccess: refresh })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (form.name.trim() && form.url.trim()) add.mutate()
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
          <Plug className="size-5 text-ember" /> AI tools (MCP)
        </h2>
        <p className="max-w-3xl text-sm text-muted">
          Remote MCP servers the AI can consult on its own during chat, drafting and skill design. Only read-only tools are used — tools that change
          something (like sending feedback) are skipped.
        </p>
      </div>
      <ErrorNote error={servers.error ?? add.error ?? toggle.error ?? remove.error} />

      <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
        {servers.data?.length === 0 && <li className="p-4 text-sm text-muted">No tool servers.</li>}
        {servers.data?.map((s) => (
          <li key={s.id} className={`flex flex-wrap items-center gap-3 p-3 ${s.enabled ? '' : 'opacity-60'}`}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{s.name}</p>
              <p className="truncate font-mono text-[11px] text-muted">{s.url}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {!s.enabled ? (
                <Badge>off</Badge>
              ) : s.tools.length ? (
                s.tools.map((t) => (
                  <Badge key={t} tone="forest">
                    {t.split('__').pop()}
                  </Badge>
                ))
              ) : (
                <Badge tone="warn">unreachable</Badge>
              )}
            </div>
            <Button
              variant="ghost"
              aria-pressed={s.enabled}
              title={s.enabled ? 'Disable' : 'Enable'}
              icon={<Power className="size-4" />}
              loading={toggle.isPending && toggle.variables?.id === s.id}
              onClick={() => toggle.mutate(s)}
            />
            <Button variant="danger" aria-label={`Remove ${s.name}`} icon={<Trash2 className="size-4" />} onClick={() => confirm(`Remove "${s.name}"?`) && remove.mutate(s.id)} />
          </li>
        ))}
      </ul>

      <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
        <Input className="w-48" placeholder="Name (e.g. Cekat Docs)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input className="min-w-64 flex-1" placeholder="https://…/mcp" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        <Button type="submit" variant="outline" icon={<Plus className="size-4" />} loading={add.isPending} disabled={!form.name.trim() || !form.url.trim()}>
          Add server
        </Button>
      </form>

      <AssistantChat
        kind="mcp"
        title="AI helper"
        current={{}}
        onProposal={(data) => setForm({ name: String(data.name ?? ''), url: String(data.url ?? '') })}
        placeholder="Mau AI bisa cek dokumentasi apa? (produk, library, repo GitHub…)"
        starters={[
          'Tambahkan dokumentasi Microsoft Learn',
          'Saya butuh docs library JavaScript terbaru (Context7)',
          'Apa saja yang bisa dilakukan server Cekat Docs?',
        ]}
        intro="Ask which documentation sources to connect. The AI tests a server's connection first, then fills the form above — click Add to confirm."
        appliedNote="Server filled into the form above — click Add server to confirm."
      />
    </section>
  )
}
