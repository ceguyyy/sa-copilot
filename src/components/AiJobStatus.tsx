import { useEffect, useState } from 'react'
import { formatElapsed } from '../lib/elapsed'

const TICK_MS = 1000

/** Live status of a running AI job with a ticking timer, so a long generation visibly keeps going. */
export function AiJobStatus({ text, startedAt }: { text: string; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <p role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 rounded-md border border-ember/40 bg-ember-soft/40 px-3 py-2 font-mono text-xs text-ink">
      <span className="size-2 animate-pulse rounded-full bg-ember" aria-hidden />
      <span>{text}</span>
      <span className="text-muted">· {formatElapsed(now - startedAt)}</span>
    </p>
  )
}
