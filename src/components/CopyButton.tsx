import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button, ErrorNote } from './ui'

/** Copies text to the clipboard and shows "Copied" for a moment; if the clipboard is blocked it says how to copy by hand. */
export function CopyButton({ text, label, title }: { text: string; label: string; title?: string }) {
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
    <div className="space-y-1">
      <Button variant="outline" title={title} icon={isCopied ? <Check className="size-4" /> : <Copy className="size-4" />} disabled={!text} onClick={() => void copy()}>
        {isCopied ? 'Copied' : label}
      </Button>
      {copyError && <ErrorNote error={copyError} />}
    </div>
  )
}
