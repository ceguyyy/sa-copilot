import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, FileSpreadsheet, FileText, FolderOpen, RefreshCw, Trash2 } from 'lucide-react'
import { filesApi } from '../lib/api'
import { Button, ErrorNote } from './ui'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function FileIcon({ name }: { name: string }) {
  return /\.xlsx?$/i.test(name) ? <FileSpreadsheet className="size-4 shrink-0 text-ok" /> : <FileText className="size-4 shrink-0 text-muted" />
}

/** The project's folder on disk: every deliverable is auto-saved there as .docx/.xlsx/.md on each new version. */
export function ProjectFilesPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const key = ['files', projectId]
  const files = useQuery({ queryKey: key, queryFn: () => filesApi.list(projectId) })
  const refresh = () => qc.invalidateQueries({ queryKey: key })

  const exportAll = useMutation({ mutationFn: () => filesApi.exportAll(projectId), onSuccess: refresh })
  const openFolder = useMutation({ mutationFn: () => filesApi.openFolder(projectId) })
  const openFile = useMutation({ mutationFn: (name: string) => filesApi.open(projectId, name) })
  const remove = useMutation({ mutationFn: (name: string) => filesApi.remove(projectId, name), onSuccess: refresh })

  const list = files.data?.files ?? []

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">Files</h2>
          <p className="truncate font-mono text-[11px] text-muted" title={files.data?.dir}>
            {files.data?.dir ?? '…'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<RefreshCw className="size-4" />} loading={exportAll.isPending} onClick={() => exportAll.mutate()} title="Re-export every deliverable from its latest version">
            Re-export
          </Button>
          <Button variant="outline" icon={<FolderOpen className="size-4" />} loading={openFolder.isPending} onClick={() => openFolder.mutate()}>
            Open folder
          </Button>
        </div>
      </div>
      <ErrorNote error={files.error ?? exportAll.error ?? openFolder.error ?? openFile.error ?? remove.error} />

      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
          No files yet. Every AI draft, save or restore writes the latest version here automatically.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
          {list.map((f) => (
            <li key={f.name} className="flex items-center gap-3 px-3 py-2">
              <FileIcon name={f.name} />
              <button className="min-w-0 flex-1 truncate text-left text-sm hover:underline" title="Open with the default app" onClick={() => openFile.mutate(f.name)}>
                {f.name}
              </button>
              <span className="hidden font-mono text-[11px] text-muted sm:inline">
                {formatSize(f.size)} · {new Date(f.modified).toLocaleString()}
              </span>
              <button aria-label={`Open ${f.name}`} title="Open" className="rounded p-1 text-muted hover:bg-forest-soft hover:text-forest" onClick={() => openFile.mutate(f.name)}>
                <ExternalLink className="size-4" />
              </button>
              <a aria-label={`Download ${f.name}`} title="Download" href={filesApi.downloadUrl(projectId, f.name)} className="rounded p-1 text-muted hover:bg-forest-soft hover:text-forest">
                <Download className="size-4" />
              </a>
              <button
                aria-label={`Delete ${f.name}`}
                title="Delete file (the document stays in the app)"
                className="rounded p-1 text-muted hover:bg-ember-soft hover:text-bad"
                onClick={() => confirm(`Delete "${f.name}" from disk? The document itself stays in the app.`) && remove.mutate(f.name)}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
