import { Download } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { downloadBlob } from '../lib/download'

let initialized = false

async function getMermaid() {
  const mermaid = (await import('mermaid')).default
  if (!initialized) {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'neutral', securityLevel: 'strict', fontFamily: 'IBM Plex Sans' })
    initialized = true
  }
  return mermaid
}

/** Renders Mermaid source; shows the parser error instead of crashing on invalid input. */
export function MermaidView({ source, filename, className }: { source: string; filename?: string; className?: string }) {
  const id = `m${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const counter = useRef(0)

  useEffect(() => {
    let cancelled = false
    const run = ++counter.current
    const timer = setTimeout(async () => {
      try {
        const mermaid = await getMermaid()
        await mermaid.parse(source)
        const { svg: out } = await mermaid.render(`${id}-${run}`, source)
        if (!cancelled) {
          setSvg(out)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [source, id])

  return (
    <div className={className}>
      {error && (
        <pre className="mb-2 overflow-auto rounded-md border border-bad/30 bg-ember-soft p-3 font-mono text-xs whitespace-pre-wrap text-bad">
          Mermaid error: {error}
        </pre>
      )}
      {svg && (
        <div className="relative">
          {filename && (
            <button
              onClick={() => downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${filename}.svg`)}
              className="absolute top-0 right-0 flex items-center gap-1 rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted hover:text-ink"
            >
              <Download className="size-3" /> SVG
            </button>
          )}
          {/* Mermaid output rendered with securityLevel "strict" (sanitized, no scripts). */}
          <div className="mermaid-host flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      )}
    </div>
  )
}
