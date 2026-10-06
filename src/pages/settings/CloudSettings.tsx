import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, Card, ErrorNote, Input } from '../../components/ui'
import { maintenanceApi, backupApi, authApi } from '../../lib/api'
import { desktop } from '../../lib/desktop'

export function CloudSettings() {
  const qc = useQueryClient()
  const account = useQuery({ queryKey: ['account'], queryFn: authApi.session })
  const logout = useMutation({ mutationFn: authApi.logout, onSuccess: () => { qc.clear(); window.location.reload() } })
  const [confirm, setConfirm] = useState('')
  const status = useQuery({ queryKey: ['cloud'], queryFn: maintenanceApi.cloud, retry: false })
  const push = useMutation({ mutationFn: maintenanceApi.push, onSuccess: () => { void qc.invalidateQueries({ queryKey: ['cloud'] }) } })
  const pull = useMutation({ mutationFn: () => maintenanceApi.pull(status.data!.remoteRevision),
    onSuccess: () => { void qc.invalidateQueries(); setConfirm('') } })
  const s = status.data
  const busy = push.isPending || pull.isPending
  return <Card className="space-y-4 p-5">
    <p className="text-sm">Akun: <strong>{account.data?.account?.email}</strong></p>
    <Button variant="outline" loading={logout.isPending} disabled={busy} onClick={() => logout.mutate()}>Logout</Button>
    <h3 className="font-display text-lg font-semibold">Supabase cloud backup and sync</h3>
    <p className="text-sm text-muted">Upload a complete snapshot from this computer, then download it on another computer. Includes uploaded files. Download replaces local data and saves a local safety backup first. Use one computer at a time; changes are not merged automatically.</p>
    <p className="text-sm text-muted">{desktop ? 'Configure the PostgreSQL URL under Settings → Connections.' : 'Set CLOUD_DATABASE_URL in .env, then restart the server.'} Run db/supabase-sync.sql in your existing Supabase project first. Backup cloud dipisahkan otomatis berdasarkan ID akun.</p>
    <ErrorNote error={status.error ?? push.error ?? pull.error ?? logout.error} />
    <Button variant="outline" loading={status.isFetching} disabled={busy} onClick={() => { void status.refetch() }}>Refresh cloud status</Button>
    {s?.configured && <>
      <dl className="grid gap-1 text-sm">
        <div>Workspace: <strong>{s.workspace}</strong></div>
        <div>This computer: {s.device} · revision {s.localRevision}</div>
        <div>Cloud: revision {s.remoteRevision}{s.updatedAt ? ` · ${new Date(s.updatedAt).toLocaleString()}` : ''}{s.updatedBy ? ` · ${s.updatedBy}` : ''}</div>
      </dl>
      {s.remoteRevision !== s.localRevision && <p className="text-sm text-warn">Cloud data is newer or this computer has not joined it yet. Download the cloud snapshot before uploading. Download a local backup first to keep any local changes.</p>}
      <a className="block text-sm underline" href={backupApi.downloadUrl} download>Download local backup before syncing</a>
      <Button loading={push.isPending} disabled={busy || s.localRevision !== s.remoteRevision} onClick={() => push.mutate()}>Upload this computer to cloud</Button>
      {push.data && <p className="text-sm text-ok">Uploaded revision {push.data.revision}.</p>}
      {!!s.remoteRevision && <div className="space-y-2 border-t border-line pt-4">
        <label className="block text-sm">Type RESTORE to download cloud data and replace this computer's data
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESTORE" />
        </label>
        <Button variant="danger" loading={pull.isPending} disabled={busy || confirm !== 'RESTORE'} onClick={() => pull.mutate()}>Download cloud and replace local data</Button>
      </div>}
      {pull.data && <p className="break-all text-sm text-ok">Downloaded revision {pull.data.revision}. Previous data saved to {pull.data.safetyBackup}.</p>}
    </>}
  </Card>
}
