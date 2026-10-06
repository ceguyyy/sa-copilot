import clsx from 'clsx'
import { BookOpen, FlaskConical, FolderKanban, House, MonitorPlay, Settings } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { CurrentModel } from './CurrentModel'

const NAV = [
  { to: '/home', label: 'Home', icon: House, end: true },
  { to: '/', label: 'Projects', icon: FolderKanban, end: true },
  { to: '/knowledge', label: 'Knowledge', icon: BookOpen, end: false },
  { to: '/demo', label: 'Demo', icon: MonitorPlay, end: false },
  { to: '/qa', label: 'QA Testing', icon: FlaskConical, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
]

export function Layout() {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-forest px-4 py-3 text-paper md:sticky md:top-0 md:h-screen md:flex-nowrap md:flex-col md:items-stretch md:justify-start md:border-b-0 md:px-5 md:py-6">
        <div className="flex items-center gap-3">
          <img src="/app-icon.png" alt="" width={40} height={40} className="size-10 shrink-0 rounded-xl object-cover ring-1 ring-paper/20" />
          <div>
            <p className="font-display text-xl font-semibold leading-none">SA Copilot</p>
            <p className="mt-1 hidden font-mono text-[10px] uppercase tracking-[0.25em] text-paper/60 md:block">By Christian Gunawan</p>
          </div>
        </div>
        <nav aria-label="Main navigation" className="flex gap-1 md:mt-10 md:flex-col">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition',
                  isActive ? 'bg-paper/15 font-semibold text-paper' : 'text-paper/70 hover:bg-paper/10 hover:text-paper',
                )
              }
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="md:mt-auto">
          <CurrentModel />
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 md:px-10 md:py-8">
        <Outlet />
      </main>
    </div>
  )
}
