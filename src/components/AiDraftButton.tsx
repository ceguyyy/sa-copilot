import { Sparkles } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from './ui'
import { MaxTokensSelect } from './MaxTokensSelect'
import { useOutputLimit, type AiRunOptions } from '../lib/useOutputLimit'

type Props = {
  label: string
  /** Runs the AI with the optional extra prompt ('' when none was given) and the chosen max output tokens. */
  onRun: (instruction: string, options: AiRunOptions) => void
  isLoading?: boolean
  isDisabled?: boolean
  icon?: ReactNode
  placeholder?: string
  align?: 'left' | 'right'
  className?: string
  /** Small icon-only trigger (the label becomes its tooltip), e.g. next to a field label. */
  iconOnly?: boolean
  /** Text of the run button in the prompt popover. */
  runLabel?: string
}

/** An AI action button that first asks for an optional additional prompt (Ctrl+Enter runs, Esc cancels). */
export function AiDraftButton({ label, onRun, isLoading, isDisabled, icon, placeholder, align = 'right', className, iconOnly, runLabel = 'Generate' }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [maxTokens, setMaxTokens] = useOutputLimit()
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!isOpen) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [isOpen])

  const run = () => {
    setIsOpen(false)
    onRun(prompt.trim(), { maxTokens })
    setPrompt('')
  }

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <Button
        variant="ai"
        className={iconOnly ? 'px-1.5! py-1!' : 'w-full'}
        title={iconOnly ? label : undefined}
        aria-label={iconOnly ? label : undefined}
        icon={icon ?? <Sparkles className="size-4" />}
        loading={isLoading}
        disabled={isDisabled}
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={() => setIsOpen((v) => !v)}
      >
        {!iconOnly && label}
      </Button>
      {isOpen && (
        <div id={id} role="dialog" aria-label={`${label} — additional prompt`} className={`absolute top-full z-30 mt-2 w-80 max-w-[90vw] space-y-2 rounded-lg border border-line bg-panel p-3 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Additional prompt (optional)</span>
            <textarea
              autoFocus
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsOpen(false)
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run()
              }}
              placeholder={placeholder ?? 'e.g. fokus ke fase 1, pakai bahasa formal, tambahkan asumsi integrasi API…'}
              className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm focus:border-forest focus:outline-none"
            />
          </label>
          <MaxTokensSelect value={maxTokens} onChange={setMaxTokens} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted">Ctrl+Enter to run · Esc to cancel</span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="ai" icon={<Sparkles className="size-4" />} onClick={run}>
                {runLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
