import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, ErrorNote } from '../../components/ui'
import { maintenanceApi } from '../../lib/api'

export function UpdatesSettings() {
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
