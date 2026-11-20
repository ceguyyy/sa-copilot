import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogIn, LogOut, Plug, Plus, Power, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { mcpApi } from '../lib/api'
import type { McpServer } from '../lib/types'
import { AssistantChat } from './AssistantChat'
import { Badge, Button, ErrorNote, Input } from './ui'

/** Cekat's account MCP (CRM, marketing, broadcast, automation); it needs a login. */
const CEKAT_MCP = { name: 'Cekat', url: 'https://mcp.cekat.ai/mcp' }
/** How long Settings keeps checking for the login to finish in the browser. */
const LOGIN_WAIT_MS = 10 * 60_000

/** MCP servers whose read-only tools the AI may call while chatting and drafting (e.g. Cekat docs search). */
export function McpServersPanel() {
  const qc = useQueryClient()
  const [waitingSince, setWaitingSince] = useState<number | null>(null)
  const servers = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: mcpApi.list,
    // While a login is open in the browser, refresh until it is done.
    refetchInterval: (q) => {
      if (!waitingSince || Date.now() - waitingSince > LOGIN_WAIT_MS) return false
      return q.state.data?.some((s) => s.auth === 'required') ? 3000 : false
    },
  })
  const [form, setForm] = useState({ name: '', url: '' })
  const refresh = () => qc.invalidateQueries({ queryKey: ['mcp-servers'] })

  const login = useMutation({
    mutationFn: mcpApi.login,
    onSuccess: (result) => {
      if (result.status === 'redirect') {
        window.open(result.authorizationUrl, '_blank', 'noopener,noreferrer')
        setWaitingSince(Date.now())
      }
      return refresh()
    },
  })
  const logout = useMutation({ mutationFn: mcpApi.logout, onSuccess: refresh })
  const add = useMutation({
    mutationFn: (input: { name: string; url: string }) => mcpApi.create(input),
    onSuccess: async (server) => {
      setForm({ name: '', url: '' })
      await refresh()
      // Servers that need an account (like Cekat) go straight to their login.
      if (server.url === CEKAT_MCP.url) login.mutate(server.id)
    },
  })
  const toggle = useMutation({ mutationFn: (s: McpServer) => mcpApi.update(s.id, { enabled: !s.enabled }), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: string) => mcpApi.remove(id), onSuccess: refresh })
  const hasCekat = servers.data?.some((s) => s.url.replace(/\/$/, '') === CEKAT_MCP.url)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (form.name.trim() && form.url.trim()) add.mutate({ name: form.name.trim(), url: form.url.trim() })
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
          <Plug className="size-5 text-ember" /> AI tools (MCP)
        </h2>
        <p className="max-w-3xl text-sm text-muted">
          Remote MCP servers the AI can consult on its own during chat, drafting and skill design. Only read-only tools are used — tools that change
          something (like sending feedback, or creating and deleting CRM items on a logged-in account) are skipped.
        </p>
      </div>
      <ErrorNote error={servers.error ?? add.error ?? toggle.error ?? remove.error ?? login.error ?? logout.error} />

      {servers.data && !hasCekat && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ember/40 bg-ember-soft/40 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Connect a Cekat account</p>
            <p className="text-xs text-muted">
              Cekat MCP lets the AI read that account's CRM boards, marketing events and conversions, broadcasts and automations. You log in with your
              Cekat account in the browser; the login stays on this computer and is never part of a backup.
            </p>
          </div>
          <Button variant="outline" icon={<LogIn className="size-4" />} loading={add.isPending} onClick={() => add.mutate(CEKAT_MCP)}>
            Add Cekat MCP
          </Button>
        </div>
      )}

      <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
        {servers.data?.length === 0 && <li className="p-4 text-sm text-muted">No tool servers.</li>}
        {servers.data?.map((s) => (
          <ServerRow
            key={s.id}
            server={s}
            isToggling={toggle.isPending && toggle.variables?.id === s.id}
            isLoggingIn={login.isPending && login.variables === s.id}
            onToggle={() => toggle.mutate(s)}
            onRemove={() => confirm(`Remove "${s.name}"?`) && remove.mutate(s.id)}
            onLogin={() => login.mutate(s.id)}
            onLogout={() => logout.mutate(s.id)}
          />
        ))}
      </ul>
      {waitingSince && servers.data?.some((s) => s.auth === 'required') && (
        <p className="text-xs text-muted">Finish the login in the browser tab that opened; this list updates when it is done.</p>
      )}

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

type RowProps = {
  server: McpServer
  isToggling: boolean
  isLoggingIn: boolean
  onToggle: () => void
  onRemove: () => void
  onLogin: () => void
  onLogout: () => void
}

function ServerRow({ server: s, isToggling, isLoggingIn, onToggle, onRemove, onLogin, onLogout }: RowProps) {
  const status = !s.enabled ? (
    <Badge>off</Badge>
  ) : s.auth === 'required' ? (
    <Badge tone="warn">login required</Badge>
  ) : s.tools.length ? (
    s.tools.map((t) => (
      <Badge key={t} tone="forest">
        {t.split('__').pop()}
      </Badge>
    ))
  ) : (
    <Badge tone="warn">unreachable</Badge>
  )

  return (
    <li className={`flex flex-wrap items-center gap-3 p-3 ${s.enabled ? '' : 'opacity-60'}`}>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          {s.name}
          {s.auth === 'connected' && <Badge tone="ok">logged in</Badge>}
        </p>
        <p className="truncate font-mono text-[11px] text-muted">{s.url}</p>
      </div>
      <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">{status}</div>
      {s.builtin ? (
        <Badge>.env</Badge>
      ) : (
        <>
          {s.auth === 'required' && (
            <Button variant="primary" icon={<LogIn className="size-4" />} loading={isLoggingIn} onClick={onLogin}>
              Log in
            </Button>
          )}
          {s.auth === 'connected' && <Button variant="ghost" aria-label={`Log out of ${s.name}`} title="Log out" icon={<LogOut className="size-4" />} onClick={onLogout} />}
          <Button variant="ghost" aria-pressed={s.enabled} title={s.enabled ? 'Disable' : 'Enable'} icon={<Power className="size-4" />} loading={isToggling} onClick={onToggle} />
          <Button variant="danger" aria-label={`Remove ${s.name}`} icon={<Trash2 className="size-4" />} onClick={onRemove} />
        </>
      )}
    </li>
  )
}
