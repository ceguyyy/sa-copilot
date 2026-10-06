import { createHash } from 'node:crypto'
import { cloudStatus } from './maintenance/cloud.ts'
import { updateStatus } from './maintenance/updates.ts'
import type { InboxItem } from '../shared/inbox.ts'

const caches=new Map<string,{checked:number;busy:boolean;items:InboxItem[]}>()
/** Background checks keep cloud/Git latency out of the two-second Inbox poll. */
export function systemInbox(workspace:string):InboxItem[] {
  let cache=caches.get(workspace)
  if(!cache) {cache={checked:0,busy:false,items:[]};caches.set(workspace,cache)}
  if(!cache.busy && Date.now()-cache.checked>30_000) {
    cache.busy=true
    const state=cache
    void Promise.allSettled([cloudStatus(workspace),updateStatus()]).then(([cloud,updates])=>{
      const next:InboxItem[]=[]
      const add=(key:string,title:string,detail:string,status:InboxItem['status'],href:string)=>{
        const digest=createHash('sha256').update(`${key}|${title}|${detail}|${status}`).digest('hex').slice(0,24)
        const id=`system:${key}:${digest}`
        next.push({id,token:digest,title,detail,status,category:'system',href,at:state.items.find(item=>item.id===id)?.at ?? Date.now(),read:false})
      }
      if(cloud.status==='rejected') add('cloud','Cloud backup unavailable','Check the cloud connection in Settings → Connections.','error','/settings/connections')
      else if(cloud.value.configured) {
        const c=cloud.value
        if(c.localRevision!==c.remoteRevision) add('cloud','Cloud revisions do not match',`This computer: revision ${c.localRevision}. Cloud: revision ${c.remoteRevision}. Review cloud data before switching computers.`,'attention','/settings/backup')
        else if(c.localChangeStatus==='changed') add('cloud','Local changes need backup',`Unsynced changes since revision ${c.localRevision}. Upload before switching computers.`,'attention','/settings/backup')
        else if(c.localChangeStatus==='clean') add('cloud','Cloud backup matches',`Local changes are backed up at revision ${c.localRevision}.`,'done','/settings/backup')
      }
      if(updates.status==='rejected') add('updates','Update status unavailable','Open Settings → Updates for details.','error','/settings/updates')
      else {
        const u=updates.value
        if(u.job) add('upgrade',u.job.running?'Application update working':u.job.error?'Application update failed':'Application update completed',u.job.error ?? u.job.phase,u.job.running?'working':u.job.error?'error':'done','/settings/updates')
        if(u.behind) add('updates','Application update available',`${u.behind} new commit(s) on ${u.branch ?? 'the current branch'}.`,'attention','/settings/updates')
      }
      state.items=next;state.checked=Date.now()
    }).finally(()=>{state.busy=false})
  }
  return cache.items.map(item=>({...item}))
}
