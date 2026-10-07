import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, ErrorNote } from '../../components/ui'
import { maintenanceApi } from '../../lib/api'
import { desktop } from '../../lib/desktop'
import { getDesktopUpdates } from '../../lib/desktopUpdates'

function DesktopUpdatesSettings() {
  const qc = useQueryClient()
  const key = ['desktop-updates']
  const status = useQuery({ queryKey: key, queryFn: () => getDesktopUpdates(desktop!), refetchInterval: 1500 })
  const check = useMutation({ mutationFn: () => desktop!.checkUpdates(), onSuccess: data => qc.setQueryData(key, data) })
  const download = useMutation({ mutationFn: () => desktop!.downloadUpdate(), onSuccess: data => qc.setQueryData(key, data) })
  const install = useMutation({ mutationFn: () => desktop!.installUpdate(), onSettled: () => qc.invalidateQueries({ queryKey: key }) })
  const s = status.data
  const busy = check.isPending || download.isPending || install.isPending || !!s && ['checking', 'downloading', 'preparing', 'installing'].includes(s.phase)
  return <Card className="max-w-3xl space-y-4 p-5">
    <h3 className="font-display text-lg font-semibold">Application updates</h3>
    <ErrorNote error={status.error ?? check.error ?? download.error ?? install.error ?? (s?.error ? new Error(s.error) : undefined)} />
    {s && <>
      <p>Version {s.version}{s.latest ? ` · Available: ${s.latest}` : ''}</p>
      {!s.supported ? <p className="text-sm text-muted">{s.reason}</p> : <>
        <p className="text-sm text-muted">Download updates while you work. Save your edits and finish active AI or QA tasks before restarting. A local backup is saved before the app updates.</p>
        <p role="status" className="text-sm">
          {s.phase === 'idle' && 'Check for a new Windows release.'}
          {s.phase === 'checking' && 'Checking for updates…'}
          {s.phase === 'current' && 'You are using the latest release.'}
          {s.phase === 'available' && 'A new version is available to download.'}
          {s.phase === 'downloading' && `Downloading… ${Math.round(s.percent ?? 0)}%`}
          {s.phase === 'downloaded' && 'Update downloaded. Restart when you are ready.'}
          {s.phase === 'preparing' && 'Preparing a backup and stopping local services…'}
          {s.phase === 'installing' && 'Installing update and restarting…'}
          {s.phase === 'error' && 'Update failed. Check again to retry.'}
        </p>
        {s.phase === 'downloading' && <progress aria-label="Update download" max={100} value={s.percent ?? 0} className="w-full" />}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" loading={check.isPending} disabled={busy || s.phase === 'downloaded'} onClick={() => check.mutate()}>Check for updates</Button>
          {s.phase === 'available' && <Button loading={download.isPending} disabled={busy} onClick={() => download.mutate()}>Download update</Button>}
          {s.phase === 'downloaded' && <Button disabled={busy} loading={install.isPending} onClick={() => {
            if (confirm('Save all edits first. SA Copilot will back up local data, close, and restart with the new version. Restart now?')) install.mutate()
          }}>Restart to update</Button>}
        </div>
      </>}
      {s.safetyBackup && <p className="break-all text-xs text-muted">Backup: {s.safetyBackup}</p>}
    </>}
    <a className="text-sm underline" href="https://github.com/ceguyyy/sa-copilot/releases" target="_blank" rel="noreferrer">Open GitHub releases</a>
  </Card>
}

export function UpdatesSettings() {
  return desktop ? <DesktopUpdatesSettings /> : <SourceUpdatesSettings />
}

function SourceUpdatesSettings() {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ['updates'], queryFn: maintenanceApi.updates,
    refetchInterval: (query) => query.state.data?.job?.running ? 1500 : false })
  const check = useMutation({ mutationFn: maintenanceApi.check, onSuccess: (data) => qc.setQueryData(['updates'], data) })
  const upgrade = useMutation({ mutationFn: () => maintenanceApi.upgrade(status.data!.latest!),
    onSuccess: (data) => qc.setQueryData(['updates'], data) })
  const s = status.data
  return <Card className="max-w-3xl space-y-4 p-5">
    <h3 className="font-display text-lg font-semibold">Application updates</h3>
    <ErrorNote error={status.error ?? check.error ?? upgrade.error} />
    {s && <>
      <p>Version {s.version}{s.branch ? ` · ${s.branch} · ${s.current?.slice(0, 8)}` : ''}</p>
      {!s.supported ? <>
        <p className="text-sm text-muted">{s.reason}</p>
        <a className="text-sm underline" href="https://github.com/ceguyyy/sa-copilot/releases" target="_blank" rel="noreferrer">Open GitHub releases</a>
      </> : <>
        <p className="text-sm text-muted">{s.behind ? `${s.behind} newer commits available (${s.latest?.slice(0, 8)}).` : 'No newer commits in the last checked Git state.'}</p>
        {(s.dirty || !!s.ahead) && <p className="text-sm text-warn">This checkout has local changes or commits. Commit or move those changes and resolve the branch before upgrading.</p>}
        <p className="text-sm text-muted">Upgrade backs up your data, advances this branch, installs dependencies and builds the app. Save your work first. Restart the server with npm start when it finishes.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" loading={check.isPending} disabled={!!s.job?.running || !!s.job?.restartRequired} onClick={() => check.mutate()}>Check Git updates</Button>
          <Button loading={upgrade.isPending || !!s.job?.running} disabled={!s.behind || s.dirty || !!s.ahead || !!s.job?.restartRequired} onClick={() => upgrade.mutate()}>Upgrade to latest commit</Button>
        </div>
      </>}
      {s.job && <div className="rounded-lg border border-line p-3 text-sm space-y-2" role="status">
        <p>{s.job.phase}</p>
        {s.job.error && <p className="text-bad">{s.job.error}</p>}
        {s.job.safetyBackup && <p className="break-all text-muted">Backup: {s.job.safetyBackup}</p>}
      </div>}
    </>}
  </Card>
}
