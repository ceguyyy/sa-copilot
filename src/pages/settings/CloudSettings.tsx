import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Cloud, Download, HardDrive, RefreshCw, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Button, Card, ErrorNote, Field, Input } from '../../components/ui'
import { maintenanceApi, backupApi } from '../../lib/api'
import { desktop } from '../../lib/desktop'

export function CloudSettings({onBusyChange,onRestored}:{onBusyChange?:(busy:boolean)=>void;onRestored?:()=>void} = {}) {
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState('')
  const status = useQuery({ queryKey: ['cloud'], queryFn: maintenanceApi.cloud, retry: false, refetchInterval: 30000 })
  const push = useMutation({ mutationFn: maintenanceApi.push, onSuccess: () => { void qc.invalidateQueries({ queryKey: ['cloud'] }) } })
  const pull = useMutation({ mutationFn: () => maintenanceApi.pull(status.data!.remoteRevision),
    onSuccess: () => { void qc.invalidateQueries(); setConfirm(''); onRestored?.() } })
  const s = status.data
  const busy = push.isPending || pull.isPending
  useEffect(()=>{onBusyChange?.(busy)},[busy,onBusyChange])
  const matched = s?.localRevision === s?.remoteRevision
  return <div className="space-y-5">
    <Card className="overflow-hidden rounded-2xl border border-line">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-forest-soft text-forest"><Cloud className="size-5" /></span>
          <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-ember">Across computers</p><h3 className="mt-1 font-display text-2xl font-semibold">Cloud backup & restore</h3><p className="mt-1 text-sm text-muted">A saved snapshot of your workspace, ready to bring with you.</p></div>
        </div>
        <Badge tone={s?.configured ? matched ? 'ok' : 'warn' : 'neutral'}>{status.isPending ? 'Checking connection' : status.isError ? 'Connection unavailable' : !s?.configured ? 'Setup required' : matched ? 'Revisions match' : 'Download required'}</Badge>
      </header>
      <div className="space-y-5 p-5 sm:p-6">
        <p className="max-w-3xl text-sm leading-relaxed text-muted">Snapshots include your project data and uploaded files. Compare the revisions below before uploading or restoring.</p>
        <ErrorNote error={status.error ?? push.error ?? pull.error} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-semibold">Connection status</h4>
          <Button variant="outline" icon={<RefreshCw className="size-4" />} loading={status.isFetching} disabled={busy} onClick={() => { void status.refetch() }}>Refresh status</Button>
        </div>
        {s?.configured && <>
          <div role="status" className="rounded-lg border border-line p-3 text-sm"><p className="font-semibold">{s.localChangeStatus === 'changed' ? 'Local changes since last backup' : s.localChangeStatus === 'clean' ? 'Local changes are backed up' : 'Local backup baseline is unknown'}</p><p className="mt-1 text-muted">{s.localChangeStatus === 'clean' ? 'You can switch computers after checking the cloud revision.' : 'Upload a snapshot before switching computers. Save a local backup before restoring if you need to preserve your edits.'}</p>{s.lastSyncedAt && <p className="mt-1 text-xs text-muted">Last synced {new Date(s.lastSyncedAt).toLocaleString('en-US')}</p>}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-paper/50 p-4"><p className="flex items-center gap-2 text-sm text-muted"><HardDrive className="size-4" /> This computer</p><p className="mt-2 text-2xl font-semibold">Revision {s.localRevision}</p><p className="mt-1 break-all text-xs text-muted">{s.device}</p></div>
            <div className="rounded-xl border border-line bg-paper/50 p-4"><p className="flex items-center gap-2 text-sm text-muted"><Cloud className="size-4" /> Cloud snapshot</p><p className="mt-2 text-2xl font-semibold">Revision {s.remoteRevision}</p><p className="mt-1 break-words text-xs text-muted">{s.updatedAt ? new Date(s.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'No snapshot uploaded yet'}{s.updatedBy && <span className="mt-1 block break-all">From {s.updatedBy}</span>}</p></div>
          </div>
          <details className="text-xs text-muted"><summary className="cursor-pointer hover:text-ink">Workspace details</summary><p className="mt-2 break-all rounded-lg bg-paper p-3 font-mono">{s.workspace}</p></details>
          {!matched && <div role="status" className="flex items-start gap-3 rounded-xl border border-warn/25 bg-ember-soft p-4 text-sm text-warn"><AlertTriangle className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">Download the cloud snapshot first</p><p className="mt-1 leading-relaxed">The revisions differ. Save a local backup to keep any changes on this computer, then restore the cloud snapshot before uploading.</p></div></div>}
          <div className="rounded-xl border border-line p-4 sm:p-5">
            <h4 className="font-semibold">Back up this computer</h4><p className="mt-1 text-sm text-muted">Upload your current workspace as a new cloud snapshot.</p>
            <div className="mt-4 flex flex-wrap gap-3"><Button icon={<Upload className="size-4" />} loading={push.isPending} disabled={busy || !matched} onClick={() => push.mutate()}>Upload to cloud</Button><a className="inline-flex items-center justify-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm font-medium transition hover:border-forest" href={backupApi.downloadUrl} download><Download className="size-4" /> Save local backup</a></div>
            {push.data && <p role="status" className="mt-3 flex items-center gap-2 text-sm text-ok"><CheckCircle2 className="size-4 shrink-0" /> Uploaded revision {push.data.revision}.</p>}
          </div>
          {!!s.remoteRevision && <details className="group rounded-xl border border-bad/25 p-4 sm:p-5">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Restore from cloud <span className="ml-1 font-normal text-muted">· revision {s.remoteRevision}</span></summary>
            <section className="mt-4 space-y-4 border-t border-line pt-4">
            <p className="text-sm leading-relaxed text-muted">This replaces the data on this computer. A local safety backup is saved automatically before restoring.</p>
            <div className="max-w-md"><Field label="Type RESTORE to confirm"><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESTORE" autoComplete="off" spellCheck={false} disabled={busy} /></Field></div>
            <Button variant="danger" className="border border-bad/30" icon={<Download className="size-4" />} loading={pull.isPending} disabled={busy || confirm !== 'RESTORE'} onClick={() => pull.mutate()}>Restore cloud snapshot</Button>
          </section></details>}
          {pull.data && <div role="status" className="rounded-xl border border-ok/25 bg-forest-soft p-4 text-sm text-ok"><p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4 shrink-0" /> Restored revision {pull.data.revision}</p><p className="mt-2">Previous data saved to:</p><p className="mt-1 break-all font-mono text-xs">{pull.data.safetyBackup}</p></div>}
        </>}
        <details open={s && !s.configured} className="rounded-lg bg-paper/60 p-4 text-sm text-muted"><summary className="cursor-pointer font-medium text-ink">Cloud setup instructions</summary><p className="mt-2 leading-relaxed">{desktop ? 'Configure the PostgreSQL URL under Settings > Connections.' : 'Set CLOUD_DATABASE_URL in .env, then restart the server.'} Run db/supabase-sync.sql in your existing Supabase project first.</p></details>
      </div>
    </Card>
  </div>
}
