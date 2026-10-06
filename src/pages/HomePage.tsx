import { WorkspaceSearchButton } from '../components/WorkspaceSearch'
import { RecentProjects } from '../components/RecentProjects'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Inbox, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, ErrorNote, PageHeader } from '../components/ui'
import { inboxApi } from '../lib/api'
import { HomeDashboard } from '../components/HomeDashboard'
import './pixel-office.css'

export function HomePage() {
  const qc = useQueryClient()
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: inboxApi.list, refetchInterval: 2000 })
  const unread = inbox.data?.filter(item => !item.read).length ?? 0
  return <div className="mx-auto max-w-[1400px] space-y-6">
    <PageHeader kicker="Your AI workspace" title="Home" actions={<div className="flex flex-wrap items-center gap-2"><WorkspaceSearchButton /><Link to="/inbox" className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm"><Inbox className="size-4" />Inbox{unread>0 && <span className="rounded-full bg-ember px-2 py-0.5 text-xs text-paper" aria-label={`${unread} unread notifications`}>{unread}</span>}</Link><Button variant="outline" icon={<RefreshCw className="size-4" />} loading={inbox.isFetching} onClick={() => void Promise.all([inbox.refetch(), ...['dashboard', 'projects', 'cloud'].map(key => qc.invalidateQueries({ queryKey: [key] }))])}>Refresh</Button></div>} />
    <ErrorNote error={inbox.error} />
    <RecentProjects />
    <HomeDashboard />
  </div>
}
