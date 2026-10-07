import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button, ErrorNote } from './ui'

/** Copies text to the clipboard and shows "Copied" for a moment; if the clipboard is blocked it says how to copy by hand. */
export function CopyButton({ text, label, title, compact=false }: { text: string; label: string; title?: string; compact?:boolean }) {
  const [isCopied, setIsCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyError(null)
      setIsCopied(true)
      window.setTimeout(() => setIsCopied(false), 1500)
    } catch {
      setCopyError('Copy failed — select the text and press Ctrl+C')
    }
  }

  return (
    <div className={compact?'inline-flex shrink-0 items-center':'space-y-1'}>
      <Button variant={compact?'ghost':'outline'} className={compact?'px-1! py-1!':undefined} aria-label={label} title={title??label} icon={isCopied ? <Check className="size-4" /> : <Copy className="size-4" />} disabled={!text} onClick={ev => {ev.stopPropagation();void copy()}}>
        {compact?<span className="sr-only">{isCopied?'Copied':label}</span>:isCopied ? 'Copied' : label}
      </Button>
      {copyError && <ErrorNote error={copyError} />}
    </div>
  )
}
