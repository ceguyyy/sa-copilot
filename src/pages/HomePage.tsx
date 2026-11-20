import { useQueryClient } from '@tanstack/react-query'
import { Inbox, Loader2, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/shadcn/badge'
import { Button } from '@/components/shadcn/button'
import { useInboxActivity } from '../lib/useInboxActivity'
import { WorkspaceSearchButton } from '../components/WorkspaceSearch'
import { RecentProjects } from '../components/RecentProjects'
import { ErrorNote, PageHeader } from '../components/ui'
import { HomeDashboard } from '../components/HomeDashboard'
import './pixel-office.css'

export function HomePage() {
  const qc = useQueryClient()
  const inbox = useInboxActivity()
  const unread = inbox.data?.filter((item) => !item.read).length ?? 0
  const refresh = () => void Promise.all([inbox.refetch(), ...['dashboard', 'projects', 'cloud'].map((key) => qc.invalidateQueries({ queryKey: [key] }))])
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <WorkspaceSearchButton />
      <Button asChild variant="outline" size="sm">
        <Link to="/inbox">
          <Inbox />
          Inbox
          {unread > 0 && (
            <Badge className="ml-0.5 bg-ember px-1.5 text-paper" aria-label={`${unread} unread notifications`}>
              {unread}
            </Badge>
          )}
        </Link>
      </Button>
      <Button variant="outline" size="sm" disabled={inbox.isFetching} onClick={refresh}>
        {inbox.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        Refresh
      </Button>
    </div>
  )
  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader kicker="Your AI workspace" title="Home" actions={actions} />
      <ErrorNote error={inbox.error} />
      <RecentProjects />
      <HomeDashboard />
    </div>
  )
}
