import type { ReactNode } from 'react'
import { CopyButton } from '../../CopyButton'

type Props = {
  label: string
  /** What the Copy button puts on the clipboard (the value to paste into the same field in Cekat). */
  copyText: string
  /** e.g. "12 / 20" */
  counter?: string
  children: ReactNode
}

/** A POC Flow field with its Copy button, laid out like the Cekat field it is pasted into. */
export function CopyField({ label, copyText, counter, children }: Props) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
        {counter && <span className="font-mono text-[11px] text-muted">{counter}</span>}
      </div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <CopyButton text={copyText} label="Copy" title={`Copy ${label.toLowerCase()} to paste into Cekat`} />
      </div>
    </div>
  )
}
