import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, BookmarkCheck, BookmarkPlus, Download, Eye, FolderOpen, GitCompare, PenLine, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DOC_LABELS, type AnyDocContent } from '../../shared/schemas.ts'
import { AiPanel } from '../components/AiPanel'
import { DiagramSplitPanel } from '../components/DiagramSplitPanel'
import { DocEditor } from '../components/editors/DocEditor'
import { Markdown } from '../components/Markdown'
import { Badge, Button, ErrorNote, Input, Spinner } from '../components/ui'
import { VersionDiffSummary } from '../components/VersionDiffSummary'
import { VersionHistory } from '../components/VersionHistory'
import { documentsApi, filesApi, versionsApi } from '../lib/api'
import { lineDiff } from '../lib/diff'
import { toMarkdown } from '../../shared/docMarkdown.ts'
import { downloadBlob, slugify } from '../lib/download'
import { DOCX_TYPES, exportDocx } from '../../shared/export/docx.ts'
import { XLSX_TYPES, exportXlsx } from '../../shared/export/xlsx.ts'
import type { DocumentVersion } from '../lib/types'
import { useGenerate } from '../lib/useGenerate'

type Mode = 'edit' | 'preview' | 'diff'

/** The project page tab a document type lives on, for the way back. */
const projectTab = (type: string | undefined) => (type === 'diagram' ? 'diagrams' : type === 'custom' ? 'custom' : 'deliverables')

/** Remount per document so local state (selected version, draft, mode) never leaks between documents. */
export function DocumentPage() {
  const { documentId = '' } = useParams()
  return <DocumentView key={documentId} />
}

function DocumentView() {
  const { projectId = '', documentId = '' } = useParams()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const doc = useQuery({ queryKey: ['document', documentId], queryFn: () => documentsApi.get(documentId) })
  const versions = useQuery({ queryKey: ['versions', documentId], queryFn: () => versionsApi.list(documentId) })
  const projectDocs = useQuery({ queryKey: ['documents', projectId], queryFn: () => documentsApi.list(projectId) })
  const gen = useGenerate(projectId)

  const latest = versions.data?.[0]
  const [selected, setSelected] = useState<DocumentVersion | null>(null)
  const [draft, setDraft] = useState<AnyDocContent | null>(null)
  const [mode, setMode] = useState<Mode>('edit')
  const [note, setNote] = useState('')
  const [title, setTitle] = useState('')

  // A new latest version (save / AI / restore) replaces the working draft.
  useEffect(() => {
    if (latest) setDraft(structuredClone(latest.content))
  }, [latest?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (doc.data) setTitle(doc.data.title)
  }, [doc.data])

  const dirty = useMemo(() => !!latest && !!draft && JSON.stringify(draft) !== JSON.stringify(latest.content), [draft, latest])

  const refreshVersions = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['versions', documentId] }),
      qc.invalidateQueries({ queryKey: ['documents', projectId] }),
      qc.invalidateQueries({ queryKey: ['files', projectId] }),
    ])

  const save = useMutation({
    mutationFn: () => versionsApi.create(documentId, draft!, 'manual', note.trim() || 'Manual edit'),
    onSuccess: () => {
      setNote('')
      return refreshVersions()
    },
  })
  const restore = useMutation({
    mutationFn: (v: DocumentVersion) => versionsApi.restore(documentId, v),
    onSuccess: () => {
      setSelected(null)
      return refreshVersions()
    },
  })
  const rename = useMutation({
    mutationFn: () => documentsApi.rename(documentId, title.trim()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['document', documentId] }),
  })
  const knowledge = useMutation({
    mutationFn: (value: boolean) => documentsApi.setKnowledge(documentId, value),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['document', documentId] }),
        qc.invalidateQueries({ queryKey: ['documents', projectId] }),
        qc.invalidateQueries({ queryKey: ['knowledge-docs'] }),
      ]),
  })
  const openFolder = useMutation({ mutationFn: () => filesApi.openFolder(projectId) })
  const remove = useMutation({
    mutationFn: () => documentsApi.remove(documentId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['documents', projectId] })
      navigate(`/projects/${projectId}?tab=${projectTab(doc.data?.type)}`)
    },
  })
  const exporter = useMutation({
    mutationFn: async (format: 'md' | 'docx' | 'xlsx') => {
      const d = doc.data!
      const content = shown!
      const base = `${slugify(d.title)}-v${selected?.version_no ?? latest?.version_no ?? 0}`
      if (format === 'md') return downloadBlob(new Blob([toMarkdown(d.type, d.title, content)], { type: 'text/markdown' }), `${base}.md`)
      if (format === 'docx') return downloadBlob(await exportDocx(d.type, d.title, content), `${base}.docx`)
      return downloadBlob(await exportXlsx(d.type, d.title, content), `${base}.xlsx`)
    },
  })

  if (doc.isLoading || versions.isLoading) return <Spinner />
  if (!doc.data) return <ErrorNote error={doc.error ?? 'Document not found'} />
  const d = doc.data
  const viewingOld = !!selected
  const shown: AnyDocContent | null = viewingOld ? selected.content : draft

  // SOWs depend on the timeline: flag when the timeline changed after this SOW's last version.
  const timeline = projectDocs.data?.find((x) => x.type === 'timeline')
  const timelineOutdated =
    (d.type === 'sow_cekat' || d.type === 'sow_cif') && !!timeline && !!latest && new Date(timeline.updated_at) > new Date(latest.created_at)

  const diffLines =
    mode === 'diff' && latest && shown
      ? lineDiff(toMarkdown(d.type, d.title, (viewingOld ? selected.content : latest.content) as AnyDocContent), toMarkdown(d.type, d.title, viewingOld ? latest.content : draft!))
      : []

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <div>
          <Link to={`/projects/${projectId}?tab=${projectTab(d.type)}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-forest">
            <ArrowLeft className="size-4" /> Back to project
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3 border-b border-line pb-5">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember">{DOC_LABELS[d.type]}</p>
              <input
                aria-label="Document title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title.trim() && title !== d.title && rename.mutate()}
                className="w-full bg-transparent font-display text-3xl font-semibold focus:outline-none"
              />
            </div>
            {latest && <Badge tone="forest">v{latest.version_no}</Badge>}
            <div className="flex flex-wrap gap-1">
              <Button
                variant={d.is_knowledge ? 'primary' : 'outline'}
                aria-pressed={d.is_knowledge}
                title={
                  d.is_knowledge
                    ? 'Used as a reference in every project — click to stop sharing'
                    : 'Share this document with every project as a reference (structure, standard wording)'
                }
                icon={d.is_knowledge ? <BookmarkCheck className="size-4" /> : <BookmarkPlus className="size-4" />}
                loading={knowledge.isPending}
                onClick={() => knowledge.mutate(!d.is_knowledge)}
              >
                {d.is_knowledge ? 'In knowledge' : 'Add to knowledge'}
              </Button>
              <Button variant="outline" icon={<Download className="size-4" />} onClick={() => exporter.mutate('md')}>
                .md
              </Button>
              {DOCX_TYPES.includes(d.type) && (
                <Button variant="outline" onClick={() => exporter.mutate('docx')} loading={exporter.isPending && exporter.variables === 'docx'}>
                  .docx
                </Button>
              )}
              {d.type === 'deck' && (
                <a
                  href={`/api/documents/${documentId}/pptx`}
                  download
                  title={dirty ? 'Save first — the .pptx is built from the last saved version' : 'Build the PowerPoint from the template'}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-sm font-medium text-ink transition hover:border-forest"
                >
                  <Download className="size-4" /> .pptx
                </a>
              )}
              {XLSX_TYPES.includes(d.type) && (
                <Button variant="outline" onClick={() => exporter.mutate('xlsx')} loading={exporter.isPending && exporter.variables === 'xlsx'}>
                  .xlsx
                </Button>
              )}
              <Button variant="danger" aria-label="Delete document" icon={<Trash2 className="size-4" />} onClick={() => confirm('Delete this document and all its versions?') && remove.mutate()} />
            </div>
          </div>
        </div>

        {d.export_files.length > 0 && (
          <p className="-mt-3 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-muted">
            Saved to disk: {d.export_files.map((f) => f.split(/[\\/]/).pop()).join(' · ')}
            <button className="inline-flex items-center gap-1 text-forest hover:underline" onClick={() => openFolder.mutate()}>
              <FolderOpen className="size-3" /> open folder
            </button>
          </p>
        )}

        <ErrorNote error={exporter.error ?? rename.error ?? knowledge.error ?? openFolder.error ?? remove.error ?? versions.error} />

        {timelineOutdated && (
          <div className="flex items-center gap-2 rounded-md border border-warn/40 bg-ember-soft px-3 py-2 text-sm text-warn">
            <AlertTriangle className="size-4 shrink-0" /> The Timeline changed after this SOW was last saved. Revise with AI → "Update timeline" to sync mandays.
          </div>
        )}

        {viewingOld && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-forest-soft px-3 py-2 text-sm">
            <span>
              Viewing <strong>v{selected.version_no}</strong> (read-only) — {selected.note}
            </span>
            <div className="flex gap-2">
              <Button variant="primary" icon={<RotateCcw className="size-4" />} loading={restore.isPending} onClick={() => restore.mutate(selected)}>
                Restore as new version
              </Button>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Back to current
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-md border border-line bg-panel p-0.5 text-sm" role="tablist">
            {(
              [
                ['edit', viewingOld ? 'View' : 'Edit', PenLine],
                ['preview', 'Preview', Eye],
                ['diff', viewingOld ? 'Diff vs current' : 'Unsaved changes', GitCompare],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`flex items-center gap-1.5 rounded px-3 py-1 ${mode === m ? 'bg-forest text-paper' : 'text-muted hover:text-ink'}`}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
          {!viewingOld && dirty && (
            <div className="flex items-center gap-2">
              <Input className="w-56 py-1.5" placeholder="What changed? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button variant="ghost" onClick={() => latest && setDraft(structuredClone(latest.content))}>
                Discard
              </Button>
              <Button icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>
                Save v{(latest?.version_no ?? 0) + 1}
              </Button>
            </div>
          )}
        </div>
        <ErrorNote error={save.error ?? restore.error} />

        {!shown ? (
          <p className="text-sm text-muted">This document has no versions yet.</p>
        ) : mode === 'edit' ? (
          <DocEditor type={d.type} value={shown} readOnly={viewingOld} onChange={setDraft} />
        ) : mode === 'preview' ? (
          <div className="rounded-xl border border-line bg-panel p-6 md:p-10">
            <Markdown>{toMarkdown(d.type, d.title, shown)}</Markdown>
          </div>
        ) : (
          <div className="space-y-3">
            {viewingOld && latest && selected.id !== latest.id && (
              <VersionDiffSummary key={`${selected.id}-${latest.id}`} documentId={documentId} fromVersionId={selected.id} toVersionId={latest.id} />
            )}
            <DiffView lines={diffLines} />
          </div>
        )}
      </div>

      <div className="space-y-6">
        <AiPanel
          docType={d.type}
          documentId={documentId}
          currentKind={d.type === 'diagram' ? (latest?.content as { kind?: never })?.kind : undefined}
          running={!!gen.running}
          chars={gen.chars}
          activity={gen.activity}
          error={gen.error}
          dirty={dirty}
          onRun={async (params) => {
            setSelected(null)
            await gen.run(params)
          }}
        />
        {d.type === 'diagram' && <DiagramSplitPanel projectId={projectId} documentId={documentId} projectDocs={projectDocs.data ?? []} dirty={dirty} />}
        <VersionHistory versions={versions.data ?? []} latestId={latest?.id} selectedId={selected?.id ?? null} onSelect={setSelected} />
      </div>
    </div>
  )
}

function DiffView({ lines }: { lines: { op: 'same' | 'add' | 'del'; text: string }[] }) {
  if (!lines.some((l) => l.op !== 'same')) return <p className="text-sm text-muted">No differences.</p>
  return (
    <pre className="overflow-x-auto rounded-xl border border-line bg-panel p-4 font-mono text-xs leading-relaxed">
      {lines.map((l, i) => (
        <div key={i} className={l.op === 'add' ? 'bg-forest-soft text-ok' : l.op === 'del' ? 'bg-ember-soft text-bad line-through' : 'text-muted'}>
          {l.op === 'add' ? '+ ' : l.op === 'del' ? '- ' : '  '}
          {l.text}
        </div>
      ))}
    </pre>
  )
}
