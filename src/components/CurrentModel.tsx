import { useQuery } from '@tanstack/react-query'
import { Cpu } from 'lucide-react'
import { Link } from 'react-router-dom'
import { modelsApi } from '../lib/api'

/** Sidebar footer: which model is answering, linking to Settings → AI model to change it. */
export function CurrentModel() {
  const list = useQuery({ queryKey: ['ai-models'], queryFn: modelsApi.list, staleTime: 60_000, retry: 0 })
  const effort = list.data?.effort && list.data.effort !== 'default' ? ` · ${list.data.effort}` : ''

  return (
    <Link
      to="/settings/model"
      title="Change the AI model"
      className="hidden rounded-md px-3 py-2 text-paper/70 transition hover:bg-paper/10 hover:text-paper md:block"
    >
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-paper/60">
        <Cpu className="size-3" /> AI model
      </span>
      <span className="mt-1 block truncate text-xs">
        {list.isError ? 'unavailable' : list.data ? `${list.data.selected}${effort}` : '…'}
      </span>
    </Link>
  )
}
