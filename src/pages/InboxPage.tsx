import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, Inbox, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { inboxApi } from '../lib/api'
import { taskLabel } from '../lib/activity'
import { ActivityDetails } from '../components/ActivityDetails'
import { Button, Card, ErrorNote, PageHeader, Select, Spinner } from '../components/ui'
import type { InboxItem, InboxStatus } from '../../shared/inbox.ts'
import './pixel-office.css'

const LABELS:Record<InboxStatus,string>={working:'Working',done:'Completed',error:'Error',attention:'Needs attention',update:'Update'}
const CATEGORIES=['all','ai','consistency','review','question','revision','qa','project','system']
export function InboxPage() {
  const qc=useQueryClient()
  const inbox=useQuery({queryKey:['inbox'],queryFn:inboxApi.list,refetchInterval:2000})
  const [filter,setFilter]=useState<'all'|InboxStatus>('all')
  const [category,setCategory]=useState('all')
  const [unreadOnly,setUnreadOnly]=useState(false)
  const [limit,setLimit]=useState(20)
  const [selected,setSelected]=useState<InboxItem|null>(null)
  const [now,setNow]=useState(()=>Date.now())
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer)},[])
  const mark=useMutation({mutationFn:({items,read}:{items:InboxItem[];read:boolean})=>inboxApi.mark(items,read),onSuccess:()=>qc.invalidateQueries({queryKey:['inbox']})})
  const items=inbox.data ?? []
  const unread=items.filter(item=>!item.read)
  const shown=items.filter(item=>(filter==='all'||item.status===filter)&&(category==='all'||item.category===category)&&(!unreadOnly||!item.read))
    .sort((a,b)=>Number(b.status==='working')-Number(a.status==='working') || b.at-a.at)
  const detail=selected ? items.find(item=>item.id===selected.id) ?? selected : null
  return <div className="mx-auto max-w-6xl space-y-5">
    <PageHeader kicker="Notifications" title="Inbox" actions={<div className="flex flex-wrap gap-2"><Link to="/home" className="rounded-md border border-line px-3 py-1.5 text-sm">Back to Home</Link><Button variant="outline" icon={<RefreshCw className="size-4" />} loading={inbox.isFetching} onClick={()=>void inbox.refetch()}>Refresh</Button><Button variant="outline" icon={<CheckCheck className="size-4" />} loading={mark.isPending} disabled={!unread.length} onClick={()=>mark.mutate({items:unread,read:true})}>Mark all read</Button></div>} />
    <p className="text-sm text-muted">{unread.length} unread · AI progress and results, document matching, reviews, questions, revision drafts, QA reports, project updates, and cloud/update status. Marking read does not resolve an issue. The latest 200 AI jobs and 200 project updates are included.</p>
    <ErrorNote error={inbox.error ?? mark.error} />
    <div className="flex flex-wrap items-center gap-2" aria-label="Filter notifications">
      {(['all','working','done','error','attention','update'] as const).map(value=><Button key={value} variant={filter===value?'primary':'outline'} aria-pressed={filter===value} onClick={()=>{setFilter(value);setLimit(20)}}>{value==='all'?'All':LABELS[value]} ({items.filter(item=>value==='all'||item.status===value).length})</Button>)}
      <Select aria-label="Notification category" className="sm:max-w-48" value={category} onChange={e=>{setCategory(e.target.value);setLimit(20)}}>{CATEGORIES.map(value=><option key={value} value={value}>{value==='all'?'All categories':value==='ai'?'AI':value==='qa'?'QA':value.charAt(0).toUpperCase()+value.slice(1)}</option>)}</Select>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unreadOnly} onChange={e=>{setUnreadOnly(e.target.checked);setLimit(20)}} />Unread only</label>
    </div>
    {detail && <Card className="space-y-3 p-5"><div className="flex justify-between gap-3"><h2 className="font-semibold">{detail.job ? taskLabel(detail.job) : detail.title}</h2><Button variant="ghost" onClick={()=>setSelected(null)}>Close details</Button></div>{detail.job ? <ActivityDetails job={detail.job} now={now} projectName={detail.projectName} /> : <p className="whitespace-pre-wrap break-words text-sm">{detail.detail}</p>}{detail.href && <Link className="inline-block text-sm text-forest underline" to={detail.href}>Open related item</Link>}</Card>}
    {inbox.isPending && <Spinner />}
    {!inbox.isPending && !shown.length && <Card className="flex items-center gap-3 p-8 text-muted"><Inbox className="size-6" />{items.length?'No notifications match these filters.':'Your Inbox is empty. New activity will appear here automatically.'}</Card>}
    <div className="space-y-2">{shown.slice(0,limit).map(item=><Card key={item.id} className={`flex flex-wrap items-center gap-3 p-4 ${!item.read?'border-forest/40':''}`}>
      <button className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={()=>{setSelected(item);if(!item.read)mark.mutate({items:[item],read:true})}}>
        <span aria-label={item.read?'Read':'Unread'} className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read?'bg-line':'bg-forest'}`} />
        <span className="min-w-0"><span className={`block break-words text-sm ${item.read?'font-medium':'font-semibold'}`}>{item.job ? taskLabel(item.job) : item.title}</span><span className="mt-1 block text-xs text-muted">{item.projectName ?? 'Workspace'} · {item.category} · {new Date(item.at).toLocaleString()}</span><span className="mt-1 block line-clamp-2 break-words text-sm text-muted">{item.detail}</span></span>
      </button>
      <span className={`rounded-md px-2 py-1 text-xs ${item.status==='error'?'bg-ember-soft text-bad':item.status==='attention'?'bg-ember-soft text-warn':item.status==='working'?'bg-forest-soft text-forest':'bg-paper text-muted'}`}>{LABELS[item.status]}</span>
      <Button variant="ghost" disabled={mark.isPending} onClick={()=>mark.mutate({items:[item],read:!item.read})}>{item.read?'Mark unread':'Mark read'}</Button>
    </Card>)}</div>
    {shown.length>limit && <Button variant="outline" onClick={()=>setLimit(value=>value+20)}>Show more</Button>}
  </div>
}
