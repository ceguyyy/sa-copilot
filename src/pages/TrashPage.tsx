import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Trash2 } from 'lucide-react'
import { trashApi, type TrashItem } from '../lib/api'
import { Button, Card, ErrorNote, PageHeader, Spinner } from '../components/ui'

export function TrashPage() {
  const qc = useQueryClient()
  const trash = useQuery({ queryKey:['trash'], queryFn:trashApi.list, refetchInterval:60_000 })
  const action = useMutation({
    mutationFn: ({item,restore}:{item:TrashItem;restore:boolean}) => restore ? trashApi.restore(item) : trashApi.purge(item),
    onSuccess: () => qc.invalidateQueries(),
  })
  return <div className="mx-auto max-w-5xl space-y-6">
    <PageHeader kicker="Recovery" title="Trash" />
    <Card className="p-5"><p className="text-sm text-muted">Deleted projects and sources can be restored for {trash.data?.retentionDays ?? 30} days. Project documents, history, and uploaded files stay available for recovery. Expired items are permanently removed while the app is running. Archive keeps projects indefinitely.</p><p className="mt-2 text-sm text-muted">Restore a project to recover its contents. Sources deleted separately remain in Trash. Permanent deletion also cleans up associated uploads and app-generated exports; existing backups and Notion pages are kept.</p></Card>
    <ErrorNote error={trash.error ?? action.error} />
    {trash.isPending && <Spinner />}
    {trash.data?.items.length === 0 && <Card className="p-8 text-center text-muted">Trash is empty.</Card>}
    {trash.data?.items.map(item => {
      const expired = item.expired
      return <Card key={`${item.kind}:${item.id}`} className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0"><p className="break-words font-semibold">{item.name}</p><p className="mt-1 text-xs text-muted">{item.kind === 'project' ? 'Project · includes documents and sources' : `Source · ${item.project_name ?? 'Global knowledge'}`}</p><p className="mt-1 text-xs text-muted">Deleted {new Date(item.deleted_at).toLocaleString()} · {expired ? 'Expired · awaiting cleanup' : `Recover before ${new Date(item.expires_at).toLocaleString()}`}</p></div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<RotateCcw className="size-4" />} disabled={expired || action.isPending} onClick={() => action.mutate({item,restore:true})}>Restore</Button>
          <Button variant="danger" icon={<Trash2 className="size-4" />} disabled={action.isPending} onClick={() => confirm(`Permanently delete "${item.name}"${item.kind === 'project' ? ' and all its contents' : ''}? This cannot be undone.`) && action.mutate({item,restore:false})}>Delete permanently</Button>
        </div>
      </Card>
    })}
  </div>
}
