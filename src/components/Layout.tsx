import { WorkspaceSearch } from './WorkspaceSearch'
import clsx from 'clsx'
import { BookOpen, FlaskConical, FolderKanban, House, MonitorPlay, PanelLeftClose, PanelLeftOpen, Settings, Trash2, Send } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Suspense, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '../lib/api'
import { rememberWork } from '../lib/recentWork'
import { CurrentModel } from './CurrentModel'
import { Spinner } from './ui'

const NAV = [
  { to: '/home', label: 'Home', icon: House, end: true },
  { to: '/', label: 'Projects', icon: FolderKanban, end: true },
  { to: '/knowledge', label: 'Knowledge', icon: BookOpen, end: false },
  { to: '/demo', label: 'Demo', icon: MonitorPlay, end: false },
  { to: '/qa', label: 'QA Testing', icon: FlaskConical, end: false },
  { to: '/sapostman', label: 'SAPostman', icon: Send, end: false },
  { to: '/trash', label: 'Trash', icon: Trash2, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
]

export function Layout() {
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const account = useQuery({ queryKey: ['account'], queryFn: authApi.session })
  useEffect(() => { if (account.data?.account) rememberWork(account.data.account.id, location.pathname) }, [account.data?.account, location.pathname])
  return (
    <div className={clsx('min-h-screen md:grid md:transition-[grid-template-columns] md:duration-300 md:ease-in-out', sidebarCollapsed ? 'md:grid-cols-[72px_minmax(0,1fr)]' : 'md:grid-cols-[220px_minmax(0,1fr)]')}>
      <aside className={clsx('flex flex-wrap items-center justify-between gap-4 border-b border-line bg-forest px-4 py-3 text-paper md:sticky md:top-0 md:h-screen md:flex-nowrap md:flex-col md:items-stretch md:justify-start md:border-b-0 md:py-6 md:transition-[padding] md:duration-300 md:ease-in-out', sidebarCollapsed ? 'md:px-3' : 'md:px-5')}>
        <div className={clsx('flex items-center gap-3', sidebarCollapsed && 'md:justify-center')}>
          <img src="/app-icon.png" alt="" width={40} height={40} className="size-10 shrink-0 rounded-xl object-cover ring-1 ring-paper/20" />
          <div className={clsx('overflow-hidden transition-[max-width,opacity] duration-200 ease-in-out md:max-w-48', sidebarCollapsed && 'md:max-w-0 md:opacity-0')}>
            <p className="font-display text-xl font-semibold leading-none">SA Copilot</p>
            <p className="mt-1 hidden font-mono text-[10px] uppercase tracking-[0.25em] text-paper/60 md:block">By Christian Gunawan</p>
          </div>
        </div>
        <nav id="main-navigation" aria-label="Main navigation" className="flex flex-wrap gap-1 md:mt-10 md:flex-nowrap md:flex-col">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              title={label}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition',
                  sidebarCollapsed && 'md:justify-center md:px-2',
                  isActive ? 'bg-paper/15 font-semibold text-paper' : 'text-paper/70 hover:bg-paper/10 hover:text-paper',
                )
              }
            >
              <Icon className="size-4" />
              <span className={clsx('hidden overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-in-out sm:block sm:max-w-40', sidebarCollapsed && 'md:max-w-0 md:opacity-0')}>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="hidden md:mt-auto md:block">
          <button
            type="button"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
            aria-controls="main-navigation"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            className={clsx(
              'mb-3 flex w-full items-center gap-2 rounded-md border border-paper/15 bg-paper/5 px-3 py-2 text-left text-sm text-paper/75 transition hover:border-paper/25 hover:bg-paper/10 hover:text-paper',
              sidebarCollapsed && 'md:justify-center md:px-2',
            )}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="size-4 shrink-0" /> : <PanelLeftClose className="size-4 shrink-0" />}
            <span className={clsx('overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-in-out md:max-w-32', sidebarCollapsed && 'md:max-w-0 md:opacity-0')}>{sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
          </button>
          <div className={clsx('overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out', sidebarCollapsed ? 'md:pointer-events-none md:max-h-0 md:opacity-0' : 'md:max-h-16 md:opacity-100')}>
            <CurrentModel />
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 md:px-10 md:py-8">
        <WorkspaceSearch />
        <Suspense fallback={<Spinner label="Loading page..." />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
