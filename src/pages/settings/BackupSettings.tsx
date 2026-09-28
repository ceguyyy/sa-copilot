import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, RotateCcw, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button, Card, ErrorNote, Input } from '../../components/ui'
import { backupApi } from '../../lib/api'
import type { BackupInspect } from '../../lib/types'

/** Move all data between devices: one .sacopilot file with every project, document, POC and upload (no keys). */
export function BackupSettings() {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<BackupInspect | null>(null)
  const [confirm, setConfirm] = useState('')
  const storage = useQuery({ queryKey: ['storage'], queryFn: backupApi.storage })

  const inspect = useMutation({
    mutationFn: (f: File) => backupApi.inspect(f),
    onSuccess: (data) => setPreview(data),
  })
  const restore = useMutation({
    mutationFn: () => backupApi.restore(file!),
    onSuccess: () => window.setTimeout(() => window.location.assign('/'), 1500),
  })

  const pick = (f: File | undefined) => {
    setPreview(null)
    setConfirm('')
    restore.reset()
    setFile(f ?? null)
    if (f) inspect.mutate(f)
  }

  return (
    <div className="space-y-6">
    {storage.data && (
      <Card className="space-y-2 p-5">
        <h3 className="font-display text-lg font-semibold">Where files are stored</h3>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[180px_minmax(0,1fr)]">
          <dt className="text-muted">Uploaded files</dt>
          <dd className="truncate font-mono text-xs leading-5" title={storage.data.uploads}>{storage.data.uploads}</dd>
          <dt className="text-muted">Exported deliverables</dt>
          <dd className="truncate font-mono text-xs leading-5" title={storage.data.exports}>{storage.data.exports}</dd>
          <dt className="text-muted">Automatic backups</dt>
          <dd className="truncate font-mono text-xs leading-5" title={storage.data.backups}>{storage.data.backups}</dd>
        </dl>
      </Card>
    )}
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-3 p-5">
        <h3 className="font-display text-lg font-semibold">Backup</h3>
        <p className="text-sm text-muted">
          Downloads every project, document, POC, question, skill, format and uploaded file as one <code>.sacopilot</code> file. Keys and connections are not included.
        </p>
        <a href={backupApi.downloadUrl} download className="inline-flex items-center gap-2 rounded-md bg-forest px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90">
          <Download className="size-4" /> Download backup
        </a>
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="font-display text-lg font-semibold">Restore</h3>
        <p className="text-sm text-muted">Replaces all data on this device with the backup. The current data is backed up automatically first.</p>
        <input ref={input} type="file" accept=".sacopilot,application/zip" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <Button variant="outline" icon={<Upload className="size-4" />} loading={inspect.isPending} onClick={() => input.current?.click()}>
          {file ? file.name : 'Choose backup file'}
        </Button>
        <ErrorNote error={inspect.error ?? restore.error} />
        {preview && (
          <div className="space-y-3 rounded-lg border border-line bg-paper p-3 text-sm">
            <p>
              Made {new Date(preview.manifest.createdAt).toLocaleString()} (app {preview.manifest.appVersion}) —{' '}
              <strong>{preview.summary.projects}</strong> projects, <strong>{preview.summary.documents}</strong> documents, <strong>{preview.summary.files}</strong> files.
            </p>
            {preview.warnings.map((w) => (
              <p key={w} className="text-warn">
                {w}
              </p>
            ))}
            {restore.data ? (
              <p className="text-ok">Restored. Previous data saved to {restore.data.safetyBackup}. Reloading…</p>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Type RESTORE to confirm</span>
                  <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESTORE" />
                </label>
                <Button variant="danger" icon={<RotateCcw className="size-4" />} loading={restore.isPending} disabled={confirm !== 'RESTORE'} onClick={() => restore.mutate()}>
                  Restore and replace all data
                </Button>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
    </div>
  )
}
