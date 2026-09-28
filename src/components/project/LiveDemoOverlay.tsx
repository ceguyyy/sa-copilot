import { Copy, ExternalLink, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Select } from '../ui'

interface Props {
  /** Link to the whole project category in the demo app. */
  categoryLink: string
  scenarios: { id: string; title: string }[]
  /** Scenario to open first; null = the category overview. */
  initial: string | null
  onClose: () => void
}

const toolCls = 'inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-forest'

/**
 * The demo app filling the whole window (no page scroll behind it) — for presenting to the client.
 * A slim bar switches scenarios, copies the share link, opens a new tab, or closes (Esc).
 */
export function LiveDemoOverlay({ categoryLink, scenarios, initial, onClose }: Props) {
  const [scenario, setScenario] = useState<string>(initial ?? '')
  const [copied, setCopied] = useState(false)
  const url = scenario ? `${categoryLink}/scenario/${scenario}` : categoryLink

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Live demo" className="fixed inset-0 z-50 flex flex-col bg-paper">
      <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <p className="font-display text-base font-semibold whitespace-nowrap">Live demo</p>
        <Select aria-label="Scenario" value={scenario} onChange={(e) => setScenario(e.target.value)} className="min-w-0 flex-1 py-1.5 text-xs sm:max-w-md">
          <option value="">All scenarios (category)</option>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </Select>
        <span className="flex-1" />
        <button className={toolCls} onClick={copy}>
          <Copy className="size-3.5" /> {copied ? 'Copied' : 'Copy link'}
        </button>
        <a className={toolCls} href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="size-3.5" /> Open
        </a>
        <button className={toolCls} aria-label="Close live demo" title="Close (Esc)" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>
      <iframe
        key={url}
        title="Healthcare demo"
        src={url}
        className="min-h-0 w-full flex-1 border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>,
    document.body,
  )
}
