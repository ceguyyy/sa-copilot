import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { workspaceApi } from '../lib/api'
import { Button, ErrorNote } from './ui'
export function ReviewAlerts({projectId, documentId}:{projectId:string;documentId?:string}) {
 const qc=useQueryClient()
 const alerts=useQuery({queryKey:['review-alerts',projectId],queryFn:()=>workspaceApi.reviews(projectId),refetchInterval:15000})
 const reviewed=useMutation({mutationFn:workspaceApi.reviewed,onSuccess:()=>Promise.all([qc.invalidateQueries({queryKey:['review-alerts',projectId]}),qc.invalidateQueries({queryKey:['dashboard']})])})
 const items=(alerts.data??[]).filter(a=>!documentId||a.target_id===documentId)
 if(!items.length&&!alerts.error)return null
 return <section className="space-y-3 rounded-xl border border-warn/30 bg-ember-soft p-4" aria-label="Items needing review"><h2 className="text-sm font-semibold text-warn">Upstream changes need review</h2><p className="text-xs text-muted">Review the impact before using or sharing these items. This is a dependency alert, not a confirmed inconsistency.</p><ErrorNote error={alerts.error??reviewed.error}/>{items.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-panel p-3"><div className="min-w-0"><Link className="break-words text-sm font-medium text-forest underline" to={item.target_kind==='document'?`/projects/${projectId}/docs/${item.target_id}`:`/projects/${projectId}?tab=demo`}>{item.title}</Link><p className="mt-1 text-xs text-muted">{item.reason}</p></div><Button variant="outline" loading={reviewed.isPending} onClick={()=>reviewed.mutate(item)}>Mark reviewed</Button></div>)}</section>
}
