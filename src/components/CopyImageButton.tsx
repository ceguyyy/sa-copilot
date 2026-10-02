import clsx from 'clsx'
import { Check, ImageDown, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { copyPng } from '../lib/copyImage'

type Props = {
  /** Renders the PNG; called on click. */
  getImage: () => Promise<Blob>
  label?: string
  /** "tool": the small toolbar style of diagram views; "ghost": a regular ghost button. */
  variant?: 'tool' | 'ghost'
  className?: string
}

const VARIANTS = {
  tool: 'rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted hover:border-forest hover:text-ink',
  ghost: 'rounded-md px-3 py-1.5 text-sm font-medium text-ink hover:bg-forest-soft',
}

/** Copies a generated visual to the clipboard as a PNG; says so briefly, or why it failed. */
export function CopyImageButton({ getImage, label = 'Copy image', variant = 'tool', className }: Props) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  const copy = async () => {
    setState('busy')
    try {
      await copyPng(getImage())
      setState('done')
      window.setTimeout(() => setState('idle'), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Copy failed')
      setState('error')
      window.setTimeout(() => setState('idle'), 4000)
    }
  }

  const icon = state === 'busy' ? <Loader2 className="size-3.5 animate-spin" /> : state === 'done' ? <Check className="size-3.5" /> : <ImageDown className="size-3.5" />
  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={state === 'busy'}
      title={state === 'error' ? `Copy failed: ${error} — use the download instead` : 'Copy as a PNG image to paste into Slack, Docs or slides'}
      className={clsx('inline-flex items-center gap-1 transition disabled:opacity-60', VARIANTS[variant], state === 'error' && '!text-bad', className)}
    >
      {icon}
      {state === 'done' ? 'Copied' : state === 'error' ? 'Copy failed' : label}
    </button>
  )
}
