import clsx from 'clsx'
import { BookOpen, FolderKanban, LogOut, Sparkles } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const NAV = [
  { to: '/', label: 'Projects', icon: FolderKanban, end: true },
  { to: '/knowledge', label: 'Knowledge', icon: BookOpen, end: false },
  { to: '/skills', label: 'Skills', icon: Sparkles, end: false },
]

export function Layout({ email }: { email: string }) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="flex items-center justify-between gap-4 border-b border-line bg-forest px-4 py-3 text-paper md:sticky md:top-0 md:h-screen md:flex-col md:items-stretch md:justify-start md:border-b-0 md:px-5 md:py-6">
        <div>
          <p className="font-display text-xl font-semibold leading-none">SA Copilot</p>
          <p className="mt-1 hidden font-mono text-[10px] uppercase tracking-[0.25em] text-paper/60 md:block">Cekat · Presales</p>
        </div>
        <nav aria-label="Main navigation" className="flex gap-1 md:mt-10 md:flex-col">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
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
          <p className="hidden truncate text-xs text-paper/60 md:block" title={email}>
            {email}
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-2 flex items-center gap-2 rounded-md px-2 py-1 text-xs text-paper/70 hover:bg-paper/10 hover:text-paper"
          >
            <LogOut className="size-3.5" /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 md:px-10 md:py-8">
        <Outlet />
      </main>
    </div>
  )
}
